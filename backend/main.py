"""
SynchroTrace-4D FastAPI Application.
Hosts REST verification services, live synthetic scenario playback,
and real-time bidirectional WebSockets for workstation monitoring.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import asyncio
import os
import json

from backend.cad_parser import load_default_assembly, CadGraphCompiler
from backend.state_verifier import StateVerifier
from backend.tracker_engine import MonocularTrackerPipeline
from backend.synthetic_stream import AssemblyScenarioGenerator

app = FastAPI(
    title="SynchroTrace-4D Real-Time Edge Engine",
    version="1.0.0",
    description="Zero-Shot CAD Assembly Graph to Monocular Video Workstation Sequence & Anomaly Verifier"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines with canonical gear-pump CAD
cad_compiler = load_default_assembly()
state_verifier = StateVerifier(cad_compiler)
tracker = MonocularTrackerPipeline()
scenario_gen = AssemblyScenarioGenerator(cad_compiler)


@app.get("/api/health")
def health_check():
    return {
        "status": "ONLINE",
        "system": "SynchroTrace-4D Engine",
        "cad_loaded": cad_compiler.model.assembly_id,
        "parts_registered": len(cad_compiler.model.parts)
    }


@app.get("/api/cad/assembly")
def get_cad_graph():
    """Returns the parsed topological CAD assembly model and DAG."""
    return cad_compiler.to_dict()


@app.post("/api/station/reset")
def reset_station():
    """Resets the station state machine to unstarted cycle state."""
    state_verifier.reset()
    return {"status": "RESET_SUCCESSFUL", "summary": state_verifier.get_summary()}


@app.get("/api/station/status")
def get_status():
    return state_verifier.get_summary()


@app.websocket("/ws/stream")
async def websocket_telemetry_stream(websocket: WebSocket):
    """
    Bidirectional streaming websocket:
    Accepts scenario simulation requests, executes verification steps,
    and streams 3D pose projections, DAG transitions, and intercept alarms.
    """
    await websocket.accept()
    state_verifier.reset()

    try:
        while True:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            action = data.get("action")

            if action == "RESET":
                state_verifier.reset()
                await websocket.send_json({
                    "type": "STATE_UPDATE",
                    "data": state_verifier.get_summary()
                })

            elif action == "RUN_SCENARIO":
                scenario_name = data.get("scenario", "nominal")
                state_verifier.reset()

                await websocket.send_json({
                    "type": "LOG",
                    "message": f"Executing scenario: {scenario_name}"
                })

                for observation in scenario_gen.generate_scenario_frames(scenario_name):
                    part_id = observation["part_id"]
                    pose = observation["pose"]
                    conf = observation["confidence"]

                    # Pass through tracker interface
                    tracker_out = tracker.estimate_6d_pose(part_id, pose)

                    # Pass through topological verifier
                    result = state_verifier.process_frame_observation(
                        part_id=part_id,
                        current_pos=tracker_out["position"],
                        current_quat=tracker_out["orientation"],
                        confidence=conf
                    )

                    response = {
                        "type": "TICK",
                        "tracker": tracker_out,
                        "verifier": result,
                        "summary": state_verifier.get_summary()
                    }

                    await websocket.send_json(response)

                    # If interlock tripped, halt playback immediately and flash alert
                    if state_verifier.is_interlocked:
                        await websocket.send_json({
                            "type": "INTERLOCK_HALT",
                            "reason": state_verifier.interlock_reason,
                            "summary": state_verifier.get_summary()
                        })
                        break

                    await asyncio.sleep(0.12)  # Stream at realistic ~8-10 FPS rate

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "ERROR", "message": str(e)})


# Mount static files for the full frontend
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
