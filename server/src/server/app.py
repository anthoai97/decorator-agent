from __future__ import annotations

import json
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from server.commands import validate_command
from server.events import EventBroker, format_sse_comment, format_sse_event
from server.executor import CommandExecutor
from server.store import SQLiteStore

JsonObject = dict[str, Any]


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

    @property
    def playground_server(self) -> "PlaygroundHTTPServer":
        return self.server  # type: ignore[return-value]

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


class PlaygroundHTTPServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address: tuple[str, int],
        database_path: str | Path,
        heartbeat_seconds: float = 15.0,
    ) -> None:
        super().__init__(server_address, RequestHandler)
        self.store = SQLiteStore(database_path)
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


def create_http_server(
    host: str,
    port: int,
    database_path: str | Path,
    heartbeat_seconds: float = 15.0,
) -> PlaygroundHTTPServer:
    return PlaygroundHTTPServer((host, port), database_path, heartbeat_seconds)


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


def run_server(host: str = "127.0.0.1", port: int = 8787, database_path: str | Path = ".data/playground.sqlite3") -> None:
    server = create_http_server(host, port, database_path)
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
