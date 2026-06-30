from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from server.app import ServerServices


def get_services(request: Request) -> "ServerServices":
    return request.app.state.services
