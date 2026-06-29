# Spec and Implementation Plan: Movable Wall Objects and Universal Drag Measurements

## Objective

Enhance the React/R3F room composer so every movable object type shows live distance measurements while being dragged. Existing floor furniture should show distances to the room walls on the floor plane, while the back-wall window and wall image should become first-class movable wall-mounted objects that show distances inside their wall plane.

Success means existing floor-furniture movement, collision, persistence, and server behavior remain intact while gaining transient drag measurements, and wall-mounted objects gain their own constrained wall-plane movement model with the same measurement lifecycle.

## Assumptions

1. The window and wall image stay mounted to their current wall, initially the back wall.
2. Dragging moves wall objects horizontally along the wall and vertically on the wall. It does not move them onto the floor or across to another wall.
3. Floor furniture measurements show room-wall gaps on the floor plane: left, right, front, and back, in meters.
4. Wall object measurements show wall-local gaps: left, right, top, and bottom, in meters.
5. Measurements are visual-only transient UI. They are derived during drag and are not persisted.
6. Wall object positions should persist in Zustand and the server bridge, and should reset with the rest of the room.
7. Layout export keeps the existing `furniture` shape compatible and adds wall objects as a backward-compatible optional extension.
8. All movable existing furniture, including the non-blocking rug, should show drag measurements.

## Tech Stack

- UI: Vite, React, TypeScript, React Three Fiber, Drei, Three.js WebGPU, Zustand, Vitest, Playwright smoke tests.
- Server: Python 3.13, SQLite-backed state store, unittest.
- Units: meters, matching the existing room coordinate system.

## Commands

Run UI checks from the repo root:

```bash
cd ui && npm run test
cd ui && npm run build
cd ui && npm run dev
cd ui && npm run smoke
```

Run server checks from the repo root:

```bash
cd server && uv run python -m unittest discover -s tests
```

## Project Structure

Relevant existing files:

```text
ui/src/domain/types.ts
ui/src/domain/layoutSchema.ts
ui/src/state/useRoomStore.ts
ui/src/scene/RoomScene.tsx
ui/src/scene/components/RoomShell.tsx
ui/src/scene/interactions/useFurnitureDrag.ts
ui/src/api/serverEvents.ts
server/src/server/state.py
server/src/server/commands.py
server/src/server/events.py
server/src/server/executor.py
server/src/server/store.py
```

Planned new files:

```text
ui/src/data/wallObjectCatalog.ts
ui/src/domain/dragMeasurements.ts
ui/src/domain/dragMeasurements.test.ts
ui/src/domain/wallObjectPlacement.ts
ui/src/domain/wallObjectPlacement.test.ts
ui/src/scene/components/DragMeasurements.tsx
ui/src/scene/components/WallArt.tsx
ui/src/scene/components/WallObjectItem.tsx
ui/src/scene/components/WallObjectsLayer.tsx
ui/src/scene/components/WallWindow.tsx
ui/src/scene/interactions/useWallObjectDrag.ts
ui/src/scene/interactions/useWallObjectDrag.test.ts
```

## Code Style

Use explicit wall-local domain names rather than overloading floor-furniture concepts:

```ts
export type WallObjectId = 'window' | 'wall-art';

export interface WallObjectLayoutItem {
  id: WallObjectId;
  name: string;
  wallId: RoomWallId;
  movable: boolean;
  position: {
    u: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
    depth: number;
  };
}
```

For a back or front wall, `u` maps to world `x`. For a left or right wall, `u` maps to world `z`. `y` is always wall height from the floor.

Use a shared measurement model for all dragged objects rather than a wall-object-only component:

```ts
export type DragMeasurementTarget =
  | { type: 'furniture'; id: FurnitureId }
  | { type: 'wallObject'; id: WallObjectId };
```

Floor furniture measurement math should read the existing furniture footprint and room bounds. Wall object measurement math should read the wall-local object size and wall bounds.

## Testing Strategy

- Unit-test measurement math separately from React:
  - floor-furniture distance values to left, right, front, and back room walls
  - wall-object distance values to left, right, top, and bottom wall boundaries
  - shared rounding and label formatting
- Unit-test wall-local placement math separately from React:
  - clamping inside wall bounds
  - world transform conversion for each wall
