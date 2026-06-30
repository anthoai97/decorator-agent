from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from server.api.dependencies import get_services
from server.api.errors import error_payload

JsonObject = dict[str, Any]

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


async def read_json_body(request: Request) -> JsonObject:
    raw_body = await request.body()

    if not raw_body:
        return {}

    try:
        parsed = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("Request body must be valid JSON") from error

    if not isinstance(parsed, dict):
        raise ValueError("Request body must be a JSON object")

    return parsed


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


def validation_error_response(message: str) -> JSONResponse:
    return JSONResponse(
        error_payload("VALIDATION_ERROR", message),
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
