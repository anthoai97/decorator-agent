# Spec: Server-Owned Artifact System

## Objective

Create a server-owned artifact library for room-design assets. Artifacts include 3D model objects such as sofas, tables, chairs, lamps, beds, and bookshelves, plus surface or image artifacts such as wallpaper, wall art, rugs, and future generated textures.

The immediate migration target is still the current sofa GLB, which is served today from `ui/public/assets/models/sofa-01.glb`. The broader goal is to make the frontend consume artifact metadata and artifact content URLs from the server so generated models, uploaded assets, seeded demo assets, and later cloud-hosted files all enter the app through one contract.

Success means users and agents can search artifacts by object type, kind, and text query, then place compatible artifacts into the room. The renderer should not know whether an artifact came from frontend static files, server local storage, generated image-to-3D output, or future cloud object storage.

## Assumptions

1. Local development uses filesystem-backed artifact storage under `server/.data/artifacts`.
2. Cloud storage is out of scope for this slice, but the API shape must not expose local paths.
3. The existing optimized sofa GLB remains the first seeded model artifact.
4. Image-to-3D generation is covered by separate specs; this spec defines the app-side artifact library it writes into later.
5. The frontend still needs `VITE_AGENT_SERVER_URL` to resolve server-hosted artifact URLs.
6. Server SQL access uses SQLAlchemy Core. During development, `server/.data/playground.sqlite3` is disposable and may be deleted while the schema is refactored.

## Artifact Taxonomy

Artifacts are described with both a technical `kind` and a semantic `objectType`.

```text
kind
  model3d        # GLB/GLTF model loaded into the 3D scene
  image          # source image, wall art image, thumbnail, inspiration image
  material       # wallpaper, fabric, floor material, generated texture

objectType
  sofa
  table
  chair
  bed
  bookshelf
  cabinet
  lamp
  rug
  wallpaper
  wall-art
  window
  decor
  plant
  unknown
```

`objectType` is intentionally extensible. The UI can start with a known option list, but the server should not require code changes for every future generated type.

Artifacts may also include:

- `placement`: `floor`, `wall`, `ceiling`, `surface`, or `reference`.
- `tags`: free-form searchable labels such as `modern`, `wood`, `fabric`, `round`, `japanese`.
- `dimensionsMeters`: physical dimensions when known.
- `thumbnailUrl`: preview image for browsing.
- `source`: `seeded`, `uploaded`, `generated`, or `external`.

## Tech Stack

- Server: Python 3.13, standard library HTTP server.
- Server SQL: SQLAlchemy Core 2.x for all server SQL access, including existing command/event/state persistence and new artifact metadata.
- UI: Vite, React, TypeScript, React Three Fiber, Drei `useGLTF`.
- Artifact formats:
  - `.glb` served as `model/gltf-binary`.
  - `.png`, `.jpg`, `.webp` served with matching image content types.
- Storage adapter: local filesystem first, cloud-object-compatible interface later.
- Metadata persistence: code-seeded metadata for Phase 1; SQLAlchemy Core-backed SQLite metadata is required in Phase 2 before generated or user-uploaded artifacts are enabled.

## Commands

- Server tests: `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m unittest discover -s tests`
- Server dev: `cd server && /Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787`
- UI tests: `cd ui && npm test`
- UI build: `cd ui && npm run build`
- UI dev with server: `cd ui && VITE_AGENT_SERVER_URL=http://127.0.0.1:8787 npm run dev`

## Project Structure

```text
server/
  assets/seeds/
    models/sofa-01.glb                 # committed optimized seed copied into local artifact storage
  .data/artifacts/
    models/sofa-01.glb                 # runtime local storage, ignored by git
    thumbnails/sofa-01.webp            # optional preview image
  src/server/
    app.py                             # adds artifact routes
    artifacts.py                       # artifact metadata and storage helpers
    db.py                              # SQLAlchemy engine, metadata, transaction helpers
    schema.py                          # SQLAlchemy Core table definitions
    store.py                           # SQLAlchemy-backed command/event/state store
    artifact_store.py                  # Phase 2 SQLAlchemy-backed artifact metadata store
  tests/
    test_artifacts.py
    test_app.py

ui/
  src/api/
    artifacts.ts                       # artifact search, metadata, URL helpers
  src/scene/components/
    Sofa.tsx                           # first migration target
    ModelArtifact.tsx                  # later reusable GLB renderer
```