- Unit-test drag commit creation and no-op suppression for furniture and wall objects.
- Extend Zustand tests for wall object reset, server hydration, event patches, and layout export/import.
- Extend server tests for `MOVE_WALL_OBJECT` validation, command execution, patch event shape, reset, and store reconciliation.
- Extend smoke tests to drag an existing furniture object and a wall object and assert:
  - the measurement overlay exists during drag
  - the overlay is removed after mouse up
  - the floor furniture position still changes and persists as before
  - the wall object position changes
  - furniture and wall-object drag/selection both work

## Boundaries

- Always:
  - Keep existing furniture movement, collision, import/export, and server commands working.
  - Render drag measurements for every movable object type, not just wall-mounted objects.
  - Clamp wall objects so no edge can leave the visible wall interior.
  - Disable OrbitControls while dragging any object.
  - Hide all drag measurements on pointer up, pointer cancel, and lost pointer capture.
  - Preserve WebGPU-only rendering behavior.
- Ask first:
  - Changing layout `schemaVersion` from `1` to `2`.
  - Adding new runtime dependencies beyond existing React/R3F/Drei/Three/Zustand.
  - Adding inspector editing for wall objects.
  - Allowing wall objects to move between walls.
- Never:
  - Treat wall objects as floor furniture for collision.
  - Persist transient measurement overlay state to the server.
  - Leave measurements visible after drag ends.
  - Implement measurements only for the new wall object scope while existing movable furniture lacks them.
  - Refactor unrelated furniture/catalog code while implementing this feature.

## Success Criteria

- Users can drag the window within the back wall.
- Users can drag the wall image within the back wall.
- Users can drag existing floor furniture and see room-wall distance measurements during movement.
- Dragged wall objects remain attached to the wall plane and clamp before crossing wall edges, floor, or ceiling.
- During floor-furniture drag, measurement guides and meter labels show left, right, front, and back room-wall distances.
- During wall-object drag, measurement guides and meter labels show wall-local left, right, top, and bottom distances.
- Measurements disappear for every object type on mouse up, pointer cancel, and lost pointer capture.
- Moving a wall object commits a `MOVE_WALL_OBJECT` command when the server bridge is configured.
- Server snapshots and SSE patches hydrate wall object changes into the UI.
- Reset restores wall objects to their default positions.
- Layout export preserves the current `furniture` array and includes optional wall object layout data.
- Existing furniture tests, build, and smoke coverage still pass.

## Open Questions

- Should the inspector support numeric `u` and `y` editing for wall objects in the first implementation? This plan assumes no.
- Should floor-furniture measurements show all four room-wall gaps or only nearest-edge gaps? This plan assumes all four.
- Should wall-object measurements show all four wall-local gaps or only nearest-edge gaps? This plan assumes all four.
- Should wall object movement be allowed across different walls later? This plan assumes no for the first implementation.
- Should the public layout schema move to `schemaVersion: 2`? This plan assumes no until explicitly approved.

## Architecture Decisions

- Model wall-mounted objects separately from furniture. Floor furniture uses world `x/z`, rotation, footprints, and overlap rules. Wall objects use wall-local `u/y`, wall bounds, and no floor collision.
- Store wall object positions in wall-local coordinates. This keeps clamping and measurement calculations simple and makes the same domain code work for all four walls.
- Render wall details from state, not hard-coded meshes in `RoomShell`. `RoomShell` should own wall/floor geometry; `WallObjectsLayer` should own window/art rendering.
- Use the same visible-wall filtering as room walls. If a wall is hidden by `openWallIds`, its mounted objects should also be hidden so they do not float without their wall.
- Derive measurements from the actively dragged object, regardless of type. The active drag reference should be a discriminated union of furniture and wall object ids; the distances themselves are computed from current layout every render.
- Keep measurement math shared and domain-level. Floor furniture measurements use existing footprint and room bounds; wall object measurements use wall-local size and wall bounds.
- Add a backward-compatible export extension: keep `schemaVersion: 1` and existing `furniture` unchanged, and add an optional `wallObjects` array. Imports without `wallObjects` continue to work.

## Dependency Graph

```text
Wall object domain types/catalog
  -> wall-local clamp and transform math
    -> Zustand wall object state and layout import/export
      -> server command validation/execution/events
        -> React wall object rendering
          -> wall-plane drag interaction

Shared drag measurement math
  -> existing furniture drag measurement state
  -> wall object drag measurement state
    -> shared measurement overlay
      -> smoke coverage for furniture and wall objects
```

