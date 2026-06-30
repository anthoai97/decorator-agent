from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import inspect

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.artifacts import (
    Artifact,
    ArtifactDimensions,
    DEFAULT_SEED_ROOT,
    SEED_ARTIFACTS,
    ArtifactNotFoundError,
    artifact_to_metadata,
    bootstrap_seed_artifacts,
    get_artifact,
    resolve_artifact_path,
)
from server.artifact_store import ArtifactStore
from server.db import create_sqlite_engine
from server.schema import SERVER_METADATA


class ArtifactBootstrapTests(unittest.TestCase):
    def test_committed_sofa_seed_exists(self) -> None:
        seed_path = DEFAULT_SEED_ROOT / "models" / "sofa-01.glb"

        self.assertTrue(seed_path.exists())
        self.assertGreater(seed_path.stat().st_size, 1_000_000)

    def test_bootstrap_copies_missing_seed_to_runtime_storage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed_root = root / "seeds"
            seed_path = seed_root / "models" / "sofa-01.glb"
            seed_path.parent.mkdir(parents=True)
            seed_path.write_bytes(b"seed sofa glb")
            artifact_root = root / "artifacts"

            copied = bootstrap_seed_artifacts(artifact_root=artifact_root, seed_root=seed_root)

            runtime_path = artifact_root / "models" / "sofa-01.glb"
            self.assertEqual(copied, [runtime_path])
            self.assertEqual(runtime_path.read_bytes(), b"seed sofa glb")

    def test_bootstrap_does_not_overwrite_existing_runtime_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed_root = root / "seeds"
            seed_path = seed_root / "models" / "sofa-01.glb"
            seed_path.parent.mkdir(parents=True)
            seed_path.write_bytes(b"seed sofa glb")
            artifact_root = root / "artifacts"
            runtime_path = artifact_root / "models" / "sofa-01.glb"
            runtime_path.parent.mkdir(parents=True)
            runtime_path.write_bytes(b"existing runtime glb")

            copied = bootstrap_seed_artifacts(artifact_root=artifact_root, seed_root=seed_root)

            self.assertEqual(copied, [])
            self.assertEqual(runtime_path.read_bytes(), b"existing runtime glb")


