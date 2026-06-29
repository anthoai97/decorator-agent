# Implementation Plan: Server-Owned State and SSE Events

## Overview
Build the next slice around a server-owned state model. The server becomes the source of truth for committed room and objective state, persists command/event history in SQLite, and streams updates to the UI over SSE. The UI sends commands and applies server snapshots/patches.

## Architecture Decisions
- Use Python standard library + `sqlite3` first. This keeps the current dependency-light server and avoids committing to a web framework before the contract stabilizes.
- Use `POST /api/commands` as the canonical command endpoint. Keep `/api/playground/commands` as a temporary compatibility alias.
- Use monotonic integer event ids from SQLite for replay. SSE uses those ids as the SSE `id` field.
- Use server state `revision` for state consistency. Every accepted mutation increments the revision.
- Keep local-only UI mode as fallback when `VITE_AGENT_SERVER_URL` is unset; server-connected mode is authoritative.
- Use local draft transforms for high-frequency drag movement. Only final committed transforms are sent to the server.
- Use SSE for committed patches, not per-frame realtime interaction.
- Keep collision detection isolated so simple all-pairs checks can later be replaced with a spatial grid if object counts grow.
- Patch normal updates by object id; reserve full snapshots for initial load, reconnect resync, and history compaction.

## Dependency Graph
```text
Server state model and command schemas
  -> Server command executor
    -> Server state patch generation
    -> SQLite persistence
      -> Event log and replay
        -> HTTP command/state endpoints
          -> SSE live stream
            -> UI API client
              -> Zustand server-state projection
                -> Toolbar/assistant/manual actions
```

## Task List

### Phase 1: Server State Foundation

## Task 1: Define Server State and Command Models
**Description:** Add Python data/model helpers for room state, furniture state, objectives, commands, events, and command validation.

**Acceptance criteria:**
- [x] Server has a typed-ish internal state shape matching the UI render needs.
- [x] Command validation covers furniture rotation/move/reset and objective create/delete.
- [x] Invalid payloads produce stable `VALIDATION_ERROR` messages.

**Verification:**
- [x] `cd server && conda run -n server uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** None
**Files likely touched:** `server/src/server/state.py`, `server/src/server/commands.py`, `server/tests/test_commands.py`
**Estimated scope:** Medium

## Task 2: Port Room Mutation Rules to Server
**Description:** Port enough room logic from `ui/src/domain/collision.ts` for the server to apply transform commands authoritatively.

**Acceptance criteria:**
- [x] Server clamps furniture inside room bounds.
- [x] Server snaps rotation to 45-degree increments.
- [x] Server rejects overlapping furniture.
- [x] Collision logic is isolated behind a function/module that can later be optimized with a spatial grid.
- [x] Tests cover accepted, clamped, rejected, and reset cases.

**Verification:**
- [x] Server command/state tests pass.

**Dependencies:** Task 1
**Files likely touched:** `server/src/server/state.py`, `server/tests/test_commands.py`
**Estimated scope:** Medium

## Task 2.5: Define Patch Generation Rules
**Description:** Add server-side helpers that produce bounded state patches for accepted commands instead of returning full snapshots for every update.

**Acceptance criteria:**
- [x] Single-object rotation/move commands emit patches for only that object.
- [x] Reset may emit either a full snapshot or a bounded multi-object patch; behavior is explicit and tested.
- [x] Objective create/delete emits objective-only patches.
- [x] Patch events include revision and can be applied idempotently by the UI.

**Verification:**
- [x] Patch generation tests pass.

**Dependencies:** Tasks 1-2
**Files likely touched:** `server/src/server/state.py`, `server/src/server/events.py`, `server/tests/test_events.py`
**Estimated scope:** Small

### Checkpoint: State Foundation
- [x] Server state tests pass.
- [x] Existing UI tests/build still pass.
- [x] Review state contract before persistence work.

### Phase 2: Persistence and Replay

## Task 3: Add SQLite Store
**Description:** Persist current state, commands, and events with standard-library `sqlite3`.

**Acceptance criteria:**
- [x] Store initializes schema automatically.
- [x] Accepted commands and generated events are persisted atomically.
- [x] Server can restore latest state after restart.
- [x] Tests use temporary SQLite files.

**Verification:**
- [x] `cd server && conda run -n server uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Tasks 1-2.5
**Files likely touched:** `server/src/server/store.py`, `server/tests/test_store.py`, `server/.gitignore`
**Estimated scope:** Medium

