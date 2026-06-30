# Implementation Plan: Server-Owned Artifact System

> **For agentic workers:** implement this plan task-by-task. Do not start generated/uploaded artifacts until the SQLAlchemy artifact metadata checkpoint is complete.

## Overview

Build the artifact system behind `docs/specs/2026-06-30-server-owned-model-assets.md`. The first useful outcome is small: the existing sofa GLB moves out of frontend static assets and is served by the server through artifact metadata and content routes. The foundation also upgrades server persistence to SQLAlchemy Core so later uploaded and generated artifacts have a durable metadata home.

## Reference Inputs

- Spec: `docs/specs/2026-06-30-server-owned-model-assets.md`
- SQL decision: `docs/decisions/ADR-001-server-sqlalchemy-core.md`
- Current state store: `server/src/server/store.py`
- Current HTTP server: `server/src/server/app.py`
- Current sofa renderer: `ui/src/scene/components/Sofa.tsx`
- Current sofa asset: `ui/public/assets/models/sofa-01.glb`

## Scope Check

This plan includes Phase 0 through Phase 3 from the spec:

- SQLAlchemy Core foundation for all existing server SQL.
- Seeded artifact routes for the current sofa.
- SQLAlchemy-backed artifact metadata tables and store.
- Optional room `artifactId` references and batch hydration.

This plan intentionally excludes cloud storage, upload endpoints, generated model registration, a general artifact browser UI, authentication, and signed URLs.

## Architecture Decisions

- Use SQLAlchemy Core 2.x for both the existing command/event/state store and new artifact metadata. Keep the ORM out for now.
- Defer Alembic while local development data remains disposable; schema initialization comes from SQLAlchemy metadata.
- Keep room state persistence and artifact metadata persistence separate, even if they share the same SQLite file.
- Add `ArtifactStore` as a dedicated artifact metadata interface instead of expanding the command/event `SQLiteStore`.
- Serve content through artifact IDs and storage keys, never through frontend static paths or raw filesystem paths.
- Keep the existing bespoke `Sofa` component in the first migration; introduce a reusable `ModelArtifact` only after room items carry artifact IDs.

## Dependency Graph

```text
SQLAlchemy dependency
  -> SQLAlchemy schema metadata
    -> Existing command/event/state store migration
      -> Server app still passes state/SSE tests
        -> Local artifact storage helper and seed bootstrap
          -> Seeded artifact route handlers
            -> UI artifact API helpers
              -> Sofa loads server artifact content
                -> Artifact metadata tables
                  -> ArtifactStore search/batch/content metadata
                    -> Room state artifactId references
                      -> UI batch artifact hydration
```

## Task List

### Phase 0: SQLAlchemy Persistence Foundation

## Task 1: Add SQLAlchemy Dependency

**Description:** Add SQLAlchemy 2.x to the server package and lockfile so the server can import it in tests, Docker, and local `uv run` commands.

**Acceptance criteria:**
- [x] `server/pyproject.toml` declares SQLAlchemy 2.x.
- [x] `server/uv.lock` is updated consistently.
- [x] Existing server test command can import `sqlalchemy`.

**Verification:**
- [x] `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -c "import sqlalchemy; print(sqlalchemy.__version__)"`

**Dependencies:** None

**Files likely touched:**
- `server/pyproject.toml`
- `server/uv.lock`

**Estimated scope:** Small

## Task 2: Define Shared SQLAlchemy Metadata

**Description:** Create the server database module and table definitions for the existing `current_state`, `commands`, and `events` tables.

**Acceptance criteria:**
- [x] `server/src/server/db.py` creates SQLAlchemy engines and transaction helpers.
- [x] `server/src/server/schema.py` defines `current_state`, `commands`, and `events` with SQLAlchemy Core.
- [x] Schema column names and generated IDs remain compatible with current tests.
- [x] SQLite foreign key PRAGMA support is enabled centrally if any table needs it later.

