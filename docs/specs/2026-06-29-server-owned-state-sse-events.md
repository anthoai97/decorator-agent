# Spec: Server-Owned State and SSE Events

## Objective
Move committed playground state ownership from the React UI to the Python server. The frontend becomes a command sender and state subscriber. The server validates commands, applies room/objective mutations, persists command and event history, and streams state updates to connected clients over Server-Sent Events (SSE).

This enables an agent-focused application where manual user actions and future Agent SDK tool calls use the same server-side command pipeline.

## Assumptions
1. The app remains a local web application with a Python server and Vite UI.
2. Python stays dependency-light: standard library HTTP/SSE plus `sqlite3` for persistence.
3. Server-connected mode is authoritative: the UI does not commit room/objective state locally when `VITE_AGENT_SERVER_URL` is configured.
4. The existing local-only UI mode can remain as a fallback for development and smoke tests when no server URL is configured.
5. Multi-user conflict resolution is out of scope for this slice; commands are applied sequentially in server receipt order.
6. High-frequency pointer movement is not sent through the server. The UI may render local draft movement during drag, but only committed changes are sent to the server.

## Tech Stack
- Server: Python 3.13, standard library HTTP server, `sqlite3` persistence.
- Package management: Conda environment `server`; Python package execution through `uv`.
- UI: Vite React app in `ui/`, Zustand as the local projection/cache of server state.
- Transport:
  - HTTP JSON for commands and state snapshots.
  - SSE for live event delivery and replay after reconnect.

## Commands
- Server tests: `cd server && conda run -n server uv run --python 3.13 python -m unittest discover -s tests`
- Server dev: `cd server && conda run -n server uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787`
- UI dev with server: `cd ui && VITE_AGENT_SERVER_URL=http://127.0.0.1:8787 npm run dev`
- UI tests: `cd ui && npm test`
- UI build: `cd ui && npm run build`
- UI smoke: `cd ui && npm run smoke`

## Project Structure
```text
server/
  src/server/
    app.py              # HTTP routes and SSE transport
    commands.py         # Command validation and execution
    events.py           # Event creation, SSE formatting, subscriber fanout
    state.py            # Server-owned playground state model and mutations
    store.py            # SQLite persistence for state, commands, and events
  tests/
    test_commands.py
    test_events.py
    test_store.py
    test_app.py

ui/
  src/api/
    serverEvents.ts     # command, snapshot, SSE clients
  src/state/
    useRoomStore.ts     # local projection of server-owned state
  src/ui/
    Toolbar.tsx
    AiAssistantStub.tsx
```

## API Contract

### State Snapshot
`GET /api/state`

```json
{
  "state": {
    "revision": 4,
    "room": { "width": 9.6, "depth": 6.8, "height": 2.75 },
    "furniture": {},
    "objectives": []
  },
  "lastEventId": 12
}
```

### Command Submission
`POST /api/commands`

```json
{
  "source": "user",
  "type": "SET_FURNITURE_ROTATION",
  "payload": {
    "furnitureId": "sofa",
    "rotationYDegrees": 45
  }
}
```

Response:

```json
{
  "accepted": true,
  "state": { "revision": 5 },
  "events": [
    {
      "id": 13,
      "type": "state.patch",
      "revision": 5,
      "data": {
        "furniture": {
          "sofa": {
            "rotation": { "yDegrees": 45 }
          }
        }
      }
    }
  ]
}
```

`POST /api/playground/commands` may remain as a compatibility alias during the transition, but new code should use `POST /api/commands`.

### SSE Stream
`GET /api/events?since=<eventId>`

The server first replays persisted events with `id > since`, then keeps the connection open for live events.

```text
id: 13
event: state.patch
data: {"id":13,"type":"state.patch","revision":5,"data":{"furniture":{"sofa":{"rotation":{"yDegrees":45}}}}}

event: heartbeat
data: {"type":"heartbeat"}
```

The stream also honors the `Last-Event-ID` header when present.

### History
`GET /api/commands?after=<commandId>`

Returns persisted command history for replay/debugging.

`GET /api/events/history?after=<eventId>`

Returns persisted event history without opening an SSE connection.

## Event Types
- `state.snapshot` — full server-owned state, used on initial load or resync.
- `state.patch` — partial state update after a successful command.
- `command.accepted` — command persisted and applied.
- `command.rejected` — validation or business rule failure.
- `agent.run.started` — future Agent SDK run started.
- `agent.run.not_configured` — current placeholder response until Agent SDK is wired.
- `heartbeat` — SSE keepalive.

## Performance Model
SSE is used for committed state synchronization, not as a realtime 3D/game transport. The server should not receive a command for every pointer move, and the UI should not wait for a server roundtrip to render draft drag movement.

