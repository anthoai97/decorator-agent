# React R3F Room Composer Refactor Design

## Summary

Refactor the current imperative WebGPU Room Composer into a React, TypeScript, React Three Fiber, and Zustand application. The migration will preserve the current room composer behavior and visual identity while introducing a compact playground shell with a right-side inspector and an inert AI layout assistant placeholder.

The first implementation pass is a focused architecture refactor. It does not add real AI layout generation, persistence, multi-room editing, WebGL fallback, or a redesigned furniture catalog.

## Current Context

The existing app is a Vite demo implemented primarily in `src/main.js`. It uses Three.js WebGPU directly to render a room with draggable furniture, direct pointer manipulation, collision checks, 45-degree rotation, JSON import/export, reset, top view, and a smoke test that verifies desktop and mobile behavior.

The repository also includes a local `room-layout-ai-agent` skill that can arrange exported layout JSON. That workflow remains out of scope for the first refactor except for a visible placeholder in the new playground shell.

## Goals

- Migrate the application to React and TypeScript.
- Render the scene through React Three Fiber while keeping WebGPU-only behavior.
- Use Zustand as the explicit state layer for scene, layout, selection, inspector, and status state.
- Preserve the current room dimensions, furniture objects, default placements, colors, camera feel, import/export schema, collision behavior, and smoke-test expectations.
- Add a compact playground shell: top controls, selected-object status, right inspector, and AI assistant placeholder.
- Support both direct canvas manipulation and precise inspector-driven edits.
- Keep collision, bounds, and layout-schema logic outside React components so it can be tested independently.

## Non-Goals

- Real AI layout generation or model calls.
- WebGL fallback.
- Backend or local-storage persistence.
- New furniture catalog authoring UI.
- Multi-room support.
- Large visual redesign beyond parity and the compact playground shell.
- Replacing the layout schema version.

## Chosen Approach

Use a single-pass R3F rewrite with a data-driven scene.

The existing imperative entry point will be replaced with a React app. Furniture definitions become typed data plus React geometry components. React and Zustand own layout state, while R3F renders the scene from that state. User actions such as dragging, rotating, resetting, importing, exporting, and inspector edits all go through store actions and shared domain functions.

This approach is preferable because the current codebase is small enough that keeping both the imperative Three.js scene and the new R3F scene alive would add unnecessary complexity. A data-driven rewrite also creates the target architecture immediately instead of carrying a bridge layer.

## Architecture

Proposed file structure:

```text
src/
  main.tsx
  App.tsx
  styles.css
  data/
    furnitureCatalog.ts
  domain/
    collision.ts
    layoutSchema.ts
    math.ts
  scene/
    RoomCanvas.tsx
    RoomScene.tsx
    components/
      Bookshelf.tsx
      CoffeeTable.tsx
      FurnitureItem.tsx
      LoungeChair.tsx
      Planter.tsx
      RoomShell.tsx
      SelectionBounds.tsx
      Sofa.tsx
  state/
    useRoomStore.ts
  ui/
    AiPlaceholder.tsx
    InspectorPanel.tsx
    PlaygroundShell.tsx
    Toolbar.tsx
```

Responsibilities:

- `main.tsx`: bootstraps React.
- `App.tsx`: composes the playground shell and room canvas.
- `RoomCanvas.tsx`: owns the R3F `<Canvas>` and WebGPU-only renderer setup.
- `RoomScene.tsx`: owns lights, camera controls, room/furniture rendering, and scene-level event wiring.
- `scene/components/*`: declarative room and furniture geometry components.
- `useRoomStore.ts`: Zustand store for layout state, selection, hover state, camera mode, status messages, and user actions.
- `layoutSchema.ts`: layout schema types, export creation, import normalization, furniture matching, and import validation.
- `collision.ts`: pure collision, footprint, clamp, overlap, rotation, and transform validation helpers.
- `furnitureCatalog.ts`: typed source of default furniture metadata and default transforms.
- `ui/*`: React playground UI components outside the canvas.

The key boundary is that store state is the source of truth for furniture transforms. R3F objects render from that state and send interaction intents back to the store. Domain functions remain pure where practical and do not depend on React.

## State Model

The Zustand store will hold:

- `furniture`: keyed by layout ID, including name, movable flag, position, rotation, size metadata, and current transform.
- `initialFurniture`: immutable defaults used by reset.
- `selectedId`: selected furniture ID or `null`.
- `hoveredId`: hovered furniture ID or `null`.
- `layoutStatus`: temporary status message for import, export, reset, and validation feedback.
- `cameraMode`: `orbit` or `top`.

Primary actions:

- `selectFurniture(id | null)`
- `hoverFurniture(id | null)`
- `moveFurniture(id, nextPosition)`
- `rotateSelected()`
- `setFurnitureTransform(id, transform)`
- `setTransformFromInspector(id, patch)`
- `resetLayout()`
- `createLayoutExport()`
- `importLayout(layout)`
- `setCameraMode(mode)`
- `showLayoutStatus(message)`

All movement and inspector edits use the same validation path:

1. Apply the requested transform to a candidate layout.
2. Clamp the object inside room bounds when possible.
3. Reject transforms that create furniture overlap.
4. Commit the candidate layout only when valid.
5. Show a short status message when an inspector edit is clamped or rejected.

## Scene Design

The scene will recreate the current room:

