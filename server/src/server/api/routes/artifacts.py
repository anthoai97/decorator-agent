from __future__ import annotations

from collections.abc import Iterator
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from server.artifacts import ArtifactNotFoundError, artifact_to_metadata, resolve_artifact_path
from server.api.dependencies import get_services
from server.api.errors import error_payload

MAX_ARTIFACT_IDS_PER_BATCH = 100
DEFAULT_ARTIFACT_PAGE_SIZE = 24
MAX_ARTIFACT_PAGE_SIZE = 100
ARTIFACT_STREAM_CHUNK_BYTES = 1024 * 1024

router = APIRouter(prefix="/api", tags=["artifacts"])


@router.get("/artifacts")
def get_artifacts(
    request: Request,
    ids: str | None = None,
    kind: str | None = None,
    object_type: str | None = Query(default=None, alias="objectType"),
    type_filter: str | None = Query(default=None, alias="type"),
    placement: str | None = None,
    tag: str | None = None,
    tags: str | None = None,
    q: str | None = None,
    page: str | None = None,
    page_size: str | None = Query(default=None, alias="pageSize"),
    services: Any = Depends(get_services),
) -> JSONResponse:
    try:
        base_url = read_base_url(request, services)
        if ids is not None:
            return artifact_batch_response(ids, base_url, services)

        return artifact_search_response(
            base_url=base_url,
            services=services,
            kind=clean_query_value(kind),
            object_type=clean_query_value(object_type) or clean_query_value(type_filter),
            placement=clean_query_value(placement),
            tag=clean_query_value(tag) or clean_query_value(tags),
            query=clean_query_value(q),
            page=read_positive_query_int(page, "page", 1),
            page_size=read_page_size(page_size),
        )
    except ValueError as error:
        return validation_error_response(str(error))


@router.get("/artifacts/{artifact_id}")
def get_artifact_metadata(artifact_id: str, request: Request, services: Any = Depends(get_services)) -> JSONResponse:
    try:
        artifact = services.artifact_store.get_artifact(artifact_id)
    except ArtifactNotFoundError:
        return artifact_not_found_response()

    return JSONResponse(
        {
            "artifact": artifact_to_metadata(
                artifact,
                read_base_url(request, services),
                include_storage_key=True,
            )
        }
    )


@router.get("/artifacts/{artifact_id}/content")
def get_artifact_content(artifact_id: str, services: Any = Depends(get_services)) -> Response:
    try:
        artifact = services.artifact_store.get_artifact(artifact_id)
        artifact_path = resolve_artifact_path(services.artifact_root, artifact.storage_key)
    except (ArtifactNotFoundError, ValueError):
        return artifact_not_found_response()

    if not artifact_path.is_file():
        return artifact_not_found_response()

    return StreamingResponse(
        stream_file(artifact_path),
        media_type=artifact.content_type,
        headers={
            "Content-Length": str(artifact_path.stat().st_size),
            "Cache-Control": "public, max-age=3600",
        },
    )


def artifact_batch_response(ids: str, base_url: str, services: Any) -> JSONResponse:
    artifact_ids = parse_artifact_ids(ids)
    if len(artifact_ids) > MAX_ARTIFACT_IDS_PER_BATCH:
        raise ValueError("ids must include no more than 100 unique artifact ids")

    batch_result = services.artifact_store.get_artifacts_by_ids(artifact_ids)

    return JSONResponse(
        {
            "artifacts": [artifact_to_metadata(artifact, base_url) for artifact in batch_result.artifacts],
            "missingIds": batch_result.missing_ids,
        }
    )


def artifact_search_response(
    *,
    base_url: str,
    services: Any,
    kind: str,
    object_type: str,
    placement: str,
    tag: str,
    query: str,
    page: int,
    page_size: int,
) -> JSONResponse:
    result = services.artifact_store.search_artifacts(
        kind=kind,
        object_type=object_type,
        placement=placement,
        tag=tag,
        query=query,
        page=page,
        page_size=page_size,
    )

    return JSONResponse(
        {
            "artifacts": [artifact_to_metadata(artifact, base_url) for artifact in result.artifacts],
            "pagination": {
                "page": result.page,
                "pageSize": result.page_size,
                "totalItems": result.total_items,
                "totalPages": result.total_pages,
            },
        }
    )


def clean_query_value(value: str | None) -> str:
    return value.strip() if value else ""


def read_page_size(raw_page_size: str | None) -> int:
    page_size = read_positive_query_int(raw_page_size, "pageSize", DEFAULT_ARTIFACT_PAGE_SIZE)
    if page_size > MAX_ARTIFACT_PAGE_SIZE:
        raise ValueError("pageSize must be no greater than 100")

    return page_size


def read_positive_query_int(value: str | None, key: str, default: int) -> int:
    normalized_value = clean_query_value(value)
    if not normalized_value:
        return default

    try:
        parsed = int(normalized_value)
    except ValueError as error:
        raise ValueError(f"{key} must be a positive integer") from error

    if parsed < 1:
        raise ValueError(f"{key} must be a positive integer")

    return parsed


def parse_artifact_ids(raw_ids: str) -> list[str]:
    seen: set[str] = set()
    artifact_ids: list[str] = []

    for raw_id in raw_ids.split(","):
        artifact_id = raw_id.strip()
        if not artifact_id or artifact_id in seen:
            continue

        seen.add(artifact_id)
        artifact_ids.append(artifact_id)

    if not artifact_ids:
        raise ValueError("ids must include at least one artifact id")

    return artifact_ids


def read_base_url(request: Request, services: Any) -> str:
    if services.public_base_url:
        return services.public_base_url

    return f"{request.url.scheme}://{read_trusted_host(request)}"


def read_trusted_host(request: Request) -> str:
    host_header = request.headers.get("host", "")
    hostname, port = parse_host_header(host_header)
    server_host, server_port = read_server_host_port(request)
    effective_port = port if port is not None else default_port(request.url.scheme)
    trusted_hostnames = {server_host.lower(), "127.0.0.1", "localhost", "::1"}

    if hostname in trusted_hostnames and effective_port == server_port:
        return host_header.strip()

    return format_host(server_host, server_port, request.url.scheme)


def parse_host_header(host_header: str) -> tuple[str, int | None]:
    if not host_header:
        return "", None

    try:
        parsed = urlparse(f"//{host_header.strip()}")
        return (parsed.hostname or "").lower(), parsed.port
    except ValueError:
        return "", None


def read_server_host_port(request: Request) -> tuple[str, int]:
    server = request.scope.get("server")
    if server:
        host, port = server
        return str(host), int(port)

    return request.url.hostname or "127.0.0.1", request.url.port or default_port(request.url.scheme)


def format_host(host: str, port: int, scheme: str) -> str:
    if host in {"0.0.0.0", "::"}:
        host = "127.0.0.1"

    if ":" in host and not host.startswith("["):
        host = f"[{host}]"

    if port == default_port(scheme):
        return host

    return f"{host}:{port}"


def default_port(scheme: str) -> int:
    return 443 if scheme == "https" else 80


def validation_error_response(message: str) -> JSONResponse:
    return JSONResponse(
        error_payload("VALIDATION_ERROR", message),
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
    )


def artifact_not_found_response() -> JSONResponse:
    return JSONResponse(
        error_payload("NOT_FOUND", "Artifact not found"),
        status_code=HTTPStatus.NOT_FOUND,
    )


def stream_file(path: Path) -> Iterator[bytes]:
    with path.open("rb") as artifact_file:
        while chunk := artifact_file.read(ARTIFACT_STREAM_CHUNK_BYTES):
            yield chunk
