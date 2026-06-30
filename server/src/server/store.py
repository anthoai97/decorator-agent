from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import json
from pathlib import Path
from threading import RLock
from typing import Any

from sqlalchemy import func, insert, select, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from server.db import create_sqlite_engine
from server.schema import SERVER_METADATA, commands_table, current_state_table, events_table
from server.state import ROOM_WALL_IDS, create_initial_state

JsonObject = dict[str, Any]


class SQLiteStore:
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.lock = RLock()
        self.engine = create_sqlite_engine(self.database_path)
        self.initialize()

    def initialize(self) -> None:
        with self.lock:
            SERVER_METADATA.create_all(self.engine)

    def close(self) -> None:
        with self.lock:
            self.engine.dispose()

    def load_state(self) -> JsonObject:
        with self.lock:
            with self.engine.connect() as connection:
                row = connection.execute(
                    select(current_state_table.c.state_json).where(current_state_table.c.id == 1),
                ).mappings().fetchone()
            return self.read_state_row(row)

    def load_state_snapshot(self) -> JsonObject:
        with self.lock:
            with self.engine.connect() as connection:
                state_row = connection.execute(
                    select(current_state_table.c.state_json).where(current_state_table.c.id == 1),
                ).mappings().fetchone()
                event_row = connection.execute(
                    select(func.coalesce(func.max(events_table.c.id), 0).label("last_event_id")),
                ).mappings().one()

            state = self.read_state_row(state_row)
            last_event_id = int(event_row["last_event_id"])

        return {
            "state": state,
            "revision": state["revision"],
            "lastEventId": last_event_id,
        }

    def read_state_row(self, row: Mapping[str, Any] | None) -> JsonObject:
        if row is None:
            return create_initial_state()

        return reconcile_state_with_catalog(
            json.loads(row["state_json"]),
            self.load_current_removed_furniture_ids(),
        )

    def record_accepted_command(
        self,
        command: JsonObject,
        events: list[JsonObject],
        state: JsonObject,
    ) -> JsonObject:
        stored_events: list[JsonObject] = []

        with self.lock, self.engine.begin() as connection:
            command_result = connection.execute(
                insert(commands_table).values(
                    source=command["source"],
                    type=command["type"],
                    status="accepted",
                    command_json=json.dumps(command),
                ),
            )
            command_id = int(command_result.inserted_primary_key[0])

            for event in events:
                event_payload = {**deepcopy(event), "commandId": command_id}
                event_result = connection.execute(
                    insert(events_table).values(
                        type=event_payload["type"],
                        revision=int(event_payload.get("revision", state.get("revision", 0))),
                        event_json=json.dumps(event_payload),
                    ),
                )
                stored_events.append({"id": int(event_result.inserted_primary_key[0]), **event_payload})

            state_upsert = sqlite_insert(current_state_table).values(
                id=1,
                revision=int(state["revision"]),
                state_json=json.dumps(state),
            )
            connection.execute(
                state_upsert.on_conflict_do_update(
                    index_elements=[current_state_table.c.id],
                    set_={
                        "revision": state_upsert.excluded.revision,
                        "state_json": state_upsert.excluded.state_json,
                        "updated_at": text("CURRENT_TIMESTAMP"),
                    },
                ),
            )

        return {
            "commandId": command_id,
            "events": stored_events,
            "state": deepcopy(state),
        }

    def record_rejected_command(
        self,
        command: JsonObject,
        events: list[JsonObject],
        error_message: str,
    ) -> JsonObject:
        stored_events: list[JsonObject] = []

        with self.lock, self.engine.begin() as connection:
            command_result = connection.execute(
                insert(commands_table).values(
                    source=read_command_source(command),
                    type=read_command_type(command),
                    status="rejected",
                    command_json=json.dumps(command),
                    error_message=error_message,
                ),
            )
            command_id = int(command_result.inserted_primary_key[0])

            for event in events:
                event_payload = {**deepcopy(event), "commandId": command_id}
                event_result = connection.execute(
                    insert(events_table).values(
                        type=event_payload["type"],
                        revision=int(event_payload["revision"]),
                        event_json=json.dumps(event_payload),
                    ),
                )
                stored_events.append({"id": int(event_result.inserted_primary_key[0]), **event_payload})

        return {
            "commandId": command_id,
            "events": stored_events,
        }

    def list_commands_after(self, after_id: int) -> list[JsonObject]:
        with self.lock:
            with self.engine.connect() as connection:
                rows = connection.execute(
                    select(
                        commands_table.c.id,
                        commands_table.c.status,
                        commands_table.c.command_json,
                        commands_table.c.error_message,
                        commands_table.c.created_at,
                    )
                    .where(commands_table.c.id > after_id)
                    .order_by(commands_table.c.id.asc()),
                ).mappings().all()

        return [
            {
                "id": int(row["id"]),
                "status": row["status"],
                "command": json.loads(row["command_json"]),
                "error": row["error_message"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def list_events_after(self, after_id: int) -> list[JsonObject]:
        with self.lock:
            with self.engine.connect() as connection:
                rows = connection.execute(
                    select(events_table.c.id, events_table.c.event_json)
                    .where(events_table.c.id > after_id)
                    .order_by(events_table.c.id.asc()),
                ).mappings().all()

        return [self.decode_event(row) for row in rows]

    def decode_event(self, row: Mapping[str, Any]) -> JsonObject:
        return {"id": int(row["id"]), **json.loads(row["event_json"])}

    def last_event_id(self) -> int:
        with self.lock:
            with self.engine.connect() as connection:
                row = connection.execute(
                    select(func.coalesce(func.max(events_table.c.id), 0).label("last_event_id")),
                ).mappings().one()
        return int(row["last_event_id"])

    def load_current_removed_furniture_ids(self) -> set[str]:
        with self.lock:
            with self.engine.connect() as connection:
                rows = connection.execute(
                    select(commands_table.c.type, commands_table.c.command_json)
                    .where(commands_table.c.status == "accepted")
                    .order_by(commands_table.c.id.asc()),
                ).mappings().all()
        removed_furniture_ids: set[str] = set()

        for row in rows:
            command_type = row["type"]

            if command_type == "RESET_LAYOUT":
                removed_furniture_ids.clear()
                continue

            if command_type != "REMOVE_FURNITURE":
                continue

            command = json.loads(row["command_json"])
            payload = command.get("payload", {})
            furniture_id = payload.get("furnitureId") if isinstance(payload, dict) else None

            if isinstance(furniture_id, str):
                removed_furniture_ids.add(furniture_id)

        return removed_furniture_ids


def read_command_source(command: JsonObject) -> str:
    if isinstance(command, dict):
        source = command.get("source", "user")
        if isinstance(source, str) and source:
            return source

    return "unknown"


def reconcile_state_with_catalog(state: JsonObject, removed_furniture_ids: set[str]) -> JsonObject:
    initial_state = create_initial_state()
    revision = int(state.get("revision", initial_state["revision"]))
    objectives = deepcopy(state.get("objectives", []))

    if has_stored_room_dimension_change(state.get("room"), initial_state["room"]):
        return {
            **deepcopy(state),
            "revision": revision,
            "room": deepcopy(initial_state["room"]),
            "furniture": deepcopy(initial_state["furniture"]),
            "wallObjects": deepcopy(initial_state["wallObjects"]),
            "objectives": objectives,
        }

    return {
        **deepcopy(state),
        "revision": revision,
        "room": merge_object(initial_state["room"], state.get("room")),
        "furniture": reconcile_furniture_layout(
            initial_state["furniture"],
            state.get("furniture"),
            removed_furniture_ids,
        ),
        "wallObjects": reconcile_wall_object_layout(
            initial_state["wallObjects"],
            state.get("wallObjects"),
        ),
        "objectives": objectives,
    }


def has_stored_room_dimension_change(stored_room: Any, catalog_room: JsonObject) -> bool:
    if not isinstance(stored_room, dict):
        return False

    return room_dimensions(stored_room) != room_dimensions(catalog_room)


def room_dimensions(room: JsonObject) -> JsonObject:
    return {
        "width": room.get("width"),
        "depth": room.get("depth"),
        "height": room.get("height"),
        "bounds": room.get("bounds"),
    }


def reconcile_furniture_layout(
    default_furniture: JsonObject,
    stored_furniture: Any,
    removed_furniture_ids: set[str],
) -> JsonObject:
    if not isinstance(stored_furniture, dict):
        stored_furniture = {}

    reconciled_furniture: JsonObject = {}

    for furniture_id, default_item in default_furniture.items():
        stored_item = stored_furniture.get(furniture_id)

        if isinstance(stored_item, dict):
            reconciled_furniture[furniture_id] = reconcile_furniture_item(default_item, stored_item)
            continue

        if furniture_id not in removed_furniture_ids:
            reconciled_furniture[furniture_id] = deepcopy(default_item)

    for furniture_id, stored_item in stored_furniture.items():
        if furniture_id not in reconciled_furniture and furniture_id not in default_furniture:
            reconciled_furniture[furniture_id] = deepcopy(stored_item)

    return reconciled_furniture


def reconcile_furniture_item(default_item: JsonObject, stored_item: JsonObject) -> JsonObject:
    reconciled_item = deepcopy(default_item)
    reconciled_item["position"] = merge_object(default_item["position"], stored_item.get("position"))
    reconciled_item["rotation"] = merge_object(default_item["rotation"], stored_item.get("rotation"))
    if isinstance(stored_item.get("artifactId"), str):
        reconciled_item["artifactId"] = stored_item["artifactId"]
    return reconciled_item


def reconcile_wall_object_layout(default_wall_objects: JsonObject, stored_wall_objects: Any) -> JsonObject:
    if not isinstance(stored_wall_objects, dict):
        stored_wall_objects = {}

    reconciled_wall_objects: JsonObject = {}

    for wall_object_id, default_item in default_wall_objects.items():
        stored_item = stored_wall_objects.get(wall_object_id)

        if isinstance(stored_item, dict):
            reconciled_wall_objects[wall_object_id] = reconcile_wall_object_item(default_item, stored_item)
        else:
            reconciled_wall_objects[wall_object_id] = deepcopy(default_item)

    for wall_object_id, stored_item in stored_wall_objects.items():
        if wall_object_id not in reconciled_wall_objects and wall_object_id not in default_wall_objects:
            reconciled_wall_objects[wall_object_id] = deepcopy(stored_item)

    return reconciled_wall_objects


def reconcile_wall_object_item(default_item: JsonObject, stored_item: JsonObject) -> JsonObject:
    reconciled_item = deepcopy(default_item)
    wall_id = stored_item.get("wallId")

    if wall_id in ROOM_WALL_IDS:
        reconciled_item["wallId"] = wall_id

    reconciled_item["position"] = merge_object(default_item["position"], stored_item.get("position"))
    if isinstance(stored_item.get("artifactId"), str):
        reconciled_item["artifactId"] = stored_item["artifactId"]
    return reconciled_item


def merge_object(default_value: JsonObject, stored_value: Any) -> JsonObject:
    if not isinstance(stored_value, dict):
        return deepcopy(default_value)

    return {
        **deepcopy(default_value),
        **deepcopy(stored_value),
    }


def read_command_type(command: JsonObject) -> str:
    if isinstance(command, dict):
        command_type = command.get("type")
        if isinstance(command_type, str) and command_type:
            return command_type

    return "unknown"
