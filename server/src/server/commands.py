from __future__ import annotations

import math
from typing import Any

from server.state import FURNITURE_IDS, ROOM_WALL_IDS, WALL_OBJECT_IDS

JsonObject = dict[str, Any]

VALID_COMMAND_SOURCES = ("agent", "system", "user")
VALID_COMMAND_TYPES = {
    "ADD_OBJECTIVE",
    "DELETE_OBJECTIVE",
    "MOVE_FURNITURE",
    "MOVE_WALL_OBJECT",
    "REMOVE_FURNITURE",
    "RESET_LAYOUT",
    "SET_FURNITURE_ROTATION",
}


def validate_command(command: JsonObject) -> JsonObject:
    if not isinstance(command, dict):
        raise ValueError("Command must be an object")

    source = command.get("source", "user")
    if source not in VALID_COMMAND_SOURCES:
        raise ValueError(f"Command source must be one of: {', '.join(VALID_COMMAND_SOURCES)}")

    command_type = command.get("type")
    if not isinstance(command_type, str) or not command_type:
        raise ValueError("Command must include a non-empty string type")

    if command_type not in VALID_COMMAND_TYPES:
        raise ValueError(f"Unsupported command: {command_type}")

    payload = command.get("payload", {})
    if not isinstance(payload, dict):
        raise ValueError("Command payload must be an object when provided")

    return {
        "source": source,
        "type": command_type,
        "payload": validate_command_payload(command_type, payload),
    }


def validate_command_payload(command_type: str, payload: JsonObject) -> JsonObject:
    if command_type == "ADD_OBJECTIVE":
        require_exact_keys(payload, {"title"}, command_type)
        require_non_empty_string(payload, "title", command_type)
        return {"title": payload["title"]}

    if command_type == "DELETE_OBJECTIVE":
        require_exact_keys(payload, {"objectiveId"}, command_type)
        require_non_empty_string(payload, "objectiveId", command_type)
        return {"objectiveId": payload["objectiveId"]}

    if command_type == "MOVE_FURNITURE":
        require_exact_keys(payload, {"furnitureId", "position"}, command_type)
        require_furniture_id(payload, command_type)
        position = require_position(payload, command_type)
        return {"furnitureId": payload["furnitureId"], "position": position}

    if command_type == "MOVE_WALL_OBJECT":
        require_one_exact_key_set(
            payload,
            (
                {"wallObjectId", "position"},
                {"wallObjectId", "wallId", "position"},
            ),
            command_type,
        )
        require_wall_object_id(payload, command_type)
        position = require_wall_object_position(payload, command_type)
        validated_payload = {"wallObjectId": payload["wallObjectId"], "position": position}
        if "wallId" in payload:
            require_wall_id(payload, command_type)
            validated_payload["wallId"] = payload["wallId"]
        return validated_payload

    if command_type == "REMOVE_FURNITURE":
        require_exact_keys(payload, {"furnitureId"}, command_type)
        require_furniture_id(payload, command_type)
        return {"furnitureId": payload["furnitureId"]}

    if command_type == "RESET_LAYOUT":
        require_exact_keys(payload, set(), command_type)
        return {}

    if command_type == "SET_FURNITURE_ROTATION":
        require_one_exact_key_set(
            payload,
            (
                {"furnitureId", "rotationYDegrees"},
                {"furnitureId", "position", "rotationYDegrees"},
            ),
            command_type,
        )
        require_furniture_id(payload, command_type)
        require_finite_number(payload, "rotationYDegrees", command_type)
        validated_payload = {"furnitureId": payload["furnitureId"], "rotationYDegrees": payload["rotationYDegrees"]}
        if "position" in payload:
            validated_payload["position"] = require_position(payload, command_type)
        return validated_payload

    raise ValueError(f"Unsupported command: {command_type}")


def require_exact_keys(payload: JsonObject, expected_keys: set[str], command_type: str) -> None:
    actual_keys = set(payload.keys())
    if actual_keys != expected_keys:
        expected = ", ".join(sorted(expected_keys)) or "no fields"
        raise ValueError(f"{command_type} payload must include exactly: {expected}")


def require_one_exact_key_set(payload: JsonObject, expected_key_sets: tuple[set[str], ...], command_type: str) -> None:
    actual_keys = set(payload.keys())
    if actual_keys in expected_key_sets:
        return

    expected = " or ".join(", ".join(sorted(keys)) or "no fields" for keys in expected_key_sets)
    raise ValueError(f"{command_type} payload must include exactly: {expected}")


def require_non_empty_string(payload: JsonObject, key: str, command_type: str) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{command_type} payload field {key} must be a non-empty string")


def require_furniture_id(payload: JsonObject, command_type: str) -> None:
    value = payload.get("furnitureId")
    if value not in FURNITURE_IDS:
        raise ValueError(f"{command_type} payload field furnitureId must be a known furniture id")


def require_wall_object_id(payload: JsonObject, command_type: str) -> None:
    value = payload.get("wallObjectId")
    if value not in WALL_OBJECT_IDS:
        raise ValueError(f"{command_type} payload field wallObjectId must be a known wall object id")


def require_wall_id(payload: JsonObject, command_type: str) -> None:
    value = payload.get("wallId")
    if value not in ROOM_WALL_IDS:
        raise ValueError(f"{command_type} payload field wallId must be a known room wall id")


def require_position(payload: JsonObject, command_type: str) -> JsonObject:
    position = payload.get("position")
    if not isinstance(position, dict):
        raise ValueError(f"{command_type} payload field position must be an object")

    actual_keys = set(position.keys())
    expected_keys = {"x", "z"}
    if actual_keys != expected_keys:
        expected = ", ".join(sorted(expected_keys))
        raise ValueError(f"{command_type} payload field position must include exactly: {expected}")

    require_finite_number(position, "x", command_type, label="position.x")
    require_finite_number(position, "z", command_type, label="position.z")
    return {"x": position["x"], "z": position["z"]}


def require_wall_object_position(payload: JsonObject, command_type: str) -> JsonObject:
    position = payload.get("position")
    if not isinstance(position, dict):
        raise ValueError(f"{command_type} payload field position must be an object")

    actual_keys = set(position.keys())
    expected_keys = {"u", "y"}
    if actual_keys != expected_keys:
        expected = ", ".join(sorted(expected_keys))
        raise ValueError(f"{command_type} payload field position must include exactly: {expected}")

    require_finite_number(position, "u", command_type, label="position.u")
    require_finite_number(position, "y", command_type, label="position.y")
    return {"u": position["u"], "y": position["y"]}


def require_finite_number(payload: JsonObject, key: str, command_type: str, label: str | None = None) -> None:
    value = payload.get(key)
    field_label = label or key
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{command_type} payload field {field_label} must be a finite number")