class ArtifactMetadataTests(unittest.TestCase):
    def test_seed_sofa_metadata_uses_artifact_taxonomy(self) -> None:
        artifact = get_artifact("seed-sofa-01")

        self.assertEqual(artifact.id, "seed-sofa-01")
        self.assertEqual(artifact.kind, "model3d")
        self.assertEqual(artifact.object_type, "sofa")
        self.assertEqual(artifact.display_name, "Sofa")
        self.assertEqual(artifact.placement, "floor")
        self.assertEqual(artifact.content_type, "model/gltf-binary")
        self.assertEqual(artifact.storage_key, "models/sofa-01.glb")
        self.assertEqual(artifact.source, "seeded")
        self.assertEqual(artifact.tags, ("sofa", "seating", "living-room"))
        self.assertEqual(artifact.dimensions_meters.width, 2.49)
        self.assertEqual(artifact.dimensions_meters.height, 1.21)
        self.assertEqual(artifact.dimensions_meters.depth, 0.93)

    def test_artifact_metadata_serializes_urls_from_server_base_url(self) -> None:
        payload = artifact_to_metadata(
            get_artifact("seed-sofa-01"),
            base_url="http://127.0.0.1:8787/",
            include_storage_key=True,
        )

        self.assertEqual(payload["id"], "seed-sofa-01")
        self.assertEqual(payload["objectType"], "sofa")
        self.assertEqual(payload["displayName"], "Sofa")
        self.assertEqual(payload["contentType"], "model/gltf-binary")
        self.assertEqual(payload["storageKey"], "models/sofa-01.glb")
        self.assertEqual(payload["url"], "http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content")
        self.assertIsNone(payload["thumbnailUrl"])
        self.assertEqual(payload["tags"], ["sofa", "seating", "living-room"])
        self.assertEqual(payload["dimensionsMeters"], {"width": 2.49, "height": 1.21, "depth": 0.93})
        self.assertEqual(payload["source"], "seeded")
        self.assertEqual(payload["createdAt"], "2026-06-30T00:00:00Z")

    def test_artifact_metadata_omits_dimensions_when_unknown(self) -> None:
        payload = artifact_to_metadata(
            Artifact(
                id="generated-wallpaper-01",
                kind="material",
                object_type="wallpaper",
                display_name="Generated Wallpaper",
                placement="wall",
                content_type="image/png",
                storage_key="materials/generated-wallpaper-01.png",
                source="generated",
                created_at="2026-06-30T00:00:00Z",
                tags=("wallpaper",),
                dimensions_meters=None,
            ),
            base_url="http://127.0.0.1:8787/",
        )

        self.assertNotIn("dimensionsMeters", payload)

    def test_artifact_metadata_encodes_artifact_ids_in_urls(self) -> None:
        payload = artifact_to_metadata(
            Artifact(
                id="generated sofa/01",
                kind="model3d",
                object_type="sofa",
                display_name="Generated Sofa",
                placement="floor",
                content_type="model/gltf-binary",
                storage_key="models/generated-sofa-01.glb",
                source="generated",
                created_at="2026-06-30T00:00:00Z",
                tags=("sofa",),
                dimensions_meters=None,
            ),
            base_url="http://127.0.0.1:8787/",
        )

        self.assertEqual(
            payload["url"],
            "http://127.0.0.1:8787/api/artifacts/generated%20sofa%2F01/content",
        )

    def test_unknown_artifact_id_has_structured_not_found_error(self) -> None:
        with self.assertRaises(ArtifactNotFoundError) as context:
            get_artifact("missing-artifact")

        self.assertEqual(
            context.exception.to_error_payload(),
            {"error": {"code": "NOT_FOUND", "message": "Artifact not found"}},
        )

    def test_resolve_artifact_path_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact_root = Path(directory) / "artifacts"

            with self.assertRaises(ValueError):
                resolve_artifact_path(artifact_root, "../outside.glb")