## Implementation Phases

### Phase 0: SQLAlchemy Persistence Foundation

Adopt SQLAlchemy Core for the whole server persistence layer before adding artifact tables. The local SQLite database is development data and can be deleted during this refactor.

Acceptance:

- `server/pyproject.toml` includes SQLAlchemy 2.x.
- Existing `current_state`, `commands`, and `events` tables are defined with SQLAlchemy Core table metadata.
- Existing command/event/state store behavior remains unchanged from the API perspective.
- Temporary test databases initialize from SQLAlchemy metadata.
- Existing server tests pass after deleting any local `.data` SQLite file.
- No Alembic migration is required in this development slice.

### Phase 1: Seeded Artifact Routes

Keep this phase intentionally small. Seed the existing sofa as a code-defined artifact and serve its GLB content from server-owned local storage.

Acceptance:

- `seed-sofa-01` is returned from artifact search and batch lookup.
- `seed-sofa-01` content is served by the server.
- The current UI sofa renderer loads from the artifact content URL.
- A clean checkout or Docker build has a committed seed source for the sofa GLB and can bootstrap it into runtime local storage.
- No generated/uploaded artifacts are accepted yet.

### Phase 2: SQLAlchemy Artifact Metadata

This phase is the required gate before upload, generation, or a general artifact browser. Do not start generated model registration until artifact metadata is persisted in SQLite.

Add tables:

```text
artifacts
  id TEXT PRIMARY KEY
  kind TEXT NOT NULL
  object_type TEXT NOT NULL
  display_name TEXT NOT NULL
  placement TEXT NOT NULL
  content_type TEXT NOT NULL
  storage_key TEXT NOT NULL
  thumbnail_storage_key TEXT
  source TEXT NOT NULL
  width_m REAL
  height_m REAL
  depth_m REAL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

artifact_tags
  artifact_id TEXT NOT NULL
  tag TEXT NOT NULL
  PRIMARY KEY (artifact_id, tag)
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
```

Add indexes:

```text
artifacts_kind_type_placement_idx on artifacts(kind, object_type, placement)
artifacts_source_idx on artifacts(source)
artifact_tags_tag_idx on artifact_tags(tag, artifact_id)
```

Add later, only when raw/source/optimized variants need first-class tracking:

```text
artifact_files
  id TEXT PRIMARY KEY
  artifact_id TEXT NOT NULL
  role TEXT NOT NULL        # primary, thumbnail, source, raw, optimized
  content_type TEXT NOT NULL
  storage_key TEXT NOT NULL
  byte_size INTEGER
  checksum TEXT
  created_at TEXT NOT NULL
```

Acceptance:

- Seeded sofa metadata is migrated or loaded into SQLite.
- Search, single metadata lookup, batch lookup, and content serving read metadata from SQLite.
- Search supports `kind`, `objectType`, `type`, `placement`, tags, and text query.
- Generated/uploaded artifact creation has a persistent place to write metadata.
- Tests cover schema initialization, seed idempotency, search filters, tag matching, and batch lookup.

Implementation boundary:

- Add a dedicated `ArtifactStore` module/class rather than folding artifact behavior into the command/event-focused `SQLiteStore`.
- The artifact store may use the same `server/.data/playground.sqlite3` database file, but artifact schema initialization and artifact queries should live behind the artifact-specific interface.
- Keep room state persistence and artifact metadata persistence separate concepts. Room state owns placement, rotation, collision, and revisions; artifacts own durable content metadata.
- Define artifact tables through SQLAlchemy Core metadata, not raw SQL strings.
- Use SQLAlchemy parameter binding/query construction for artifact filters, batch lookup, pagination, and tag joins.

### Phase 3: Room Artifact References

This phase makes batch artifact lookup useful for every item in a room. Do not build a generic artifact browser or generic model renderer until placed room items can reference artifact IDs.

Add optional artifact references to room item data:

```json
{
  "id": "sofa",
  "name": "Sofa",
  "artifactId": "seed-sofa-01",
  "position": { "x": -0.9, "y": 0, "z": -1.4 },
  "rotation": { "yDegrees": 0 },
  "baseSize": { "width": 2.49, "height": 1.21, "depth": 0.93 }
}
```

