/**
 * SynchroTrace-4D Topological DAG Visualizer.
 * Renders the deterministic assembly graph, dependencies, and dynamic transition states.
 */

class TopologicalDagRenderer {
  constructor(svgElementId) {
    this.svg = document.getElementById(svgElementId);
    this.nodes = [];
    this.edges = [];
  }

  loadGraph(cadData) {
    this.nodes = cadData.nodes;
    this.edges = cadData.edges;
    this.render();
  }

  updateState(partStates) {
    if (!this.nodes) return;
    this.nodes.forEach(node => {
      const state = partStates[node.id] || "UNSTARTED";
      const circle = document.getElementById(`dag-node-${node.id}`);
      const text = document.getElementById(`dag-text-${node.id}`);

      if (circle) {
        if (state === "VERIFIED_SEATED") {
          circle.setAttribute("fill", "#10b981");
          circle.setAttribute("stroke", "#34d399");
        } else if (state === "IN_TRANSIT") {
          circle.setAttribute("fill", "#f59e0b");
          circle.setAttribute("stroke", "#fbbf24");
        } else if (state === "SEQUENCE_VIOLATION") {
          circle.setAttribute("fill", "#ef4444");
          circle.setAttribute("stroke", "#f87171");
          circle.classList.add("pulsing-node");
        } else {
          circle.setAttribute("fill", "#1e293b");
          circle.setAttribute("stroke", "#475569");
        }
      }
    });
  }

  render() {
    if (!this.svg) return;
    this.svg.innerHTML = "";

    const width = this.svg.clientWidth || 800;
    const height = this.svg.clientHeight || 220;

    // Layout nodes linearly according to topological order
    const totalNodes = this.nodes.length;
    const paddingX = 80;
    const stepX = (width - paddingX * 2) / Math.max(1, totalNodes - 1);
    const centerY = height / 2;

    const nodePositions = {};

    this.nodes.forEach((node, idx) => {
      nodePositions[node.id] = {
        x: paddingX + (idx * stepX),
        y: centerY
      };
    });

    // Draw Edges with arrow markers
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
      </marker>
    `;
    this.svg.appendChild(defs);

    this.edges.forEach(edge => {
      const p1 = nodePositions[edge.source];
      const p2 = nodePositions[edge.target];
      if (p1 && p2) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x);
        line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x);
        line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#475569");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#arrow)");
        this.svg.appendChild(line);
      }
    });

    // Draw Nodes
    this.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("id", `dag-node-${node.id}`);
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "16");
      circle.setAttribute("fill", node.ground ? "#10b981" : "#1e293b");
      circle.setAttribute("stroke", node.ground ? "#34d399" : "#475569");
      circle.setAttribute("stroke-width", "3");
      g.appendChild(circle);

      // Node Label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("id", `dag-text-${node.id}`);
      text.setAttribute("x", pos.x);
      text.setAttribute("y", pos.y + 30);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#94a3b8");
      text.setAttribute("font-size", "11px");
      text.setAttribute("font-family", "Inter, sans-serif");
      text.setAttribute("font-weight", "600");
      text.textContent = node.name.split(" ")[0]; // First token for clean rendering
      g.appendChild(text);

      if (node.critical_escape) {
        const critBadge = document.createElementNS("http://www.w3.org/2000/svg", "text");
        critBadge.setAttribute("x", pos.x);
        critBadge.setAttribute("y", pos.y - 22);
        critBadge.setAttribute("text-anchor", "middle");
        critBadge.setAttribute("fill", "#f97316");
        critBadge.setAttribute("font-size", "9px");
        critBadge.setAttribute("font-weight", "800");
        critBadge.textContent = "CRITICAL SEAL";
        g.appendChild(critBadge);
      }

      this.svg.appendChild(g);
    });
  }
}
