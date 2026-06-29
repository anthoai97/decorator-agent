from __future__ import annotations

from copy import deepcopy
import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any

from server.state import create_initial_state

JsonObject = dict[str, Any]


class SQLiteStore:
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        self.connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.initialize()

    def initialize(self) -> None:
        with self.lock, self.connection:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS current_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    revision INTEGER NOT NULL,
                    state_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    command_json TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    event_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

    def close(self) -> None:
        with self.lock:
            self.connection.close()

    def load_state(self) -> JsonObject:
        with self.lock:
            row = self.connection.execute(
                "SELECT state_json FROM current_state WHERE id = 1",
            ).fetchone()

        if row is None:
            return create_initial_state()

        return json.loads(row["state_json"])

    def load_state_snapshot(self) -> JsonObject:
        with self.lock:
            state_row = self.connection.execute(
                "SELECT state_json FROM current_state WHERE id = 1",
            ).fetchone()
            event_row = self.connection.execute(
                "SELECT COALESCE(MAX(id), 0) AS last_event_id FROM events",
            ).fetchone()

        state = json.loads(state_row["state_json"]) if state_row is not None else create_initial_state()
        return {
            "state": state,
            "revision": state["revision"],
            "lastEventId": int(event_row["last_event_id"]),
        }

    def record_accepted_command(
        self,
        command: JsonObject,
        events: list[JsonObject],
        state: JsonObject,
    ) -> JsonObject:
        stored_events: list[JsonObject] = []

        with self.lock, self.connection:
            command_cursor = self.connection.execute(
                """
                INSERT INTO commands (source, type, status, command_json)
                VALUES (?, ?, ?, ?)
                """,
                (
                    command["source"],
                    command["type"],
                    "accepted",
                    json.dumps(command),
                ),
            )
            command_id = int(command_cursor.lastrowid)

            for event in events:
                event_payload = {**deepcopy(event), "commandId": command_id}
                event_cursor = self.connection.execute(
                    """
                    INSERT INTO events (type, revision, event_json)
                    VALUES (?, ?, ?)
                    """,
                    (
                        event_payload["type"],
                        int(event_payload.get("revision", state.get("revision", 0))),
                        json.dumps(event_payload),
                    ),
                )
                stored_events.append({"id": int(event_cursor.lastrowid), **event_payload})

            self.connection.execute(
                """
                INSERT INTO current_state (id, revision, state_json)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    revision = excluded.revision,
                    state_json = excluded.state_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (int(state["revision"]), json.dumps(state)),
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

        with self.lock, self.connection:
            command_cursor = self.connection.execute(
                """
                INSERT INTO commands (source, type, status, command_json, error_message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    read_command_source(command),
                    read_command_type(command),
                    "rejected",
                    json.dumps(command),
                    error_message,
                ),
            )
            command_id = int(command_cursor.lastrowid)

            for event in events:
                event_payload = {**deepcopy(event), "commandId": command_id}
                event_cursor = self.connection.execute(
                    """
                    INSERT INTO events (type, revision, event_json)
                    VALUES (?, ?, ?)
                    """,
                    (
                        event_payload["type"],
                        int(event_payload["revision"]),
                        json.dumps(event_payload),
                    ),
                )
                stored_events.append({"id": int(event_cursor.lastrowid), **event_payload})

        return {
            "commandId": command_id,
            "events": stored_events,
        }

    def list_commands_after(self, after_id: int) -> list[JsonObject]:
        with self.lock:
            rows = self.connection.execute(
                """
                SELECT id, status, command_json, error_message, created_at
                FROM commands
                WHERE id > ?
                ORDER BY id ASC
                """,
                (after_id,),
            ).fetchall()

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
            rows = self.connection.execute(
                """
                SELECT id, event_json
                FROM events
                WHERE id > ?
                ORDER BY id ASC
                """,
                (after_id,),
            ).fetchall()

        return [self.decode_event(row) for row in rows]

    def decode_event(self, row: sqlite3.Row) -> JsonObject:
        return {"id": int(row["id"]), **json.loads(row["event_json"])}

    def last_event_id(self) -> int:
        with self.lock:
            row = self.connection.execute("SELECT COALESCE(MAX(id), 0) AS last_event_id FROM events").fetchone()
        return int(row["last_event_id"])


def read_command_source(command: JsonObject) -> str:
    if isinstance(command, dict):
        source = command.get("source", "user")
        if isinstance(source, str) and source:
            return source

    return "unknown"


def read_command_type(command: JsonObject) -> str:
    if isinstance(command, dict):
        command_type = command.get("type")
        if isinstance(command_type, str) and command_type:
            return command_type

    return "unknown"