Acceptance:

- Existing furniture and wall-object state remains backward-compatible when `artifactId` is absent.
- The seeded sofa layout can expose `artifactId: "seed-sofa-01"`.
- The UI can collect artifact IDs from all placed room items, de-duplicate them, call batch lookup once, and render using returned metadata.
- Layout export preserves the existing schema and adds artifact IDs only as optional fields.

## API Contract

### Search Artifacts

`GET /api/artifacts?kind=model3d&type=sofa&q=modern&page=1&pageSize=24`

Query parameters:

- `ids`: optional comma-separated artifact IDs for batch lookup, for example `seed-sofa-01,seed-table-01`.
- `kind`: optional artifact kind, for example `model3d`, `image`, or `material`.
- `type`: optional user-facing alias for `objectType`, for example `sofa`, `table`, `wallpaper`, or `lamp`.
- `objectType`: optional canonical object type. If both `type` and `objectType` are present, `objectType` wins.
- `placement`: optional placement filter.
- `q`: optional text search across display name and tags.
- `page`: optional 1-based page number, default `1`.
- `pageSize`: optional result count, default `24`, max `100`.

When `ids` is present, the endpoint works as a batch metadata lookup for room hydration. Search filters and pagination are ignored except for validating that the request does not exceed the max batch size. Duplicate IDs are allowed because multiple room items may reference the same artifact. The server should de-duplicate internally, preserve first-requested order for found artifacts, and include missing IDs separately.

Response:

```json
{
  "artifacts": [
    {
      "id": "seed-sofa-01",
      "kind": "model3d",
      "objectType": "sofa",
      "displayName": "Sofa",
      "placement": "floor",
      "contentType": "model/gltf-binary",
      "url": "http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content",
      "thumbnailUrl": null,
      "tags": ["sofa", "seating", "living-room"],
      "dimensionsMeters": {
        "width": 2.49,
        "height": 1.21,
        "depth": 0.93
      },
      "source": "seeded",
      "createdAt": "2026-06-30T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 24,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

Batch lookup response:

`GET /api/artifacts?ids=seed-sofa-01,seed-table-01,missing-artifact`

```json
{
  "artifacts": [
    {
      "id": "seed-sofa-01",
      "kind": "model3d",
      "objectType": "sofa",
      "displayName": "Sofa",
      "placement": "floor",
      "contentType": "model/gltf-binary",
      "url": "http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content",
      "thumbnailUrl": null,
      "tags": ["sofa", "seating", "living-room"],
      "dimensionsMeters": {
        "width": 2.49,
        "height": 1.21,
        "depth": 0.93
      },
      "source": "seeded",
      "createdAt": "2026-06-30T00:00:00Z"
    }
  ],
  "missingIds": ["seed-table-01", "missing-artifact"]
}
```

Batch lookup should return `200` for syntactically valid batch requests, even when all requested IDs are missing. It should return `422` only for malformed input, an empty `ids` list, or requests over the max batch size of 100 unique IDs.

### Get Artifact Metadata

`GET /api/artifacts/{artifactId}`

```json
{
  "artifact": {
    "id": "seed-sofa-01",
    "kind": "model3d",
    "objectType": "sofa",
    "displayName": "Sofa",
    "placement": "floor",
    "contentType": "model/gltf-binary",
    "url": "http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content",
    "thumbnailUrl": null,
    "tags": ["sofa", "seating", "living-room"],
    "dimensionsMeters": {
      "width": 2.49,
      "height": 1.21,
      "depth": 0.93
    },
    "storageKey": "models/sofa-01.glb",
    "source": "seeded",
    "createdAt": "2026-06-30T00:00:00Z"
  }
}
```

The response may include `storageKey` for debugging in local development, but frontend rendering must use `url`.

### Get Artifact Content

`GET /api/artifacts/{artifactId}/content`

Returns the binary artifact stream with:

```text
Content-Type: model/gltf-binary
Cache-Control: public, max-age=3600
```

Content type changes based on the artifact. For example, wallpaper image artifacts may return `image/webp`.

Errors follow the existing structured shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Artifact not found"
  }
}
```

## UI Integration

The first slice only needs the existing sofa to render from a server artifact URL. The reusable shape should support the later artifact browser:

```ts
export interface Artifact {
  id: string;
  kind: 'model3d' | 'image' | 'material';
  objectType: string;
  displayName: string;
  placement: 'floor' | 'wall' | 'ceiling' | 'surface' | 'reference';
  url: string;
  thumbnailUrl: string | null;
  tags: string[];
  dimensionsMeters?: { width: number; height: number; depth: number };
}
```

Frontend search helpers should mirror the server contract:

```ts
searchArtifacts({ kind: 'model3d', type: 'sofa', q: 'modern' });
searchArtifacts({ kind: 'material', type: 'wallpaper' });
searchArtifacts({ kind: 'model3d', type: 'lamp' });
getArtifactsByIds(['seed-sofa-01', 'seed-table-01']);
```

Room hydration should treat artifact metadata as a separate cache from room state:

```ts
const artifactIds = collectUniqueArtifactIds(roomState);
const { artifacts, missingIds } = await getArtifactsByIds(artifactIds);
```

If an artifact is missing, the room item should remain selectable and movable with its stored dimensions. Rendering can fall back to a simple placeholder mesh or the existing component for seeded built-ins.

## Code Style

Keep local storage details behind a helper so future cloud storage does not touch route code:

```python
artifact = artifact_store.get_artifact("seed-sofa-01")
self.write_binary_file(artifact.path, content_type=artifact.content_type)
```

In UI code, centralize server artifact requests:

```ts
export function getArtifactContentUrl(artifactId: string): string {
  return `${getServerUrl()}/api/artifacts/${artifactId}/content`;
}
```

## Testing Strategy

- Server unit tests for artifact lookup, search filters, pagination, safe storage-key resolution, content type, missing artifact responses, and path traversal rejection.
- Server unit tests for batch metadata lookup, requested-order preservation, missing IDs, duplicate ID de-duplication, empty `ids`, and max batch size validation.
- UI unit tests for artifact URL construction, search query construction, and `Sofa` model URL selection.
- UI unit tests for collecting unique artifact IDs from room state once Phase 3 begins.
- Existing drag, collision, and scene tests must continue to pass.
- Manual runtime check: run server and UI, confirm the sofa renders when `ui/public/assets/models/sofa-01.glb` is no longer used.

## Boundaries

- Always: serve artifact files from server-owned storage through artifact IDs, not local filesystem paths.
- Always: support searchable metadata by `kind`, `objectType`, tags, and text query.
- Always: reject path traversal and unknown artifact IDs.
- Always: keep optimized GLBs as runtime `model3d` artifacts.
- Ask first: adding authentication, signed URLs, cloud SDKs, upload endpoints, or a full artifact browser UI.
- Never: make the frontend import or bundle generated GLB files from `ui/public`.
- Never: let the renderer infer semantic type from filenames.

## Success Criteria

- The current sofa model is represented as a `model3d` artifact with `objectType: "sofa"`.
- `GET /api/artifacts?kind=model3d&type=sofa` returns the seeded sofa artifact.
- `GET /api/artifacts?ids=seed-sofa-01` returns the seeded sofa artifact and an empty `missingIds` list.
- The current sofa model is loaded from `GET /api/artifacts/seed-sofa-01/content`.
- The UI no longer depends on `/assets/models/sofa-01.glb`.
- The sofa still renders, selects, drags, rotates, and uses the existing invisible interaction bounds.
- Server tests cover valid search, empty search, invalid pagination, valid content requests, and invalid content requests.
- UI tests/build pass.

## Future Slices

1. Add artifact browser UI with type filters for sofa, table, chair, lamp, wallpaper, rug, and decor.
2. Add `ModelArtifact.tsx` so any `model3d` artifact can be rendered without a bespoke component.
3. Complete Phase 2 SQLAlchemy artifact metadata before generated or uploaded artifacts exist.
4. Complete Phase 3 room artifact references before generic artifact placement.
5. Let the model-processing service register generated `model3d` artifacts through this same contract.
6. Add cloud object storage by replacing the storage adapter, not the route or renderer contracts.

## Open Questions

- Should `wallpaper` be represented as `kind: "material"` only, or should source wallpaper images also appear as `kind: "image"` artifacts?
- Which object types should ship in the initial filter list before generated content expands the catalog?
