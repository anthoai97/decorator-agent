from __future__ import annotations

from copy import deepcopy
import math
from typing import Any

JsonObject = dict[str, Any]

ROOM_DEFINITION: JsonObject = {
    "width": 9.6,
    "depth": 6.8,
    "height": 2.75,
    "bounds": {"minX": -4.8, "maxX": 4.8, "minZ": -3.4, "maxZ": 3.4},
}

FURNITURE_CATALOG: tuple[JsonObject, ...] = (
    {
        "id": "sofa",
        "name": "Sofa",
        "movable": True,
        "defaultPosition": {"x": -1.5, "y": 0, "z": -1.55},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 2.49, "height": 1.21, "depth": 0.93},
    },
    {
        "id": "coffee-table",
        "name": "Coffee table",
        "movable": True,
        "defaultPosition": {"x": 0.55, "y": 0, "z": 0.25},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 1.35, "height": 0.628, "depth": 0.82},
    },
    {
        "id": "lounge-chair",
        "name": "Lounge chair",
        "movable": True,
        "defaultPosition": {"x": 2.1, "y": 0, "z": -0.65},
        "defaultRotationYDegrees": -31.5,
        "baseSize": {"width": 1.273, "height": 1.235, "depth": 1.303},
    },
    {
        "id": "bookshelf",
        "name": "Bookshelf",
        "movable": True,
        "defaultPosition": {"x": 3.65, "y": 0, "z": -2.15},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 0.92, "height": 1.56, "depth": 0.34},
    },
    {
        "id": "planter",
        "name": "Planter",
        "movable": True,
        "defaultPosition": {"x": -3.55, "y": 0, "z": -2.25},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 0.72, "height": 1.133, "depth": 0.867},
    },
)

FURNITURE_IDS = {item["id"] for item in FURNITURE_CATALOG}


def create_initial_state() -> JsonObject:
    return {
        "revision": 0,
        "room": deepcopy(ROOM_DEFINITION),
        "furniture": {item["id"]: create_furniture_item(item) for item in FURNITURE_CATALOG},
        "objectives": [],
    }


def reset_layout_state(state: JsonObject) -> JsonObject:
    initial_state = create_initial_state()
    return {
        **deepcopy(state),
        "revision": int(state.get("revision", 0)) + 1,
        "room": initial_state["room"],
        "furniture": initial_state["furniture"],
    }


def create_furniture_item(item: JsonObject) -> JsonObject:
    return {
        "id": item["id"],
        "name": item["name"],
        "movable": item["movable"],
        "position": deepcopy(item["defaultPosition"]),
        "rotation": {"yDegrees": snap_degrees(item["defaultRotationYDegrees"])},
        "baseSize": deepcopy(item["baseSize"]),
    }


def normalize_degrees(value: float) -> float:
    return ((value % 360) + 360) % 360


def snap_degrees(value: float, step: int = 45) -> int:
    return int(normalize_degrees(math.floor(value / step + 0.5) * step))