**Verification:**
- [x] New unit test initializes metadata against a temporary SQLite database.

**Dependencies:** Task 1

**Files likely touched:**
- `server/src/server/db.py`
- `server/src/server/schema.py`
- `server/tests/test_store.py`

**Estimated scope:** Small

## Task 3: Migrate Existing Store To SQLAlchemy Core

**Description:** Replace raw `sqlite3` calls in `SQLiteStore` with SQLAlchemy Core queries while preserving the public store API used by the executor and app.

**Acceptance criteria:**
- [x] `SQLiteStore` no longer imports or calls raw `sqlite3`.
- [x] `load_state`, `load_state_snapshot`, command recording, event listing, and `last_event_id` keep the same response shapes.
- [x] Accepted command, rejected command, state upsert, and event inserts remain atomic.
- [x] Tests use temporary databases initialized from SQLAlchemy metadata.

**Verification:**
- [x] `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 2

**Files likely touched:**
- `server/src/server/store.py`
- `server/tests/test_store.py`
- `server/tests/test_app.py`

**Estimated scope:** Medium

### Checkpoint: SQLAlchemy Foundation

- [x] Server tests pass after deleting any local `server/.data/playground.sqlite3`.
- [x] `GET /api/state`, `POST /api/commands`, and SSE/event history behavior is unchanged.
- [x] No artifact feature code has been added before this checkpoint is stable.

### Phase 1: Seeded Sofa Artifact Routes

## Task 4: Move Sofa Seed Into Server-Owned Assets

**Description:** Add a committed server seed copy of the optimized sofa GLB and bootstrap it into ignored runtime artifact storage.

**Acceptance criteria:**
- [x] `server/assets/seeds/models/sofa-01.glb` exists in the working tree and is ready to commit.
- [x] Runtime storage key `models/sofa-01.glb` is copied under `server/.data/artifacts` when missing.
- [x] Bootstrap is idempotent and does not overwrite an existing runtime artifact.
- [x] Frontend static sofa file remains only until the UI migration task is verified.

**Verification:**
- [x] Server artifact bootstrap test proves the runtime file appears in a temporary data directory.

**Dependencies:** Task 3

**Files likely touched:**
- `server/assets/seeds/models/sofa-01.glb`
- `server/src/server/artifacts.py`
- `server/tests/test_artifacts.py`

**Estimated scope:** Medium

## Task 5: Add Code-Seeded Artifact Metadata

**Description:** Model the seeded sofa as artifact metadata before the artifact tables exist.

**Acceptance criteria:**
- [x] `seed-sofa-01` has `kind: "model3d"` and `objectType: "sofa"`.
- [x] Metadata includes display name, placement, content type, storage key, tags, source, created time, and dimensions.
- [x] URL fields are constructed from the request host/server base, not from filesystem paths.
- [x] Unknown artifact IDs return structured `NOT_FOUND` errors.

**Verification:**
- [x] Unit tests cover metadata serialization and unknown ID lookup.

**Dependencies:** Task 4

**Files likely touched:**
- `server/src/server/artifacts.py`
- `server/tests/test_artifacts.py`

**Estimated scope:** Small

## Task 6: Add Artifact HTTP Routes

**Description:** Add search, batch lookup, single metadata lookup, and content-serving routes for the code-seeded sofa.

**Acceptance criteria:**
- [x] `GET /api/artifacts?kind=model3d&type=sofa` returns `seed-sofa-01`.
- [x] `GET /api/artifacts?ids=seed-sofa-01,missing-artifact` returns found artifacts plus `missingIds`.
- [x] Batch lookup preserves first-requested order after de-duplication.
- [x] Empty `ids`, malformed pagination, and over-100 unique IDs return `422`.
- [x] `GET /api/artifacts/seed-sofa-01/content` returns `model/gltf-binary` and rejects path traversal.

**Verification:**
- [x] `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 5

