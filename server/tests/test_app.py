from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import Query
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.app import (
    RequestHandler,
    create_app,
    create_http_server,
    create_agent_placeholder_event,
    create_playground_event,
)
from server.artifacts import Artifact, ArtifactDimensions
from server.artifact_store import ArtifactStore
from server.db import create_sqlite_engine
from server.store import SQLiteStore


class EventFactoryTests(unittest.TestCase):
    def test_create_playground_event_accepts_known_command(self) -> None:
        event = create_playground_event(
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "planter", "rotationYDegrees": 45},
            }
        )

        self.assertEqual(event["type"], "playground.command.accepted")
        self.assertEqual(event["source"], "server")
        self.assertEqual(event["command"]["type"], "SET_FURNITURE_ROTATION")

    def test_create_playground_event_rejects_invalid_known_command_payload(self) -> None:
        with self.assertRaisesRegex(ValueError, "SET_FURNITURE_ROTATION payload must include exactly"):
            create_playground_event({"type": "SET_FURNITURE_ROTATION", "payload": {}})

    def test_create_playground_event_rejects_unknown_furniture_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "known furniture id"):
            create_playground_event(
                {
                    "type": "SET_FURNITURE_ROTATION",
                    "payload": {"furnitureId": "desk", "rotationYDegrees": 45},
                }
            )

    def test_create_playground_event_rejects_unknown_command(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported command"):
            create_playground_event({"type": "UNKNOWN_COMMAND", "payload": {}})

    def test_create_agent_placeholder_event_returns_placeholder_status(self) -> None:
        event = create_agent_placeholder_event({"message": "arrange this room"})

        self.assertEqual(event["type"], "agent.placeholder.completed")
        self.assertIn("Real Agent SDK setup is not configured yet", event["message"])


class ServerLifecycleTests(unittest.TestCase):
    def test_server_bootstraps_seed_artifacts_next_to_database(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            database_path = Path(tempdir) / "state.sqlite3"
            server = create_http_server(
                "127.0.0.1",
                0,
                database_path,
                heartbeat_seconds=0.1,
            )

            try:
                runtime_seed = Path(tempdir) / "artifacts" / "models" / "sofa-01.glb"

                self.assertTrue(runtime_seed.exists())
                self.assertGreater(runtime_seed.stat().st_size, 1_000_000)
            finally:
                server.server_close()

    def test_server_seeds_artifact_metadata_into_sqlite(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            database_path = Path(tempdir) / "state.sqlite3"
            server = create_http_server(
                "127.0.0.1",
                0,
                database_path,
                heartbeat_seconds=0.1,
            )
            server.server_close()
            engine = create_sqlite_engine(database_path)

            try:
                artifact = ArtifactStore(engine).get_artifact("seed-sofa-01")

                self.assertEqual(artifact.object_type, "sofa")
            finally:
                engine.dispose()

    def test_bind_failure_preserves_socket_error(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            server = create_http_server(
                "127.0.0.1",
                0,
                Path(tempdir) / "state.sqlite3",
                heartbeat_seconds=0.1,
            )
            host, port = server.server_address

            try:
                with self.assertRaises(OSError):
                    create_http_server(
                        host,
                        port,
                        Path(tempdir) / "second-state.sqlite3",
                        heartbeat_seconds=0.1,
                    )
            finally:
                server.server_close()


def test_create_app_serves_health_and_documentation(fastapi_client: TestClient) -> None:
    assert fastapi_client.get("/health").json() == {"ok": True}
    assert fastapi_client.get("/openapi.json").status_code == 200
    assert fastapi_client.get("/docs").status_code == 200


def test_create_app_bootstraps_runtime_services(temp_database_path: Path, fastapi_client: TestClient) -> None:
    runtime_seed = temp_database_path.parent / "artifacts" / "models" / "sofa-01.glb"
    artifact = fastapi_client.app.state.services.artifact_store.get_artifact("seed-sofa-01")

    assert runtime_seed.exists()
    assert runtime_seed.stat().st_size > 1_000_000
    assert artifact.object_type == "sofa"


def test_create_app_closes_store_on_shutdown(temp_database_path: Path) -> None:
    original_close = SQLiteStore.close

    def close_and_record(store: SQLiteStore) -> None:
        original_close(store)

    with patch("server.app.SQLiteStore.close", autospec=True, side_effect=close_and_record) as close_store:
        app = create_app(
            database_path=temp_database_path,
            heartbeat_seconds=0.1,
        )

        with TestClient(app):
            pass

        close_store.assert_called_once()


def test_create_app_serves_state_snapshot(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/state")
    body = response.json()

    assert response.status_code == 200
    assert body["revision"] == 0
    assert body["lastEventId"] == 0
    assert "sofa" in body["state"]["furniture"]
    assert "window" in body["state"]["wallObjects"]


def test_state_route_uses_services_dependency(temp_database_path: Path) -> None:
    from server.api.dependencies import get_services

    class FakeStore:
        def load_state_snapshot(self) -> dict[str, object]:
            return {
                "state": {"revision": 7, "furniture": {}, "wallObjects": {}},
                "revision": 7,
                "lastEventId": 42,
            }

    app = create_app(
        database_path=temp_database_path,
        heartbeat_seconds=0.1,
    )
    app.dependency_overrides[get_services] = lambda: SimpleNamespace(store=FakeStore())

    with TestClient(app) as client:
        assert client.get("/api/state").json() == {
            "state": {"revision": 7, "furniture": {}, "wallObjects": {}},
            "revision": 7,
            "lastEventId": 42,
        }


def test_create_app_normalizes_not_found_errors(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/missing")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Route not found"}}


def test_create_app_normalizes_validation_errors(temp_database_path: Path) -> None:
    app = create_app(
        database_path=temp_database_path,
        heartbeat_seconds=0.1,
    )

    @app.get("/validation-probe")
    def validation_probe(page: int = Query(ge=1)) -> dict[str, int]:
        return {"page": page}

    with TestClient(app) as client:
        response = client.get("/validation-probe?page=0")
        body = response.json()

        assert response.status_code == 422
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "page" in body["error"]["message"]


def test_create_app_allows_local_cors_preflight(fastapi_client: TestClient) -> None:
    response = fastapi_client.options(
        "/api/state",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert response.status_code in {200, 204}
    assert response.headers["access-control-allow-origin"] == "*"
    assert "GET" in response.headers["access-control-allow-methods"]


def test_fastapi_command_endpoint_executes_command(fastapi_client: TestClient) -> None:
    response = fastapi_client.post(
        "/api/commands",
        json={
            "type": "MOVE_FURNITURE",
            "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 1.6}},
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["result"]["accepted"] is True
    assert body["result"]["revision"] == 1
    assert body["result"]["events"][0]["id"] == 1

    state_body = fastapi_client.get("/api/state").json()
    assert state_body["state"]["furniture"]["coffee-table"]["position"]["x"] == 1.2


def test_fastapi_command_endpoint_executes_wall_object_move(fastapi_client: TestClient) -> None:
    response = fastapi_client.post(
        "/api/commands",
        json={
            "type": "MOVE_WALL_OBJECT",
            "payload": {"wallObjectId": "window", "wallId": "left", "position": {"u": 0.5, "y": 1.4}},
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["result"]["accepted"] is True
    assert body["result"]["events"][0]["patch"]["wallObjects"]["window"]["wallId"] == "left"
    assert body["result"]["events"][0]["patch"]["wallObjects"]["window"]["position"] == {"u": 0.5, "y": 1.4}

    state_body = fastapi_client.get("/api/state").json()
    assert state_body["state"]["wallObjects"]["window"]["wallId"] == "left"
    assert state_body["state"]["wallObjects"]["window"]["position"] == {"u": 0.5, "y": 1.4}


def test_fastapi_command_endpoint_persists_and_publishes_events(fastapi_client: TestClient) -> None:
    services = fastapi_client.app.state.services
    subscriber = services.broker.subscribe()

    try:
        response = fastapi_client.post("/api/commands", json={"type": "RESET_LAYOUT", "payload": {}})
        event = subscriber.get(timeout=1)
    finally:
        services.broker.unsubscribe(subscriber)

    commands = services.store.list_commands_after(0)

    assert response.status_code == 200
    assert commands[0]["status"] == "accepted"
    assert event["type"] == "room.state.snapshot"


def test_fastapi_playground_command_endpoint_returns_event(fastapi_client: TestClient) -> None:
    response = fastapi_client.post("/api/playground/commands", json={"type": "RESET_LAYOUT", "payload": {}})
    body = response.json()

    assert response.status_code == 200
    assert body["event"]["type"] == "playground.command.accepted"
    assert body["event"]["command"]["type"] == "RESET_LAYOUT"
    assert body["result"]["accepted"] is True


def test_fastapi_playground_command_endpoint_validates_payload_shape(fastapi_client: TestClient) -> None:
    response = fastapi_client.post("/api/playground/commands", json={"type": "RESET_LAYOUT", "payload": "bad"})
    body = response.json()

    assert response.status_code == 422
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["result"]["accepted"] is False
    assert body["result"]["events"][0]["type"] == "command.rejected"
    assert fastapi_client.app.state.services.store.list_commands_after(0)[0]["status"] == "rejected"


def test_fastapi_command_endpoint_validates_json_body(fastapi_client: TestClient) -> None:
    response = fastapi_client.post(
        "/api/commands",
        content="{bad json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "Request body must be valid JSON"}
    }


def test_fastapi_command_endpoint_validates_object_body(fastapi_client: TestClient) -> None:
    response = fastapi_client.post("/api/commands", json=[])

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "Request body must be a JSON object"}
    }


def test_fastapi_unknown_post_route_returns_not_found_before_json_validation(fastapi_client: TestClient) -> None:
    response = fastapi_client.post(
        "/api/unknown",
        content="{bad json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Route not found"}}


def test_fastapi_events_history_endpoint_returns_persisted_events_after_id(fastapi_client: TestClient) -> None:
    fastapi_client.post("/api/commands", json={"type": "RESET_LAYOUT", "payload": {}})
    fastapi_client.post(
        "/api/commands",
        json={
            "type": "SET_FURNITURE_ROTATION",
            "payload": {"furnitureId": "planter", "rotationYDegrees": 45},
        },
    )

    response = fastapi_client.get("/api/events/history?after=1")
    body = response.json()

    assert response.status_code == 200
    assert body["lastEventId"] == 2
    assert len(body["events"]) == 1
    assert body["events"][0]["id"] == 2


def test_fastapi_events_history_validates_after_id(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/events/history?after=-1")

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "after must be a non-negative integer"}
    }


def test_fastapi_events_route_validates_since_id(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/events?since=bad")

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "since must be a non-negative integer"}
    }


def test_fastapi_events_route_validates_last_event_id(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/events", headers={"Last-Event-ID": "-1"})

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "Last-Event-ID must be a non-negative integer"}
    }


def test_fastapi_events_stream_replays_missed_events_from_last_event_id(fastapi_client: TestClient) -> None:
    from server.api.routes.events import event_stream

    fastapi_client.post("/api/commands", json={"type": "RESET_LAYOUT", "payload": {}})
    fastapi_client.post(
        "/api/commands",
        json={
            "type": "SET_FURNITURE_ROTATION",
            "payload": {"furnitureId": "planter", "rotationYDegrees": 45},
        },
    )

    async def read_replayed_event() -> bytes:
        stream = event_stream(fastapi_client.app.state.services, since_id=1)
        try:
            return await anext(stream)
        finally:
            await stream.aclose()

    frame = asyncio.run(read_replayed_event()).decode("utf-8")

    assert "id: 2" in frame
    assert "event: room.state.patch" in frame


def test_fastapi_events_stream_receives_live_command_events(fastapi_client: TestClient) -> None:
    from server.api.routes.events import event_stream

    async def read_live_event() -> bytes:
        stream = event_stream(fastapi_client.app.state.services, since_id=0)

        async def next_event_frame() -> bytes:
            while True:
                frame = await anext(stream)
                if not frame.startswith(b": "):
                    return frame

        try:
            read_task = asyncio.create_task(next_event_frame())
            await asyncio.sleep(0.01)
            fastapi_client.post("/api/commands", json={"type": "RESET_LAYOUT", "payload": {}})
            return await asyncio.wait_for(read_task, timeout=1)
        finally:
            await stream.aclose()

    frame = asyncio.run(read_live_event()).decode("utf-8")

    assert "id: 1" in frame
    assert "event: room.state.snapshot" in frame


def test_fastapi_artifact_search_returns_seed_sofa(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts?kind=model3d&type=sofa")
    body = response.json()

    assert response.status_code == 200
    assert body["pagination"] == {"page": 1, "pageSize": 24, "totalItems": 1, "totalPages": 1}
    assert len(body["artifacts"]) == 1
    artifact = body["artifacts"][0]
    assert artifact["id"] == "seed-sofa-01"
    assert artifact["kind"] == "model3d"
    assert artifact["objectType"] == "sofa"
    assert artifact["url"] == "http://testserver/api/artifacts/seed-sofa-01/content"


def test_fastapi_artifact_search_filters_by_tag_query_param(fastapi_client: TestClient) -> None:
    fastapi_client.app.state.services.artifact_store.seed_artifacts((create_test_table_artifact(),))

    response = fastapi_client.get("/api/artifacts?tag=wood")

    assert response.status_code == 200
    assert [artifact["id"] for artifact in response.json()["artifacts"]] == ["seed-table-01"]


def test_fastapi_artifact_batch_lookup_returns_found_and_missing_ids(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts?ids=missing-a,seed-sofa-01,seed-sofa-01,missing-b")
    body = response.json()

    assert response.status_code == 200
    assert [artifact["id"] for artifact in body["artifacts"]] == ["seed-sofa-01"]
    assert body["missingIds"] == ["missing-a", "missing-b"]


def test_fastapi_artifact_batch_lookup_validates_ids(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts?ids=,,")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "ids" in response.json()["error"]["message"]


def test_fastapi_artifact_search_validates_pagination(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts?page=0")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "page" in response.json()["error"]["message"]


def test_fastapi_artifact_search_rejects_over_max_page_size(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts?pageSize=101")

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "pageSize must be no greater than 100"}
    }


def test_fastapi_artifact_metadata_ignores_untrusted_host_header(fastapi_client: TestClient) -> None:
    response = fastapi_client.get(
        "/api/artifacts?kind=model3d&type=sofa",
        headers={"Host": "attacker.example"},
    )

    assert response.status_code == 200
    assert response.json()["artifacts"][0]["url"] == "http://testserver/api/artifacts/seed-sofa-01/content"


def test_fastapi_artifact_metadata_uses_configured_public_base_url(temp_database_path: Path) -> None:
    app = create_app(
        database_path=temp_database_path,
        heartbeat_seconds=0.1,
        public_base_url="https://assets.example.test/artifacts/",
    )

    with TestClient(app) as client:
        response = client.get("/api/artifacts?kind=model3d&type=sofa")

    assert response.status_code == 200
    assert (
        response.json()["artifacts"][0]["url"]
        == "https://assets.example.test/artifacts/api/artifacts/seed-sofa-01/content"
    )


def test_fastapi_artifact_metadata_endpoint_includes_local_storage_key(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts/seed-sofa-01")
    body = response.json()

    assert response.status_code == 200
    assert body["artifact"]["id"] == "seed-sofa-01"
    assert body["artifact"]["storageKey"] == "models/sofa-01.glb"


def test_fastapi_artifact_content_endpoint_serves_seed_glb(fastapi_client: TestClient) -> None:
    response = fastapi_client.get("/api/artifacts/seed-sofa-01/content")

    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.content[:4] == b"glTF"
    assert len(response.content) > 1_000_000


def test_fastapi_artifact_content_endpoint_streams_seed_glb(fastapi_client: TestClient) -> None:
    with patch.object(Path, "read_bytes", side_effect=AssertionError("read_bytes should not be used")):
        response = fastapi_client.get("/api/artifacts/seed-sofa-01/content")

    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"
    assert response.content[:4] == b"glTF"


def test_fastapi_artifact_content_endpoint_returns_not_found_for_unknown_artifact(
    fastapi_client: TestClient,
) -> None:
    response = fastapi_client.get("/api/artifacts/missing-artifact/content")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Artifact not found"}}


class RequestHandlerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.server = create_http_server(
            "127.0.0.1",
            0,
            Path(self.tempdir.name) / "state.sqlite3",
            heartbeat_seconds=0.1,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.server.server_address

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tempdir.cleanup()

    def get_json(self, path: str, headers: dict[str, str] | None = None) -> tuple[int, dict[str, object]]:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request("GET", path, headers=headers or {})
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

    def get_bytes(self, path: str) -> tuple[int, dict[str, str], bytes]:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request("GET", path)
        response = connection.getresponse()
        headers = {header: value for header, value in response.getheaders()}
        body = response.read()
        connection.close()
        return response.status, headers, body

    def open_get(self, path: str, headers: dict[str, str] | None = None) -> tuple[HTTPConnection, object]:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request("GET", path, headers=headers or {})
        return connection, connection.getresponse()

    def post_json(self, path: str, payload: object) -> tuple[int, dict[str, object]]:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request(
            "POST",
            path,
            body=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

    def test_state_endpoint_returns_snapshot(self) -> None:
        status, body = self.get_json("/api/state")

        self.assertEqual(status, 200)
        self.assertEqual(body["revision"], 0)
        self.assertEqual(body["lastEventId"], 0)
        self.assertIn("sofa", body["state"]["furniture"])
        self.assertIn("window", body["state"]["wallObjects"])

    def test_canonical_command_endpoint_executes_command(self) -> None:
        status, body = self.post_json(
            "/api/commands",
            {
                "type": "MOVE_FURNITURE",
                "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 1.6}},
            },
        )

        self.assertEqual(status, 200)
        self.assertTrue(body["result"]["accepted"])
        self.assertEqual(body["result"]["revision"], 1)
        self.assertEqual(body["result"]["events"][0]["id"], 1)

        _, state_body = self.get_json("/api/state")
        self.assertEqual(state_body["state"]["furniture"]["coffee-table"]["position"]["x"], 1.2)

    def test_canonical_command_endpoint_executes_wall_object_move(self) -> None:
        status, body = self.post_json(
            "/api/commands",
            {
                "type": "MOVE_WALL_OBJECT",
                "payload": {"wallObjectId": "window", "wallId": "left", "position": {"u": 0.5, "y": 1.4}},
            },
        )

        self.assertEqual(status, 200)
        self.assertTrue(body["result"]["accepted"])
        self.assertEqual(body["result"]["events"][0]["patch"]["wallObjects"]["window"]["wallId"], "left")
        self.assertEqual(body["result"]["events"][0]["patch"]["wallObjects"]["window"]["position"], {"u": 0.5, "y": 1.4})

        _, state_body = self.get_json("/api/state")
        self.assertEqual(state_body["state"]["wallObjects"]["window"]["wallId"], "left")
        self.assertEqual(state_body["state"]["wallObjects"]["window"]["position"], {"u": 0.5, "y": 1.4})

    def test_playground_command_endpoint_returns_event(self) -> None:
        status, body = self.post_json("/api/playground/commands", {"type": "RESET_LAYOUT", "payload": {}})

        self.assertEqual(status, 200)
        self.assertEqual(body["event"]["type"], "playground.command.accepted")
        self.assertEqual(body["event"]["command"]["type"], "RESET_LAYOUT")
        self.assertTrue(body["result"]["accepted"])

    def test_playground_command_endpoint_validates_payload_shape(self) -> None:
        status, body = self.post_json("/api/playground/commands", {"type": "RESET_LAYOUT", "payload": "bad"})

        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["result"]["events"][0]["type"], "command.rejected")

    def test_events_history_endpoint_returns_persisted_events_after_id(self) -> None:
        self.post_json("/api/commands", {"type": "RESET_LAYOUT", "payload": {}})
        self.post_json(
            "/api/commands",
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "planter", "rotationYDegrees": 45},
            },
        )

        status, body = self.get_json("/api/events/history?after=1")

        self.assertEqual(status, 200)
        self.assertEqual(body["lastEventId"], 2)
        self.assertEqual(len(body["events"]), 1)
        self.assertEqual(body["events"][0]["id"], 2)

    def test_artifact_search_returns_seed_sofa(self) -> None:
        status, body = self.get_json("/api/artifacts?kind=model3d&type=sofa")

        self.assertEqual(status, 200)
        self.assertEqual(body["pagination"], {"page": 1, "pageSize": 24, "totalItems": 1, "totalPages": 1})
        self.assertEqual(len(body["artifacts"]), 1)
        artifact = body["artifacts"][0]
        self.assertEqual(artifact["id"], "seed-sofa-01")
        self.assertEqual(artifact["kind"], "model3d")
        self.assertEqual(artifact["objectType"], "sofa")
        self.assertEqual(artifact["url"], f"http://{self.host}:{self.port}/api/artifacts/seed-sofa-01/content")

    def test_artifact_metadata_ignores_untrusted_host_header(self) -> None:
        status, body = self.get_json(
            "/api/artifacts?kind=model3d&type=sofa",
            headers={"Host": "attacker.example"},
        )

        self.assertEqual(status, 200)
        self.assertEqual(
            body["artifacts"][0]["url"],
            f"http://{self.host}:{self.port}/api/artifacts/seed-sofa-01/content",
        )

    def test_artifact_metadata_uses_configured_public_base_url(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            server = create_http_server(
                "127.0.0.1",
                0,
                Path(tempdir) / "state.sqlite3",
                heartbeat_seconds=0.1,
                public_base_url="https://assets.example.test/artifacts/",
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            host, port = server.server_address
            connection = HTTPConnection(host, port, timeout=5)

            try:
                connection.request("GET", "/api/artifacts?kind=model3d&type=sofa")
                response = connection.getresponse()
                body = json.loads(response.read().decode("utf-8"))

                self.assertEqual(response.status, 200)
                self.assertEqual(
                    body["artifacts"][0]["url"],
                    "https://assets.example.test/artifacts/api/artifacts/seed-sofa-01/content",
                )
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_artifact_routes_read_metadata_from_artifact_store(self) -> None:
        self.server.artifact_store.seed_artifacts((create_test_table_artifact(),))

        status, body = self.get_json("/api/artifacts?kind=model3d&type=table")

        self.assertEqual(status, 200)
        self.assertEqual([artifact["id"] for artifact in body["artifacts"]], ["seed-table-01"])

    def test_artifact_search_filters_by_tag_query_param(self) -> None:
        self.server.artifact_store.seed_artifacts((create_test_table_artifact(),))

        status, body = self.get_json("/api/artifacts?tag=wood")

        self.assertEqual(status, 200)
        self.assertEqual([artifact["id"] for artifact in body["artifacts"]], ["seed-table-01"])

    def test_artifact_batch_lookup_returns_found_and_missing_ids(self) -> None:
        status, body = self.get_json("/api/artifacts?ids=missing-a,seed-sofa-01,seed-sofa-01,missing-b")

        self.assertEqual(status, 200)
        self.assertEqual([artifact["id"] for artifact in body["artifacts"]], ["seed-sofa-01"])
        self.assertEqual(body["missingIds"], ["missing-a", "missing-b"])

    def test_artifact_batch_lookup_validates_ids(self) -> None:
        status, body = self.get_json("/api/artifacts?ids=,,")

        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertIn("ids", body["error"]["message"])

    def test_artifact_batch_lookup_rejects_over_max_unique_ids(self) -> None:
        artifact_ids = ",".join(f"artifact-{index}" for index in range(101))

        status, body = self.get_json(f"/api/artifacts?ids={artifact_ids}")

        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertIn("100", body["error"]["message"])

    def test_artifact_search_validates_pagination(self) -> None:
        status, body = self.get_json("/api/artifacts?page=0")

        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertIn("page", body["error"]["message"])

    def test_artifact_metadata_endpoint_includes_local_storage_key(self) -> None:
        status, body = self.get_json("/api/artifacts/seed-sofa-01")

        self.assertEqual(status, 200)
        self.assertEqual(body["artifact"]["id"], "seed-sofa-01")
        self.assertEqual(body["artifact"]["storageKey"], "models/sofa-01.glb")

    def test_artifact_content_endpoint_serves_seed_glb(self) -> None:
        status, headers, body = self.get_bytes("/api/artifacts/seed-sofa-01/content")

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "model/gltf-binary")
        self.assertEqual(headers["Cache-Control"], "public, max-age=3600")
        self.assertEqual(body[:4], b"glTF")
        self.assertGreater(len(body), 1_000_000)

    def test_artifact_content_endpoint_streams_seed_glb(self) -> None:
        with patch.object(Path, "read_bytes", side_effect=AssertionError("read_bytes should not be used")):
            status, headers, body = self.get_bytes("/api/artifacts/seed-sofa-01/content")

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "model/gltf-binary")
        self.assertEqual(body[:4], b"glTF")

    def test_artifact_content_endpoint_returns_not_found_for_unknown_artifact(self) -> None:
        status, body = self.get_json("/api/artifacts/missing-artifact/content")

        self.assertEqual(status, 404)
        self.assertEqual(body["error"]["code"], "NOT_FOUND")

    def test_sse_stream_honors_last_event_id_header(self) -> None:
        self.post_json("/api/commands", {"type": "RESET_LAYOUT", "payload": {}})
        self.post_json(
            "/api/commands",
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "planter", "rotationYDegrees": 45},
            },
        )

        connection, response = self.open_get("/api/events", {"Last-Event-ID": "1"})
        frame = read_sse_event_frame(response)
        connection.close()

        self.assertEqual(response.status, 200)
        self.assertIn("id: 2", frame)
        self.assertIn("event: room.state.patch", frame)

    def test_sse_stream_receives_live_command_events(self) -> None:
        connection, response = self.open_get("/api/events?since=0")

        self.post_json("/api/commands", {"type": "RESET_LAYOUT", "payload": {}})
        frame = read_sse_event_frame(response)
        connection.close()

        self.assertEqual(response.status, 200)
        self.assertIn("id: 1", frame)
        self.assertIn("event: room.state.snapshot", frame)

    def test_unknown_post_route_returns_not_found_before_json_validation(self) -> None:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request(
            "POST",
            "/api/unknown",
            body="{bad json",
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()

        self.assertEqual(response.status, 404)
        self.assertEqual(body["error"]["code"], "NOT_FOUND")


def read_sse_event_frame(response: object) -> list[str]:
    while True:
        frame: list[str] = []

        while True:
            line = response.readline().decode("utf-8")
            if line in {"", "\n", "\r\n"}:
                break

            frame.append(line.rstrip("\r\n"))

        if any(line.startswith("event: ") for line in frame):
            return frame


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
