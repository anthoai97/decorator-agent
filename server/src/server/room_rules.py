from __future__ import annotations

from copy import deepcopy
from typing import Any

from server.state import snap_degrees

JsonObject = dict[str, Any]

ROOM_PADDING = 0
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
    items = [item for item in layout.values() if item.get("blocksPlacement") is not False]

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


def wall_object_bounds(room: JsonObject, wall_id: str) -> JsonObject:
    if wall_id in {"front", "back"}:
        min_u = room["bounds"]["minX"]
        max_u = room["bounds"]["maxX"]
    else:
        min_u = room["bounds"]["minZ"]
        max_u = room["bounds"]["maxZ"]

    return {
        "minU": min_u,
        "maxU": max_u,
        "minY": 0,
        "maxY": room["height"],
    }


def clamp_wall_object_inside_wall(item: JsonObject, room: JsonObject) -> JsonObject:
    bounds = wall_object_bounds(room, item["wallId"])
    half_width = item["size"]["width"] / 2
    half_height = item["size"]["height"] / 2

    next_item = deepcopy(item)
    next_item["position"] = {
        "u": round_footprint(clamp(next_item["position"]["u"], bounds["minU"] + half_width, bounds["maxU"] - half_width)),
        "y": round_footprint(clamp(next_item["position"]["y"], bounds["minY"] + half_height, bounds["maxY"] - half_height)),
    }
    return next_item


def wall_object_edge_distances(item: JsonObject, room: JsonObject) -> JsonObject:
    bounds = wall_object_bounds(room, item["wallId"])
    half_width = item["size"]["width"] / 2
    half_height = item["size"]["height"] / 2

    return {
        "left": round_footprint(item["position"]["u"] - half_width - bounds["minU"]),
        "right": round_footprint(bounds["maxU"] - item["position"]["u"] - half_width),
        "bottom": round_footprint(item["position"]["y"] - half_height - bounds["minY"]),
        "top": round_footprint(bounds["maxY"] - item["position"]["y"] - half_height),
    }


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


def apply_wall_object_position_patch(
    layout: JsonObject,
    room: JsonObject,
    wall_object_id: str,
    patch: JsonObject,
) -> JsonObject:
    if wall_object_id not in layout:
        return {
            "applied": False,
            "clamped": False,
            "reason": "missing-wall-object",
            "wallObjects": layout,
        }

    next_layout = clone_layout(layout)
    previous_item = next_layout[wall_object_id]
    if "position" in patch or "wallId" in patch:
        position_patch = patch.get("position") or {}
        wall_id = patch.get("wallId", previous_item["wallId"])
    else:
        position_patch = patch
        wall_id = previous_item["wallId"]
    next_item = {
        **previous_item,
        "wallId": wall_id,
        "position": {
            **previous_item["position"],
            **position_patch,
        },
    }

    clamped_item = clamp_wall_object_inside_wall(next_item, room)
    clamped = (
        clamped_item["position"]["u"] != next_item["position"]["u"]
        or clamped_item["position"]["y"] != next_item["position"]["y"]
    )

    next_layout[wall_object_id] = clamped_item

    return {
        "applied": True,
        "clamped": clamped,
        "reason": "applied",
        "wallObjects": next_layout,
    }
