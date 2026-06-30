from __future__ import annotations

import json
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from uuid import uuid4

from server.artifacts import (
    ArtifactNotFoundError,
    SEED_ARTIFACTS,
    artifact_to_metadata,
    bootstrap_seed_artifacts,
    resolve_artifact_path,
)
from server.artifact_store import ArtifactStore
from server.commands import validate_command
from server.events import EventBroker, format_sse_comment, format_sse_event
from server.executor import CommandExecutor
from server.store import SQLiteStore

JsonObject = dict[str, Any]
ARTIFACT_STREAM_CHUNK_BYTES = 1024 * 1024


def create_playground_event(command: JsonObject) -> JsonObject:
    validated_command = validate_playground_command(command)

    return {
        "id": str(uuid4()),
        "type": "playground.command.accepted",
        "source": "server",
        "message": f"Server accepted {validated_command['type']}",
        "command": validated_command,
    }


def create_agent_placeholder_event(request: JsonObject) -> JsonObject:
    return {
        "id": str(uuid4()),
        "type": "agent.placeholder.completed",
        "source": "server",
        "message": "Agent placeholder received the request. Real Agent SDK setup is not configured yet.",
        "request": request,
    }


def validate_playground_command(command: JsonObject) -> JsonObject:
    return validate_command(command)


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "Server/0.1"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/health":
            self.write_json({"ok": True})
            return

        if path == "/api/state":
            self.write_json(self.playground_server.store.load_state_snapshot())
            return

        if path == "/api/artifacts":
            try:
                self.write_artifact_collection(parsed_url.query)
            except ValueError as error:
                self.write_validation_error(error)
            return

        if path.startswith("/api/artifacts/"):
            self.write_artifact_resource(path)
            return

        if path == "/api/events/history":
            try:
                after_id = read_query_event_id(parsed_url.query, "after", 0)
            except ValueError as error:
                self.write_validation_error(error)
                return

            self.write_json(
                {
                    "events": self.playground_server.store.list_events_after(after_id),
                    "lastEventId": self.playground_server.store.last_event_id(),
                }
            )
            return

        if path == "/api/events":
            try:
                since_id = read_sse_since_id(parsed_url.query, self.headers.get("Last-Event-ID"))
            except ValueError as error:
                self.write_validation_error(error)
                return

            self.write_sse_stream(since_id)
            return

        self.write_json({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path not in {"/api/commands", "/api/playground/commands", "/api/agent/runs"}:
            self.write_json({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, HTTPStatus.NOT_FOUND)
            return

        try:
            body = self.read_json_body()

            if path == "/api/commands":
                result = self.playground_server.executor.execute_command(body)
                self.publish_result_events(result)
                self.write_command_result(result)
                return

            if path == "/api/playground/commands":
                result = self.playground_server.executor.execute_command(body)
                self.publish_result_events(result)
                if not result["accepted"]:
                    self.write_command_result(result)
                    return

                self.write_json(
                    {
                        "event": create_playground_compatibility_event(result),
                        "result": result,
                    }
                )
                return

            if path == "/api/agent/runs":
                self.write_json({"event": create_agent_placeholder_event(body)})
                return

        except ValueError as error:
            self.write_validation_error(error)

    def read_json_body(self) -> JsonObject:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        if not raw_body:
            return {}

        try:
            parsed = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("Request body must be valid JSON") from error

        if not isinstance(parsed, dict):
            raise ValueError("Request body must be a JSON object")

        return parsed

    def write_json(self, payload: JsonObject, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def write_artifact_collection(self, query: str) -> None:
        params = parse_qs(query, keep_blank_values=True)
        base_url = self.read_base_url()

        if "ids" in params:
            artifact_ids = parse_artifact_ids(read_query_value(params, "ids", ""))
            if len(artifact_ids) > 100:
                raise ValueError("ids must include no more than 100 unique artifact ids")

            batch_result = self.playground_server.artifact_store.get_artifacts_by_ids(artifact_ids)

            self.write_json(
                {
                    "artifacts": [artifact_to_metadata(artifact, base_url) for artifact in batch_result.artifacts],
                    "missingIds": batch_result.missing_ids,
                }
            )
            return

        page = read_positive_query_int(params, "page", 1)
        page_size = read_positive_query_int(params, "pageSize", 24)
        if page_size > 100:
            raise ValueError("pageSize must be no greater than 100")

        object_type = read_query_value(params, "objectType", "") or read_query_value(params, "type", "")
        result = self.playground_server.artifact_store.search_artifacts(
            kind=read_query_value(params, "kind", ""),
            object_type=object_type,
            placement=read_query_value(params, "placement", ""),
            tag=read_query_value(params, "tag", "") or read_query_value(params, "tags", ""),
            query=read_query_value(params, "q", ""),
            page=page,
            page_size=page_size,
        )

        self.write_json(
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

    def write_artifact_resource(self, path: str) -> None:
        parts = [unquote(part) for part in path.split("/") if part]

        if len(parts) == 3 and parts[:2] == ["api", "artifacts"]:
            self.write_artifact_metadata(parts[2])
            return

        if len(parts) == 4 and parts[:2] == ["api", "artifacts"] and parts[3] == "content":
            self.write_artifact_content(parts[2])
            return

        self.write_json({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, HTTPStatus.NOT_FOUND)

    def write_artifact_metadata(self, artifact_id: str) -> None:
        try:
            artifact = self.playground_server.artifact_store.get_artifact(artifact_id)
        except ArtifactNotFoundError as error:
            self.write_json(error.to_error_payload(), HTTPStatus.NOT_FOUND)
            return

        self.write_json({"artifact": artifact_to_metadata(artifact, self.read_base_url(), include_storage_key=True)})

    def write_artifact_content(self, artifact_id: str) -> None:
        try:
            artifact = self.playground_server.artifact_store.get_artifact(artifact_id)
            artifact_path = resolve_artifact_path(self.playground_server.artifact_root, artifact.storage_key)
        except (ArtifactNotFoundError, ValueError) as error:
            if isinstance(error, ArtifactNotFoundError):
                self.write_json(error.to_error_payload(), HTTPStatus.NOT_FOUND)
                return

            self.write_json({"error": {"code": "NOT_FOUND", "message": "Artifact not found"}}, HTTPStatus.NOT_FOUND)
            return

        if not artifact_path.is_file():
            self.write_json({"error": {"code": "NOT_FOUND", "message": "Artifact not found"}}, HTTPStatus.NOT_FOUND)
            return

        self.write_binary_file(artifact_path, artifact.content_type)

    def write_binary_file(self, path: Path, content_type: str) -> None:
        content_length = path.stat().st_size
        self.send_response(HTTPStatus.OK)
        self.send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        with path.open("rb") as artifact_file:
            while chunk := artifact_file.read(ARTIFACT_STREAM_CHUNK_BYTES):
                self.wfile.write(chunk)

    def read_base_url(self) -> str:
        if self.playground_server.public_base_url:
            return self.playground_server.public_base_url

        return f"http://{self.read_trusted_host()}"

    def read_trusted_host(self) -> str:
        host_header = self.headers.get("Host", "")
        hostname, port = parse_host_header(host_header)
        server_host, server_port = self.server.server_address[:2]
        trusted_hostnames = {str(server_host).lower(), "127.0.0.1", "localhost", "::1"}

        if hostname in trusted_hostnames and port == int(server_port):
            return host_header.strip()

        return format_host(str(server_host), int(server_port))

    @property
    def playground_server(self) -> "PlaygroundHTTPServer":
        return self.server  # type: ignore[return-value]

    def write_command_result(self, result: JsonObject) -> None:
        if result["accepted"]:
            self.write_json({"result": result})
            return

        self.write_json(
            {"error": result["error"], "result": result},
            HTTPStatus.UNPROCESSABLE_ENTITY,
        )

    def write_validation_error(self, error: ValueError) -> None:
        self.write_json(
            {"error": {"code": "VALIDATION_ERROR", "message": str(error)}},
            HTTPStatus.UNPROCESSABLE_ENTITY,
        )

    def write_sse_stream(self, since_id: int) -> None:
        subscriber = self.playground_server.broker.subscribe()
        last_sent_id = since_id

        try:
            self.send_response(HTTPStatus.OK)
            self.send_cors_headers()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            for event in self.playground_server.store.list_events_after(since_id):
                self.write_sse_event(event)
                last_sent_id = max(last_sent_id, int(event["id"]))

            while True:
                try:
                    event = subscriber.get(timeout=self.playground_server.heartbeat_seconds)
                except Empty:
                    self.wfile.write(format_sse_comment("heartbeat"))
                    self.wfile.flush()
                    continue

                if int(event["id"]) <= last_sent_id:
                    continue

                self.write_sse_event(event)
                last_sent_id = int(event["id"])
        except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            return
        finally:
            self.playground_server.broker.unsubscribe(subscriber)

    def write_sse_event(self, event: JsonObject) -> None:
        self.wfile.write(format_sse_event(event))
        self.wfile.flush()

    def publish_result_events(self, result: JsonObject) -> None:
        for event in result["events"]:
            self.playground_server.broker.publish(event)

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def log_message(self, format: str, *args: object) -> None:
        return


def parse_host_header(host_header: str) -> tuple[str, int | None]:
    if not host_header:
        return "", None

    try:
        parsed = urlparse(f"//{host_header.strip()}")
        return (parsed.hostname or "").lower(), parsed.port
    except ValueError:
        return "", None


def format_host(host: str, port: int) -> str:
    if host in {"0.0.0.0", "::"}:
        host = "127.0.0.1"

    if ":" in host and not host.startswith("["):
        host = f"[{host}]"

    return f"{host}:{port}"


class PlaygroundHTTPServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address: tuple[str, int],
        database_path: str | Path,
        heartbeat_seconds: float = 15.0,
        public_base_url: str | None = None,
    ) -> None:
        super().__init__(server_address, RequestHandler)
        self.public_base_url = normalize_public_base_url(public_base_url)
        self.artifact_root = Path(database_path).parent / "artifacts"
        bootstrap_seed_artifacts(self.artifact_root)
        self.store = SQLiteStore(database_path)
        self.artifact_store = ArtifactStore(self.store.engine)
        self.artifact_store.seed_artifacts(SEED_ARTIFACTS)
        self.executor = CommandExecutor(self.store)
        self.broker = EventBroker()
        self.heartbeat_seconds = heartbeat_seconds

    def server_close(self) -> None:
        store = getattr(self, "store", None)
        if store is not None:
            store.close()
        super().server_close()

    def handle_error(self, request: object, client_address: tuple[str, int]) -> None:
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return

        super().handle_error(request, client_address)


def normalize_public_base_url(public_base_url: str | None) -> str | None:
    if not public_base_url:
        return None

    return public_base_url.rstrip("/")


def create_http_server(
    host: str,
    port: int,
    database_path: str | Path,
    heartbeat_seconds: float = 15.0,
    public_base_url: str | None = None,
) -> PlaygroundHTTPServer:
    return PlaygroundHTTPServer((host, port), database_path, heartbeat_seconds, public_base_url)


def create_playground_compatibility_event(result: JsonObject) -> JsonObject:
    state_event = result["events"][-1]
    command = state_event["command"]

    return {
        "id": str(state_event["id"]),
        "type": "playground.command.accepted",
        "source": "server",
        "message": f"Server accepted {command['type']}",
        "command": command,
        "stateEvent": state_event,
    }


def run_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    database_path: str | Path = ".data/playground.sqlite3",
    public_base_url: str | None = None,
) -> None:
    server = create_http_server(
        host,
        port,
        database_path,
        public_base_url=public_base_url or os.environ.get("SERVER_PUBLIC_BASE_URL"),
    )
    print(f"Playground event server listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def read_query_event_id(query: str, key: str, default: int) -> int:
    values = parse_qs(query).get(key)
    if not values:
        return default

    return parse_event_id(values[-1], key)


def read_query_value(params: dict[str, list[str]], key: str, default: str) -> str:
    values = params.get(key)
    if not values:
        return default

    return values[-1].strip()


def read_positive_query_int(params: dict[str, list[str]], key: str, default: int) -> int:
    value = read_query_value(params, key, "")
    if not value:
        return default

    try:
        parsed = int(value)
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


def read_sse_since_id(query: str, last_event_id: str | None) -> int:
    values = parse_qs(query).get("since")
    if values:
        return parse_event_id(values[-1], "since")

    if last_event_id:
        return parse_event_id(last_event_id, "Last-Event-ID")

    return 0


def parse_event_id(value: str, label: str) -> int:
    try:
        event_id = int(value)
    except ValueError as error:
        raise ValueError(f"{label} must be a non-negative integer") from error

    if event_id < 0:
        raise ValueError(f"{label} must be a non-negative integer")

    return event_id
