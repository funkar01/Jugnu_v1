import {
  createSystem,
  XRMesh,
  XRPlane,
  Transform,
  Interactable,
} from "@iwsdk/core";
import { Jugnu, TranscriptUI } from "./jugnu.js";
import * as THREE from "three";

// Helper to recursively traverse and find specific virtual object labels in Three.js hierarchies
function findObjectLabel(object: THREE.Object3D): string | null {
  let label: string | null = null;
  object.traverse((child) => {
    const name = child.name.toLowerCase();
    if (name.includes("wankhede") || name.includes("stadium")) {
      label = "WANKHEDE STADIUM MINIMAP";
    } else if (name.includes("billboard") || name.includes("scoreboard")) {
      label = "MATCH SCOREBOARD HUD";
    } else if (name.includes("card") || name.includes("rcb")) {
      label = "PLAYER PROFILE CARD";
    }
  });
  return label;
}

export class ObjectDetectionSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
  transforms: { required: [Transform] },
  transcriptBoard: { required: [TranscriptUI] },
}) {
  private isScanning = false;
  private peaceGestureTimer = 0.0;
  private gestureCooldown = 0.0;
  private pulseTime = 0.0;

  // Visual resources cache
  private activeHighlighters = new Map<
    string,
    { box: THREE.LineSegments; label: THREE.Mesh; colorHex: number }
  >();
  private unitBoxGeometry!: THREE.BoxGeometry;
  private sharedMaterials = new Map<number, THREE.LineBasicMaterial>();
  
  // Vectors allocated in init to prevent runtime allocations / GC spikes
  private headPos!: THREE.Vector3;
  private boxSize!: THREE.Vector3;
  private boxCenter!: THREE.Vector3;
  private labelPos!: THREE.Vector3;
  private tempBox3!: THREE.Box3;

  init() {
    this.headPos = new THREE.Vector3();
    this.boxSize = new THREE.Vector3();
    this.boxCenter = new THREE.Vector3();
    this.labelPos = new THREE.Vector3();
    this.tempBox3 = new THREE.Box3();

    // Single unit box geometry shared by all outlines to save memory
    this.unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

    // Keyboard fallback trigger ('O' for Object Detection)
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "o") {
        console.log("[ObjectDetectionSystem] Keyboard debug toggle triggered!");
        this.toggleScanning();
      }
    });

    console.log("[ObjectDetectionSystem] Initialized. Press 'O' to toggle scanner in desktop mode.");
  }

  private isPeaceSign(handedness: "left" | "right", refSpace: any): boolean {
    const source = this.input.getPrimaryInputSource(handedness);
    const frame = this.xrFrame;
    if (!source || !source.hand || !frame || typeof (frame as any).getJointPose !== "function") return false;

    // Query required joints for index, middle, ring, pinky
    const indexTip = source.hand.get("index-finger-tip");
    const indexProx = source.hand.get("index-finger-phalanx-proximal");
    const middleTip = source.hand.get("middle-finger-tip");
    const middleProx = source.hand.get("middle-finger-phalanx-proximal");
    const ringTip = source.hand.get("ring-finger-tip");
    const ringProx = source.hand.get("ring-finger-phalanx-proximal");
    const pinkyTip = source.hand.get("pinky-finger-tip");
    const pinkyProx = source.hand.get("pinky-finger-phalanx-proximal");

    if (
      !indexTip ||
      !indexProx ||
      !middleTip ||
      !middleProx ||
      !ringTip ||
      !ringProx ||
      !pinkyTip ||
      !pinkyProx
    ) {
      return false;
    }

    const getPoseDist = (jointA: any, jointB: any) => {
      const poseA = (frame as any).getJointPose(jointA, refSpace);
      const poseB = (frame as any).getJointPose(jointB, refSpace);
      if (!poseA || !poseB) return 999.0;

      const dx = poseA.transform.position.x - poseB.transform.position.x;
      const dy = poseA.transform.position.y - poseB.transform.position.y;
      const dz = poseA.transform.position.z - poseB.transform.position.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    const dIndex = getPoseDist(indexTip, indexProx);
    const dMiddle = getPoseDist(middleTip, middleProx);
    const dRing = getPoseDist(ringTip, ringProx);
    const dPinky = getPoseDist(pinkyTip, pinkyProx);

    // Heuristics:
    // - Index & Middle fully extended: tip-to-knuckle distance > 5.5cm (0.055m)
    // - Ring & Pinky curled back: tip-to-knuckle distance < 4.5cm (ring), < 4.0cm (pinky)
    return dIndex > 0.055 && dMiddle > 0.055 && dRing < 0.045 && dPinky < 0.040;
  }

  private toggleScanning() {
    this.isScanning = !this.isScanning;
    this.gestureCooldown = 1.5; // Cooldown to prevent instant bouncing

    // 1. Play spatial sound effect
    try {
      const audio = new Audio("./audio/chime.mp3");
      audio.volume = 0.45;
      audio.play().catch(() => {});
    } catch (e) {
      // Audio context might be suspended initially
    }

    // 2. Jugnu voice synthesis readout
    const voiceText = this.isScanning
      ? "Scanner active: mapping environment."
      : "Scanner offline.";
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(voiceText);
      window.speechSynthesis.speak(utterance);
    }

    // 3. Update the Telemetry Transcript HUD Board
    this.queries.transcriptBoard.entities.forEach((entity) => {
      const board = entity.object3D as any;
      if (board && typeof board.updateText === "function") {
        board.updateText(
          "TRIGGER: Peace Gesture (Both Hands)",
          this.isScanning ? "Scanning: spatial objects highlighted." : "Scanner deactivated."
        );
      }
    });

    console.log(`[ObjectDetectionSystem] Scanner status changed: Active = ${this.isScanning}`);

    // If turned off, clean up all visual overlays immediately
    if (!this.isScanning) {
      this.clearAllHighlighters();
    }
  }

  private clearAllHighlighters() {
    this.activeHighlighters.forEach((h) => {
      // Clean box resources
      h.box.geometry.dispose();
      this.world.scene.remove(h.box);

      // Clean label resources
      h.label.geometry.dispose();
      const mat = h.label.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.world.scene.remove(h.label);
    });
    this.activeHighlighters.clear();
  }

  private getOrCreateLineMaterial(colorHex: number): THREE.LineBasicMaterial {
    if (!this.sharedMaterials.has(colorHex)) {
      this.sharedMaterials.set(
        colorHex,
        new THREE.LineBasicMaterial({
          color: colorHex,
          linewidth: 2,
          transparent: true,
          opacity: 0.8,
        })
      );
    }
    return this.sharedMaterials.get(colorHex)!;
  }

  private createScannerLabel(text: string, colorHex: number): THREE.Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // High-tech Slate HUD backing
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = "#" + new THREE.Color(colorHex).getHexString();
    ctx.lineWidth = 4;

    const r = 16;
    const x = 5;
    const y = 5;
    const w = canvas.width - 10;
    const h = canvas.height - 10;

    // Bounding Frame
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sci-fi Corner telemetry brackets
    ctx.lineWidth = 6;
    const len = 15;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x + len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + len);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
    ctx.stroke();

    // Monospaced Console text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const geom = new THREE.PlaneGeometry(0.35, 0.0875);
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = "scanner_label";
    return mesh;
  }

  update(dt: number) {
    this.pulseTime += dt;

    // 1. Process cooldown timers
    if (this.gestureCooldown > 0) {
      this.gestureCooldown -= dt;
    }

    // 2. Gesture checking (only if WebXR session is active and hand-tracking exists)
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (refSpace && this.gestureCooldown <= 0) {
      const leftPeace = this.isPeaceSign("left", refSpace);
      const rightPeace = this.isPeaceSign("right", refSpace);

      if (leftPeace && rightPeace) {
        this.peaceGestureTimer += dt;
        if (this.peaceGestureTimer >= 0.4) {
          // Trigger scans toggle!
          this.toggleScanning();
          this.peaceGestureTimer = 0.0;
        }
      } else {
        this.peaceGestureTimer = 0.0;
      }
    }

    // If scanning mode is not active, terminate early
    if (!this.isScanning) {
      return;
    }

    // 3. Scanner highlight logic (runs while isScanning is true)
    const seenKeys = new Set<string>();
    this.player.head.getWorldPosition(this.headPos);

    // Compute active pulsator opacity (glowing pulse effect)
    const pulseOpacity = 0.5 + 0.3 * Math.sin(this.pulseTime * 6.0);

    // Category 1: Physical Room Planes (walls, floors, desks)
    this.queries.planes.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj) return;

      const _plane = entity.getValue(XRPlane, "_plane") as any;
      const rawLabel = _plane?.semanticLabel || "plane";
      const displayLabel = `[ PHYSICAL: ${rawLabel.toUpperCase()} ]`;
      const color = 0x00ffff; // Cyan for planes
      const key = `plane_${entity.index}`;
      seenKeys.add(key);

      this.updateHighlighter(key, obj, displayLabel, color, pulseOpacity);
    });

    // Category 2: Bounded 3D Physical Meshes (furniture, desks, chairs)
    this.queries.meshes.entities.forEach((entity) => {
      const obj = entity.object3D;
      const isBounded = entity.getValue(XRMesh, "isBounded3D");
      if (!obj || !isBounded) return;

      const rawLabel = entity.getValue(XRMesh, "semanticLabel") || "object";
      const displayLabel = `[ PHYSICAL: ${rawLabel.toUpperCase()} ]`;
      const color = 0xaaff00; // Neon Yellow-Green for meshes
      const key = `mesh_${entity.index}`;
      seenKeys.add(key);

      this.updateHighlighter(key, obj, displayLabel, color, pulseOpacity);
    });

    // Category 3: Virtual Interactables & Companions
    this.queries.transforms.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj || !obj.visible) return;

      // Skip physical meshes/planes and already generated scanner overlays
      if (entity.hasComponent(XRPlane) || entity.hasComponent(XRMesh)) return;
      if (obj.name.includes("scanner")) return;

      let displayLabel: string | null = null;
      let color = 0xff00ff; // Magenta for virtual default

      if (entity.hasComponent(Jugnu)) {
        displayLabel = "[ COMPANION: JUGNU ]";
        color = 0xff00ea;
      } else if (entity.hasComponent(TranscriptUI)) {
        displayLabel = "[ TELEMETRY HUD BOARD ]";
        color = 0xff8800;
      } else {
        const found = findObjectLabel(obj);
        if (found) {
          displayLabel = `[ VIRTUAL: ${found} ]`;
          if (found === "WANKHEDE STADIUM MINIMAP") {
            color = 0x00ff00;
          } else if (found === "PLAYER PROFILE CARD") {
            color = 0xff2222;
          } else if (found === "MATCH SCOREBOARD HUD") {
            color = 0xffd700;
          }
        }
      }

      if (displayLabel) {
        const key = `virtual_${entity.index}`;
        seenKeys.add(key);
        this.updateHighlighter(key, obj, displayLabel, color, pulseOpacity);
      }
    });

    // 4. Sweep and prune out highlighters that were not seen this frame
    this.activeHighlighters.forEach((h, key) => {
      if (!seenKeys.has(key)) {
        h.box.geometry.dispose();
        this.world.scene.remove(h.box);

        h.label.geometry.dispose();
        const mat = h.label.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
        this.world.scene.remove(h.label);

        this.activeHighlighters.delete(key);
      }
    });
  }

  private updateHighlighter(
    key: string,
    obj: THREE.Object3D,
    label: string,
    colorHex: number,
    pulseOpacity: number
  ) {
    // 1. Calculate bounding coordinates
    this.tempBox3.setFromObject(obj);
    this.tempBox3.getSize(this.boxSize);
    this.tempBox3.getCenter(this.boxCenter);

    // Safeguard flat plane rendering dimensions to keep outline visible
    if (this.boxSize.x < 0.02) this.boxSize.x = 0.05;
    if (this.boxSize.y < 0.02) this.boxSize.y = 0.05;
    if (this.boxSize.z < 0.02) this.boxSize.z = 0.05;

    // 2. Fetch or create the line outline & billboard meshes
    let item = this.activeHighlighters.get(key);
    if (!item) {
      const edges = new THREE.EdgesGeometry(this.unitBoxGeometry);
      const mat = this.getOrCreateLineMaterial(colorHex);
      const lineBox = new THREE.LineSegments(edges, mat);
      lineBox.name = "scanner_box";

      const labelMesh = this.createScannerLabel(label, colorHex);

      this.world.scene.add(lineBox);
      this.world.scene.add(labelMesh);

      item = { box: lineBox, label: labelMesh, colorHex };
      this.activeHighlighters.set(key, item);
    }

    // 3. Update spatial layout and dimensions
    item.box.position.copy(this.boxCenter);
    item.box.scale.copy(this.boxSize);
    
    // Apply glowing pulse opacity to outline
    const mat = item.box.material as THREE.LineBasicMaterial;
    mat.opacity = pulseOpacity;

    // Float label 12cm above the top face of the bounding box
    this.labelPos.copy(this.boxCenter);
    this.labelPos.y += this.boxSize.y / 2 + 0.12;
    item.label.position.copy(this.labelPos);

    // Make label billboard to look at user
    item.label.lookAt(this.headPos);
  }
}
