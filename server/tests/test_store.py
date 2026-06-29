from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.commands import validate_command
from server.events import create_state_event
from server.store import SQLiteStore
from server.state import create_initial_state


class SQLiteStoreTests(unittest.TestCase):
    def test_load_state_returns_initial_state_for_empty_store(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")

            self.assertEqual(store.load_state(), create_initial_state())

            store.close()

    def test_records_command_event_and_state_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")
            command = validate_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 1.6}},
                }
            )
            state = create_initial_state()
            state["revision"] = 1
            state["furniture"]["coffee-table"]["position"]["x"] = 1.2
            state["furniture"]["coffee-table"]["position"]["z"] = 1.6
            event = create_state_event(command, state)

            result = store.record_accepted_command(command, [event], state)

            self.assertEqual(result["commandId"], 1)
            self.assertEqual(result["events"][0]["id"], 1)
            self.assertEqual(store.load_state(), state)
            self.assertEqual(store.list_commands_after(0)[0]["command"], command)
            self.assertEqual(store.list_events_after(0)[0]["type"], "room.state.patch")

            store.close()

    def test_restores_latest_state_after_reopen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "state.sqlite3"
            command = validate_command({"type": "RESET_LAYOUT", "payload": {}})
            state = create_initial_state()
            state["revision"] = 2

            first_store = SQLiteStore(database_path)
            first_store.record_accepted_command(command, [create_state_event(command, state)], state)
            first_store.close()

            second_store = SQLiteStore(database_path)

            self.assertEqual(second_store.load_state(), state)

            second_store.close()

    def test_load_state_reconciles_legacy_state_with_catalog_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")
            command = validate_command({"type": "RESET_LAYOUT", "payload": {}})
            legacy_state = create_initial_state()
            legacy_state["revision"] = 1
            legacy_state["furniture"]["coffee-table"]["position"]["x"] = -2.762
            del legacy_state["furniture"]["rug"]
            del legacy_state["furniture"]["sofa"]["blocksPlacement"]
            store.record_accepted_command(command, [create_state_event(command, legacy_state)], legacy_state)

            loaded_state = store.load_state()

            self.assertIn("rug", loaded_state["furniture"])
            self.assertFalse(loaded_state["furniture"]["rug"]["blocksPlacement"])
            self.assertTrue(loaded_state["furniture"]["sofa"]["blocksPlacement"])
            self.assertEqual(loaded_state["furniture"]["coffee-table"]["position"]["x"], -2.762)

            store.close()

    def test_load_state_keeps_currently_removed_furniture_removed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")
            command = validate_command({"type": "REMOVE_FURNITURE", "payload": {"furnitureId": "rug"}})
            state = create_initial_state()
            state["revision"] = 1
            del state["furniture"]["rug"]
            store.record_accepted_command(command, [create_state_event(command, state)], state)

            loaded_state = store.load_state()

            self.assertNotIn("rug", loaded_state["furniture"])

            store.close()

    def test_lists_events_after_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")
            state = create_initial_state()

            first_command = validate_command({"type": "RESET_LAYOUT", "payload": {}})
            first_state = {**state, "revision": 1}
            store.record_accepted_command(first_command, [create_state_event(first_command, first_state)], first_state)

            second_command = validate_command(
                {
                    "type": "SET_FURNITURE_ROTATION",
                    "payload": {"furnitureId": "sofa", "rotationYDegrees": 45},
                }
            )
            second_state = create_initial_state()
            second_state["revision"] = 2
            second_state["furniture"]["sofa"]["rotation"]["yDegrees"] = 45
            store.record_accepted_command(
                second_command,
                [create_state_event(second_command, second_state)],
                second_state,
            )

            events = store.list_events_after(1)

            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["id"], 2)
            self.assertEqual(events[0]["revision"], 2)

            store.close()

    def test_load_state_snapshot_returns_state_and_last_event_id_under_one_store_read(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteStore(Path(directory) / "state.sqlite3")
            command = validate_command({"type": "RESET_LAYOUT", "payload": {}})
            state = create_initial_state()
            state["revision"] = 1
            store.record_accepted_command(command, [create_state_event(command, state)], state)

            snapshot = store.load_state_snapshot()

            self.assertEqual(snapshot["state"], state)
            self.assertEqual(snapshot["revision"], 1)
            self.assertEqual(snapshot["lastEventId"], 1)

            store.close()


if __name__ == "__main__":
    unittest.main()
