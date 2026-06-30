# Todo: FastAPI API Server Enhancement

## Planning Assumptions To Confirm

- [ ] Behavior-preserving migration only; no new API capabilities in this pass.
- [ ] `/api/agent/runs` remains a placeholder.
- [ ] CORS remains permissive for local development.
- [ ] Runtime `/docs` and `/openapi.json` are enough; no generated OpenAPI artifact is committed.

## Phase 1: ASGI Foundation

- [x] Task 1: Add FastAPI runtime skeleton
  - Acceptance: dependencies/lock updated, `create_app(...)` initializes runtime services, `/health` works, docs are available, shutdown closes store.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: none

- [x] Task 2: Adopt pytest runner and shared fixtures
  - Acceptance: pytest dependency/lock updated, `cd server && uv run --python 3.13 pytest` runs the full backend suite, shared pytest fixtures exist where useful, and new FastAPI route tests use pytest patterns.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 1

- [x] Task 3: Add shared HTTP contract helpers with state read path
  - Acceptance: CORS compatible, validation/not-found envelopes preserved, `/api/state` response unchanged, routes use FastAPI dependencies.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 2

- [x] Checkpoint: Foundation review
  - Verify: `python -m server` starts, `/health`, `/docs`, `/openapi.json`, and `/api/state` work.

## Phase 2: State Mutation and Events

- [x] Task 4: Migrate command routes
  - Acceptance: `/api/commands` and `/api/playground/commands` preserve accepted/rejected envelopes and persist command/event rows.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 3

- [x] Task 5: Migrate event history and SSE routes
  - Acceptance: event history, `since`, `Last-Event-ID`, live SSE delivery, heartbeat, and unsubscribe cleanup are preserved.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 4

- [x] Checkpoint: State and events review
  - Verify: `cd ui && npm test`

## Phase 3: Artifact API

- [x] Task 6: Migrate artifact search and batch lookup
  - Acceptance: filters, pagination, `ids`, `missingIds`, trusted host handling, and `SERVER_PUBLIC_BASE_URL` behavior are preserved.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 3

- [x] Task 7: Migrate artifact metadata and content streaming
  - Acceptance: metadata includes `storageKey`, missing artifacts return `NOT_FOUND`, content headers are preserved, and GLB responses stream.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Task 6

- [ ] Checkpoint: Artifact API review
  - Verify: `cd ui && npm test`

## Phase 4: Compatibility and Launch Readiness

- [ ] Task 8: Migrate agent placeholder and remove HTTP server compatibility shell
  - Acceptance: `/api/agent/runs` placeholder works, obsolete `http.server` production code is removed, tests use FastAPI-compatible helpers.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Dependencies: Tasks 4 and 7

- [ ] Task 9: Verify tooling, Docker, README, and smoke stack
  - Acceptance: local server command, Docker Compose, README, backend tests, UI tests, and smoke stack all align with FastAPI.
  - Verify: `cd server && uv run --python 3.13 pytest`
  - Verify: `cd ui && npm test`
  - Verify: `cd ui && npm run smoke`
  - Dependencies: Task 8

- [ ] Checkpoint: Complete review
  - Verify: all `SPEC.md` success criteria are met and any deviations are approved.