**Files likely touched:**
- `server/src/server/app.py`
- `server/src/server/artifacts.py`
- `server/tests/test_app.py`
- `server/tests/test_artifacts.py`

**Estimated scope:** Medium

## Task 7: Add UI Artifact API Helpers

**Description:** Add frontend helpers for artifact search, batch lookup, and artifact content URLs using the existing `VITE_AGENT_SERVER_URL` convention.

**Acceptance criteria:**
- [x] `searchArtifacts` builds query strings for `kind`, `type`, `objectType`, `placement`, `q`, `page`, and `pageSize`.
- [x] `getArtifactsByIds` calls the batch lookup contract and returns `missingIds`.
- [x] `getArtifactContentUrl("seed-sofa-01")` returns the server content route.
- [x] Missing `VITE_AGENT_SERVER_URL` fails with the same style as existing server API helpers.

**Verification:**
- [x] `cd ui && npm test -- src/api/artifacts.test.ts`

**Dependencies:** Task 6

**Files likely touched:**
- `ui/src/api/artifacts.ts`
- `ui/src/api/artifacts.test.ts`

**Estimated scope:** Small

## Task 8: Load Sofa From Server Artifact URL

**Description:** Update the existing `Sofa` component to load the seeded sofa through the server-provided artifact content URL while keeping transform, meshopt, and interaction bounds unchanged.

**Acceptance criteria:**
- [x] `Sofa` uses `/api/artifacts/seed-sofa-01/content` from hydrated server artifact metadata.
- [x] Sofa scale, rotation, and interaction bounds remain unchanged.
- [x] Missing artifact metadata falls back to the interaction-bounds-only placeholder.
- [x] UI no longer references `/assets/models/sofa-01.glb` at runtime.
- [x] Tests still prove the sofa uses Meshopt and no Draco decoder.

**Verification:**
- [x] `cd ui && npm test -- src/scene/components/Sofa.test.ts src/api/artifacts.test.ts`
- [x] `cd ui && npm run build`

**Dependencies:** Task 7

**Files likely touched:**
- `ui/src/scene/components/Sofa.tsx`
- `ui/src/scene/components/Sofa.test.ts`
- `ui/src/api/artifacts.ts`

**Estimated scope:** Small

### Checkpoint: Server-Owned Seeded Sofa

- [x] Server and UI tests pass.
- [x] Manual run confirms sofa renders with server and UI running.
- [x] Temporarily removing or renaming `ui/public/assets/models/sofa-01.glb` does not break the running UI.
- [x] Docker/compose still has the committed seed source and writable runtime `.data` volume.

### Phase 2: SQLAlchemy Artifact Metadata

## Task 9: Add Artifact Tables To SQLAlchemy Schema

**Description:** Add `artifacts` and `artifact_tags` SQLAlchemy Core table definitions, indexes, and schema initialization.

**Acceptance criteria:**
- [x] `artifacts` table matches the spec columns.
- [x] `artifact_tags` has `(artifact_id, tag)` primary key and cascading artifact FK.
- [x] Indexes for kind/type/placement, source, and tags exist.
- [x] Schema initialization creates artifact tables alongside existing server tables.

**Verification:**
- [x] Tests inspect temporary SQLite schema for required columns and indexes.

**Dependencies:** Task 3

**Files likely touched:**
- `server/src/server/schema.py`
- `server/tests/test_artifacts.py`

**Estimated scope:** Small

## Task 10: Implement ArtifactStore

**Description:** Create a SQLAlchemy-backed `ArtifactStore` for artifact metadata, seed idempotency, search, batch lookup, and single lookup.

**Acceptance criteria:**
- [x] Seeded sofa metadata is inserted or updated idempotently.
- [x] Search supports `kind`, `objectType`, `type`, `placement`, tags, and text query.
- [x] Pagination defaults and max page size match the spec.
- [x] Batch lookup de-dupes IDs, preserves requested order for found rows, and reports missing IDs.
- [x] Artifact metadata queries use SQLAlchemy parameter binding/query construction.

