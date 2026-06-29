from __future__ import annotations

from copy import deepcopy
from typing import Any

from server.state import snap_degrees

JsonObject = dict[str, Any]

ROOM_PADDING = 0.18
COLLISION_PADDING = 0.04


def clone_layout(layout: JsonObject) -> JsonObject:
    return deepcopy(layout)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def round_footprint(value: float) -> float:
    return round(value, 3)


def rotation_aware_size(size: JsonObject, y_degrees: float) -> JsonObject:
    import math

    radians = snap_degrees(y_degrees, 45) * math.pi / 180
    cosine = abs(math.cos(radians))
    sine = abs(math.sin(radians))

    return {
        "width": round_footprint(size["width"] * cosine + size["depth"] * sine),
        "height": size["height"],
        "depth": round_footprint(size["width"] * sine + size["depth"] * cosine),
    }


def create_footprint(position: JsonObject, size: JsonObject) -> JsonObject:
    return {
        "minX": round_footprint(position["x"] - size["width"] / 2),
        "maxX": round_footprint(position["x"] + size["width"] / 2),
        "minZ": round_footprint(position["z"] - size["depth"] / 2),
        "maxZ": round_footprint(position["z"] + size["depth"] / 2),
    }


def inset_footprint(footprint: JsonObject, inset: float) -> JsonObject:
    return {
        "minX": round_footprint(footprint["minX"] + inset),
        "maxX": round_footprint(footprint["maxX"] - inset),
        "minZ": round_footprint(footprint["minZ"] + inset),
        "maxZ": round_footprint(footprint["maxZ"] - inset),
    }


def furniture_footprint(item: JsonObject) -> JsonObject:
    return inset_footprint(
        create_footprint(item["position"], rotation_aware_size(item["baseSize"], item["rotation"]["yDegrees"])),
        COLLISION_PADDING,
    )


def footprints_overlap(first: JsonObject, second: JsonObject) -> bool:
    return (
        first["minX"] < second["maxX"]
        and first["maxX"] > second["minX"]
        and first["minZ"] < second["maxZ"]
        and first["maxZ"] > second["minZ"]
    )


def find_overlap(layout: JsonObject) -> tuple[str, str] | None:
    items = list(layout.values())

    for first_index, first in enumerate(items):
        for second in items[first_index + 1 :]:
            if footprints_overlap(furniture_footprint(first), furniture_footprint(second)):
                return first["id"], second["id"]

    return None


def has_any_overlap(layout: JsonObject) -> bool:
    return find_overlap(layout) is not None


def clamp_transform_inside_room(item: JsonObject, room: JsonObject) -> JsonObject:
    size = rotation_aware_size(item["baseSize"], item["rotation"]["yDegrees"])
    half_width = size["width"] / 2
    half_depth = size["depth"] / 2

    min_x = room["bounds"]["minX"] + ROOM_PADDING + half_width
    max_x = room["bounds"]["maxX"] - ROOM_PADDING - half_width
    min_z = room["bounds"]["minZ"] + ROOM_PADDING + half_depth
    max_z = room["bounds"]["maxZ"] - ROOM_PADDING - half_depth

    next_item = deepcopy(item)
    next_item["position"] = {
        **next_item["position"],
        "x": round_footprint(clamp(next_item["position"]["x"], min_x, max_x)),
        "y": clamp(next_item["position"]["y"], 0, max(0, room["height"] - next_item["baseSize"]["height"])),
        "z": round_footprint(clamp(next_item["position"]["z"], min_z, max_z)),
    }
    return next_item


def apply_transform_patch(layout: JsonObject, room: JsonObject, furniture_id: str, patch: JsonObject) -> JsonObject:
    if furniture_id not in layout:
        return {
            "applied": False,
            "clamped": False,
            "reason": "missing-furniture",
            "layout": layout,
        }

    next_layout = clone_layout(layout)
    previous_item = next_layout[furniture_id]
    position_patch = patch.get("position") or {}
    rotation_patch = patch.get("rotation") or {}
    next_item = {
        **previous_item,
        "position": {
            **previous_item["position"],
            **position_patch,
        },
        "rotation": {
            "yDegrees": snap_degrees(rotation_patch.get("yDegrees", previous_item["rotation"]["yDegrees"])),
        },
    }

    clamped_item = clamp_transform_inside_room(next_item, room)
    clamped = (
        clamped_item["position"]["x"] != next_item["position"]["x"]
        or clamped_item["position"]["y"] != next_item["position"]["y"]
        or clamped_item["position"]["z"] != next_item["position"]["z"]
    )

    next_layout[furniture_id] = clamped_item

    if has_any_overlap(next_layout):
        return {
            "applied": False,
            "clamped": False,
            "reason": "overlap",
            "layout": layout,
        }

    return {
        "applied": True,
        "clamped": clamped,
        "reason": "applied",
        "layout": next_layout,
    }
