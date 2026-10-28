"""
SynchroTrace-4D Scenario Generator.
Produces deterministic, frame-by-frame assembly actions for testing:
1. Nominal flawless assembly (all 6 parts in order)
2. Intentional Sequence Escape: Skipping Part 4 (O-ring) and attempting to seat Part 5 (Faceplate)
3. Premature Fastener Torquing
"""

from typing import Dict, Any, List, Generator
import time


class AssemblyScenarioGenerator:
    def __init__(self, cad_graph):
        self.cad_graph = cad_graph

    def generate_scenario_frames(self, scenario_type: str = "nominal") -> Generator[Dict[str, Any], None, None]:
        parts = self.cad_graph.model.parts

        if scenario_type == "nominal":
            # Correct order: part_1 -> part_2 -> part_3 -> part_4 -> part_5 -> part_6
            sequence = [p for p in parts if not p.ground]
            for part in sequence:
                yield from self._simulate_part_installation(part, will_succeed=True)

        elif scenario_type == "escape_skipped_seal":
            # Escape: part_2 -> part_3 -> SKIPS part_4 (Viton Seal) -> attempts part_5 (Faceplate)
            part_2 = next(p for p in parts if p.id == "part_2")
            part_3 = next(p for p in parts if p.id == "part_3")
            part_5 = next(p for p in parts if p.id == "part_5")

            yield from self._simulate_part_installation(part_2, will_succeed=True)
            yield from self._simulate_part_installation(part_3, will_succeed=True)
            # Operator grabs faceplate and moves it into seat, completely skipping seal!
            yield from self._simulate_part_installation(part_5, will_succeed=True, trigger_precedence_escape=True)

        elif scenario_type == "escape_premature_bolts":
            # Escape: part_2 -> jumps straight to part_6
            part_2 = next(p for p in parts if p.id == "part_2")
            part_6 = next(p for p in parts if p.id == "part_6")

            yield from self._simulate_part_installation(part_2, will_succeed=True)
            yield from self._simulate_part_installation(part_6, will_succeed=True, trigger_precedence_escape=True)

    def _simulate_part_installation(
        self,
        part,
        will_succeed: bool = True,
        trigger_precedence_escape: bool = False
    ) -> Generator[Dict[str, Any], None, None]:
        target = part.target_pose["position"]
        # In transit approaching from z + 120mm
        approach_steps = 6
        for step in range(approach_steps):
            ratio = (step + 1) / approach_steps
            curr_z = (target[2] + 120.0) - (120.0 * ratio)
            curr_pos = [target[0], target[1], curr_z]

            yield {
                "event": "TRACKING_UPDATE",
                "part_id": part.id,
                "part_name": part.name,
                "pose": {
                    "position": curr_pos,
                    "orientation": part.target_pose["orientation"]
                },
                "confidence": 0.88 + (ratio * 0.1),
                "is_approach": step < (approach_steps - 1)
            }

        # Dwell at seated pose for verification hysteresis
        dwell_frames = 5
        for _ in range(dwell_frames):
            yield {
                "event": "TRACKING_UPDATE",
                "part_id": part.id,
                "part_name": part.name,
                "pose": {
                    "position": target,
                    "orientation": part.target_pose["orientation"]
                },
                "confidence": 0.98,
                "is_approach": False
            }
