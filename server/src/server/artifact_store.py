from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Connection, Engine

from server.artifacts import Artifact, ArtifactDimensions, ArtifactNotFoundError
from server.schema import artifact_tags_table, artifacts_table


@dataclass(frozen=True)
class ArtifactSearchResult:
    artifacts: list[Artifact]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class ArtifactBatchResult:
    artifacts: list[Artifact]
    missing_ids: list[str]


class ArtifactStore:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def seed_artifacts(self, artifacts: tuple[Artifact, ...]) -> None:
        with self.engine.begin() as connection:
            for artifact in artifacts:
                dimensions = artifact.dimensions_meters
                artifact_insert = sqlite_insert(artifacts_table).values(
                    id=artifact.id,
                    kind=artifact.kind,
                    object_type=artifact.object_type,
                    display_name=artifact.display_name,
                    placement=artifact.placement,
                    content_type=artifact.content_type,
                    storage_key=artifact.storage_key,
                    thumbnail_storage_key=artifact.thumbnail_storage_key,
                    source=artifact.source,
                    width_m=dimensions.width if dimensions is not None else None,
                    height_m=dimensions.height if dimensions is not None else None,
                    depth_m=dimensions.depth if dimensions is not None else None,
                    created_at=artifact.created_at,
                    updated_at=artifact.created_at,
                )
                connection.execute(
                    artifact_insert.on_conflict_do_update(
                        index_elements=[artifacts_table.c.id],
                        set_={
                            "kind": artifact_insert.excluded.kind,
                            "object_type": artifact_insert.excluded.object_type,
                            "display_name": artifact_insert.excluded.display_name,
                            "placement": artifact_insert.excluded.placement,
                            "content_type": artifact_insert.excluded.content_type,
                            "storage_key": artifact_insert.excluded.storage_key,
                            "thumbnail_storage_key": artifact_insert.excluded.thumbnail_storage_key,
                            "source": artifact_insert.excluded.source,
                            "width_m": artifact_insert.excluded.width_m,
                            "height_m": artifact_insert.excluded.height_m,
                            "depth_m": artifact_insert.excluded.depth_m,
                            "updated_at": artifact_insert.excluded.updated_at,
                        },
                    )
                )
                connection.execute(delete(artifact_tags_table).where(artifact_tags_table.c.artifact_id == artifact.id))
                tag_rows = [{"artifact_id": artifact.id, "tag": tag} for tag in sorted(set(artifact.tags))]
                if tag_rows:
                    connection.execute(insert(artifact_tags_table), tag_rows)

    def get_artifact(self, artifact_id: str) -> Artifact:
        with self.engine.connect() as connection:
            artifacts = self.load_artifacts_by_ids(connection, [artifact_id])

        if not artifacts:
            raise ArtifactNotFoundError(artifact_id)

        return artifacts[0]

    def search_artifacts(
        self,
        kind: str | None = None,
        object_type: str | None = None,
        placement: str | None = None,
        tag: str | None = None,
        query: str | None = None,
        page: int = 1,
        page_size: int = 24,
    ) -> ArtifactSearchResult:
        conditions = []

        if kind:
            conditions.append(artifacts_table.c.kind == kind)

        if object_type:
            conditions.append(artifacts_table.c.object_type == object_type)

        if placement:
            conditions.append(artifacts_table.c.placement == placement)

        if tag:
            tag_artifact_ids = select(artifact_tags_table.c.artifact_id).where(artifact_tags_table.c.tag == tag)
            conditions.append(artifacts_table.c.id.in_(tag_artifact_ids))

        if query:
            normalized_query = f"%{query.lower()}%"
            matching_tag_artifact_ids = select(artifact_tags_table.c.artifact_id).where(
                func.lower(artifact_tags_table.c.tag).like(normalized_query)
            )
            conditions.append(
                or_(
                    func.lower(artifacts_table.c.display_name).like(normalized_query),
                    artifacts_table.c.id.in_(matching_tag_artifact_ids),
                )
            )

        id_query = select(artifacts_table.c.id).order_by(artifacts_table.c.id.asc())
        count_query = select(func.count()).select_from(artifacts_table)
        if conditions:
            id_query = id_query.where(*conditions)
            count_query = count_query.where(*conditions)

        with self.engine.connect() as connection:
            total_items = int(connection.execute(count_query).scalar_one())
            page_start = (page - 1) * page_size
            page_ids = connection.execute(id_query.offset(page_start).limit(page_size)).scalars().all()
            artifacts = self.load_artifacts_by_ids(connection, list(page_ids))

        total_pages = (total_items + page_size - 1) // page_size if total_items else 0
        return ArtifactSearchResult(
            artifacts=artifacts,
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    def get_artifacts_by_ids(self, artifact_ids: list[str]) -> ArtifactBatchResult:
        unique_ids: list[str] = []
        seen_ids: set[str] = set()
        for artifact_id in artifact_ids:
            if artifact_id in seen_ids:
                continue

            unique_ids.append(artifact_id)
            seen_ids.add(artifact_id)

        with self.engine.connect() as connection:
            artifacts = self.load_artifacts_by_ids(connection, unique_ids)

        found_ids = {artifact.id for artifact in artifacts}
        return ArtifactBatchResult(
            artifacts=artifacts,
            missing_ids=[artifact_id for artifact_id in unique_ids if artifact_id not in found_ids],
        )

    def load_artifacts_by_ids(self, connection: Connection, artifact_ids: list[str]) -> list[Artifact]:
        if not artifact_ids:
            return []

        rows = connection.execute(
            select(artifacts_table).where(artifacts_table.c.id.in_(artifact_ids)),
        ).mappings().all()
        rows_by_id = {str(row["id"]): row for row in rows}
        tag_rows = connection.execute(
            select(artifact_tags_table.c.artifact_id, artifact_tags_table.c.tag)
            .where(artifact_tags_table.c.artifact_id.in_(artifact_ids))
            .order_by(artifact_tags_table.c.tag.asc()),
        ).mappings().all()
        tags_by_artifact_id: dict[str, list[str]] = {artifact_id: [] for artifact_id in artifact_ids}
        for row in tag_rows:
            tags_by_artifact_id[str(row["artifact_id"])].append(str(row["tag"]))

        artifacts: list[Artifact] = []
        for artifact_id in artifact_ids:
            row = rows_by_id.get(artifact_id)
            if row is None:
                continue

            artifacts.append(
                Artifact(
                    id=str(row["id"]),
                    kind=str(row["kind"]),
                    object_type=str(row["object_type"]),
                    display_name=str(row["display_name"]),
                    placement=str(row["placement"]),
                    content_type=str(row["content_type"]),
                    storage_key=str(row["storage_key"]),
                    thumbnail_storage_key=row["thumbnail_storage_key"],
                    source=str(row["source"]),
                    created_at=str(row["created_at"]),
                    tags=tuple(tags_by_artifact_id.get(artifact_id, [])),
                    dimensions_meters=read_artifact_dimensions(row),
                )
            )

        return artifacts


def read_artifact_dimensions(row: Mapping[str, Any]) -> ArtifactDimensions | None:
    width = row["width_m"]
    height = row["height_m"]
    depth = row["depth_m"]

    if width is None or height is None or depth is None:
        return None

    return ArtifactDimensions(
        width=float(width),
        height=float(height),
        depth=float(depth),
    )
