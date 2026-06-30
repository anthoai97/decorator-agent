# Implementation Plan: FastAPI API Server Enhancement

## Overview

Migrate the server HTTP layer from `BaseHTTPRequestHandler`/`ThreadingHTTPServer` to FastAPI while preserving the current UI-facing API contract. The work is ordered so each task leaves one complete vertical path working: app startup, state reads, command execution, event streaming, artifact discovery, artifact content, and final smoke compatibility.

## Planning Assumptions

- The migration is behavior-preserving; new API capabilities are out of scope for this plan.
- `/api/agent/runs` remains the current placeholder route.
- CORS remains permissive for local development.
- Runtime `/docs` and `/openapi.json` are enough; generated OpenAPI output will not be committed unless requested.

## Dependency Graph

```text
FastAPI/Uvicorn dependencies
    |
    v
ASGI app factory and server runtime
    |
    +--> Runtime services: SQLiteStore, ArtifactStore, CommandExecutor, EventBroker
    |       |
    |       +--> State endpoint
    |       |
    |       +--> Command endpoints
    |       |       |
    |       |       +--> Event history endpoint
    |       |       |
    |       |       +--> SSE live event stream
    |       |
    |       +--> Artifact search and batch endpoints
    |               |
    |               +--> Artifact metadata and streamed content endpoints
    |
    +--> Shared HTTP behavior: CORS, trusted base URL, error envelope, validation errors
            |
            +--> UI API client compatibility
            |
            +--> Smoke stack and Docker commands
```

## Architecture Decisions

- Keep persistence, command validation, event formatting, artifact metadata conversion, and room rules in the existing domain modules.
- Introduce FastAPI at the HTTP boundary only, with route handlers translating HTTP input/output and delegating business behavior.
- Store runtime services in a small app-owned service container so route dependencies can access one shared store, artifact store, executor, and broker.
- Keep response fields camelCase where the UI already depends on camelCase.
- Replace FastAPI's default validation error body with the existing `{"error": {"code": "...", "message": "..."}}` envelope.
- Prefer FastAPI `StreamingResponse` for SSE and artifact content, preserving current streaming semantics.

## Phase 1: ASGI Foundation

### Task 1: Add FastAPI Runtime Skeleton

**Description:** Add FastAPI/Uvicorn dependencies, create an app factory with runtime service initialization, expose `/health`, and keep `python -m server --host ... --port ...` as the canonical entrypoint.

**Acceptance criteria:**

- [ ] `server/pyproject.toml` includes FastAPI and Uvicorn dependencies, and `server/uv.lock` is updated.
- [ ] `create_app(...)` initializes `SQLiteStore`, seeds artifacts, creates `ArtifactStore`, `CommandExecutor`, and `EventBroker`.
- [ ] `GET /health` returns `{"ok": true}` through FastAPI.
- [ ] `/docs` and `/openapi.json` are available when the server runs.
- [ ] Store resources are closed during app shutdown.

**Verification:**

- [ ] Tests pass for app creation, `/health`, docs availability, seed artifact bootstrapping, and artifact metadata seeding.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`
- [ ] Manual startup succeeds: `cd server && uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787`

**Dependencies:** None

**Files likely touched:**

- `server/pyproject.toml`
- `server/uv.lock`
- `server/src/server/app.py`
- `server/src/server/__main__.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Task 2: Add Shared HTTP Contract Helpers With State Read Path

**Description:** Add the shared FastAPI error, validation, CORS, and base service dependency plumbing, then migrate `GET /api/state` as the first non-trivial route.

**Acceptance criteria:**

- [ ] CORS behavior remains compatible with the local Vite UI.
- [ ] FastAPI validation errors use the existing `VALIDATION_ERROR` envelope.
- [ ] Unknown routes return the existing `NOT_FOUND` envelope.
- [ ] `GET /api/state` returns `state`, `revision`, and `lastEventId` exactly as the UI expects.
- [ ] Route handlers obtain runtime services through a FastAPI dependency rather than global mutable module state.

**Verification:**

- [ ] Tests cover state response shape, validation envelope, unknown route envelope, and CORS preflight behavior.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 1

**Files likely touched:**

