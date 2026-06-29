from __future__ import annotations

from copy import deepcopy
from threading import RLock
from typing import Any
from uuid import uuid4

from server.commands import validate_command
from server.events import create_state_event
from server.room_rules import apply_transform_patch
from server.state import reset_layout_state
from server.store import SQLiteStore

JsonObject = dict[str, Any]


class CommandRejected(ValueError):
    pass


class CommandExecutor:
    def __init__(self, store: SQLiteStore) -> None:
        self.store = store
        self.lock = RLock()

    def execute_command(self, raw_command: JsonObject) -> JsonObject:
        with self.lock:
            current_state = self.store.load_state()

            try:
                command = validate_command(raw_command)
                next_state = apply_validated_command(current_state, command)
                event = create_state_event(command, next_state)
                stored = self.store.record_accepted_command(command, [event], next_state)
                return {
                    "accepted": True,
                    "revision": next_state["revision"],
                    "commandId": stored["commandId"],
                    "events": stored["events"],
                    "state": stored["state"],
                }
            except CommandRejected as error:
                return self.record_rejection(raw_command, current_state, "COMMAND_REJECTED", str(error))
            except ValueError as error:
                return self.record_rejection(raw_command, current_state, "VALIDATION_ERROR", str(error))

    def record_rejection(
        self,
        raw_command: JsonObject,
        current_state: JsonObject,
        code: str,
        message: str,
    ) -> JsonObject:
        event = {
            "type": "command.rejected",
            "source": "server",
            "revision": current_state["revision"],
            "error": {"code": code, "message": message},
            "command": deepcopy(raw_command),
        }
        stored = self.store.record_rejected_command(raw_command, [event], message)
        return {
            "accepted": False,
            "revision": current_state["revision"],
            "commandId": stored["commandId"],
            "events": stored["events"],
            "error": {"code": code, "message": message},
        }


def apply_validated_command(state: JsonObject, command: JsonObject) -> JsonObject:
    command_type = command["type"]

    if command_type == "ADD_OBJECTIVE":
        return apply_add_objective(state, command["payload"]["title"])

    if command_type == "DELETE_OBJECTIVE":
        return apply_delete_objective(state, command["payload"]["objectiveId"])

    if command_type == "MOVE_FURNITURE":
        return apply_transform_command(
            state,
            command["payload"]["furnitureId"],
            {"position": command["payload"]["position"]},
        )

    if command_type == "REMOVE_FURNITURE":
        return apply_remove_furniture(state, command["payload"]["furnitureId"])

    if command_type == "RESET_LAYOUT":
        return reset_layout_state(state)

    if command_type == "SET_FURNITURE_ROTATION":
        patch = {"rotation": {"yDegrees": command["payload"]["rotationYDegrees"]}}
        if "position" in command["payload"]:
            patch["position"] = command["payload"]["position"]
        return apply_transform_command(
            state,
            command["payload"]["furnitureId"],
            patch,
        )

    raise CommandRejected(f"Command rejected: unsupported command {command_type}")


def apply_add_objective(state: JsonObject, title: str) -> JsonObject:
    next_state = deepcopy(state)
    next_state["revision"] = int(state["revision"]) + 1
    next_state["objectives"] = [
        *next_state["objectives"],
        {"id": f"objective-{uuid4()}", "title": title},
    ]
    return next_state


def apply_delete_objective(state: JsonObject, objective_id: str) -> JsonObject:
    next_state = deepcopy(state)
    next_objectives = [objective for objective in next_state["objectives"] if objective["id"] != objective_id]

    if len(next_objectives) == len(next_state["objectives"]):
        raise CommandRejected("Command rejected: objective not found")

    next_state["revision"] = int(state["revision"]) + 1
    next_state["objectives"] = next_objectives
    return next_state


def apply_transform_command(state: JsonObject, furniture_id: str, patch: JsonObject) -> JsonObject:
    result = apply_transform_patch(state["furniture"], state["room"], furniture_id, patch)

    if not result["applied"]:
        if result["reason"] == "overlap":
            raise CommandRejected("Command rejected: furniture would overlap")
        raise CommandRejected("Command rejected: furniture not found")

    next_state = deepcopy(state)
    next_state["revision"] = int(state["revision"]) + 1
    next_state["furniture"] = result["layout"]
    return next_state


def apply_remove_furniture(state: JsonObject, furniture_id: str) -> JsonObject:
    if furniture_id not in state["furniture"]:
        raise CommandRejected("Command rejected: furniture not found")

    next_state = deepcopy(state)
    next_state["revision"] = int(state["revision"]) + 1
    del next_state["furniture"][furniture_id]
    return next_state
