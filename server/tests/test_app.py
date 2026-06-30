from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import Query
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.app import create_app
from server.artifacts import Artifact, ArtifactDimensions
from server.store import SQLiteStore


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


def test_fastapi_agent_runs_endpoint_returns_placeholder_event(fastapi_client: TestClient) -> None:
    response = fastapi_client.post("/api/agent/runs", json={"message": "arrange this room"})
    body = response.json()

    assert response.status_code == 200
    assert body["event"]["type"] == "agent.placeholder.completed"
    assert body["event"]["request"] == {"message": "arrange this room"}
    assert "Real Agent SDK setup is not configured yet" in body["event"]["message"]


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