**Verification:**
- [x] Artifact store tests cover seed idempotency, search filters, tag matching, pagination, and batch lookup.

**Dependencies:** Task 9

**Files likely touched:**
- `server/src/server/artifact_store.py`
- `server/src/server/artifacts.py`
- `server/tests/test_artifacts.py`

**Estimated scope:** Medium

## Task 11: Switch Routes From Code Seeds To ArtifactStore

**Description:** Make artifact HTTP routes read metadata from SQLite while continuing to serve files from local artifact storage.

**Acceptance criteria:**
- [x] Search, batch lookup, single metadata, and content routes read artifact metadata from `ArtifactStore`.
- [x] Code-seeded metadata remains only as seed input, not the runtime query source.
- [x] Content serving still rejects path traversal and unknown storage keys.
- [x] Generated/uploaded artifact creation now has a persistent metadata destination, though creation endpoints are still out of scope.

**Verification:**
- [x] `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m unittest discover -s tests`

**Dependencies:** Task 10

**Files likely touched:**
- `server/src/server/app.py`
- `server/src/server/artifacts.py`
- `server/src/server/artifact_store.py`
- `server/tests/test_app.py`

**Estimated scope:** Medium

### Checkpoint: Persistent Artifact Metadata

- [x] Seeded sofa survives server restart as SQLite metadata.
- [x] Phase 1 API contract still works exactly from the UI perspective.
- [x] This checkpoint is complete before model-processing-service registration, uploads, or generated artifact writes begin.

### Phase 3: Room Artifact References

## Task 12: Add Optional Artifact IDs To Initial Room State

**Description:** Add optional `artifactId` fields to room state data while preserving backward compatibility for stored layouts that do not have artifact references.

**Acceptance criteria:**
- [x] Initial sofa state includes `artifactId: "seed-sofa-01"`.
- [x] Reconciliation keeps `artifactId` from default catalog when legacy stored furniture lacks it.
- [x] Existing stored furniture without `artifactId` continues to load.
- [x] Layout export/import treats `artifactId` as optional.

**Verification:**
- [x] Server state/store tests cover legacy state reconciliation with and without `artifactId`.
- [x] UI layout schema tests cover optional artifact IDs.

**Dependencies:** Task 11

**Files likely touched:**
- `server/src/server/state.py`
- `server/src/server/store.py`
- `server/tests/test_store.py`
- `ui/src/domain/types.ts`
- `ui/src/domain/layoutSchema.test.ts`

**Estimated scope:** Medium

## Task 13: Add UI Room Artifact ID Collection

**Description:** Add frontend logic that collects unique artifact IDs from the room state for batch metadata hydration.

**Acceptance criteria:**
- [x] Helper collects artifact IDs from furniture and wall objects when present.
- [x] Duplicate artifact IDs are returned once.
- [x] Missing or empty artifact IDs are ignored.
- [x] Tests cover mixed legacy and artifact-backed room items.

**Verification:**
- [x] `cd ui && npm test -- src/domain/artifacts.test.ts`

**Dependencies:** Task 12

**Files likely touched:**
- `ui/src/domain/artifacts.ts`
- `ui/src/domain/artifacts.test.ts`
- `ui/src/domain/types.ts`

**Estimated scope:** Small

## Task 14: Hydrate Artifact Metadata For Placed Room Items

**Description:** Fetch artifact metadata once for the current room state and keep it in a UI-side cache separate from room placement state.

**Acceptance criteria:**
- [x] UI calls `getArtifactsByIds` once per changed set of placed artifact IDs.
- [x] Missing artifacts do not make room items disappear or become unselectable.
- [x] Artifact metadata is stored separately from room state.
- [x] Existing local-only mode still works when no server URL is configured.