- Room dimensions: width `9.6`, depth `6.8`, height `2.75`.
- Coordinate system: origin at room center floor, `x` left-right, `y` up, `z` front-back.
- Floor, three walls, baseboards, window, wall art, area rug, and existing materials.
- Furniture: sofa, coffee table, lounge chair, bookshelf, and planter.
- Initial camera position starts at `(5.8, 4.2, 6.4)`, orbit target starts at `(0, 1.05, 0)`, and orbit limits preserve the current interaction feel.
- Top view moves the camera above the room and targets the room center.

Furniture components will keep the current approximate geometry, proportions, materials, and colors. The planter animation can remain a scene component concern as long as it does not mutate source-of-truth layout state.

Selection and hover states will use visual emphasis similar to the current emissive highlight. Selected furniture will show a selection bounds helper.

## WebGPU Policy

The app remains WebGPU-only in this refactor.

`RoomCanvas.tsx` will configure R3F with an async WebGPU renderer. If WebGPU is unavailable or renderer initialization fails, the UI shows a blocking message equivalent to the current app rather than falling back to WebGL.

This keeps the product identity aligned with the existing WebGPU demo and avoids two rendering paths in the first refactor.

## Playground UI

The first React UI pass is a compact shell:

- Top toolbar with app name, selected-object status, rotate, export, import, top view, and reset.
- Right inspector panel that appears or becomes populated when furniture is selected.
- Inspector fields for name, `x`, `z`, and rotation in degrees.
- Numeric inspector edits are validated by the same domain logic as drag and rotate.
- AI layout assistant placeholder that is visible but inactive. It should communicate that layout assistance is planned without invoking any model or changing layout state.

The canvas remains full-screen behind the shell. The shell must fit on desktop and mobile. On viewports at or below `720px`, the inspector becomes a compact bottom panel so it does not cover the top controls.

## Import And Export Contract

The exported layout must preserve schema version `1` and current compatibility:

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

Import behavior:

- Accept full schema objects with `furniture`.
- Accept compact arrays of furniture-like items.
- Accept objects with `objects` as a compatibility alias.
- Match furniture by `id`, `layoutId`, `name`, or `label`, preserving the current tolerance.
- Apply only known furniture transforms.
- Clamp inside room bounds.
- Reject layouts that create overlap.
- Restore the previous layout on failure.
- Report the number of applied objects on success.

Export behavior:

- Include every known furniture item.
- Preserve current IDs generated from names: `sofa`, `coffee-table`, `lounge-chair`, `bookshelf`, and `planter`.
- Include current position, rotation, size, and footprint values rounded consistently with the existing app.

## Interaction Details

Canvas interactions:

- Click furniture to select it.
- Hover furniture to show visual emphasis.
- Drag selected or hovered furniture over the floor plane.
- While dragging, clamp inside room bounds and reject overlaps.
- Release pointer to commit the final valid position.
- Clicking empty canvas clears selection.

Toolbar and inspector interactions:

- Rotate selected furniture by 45 degrees.
- Top view switches the camera to a top-down view.
- Reset restores default transforms.
- Export downloads the current JSON layout.
- Import opens a JSON file picker and applies a valid layout.
- Inspector numeric controls update selected object `x`, `z`, and rotation.

Rotation values remain snapped to the exported `constraints.rotationStepDegrees`, currently `45`.

## Error Handling

- WebGPU unavailable: show a full-screen blocking message.
- Renderer initialization failure: show a full-screen blocking message with a concise failure state.
- Import parse failure: preserve current layout and show `Import failed`.
- Import with no matching furniture: preserve current layout and show `Import failed`.
- Import that causes overlap: restore previous layout and show `Import failed`.
- Inspector move rejected by collision: preserve current value and show a short status message.
- Inspector move clamped by wall bounds: apply the clamped value and show a short status message.

Console warnings may be kept for debugging import errors, but user-facing state should be handled through the shell status area.

## Testing

Required verification:

- `npm run build`
- Updated `npm run smoke` against the React/R3F app

Smoke test expectations:

- Desktop and mobile load a canvas.
- WebGPU message is hidden in supported test environments.
- Canvas screenshot is nonblank and has contrast.
- HUD and inspector shell fit within the viewport.
- Object selection works.
- Rotation changes selected furniture transform.
- Dragging changes position without creating overlap.
- Export returns schema version `1` with all furniture items.
- Importing an exported layout succeeds.
- Importing a forced-overlap layout is rejected and restores previous state.
- Final layout reports no overlap.

Domain unit tests are not required in the first pass, but `collision.ts` and `layoutSchema.ts` should be designed so unit tests can be added with little setup.

## Migration Boundaries

The refactor can replace the current `src/main.js` implementation rather than preserving a compatibility bridge. `index.html` should point to the new React entry. CSS can remain centralized in `src/styles.css` unless the implementation needs small component-specific files.

Existing smoke screenshot artifacts should not be committed unless the project already tracks them intentionally.

The local `skills/room-layout-ai-agent` docs should remain compatible with the exported schema. No changes are required there unless implementation discovers a schema mismatch.

## Acceptance Criteria

- The app runs as a React + TypeScript + React Three Fiber + Zustand project.
- Rendering remains WebGPU-only.
- Existing room and furniture visuals are recreated closely enough for visual parity.
- Users can select, drag, rotate, reset, import, export, and use top view.
- Users can edit selected furniture position and rotation in the inspector.
- Invalid transforms do not create overlapping furniture.
- Import/export remains compatible with the existing schema and sample layout style.
- The compact playground shell and AI placeholder are present.
- `npm run build` passes.
- `npm run smoke` passes on desktop and mobile.