### Interaction Rules
- Dragging furniture:
  - UI may update a local draft transform on pointer move for smooth rendering.
  - UI sends one committed command on pointer release, for example `SET_FURNITURE_POSITION`.
  - Server validates/clamps/rejects the final placement and emits a patch.
  - UI reconciles its draft state with the authoritative server patch.
- Rotation/reset/objective operations:
  - Send commands immediately because they are discrete low-frequency actions.
- Agent operations:
  - Agent tools use the same server command executor and emit the same patch events.

### Patch Rules
- Prefer `state.patch` events over full snapshots for normal updates.
- Patches must include only changed objects/fields.
- Full `state.snapshot` events are reserved for initial load, reconnect resync, or periodic compaction.
- Server may batch multiple changes from one command into a single patch event.
- Event history should support compaction by retaining periodic snapshots plus later patches.

Example position patch:

```json
{
  "id": 21,
  "type": "state.patch",
  "revision": 9,
  "data": {
    "furniture": {
      "chair-17": {
        "position": { "x": 2.1, "z": -0.4 }
      }
    }
  }
}
```

### Many-Object Guardrails
- Collision checks should not remain all-pairs (`O(n^2)`) once object counts grow beyond small-room scale.
- Start with the simple all-pairs implementation for parity with the current UI, but isolate collision detection behind a function/module so it can be replaced with a spatial grid later.
- The UI should apply patches by object id and avoid replacing the full furniture map for single-object updates where practical.
- Rendering optimization for large rooms should be handled on the frontend with shared geometries/materials, instancing for repeated furniture, and avoiding unnecessary React re-renders.

### Non-Goals For This Slice
- WebSocket realtime multiplayer.
- Server-authoritative per-frame dragging.
- 60 FPS network simulation.
- Multi-client collaborative cursors.

## State Model
Server state contains:
- `revision`: monotonic integer incremented after each accepted mutation.
- `furniture`: map keyed by furniture id, using the same shape the UI currently renders.
- `objectives`: list of server-generated objective records.
- `updatedAt`: ISO timestamp for diagnostics.

The server ports the room constraint rules currently enforced in `ui/src/domain/collision.ts`:
- keep furniture inside room bounds,
- snap rotation to 45-degree increments,
- reject overlapping furniture.

## Code Style
Command execution should separate validation, mutation, persistence, and broadcasting:

```python
def execute_command(store: Store, command: Command) -> CommandResult:
    validated = validate_command(command)
    state = store.load_state()
    next_state, patch = apply_command(state, validated)
    saved = store.commit(validated, next_state, patch)
    return saved
```

UI code should not mutate committed room state directly in server-connected mode:

```ts
await sendCommand({
  source: 'user',
  type: 'SET_FURNITURE_ROTATION',
  payload: { furnitureId, rotationYDegrees },
});
```

## Testing Strategy
- Server unit tests:
  - command validation,
  - state mutation and collision rejection,
  - SQLite persistence and replay,
  - SSE formatting and replay ordering.
- Server integration tests:
  - `GET /api/state`,
  - `POST /api/commands`,
  - `GET /api/events/history`,
  - route-level validation/error semantics.
- UI tests:
  - command client posts the new contract,
  - event client applies snapshots and patches,
  - server-connected toolbar actions do not mutate state locally before server event application.
  - drag/draft tests verify pointer movement can remain local until commit.
- Browser smoke:
  - default local mode remains clean,
  - server-connected smoke should be added once SSE client is wired.

## Boundaries
- Always:
  - Server validates all commands at the boundary.
  - Server is authoritative for committed state when connected.
  - Every persisted event has a monotonic id and revision where applicable.
  - SSE reconnect can replay missed events.
  - High-frequency pointer movement stays local until commit.
  - SSE events send patches for normal updates instead of full snapshots.
- Ask first:
  - Adding external web framework dependencies.
  - Replacing SQLite with another persistence layer.
  - Removing local-only UI fallback.
  - Adding auth/multi-user semantics.
- Never:
  - Let Agent SDK tools mutate UI state directly.
  - Trust client-provided state as authoritative.
  - Drop command/event history silently.
  - Store secrets or API keys in frontend code.
  - Send one network command per drag frame.

## Success Criteria
- Server owns current room/objective state in server-connected mode.
- Manual UI commands and future agent commands enter the same server command executor.
- SSE clients receive live events without polling.
- Reconnecting clients can replay missed events from persisted history.
- Command history is persisted and queryable.
- UI applies server patches to update the playground.
- Dragging remains smooth because draft movement is local and only final committed movement is server-authoritative.
- Patch events remain bounded to changed objects/fields for normal operations.
- Server tests, UI tests, UI build, and smoke verification pass.

## Open Questions
- Should the SQLite database live at `server/data/playground.sqlite3` by default, or under a configurable env var only?
- Should local-only UI fallback remain permanently, or only until server mode is stable?
- What object count should trigger replacing all-pairs collision checks with a spatial index?
- Should drag preview show a "pending server validation" state after pointer release?
