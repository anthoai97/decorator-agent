from __future__ import annotations

from copy import deepcopy
import math
from typing import Any

JsonObject = dict[str, Any]

ROOM_DEFINITION: JsonObject = {
    "width": 5.8,
    "depth": 4.4,
    "height": 2.65,
    "bounds": {"minX": -2.9, "maxX": 2.9, "minZ": -2.2, "maxZ": 2.2},
}

FURNITURE_CATALOG: tuple[JsonObject, ...] = (
    {
        "id": "sofa",
        "name": "Sofa",
        "movable": True,
        "blocksPlacement": True,
        "artifactId": "seed-sofa-01",
        "defaultPosition": {"x": -0.9, "y": 0, "z": -1.4},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 2.49, "height": 1.21, "depth": 0.93},
    },
    {
        "id": "coffee-table",
        "name": "Coffee table",
        "movable": True,
        "blocksPlacement": True,
        "defaultPosition": {"x": -0.55, "y": 0, "z": -0.25},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 1.35, "height": 0.628, "depth": 0.82},
    },
    {
        "id": "lounge-chair",
        "name": "Lounge chair",
        "movable": True,
        "blocksPlacement": True,
        "defaultPosition": {"x": 1.75, "y": 0, "z": -0.4},
        "defaultRotationYDegrees": -31.5,
        "baseSize": {"width": 1.273, "height": 1.235, "depth": 1.303},
    },
    {
        "id": "bookshelf",
        "name": "Bookshelf",
        "movable": True,
        "blocksPlacement": True,
        "defaultPosition": {"x": 2.15, "y": 0, "z": -1.75},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 0.92, "height": 1.56, "depth": 0.34},
    },
    {
        "id": "planter",
        "name": "Planter",
        "movable": True,
        "blocksPlacement": True,
        "defaultPosition": {"x": -2.15, "y": 0, "z": 1.35},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 0.72, "height": 1.133, "depth": 0.867},
    },
    {
        "id": "rug",
        "name": "Area rug",
        "movable": True,
        "blocksPlacement": False,
        "defaultPosition": {"x": -0.55, "y": 0, "z": -0.25},
        "defaultRotationYDegrees": 0,
        "baseSize": {"width": 2.7, "height": 0.025, "depth": 1.75},
    },
)

FURNITURE_IDS = {item["id"] for item in FURNITURE_CATALOG}

WALL_OBJECT_CATALOG: tuple[JsonObject, ...] = (
    {
        "id": "window",
        "name": "Window",
        "wallId": "back",
        "movable": True,
        "defaultPosition": {"u": -2.1, "y": 1.7},
        "size": {"width": 1.52, "height": 1.02, "depth": 0.05},
        "normalOffset": 0.071,
    },
    {
        "id": "wall-art",
        "name": "Wall art",
        "wallId": "back",
        "movable": True,
        "defaultPosition": {"u": 1.85, "y": 1.55},
        "size": {"width": 1, "height": 0.72, "depth": 0.075},
        "normalOffset": 0.09,
    },
)

WALL_OBJECT_IDS = {item["id"] for item in WALL_OBJECT_CATALOG}
ROOM_WALL_IDS = {"front", "back", "left", "right"}


def create_initial_state() -> JsonObject:
    return {
        "revision": 0,
        "room": deepcopy(ROOM_DEFINITION),
        "furniture": {item["id"]: create_furniture_item(item) for item in FURNITURE_CATALOG},
        "wallObjects": {item["id"]: create_wall_object_item(item) for item in WALL_OBJECT_CATALOG},
        "objectives": [],
    }


def reset_layout_state(state: JsonObject) -> JsonObject:
    initial_state = create_initial_state()
    return {
        **deepcopy(state),
        "revision": int(state.get("revision", 0)) + 1,
        "room": initial_state["room"],
        "furniture": initial_state["furniture"],
        "wallObjects": initial_state["wallObjects"],
    }


def create_furniture_item(item: JsonObject) -> JsonObject:
    furniture_item = {
        "id": item["id"],
        "name": item["name"],
        "movable": item["movable"],
        "blocksPlacement": item["blocksPlacement"],
        "position": deepcopy(item["defaultPosition"]),
        "rotation": {"yDegrees": snap_degrees(item["defaultRotationYDegrees"])},
        "baseSize": deepcopy(item["baseSize"]),
    }

    if isinstance(item.get("artifactId"), str):
        furniture_item["artifactId"] = item["artifactId"]

    return furniture_item


def create_wall_object_item(item: JsonObject) -> JsonObject:
    wall_object_item = {
        "id": item["id"],
        "name": item["name"],
        "wallId": item["wallId"],
        "movable": item["movable"],
        "position": deepcopy(item["defaultPosition"]),
        "size": deepcopy(item["size"]),
        "normalOffset": item["normalOffset"],
    }

    if isinstance(item.get("artifactId"), str):
        wall_object_item["artifactId"] = item["artifactId"]

    return wall_object_item


def normalize_degrees(value: float) -> float:
    return ((value % 360) + 360) % 360


def snap_degrees(value: float, step: int = 45) -> int:
    return int(normalize_degrees(math.floor(value / step + 0.5) * step))