**Verification:**
- [x] UI tests cover successful hydration, missing IDs, and server URL unset fallback.
- [x] `cd ui && npm test`

**Dependencies:** Task 13

**Files likely touched:**
- `ui/src/state/useRoomStore.ts`
- `ui/src/state/useRoomStore.test.ts`
- `ui/src/api/artifacts.ts`
- `ui/src/App.tsx`

**Estimated scope:** Medium

## Task 15: Add Reusable ModelArtifact Renderer

**Description:** Introduce a reusable renderer for `model3d` artifacts after room items can carry artifact IDs and metadata can be hydrated.

**Acceptance criteria:**
- [x] `ModelArtifact` renders any `model3d` artifact URL with Meshopt enabled by default.
- [x] Sofa can either keep its bespoke transform wrapper or delegate its GLB primitive to `ModelArtifact`.
- [x] Missing artifact metadata falls back to the existing interaction-bounds placeholder behavior.
- [x] Selection, dragging, rotation, and sofa interaction bounds remain unchanged.

**Verification:**
- [x] `cd ui && npm test`
- [x] `cd ui && npm run build`
- [x] Manual runtime check confirms sofa renders, selects, drags, and rotates.

**Dependencies:** Task 14

**Files likely touched:**
- `ui/src/scene/components/ModelArtifact.tsx`
- `ui/src/scene/components/Sofa.tsx`
- `ui/src/scene/components/Sofa.test.ts`
- `ui/src/scene/components/FurnitureItem.tsx`

**Estimated scope:** Medium

### Checkpoint: Room Artifact References

- [x] Room state can represent artifact-backed and legacy items together.
- [x] UI can batch-hydrate artifact metadata for all placed room items.
- [x] Existing interaction behavior remains unchanged.
- [x] The app is ready for a future artifact browser or processing-service registration slice.

## Final Verification

- [x] `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m unittest discover -s tests`
- [x] `cd ui && npm test`
- [x] `cd ui && npm run build`
- [x] Run server and UI together with `VITE_AGENT_SERVER_URL=http://127.0.0.1:8787`.
- [x] Confirm `GET /api/artifacts?kind=model3d&type=sofa` returns `seed-sofa-01`.
- [x] Confirm `GET /api/artifacts?ids=seed-sofa-01` returns `missingIds: []`.
- [x] Confirm the sofa loads from `GET /api/artifacts/seed-sofa-01/content`.
- [x] Confirm the UI does not need `ui/public/assets/models/sofa-01.glb` at runtime.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| SQLAlchemy migration changes command/event behavior | High | Keep `SQLiteStore` public methods unchanged and run the full server test suite before adding artifact routes. |
| Runtime artifact files are missing in Docker or clean checkout | High | Commit seed source under `server/assets/seeds` and test idempotent bootstrap into `.data/artifacts`. |
| Frontend breaks when `VITE_AGENT_SERVER_URL` is unset | Medium | Preserve current local fallback behavior and make artifact helpers fail only when actually used. |
| Batch lookup semantics drift from room hydration needs | Medium | Test duplicate IDs, first-requested order, all-missing requests, empty IDs, and max batch size. |
| Artifact metadata and room placement become coupled | Medium | Keep `ArtifactStore` separate from room state store; room state stores only optional `artifactId`. |
| Cloud migration leaks into this slice | Low | Keep a storage-key abstraction and avoid cloud SDKs or signed URLs until a later spec. |

## Open Questions

- Should Phase 1 delete `ui/public/assets/models/sofa-01.glb` immediately after verification, or keep it for one transition commit?
- Should `wallpaper` enter the catalog first as `kind: "material"` only, or should source wallpaper images also be searchable as `kind: "image"`?
- Do we want the first artifact metadata table to include `byte_size` and `checksum` now, or wait for `artifact_files` when raw/source/optimized variants become first-class?