## Task List

### Phase 1: Foundation

## Task 1: Add Wall Object Types, Catalog, Placement Math, and Shared Measurement Math

**Description:** Introduce wall-mounted object domain types, default window/art catalog data, pure helpers for wall-local clamping and world transforms, and shared measurement helpers for both existing floor furniture and wall objects.

**Acceptance criteria:**
- [ ] `window` and `wall-art` have default back-wall positions matching the existing visual placement in `RoomShell`.
- [ ] Wall objects clamp inside wall width/height with their full rendered size accounted for.
- [ ] Furniture measurement helper returns left, right, front, and back room-wall gaps from an existing furniture footprint.
- [ ] Wall object measurement helper returns left, right, top, and bottom wall-local gaps.
- [ ] Measurement helpers round values to the same precision style as existing layout math.

**Verification:**
- [ ] Tests pass: `cd ui && npm run test -- wallObjectPlacement`
- [ ] Tests pass: `cd ui && npm run test -- dragMeasurements`
- [ ] Full UI tests pass: `cd ui && npm run test`

**Dependencies:** None.

**Files likely touched:**
- `ui/src/domain/types.ts`
- `ui/src/data/wallObjectCatalog.ts`
- `ui/src/domain/dragMeasurements.ts`
- `ui/src/domain/dragMeasurements.test.ts`
- `ui/src/domain/wallObjectPlacement.ts`
- `ui/src/domain/wallObjectPlacement.test.ts`

**Estimated scope:** Medium, 6 files.

## Task 2: Extend Zustand State and Layout Import/Export

**Description:** Add wall object layout state to the room store, including move/reset/hydration/event patch behavior and a backward-compatible layout export/import extension.

**Acceptance criteria:**
- [ ] Store initializes `wallObjects` from the wall object catalog.
- [ ] `moveWallObject(id, position)` clamps wall-local `u/y` and updates state.
- [ ] Reset restores wall objects along with furniture.
- [ ] Server snapshots and patches can hydrate `wallObjects`.
- [ ] Export includes optional `wallObjects` without changing the existing `furniture` array shape.
- [ ] Imports with no `wallObjects` still work exactly as before.
- [ ] Any store-level active drag measurement state can represent both furniture and wall object targets.

**Verification:**
- [ ] Tests pass: `cd ui && npm run test -- useRoomStore`
- [ ] Tests pass: `cd ui && npm run test -- layoutSchema`
- [ ] Full UI tests pass: `cd ui && npm run test`

**Dependencies:** Task 1.

**Files likely touched:**
- `ui/src/state/useRoomStore.ts`
- `ui/src/state/useRoomStore.test.ts`
- `ui/src/domain/layoutSchema.ts`
- `ui/src/domain/layoutSchema.test.ts`
- `ui/src/api/serverEvents.ts`

**Estimated scope:** Medium, 5 files.

### Checkpoint: UI State Foundation

- [ ] Task 1 and Task 2 tests pass.
- [ ] Existing furniture import/export tests still pass.
- [ ] Existing furniture drag behavior is ready for shared measurement rendering.
- [ ] No rendering behavior has changed yet.
- [ ] Human review before server and scene work.

### Phase 2: Server Sync

## Task 3: Add Server Support for Wall Object State and Move Commands

**Description:** Extend the Python server state model, validation, command executor, event patching, and store reconciliation to support wall object movement.

**Acceptance criteria:**
- [ ] Initial server state includes `wallObjects` matching UI defaults.
- [ ] `MOVE_WALL_OBJECT` validates known wall object ids and finite wall-local `u/y` coordinates.
- [ ] Valid wall object moves increment revision, persist state, and emit `room.state.patch` with only the changed wall object.
- [ ] Invalid wall object moves are rejected without mutating state.
- [ ] Reset restores wall objects and preserves objectives.
- [ ] Stored states missing `wallObjects` reconcile to defaults.

**Verification:**
- [ ] Server tests pass: `cd server && uv run python -m unittest discover -s tests`

**Dependencies:** Task 1 and Task 2.

**Files likely touched:**
- `server/src/server/state.py`
- `server/src/server/commands.py`
- `server/src/server/events.py`
- `server/src/server/executor.py`
- `server/src/server/store.py`
- `server/src/server/room_rules.py`
- `server/tests/test_state.py`
- `server/tests/test_commands.py`
- `server/tests/test_events.py`
- `server/tests/test_executor.py`
- `server/tests/test_store.py`

