from __future__ import annotations

import json
from typing import Any

from fastapi import Request

JsonObject = dict[str, Any]


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
