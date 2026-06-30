# Spec: FastAPI API Server Enhancement

## Assumptions

1. The goal is to enhance the existing Python API server by migrating the HTTP layer from `http.server` to FastAPI, not to rewrite the domain, storage, UI, or artifact system.
2. The primary users are the React/Vite room-decorator UI, local developers running smoke tests, and future agent/API integrations.
3. Existing API paths and response shapes should remain backward compatible unless explicitly approved.
4. SQLite remains the local persistence layer, and existing SQLAlchemy store modules remain the source of truth for state, commands, events, and artifacts.
5. FastAPI is being introduced for typed request/response schemas, clearer validation, OpenAPI docs, simpler route organization, and a better test client.

Correct these assumptions before implementation if any of them are wrong.

## Objective

Replace the hand-written `BaseHTTPRequestHandler` routing in `server/src/server/app.py` with a FastAPI application while preserving the current behavior consumed by `ui/src/api/*` and the smoke stack.

Success means the server is easier to extend, exposes OpenAPI documentation, validates inputs at the API boundary, streams artifact content and SSE events correctly, and still passes the existing Python, TypeScript, and smoke tests.

Core acceptance criteria:

- `GET /health` returns `{"ok": true}`.
- `GET /api/state` returns the current room snapshot with `state`, `revision`, and `lastEventId`.
- `GET /api/artifacts` supports both search mode and `ids=` batch mode with the existing pagination, filtering, and missing-id behavior.
- `GET /api/artifacts/{artifactId}` returns metadata including `storageKey`.
- `GET /api/artifacts/{artifactId}/content` streams the artifact file with the correct content type and cache header.
- `GET /api/events/history?after=N` returns persisted events after the requested event id.
- `GET /api/events?since=N` serves Server-Sent Events and honors `Last-Event-ID`.
- `POST /api/commands`, `POST /api/playground/commands`, and `POST /api/agent/runs` preserve current response envelopes and status codes.
- Validation and not-found errors keep the existing shape: `{"error": {"code": "...", "message": "..."}}`.
- Command rejection responses continue to include both `error` and `result`.
- CORS remains compatible with the local Vite UI.

## Tech Stack

- Python: `>=3.13`, matching `server/pyproject.toml`.
- API framework: FastAPI, added to `server/pyproject.toml` and locked in `server/uv.lock`.
- ASGI server: Uvicorn, used by `python -m server` and optionally by direct local dev commands.
- Validation/schema layer: Pydantic models through FastAPI.
- Persistence: existing SQLAlchemy `>=2.0,<3` and SQLite store modules.
- UI client: existing React/Vite app in `ui/`.
- Tests: existing Python `unittest` suite plus FastAPI `TestClient`-style route tests; existing Vitest and Playwright smoke stack.

## Commands

Server development:

```bash
cd server
uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787
```

Optional direct ASGI development command after the FastAPI app factory exists:

```bash
cd server
uv run --python 3.13 uvicorn server.app:create_app --factory --host 127.0.0.1 --port 8787
```

Python tests:

```bash
cd server
uv run --python 3.13 python -m unittest discover -s tests
```

UI development:

```bash
cd ui
VITE_AGENT_SERVER_URL=http://127.0.0.1:8787 npm run dev
```

UI tests:

```bash
cd ui
npm test
```

Full smoke stack:

```bash
cd ui
npm run smoke
```

Docker stack:

```bash
docker compose up --build
```

There is no dedicated lint command configured today. Do not add one as part of this migration unless approved separately.

## API Contract

Use plural REST nouns and keep the existing routes:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/state` | Current room state snapshot |
| `POST` | `/api/commands` | Execute canonical command |
| `POST` | `/api/playground/commands` | Execute command and return compatibility event |
| `POST` | `/api/agent/runs` | Return current agent placeholder event |
| `GET` | `/api/events/history` | List persisted events after `after` |
| `GET` | `/api/events` | SSE stream after `since` or `Last-Event-ID` |
| `GET` | `/api/artifacts` | Search artifacts or batch fetch by `ids` |
| `GET` | `/api/artifacts/{artifactId}` | Artifact metadata |
| `GET` | `/api/artifacts/{artifactId}/content` | Artifact binary stream |

Error semantics:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "page must be a positive integer"
  }
}
```

Status mapping:

- `200`: successful reads, successful command execution, successful SSE connection.
- `204`: CORS preflight if handled explicitly; FastAPI middleware may handle this.
- `404`: unknown route or missing artifact, with `NOT_FOUND`.
- `422`: invalid request input or rejected command, with `VALIDATION_ERROR`.
- `500`: unexpected server error, without leaking internal details.

FastAPI's default validation error body must be replaced with the existing error envelope so frontend error handling and tests remain stable.

## Project Structure

Current modules to preserve:

```text
server/src/server/artifacts.py       -> artifact metadata conversion and file path safety
server/src/server/artifact_store.py  -> artifact queries and seed metadata
server/src/server/commands.py        -> command validation
server/src/server/db.py              -> SQLAlchemy engine setup
server/src/server/events.py          -> state event and SSE frame helpers
server/src/server/executor.py        -> command execution
server/src/server/schema.py          -> SQLAlchemy tables
server/src/server/state.py           -> default room state
server/src/server/store.py           -> SQLite state, command, and event persistence
```

Recommended FastAPI layout:

```text
server/src/server/app.py              -> create_app(), exception handlers, middleware registration
server/src/server/__main__.py         -> CLI entrypoint that runs Uvicorn
server/src/server/api/__init__.py     -> route package marker
server/src/server/api/dependencies.py -> request-scoped access to store, artifact store, executor, broker
server/src/server/api/schemas.py      -> Pydantic request/response models
server/src/server/api/errors.py       -> APIError helpers and exception handlers
server/src/server/api/routes/health.py
server/src/server/api/routes/state.py
server/src/server/api/routes/commands.py
server/src/server/api/routes/artifacts.py
server/src/server/api/routes/events.py
server/src/server/api/routes/agent.py
```

Test files should stay under `server/tests/`. Route-level FastAPI tests may replace `HTTPConnection` lifecycle tests where that reduces boilerplate, but existing behavior assertions should not be weakened.

## Code Style

Keep Python code explicit, typed, and close to the existing service boundaries. Route handlers validate and translate HTTP concerns; stores and executors keep business behavior.

Example route style:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from server.api.dependencies import ServerServices, get_services
from server.api.schemas import ArtifactSearchResponse
from server.artifacts import artifact_to_metadata

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


@router.get("", response_model=ArtifactSearchResponse)
def search_artifacts(
    kind: str = "",
    objectType: str = "",
    type: str = "",
    placement: str = "",
    tag: str = "",
    q: str = "",
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=24, ge=1, le=100),
    services: ServerServices = Depends(get_services),
) -> ArtifactSearchResponse:
    result = services.artifact_store.search_artifacts(
        kind=kind,
        object_type=objectType or type,
        placement=placement,
        tag=tag,
        query=q,
        page=page,
        page_size=pageSize,
    )

    return ArtifactSearchResponse(
        artifacts=[artifact_to_metadata(artifact, services.base_url) for artifact in result.artifacts],
        pagination={
            "page": result.page,
            "pageSize": result.page_size,
            "totalItems": result.total_items,
            "totalPages": result.total_pages,
        },
    )
```

Conventions:

- Use `from __future__ import annotations` in Python modules.
- Prefer dataclasses or Pydantic models for boundary objects.
- Keep JSON fields camelCase where the UI already expects camelCase.
- Keep Python function and variable names snake_case.
- Keep API routes thin; delegate command execution, persistence, and artifact lookup to existing modules.
- Do not add broad abstractions until route duplication proves it is real.
- Keep comments rare and focused on non-obvious behavior, such as trusted host handling or SSE cleanup.

## Testing Strategy

Server tests:

- Continue using `unittest` unless a separate test-framework change is approved.
- Add FastAPI app-factory tests using a temporary SQLite database and seeded artifact directory.
- Cover each route's status code, response envelope, and important headers.
- Preserve tests for trusted host handling and `SERVER_PUBLIC_BASE_URL`.
- Preserve tests proving artifact content is streamed rather than read all at once.
- Preserve SSE tests for persisted replay, live events, and disconnect cleanup.
- Add tests for custom FastAPI validation error handling to ensure `422` responses match the existing envelope.

UI tests:

- Run existing Vitest tests because the TypeScript API client is the main consumer contract.
- Do not change UI API types unless the backend contract intentionally changes and is approved.

Smoke tests:

- Run `cd ui && npm run smoke` before considering the migration complete.
- The smoke test must start the FastAPI server, Vite UI, interact with the room, post `/api/commands`, and exit cleanly.

Coverage expectations:

- Every existing API route has at least one success test and one relevant failure/validation test.
- Changed behavior needs a test before implementation.
- No existing assertion should be removed unless the spec is updated and approved.

## Boundaries

Always:

- Preserve existing endpoint paths, response field names, and status-code semantics unless the spec is revised first.
- Validate external input at the FastAPI boundary.
- Keep the error envelope consistent across routes.
- Use temporary databases and artifact roots in tests.
- Keep large artifact responses streamed.
- Run server tests, UI tests, and smoke tests before shipping.
- Update `README.md` if the server command or Docker behavior changes.

Ask first:

- Adding authentication, authorization, sessions, or API keys.
- Changing the SQLite schema or adding migrations.
- Changing response shapes consumed by `ui/src/api`.
- Restricting CORS from the current local-development-friendly behavior.
- Replacing `unittest` with pytest.
- Adding a linter/formatter or changing repository-wide style tooling.
- Adding new user-facing endpoints beyond the migration target.

Never:

- Commit secrets, tokens, local credentials, or machine-specific absolute paths.
- Edit `ui/node_modules`, `server/.venv`, generated caches, or vendored dependencies.
- Remove failing tests to make the migration pass.
- Load entire artifact files into memory for normal content responses.
- Trust arbitrary `Host` headers when generating artifact URLs.
- Expose internal stack traces or database details in API error responses.

## Success Criteria

- `server/pyproject.toml` includes FastAPI/Uvicorn dependencies and `server/uv.lock` is updated.
- `python -m server --host 127.0.0.1 --port 8787` starts an ASGI server.
- `/docs` and `/openapi.json` are available in local development.
- All existing backend endpoints behave compatibly with current tests.
- FastAPI validation errors are normalized to the existing `error.code` and `error.message` shape.
- `cd server && uv run --python 3.13 python -m unittest discover -s tests` passes.
- `cd ui && npm test` passes.
- `cd ui && npm run smoke` passes.
- README instructions still work for Docker and local development.

## Open Questions

1. Should the migration be strictly behavior-preserving, or should it also add new API capabilities?
2. Should `/api/agent/runs` remain a placeholder, or should the FastAPI work include a real agent integration contract?
3. Should CORS remain `*` for local development, or should we define an explicit allowed-origin list now?
4. Should generated OpenAPI output be committed as documentation, or is runtime `/docs` enough?
