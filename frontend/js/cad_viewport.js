/**
 * SynchroTrace-4D 3D CAD Digital Thread Viewport.
 * Leverages Three.js for procedural PBR rendering of the gear pump components,
 * live spatial wireframes, in-flight component motion, and violation highlight states.
 */

class CadViewportManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.partMeshes = {};
    this.initScene();
  }

  initScene() {
    if (!this.container) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 300;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    this.camera.position.set(160, 220, 260);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (window.THREE && THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.set(0, 0, 30);
    }

    // Industrial Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(100, 200, 150);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight2.position.set(-100, -100, -100);
    this.scene.add(dirLight2);

    // Workstation Fixture Base Grid
    const gridHelper = new THREE.GridHelper(300, 20, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -10;
    this.scene.add(gridHelper);

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  buildAssemblyModels(cadData) {
    cadData.nodes.forEach(node => {
      let geometry;
      const targetZ = node.target_pose.position[2];

      switch (node.type) {
        case "housing":
          geometry = new THREE.CylinderGeometry(50, 52, 40, 32, 1, true);
          break;
        case "shaft":
          geometry = new THREE.CylinderGeometry(12, 12, 90, 24);
          break;
        case "bearing":
          geometry = new THREE.TorusGeometry(22, 6, 16, 32);
          break;
        case "seal":
          // Viton Internal O-Ring
          geometry = new THREE.TorusGeometry(26, 3, 16, 32);
          break;
        case "plate":
          // Front Enclosure Faceplate
          geometry = new THREE.BoxGeometry(90, 90, 8);
          break;
        case "fastener":
          // Hex Bolt Array
          geometry = new THREE.CylinderGeometry(4, 4, 20, 6);
          break;
        default:
          geometry = new THREE.BoxGeometry(30, 30, 30);
      }

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color || 0x94a3b8),
        metalness: 0.6,
        roughness: 0.3,
        transparent: true,
        opacity: node.ground ? 0.9 : 0.25,
        wireframe: false
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Default rotational orientation for mechanical alignment
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(0, node.ground ? 0 : 140, targetZ);

      mesh.userData = {
        id: node.id,
        targetPos: [0, 0, targetZ],
        originalColor: node.color,
        isSeated: node.ground
      };

      this.scene.add(mesh);
      this.partMeshes[node.id] = mesh;
    });
  }

  updatePartVisual(partId, state, currentPosition = null) {
    const mesh = this.partMeshes[partId];
    if (!mesh) return;

    if (currentPosition) {
      mesh.position.set(currentPosition[0], currentPosition[1], currentPosition[2]);
    }

    if (state === "VERIFIED_SEATED") {
      mesh.material.opacity = 0.95;
      mesh.material.color.setHex(0x10b981); // Solid Verified Green
      mesh.position.set(mesh.userData.targetPos[0], mesh.userData.targetPos[1], mesh.userData.targetPos[2]);
    } else if (state === "IN_TRANSIT") {
      mesh.material.opacity = 0.75;
      mesh.material.color.setHex(0xf59e0b); // In-flight Amber
    } else if (state === "SEQUENCE_VIOLATION") {
      mesh.material.opacity = 1.0;
      mesh.material.color.setHex(0xef4444); // Alarm Hazard Red
      // Rapid visual oscillation
      mesh.scale.set(1.1, 1.1, 1.1);
    } else {
      mesh.material.opacity = 0.25;
      mesh.material.color.set(mesh.userData.originalColor || 0x64748b);
      mesh.scale.set(1.0, 1.0, 1.0);
    }
  }

  resetAllParts() {
    Object.values(this.partMeshes).forEach(mesh => {
      if (mesh.userData.isSeated) {
        mesh.material.opacity = 0.95;
        mesh.material.color.setHex(0x4a5568);
        mesh.position.set(0, 0, 0);
      } else {
        mesh.material.opacity = 0.25;
        mesh.material.color.set(mesh.userData.originalColor || 0x64748b);
        mesh.position.set(0, 0, mesh.userData.targetPos[2] + 80);
      }
      mesh.scale.set(1.0, 1.0, 1.0);
    });
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
