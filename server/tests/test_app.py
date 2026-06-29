from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.app import (
    RequestHandler,
    create_http_server,
    create_agent_placeholder_event,
    create_playground_event,
)


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

    def get_json(self, path: str) -> tuple[int, dict[str, object]]:
        connection = HTTPConnection(self.host, self.port, timeout=5)
        connection.request("GET", path)
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

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


if __name__ == "__main__":
    unittest.main()


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
