import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  Box3,
  Box3Helper,
  Vector3,
  stencilMaterial,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
} from "@iwsdk/core";

// Configure hand stencil material to act as a holdout (occlusion) mask showing passthrough
if (stencilMaterial) {
  stencilMaterial.colorWrite = false;
  stencilMaterial.transparent = false;
  stencilMaterial.depthWrite = true;
  stencilMaterial.depthTest = true;
  stencilMaterial.needsUpdate = true;
}


import {
  AudioSource,
  DistanceGrabbable,
  MovementMode,
  Interactable,
  PanelUI,
  PlaybackMode,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  ScreenSpace,
} from "@iwsdk/core";

import { EnvironmentType, LocomotionEnvironment } from "@iwsdk/core";
import { PanelSystem } from "./panel.js";
import { Robot, RobotSystem } from "./robot.js";
import { Jugnu, JugnuSystem, TranscriptUI } from "./jugnu.js";
import { JugnuV3Model } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import { JugnuDebugBoard } from "./JugnuDebugBoard.js";
import { RoomVisualizerSystem } from "./roomVisualizer.js";
import { DomainExpansionSystem } from "./domainExpansion.js";
import { CityMapSystem } from "./cityMapSystem.js";
import { ObjectDetectionSystem } from "./objectDetectionSystem.js";
import { ACESFilmicToneMapping, Color, GridHelper, Material } from "three";

export const IS_DEV = ((import.meta as any).env.VITE_DEBUG_MODE === "true") || (import.meta as any).env.DEV;

