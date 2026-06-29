from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.commands import validate_command
from server.events import create_state_event
from server.state import create_initial_state


class StateEventTests(unittest.TestCase):
    def test_transform_command_emits_patch_for_only_changed_furniture(self) -> None:
        state = create_initial_state()
        state["revision"] = 2
        state["furniture"]["coffee-table"]["position"]["x"] = 1.2
        command = validate_command(
            {
                "type": "MOVE_FURNITURE",
                "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 0.25}},
            }
        )

        event = create_state_event(command, state)

        self.assertEqual(event["type"], "room.state.patch")
        self.assertEqual(event["revision"], 2)
        self.assertEqual(set(event["patch"].keys()), {"furniture"})
        self.assertEqual(set(event["patch"]["furniture"].keys()), {"coffee-table"})
        self.assertEqual(event["patch"]["furniture"]["coffee-table"]["position"]["x"], 1.2)

    def test_wall_object_move_command_emits_patch_for_only_changed_wall_object(self) -> None:
        state = create_initial_state()
        state["revision"] = 2
        state["wallObjects"]["window"]["wallId"] = "left"
        state["wallObjects"]["window"]["position"] = {"u": 0.5, "y": 1.4}
        command = validate_command(
            {
                "type": "MOVE_WALL_OBJECT",
                "payload": {"wallObjectId": "window", "wallId": "left", "position": {"u": 0.5, "y": 1.4}},
            }
        )

        event = create_state_event(command, state)

        self.assertEqual(event["type"], "room.state.patch")
        self.assertEqual(event["revision"], 2)
        self.assertEqual(set(event["patch"].keys()), {"wallObjects"})
        self.assertEqual(set(event["patch"]["wallObjects"].keys()), {"window"})
        self.assertEqual(event["patch"]["wallObjects"]["window"]["wallId"], "left")
        self.assertEqual(event["patch"]["wallObjects"]["window"]["position"], {"u": 0.5, "y": 1.4})

    def test_rotation_command_emits_idempotent_furniture_replacement(self) -> None:
        state = create_initial_state()
        state["revision"] = 3
        state["furniture"]["sofa"]["rotation"]["yDegrees"] = 45
        command = validate_command(
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "sofa", "rotationYDegrees": 45},
            }
        )

        event = create_state_event(command, state)
        state["furniture"]["sofa"]["rotation"]["yDegrees"] = 90

        self.assertEqual(event["patch"]["furniture"]["sofa"]["rotation"]["yDegrees"], 45)

    def test_remove_command_emits_null_furniture_replacement(self) -> None:
        state = create_initial_state()
        state["revision"] = 4
        del state["furniture"]["planter"]
        command = validate_command({"type": "REMOVE_FURNITURE", "payload": {"furnitureId": "planter"}})

        event = create_state_event(command, state)

        self.assertEqual(event["patch"], {"furniture": {"planter": None}})

    def test_objective_commands_emit_objective_only_patch(self) -> None:
        state = create_initial_state()
        state["revision"] = 5
        state["objectives"] = [{"id": "objective-1", "title": "Keep walking paths open"}]
        command = validate_command({"type": "ADD_OBJECTIVE", "payload": {"title": "Keep walking paths open"}})

        event = create_state_event(command, state)

        self.assertEqual(event["type"], "room.state.patch")
        self.assertEqual(set(event["patch"].keys()), {"objectives"})
        self.assertEqual(event["patch"]["objectives"], state["objectives"])

    def test_reset_command_emits_full_snapshot_event(self) -> None:
        state = create_initial_state()
        state["revision"] = 6
        command = validate_command({"type": "RESET_LAYOUT", "payload": {}})

        event = create_state_event(command, state)

        self.assertEqual(event["type"], "room.state.snapshot")
        self.assertEqual(event["revision"], 6)
        self.assertEqual(event["state"], state)
        self.assertNotIn("patch", event)


if __name__ == "__main__":
    unittest.main()
