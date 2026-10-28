# SynchroTrace-4D
### Zero-Shot CAD Assembly Graph to Monocular Video Workstation Sequence & Anomaly Verifier

SynchroTrace-4D compiles raw mechanical CAD files (STEP AP242 / B-Rep models) directly into formal Directed Acyclic Graphs (DAGs) of topological precedence constraints. By executing zero-shot 3D spatial state tracking against this deterministic geometric grammar, the system intercepts critical human assembly sequence errors—such as omitted internal O-rings, reversed thrust washers, or premature fastener torquing—in under 200 milliseconds without requiring a single frame of shop-floor video training.

---

## Key Capabilities

1. **Deterministic CAD Compiler**: Algorithmically transforms B-Rep CAD geometry into topological precedence trees with boundary constraints and mating vectors.
2. **Zero Shop-Floor Video Training**: No manual bounding box annotations or video data collection. Adapts immediately to Engineering Change Orders (ECOs) upon new CAD upload.
3. **Sub-200ms Intercept Engine**: Bayesian temporal hysteresis suppresses operator hand occlusions while halting workstation tools the moment an omitted step is attempted.
4. **Interactive Digital Thread**: Browser-based Three.js 3D twin, live video bounding overlays, topological DAG visualizer, and Web Audio industrial klaxons.

---

## 1-Command Deployment (Docker)
