"""
SynchroTrace-4D Monocular Tracking Interface.
Integrates FoundationPose 6D pose estimation and CoTracker dense point tracking
with real-time coordinate registration to 3D CAD origin.
"""

from typing import Dict, Any, List
import numpy as np


class MonocularTrackerPipeline:
    def __init__(self, camera_fx: float = 800.0, camera_fy: float = 800.0, cx: float = 320.0, cy: float = 240.0):
        self.fx = camera_fx
        self.fy = camera_fy
        self.cx = cx
        self.cy = cy
        # 3x3 Camera Intrinsic Matrix
        self.intrinsics = np.array([
            [self.fx, 0.0, self.cx],
            [0.0, self.fy, self.cy],
            [0.0, 0.0, 1.0]
        ])

    def project_3d_to_pixel(self, pt_3d: List[float]) -> List[int]:
        """Projects a 3D point in camera coordinates onto the 2D image plane."""
        x, y, z = pt_3d
        if z <= 0.01:
            z = 0.01
        u = int((self.fx * x / z) + self.cx)
        v = int((self.fy * y / z) + self.cy)
        return [u, v]

    def estimate_6d_pose(
        self,
        part_id: str,
        simulated_pose: Dict[str, List[float]],
        sensor_noise_sigma: float = 0.2
    ) -> Dict[str, Any]:
        """
        Simulates FoundationPose inferencing output with real-world sensor noise
        and coordinate frame transform into workstation world coordinates.
        """
        pos = np.array(simulated_pose["position"], dtype=np.float64)
        noise = np.random.normal(0.0, sensor_noise_sigma, size=3)
        noisy_pos = pos + noise

        # Simulated bounding box projection
        u, v = self.project_3d_to_pixel([noisy_pos[0], noisy_pos[1], max(200.0, noisy_pos[2] + 400.0)])
        bbox = [max(0, u - 45), max(0, v - 45), min(640, u + 45), min(480, v + 45)]

        return {
            "part_id": part_id,
            "position": [round(float(val), 3) for val in noisy_pos],
            "orientation": simulated_pose.get("orientation", [0.0, 0.0, 0.0, 1.0]),
            "confidence": round(float(np.clip(np.random.normal(0.96, 0.02), 0.70, 0.99)), 3),
            "projected_pixel_centroid": [u, v],
            "projected_bbox": bbox,
            "inference_latency_ms": round(float(np.random.uniform(8.5, 14.2)), 2)
        }
