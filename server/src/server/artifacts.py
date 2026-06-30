from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from shutil import copy2
from typing import Any
from urllib.parse import quote

SERVER_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED_ROOT = SERVER_ROOT / "assets" / "seeds"
DEFAULT_ARTIFACT_ROOT = SERVER_ROOT / ".data" / "artifacts"

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class ArtifactDimensions:
    width: float
    height: float
    depth: float


@dataclass(frozen=True)
class Artifact:
    id: str
    kind: str
    object_type: str
    display_name: str
    placement: str
    content_type: str
    storage_key: str
    source: str
    created_at: str
    tags: tuple[str, ...]
    dimensions_meters: ArtifactDimensions | None
    thumbnail_storage_key: str | None = None


class ArtifactNotFoundError(KeyError):
    def __init__(self, artifact_id: str) -> None:
        super().__init__(artifact_id)
        self.artifact_id = artifact_id

    def to_error_payload(self) -> JsonObject:
        return {"error": {"code": "NOT_FOUND", "message": "Artifact not found"}}


SEED_ARTIFACTS = (
    Artifact(
        id="seed-sofa-01",
        kind="model3d",
        object_type="sofa",
        display_name="Sofa",
        placement="floor",
        content_type="model/gltf-binary",
        storage_key="models/sofa-01.glb",
        source="seeded",
        created_at="2026-06-30T00:00:00Z",
        tags=("sofa", "seating", "living-room"),
        dimensions_meters=ArtifactDimensions(width=2.49, height=1.21, depth=0.93),
    ),
)

SEED_ARTIFACTS_BY_ID = {artifact.id: artifact for artifact in SEED_ARTIFACTS}


def list_artifacts(
    kind: str | None = None,
    object_type: str | None = None,
    placement: str | None = None,
    query: str | None = None,
) -> list[Artifact]:
    artifacts = list(SEED_ARTIFACTS)

    if kind:
        artifacts = [artifact for artifact in artifacts if artifact.kind == kind]

    if object_type:
        artifacts = [artifact for artifact in artifacts if artifact.object_type == object_type]

    if placement:
        artifacts = [artifact for artifact in artifacts if artifact.placement == placement]

    if query:
        normalized_query = query.lower()
        artifacts = [
            artifact
            for artifact in artifacts
            if normalized_query in artifact.display_name.lower()
            or any(normalized_query in tag.lower() for tag in artifact.tags)
        ]

    return artifacts


def get_artifact(artifact_id: str) -> Artifact:
    artifact = SEED_ARTIFACTS_BY_ID.get(artifact_id)

    if artifact is None:
        raise ArtifactNotFoundError(artifact_id)

    return artifact


def artifact_to_metadata(
    artifact: Artifact,
    base_url: str,
    include_storage_key: bool = False,
) -> JsonObject:
    artifact_id_path_segment = quote(artifact.id, safe="")
    payload: JsonObject = {
        "id": artifact.id,
        "kind": artifact.kind,
        "objectType": artifact.object_type,
        "displayName": artifact.display_name,
        "placement": artifact.placement,
        "contentType": artifact.content_type,
        "url": f"{base_url.rstrip('/')}/api/artifacts/{artifact_id_path_segment}/content",
        "thumbnailUrl": None,
        "tags": list(artifact.tags),
        "source": artifact.source,
        "createdAt": artifact.created_at,
    }

    if artifact.dimensions_meters is not None:
        payload["dimensionsMeters"] = {
            "width": artifact.dimensions_meters.width,
            "height": artifact.dimensions_meters.height,
            "depth": artifact.dimensions_meters.depth,
        }

    if include_storage_key:
        payload["storageKey"] = artifact.storage_key

    return payload


def resolve_artifact_path(artifact_root: Path, storage_key: str) -> Path:
    root = artifact_root.resolve()
    artifact_path = (root / storage_key).resolve()

    if not artifact_path.is_relative_to(root):
        raise ValueError("Artifact storage key must stay inside artifact root")

    return artifact_path


def bootstrap_seed_artifacts(
    artifact_root: Path = DEFAULT_ARTIFACT_ROOT,
    seed_root: Path = DEFAULT_SEED_ROOT,
) -> list[Path]:
    copied_paths: list[Path] = []

    for seed in SEED_ARTIFACTS:
        source_path = seed_root / seed.storage_key
        destination_path = artifact_root / seed.storage_key

        if destination_path.exists():
            continue

        if not source_path.is_file():
            raise FileNotFoundError(f"Missing seed artifact: {source_path}")

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        copy2(source_path, destination_path)
        copied_paths.append(destination_path)

    return copied_paths
