from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.executor import CommandExecutor
from server.store import SQLiteStore


class CommandExecutorTests(unittest.TestCase):
    def create_executor(self, directory: str) -> tuple[CommandExecutor, SQLiteStore]:
        store = SQLiteStore(Path(directory) / "state.sqlite3")
        return CommandExecutor(store), store

    def test_execute_move_command_persists_patch_event_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            result = executor.execute_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 1.6}},
                }
            )

            self.assertTrue(result["accepted"])
            self.assertEqual(result["revision"], 1)
            self.assertEqual(result["events"][0]["id"], 1)
            self.assertEqual(result["events"][0]["type"], "room.state.patch")
            self.assertEqual(set(result["events"][0]["patch"]["furniture"].keys()), {"coffee-table"})
            self.assertEqual(store.load_state()["furniture"]["coffee-table"]["position"]["x"], 1.2)
            self.assertEqual(store.list_commands_after(0)[0]["status"], "accepted")

            store.close()

    def test_execute_wall_object_move_persists_patch_event_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            result = executor.execute_command(
                {
                    "type": "MOVE_WALL_OBJECT",
                    "payload": {"wallObjectId": "window", "wallId": "left", "position": {"u": 0.5, "y": 1.4}},
                }
            )

            self.assertTrue(result["accepted"])
            self.assertEqual(result["revision"], 1)
            self.assertEqual(result["events"][0]["type"], "room.state.patch")
            self.assertEqual(set(result["events"][0]["patch"]["wallObjects"].keys()), {"window"})
            self.assertEqual(store.load_state()["wallObjects"]["window"]["wallId"], "left")
            self.assertEqual(store.load_state()["wallObjects"]["window"]["position"], {"u": 0.5, "y": 1.4})

            store.close()

    def test_execute_reset_command_persists_snapshot_event(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            result = executor.execute_command({"type": "RESET_LAYOUT", "payload": {}})

            self.assertTrue(result["accepted"])
            self.assertEqual(result["revision"], 1)
            self.assertEqual(result["events"][0]["type"], "room.state.snapshot")
            self.assertIn("state", result["events"][0])

            store.close()

    def test_rotation_command_can_commit_current_position_with_rotation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            result = executor.execute_command(
                {
                    "type": "SET_FURNITURE_ROTATION",
                    "payload": {
                        "furnitureId": "coffee-table",
                        "rotationYDegrees": 45,
                        "position": {"x": -0.2, "z": 1.0},
                    },
                }
            )

            furniture = store.load_state()["furniture"]["coffee-table"]

            self.assertTrue(result["accepted"])
            self.assertEqual(furniture["position"]["x"], -0.2)
            self.assertEqual(furniture["position"]["z"], 1.0)
            self.assertEqual(furniture["rotation"]["yDegrees"], 45)
            self.assertEqual(result["events"][0]["patch"]["furniture"]["coffee-table"]["position"]["x"], -0.2)

            store.close()

    def test_rejected_overlap_is_persisted_without_mutating_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)
            original_state = store.load_state()

            result = executor.execute_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "coffee-table", "position": {"x": -1.5, "z": -1.55}},
                }
            )

            self.assertFalse(result["accepted"])
            self.assertEqual(result["revision"], 0)
            self.assertEqual(result["error"]["code"], "COMMAND_REJECTED")
            self.assertEqual(result["events"][0]["id"], 1)
            self.assertEqual(result["events"][0]["type"], "command.rejected")
            self.assertEqual(store.load_state(), original_state)
            self.assertEqual(store.list_commands_after(0)[0]["status"], "rejected")

            store.close()

    def test_invalid_payload_is_persisted_as_rejected_validation_event(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            result = executor.execute_command({"type": "RESET_LAYOUT", "payload": "bad"})

            self.assertFalse(result["accepted"])
            self.assertEqual(result["error"]["code"], "VALIDATION_ERROR")
            self.assertEqual(result["events"][0]["error"]["code"], "VALIDATION_ERROR")
            self.assertEqual(store.list_commands_after(0)[0]["status"], "rejected")

            store.close()

    def test_objective_commands_update_state_with_objective_only_patches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executor, store = self.create_executor(directory)

            add_result = executor.execute_command(
                {"type": "ADD_OBJECTIVE", "payload": {"title": "Keep walking paths open"}}
            )
            objective = store.load_state()["objectives"][0]
            delete_result = executor.execute_command(
                {"type": "DELETE_OBJECTIVE", "payload": {"objectiveId": objective["id"]}}
            )

            self.assertTrue(add_result["accepted"])
            self.assertEqual(set(add_result["events"][0]["patch"].keys()), {"objectives"})
            self.assertEqual(add_result["events"][0]["patch"]["objectives"][0]["title"], "Keep walking paths open")
            self.assertTrue(delete_result["accepted"])
            self.assertEqual(delete_result["events"][0]["patch"], {"objectives": []})
            self.assertEqual(store.load_state()["objectives"], [])

            store.close()


if __name__ == "__main__":
    unittest.main()
