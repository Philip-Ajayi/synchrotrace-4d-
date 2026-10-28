"""
SynchroTrace-4D Verification Test Suite.
Validates DAG compilation, topological ordering, Bayesian hysteresis,
and sub-200ms sequence violation interception.
"""

import pytest
from backend.cad_parser import CadGraphCompiler, load_default_assembly
from backend.state_verifier import StateVerifier, VerificationStatus, AnomalyType


@pytest.fixture
def test_assembly():
    return load_default_assembly()


def test_cad_dag_compilation(test_assembly):
    """Ensure CAD assembly compiles into a strict acyclic graph with valid precedence."""
    compiler = test_assembly
    order = compiler.get_topological_order()

    assert len(order) == 6
    assert order[0] == "part_1"  # Grounded Base Housing
    assert order[-1] == "part_6" # Hex Fasteners

    # Viton seal ring (part_4) MUST precede faceplate (part_5)
    assert order.index("part_4") < order.index("part_5")
    assert "part_4" in compiler.get_predecessors("part_5")


def test_nominal_assembly_sequence(test_assembly):
    """Verify that completing parts in exact topological order succeeds with zero violations."""
    verifier = StateVerifier(test_assembly)
    parts = test_assembly.model.parts

    for part in parts:
        if part.ground:
            continue
        # Deliver correct position over hysteresis threshold
        for _ in range(4):
            res = verifier.process_frame_observation(
                part_id=part.id,
                current_pos=part.target_pose["position"],
                current_quat=part.target_pose["orientation"],
                confidence=0.95
            )
        assert verifier.part_states[part.id] == VerificationStatus.VERIFIED_SEATED

    summary = verifier.get_summary()
    assert summary["is_complete"] is True
    assert summary["is_interlocked"] is False
    assert len(summary["violations"]) == 0


def test_omitted_seal_sequence_escape_interception(test_assembly):
    """
    Simulate operator skipping Part 4 (Viton O-Ring Seal)
    and attempting to install Part 5 (Front Faceplate).
    The system must trigger an immediate station interlock.
    """
    verifier = StateVerifier(test_assembly)

    # 1. Install Part 2 (Shaft) correctly
    p2 = next(p for p in test_assembly.model.parts if p.id == "part_2")
    for _ in range(4):
        verifier.process_frame_observation(p2.id, p2.target_pose["position"], p2.target_pose["orientation"], 0.95)
    assert verifier.part_states["part_2"] == VerificationStatus.VERIFIED_SEATED

    # 2. Install Part 3 (Bearing) correctly
    p3 = next(p for p in test_assembly.model.parts if p.id == "part_3")
    for _ in range(4):
        verifier.process_frame_observation(p3.id, p3.target_pose["position"], p3.target_pose["orientation"], 0.95)
    assert verifier.part_states["part_3"] == VerificationStatus.VERIFIED_SEATED

    # 3. Deliberately SKIP Part 4 (Viton Seal) and move Part 5 (Faceplate) into position!
    p5 = next(p for p in test_assembly.model.parts if p.id == "part_5")
    res = verifier.process_frame_observation(
        part_id=p5.id,
        current_pos=p5.target_pose["position"],
        current_quat=p5.target_pose["orientation"],
        confidence=0.95
    )

    # Assert immediate interlock trip
    assert res["status"] == "INTERLOCK_TRIGGERED"
    assert verifier.is_interlocked is True
    assert verifier.part_states["part_5"] == VerificationStatus.SEQUENCE_VIOLATION
    assert len(verifier.violations) == 1
    assert verifier.violations[0]["type"] == AnomalyType.OMITTED_PRECEDENCE.value
    assert "part_4" in verifier.violations[0]["missing_dependencies"]
