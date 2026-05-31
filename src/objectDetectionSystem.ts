import {
  createSystem,
  XRMesh,
  XRPlane,
  Transform,
  Interactable,
  AudioUtils,
} from "@iwsdk/core";
import { Jugnu, TranscriptUI } from "./jugnu.js";
import { JugnuAudioSynth } from "./audioSynth.js";
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

  // Bounding boxes cache: using Meshes (solid translucent + wireframe child)
  private activeHighlighters = new Map<
    string,
    {
      box: THREE.Mesh;
      label: THREE.Mesh;
      colorHex: number;
      boxEntity: any;
      labelEntity: any;
    }
  >();
  private unitBoxGeometry!: THREE.BoxGeometry;

  // Scanner HUD Screen assets
  private hudMesh: THREE.Mesh | null = null;
  private hudEntity: any = null;
  private hudCanvas!: HTMLCanvasElement;
  private hudCtx!: CanvasRenderingContext2D;
  private hudTexture!: THREE.CanvasTexture;
  
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

    // Stable joints for checking extended vs curled positions relative to the wrist
    const indexTip = source.hand.get("index-finger-tip");
    const middleTip = source.hand.get("middle-finger-tip");
    const ringTip = source.hand.get("ring-finger-tip");
    const pinkyTip = source.hand.get("pinky-finger-tip");
    const wrist = source.hand.get("wrist");

    if (!indexTip || !middleTip || !ringTip || !pinkyTip || !wrist) {
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

    const dIndex = getPoseDist(indexTip, wrist);
    const dMiddle = getPoseDist(middleTip, wrist);
    const dRing = getPoseDist(ringTip, wrist);
    const dPinky = getPoseDist(pinkyTip, wrist);

    // Fail-safe check
    if (dIndex > 500.0 || dMiddle > 500.0 || dRing > 500.0 || dPinky > 500.0) {
      return false;
    }

    // Heuristics:
    // 1. Extended fingers (index & middle) should be far from the wrist (> 7.5cm)
    // 2. Curled fingers (ring & pinky) should be closer to the wrist (< 11cm for ring, < 10cm for pinky)
    // 3. To handle all hand sizes robustly, use relative checks:
    //    The index tip should be at least 2.5cm further from the wrist than the curled ring finger tip.
    //    The middle tip should be at least 2.5cm further from the wrist than the curled pinky finger tip.
    const isIndexExtended = dIndex > 0.075 && dIndex > dRing + 0.025;
    const isMiddleExtended = dMiddle > 0.075 && dMiddle > dPinky + 0.025;
    const isRingCurled = dRing < 0.11;
    const isPinkyCurled = dPinky < 0.10;

    return isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled;
  }

  private toggleScanning() {
    this.isScanning = !this.isScanning;
    this.gestureCooldown = 1.5; // Cooldown to prevent instant bouncing

    // Resume and play synthesized scanner sweep sound
    JugnuAudioSynth.resume();
    JugnuAudioSynth.playScannerSweep();

    // 1. Play spatial sound effect via AudioUtils (SDK standard) with HTML5 fallback
    try {
      AudioUtils.createOneShot(this.world, "./audio/chime.mp3", { volume: 0.45 });
    } catch (e) {
      console.warn("Audio play failed via AudioUtils:", e);
      try {
        const audioUrl = new URL("audio/chime.mp3", window.location.href).href;
        const audio = new Audio(audioUrl);
        audio.volume = 0.45;
        audio.play().catch((err) => console.warn("Fallback audio play failed:", err));
      } catch (err) {
        console.warn("Audio context suspended or failed:", err);
      }
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
          "TRIGGER: Peace Gesture (Single Hand)",
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
      // Dispose entities via ECS engine to safely clean up Three.js scene parentings
      if (h.boxEntity) {
        if (typeof h.boxEntity.dispose === "function") h.boxEntity.dispose();
        else h.boxEntity.destroy();
      }
      if (h.labelEntity) {
        if (typeof h.labelEntity.dispose === "function") h.labelEntity.dispose();
        else h.labelEntity.destroy();
      }

      // Dispose underlying geometries and materials to avoid GPU memory leaks
      h.box.geometry.dispose();
      const wire = h.box.getObjectByName("scanner_wireframe") as THREE.Mesh;
      if (wire) {
        wire.geometry.dispose();
        (wire.material as THREE.Material).dispose();
      }
      const mat = h.box.material as THREE.Material;
      mat.dispose();

      h.label.geometry.dispose();
      const lblMat = h.label.material as THREE.MeshBasicMaterial;
      lblMat.map?.dispose();
      lblMat.dispose();
    });
    this.activeHighlighters.clear();

    // Destroy the Scanner HUD Screen
    this.destroyHUD();
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

    // Draw high-contrast text with dark stroke background to support bright AR backgrounds
    ctx.font = "bold 34px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(5, 5, 10, 0.95)";
    ctx.lineWidth = 6;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = "#ffffff";
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

  private updateHUD(detectedLabels: string[]) {
    if (!this.hudCanvas) {
      this.hudCanvas = document.createElement("canvas");
      this.hudCanvas.width = 512;
      this.hudCanvas.height = 512;
      this.hudCtx = this.hudCanvas.getContext("2d")!;
      this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
      this.hudTexture.colorSpace = THREE.SRGBColorSpace;
    }

    const ctx = this.hudCtx;
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;

    // Clear Screen
    ctx.clearRect(0, 0, w, h);

    // Frame backdrop - dark obsidian
    ctx.fillStyle = "rgba(10, 15, 30, 0.9)";
    ctx.strokeStyle = "rgba(0, 255, 234, 0.85)";
    ctx.lineWidth = 6;
    
    const r = 24;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.lineTo(w, r);
    ctx.lineTo(w, h - r);
    ctx.lineTo(w - r, h);
    ctx.lineTo(r, h);
    ctx.lineTo(0, h - r);
    ctx.lineTo(0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner glowing thin accent boundary
    ctx.strokeStyle = "rgba(0, 255, 234, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r + 8, 8);
    ctx.lineTo(w - r - 8, 8);
    ctx.lineTo(w - 8, r + 8);
    ctx.lineTo(w - 8, h - r - 8);
    ctx.lineTo(w - r - 8, h - 8);
    ctx.lineTo(r + 8, h - 8);
    ctx.lineTo(8, h - r - 8);
    ctx.lineTo(8, r + 8);
    ctx.closePath();
    ctx.stroke();

    // Double-pass text renderer helper to guarantee AR legibility
    const drawText = (txt: string, tx: number, ty: number, fontStr: string, fillCol: string, align: CanvasTextAlign = "left") => {
      ctx.font = fontStr;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(5, 5, 10, 0.95)";
      ctx.lineWidth = 6;
      ctx.strokeText(txt, tx, ty);
      ctx.fillStyle = fillCol;
      ctx.fillText(txt, tx, ty);
    };

    // Radar Header
    drawText("[ SPATIAL RADAR HUD ]", w / 2, 45, "bold 28px Courier New, monospace", "rgba(0, 255, 234, 1.0)", "center");

    // Divider Line
    ctx.beginPath();
    ctx.moveTo(20, 65);
    ctx.lineTo(w - 20, 65);
    ctx.strokeStyle = "rgba(0, 255, 234, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Core Status Readout
    drawText("STATUS: SCANNING ENVIRONMENT...", 40, 100, "bold 20px Courier New, monospace", "rgba(255, 255, 255, 0.85)");
    
    const refreshHz = Math.floor(88 + Math.random() * 4);
    drawText(`${refreshHz} FPS`, w - 40, 100, "bold 20px Courier New, monospace", "rgba(255, 255, 255, 0.85)", "right");

    // Dynamic sweeping neon scanline
    const scanLineY = 120 + ((this.pulseTime * 140) % 360);
    ctx.fillStyle = "rgba(0, 255, 234, 0.05)";
    ctx.fillRect(15, 120, w - 30, scanLineY - 120);

    ctx.beginPath();
    ctx.moveTo(15, scanLineY);
    ctx.lineTo(w - 15, scanLineY);
    ctx.strokeStyle = "rgba(0, 255, 234, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Background HUD gridlines
    ctx.strokeStyle = "rgba(0, 255, 234, 0.04)";
    ctx.lineWidth = 1;
    for (let xGrid = 30; xGrid < w - 20; xGrid += 40) {
      ctx.beginPath();
      ctx.moveTo(xGrid, 120);
      ctx.lineTo(xGrid, h - 20);
      ctx.stroke();
    }
    for (let yGrid = 130; yGrid < h - 20; yGrid += 40) {
      ctx.beginPath();
      ctx.moveTo(20, yGrid);
      ctx.lineTo(w - 20, yGrid);
      ctx.stroke();
    }

    // List of detected components
    drawText(`DETECTED OBJECTS (${detectedLabels.length}):`, 40, 145, "bold 22px Courier New, monospace", "rgba(255, 255, 255, 0.95)");

    let startY = 185;
    const maxEntries = 12;
    const displayedEntries = detectedLabels.slice(0, maxEntries);

    if (displayedEntries.length === 0) {
      drawText("> CALIBRATING FEED...", 60, startY, "18px Courier New, monospace", "rgba(255, 215, 0, 0.85)");
    } else {
      displayedEntries.forEach((label) => {
        // High-tech prefix highlights
        const col = label.includes("PHYSICAL") ? "rgba(0, 255, 234, 0.95)" : "rgba(255, 0, 234, 0.95)";
        drawText(`+ ${label}`, 60, startY, "18px Courier New, monospace", col);
        startY += 25;
      });
    }

    this.hudTexture.needsUpdate = true;
  }

  private getOrCreateHUD(): THREE.Mesh {
    if (!this.hudMesh) {
      this.updateHUD([]);
      const mat = new THREE.MeshBasicMaterial({
        map: this.hudTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const geom = new THREE.PlaneGeometry(0.42, 0.42); // Stately 42x42 cm HUD Panel
      this.hudMesh = new THREE.Mesh(geom, mat);
      this.hudMesh.name = "scanner_hud";
      
      // Register with the ECS engine to make it visible in WebXR
      this.hudEntity = this.world.createTransformEntity(this.hudMesh);
    }
    return this.hudMesh;
  }

  private destroyHUD() {
    if (this.hudEntity) {
      if (typeof this.hudEntity.dispose === "function") this.hudEntity.dispose();
      else this.hudEntity.destroy();
      this.hudEntity = null;
      this.hudMesh = null;
    }
  }

  update(dt: number) {
    this.pulseTime += dt;

    // 1. Cooldown mechanics
    if (this.gestureCooldown > 0) {
      this.gestureCooldown -= dt;
    }

    // 2. Headset hand gesture & controller squeeze verification
    if (this.gestureCooldown <= 0) {
      let inputTriggered = false;

      // 2a. Check hand tracking peace sign
      const refSpace = this.renderer.xr.getReferenceSpace();
      if (refSpace) {
        const leftPeace = this.isPeaceSign("left", refSpace);
        const rightPeace = this.isPeaceSign("right", refSpace);
        if (leftPeace || rightPeace) {
          inputTriggered = true;
        }
      }

      // 2b. Check controller squeeze button fallback (if hand tracking is not active)
      if (!inputTriggered) {
        const leftSource = this.input.getPrimaryInputSource("left");
        const rightSource = this.input.getPrimaryInputSource("right");

        const isControllerSqueezed = (source: any) => {
          if (!source || !source.gamepad) return false;
          // Squeeze/Grip button is index 1
          const gripButton = source.gamepad.buttons[1];
          return gripButton && gripButton.pressed;
        };

        if (isControllerSqueezed(leftSource) || isControllerSqueezed(rightSource)) {
          inputTriggered = true;
        }
      }

      if (inputTriggered) {
        this.peaceGestureTimer += dt;
        if (this.peaceGestureTimer >= 0.4) {
          this.toggleScanning();
          this.peaceGestureTimer = 0.0;
        }
      } else {
        this.peaceGestureTimer = 0.0;
      }
    }

    if (!this.isScanning) {
      return;
    }

    // 3. Update and float the sci-fi Status HUD Screen
    const hud = this.getOrCreateHUD();
    this.player.head.getWorldPosition(this.headPos);

    // Compute player's viewing vectors
    const headQuat = new THREE.Quaternion();
    this.player.head.getWorldQuaternion(headQuat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
    forward.y = 0;
    forward.normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat);
    rightVec.y = 0;
    rightVec.normalize();

    // Position HUD screen: floating 0.60m forward, 15cm to the left, slightly below eye level (very comfortable)
    const targetHudPos = this.headPos.clone()
      .addScaledVector(forward, 0.60)
      .addScaledVector(rightVec, -0.15);
    targetHudPos.y = this.headPos.y - 0.12;

    // Smooth lazy-following lag for comfortable VR visibility
    hud.position.lerp(targetHudPos, 4.0 * dt);
    hud.lookAt(this.headPos);
    hud.rotateY(Math.PI); // Rotate 180 degrees so the front face faces the player!

    // 4. Bounding highlight rendering
    const seenKeys = new Set<string>();
    const detectedLabels: string[] = [];

    // Category 1: Room Planes
    this.queries.planes.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj) return;

      const _plane = entity.getValue(XRPlane, "_plane") as any;
      let rawLabel = "plane";
      if (_plane) {
        if (_plane.orientation === "vertical") {
          rawLabel = "wall";
        } else if (_plane.orientation === "horizontal") {
          // Heuristic classification based on height
          const y = obj.position.y;
          if (y < 0.2) {
            rawLabel = "floor";
          } else if (y > 2.0) {
            rawLabel = "ceiling";
          } else {
            rawLabel = "table/surface";
          }
        }
      }
      const displayLabel = `[ PHYSICAL: ${rawLabel.toUpperCase()} ]`;
      const color = 0x00ffff; // Cyan
      const key = `plane_${entity.index}`;
      seenKeys.add(key);
      detectedLabels.push(displayLabel);

      this.updateHighlighter(key, obj, displayLabel, color);
    });

    // Category 2: Bounded 3D Room Meshes
    this.queries.meshes.entities.forEach((entity) => {
      const obj = entity.object3D;
      const isBounded = entity.getValue(XRMesh, "isBounded3D");
      if (!obj || !isBounded) return;

      const rawLabel = entity.getValue(XRMesh, "semanticLabel") || "object";
      const displayLabel = `[ PHYSICAL: ${rawLabel.toUpperCase()} ]`;
      const color = 0xaaff00; // Neon Green
      const key = `mesh_${entity.index}`;
      seenKeys.add(key);
      detectedLabels.push(displayLabel);

      this.updateHighlighter(key, obj, displayLabel, color);
    });

    // Category 3: Spatial Companion & Virtual Objects
    this.queries.transforms.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj || !obj.visible) return;

      if (entity.hasComponent(XRPlane) || entity.hasComponent(XRMesh)) return;
      if (obj.name.includes("scanner")) return;

      let displayLabel: string | null = null;
      let color = 0xff00ff; // Magenta

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
        detectedLabels.push(displayLabel);
        this.updateHighlighter(key, obj, displayLabel, color);
      }
    });

    // Update canvas texture on Scanner HUD Screen
    this.updateHUD(detectedLabels);

    // 5. Sweep inactive highlights
    this.activeHighlighters.forEach((h, key) => {
      if (!seenKeys.has(key)) {
        // Dispose of entities first
        if (h.boxEntity) {
          if (typeof h.boxEntity.dispose === "function") h.boxEntity.dispose();
          else h.boxEntity.destroy();
        }
        if (h.labelEntity) {
          if (typeof h.labelEntity.dispose === "function") h.labelEntity.dispose();
          else h.labelEntity.destroy();
        }

        // Clean materials/geometries
        h.box.geometry.dispose();
        const wire = h.box.getObjectByName("scanner_wireframe") as THREE.Mesh;
        if (wire) {
          wire.geometry.dispose();
          (wire.material as THREE.Material).dispose();
        }
        const mat = h.box.material as THREE.Material;
        mat.dispose();

        h.label.geometry.dispose();
        const lblMat = h.label.material as THREE.MeshBasicMaterial;
        lblMat.map?.dispose();
        lblMat.dispose();

        this.activeHighlighters.delete(key);
      }
    });
  }

  private updateHighlighter(
    key: string,
    obj: THREE.Object3D,
    label: string,
    colorHex: number
  ) {
    // Temporarily force visibility to true so Box3.setFromObject can compute the correct bounds
    const originalVisible = obj.visible;
    obj.visible = true;

    const hiddenChildren: THREE.Object3D[] = [];
    obj.traverse((child) => {
      if (!child.visible) {
        child.visible = true;
        hiddenChildren.push(child);
      }
    });

    this.tempBox3.setFromObject(obj);

    // Restore original visibility states
    obj.visible = originalVisible;
    hiddenChildren.forEach((child) => {
      child.visible = false;
    });

    this.tempBox3.getSize(this.boxSize);
    this.tempBox3.getCenter(this.boxCenter);

    // Fallback: If calculations returned NaN or invalid sizes, center on the object's position
    if (isNaN(this.boxCenter.x) || isNaN(this.boxCenter.y) || isNaN(this.boxCenter.z) ||
        this.boxSize.x <= 0 || this.boxSize.y <= 0 || this.boxSize.z <= 0) {
      obj.getWorldPosition(this.boxCenter);
      this.boxSize.set(0.4, 0.4, 0.4); // Stately default size
    }

    if (this.boxSize.x < 0.02) this.boxSize.x = 0.05;
    if (this.boxSize.y < 0.02) this.boxSize.y = 0.05;
    if (this.boxSize.z < 0.02) this.boxSize.z = 0.05;

    let item = this.activeHighlighters.get(key);
    if (!item) {
      // 1. Solid Volumetric visual box backing
      const solidMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      });
      const solidBox = new THREE.Mesh(this.unitBoxGeometry, solidMat);
      solidBox.name = "scanner_box";

      // 2. Wireframe overlay for glowing outlines
      const wireMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const wireMesh = new THREE.Mesh(this.unitBoxGeometry, wireMat);
      wireMesh.name = "scanner_wireframe";
      solidBox.add(wireMesh);

      // 3. Floating billboard label
      const labelMesh = this.createScannerLabel(label, colorHex);

      // Register both with the ECS engine so they appear in WebXR
      const boxEntity = this.world.createTransformEntity(solidBox);
      const labelEntity = this.world.createTransformEntity(labelMesh);

      item = { box: solidBox, label: labelMesh, colorHex, boxEntity, labelEntity };
      this.activeHighlighters.set(key, item);
    }

    // Sync position and scale with live world coords
    item.box.position.copy(this.boxCenter);
    item.box.scale.copy(this.boxSize);
    
    // Animate rhythmic glowing opacity updates
    const backingMat = item.box.material as THREE.MeshBasicMaterial;
    backingMat.opacity = 0.10 + 0.06 * Math.sin(this.pulseTime * 6.0);

    const wire = item.box.getObjectByName("scanner_wireframe") as THREE.Mesh;
    if (wire) {
      const wireMat = wire.material as THREE.MeshBasicMaterial;
      wireMat.opacity = 0.35 + 0.15 * Math.sin(this.pulseTime * 6.0);
    }

    // Float label 12cm above the top of the bounding box
    this.labelPos.copy(this.boxCenter);
    this.labelPos.y += this.boxSize.y / 2 + 0.12;
    item.label.position.copy(this.labelPos);
    item.label.lookAt(this.headPos);
    item.label.rotateY(Math.PI); // Rotate 180 degrees so the front face faces the player!
  }
}
