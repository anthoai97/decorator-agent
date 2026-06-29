from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.state import FURNITURE_IDS, WALL_OBJECT_IDS, create_initial_state, reset_layout_state


class StateModelTests(unittest.TestCase):
    def test_initial_state_matches_ui_room_and_furniture_shape(self) -> None:
        state = create_initial_state()

        self.assertEqual(state["revision"], 0)
        self.assertEqual(
            state["room"],
            {
                "width": 5.8,
                "depth": 4.4,
                "height": 2.65,
                "bounds": {"minX": -2.9, "maxX": 2.9, "minZ": -2.2, "maxZ": 2.2},
            },
        )
        self.assertEqual(set(state["furniture"].keys()), FURNITURE_IDS)
        self.assertEqual(set(state["wallObjects"].keys()), WALL_OBJECT_IDS)
        self.assertEqual(state["objectives"], [])

    def test_initial_furniture_items_include_render_fields(self) -> None:
        sofa = create_initial_state()["furniture"]["sofa"]

        self.assertEqual(sofa["name"], "Sofa")
        self.assertTrue(sofa["movable"])
        self.assertTrue(sofa["blocksPlacement"])
        self.assertEqual(sofa["position"], {"x": -0.9, "y": 0, "z": -1.4})
        self.assertEqual(sofa["rotation"], {"yDegrees": 0})
        self.assertEqual(sofa["baseSize"], {"width": 2.49, "height": 1.21, "depth": 0.93})

    def test_initial_state_includes_movable_non_blocking_area_rug(self) -> None:
        rug = create_initial_state()["furniture"]["rug"]

        self.assertEqual(rug["name"], "Area rug")
        self.assertTrue(rug["movable"])
        self.assertFalse(rug["blocksPlacement"])
        self.assertEqual(rug["position"], {"x": -0.55, "y": 0, "z": -0.25})
        self.assertEqual(rug["baseSize"], {"width": 2.7, "height": 0.025, "depth": 1.75})

    def test_initial_state_includes_wall_objects(self) -> None:
        wall_objects = create_initial_state()["wallObjects"]

        self.assertEqual(wall_objects["window"]["wallId"], "back")
        self.assertEqual(wall_objects["window"]["position"], {"u": -2.1, "y": 1.7})
        self.assertTrue(wall_objects["window"]["movable"])
        self.assertEqual(wall_objects["wall-art"]["position"], {"u": 1.85, "y": 1.55})

    def test_initial_state_returns_independent_copies(self) -> None:
        first = create_initial_state()
        second = create_initial_state()

        first["furniture"]["sofa"]["position"]["x"] = 99

        self.assertEqual(second["furniture"]["sofa"]["position"]["x"], -0.9)

    def test_reset_layout_state_resets_furniture_and_preserves_objectives(self) -> None:
        state = create_initial_state()
        state["revision"] = 4
        state["objectives"] = [{"id": "objective-1", "title": "Keep a reading corner"}]
        state["furniture"]["sofa"]["position"]["x"] = 99
        state["wallObjects"]["window"]["position"]["u"] = 0.5

        reset_state = reset_layout_state(state)

        self.assertEqual(reset_state["revision"], 5)
        self.assertEqual(reset_state["furniture"]["sofa"]["position"]["x"], -0.9)
        self.assertEqual(reset_state["wallObjects"]["window"]["position"], {"u": -2.1, "y": 1.7})
        self.assertEqual(reset_state["objectives"], state["objectives"])
        self.assertEqual(state["furniture"]["sofa"]["position"]["x"], 99)


if __name__ == "__main__":
    unittest.main()