- `server/src/server/app.py`
- `server/src/server/api/dependencies.py`
- `server/src/server/api/errors.py`
- `server/src/server/api/routes/state.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Checkpoint: Foundation

- [ ] FastAPI app starts through `python -m server`.
- [ ] `/health`, `/docs`, `/openapi.json`, and `/api/state` work.
- [ ] Existing non-route domain tests still pass.
- [ ] Review with the human before replacing more behavior.

## Phase 2: State Mutation and Events

### Task 3: Migrate Command Routes

**Description:** Migrate `POST /api/commands` and `POST /api/playground/commands` so commands still validate, mutate state, persist command/event rows, return compatibility envelopes, and publish events to live subscribers.

**Acceptance criteria:**

- [ ] `POST /api/commands` returns `{"result": ...}` for accepted commands.
- [ ] Rejected commands return HTTP `422` with both top-level `error` and `result`.
- [ ] `POST /api/playground/commands` returns the compatibility `event` plus `result` for accepted commands.
- [ ] Invalid JSON bodies and non-object request bodies return the current validation envelope.
- [ ] Accepted and rejected commands are persisted through the existing `CommandExecutor` and `SQLiteStore`.

**Verification:**

- [ ] Tests cover accepted furniture movement, wall-object movement, playground command compatibility, rejected command payloads, and unknown POST route behavior.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 2

**Files likely touched:**

- `server/src/server/app.py`
- `server/src/server/api/routes/commands.py`
- `server/src/server/api/schemas.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Task 4: Migrate Event History and SSE Routes

**Description:** Migrate `GET /api/events/history` and `GET /api/events`, preserving replay from persisted events, `Last-Event-ID`, `since`, live command events, heartbeat comments, and subscriber cleanup.

**Acceptance criteria:**

- [ ] `GET /api/events/history?after=N` returns persisted events after `N` and `lastEventId`.
- [ ] Invalid `after`, `since`, and `Last-Event-ID` values return `VALIDATION_ERROR`.
- [ ] `GET /api/events` replays missed events before listening for live events.
- [ ] Live command execution publishes events to connected SSE clients.
- [ ] Disconnects unsubscribe from `EventBroker`.

**Verification:**

- [ ] Tests cover event history filtering, `Last-Event-ID`, live SSE delivery, invalid event ids, and cleanup.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 3

**Files likely touched:**

- `server/src/server/api/routes/events.py`
- `server/src/server/api/dependencies.py`
- `server/src/server/app.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Checkpoint: State and Events

- [ ] `/api/state`, command routes, event history, and SSE routes are all FastAPI-backed.
- [ ] Command side effects still update SQLite and publish live events.
- [ ] UI API contract tests remain green: `cd ui && npm test`

## Phase 3: Artifact API

### Task 5: Migrate Artifact Search and Batch Lookup

**Description:** Migrate `GET /api/artifacts` for both search mode and `ids=` batch mode, including pagination validation, filter aliases, duplicate ID handling, missing IDs, and trusted artifact URL generation.

**Acceptance criteria:**

- [ ] Search supports `kind`, `type`, `objectType`, `placement`, `tag`, `tags`, `q`, `page`, and `pageSize`.
- [ ] Batch lookup supports comma-separated `ids`, deduplicates in order, and returns `missingIds`.
- [ ] `page`, `pageSize`, and over-100 batch IDs return current validation messages/status.
- [ ] Artifact URLs ignore untrusted `Host` headers.
- [ ] `SERVER_PUBLIC_BASE_URL` still overrides generated artifact URLs.

**Verification:**

- [ ] Tests cover seed sofa search, tag search, table metadata seeded in tests, batch found/missing IDs, invalid IDs, max IDs, invalid pagination, hostile host, and configured public base URL.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 2

**Files likely touched:**

- `server/src/server/api/routes/artifacts.py`
- `server/src/server/api/dependencies.py`
- `server/src/server/api/schemas.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Task 6: Migrate Artifact Metadata and Content Streaming

**Description:** Migrate `GET /api/artifacts/{artifactId}` and `GET /api/artifacts/{artifactId}/content`, preserving metadata shape, storage-key inclusion, not-found behavior, path traversal protection, content type, content length, cache header, and chunked file streaming.

**Acceptance criteria:**

- [ ] Metadata route returns `{"artifact": ...}` and includes `storageKey`.
- [ ] Missing artifacts return HTTP `404` with `NOT_FOUND`.
- [ ] Unsafe or missing artifact files return HTTP `404` with `NOT_FOUND`.
- [ ] Content route returns the artifact content type and `Cache-Control: public, max-age=3600`.
- [ ] Content route streams from the file path instead of loading the whole file into memory.

**Verification:**

