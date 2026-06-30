from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.artifacts import SEED_ARTIFACTS, bootstrap_seed_artifacts
from server.artifact_store import ArtifactStore
from server.api.errors import register_error_handlers
from server.api.routes import agent, artifacts, commands, events, state
from server.events import EventBroker
from server.executor import CommandExecutor
from server.store import SQLiteStore

JsonObject = dict[str, Any]


@dataclass
class ServerServices:
    public_base_url: str | None
    artifact_root: Path
    store: SQLiteStore
    artifact_store: ArtifactStore
    executor: CommandExecutor
    broker: EventBroker
    heartbeat_seconds: float

    def close(self) -> None:
        self.store.close()


def create_services(
    database_path: str | Path,
    heartbeat_seconds: float = 15.0,
    public_base_url: str | None = None,
) -> ServerServices:
    normalized_public_base_url = normalize_public_base_url(public_base_url)
    artifact_root = Path(database_path).parent / "artifacts"
    bootstrap_seed_artifacts(artifact_root)
    store = SQLiteStore(database_path)
    artifact_store = ArtifactStore(store.engine)
    artifact_store.seed_artifacts(SEED_ARTIFACTS)

    return ServerServices(
        public_base_url=normalized_public_base_url,
        artifact_root=artifact_root,
        store=store,
        artifact_store=artifact_store,
        executor=CommandExecutor(store),
        broker=EventBroker(),
        heartbeat_seconds=heartbeat_seconds,
    )


def create_app(
    database_path: str | Path = ".data/playground.sqlite3",
    heartbeat_seconds: float = 15.0,
    public_base_url: str | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        services = create_services(
            database_path=database_path,
            heartbeat_seconds=heartbeat_seconds,
            public_base_url=public_base_url,
        )
        app.state.services = services
        try:
            yield
        finally:
            services.close()

    app = FastAPI(title="Decorator Agent API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    register_error_handlers(app)

    @app.get("/health")
    def health() -> JsonObject:
        return {"ok": True}

    app.include_router(state.router)
    app.include_router(commands.router)
    app.include_router(events.router)
    app.include_router(artifacts.router)
    app.include_router(agent.router)

    return app


def normalize_public_base_url(public_base_url: str | None) -> str | None:
    if not public_base_url:
        return None

    return public_base_url.rstrip("/")


def run_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    database_path: str | Path = ".data/playground.sqlite3",
    public_base_url: str | None = None,
) -> None:
    import uvicorn

    app = create_app(
        database_path=database_path,
        public_base_url=public_base_url or os.environ.get("SERVER_PUBLIC_BASE_URL"),
    )
    print(f"Playground event server listening on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
