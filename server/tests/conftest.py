from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
import sys
import tempfile
import warnings

import pytest
from starlette.exceptions import StarletteDeprecationWarning

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

warnings.filterwarnings(
    "ignore",
    category=StarletteDeprecationWarning,
    message="Using `httpx` with `starlette.testclient` is deprecated.*",
)
from starlette.testclient import TestClient


@pytest.fixture
def temp_database_path() -> Iterator[Path]:
    with tempfile.TemporaryDirectory() as tempdir:
        yield Path(tempdir) / "state.sqlite3"


@pytest.fixture
def fastapi_client(temp_database_path: Path) -> Iterator[TestClient]:
    from server.app import create_app

    app = create_app(
        database_path=temp_database_path,
        heartbeat_seconds=0.1,
    )

    with TestClient(app) as client:
        yield client
