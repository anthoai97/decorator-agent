from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.room_rules import (
    apply_transform_patch,
    clamp_transform_inside_room,
    create_footprint,
    find_overlap,
    rotation_aware_size,
)
from server.state import create_initial_state


class RoomRuleTests(unittest.TestCase):
    def test_initial_layout_has_no_overlap_and_snapped_rotations(self) -> None:
        layout = create_initial_state()["furniture"]

        self.assertEqual(layout["lounge-chair"]["rotation"]["yDegrees"], 315)
        self.assertIsNone(find_overlap(layout))

    def test_moves_area_rug_without_treating_floor_covering_as_collision(self) -> None:
        state = create_initial_state()
        result = apply_transform_patch(
            state["furniture"],
            state["room"],
            "rug",
            {"position": {"x": 0.55, "z": 0.25}},
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["layout"]["rug"]["position"]["x"], 0.55)
        self.assertEqual(result["layout"]["rug"]["position"]["z"], 0.25)
        self.assertIsNone(find_overlap(result["layout"]))

    def test_rotation_aware_size_matches_render_footprint(self) -> None:
        self.assertEqual(
            rotation_aware_size({"width": 2, "height": 1, "depth": 0.5}, 90),
            {"width": 0.5, "height": 1, "depth": 2},
        )

    def test_clamps_furniture_inside_room_bounds(self) -> None:
        state = create_initial_state()
        sofa = state["furniture"]["sofa"]
        clamped = clamp_transform_inside_room(
            {
                **sofa,
                "position": {"x": -99, "y": -2, "z": 99},
            },
            state["room"],
        )

        footprint = create_footprint(
            clamped["position"],
            rotation_aware_size(clamped["baseSize"], clamped["rotation"]["yDegrees"]),
        )

        self.assertGreaterEqual(footprint["minX"], -4.62)
        self.assertLessEqual(footprint["maxX"], 4.62)
        self.assertGreaterEqual(footprint["minZ"], -3.22)
        self.assertLessEqual(footprint["maxZ"], 3.22)
        self.assertEqual(clamped["position"]["y"], 0)

    def test_applies_valid_transform_without_mutating_input_layout(self) -> None:
        state = create_initial_state()
        layout = state["furniture"]
        result = apply_transform_patch(
            layout,
            state["room"],
            "coffee-table",
            {"position": {"x": 1.2, "z": 1.6}, "rotation": {"yDegrees": 45}},
        )

        self.assertTrue(result["applied"])
        self.assertFalse(result["clamped"])
        self.assertEqual(result["reason"], "applied")
        self.assertEqual(result["layout"]["coffee-table"]["position"]["x"], 1.2)
        self.assertEqual(result["layout"]["coffee-table"]["position"]["z"], 1.6)
        self.assertEqual(result["layout"]["coffee-table"]["rotation"]["yDegrees"], 45)
        self.assertNotEqual(layout["coffee-table"]["position"]["x"], 1.2)

    def test_reports_successful_clamping_when_transform_exceeds_bounds(self) -> None:
        state = create_initial_state()
        result = apply_transform_patch(
            state["furniture"],
            state["room"],
            "coffee-table",
            {"position": {"x": 99, "z": 1.6}},
        )

        self.assertTrue(result["applied"])
        self.assertTrue(result["clamped"])
        self.assertLess(result["layout"]["coffee-table"]["position"]["x"], 99)

    def test_rejects_overlap_and_returns_original_layout(self) -> None:
        state = create_initial_state()
        layout = state["furniture"]
        layout["coffee-table"] = {
            **layout["coffee-table"],
            "position": {**layout["sofa"]["position"]},
        }

        result = apply_transform_patch(layout, state["room"], "planter", {"position": {"x": -3.5}})

        self.assertFalse(result["applied"])
        self.assertFalse(result["clamped"])
        self.assertEqual(result["reason"], "overlap")
        self.assertIs(result["layout"], layout)

    def test_reports_missing_furniture(self) -> None:
        state = create_initial_state()
        result = apply_transform_patch(state["furniture"], state["room"], "desk", {"position": {"x": 0}})

        self.assertFalse(result["applied"])
        self.assertEqual(result["reason"], "missing-furniture")
        self.assertIs(result["layout"], state["furniture"])

    def test_snaps_rotation_to_45_degree_steps(self) -> None:
        state = create_initial_state()
        result = apply_transform_patch(
            state["furniture"],
            state["room"],
            "planter",
            {"rotation": {"yDegrees": 22.5}},
        )

        self.assertTrue(result["applied"])
        self.assertEqual(result["layout"]["planter"]["rotation"]["yDegrees"], 45)


if __name__ == "__main__":
    unittest.main()
