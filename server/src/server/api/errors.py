from __future__ import annotations

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def error_payload(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            error_payload("VALIDATION_ERROR", format_validation_error(error)),
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, error: StarletteHTTPException) -> JSONResponse:
        if error.status_code == HTTPStatus.NOT_FOUND:
            return JSONResponse(
                error_payload("NOT_FOUND", "Route not found"),
                status_code=HTTPStatus.NOT_FOUND,
            )

        return JSONResponse(
            error_payload("HTTP_ERROR", str(error.detail)),
            status_code=error.status_code,
        )


def format_validation_error(error: RequestValidationError) -> str:
    first_error = error.errors()[0] if error.errors() else {}
    location = ".".join(str(part) for part in first_error.get("loc", ()) if part != "query")
    message = str(first_error.get("msg", "Invalid request"))

    if location:
        return f"{location}: {message}"

    return message
