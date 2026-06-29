# Spec: Python Server Playground Events

## Objective
Add a small Python server package managed by `uv` so the playground UI can call server-side command endpoints and receive typed event responses. This is the first backend slice for an agent-focused application, but real Agent SDK setup is intentionally deferred behind a placeholder route.

Success means a user can trigger existing playground actions from the UI, the UI sends a command to the server, and the server responds with an event that the UI can display or apply.

## Tech Stack
- Server: Python 3.13+ standard library HTTP server, no runtime dependencies for this slice.
- Package management: Conda environment from `server/environment.yml`; Python package execution through `uv` with `server/pyproject.toml`.
- UI: existing Vite React app in `ui/`.
- Agent: not implemented in this slice; `/api/agent/runs` returns a typed "not configured yet" event.

## Commands
- Server env create: `conda env create -f server/environment.yml`
- Server tests: `cd server && conda run -n server uv run --python 3.13 python -m unittest discover -s tests`
- Server dev: `cd server && conda run -n server uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787`
- UI dev with server bridge: `cd ui && VITE_AGENT_SERVER_URL=http://127.0.0.1:8787 npm run dev`
- UI test: `cd ui && npm test`
- UI build: `cd ui && npm run build`

## Project Structure
```text
server/
  .python-version
  environment.yml
  pyproject.toml
  src/server/
    __init__.py
    __main__.py
    app.py
  tests/
    test_app.py

ui/
  src/api/serverEvents.ts
  src/ui/Toolbar.tsx
  src/ui/AiAssistantStub.tsx
```

## Code Style
Server handlers should keep transport parsing separate from event creation:

```python
def create_playground_event(command: dict[str, object]) -> dict[str, object]:
    return {
        "type": "playground.command.accepted",
        "message": "Server accepted playground command",
        "command": command,
    }
```

UI code should call server helpers and keep local state mutation in the existing Zustand store.

## Testing Strategy
- Server unit tests use `unittest` and call pure event helpers plus request handling through an in-process server.
- UI verification uses existing Vitest tests and Vite production build.
- Browser smoke is optional for this slice because the visual behavior is unchanged.

## Boundaries
- Always: keep the agent route as a placeholder, validate JSON at the server boundary, preserve existing local playground behavior.
- Ask first: adding OpenAI/Agent SDK dependencies, adding persistence, switching to SSE/WebSockets, changing the room state model.
- Never: expose OpenAI API keys in the browser, make frontend code import Python/server internals, remove existing collision validation.

## Success Criteria
- `server` is runnable with `conda run -n server uv run --python 3.13 python -m server`.
- `POST /api/playground/commands` returns a typed event for accepted playground commands.
- `POST /api/agent/runs` returns a typed placeholder event.
- Toolbar rotate/reset actions notify the server and still update the playground.
- Assistant placeholder button calls the server placeholder route and shows returned status.
- Server tests, UI tests, and UI build pass.

## Open Questions
- Should server become authoritative for room state in the next slice, or should it remain an event coordinator while the UI owns transient layout state?
- Should agent events stream over SSE once the real Agent SDK is added?

# Implementation Plan

## Task 1: Server Foundation
- Acceptance: Python package and routes exist; CORS/OPTIONS supported for Vite.
- Verify: `cd server && conda run -n server uv run --python 3.13 python -m unittest discover -s tests`.
- Files: `server/.python-version`, `server/environment.yml`, `server/pyproject.toml`, `server/src/server/*`, `server/tests/test_app.py`.

## Task 2: UI Event Client
- Acceptance: UI can call playground command and agent placeholder endpoints.
- Verify: `cd ui && npm test`.
- Files: `ui/src/api/serverEvents.ts`.

## Task 3: Wire Existing UI Actions
- Acceptance: rotate/reset call server and apply returned status; assistant placeholder button calls server placeholder.
- Verify: `cd ui && npm test`, `cd ui && npm run build`.
- Files: `ui/src/ui/Toolbar.tsx`, `ui/src/ui/AiAssistantStub.tsx`.