class ArtifactSchemaTests(unittest.TestCase):
    def test_sqlalchemy_metadata_initializes_artifact_tables(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            engine = create_sqlite_engine(Path(directory) / "state.sqlite3")

            try:
                SERVER_METADATA.create_all(engine)
                inspector = inspect(engine)

                self.assertIn("artifacts", inspector.get_table_names())
                self.assertIn("artifact_tags", inspector.get_table_names())
                self.assertEqual(
                    {
                        "id",
                        "kind",
                        "object_type",
                        "display_name",
                        "placement",
                        "content_type",
                        "storage_key",
                        "thumbnail_storage_key",
                        "source",
                        "width_m",
                        "height_m",
                        "depth_m",
                        "created_at",
                        "updated_at",
                    },
                    {column["name"] for column in inspector.get_columns("artifacts")},
                )
                self.assertEqual(
                    {"artifact_id", "tag"},
                    {column["name"] for column in inspector.get_columns("artifact_tags")},
                )
                self.assertEqual(
                    {
                        "artifacts_kind_type_placement_idx",
                        "artifacts_source_idx",
                    },
                    {index["name"] for index in inspector.get_indexes("artifacts")},
                )
                self.assertEqual(
                    {"artifact_tags_tag_idx"},
                    {index["name"] for index in inspector.get_indexes("artifact_tags")},
                )
            finally:
                engine.dispose()


class ArtifactStoreTests(unittest.TestCase):
    def test_seed_artifacts_is_idempotent(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts(SEED_ARTIFACTS)
            store.seed_artifacts(SEED_ARTIFACTS)

            result = store.search_artifacts(kind="model3d", object_type="sofa")

            self.assertEqual(result.total_items, 1)
            self.assertEqual(result.artifacts[0].id, "seed-sofa-01")
            self.assertEqual(result.artifacts[0].tags, ("living-room", "seating", "sofa"))

    def test_seed_artifacts_allows_artifacts_without_tags(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts(
                (
                    Artifact(
                        id="generated-lamp-01",
                        kind="model3d",
                        object_type="lamp",
                        display_name="Generated Lamp",
                        placement="floor",
                        content_type="model/gltf-binary",
                        storage_key="models/generated-lamp-01.glb",
                        source="generated",
                        created_at="2026-06-30T00:00:00Z",
                        tags=(),
                        dimensions_meters=ArtifactDimensions(width=0.5, height=1.2, depth=0.5),
                    ),
                )
            )

            artifact = store.get_artifact("generated-lamp-01")

            self.assertEqual(artifact.tags, ())

    def test_seed_artifacts_allows_unknown_dimensions(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts(
                (
                    Artifact(
                        id="generated-wallpaper-01",
                        kind="material",
                        object_type="wallpaper",
                        display_name="Generated Wallpaper",
                        placement="wall",
                        content_type="image/png",
                        storage_key="materials/generated-wallpaper-01.png",
                        source="generated",
                        created_at="2026-06-30T00:00:00Z",
                        tags=("wallpaper",),
                        dimensions_meters=None,
                    ),
                )
            )

            artifact = store.get_artifact("generated-wallpaper-01")

            self.assertIsNone(artifact.dimensions_meters)

    def test_search_artifacts_filters_by_kind_type_placement_tag_and_query(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts((create_test_table_artifact(), *SEED_ARTIFACTS))

            result = store.search_artifacts(kind="model3d", object_type="table", placement="floor", tag="wood", query="round")
            empty_result = store.search_artifacts(kind="model3d", object_type="table", tag="fabric")

            self.assertEqual([artifact.id for artifact in result.artifacts], ["seed-table-01"])
            self.assertEqual(empty_result.artifacts, [])

    def test_search_artifacts_paginates_results(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts((SEED_ARTIFACTS[0], create_test_table_artifact()))

            result = store.search_artifacts(kind="model3d", page=2, page_size=1)

            self.assertEqual(result.page, 2)
            self.assertEqual(result.page_size, 1)
            self.assertEqual(result.total_items, 2)
            self.assertEqual(result.total_pages, 2)
            self.assertEqual(len(result.artifacts), 1)

    def test_batch_lookup_deduplicates_ids_preserves_order_and_reports_missing(self) -> None:
        with temporary_artifact_store() as store:
            store.seed_artifacts((SEED_ARTIFACTS[0], create_test_table_artifact()))

            result = store.get_artifacts_by_ids(["seed-table-01", "missing-a", "seed-sofa-01", "seed-table-01"])

            self.assertEqual([artifact.id for artifact in result.artifacts], ["seed-table-01", "seed-sofa-01"])
            self.assertEqual(result.missing_ids, ["missing-a"])


class temporary_artifact_store:
    def __enter__(self) -> ArtifactStore:
        self.directory = tempfile.TemporaryDirectory()
        self.engine = create_sqlite_engine(Path(self.directory.name) / "state.sqlite3")
        SERVER_METADATA.create_all(self.engine)
        return ArtifactStore(self.engine)

    def __exit__(self, _exc_type: object, _exc_value: object, _traceback: object) -> None:
        self.engine.dispose()
        self.directory.cleanup()


def create_test_table_artifact() -> Artifact:
    return Artifact(
        id="seed-table-01",
        kind="model3d",
        object_type="table",
        display_name="Round Wood Table",
        placement="floor",
        content_type="model/gltf-binary",
        storage_key="models/table-01.glb",
        source="seeded",
        created_at="2026-06-30T00:00:00Z",
        tags=("table", "wood", "round"),
        dimensions_meters=ArtifactDimensions(width=1.2, height=0.72, depth=1.2),
    )


if __name__ == "__main__":
    unittest.main()
