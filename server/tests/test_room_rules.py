from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.room_rules import (
    apply_wall_object_position_patch,
    apply_transform_patch,
    clamp_wall_object_inside_wall,
    clamp_transform_inside_room,
    create_footprint,
    find_overlap,
    wall_object_edge_distances,
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

        self.assertGreaterEqual(footprint["minX"], -2.9)
        self.assertLessEqual(footprint["maxX"], 2.9)
        self.assertGreaterEqual(footprint["minZ"], -2.2)
        self.assertLessEqual(footprint["maxZ"], 2.2)
        self.assertEqual(clamped["position"]["y"], 0)

    def test_clamps_furniture_footprints_flush_to_room_walls_without_hidden_padding(self) -> None:
        state = create_initial_state()
        sofa = state["furniture"]["sofa"]
        clamped_to_min = clamp_transform_inside_room(
            {
                **sofa,
                "position": {"x": -99, "y": 0, "z": -99},
            },
            state["room"],
        )
        clamped_to_max = clamp_transform_inside_room(
            {
                **sofa,
                "position": {"x": 99, "y": 0, "z": 99},
            },
            state["room"],
        )
        size = rotation_aware_size(sofa["baseSize"], sofa["rotation"]["yDegrees"])
        min_footprint = create_footprint(clamped_to_min["position"], size)
        max_footprint = create_footprint(clamped_to_max["position"], size)

        self.assertEqual(min_footprint["minX"], state["room"]["bounds"]["minX"])
        self.assertEqual(min_footprint["minZ"], state["room"]["bounds"]["minZ"])
        self.assertEqual(max_footprint["maxX"], state["room"]["bounds"]["maxX"])
        self.assertEqual(max_footprint["maxZ"], state["room"]["bounds"]["maxZ"])

    def test_applies_valid_transform_without_mutating_input_layout(self) -> None:
        state = create_initial_state()
        layout = state["furniture"]
        result = apply_transform_patch(
            layout,
            state["room"],
            "coffee-table",
            {"position": {"x": -0.2, "z": 1.0}, "rotation": {"yDegrees": 45}},
        )

        self.assertTrue(result["applied"])
        self.assertFalse(result["clamped"])
        self.assertEqual(result["reason"], "applied")
        self.assertEqual(result["layout"]["coffee-table"]["position"]["x"], -0.2)
        self.assertEqual(result["layout"]["coffee-table"]["position"]["z"], 1.0)
        self.assertEqual(result["layout"]["coffee-table"]["rotation"]["yDegrees"], 45)
        self.assertNotEqual(layout["coffee-table"]["position"]["x"], -0.2)

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

    def test_clamps_wall_objects_inside_wall_bounds(self) -> None:
        state = create_initial_state()
        wall_art = state["wallObjects"]["wall-art"]

        clamped = clamp_wall_object_inside_wall(
            {
                **wall_art,
                "position": {"u": 99, "y": -99},
            },
            state["room"],
        )

        self.assertEqual(clamped["position"], {"u": 2.4, "y": 0.36})

    def test_calculates_wall_object_edge_distances(self) -> None:
        state = create_initial_state()

        self.assertEqual(
            wall_object_edge_distances(state["wallObjects"]["window"], state["room"]),
            {"left": 0.04, "right": 4.24, "bottom": 1.19, "top": 0.44},
        )

    def test_applies_wall_object_position_patch_without_mutating_input(self) -> None:
        state = create_initial_state()
        wall_objects = state["wallObjects"]

        result = apply_wall_object_position_patch(
            wall_objects,
            state["room"],
            "window",
            {"wallId": "right", "position": {"u": 99, "y": 1.4}},
        )

        self.assertTrue(result["applied"])
        self.assertTrue(result["clamped"])
        self.assertEqual(result["wallObjects"]["window"]["wallId"], "right")
        self.assertEqual(result["wallObjects"]["window"]["position"], {"u": 1.44, "y": 1.4})
        self.assertEqual(wall_objects["window"]["wallId"], "back")
        self.assertEqual(wall_objects["window"]["position"], {"u": -2.1, "y": 1.7})


if __name__ == "__main__":
    unittest.main()
