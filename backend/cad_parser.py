"""
SynchroTrace-4D CAD Topological Parser.
Ingests assembly definitions and compiles deterministic Directed Acyclic Graphs (DAGs)
with topological precedence, clearances, and collision geometry rules.
"""

from typing import Dict, List, Any, Set
import json
import networkx as nx
from pydantic import BaseModel, Field


class PartDefinition(BaseModel):
    id: str
    name: str
    type: str
    ground: bool = False
    color: str = "#ffffff"
    critical_escape: bool = False
    target_pose: Dict[str, List[float]]
    precedence: List[str] = Field(default_factory=list)
    mating_vector: List[float] = Field(default_factory=lambda: [0.0, 0.0, -1.0])
    bounding_box: Dict[str, float]


class AssemblyModel(BaseModel):
    assembly_id: str
    name: str
    units: str
    tolerance_linear: float
    tolerance_angular_deg: float
    parts: List[PartDefinition]


class CadGraphCompiler:
    def __init__(self, assembly_data: Dict[str, Any]):
        self.raw_data = assembly_data
        self.model = AssemblyModel(**assembly_data)
        self.dag = nx.DiGraph()
        self._compile_graph()

    def _compile_graph(self) -> None:
        """Construct the Directed Acyclic Graph enforcing physical mechanical assembly order."""
        for part in self.model.parts:
            self.dag.add_node(
                part.id,
                name=part.name,
                type=part.type,
                ground=part.ground,
                critical_escape=part.critical_escape,
                target_pose=part.target_pose,
                mating_vector=part.mating_vector,
                bounding_box=part.bounding_box,
                color=part.color,
            )

        for part in self.model.parts:
            for parent_id in part.precedence:
                if not self.dag.has_node(parent_id):
                    raise ValueError(f"Invalid CAD constraint: Precedent node '{parent_id}' does not exist.")
                self.dag.add_edge(parent_id, part.id, relationship="mating_precedence")

        # Verify mathematical consistency
        if not nx.is_directed_acyclic_graph(self.dag):
            cycle = nx.find_cycle(self.dag)
            raise ValueError(f"Topological Conflict: CAD Assembly graph contains cyclic dependencies: {cycle}")

    def get_topological_order(self) -> List[str]:
        return list(nx.topological_sort(self.dag))

    def get_predecessors(self, part_id: str) -> Set[str]:
        if not self.dag.has_node(part_id):
            return set()
        return set(nx.ancestors(self.dag, part_id))

    def get_direct_parents(self, part_id: str) -> List[str]:
        if not self.dag.has_node(part_id):
            return []
        return list(self.dag.predecessors(part_id))

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the graph for UI visualization and state engines."""
        nodes = []
        for node_id in self.dag.nodes:
            attrs = self.dag.nodes[node_id]
            nodes.append({
                "id": node_id,
                "name": attrs["name"],
                "type": attrs["type"],
                "ground": attrs["ground"],
                "critical_escape": attrs["critical_escape"],
                "color": attrs["color"],
                "direct_parents": self.get_direct_parents(node_id),
                "ancestors": list(self.get_predecessors(node_id)),
                "target_pose": attrs["target_pose"],
                "mating_vector": attrs["mating_vector"]
            })

        edges = [
            {"source": u, "target": v, "type": self.dag.edges[u, v].get("relationship", "precedence")}
            for u, v in self.dag.edges
        ]

        return {
            "assembly_id": self.model.assembly_id,
            "name": self.model.name,
            "units": self.model.units,
            "linear_tolerance_mm": self.model.tolerance_linear,
            "angular_tolerance_deg": self.model.tolerance_angular_deg,
            "topological_sequence": self.get_topological_order(),
            "nodes": nodes,
            "edges": edges
        }


def load_default_assembly() -> CadGraphCompiler:
    import os
    json_path = os.path.join(os.path.dirname(__file__), "sample_pump_cad.json")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return CadGraphCompiler(data)
