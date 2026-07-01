from __future__ import annotations

from http import HTTPStatus
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from server.api.dependencies import get_services
from server.api.errors import validation_error_response
from server.api.request_body import JsonObject, read_json_body

router = APIRouter(prefix="/api", tags=["commands"])


@router.post("/commands")
async def post_command(request: Request, services: Any = Depends(get_services)) -> JSONResponse:
    try:
        body = await read_json_body(request)
    except ValueError as error:
        return validation_error_response(str(error))

    result = execute_and_publish_command(body, services)
    return command_result_response(result)


@router.post("/playground/commands")
async def post_playground_command(request: Request, services: Any = Depends(get_services)) -> JSONResponse:
    try:
        body = await read_json_body(request)
    except ValueError as error:
        return validation_error_response(str(error))

    result = execute_and_publish_command(body, services)

    if not result["accepted"]:
        return command_result_response(result)

    return JSONResponse(
        {
            "event": create_playground_compatibility_event(result),
            "result": result,
        }
    )


def execute_and_publish_command(body: JsonObject, services: Any) -> JsonObject:
    result = services.executor.execute_command(body)
    for event in result["events"]:
        services.broker.publish(event)
    return result


def command_result_response(result: JsonObject) -> JSONResponse:
    if result["accepted"]:
        return JSONResponse({"result": result})

    return JSONResponse(
        {"error": result["error"], "result": result},
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
    )


def create_playground_compatibility_event(result: JsonObject) -> JsonObject:
    state_event = result["events"][-1]
    command = state_event["command"]

    return {
        "id": str(state_event["id"]),
        "type": "playground.command.accepted",
        "source": "server",
        "message": f"Server accepted {command['type']}",
        "command": command,
        "stateEvent": state_event,
    }