// FIX: Changed paths to use "./" (Relative) instead of "/" (Absolute)
const assets: AssetManifest = {

  chimeSound: {
    url: "./audio/chime.mp3", // Changed from /audio/
    type: AssetType.Audio,
    priority: "background",
  },
  webxr: {
    url: "./textures/webxr.png", // Changed from /textures/
    type: AssetType.Texture,
    priority: "critical",
  },
  // environmentDesk: {
  //   url: "./gltf/environmentDesk/environmentDesk.gltf",
  //   type: AssetType.GLTF,
  //   priority: "critical",
  // },
  // plantSansevieria: {
  //   url: "./gltf/plantSansevieria/plantSansevieria.gltf",
  //   type: AssetType.GLTF,
  //   priority: "critical",
  // },
  robot: {
    url: "./gltf/robot/robot.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  wankhede: {
    url: "./gltf/Wankhede Stadium/Wankhede.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  olympiastadion: {
    url: "./gltf/Olympiastadion/Olympiastadion.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  iplCam1: {
    url: "./Domains/IPLfinal (1).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  iplCam2: {
    url: "./Domains/IPLfinal (2).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  iplCam3: {
    url: "./Domains/IPLfinal (3).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  iplCam4: {
    url: "./Domains/IPLfinal (4).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  iplCam5: {
    url: "./Domains/IPLfinal (5).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  iplCam6: {
    url: "./Domains/IPLfinal (6).png",
    type: AssetType.Texture,
    priority: "critical",
  },
  // ── Berlin (Football) 360 panoramas — 6 views ───────────────────────────
  berlin360_1: { url: "./360Videos/Berlin_01.png", type: AssetType.Texture, priority: "critical" },
  berlin360_2: { url: "./360Videos/Berlin_02.png", type: AssetType.Texture, priority: "critical" },
  berlin360_3: { url: "./360Videos/Berlin_03.png", type: AssetType.Texture, priority: "critical" },
  berlin360_4: { url: "./360Videos/Berlin_04.png", type: AssetType.Texture, priority: "critical" },
  berlin360_5: { url: "./360Videos/Berlin_05.png", type: AssetType.Texture, priority: "critical" },
  berlin360_6: { url: "./360Videos/Berlin_06.png", type: AssetType.Texture, priority: "critical" },
  berlin360_1_thumb: { url: "./360Videos/Berlin_01_thumb.jpg", type: AssetType.Texture, priority: "background" },
  berlin360_2_thumb: { url: "./360Videos/Berlin_02_thumb.jpg", type: AssetType.Texture, priority: "background" },
  berlin360_3_thumb: { url: "./360Videos/Berlin_03_thumb.jpg", type: AssetType.Texture, priority: "background" },
  berlin360_4_thumb: { url: "./360Videos/Berlin_04_thumb.jpg", type: AssetType.Texture, priority: "background" },
  berlin360_5_thumb: { url: "./360Videos/Berlin_05_thumb.jpg", type: AssetType.Texture, priority: "background" },
  berlin360_6_thumb: { url: "./360Videos/Berlin_06_thumb.jpg", type: AssetType.Texture, priority: "background" },
  // ── Inuit/LA (Basketball) 360 panoramas — 6 views ───────────────────────
  inuit360_1: { url: "./360Videos/Inuit_01.png", type: AssetType.Texture, priority: "critical" },
  inuit360_2: { url: "./360Videos/Inuit_02.png", type: AssetType.Texture, priority: "critical" },
  inuit360_3: { url: "./360Videos/Inuit_03.png", type: AssetType.Texture, priority: "critical" },
  inuit360_4: { url: "./360Videos/Inuit_04.png", type: AssetType.Texture, priority: "critical" },
  inuit360_5: { url: "./360Videos/Inuit_05.png", type: AssetType.Texture, priority: "critical" },
  inuit360_6: { url: "./360Videos/Inuit_06.png", type: AssetType.Texture, priority: "critical" },
  inuit360_1_thumb: { url: "./360Videos/Inuit_01_thumb.jpg", type: AssetType.Texture, priority: "background" },
  inuit360_2_thumb: { url: "./360Videos/Inuit_02_thumb.jpg", type: AssetType.Texture, priority: "background" },
  inuit360_3_thumb: { url: "./360Videos/Inuit_03_thumb.jpg", type: AssetType.Texture, priority: "background" },
  inuit360_4_thumb: { url: "./360Videos/Inuit_04_thumb.jpg", type: AssetType.Texture, priority: "background" },
  inuit360_5_thumb: { url: "./360Videos/Inuit_05_thumb.jpg", type: AssetType.Texture, priority: "background" },
  inuit360_6_thumb: { url: "./360Videos/Inuit_06_thumb.jpg", type: AssetType.Texture, priority: "background" },
  // RCB Player Cards (IPL 2026 Final) — full squad
  rcbKohli:       { url: "./RCBCards/RCB_Name_VIRAT KOHLI.jpeg",        type: AssetType.Texture, priority: "background" },
  rcbPatidar:     { url: "./RCBCards/RCB_Name_RAJAT PATIDAR.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbSalt:        { url: "./RCBCards/RCB_Name_PHIL SALT.jpeg",          type: AssetType.Texture, priority: "background" },
  rcbTimDavid:    { url: "./RCBCards/RCB_Name_TIM DAVID.jpeg",          type: AssetType.Texture, priority: "background" },
  rcbJitesh:      { url: "./RCBCards/RCB_Name_JITESH SHARMA.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbKrunal:      { url: "./RCBCards/RCB_Name_KRUNAL PANDYA.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbBhuvi:       { url: "./RCBCards/RCB_Name_BHUVNESHWAR KUMAR.jpeg",  type: AssetType.Texture, priority: "background" },
  rcbDevdutt:     { url: "./RCBCards/RCB_Name_DEVDUTT PADIKKAL.jpeg",   type: AssetType.Texture, priority: "background" },
  rcbJordanCox:   { url: "./RCBCards/RCB_Name_JORDAN COX.jpeg",         type: AssetType.Texture, priority: "background" },
  rcbBethell:     { url: "./RCBCards/RCB_Name_JACOB BETHELL.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbDuffy:       { url: "./RCBCards/RCB_Name_JACOB DUFFY.jpeg",        type: AssetType.Texture, priority: "background" },
  rcbHazlewood:   { url: "./RCBCards/RCB_Name_JOSH HAZELWOOD.jpeg",     type: AssetType.Texture, priority: "background" },
  rcbShepherd:    { url: "./RCBCards/RCB_Name_ROMARIO SHEPHERD.jpeg",   type: AssetType.Texture, priority: "background" },
  rcbSatvik:      { url: "./RCBCards/RCB_Name_SATVIK DESWAL.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbSuyash:      { url: "./RCBCards/RCB_Name_SUYASH SHARMA.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbSwapnil:     { url: "./RCBCards/RCB_Name_SWAPNIL SINGH.jpeg",      type: AssetType.Texture, priority: "background" },
  rcbVenkatesh:   { url: "./RCBCards/RCB_Name_VENKATESH IYER.jpeg",     type: AssetType.Texture, priority: "background" },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      handTracking: true,
      meshDetection: true,
      planeDetection: true,
      hitTest: true,
      anchors: true
    }
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: true,
    sceneUnderstanding: true,
    environmentRaycast: true,
  },
}).then((world) => {
  const { camera, renderer } = world;

  if (renderer) {
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.outputColorSpace = SRGBColorSpace;
  }

  // Set premium B2B dark slate-navy scene background
  world.scene.background = new Color(0x020617);

  // Overhaul desktop fallback environment: Create a premium Holographic Holodeck Grid
  const holodeckGrid = new GridHelper(30, 60, 0x00ffff, 0x0f172a);
  holodeckGrid.position.y = 0.01;
  if (holodeckGrid.material instanceof Material) {
      holodeckGrid.material.transparent = true;
      holodeckGrid.material.opacity = 0.22;
  }
  world.scene.add(holodeckGrid);

  // Premium High-Fidelity Spatial Lighting Setup
  const ambientLight = new AmbientLight(0x0f172a, 0.5); // Cool blue-slate shadow fill
  world.createTransformEntity(ambientLight);

  const hemiLight = new HemisphereLight(0xffffff, 0x3b3f46, 1.6); // Sky/ground natural ambient light
  world.createTransformEntity(hemiLight);

  const dirLight = new DirectionalLight(0xfffbf4, 2.4); // Warm key sunlight
  dirLight.position.set(4, 10, 3);
  world.createTransformEntity(dirLight);

  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  /*
  const { scene: envMesh } = AssetManager.getGLTF("environmentDesk")!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.1, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC })
    .addComponent(PhysicsBody, {
      state: PhysicsState.Static,
      linearDamping: 0.0,
      angularDamping: 0.0,
      gravityFactor: 0.0,
    })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.TriMesh,
      density: 1.0,
      friction: 0.9,
      restitution: 0.0,
    });
  */

  /*
  const { scene: plantMesh } = AssetManager.getGLTF("plantSansevieria")!;
  plantMesh.position.set(1.2, 1.00, -1.8);
  world
    .createTransformEntity(plantMesh)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    })
    .addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      linearDamping: 0.2,
      angularDamping: 0.2,
      gravityFactor: 1.0,
    })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.ConvexHull,
      density: 0.3,
      friction: 0.8,
      restitution: 0.1,
    });
  */



  const juguModel = new JugnuV3Model();
  
  // Ensure Jugnu floats above desk instead of using bounds logic (which breaks due to 12m plane)
  const deskTopY = 1.05;
  juguModel.position.set(0, deskTopY + 0.4, -0.8);
  juguModel.updateMatrixWorld(true);

  // Render JugnuV2 and make it interactable for the voice system.
  // Using Box instead of ConvexHull to prevent complex procedural geometry merge errors.
  world.createTransformEntity(juguModel)
    .addComponent(Interactable)
    .addComponent(Jugnu)
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Sphere,
      dimensions: [0.15, 0.0, 0.0],
      restitution: 0.95,
      friction: 0.05,
      density: 1.0
    })
    .addComponent(PhysicsBody, {
      state: PhysicsState.Kinematic,
      gravityFactor: 0.0,
    });

  // Hide the glowing green physics box helper
  /*
  if (IS_DEV) {
    const box = new Box3();
    box.setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(0.3, 0.3, 0.3));
    const debugBoxHelper = new Box3Helper(box, 0x00ff00); // Glowing green physics box helper
    juguModel.add(debugBoxHelper);
  }
  */

  // Removed from physical space to be embedded inside the Compass UI as tabs
  /*
  const transcriptBoard = new JugnuTranscriptBoard();
  transcriptBoard.position.set(1.0, deskTopY + 0.5, -1.0);
  transcriptBoard.rotation.y = -Math.PI / 8; // Angled slightly towards the user
  world.createTransformEntity(transcriptBoard)
    .addComponent(TranscriptUI);

  if (IS_DEV) {
    const debugBoard = new JugnuDebugBoard();
    debugBoard.position.set(-1.0, deskTopY + 0.5, -1.0);
    debugBoard.rotation.y = Math.PI / 8; // Angled slightly towards the user (mirrors transcript board)
    world.createTransformEntity(debugBoard);
  }
  */




  /*
  const webxrLogoTexture = AssetManager.getTexture("webxr")!;
  webxrLogoTexture.colorSpace = SRGBColorSpace;
  const logoBanner = new Mesh(
    new PlaneGeometry(3.39, 0.96),
    new MeshBasicMaterial({
      map: webxrLogoTexture,
      transparent: true,
    }),
  );
  world.createTransformEntity(logoBanner);
  logoBanner.position.set(0, 1, 1.8);
  logoBanner.rotateY(Math.PI);
  */

  world.registerSystem(PanelSystem).registerSystem(JugnuSystem).registerSystem(RoomVisualizerSystem).registerSystem(DomainExpansionSystem).registerSystem(CityMapSystem).registerSystem(ObjectDetectionSystem);
});