- [ ] Tests cover metadata, seed GLB content, streaming guard, missing artifact, and path-safety behavior.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 5

**Files likely touched:**

- `server/src/server/api/routes/artifacts.py`
- `server/src/server/api/errors.py`
- `server/src/server/app.py`
- `server/tests/test_app.py`

**Estimated scope:** M

### Checkpoint: Artifact API

- [ ] Artifact search, batch lookup, metadata, and content are all FastAPI-backed.
- [ ] Artifact URLs are stable for local host, hostile host, and configured public base URL cases.
- [ ] Large GLB content is still streamed.
- [ ] UI artifact API tests remain green: `cd ui && npm test`

## Phase 4: Compatibility and Launch Readiness

### Task 7: Migrate Agent Placeholder and Remove HTTP Server Compatibility Shell

**Description:** Migrate `POST /api/agent/runs`, remove obsolete `RequestHandler`/`ThreadingHTTPServer` implementation details, and update tests to use FastAPI-compatible helpers without weakening existing assertions.

**Acceptance criteria:**

- [ ] `POST /api/agent/runs` returns the existing placeholder event shape.
- [ ] No production route depends on `BaseHTTPRequestHandler` or `ThreadingHTTPServer`.
- [ ] Tests no longer import removed HTTP-server-specific types.
- [ ] Existing helper functions that remain public are still behavior-tested.

**Verification:**

- [ ] Tests cover the placeholder route and remaining event factory helpers.
- [ ] Search confirms obsolete HTTP server classes are gone from production code.
- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Tasks 3 and 6

**Files likely touched:**

- `server/src/server/app.py`
- `server/src/server/api/routes/agent.py`
- `server/tests/test_app.py`

**Estimated scope:** S

### Task 8: Verify Tooling, Docker, README, and Smoke Stack

**Description:** Finalize local/Docker startup compatibility and run the full verification suite, updating README or compose/Docker commands only if the canonical startup behavior changed.

**Acceptance criteria:**

- [ ] `python -m server --host 127.0.0.1 --port 8787` starts the FastAPI server.
- [ ] Docker Compose still starts the server and UI with the existing healthcheck.
- [ ] README instructions remain accurate.
- [ ] Full backend tests, UI tests, and smoke tests pass.

**Verification:**

- [ ] Command succeeds: `cd server && uv run --python 3.13 python -m unittest discover -s tests`
- [ ] Command succeeds: `cd ui && npm test`
- [ ] Command succeeds: `cd ui && npm run smoke`
- [ ] Optional Docker check succeeds: `docker compose up --build`

**Dependencies:** Task 7

**Files likely touched:**

- `README.md`
- `compose.yaml`
- `server/Dockerfile`
- `ui/scripts/smoke-stack.mjs`

**Estimated scope:** S

### Checkpoint: Complete

- [ ] All `SPEC.md` success criteria are met.
- [ ] All tests and smoke checks pass.
- [ ] Any spec deviations are documented and approved.
- [ ] Ready for code review.

## Parallelization Opportunities

- Tasks 3 and 5 can be developed in parallel after Task 2 if route registration and shared helpers are stable.
- Task 4 must follow Task 3 because live SSE verification depends on command publishing.
- Task 6 should follow Task 5 because it reuses artifact route helpers and base URL behavior.
- README/Docker verification can be reviewed in parallel with final route cleanup once `python -m server` behavior is stable.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| FastAPI default validation responses differ from current API errors | High | Add custom exception handlers before migrating high-traffic routes and test exact envelopes |
| SSE streaming behaves differently under ASGI than `http.server` | High | Migrate SSE as its own task with replay, live event, heartbeat, and cleanup tests |
| Artifact content accidentally loads large GLB files into memory | Medium | Use a streaming iterator and keep the existing `Path.read_bytes` guard test |
| Trusted host URL generation changes under TestClient/Uvicorn | Medium | Preserve explicit base URL helper tests for hostile host and public base URL |
| Existing tests are too tied to `HTTPConnection` lifecycle | Medium | Replace route tests with FastAPI client helpers while keeping the same assertions |
| Dependency lock update needs network access | Medium | Run `uv` update with approval if sandboxed network access fails |

## Open Questions

- Confirm whether this plan should keep `/api/agent/runs` as a placeholder for this migration.
- Confirm whether CORS should remain permissive.
- Confirm whether runtime OpenAPI docs are sufficient, with no committed generated OpenAPI file.
