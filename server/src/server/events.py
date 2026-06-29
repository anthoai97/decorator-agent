from __future__ import annotations

from copy import deepcopy
import json
from queue import Queue
from threading import RLock
from typing import Any

JsonObject = dict[str, Any]

TRANSFORM_COMMANDS = {"MOVE_FURNITURE", "SET_FURNITURE_ROTATION"}
OBJECTIVE_COMMANDS = {"ADD_OBJECTIVE", "DELETE_OBJECTIVE"}


def create_state_event(command: JsonObject, state: JsonObject) -> JsonObject:
    command_type = command["type"]
    revision = state["revision"]

    if command_type in TRANSFORM_COMMANDS:
        furniture_id = command["payload"]["furnitureId"]
        return create_patch_event(
            revision,
            {"furniture": {furniture_id: deepcopy(state["furniture"][furniture_id])}},
            command,
        )

    if command_type == "REMOVE_FURNITURE":
        furniture_id = command["payload"]["furnitureId"]
        return create_patch_event(revision, {"furniture": {furniture_id: None}}, command)

    if command_type in OBJECTIVE_COMMANDS:
        return create_patch_event(revision, {"objectives": deepcopy(state["objectives"])}, command)

    if command_type == "RESET_LAYOUT":
        return {
            "type": "room.state.snapshot",
            "source": "server",
            "revision": revision,
            "state": deepcopy(state),
            "command": deepcopy(command),
        }

    raise ValueError(f"Unsupported state event command: {command_type}")


def create_patch_event(revision: int, patch: JsonObject, command: JsonObject) -> JsonObject:
    return {
        "type": "room.state.patch",
        "source": "server",
        "revision": revision,
        "patch": deepcopy(patch),
        "command": deepcopy(command),
    }


class EventBroker:
    def __init__(self) -> None:
        self.lock = RLock()
        self.subscribers: set[Queue[JsonObject]] = set()

    def subscribe(self) -> Queue[JsonObject]:
        subscriber: Queue[JsonObject] = Queue()
        with self.lock:
            self.subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: Queue[JsonObject]) -> None:
        with self.lock:
            self.subscribers.discard(subscriber)

    def publish(self, event: JsonObject) -> None:
        with self.lock:
            subscribers = list(self.subscribers)

        for subscriber in subscribers:
            subscriber.put(deepcopy(event))


def format_sse_event(event: JsonObject) -> bytes:
    lines = [
        f"id: {event['id']}",
        f"event: {event['type']}",
        f"data: {json.dumps(event)}",
        "",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def format_sse_comment(comment: str) -> bytes:
    return f": {comment}\n\n".encode("utf-8")