**Estimated scope:** Large. Break into two commits if needed: model/validation first, executor/events/store second.

### Checkpoint: State Sync

- [ ] UI tests pass.
- [ ] Server tests pass.
- [ ] A manual `/api/state` snapshot includes `wallObjects`.
- [ ] Existing `MOVE_FURNITURE` behavior is unchanged.

### Phase 3: Scene Rendering

## Task 4: Render Wall Objects from State

**Description:** Extract the hard-coded window and wall image meshes out of `RoomShell` and render them through state-driven wall object components.

**Acceptance criteria:**
- [ ] `RoomShell` renders only floor/walls and no longer hard-codes window/art meshes.
- [ ] `WallObjectsLayer` renders the window and wall image from `wallObjects`.
- [ ] Wall objects hide when their wall is in `openWallIds`.
- [ ] Rendered window and wall image visually match the current scene before dragging is added.
- [ ] Hover/selection emphasis does not interfere with floor furniture emphasis.

**Verification:**
- [ ] Build succeeds: `cd ui && npm run build`
- [ ] Tests pass: `cd ui && npm run test`
- [ ] Manual check: open the room and confirm the window/art appear on the back wall in the same approximate locations as before.

**Dependencies:** Task 2.

**Files likely touched:**
- `ui/src/scene/components/RoomShell.tsx`
- `ui/src/scene/components/WallObjectsLayer.tsx`
- `ui/src/scene/components/WallObjectItem.tsx`
- `ui/src/scene/components/WallWindow.tsx`
- `ui/src/scene/components/WallArt.tsx`
- `ui/src/scene/RoomScene.tsx`

**Estimated scope:** Medium. If this grows past 5 files, split visual components into a follow-up styling task.

## Task 5: Add Wall-Plane Dragging and Shared Active Drag State

**Description:** Implement wall object pointer drag behavior using wall-plane ray intersections, pointer capture, OrbitControls disabling, local store updates, and server move commits. Update the existing furniture drag flow to publish the same active drag measurement lifecycle used by wall objects.

**Acceptance criteria:**
- [ ] Left mouse drag moves `window` along the back wall plane.
- [ ] Left mouse drag moves `wall-art` along the back wall plane.
- [ ] Dragging clamps at wall boundaries instead of letting objects leave the wall.
- [ ] OrbitControls are disabled during furniture and wall object drags and restored afterward.
- [ ] No server command is sent when the pointer does not move the wall object.
- [ ] A moved wall object sends `MOVE_WALL_OBJECT` with `{ wallObjectId, position: { u, y } }`.
- [ ] Existing furniture drag sets active measurement target to `{ type: 'furniture', id }` while dragging.
- [ ] Wall object drag sets active measurement target to `{ type: 'wallObject', id }` while dragging.
- [ ] Pointer up, cancel, and lost capture all end the drag session and clear the active measurement target.

**Verification:**
- [ ] Tests pass: `cd ui && npm run test -- useWallObjectDrag`
- [ ] Tests pass: `cd ui && npm run test -- useFurnitureDrag`
- [ ] Full UI tests pass: `cd ui && npm run test`
- [ ] Manual check: drag window/art and floor furniture and verify all movement still works.

**Dependencies:** Task 3 and Task 4.

**Files likely touched:**
- `ui/src/scene/interactions/useWallObjectDrag.ts`
- `ui/src/scene/interactions/useWallObjectDrag.test.ts`
- `ui/src/scene/interactions/useFurnitureDrag.ts`
- `ui/src/scene/interactions/useFurnitureDrag.test.ts`
- `ui/src/scene/components/WallObjectItem.tsx`
- `ui/src/scene/RoomScene.tsx`
- `ui/src/api/serverEvents.ts`

**Estimated scope:** Medium, 7 files.

### Phase 4: Measurements and Verification

## Task 6: Render Live Measurements During Any Object Drag

**Description:** Add transient measurement guides and labels for the active drag target, covering both existing floor furniture and new wall-mounted objects.

