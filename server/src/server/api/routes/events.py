from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from queue import Empty
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from server.api.dependencies import get_services
from server.api.errors import validation_error_response
from server.events import format_sse_comment, format_sse_event

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events/history")
def get_events_history(after: str | None = None, services: Any = Depends(get_services)) -> JSONResponse:
    try:
        after_id = parse_event_id(after or "0", "after")
    except ValueError as error:
        return validation_error_response(str(error))

    return JSONResponse(
        {
            "events": services.store.list_events_after(after_id),
            "lastEventId": services.store.last_event_id(),
        }
    )


@router.get("/events")
def get_events(request: Request, since: str | None = None, services: Any = Depends(get_services)) -> Response:
    try:
        since_id = read_sse_since_id(since, request.headers.get("Last-Event-ID"))
    except ValueError as error:
        return validation_error_response(str(error))

    return StreamingResponse(
        event_stream(services, since_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


async def event_stream(services: Any, since_id: int) -> AsyncIterator[bytes]:
    subscriber = services.broker.subscribe()
    last_sent_id = since_id

    try:
        for event in services.store.list_events_after(since_id):
            yield format_sse_event(event)
            last_sent_id = max(last_sent_id, int(event["id"]))

        while True:
            try:
                event = await asyncio.to_thread(subscriber.get, True, services.heartbeat_seconds)
            except Empty:
                yield format_sse_comment("heartbeat")
                continue

            if int(event["id"]) <= last_sent_id:
                continue

            yield format_sse_event(event)
            last_sent_id = int(event["id"])
    finally:
        services.broker.unsubscribe(subscriber)


def read_sse_since_id(since: str | None, last_event_id: str | None) -> int:
    if since:
        return parse_event_id(since, "since")

    if last_event_id:
        return parse_event_id(last_event_id, "Last-Event-ID")

    return 0


def parse_event_id(value: str, label: str) -> int:
    try:
        event_id = int(value)
    except ValueError as error:
        raise ValueError(f"{label} must be a non-negative integer") from error

    if event_id < 0:
        raise ValueError(f"{label} must be a non-negative integer")

    return event_id
