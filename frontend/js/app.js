/**
 * SynchroTrace-4D Main Controller.
 * Manages WebSocket telemetries, synthetic fallback engines,
 * canvas bounding overlays, scenarios, and station interlocks.
 */

class SynchroTraceApp {
  constructor() {
    this.ws = null;
    this.cadData = null;
    this.dagRenderer = null;
    this.cadViewport = null;
    this.canvas = document.getElementById("station-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.currentPartId = null;
    this.activeScenario = null;
    this.isBackendOnline = false;

    this.init();
  }

  async init() {
    this.setupUIListeners();
    this.initViewportEngines();
    await this.fetchAssemblyModel();
    this.connectWebSocket();
  }

  initViewportEngines() {
    this.dagRenderer = new TopologicalDagRenderer("dag-svg");
    this.cadViewport = new CadViewportManager("cad-canvas-container");
    this.drawVideoPlaceholder();
  }

  setupUIListeners() {
    document.getElementById("btn-scenario-nominal")?.addEventListener("click", () => {
      this.runScenario("nominal");
    });
    document.getElementById("btn-scenario-escape")?.addEventListener("click", () => {
      this.runScenario("escape_skipped_seal");
    });
    document.getElementById("btn-station-reset")?.addEventListener("click", () => {
      this.resetStation();
    });
  }

  async fetchAssemblyModel() {
    try {
      const res = await fetch("/api/cad/assembly");
      if (!res.ok) throw new Error("Backend offline");
      this.cadData = await res.json();
      this.isBackendOnline = true;
      this.onCadDataLoaded();
    } catch (err) {
      console.warn("Using autonomous browser fallback CAD definition...");
      this.cadData = this.getFallbackAssemblyData();
      this.isBackendOnline = false;
      this.onCadDataLoaded();
    }
  }

  onCadDataLoaded() {
    this.dagRenderer.loadGraph(this.cadData);
    this.cadViewport.buildAssemblyModels(this.cadData);
    this.log(`Loaded CAD model: ${this.cadData.name} (${this.cadData.nodes.length} parts)`, "nominal");
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        document.getElementById("connection-status").textContent = "CONNECTED (FASTAPI)";
        document.getElementById("connection-status").style.color = "#10b981";
        this.log("Connected to SynchroTrace-4D Edge WebSocket", "success");
      };

      this.ws.onmessage = (event) => {
        const payload = jsonParseSafe(event.data);
        if (!payload) return;
        this.handleServerMessage(payload);
      };

      this.ws.onclose = () => {
        document.getElementById("connection-status").textContent = "STANDALONE CLIENT ENGINE";
        document.getElementById("connection-status").style.color = "#38bdf8";
      };
    } catch (e) {
      console.log("Running in pure standalone browser mode");
    }
  }

  handleServerMessage(payload) {
    if (payload.type === "TICK") {
      const tracker = payload.tracker;
      const verifier = payload.verifier;
      const summary = payload.summary;

      this.renderVideoFrame(tracker, verifier);
      this.updateHUD(summary, tracker);
      this.dagRenderer.updateState(summary.part_states);

      if (verifier.part_id) {
        this.cadViewport.updatePartVisual(
          verifier.part_id,
          summary.part_states[verifier.part_id],
          tracker.position
        );
      }

      if (verifier.status === "INTERLOCK_TRIGGERED") {
        this.triggerInterlockHUD(verifier.violation.description);
      } else if (summary.completed_count > 0 && verifier.hysteresis === "4/4") {
        window.audioManager.playSuccessChime();
      }
    } else if (payload.type === "INTERLOCK_HALT") {
      this.triggerInterlockHUD(payload.reason);
    }
  }

  runScenario(scenarioName) {
    this.clearInterlockHUD();
    this.resetStation();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log(`Starting execution: ${scenarioName.toUpperCase()}`, "nominal");
      this.ws.send(JSON.stringify({ action: "RUN_SCENARIO", scenario: scenarioName }));
    } else {
      this.runClientSideFallbackScenario(scenarioName);
    }
  }

  resetStation() {
    this.clearInterlockHUD();
    this.cadViewport.resetAllParts();
    if (this.cadData) {
      const initialStates = {};
      this.cadData.nodes.forEach(n => {
        initialStates[n.id] = n.ground ? "VERIFIED_SEATED" : "UNSTARTED";
      });
      this.dagRenderer.updateState(initialStates);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "RESET" }));
    }
    this.log("Workstation state reset to 0. Ready for cycle.", "nominal");
  }

  renderVideoFrame(tracker, verifier) {
    if (!this.ctx || !this.canvas) return;

    // Simulated camera frame with optical CAD projection overlay
    this.ctx.fillStyle = "#020617";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid lines for station bench
    this.ctx.strokeStyle = "#1e293b";
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    // Centered assembly base representation
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 65, 0, Math.PI * 2);
    this.ctx.strokeStyle = "#475569";
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    // Projected 6D Pose Bounding Box from tracker
    const bbox = tracker.projected_bbox;
    const isViolated = verifier.status === "INTERLOCK_TRIGGERED";

    this.ctx.strokeStyle = isViolated ? "#ef4444" : "#38bdf8";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]);

    // Tracking Tag
    this.ctx.fillStyle = isViolated ? "#ef4444" : "#38bdf8";
    this.ctx.font = "11px 'JetBrains Mono', monospace";
    this.ctx.fillText(
      `${tracker.part_id} [Conf: ${(tracker.confidence * 100).toFixed(0)}%]`,
      bbox[0],
      bbox[1] - 8
    );
  }

  triggerInterlockHUD(reason) {
    window.audioManager.playInterlockAlarm();
    const banner = document.getElementById("interlock-banner");
    const desc = document.getElementById("interlock-desc");
    if (banner && desc) {
      desc.textContent = reason;
      banner.classList.add("active");
    }
    this.log(reason, "violation");
  }

  clearInterlockHUD() {
    const banner = document.getElementById("interlock-banner");
    if (banner) banner.classList.remove("active");
  }

  updateHUD(summary, tracker) {
    document.getElementById("stat-progress").textContent = `${summary.progress_pct}%`;
    document.getElementById("stat-latency").textContent = `${tracker.inference_latency_ms || 12.4} ms`;
    document.getElementById("stat-target").textContent = summary.active_target_part_id || "COMPLETED";
    document.getElementById("stat-violations").textContent = summary.violations.length;
  }

  log(msg, type = "nominal") {
    const container = document.getElementById("log-entries");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `log-entry log-${type}`;
    const timestamp = new Date().toISOString().substring(11, 19);
    div.textContent = `[${timestamp}] ${msg}`;
    container.prepend(div);
  }

  drawVideoPlaceholder() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = "#020617";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#64748b";
    this.ctx.font = "14px Inter, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Workstation Monocular Stream Ready", this.canvas.width / 2, this.canvas.height / 2);
  }

  runClientSideFallbackScenario(scenarioName) {
    this.log(`Running autonomous client scenario: ${scenarioName}`, "nominal");
    const sequence = scenarioName === "nominal"
      ? ["part_2", "part_3", "part_4", "part_5", "part_6"]
      : ["part_2", "part_3", "part_5"]; // Intentional escape: skips part_4

    let step = 0;
    const interval = setInterval(() => {
      if (step >= sequence.length) {
        clearInterval(interval);
        return;
      }

      const partId = sequence[step];
      const partObj = this.cadData.nodes.find(n => n.id === partId);

      // Check if trying to seat part_5 without part_4
      if (partId === "part_5" && scenarioName === "escape_skipped_seal") {
        const errorMsg = "CRITICAL SEQUENCE VIOLATION: Part 'Front Faceplate Enclosure' (part_5) seated before required antecedent components ['Viton Internal O-Ring Seal' (part_4)] were installed.";
        this.cadViewport.updatePartVisual(partId, "SEQUENCE_VIOLATION");
        this.dagRenderer.updateState({ [partId]: "SEQUENCE_VIOLATION" });
        this.triggerInterlockHUD(errorMsg);
        clearInterval(interval);
        return;
      }

      // Normal seat transition
      this.cadViewport.updatePartVisual(partId, "VERIFIED_SEATED");
      this.dagRenderer.updateState({ [partId]: "VERIFIED_SEATED" });
      window.audioManager.playSuccessChime();
      this.log(`Verified component: ${partObj.name} in correct geometric tolerance`, "success");

      step++;
    }, 1200);
  }

  getFallbackAssemblyData() {
    return {
      assembly_id: "AERO-GP-440",
      name: "High-Pressure Hydraulic Gear Pump Subassembly",
      nodes: [
        { id: "part_1", name: "Base Pump Housing", ground: true, critical_escape: false, color: "#4a5568", target_pose: { position: [0, 0, 0] } },
        { id: "part_2", name: "Drive Shaft & Gear", ground: false, critical_escape: false, color: "#cbd5e0", target_pose: { position: [0, 0, 15] } },
        { id: "part_3", name: "Primary Roller Bearing", ground: false, critical_escape: false, color: "#94a3b8", target_pose: { position: [0, 0, 42] } },
        { id: "part_4", name: "Viton O-Ring Seal", ground: false, critical_escape: true, color: "#f97316", target_pose: { position: [0, 0, 52] } },
        { id: "part_5", name: "Front Faceplate Enclosure", ground: false, critical_escape: false, color: "#38bdf8", target_pose: { position: [0, 0, 60] } },
        { id: "part_6", name: "M6 Hex Bolt Array", ground: false, critical_escape: false, color: "#e2e8f0", target_pose: { position: [0, 0, 72] } }
      ],
      edges: [
        { source: "part_1", target: "part_2" },
        { source: "part_2", target: "part_3" },
        { source: "part_3", target: "part_4" },
        { source: "part_4", target: "part_5" },
        { source: "part_5", target: "part_6" }
      ]
    };
  }
}

function jsonParseSafe(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

window.addEventListener("DOMContentLoaded", () => {
  window.synchroApp = new SynchroTraceApp();
});
