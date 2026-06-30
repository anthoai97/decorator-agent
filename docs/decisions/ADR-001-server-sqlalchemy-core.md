# ADR-001: Use SQLAlchemy Core for Server SQL Access

## Status
Accepted

## Date
2026-06-30

## Context

The server currently uses Python's built-in `sqlite3` module directly in `server/src/server/store.py` for room state, command history, and event history. The artifact system will add more relational queries: artifact metadata, tags, search filters, pagination, and batch lookup.

During active development, the local SQLite database is disposable. It is acceptable to delete `server/.data/playground.sqlite3` instead of preserving old schema migrations while the persistence layer is being reshaped.

We need a safer query-building and schema-definition layer before adding more tables and joins, while keeping the server simple and compatible with SQLite now and possible Postgres/cloud deployment later.

## Decision

Use SQLAlchemy Core 2.x for all server SQL access.

- Existing command/event/state persistence should move from raw `sqlite3` calls to SQLAlchemy Core.
- New artifact metadata persistence should use SQLAlchemy Core from the start.
- Keep SQLAlchemy ORM out of scope unless domain-object lifecycle management becomes valuable later.
- Defer Alembic until schema evolution needs durable versioned migrations.
- During this development phase, local DB reset is allowed: delete `server/.data/playground.sqlite3` and let the server initialize a fresh schema.

## Alternatives Considered

### Keep Raw sqlite3

- Pros: no dependency, current code already works.
- Cons: artifact search and tag joins will increase hand-written SQL surface area; schema definitions and query construction become easier to drift; later Postgres migration becomes more manual.
- Rejected because the artifact system makes query complexity grow immediately.

### SQLAlchemy ORM

- Pros: high-level object mapping and relationships.
- Cons: more conceptual weight than the current server needs; command/event/state and artifact metadata are table-centric, not rich object graphs.
- Rejected for now. SQLAlchemy Core gives the query safety we need without ORM session/lifecycle complexity.

### SQLModel

- Pros: convenient when FastAPI and Pydantic models drive API contracts.
- Cons: this server is not using FastAPI or Pydantic; it would add extra dependency and modeling decisions before they are needed.
- Rejected for now.

### Peewee

- Pros: lightweight ORM with simple SQLite usage.
- Cons: less aligned with future SQLAlchemy/Alembic migration path and broader ecosystem support for larger relational work.
- Rejected in favor of SQLAlchemy Core.

## Consequences

- `server/pyproject.toml` will add `SQLAlchemy` as a dependency.
- Server persistence modules should expose project-specific stores (`SQLiteStore`, `ArtifactStore`, or renamed equivalents) while hiding SQLAlchemy table/query details from route handlers.
- Existing tests can reset temporary SQLite files freely.
- The current local `.data` database may be deleted during the refactor; no compatibility migration is required for this development slice.
- Future schema changes can introduce Alembic once data preservation matters.

## Sources

- SQLAlchemy Core documentation: https://docs.sqlalchemy.org/en/20/core/
- Alembic documentation: https://alembic.sqlalchemy.org/en/latest/
