from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from server.api.dependencies import get_services

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
def get_state(services: Any = Depends(get_services)) -> dict[str, Any]:
    return services.store.load_state_snapshot()
