---
name: room-layout-ai-agent
description: Arrange exported WebGPU Room Composer layout JSON into an importable furniture layout. Use when Codex needs to reposition and rotate room furniture, preserve object IDs, avoid furniture overlap, keep items inside the room, and return valid room-layout JSON for the demo app.
---

# Room Layout Arranger

Use this skill only to arrange a Room Composer export into a valid importable layout. The output should be layout JSON that the app can import.

For exact field details, read [layout-schema.md](references/layout-schema.md).

## Workflow

1. Read the exported layout JSON.
2. Preserve `schemaVersion`, `app`, `units`, `coordinateSystem`, `constraints`, `room`, and every furniture `id`.
3. Modify only furniture placement fields: `position.x`, `position.y`, `position.z`, and `rotation.yDegrees`.
4. Keep every furniture item inside `room.bounds`.
5. Prevent overlap between furniture floor footprints.
6. Prefer practical layouts: keep walkways open, keep coffee tables near seating, put tall storage near walls, keep plants in corners or near windows, and avoid blocking wall decor.
7. Return valid importable JSON.

## Layout Rules

- Use `position.x` and `position.z` for floor placement.
- Keep `position.y` at `0` unless the app adds elevated objects later.
- Use `rotation.yDegrees` for heading around the vertical axis.
- Snap rotations to the exported `constraints.rotationStepDegrees` value, usually `45`.
- Preserve all furniture objects, even when not moving them.
- Preserve unknown fields unless removing them is required to make valid JSON.
- Do not invent new furniture IDs or new furniture objects.

## Collision Guidance

The app validates final layouts, but the agent should avoid obvious invalid arrangements.

- Treat each item as occupying its exported `footprint` on the X/Z floor plane.
- When moving an item, estimate its footprint by translating the exported footprint by the same X/Z delta.
- If rotating an item, use `size.width` and `size.depth` as an approximate rotated footprint.
- Leave a small gap between furniture, especially around seating and tables.
- If uncertain, make conservative moves rather than dense arrangements.

## Output

```json
{
  "schemaVersion": 1,
  "app": "webgpu-room-composer",
  "units": "meters",
  "room": {},
  "furniture": []
}
```

Return JSON only. Do not include prose, comments, or Markdown fences.

## Agent Prompt

```text
You are an interior layout arranger for a WebGPU Room Composer app. Given exported room-layout JSON, return the same JSON schema with arranged furniture positions and rotations. Preserve every furniture id and every object. Keep all objects inside room bounds. Avoid furniture overlap. Use x/z for floor position, keep y at 0, and snap rotation.yDegrees to the exported rotationStepDegrees. Return valid JSON only.
```
