from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from server.api.errors import validation_error_response
from server.api.request_body import JsonObject, read_json_body

router = APIRouter(prefix="/api", tags=["agent"])


@router.post("/agent/runs")
async def post_agent_run(request: Request) -> JSONResponse:
    try:
        body = await read_json_body(request)
    except ValueError as error:
        return validation_error_response(str(error))

    return JSONResponse({"event": create_agent_placeholder_event(body)})


def create_agent_placeholder_event(request: JsonObject) -> JsonObject:
    return {
        "id": str(uuid4()),
        "type": "agent.placeholder.completed",
        "source": "server",
        "message": "Agent placeholder received the request. Real Agent SDK setup is not configured yet.",
        "request": request,
    }