## Task 4: Implement Command Executor
**Description:** Add a single command execution path used by manual UI actions and future agent tools.

**Acceptance criteria:**
- [x] `execute_command` validates, applies, persists, and returns generated events.
- [x] Rejected commands are persisted as rejected command events without mutating state.
- [x] Command results include current revision and event ids.
- [x] Accepted commands produce patch events, not full snapshots, unless the command explicitly requires a snapshot.

**Verification:**
- [x] Command executor tests pass.

**Dependencies:** Task 3
**Files likely touched:** `server/src/server/commands.py`, `server/src/server/events.py`, `server/tests/test_commands.py`
**Estimated scope:** Medium

### Checkpoint: Persistence
- [x] Restart restore behavior is tested.
- [x] Command/event history is queryable in tests.
- [x] Review persistence format before UI integration.

### Phase 3: HTTP and SSE APIs

## Task 5: Add State and Command HTTP Endpoints
**Description:** Replace echo-only command behavior with server-owned state responses.

**Acceptance criteria:**
- [x] `GET /api/state` returns snapshot, revision, and last event id.
- [x] `POST /api/commands` executes commands through the command executor.
- [x] `/api/playground/commands` remains as a compatibility alias.
- [x] Error responses keep the existing `{ error: { code, message } }` shape.

**Verification:**
- [x] Route-level tests pass.

**Dependencies:** Task 4
**Files likely touched:** `server/src/server/app.py`, `server/tests/test_app.py`
**Estimated scope:** Medium

## Task 6: Add Event History and SSE Stream
**Description:** Implement persisted event replay plus live SSE fanout for connected clients.

**Acceptance criteria:**
- [x] `GET /api/events/history?after=<id>` returns persisted events.
- [x] `GET /api/events?since=<id>` replays missed events then stays open.
- [x] `Last-Event-ID` is honored when `since` is absent.
- [x] SSE heartbeats keep idle streams alive.
- [x] New command events broadcast to connected streams.
- [ ] Replay can start from a compacted snapshot plus later patches if a requested event id is older than retained history.

**Verification:**
- [x] SSE formatting and replay tests pass.
- [x] Manual curl check shows event frames.

**Dependencies:** Task 5
**Files likely touched:** `server/src/server/app.py`, `server/src/server/events.py`, `server/tests/test_events.py`, `server/tests/test_app.py`
**Estimated scope:** Medium

### Checkpoint: Server API Complete
- [x] Server tests pass.
- [x] `python -m server --help` still works.
- [x] Manual command request creates persisted event and stream receives it.

### Phase 4: UI Server-State Integration

## Task 7: Expand UI Server API Client
**Description:** Add snapshot fetch, canonical command posting, event history fetch, and EventSource connection helpers.

**Acceptance criteria:**
- [x] UI can fetch `GET /api/state`.
- [x] UI can post `POST /api/commands`.
- [x] UI can connect to `GET /api/events`.
- [x] UI tests cover server URL unset, command failure, and event parsing.

**Verification:**
- [x] `cd ui && npm test`

**Dependencies:** Task 6
**Files likely touched:** `ui/src/api/serverEvents.ts`, `ui/src/api/serverEvents.test.ts`
**Estimated scope:** Small

## Task 8: Add Server-State Projection to Zustand
**Description:** Add store actions that hydrate snapshots and apply server patches while preserving local-only fallback behavior.

**Acceptance criteria:**
- [x] Store can hydrate from server snapshot.
- [x] Store can apply furniture/objective patches.
- [ ] In server-connected mode, committed transform actions wait for server patches.
- [x] Patch application updates only changed state branches where practical.
- [x] Tests cover snapshot hydrate and patch application.

**Verification:**
- [x] `cd ui && npm test`

**Dependencies:** Task 7
**Files likely touched:** `ui/src/state/useRoomStore.ts`, `ui/src/state/useRoomStore.test.ts`, `ui/src/domain/types.ts`
**Estimated scope:** Medium

## Task 9: Wire UI Runtime to SSE
**Description:** Connect the app shell to initial state fetch and SSE event stream when `VITE_AGENT_SERVER_URL` is configured.

**Acceptance criteria:**
- [x] App fetches initial server state on load in server-connected mode.
- [x] App opens SSE stream and applies live state events.
- [x] Reconnect uses last seen event id.
- [x] Disconnected/server-unavailable states are visible without breaking local mode.

