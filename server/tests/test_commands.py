from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.commands import validate_command


class CommandValidationTests(unittest.TestCase):
    def test_validates_rotation_command_and_defaults_user_source(self) -> None:
        command = validate_command(
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "sofa", "rotationYDegrees": 45},
            }
        )

        self.assertEqual(
            command,
            {
                "source": "user",
                "type": "SET_FURNITURE_ROTATION",
                "payload": {"furnitureId": "sofa", "rotationYDegrees": 45},
            },
        )

    def test_validates_rotation_command_with_current_position(self) -> None:
        command = validate_command(
            {
                "type": "SET_FURNITURE_ROTATION",
                "payload": {
                    "furnitureId": "coffee-table",
                    "rotationYDegrees": 45,
                    "position": {"x": 1.2, "z": 1.6},
                },
            }
        )

        self.assertEqual(
            command["payload"],
            {
                "furnitureId": "coffee-table",
                "rotationYDegrees": 45,
                "position": {"x": 1.2, "z": 1.6},
            },
        )

    def test_validates_move_command(self) -> None:
        command = validate_command(
            {
                "source": "agent",
                "type": "MOVE_FURNITURE",
                "payload": {"furnitureId": "coffee-table", "position": {"x": 1.2, "z": 1.6}},
            }
        )

        self.assertEqual(command["source"], "agent")
        self.assertEqual(command["type"], "MOVE_FURNITURE")
        self.assertEqual(command["payload"]["position"], {"x": 1.2, "z": 1.6})

    def test_validates_wall_object_move_command(self) -> None:
        command = validate_command(
            {
                "source": "agent",
                "type": "MOVE_WALL_OBJECT",
                "payload": {"wallObjectId": "window", "wallId": "left", "position": {"u": 0.5, "y": 1.4}},
            }
        )

        self.assertEqual(command["source"], "agent")
        self.assertEqual(command["type"], "MOVE_WALL_OBJECT")
        self.assertEqual(command["payload"]["wallId"], "left")
        self.assertEqual(command["payload"]["position"], {"u": 0.5, "y": 1.4})

    def test_validates_objective_commands(self) -> None:
        add_command = validate_command({"type": "ADD_OBJECTIVE", "payload": {"title": "Make space for reading"}})
        delete_command = validate_command({"type": "DELETE_OBJECTIVE", "payload": {"objectiveId": "objective-1"}})

        self.assertEqual(add_command["payload"]["title"], "Make space for reading")
        self.assertEqual(delete_command["payload"]["objectiveId"], "objective-1")

    def test_validates_reset_and_remove_commands(self) -> None:
        reset_command = validate_command({"type": "RESET_LAYOUT", "payload": {}})
        remove_command = validate_command({"type": "REMOVE_FURNITURE", "payload": {"furnitureId": "planter"}})

        self.assertEqual(reset_command["payload"], {})
        self.assertEqual(remove_command["payload"]["furnitureId"], "planter")

    def test_rejects_unknown_command_type(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported command: UNKNOWN_COMMAND"):
            validate_command({"type": "UNKNOWN_COMMAND", "payload": {}})

    def test_rejects_unknown_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "Command source must be one of: agent, system, user"):
            validate_command({"source": "robot", "type": "RESET_LAYOUT", "payload": {}})

    def test_rejects_payload_with_missing_or_extra_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "MOVE_FURNITURE payload must include exactly: furnitureId, position"):
            validate_command({"type": "MOVE_FURNITURE", "payload": {"furnitureId": "sofa"}})

        with self.assertRaisesRegex(ValueError, "RESET_LAYOUT payload must include exactly: no fields"):
            validate_command({"type": "RESET_LAYOUT", "payload": {"extra": True}})

    def test_rejects_unknown_furniture_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "MOVE_FURNITURE payload field furnitureId must be a known furniture id"):
            validate_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "desk", "position": {"x": 1, "z": 2}},
                }
            )

    def test_rejects_unknown_wall_object_id(self) -> None:
        with self.assertRaisesRegex(
            ValueError,
            "MOVE_WALL_OBJECT payload field wallObjectId must be a known wall object id",
        ):
            validate_command(
                {
                    "type": "MOVE_WALL_OBJECT",
                    "payload": {"wallObjectId": "mirror", "position": {"u": 1, "y": 1}},
                }
            )

    def test_rejects_unknown_wall_id(self) -> None:
        with self.assertRaisesRegex(
            ValueError,
            "MOVE_WALL_OBJECT payload field wallId must be a known room wall id",
        ):
            validate_command(
                {
                    "type": "MOVE_WALL_OBJECT",
                    "payload": {"wallObjectId": "window", "wallId": "ceiling", "position": {"u": 1, "y": 1}},
                }
            )

    def test_rejects_non_finite_numbers(self) -> None:
        with self.assertRaisesRegex(ValueError, "SET_FURNITURE_ROTATION payload field rotationYDegrees must be a finite number"):
            validate_command(
                {
                    "type": "SET_FURNITURE_ROTATION",
                    "payload": {"furnitureId": "sofa", "rotationYDegrees": math.nan},
                }
            )

        with self.assertRaisesRegex(ValueError, "MOVE_FURNITURE payload field position.x must be a finite number"):
            validate_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "sofa", "position": {"x": True, "z": 0}},
                }
            )

        with self.assertRaisesRegex(ValueError, "MOVE_WALL_OBJECT payload field position.u must be a finite number"):
            validate_command(
                {
                    "type": "MOVE_WALL_OBJECT",
                    "payload": {"wallObjectId": "window", "position": {"u": True, "y": 1}},
                }
            )

    def test_rejects_invalid_position_shape(self) -> None:
        with self.assertRaisesRegex(ValueError, "MOVE_FURNITURE payload field position must be an object"):
            validate_command({"type": "MOVE_FURNITURE", "payload": {"furnitureId": "sofa", "position": None}})

        with self.assertRaisesRegex(ValueError, "MOVE_FURNITURE payload field position must include exactly: x, z"):
            validate_command(
                {
                    "type": "MOVE_FURNITURE",
                    "payload": {"furnitureId": "sofa", "position": {"x": 0, "y": 0, "z": 0}},
                }
            )

        with self.assertRaisesRegex(ValueError, "MOVE_WALL_OBJECT payload field position must include exactly: u, y"):
            validate_command(
                {
                    "type": "MOVE_WALL_OBJECT",
                    "payload": {"wallObjectId": "window", "position": {"u": 0, "x": 0, "y": 1}},
                }
            )


if __name__ == "__main__":
    unittest.main()