**Acceptance criteria:**
- [ ] Measurements render only while a furniture or wall object drag session is active.
- [ ] Floor-furniture labels show left, right, front, and back room-wall gaps in meters.
- [ ] Wall-object labels show left, right, top, and bottom wall-local gaps in meters.
- [ ] Floor measurement guide lines sit slightly above the floor plane to avoid z-fighting.
- [ ] Wall measurement guide lines sit slightly in front of the wall to avoid z-fighting.
- [ ] Measurements disappear immediately on pointer up.
- [ ] Measurements also disappear on pointer cancel and lost pointer capture.
- [ ] Measurement UI is legible against the existing floor and wall colors and does not dominate the scene.

**Verification:**
- [ ] Tests pass: `cd ui && npm run test -- dragMeasurements`
- [ ] Tests pass: `cd ui && npm run test -- wallObjectPlacement`
- [ ] Build succeeds: `cd ui && npm run build`
- [ ] Manual check at desktop and mobile widths: measurement labels do not overlap the toolbar or inspector in an incoherent way.

**Dependencies:** Task 5.

**Files likely touched:**
- `ui/src/scene/components/DragMeasurements.tsx`
- `ui/src/scene/interactions/useFurnitureDrag.ts`
- `ui/src/scene/interactions/useWallObjectDrag.ts`
- `ui/src/scene/components/WallObjectItem.tsx`
- `ui/src/scene/components/WallObjectsLayer.tsx`
- `ui/src/state/useRoomStore.ts`
- `ui/src/domain/dragMeasurements.ts`
- `ui/src/domain/wallObjectPlacement.ts`

**Estimated scope:** Large. Break into a furniture-measurement slice and a wall-object-measurement slice if this grows past one focused session.

## Task 7: Add Smoke Coverage for All Drag Measurements

**Description:** Extend browser smoke coverage to exercise measurement behavior for both existing floor furniture and new wall object interactions end-to-end.

**Acceptance criteria:**
- [ ] Smoke test can select and drag an existing furniture object reliably.
- [ ] Smoke test can select and drag the wall image or window reliably.
- [ ] Smoke test observes a measurement overlay during furniture pointer movement.
- [ ] Smoke test observes a measurement overlay during wall object pointer movement.
- [ ] Smoke test confirms the overlay is absent after each mouse up.
- [ ] Smoke test confirms the furniture position changed in debug/export state.
- [ ] Smoke test confirms the wall object position changed in debug/export state.
- [ ] Canvas rendering, server command posting, and responsive fit assertions still pass.

**Verification:**
- [ ] Start dev server: `cd ui && npm run dev`
- [ ] Smoke passes: `cd ui && npm run smoke`
- [ ] Full UI verification passes: `cd ui && npm run test && npm run build`
- [ ] Server tests pass: `cd server && uv run python -m unittest discover -s tests`

**Dependencies:** Task 6.

**Files likely touched:**
- `ui/scripts/smoke.mjs`
- `ui/src/App.tsx`
- `ui/src/domain/layoutSchema.test.ts`
- `ui/src/state/useRoomStore.test.ts`

**Estimated scope:** Small to Medium, 1-4 files.

### Checkpoint: Complete

- [ ] All success criteria are met.
- [ ] `cd ui && npm run test` passes.
- [ ] `cd ui && npm run build` passes.
- [ ] `cd ui && npm run smoke` passes.
- [ ] `cd server && uv run python -m unittest discover -s tests` passes.
- [ ] No drag measurement remains visible after drag end for either object type.
- [ ] No regressions in floor furniture drag, rotate, import, export, reset, or server sync.
- [ ] Human review completed before merge.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Object drag math conflicts with OrbitControls | High | Disable controls during every object drag and restore on all drag end paths. |
| Measurements z-fight with the floor or wall | Medium | Offset floor guides upward and wall guides along the wall normal. |
| Hidden walls leave floating mounted objects | Medium | Filter wall objects with the same `openWallIds` used for wall panels. |
| Export compatibility breaks existing schema users | High | Keep `schemaVersion: 1`, preserve `furniture`, and add optional `wallObjects`; ask before a schema version bump. |
| SQLite store has old snapshots without wall objects | Medium | Reconcile missing `wallObjects` to catalog defaults on load. |
| Measurement scope regresses to wall objects only | High | Add unit and smoke coverage for existing floor furniture measurements before considering the feature complete. |
| Smoke click coordinates become brittle | Medium | Use debug/export state to derive furniture and wall object screen positions where possible. |

## Review Gate

Do not begin implementation until this spec and task plan are reviewed. In particular, confirm the assumptions about same-wall movement, measurement labels for both floor furniture and wall objects, server persistence, and export schema compatibility.