**Verification:**
- [x] `cd ui && npm test`
- [x] `cd ui && npm run build`

**Dependencies:** Task 8
**Files likely touched:** `ui/src/App.tsx`, `ui/src/api/serverEvents.ts`, `ui/src/state/useRoomStore.ts`
**Estimated scope:** Medium

## Task 10: Convert Manual Actions to Server Commands
**Description:** Make toolbar/inspector committed actions send server commands in server-connected mode and rely on returned/SSE patches for state updates.

**Acceptance criteria:**
- [x] Rotate/reset use `POST /api/commands` in server-connected mode.
- [x] Inspector transforms use server commands on commit.
- [x] Drag movement remains local draft state during pointer move and sends one commit command on pointer release.
- [x] No network request is sent for every drag frame.
- [ ] Local-only fallback still works when no server URL is configured.
- [ ] No direct committed state mutation happens before server acceptance in server-connected mode.

**Verification:**
- [x] `cd ui && npm test`
- [x] `cd ui && npm run build`

**Dependencies:** Task 9
**Files likely touched:** `ui/src/ui/Toolbar.tsx`, `ui/src/ui/InspectorPanel.tsx`, `ui/src/scene/interactions/useFurnitureDrag.ts`, `ui/src/state/useRoomStore.ts`
**Estimated scope:** Medium

## Task 10.5: Add Performance Guard Tests For Drag Commit
**Description:** Guard the intended performance behavior so future changes do not accidentally send commands for every pointer move.

**Acceptance criteria:**
- [ ] Tests prove drag preview can update locally without calling the server command client.
- [ ] Tests prove exactly one server command is sent for a completed drag commit.
- [ ] Tests cover server rejection reconciliation back to authoritative state.

**Verification:**
- [ ] `cd ui && npm test`

**Dependencies:** Task 10
**Files likely touched:** `ui/src/scene/interactions/useFurnitureDrag.ts`, `ui/src/state/useRoomStore.test.ts`, `ui/src/api/serverEvents.test.ts`
**Estimated scope:** Medium

### Checkpoint: UI Integration
- [x] Server and UI tests pass.
- [x] UI build passes.
- [x] Manual run shows command -> SSE event -> UI patch.

### Phase 5: End-to-End Verification

## Task 11: Add Server-Connected Smoke Path
**Description:** Add or extend smoke verification to run with the Python server and validate server-owned updates.

**Acceptance criteria:**
- [ ] Smoke can start/connect to server mode or document required server startup.
- [ ] Rotate action is reflected through server event application.
- [ ] Browser console remains free of errors.
- [ ] Existing local-mode smoke remains valid.
- [ ] Smoke verifies drag/rotate does not create browser console errors in server-connected mode.

**Verification:**
- [ ] Server tests pass.
- [ ] UI tests pass.
- [ ] UI build passes.
- [ ] Smoke passes in local mode and server-connected mode.

**Dependencies:** Task 10.5
**Files likely touched:** `ui/scripts/smoke.mjs`, `docs/specs/2026-06-29-server-owned-state-sse-events.md`
**Estimated scope:** Medium

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---:|---|
| SSE tests are flaky because streaming is long-lived | Medium | Separate pure SSE formatting tests from one small in-process integration test with timeouts |
| Duplicating TS collision logic in Python diverges | High | Port behavior with fixture-based tests using the same numeric cases as UI tests |
| UI feels laggy if every drag movement roundtrips to server | Medium | Commit final drag state first; treat intermediate drag as local draft only |
| Many objects make collision checks slow | Medium | Keep collision behind an isolated module; start simple, add spatial grid when object counts justify it |
| Large snapshots make SSE expensive | Medium | Send object-level patches for normal updates; compact history with periodic snapshots |
| React/Zustand updates re-render too much | Medium | Apply patches by id and avoid replacing broad state branches unnecessarily |
| SQLite writes block SSE fanout | Low | Keep state small; write before broadcast; broadcast outside transaction |
| Reconnect duplicates events | Medium | Track last event id and make patch application idempotent by revision |

## Parallelization Opportunities
- Server state/persistence tests can be written alongside UI API client tests after the API contract is accepted.
- UI projection work should wait for the event and patch contract.
- Smoke work should wait until server and UI integration are both stable.

## Open Questions
- What expected max object count should we optimize for first: 50, 500, or 5,000?
- Should server-connected smoke become the default smoke path once stable?
- Should objective UI be added now, or should objective commands remain API-only until Agent SDK work begins?
