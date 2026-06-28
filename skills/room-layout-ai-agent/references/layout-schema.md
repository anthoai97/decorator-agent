# Room Layout JSON Schema Reference

Use this reference when arranging Room Composer layout files.

## Top-Level Shape

```json
{
  "schemaVersion": 1,
  "app": "webgpu-room-composer",
  "units": "meters",
  "coordinateSystem": {
    "origin": "room-center-floor",
    "x": "left-right",
    "y": "up",
    "z": "front-back"
  },
  "constraints": {
    "keepInsideRoom": true,
    "preventFurnitureOverlap": true,
    "rotationStepDegrees": 45
  },
  "room": {
    "width": 9.6,
    "depth": 6.8,
    "height": 2.75,
    "bounds": {
      "minX": -4.8,
      "maxX": 4.8,
      "minZ": -3.4,
      "maxZ": 3.4
    }
  },
  "furniture": []
}
```

## Furniture Item Shape

```json
{
  "id": "coffee-table",
  "name": "Coffee table",
  "movable": true,
  "position": {
    "x": 0.55,
    "y": 0,
    "z": 0.25
  },
  "rotation": {
    "yDegrees": 0
  },
  "size": {
    "width": 1.35,
    "height": 0.65,
    "depth": 0.82
  },
  "footprint": {
    "minX": -0.085,
    "maxX": 1.185,
    "minZ": -0.12,
    "maxZ": 0.62
  }
}
```

## Fields The Agent May Change

- `furniture[].position.x`
- `furniture[].position.z`
- `furniture[].position.y`, usually keep at `0`
- `furniture[].rotation.yDegrees`

## Fields To Preserve

- `schemaVersion`
- `app`
- `units`
- `coordinateSystem`
- `constraints`
- `room`
- `furniture[].id`
- `furniture[].name`
- `furniture[].movable`
- `furniture[].size`

`footprint` may be left as exported or updated if the agent can compute it. The app recomputes geometry footprints internally after import.

## Coordinate Rules

- `x = 0`, `z = 0` is the room center.
- `x` must stay between `room.bounds.minX` and `room.bounds.maxX`.
- `z` must stay between `room.bounds.minZ` and `room.bounds.maxZ`.
- Furniture has physical size, so do not place object centers exactly on the wall bounds unless the item is very small.
- `rotation.yDegrees` rotates around the vertical axis.

## Practical Layout Heuristics

- Put sofas and chairs in conversation distance.
- Keep the coffee table near seating but not intersecting it.
- Put bookshelves near walls.
- Put plants in corners or near windows.
- Keep a central walking area open.
- Avoid placing tall objects in front of windows or wall art.

## Compact AI Response Example

The importer also accepts a compact response if every item has a matching `id` or `name`:

```json
{
  "furniture": [
    {
      "id": "sofa",
      "position": { "x": -1.8, "y": 0, "z": -1.8 },
      "rotation": { "yDegrees": 0 }
    },
    {
      "id": "coffee-table",
      "position": { "x": -1.1, "y": 0, "z": -0.65 },
      "rotation": { "yDegrees": 0 }
    }
  ]
}
```

Prefer full-schema responses for importable layouts and compact responses only for internal agent calls.
