from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.state import FURNITURE_IDS, create_initial_state, reset_layout_state


class StateModelTests(unittest.TestCase):
    def test_initial_state_matches_ui_room_and_furniture_shape(self) -> None:
        state = create_initial_state()

        self.assertEqual(state["revision"], 0)
        self.assertEqual(
            state["room"],
            {
                "width": 9.6,
                "depth": 6.8,
                "height": 2.75,
                "bounds": {"minX": -4.8, "maxX": 4.8, "minZ": -3.4, "maxZ": 3.4},
            },
        )
        self.assertEqual(set(state["furniture"].keys()), FURNITURE_IDS)
        self.assertEqual(state["objectives"], [])

    def test_initial_furniture_items_include_render_fields(self) -> None:
        sofa = create_initial_state()["furniture"]["sofa"]

        self.assertEqual(sofa["name"], "Sofa")
        self.assertTrue(sofa["movable"])
        self.assertTrue(sofa["blocksPlacement"])
        self.assertEqual(sofa["position"], {"x": -1.5, "y": 0, "z": -1.55})
        self.assertEqual(sofa["rotation"], {"yDegrees": 0})
        self.assertEqual(sofa["baseSize"], {"width": 2.49, "height": 1.21, "depth": 0.93})

    def test_initial_state_includes_movable_non_blocking_area_rug(self) -> None:
        rug = create_initial_state()["furniture"]["rug"]

        self.assertEqual(rug["name"], "Area rug")
        self.assertTrue(rug["movable"])
        self.assertFalse(rug["blocksPlacement"])
        self.assertEqual(rug["position"], {"x": 0.45, "y": 0, "z": 0.3})
        self.assertEqual(rug["baseSize"], {"width": 2.7, "height": 0.025, "depth": 1.75})

    def test_initial_state_returns_independent_copies(self) -> None:
        first = create_initial_state()
        second = create_initial_state()

        first["furniture"]["sofa"]["position"]["x"] = 99

        self.assertEqual(second["furniture"]["sofa"]["position"]["x"], -1.5)

    def test_reset_layout_state_resets_furniture_and_preserves_objectives(self) -> None:
        state = create_initial_state()
        state["revision"] = 4
        state["objectives"] = [{"id": "objective-1", "title": "Keep a reading corner"}]
        state["furniture"]["sofa"]["position"]["x"] = 99

        reset_state = reset_layout_state(state)

        self.assertEqual(reset_state["revision"], 5)
        self.assertEqual(reset_state["furniture"]["sofa"]["position"]["x"], -1.5)
        self.assertEqual(reset_state["objectives"], state["objectives"])
        self.assertEqual(state["furniture"]["sofa"]["position"]["x"], 99)


if __name__ == "__main__":
    unittest.main()
