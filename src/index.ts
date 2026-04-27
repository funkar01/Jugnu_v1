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
} from "@iwsdk/core";

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
import { RoomVisualizerSystem } from "./roomVisualizer.js";
import { DomainExpansionSystem } from "./domainExpansion.js";
import { CityMapSystem } from "./cityMapSystem.js";
import { XRMenuSystem, ConsoleUI, MenuUI, ToggleAction } from "./XRMenuSystem.js";
import { XRConsoleBoard } from "./XRConsoleBoard.js";
import { XRMenuBoard } from "./XRMenuBoard.js";
import { ACESFilmicToneMapping } from "three";

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
  domainEnv: {
    url: "./Domains/Domain.png",
    type: AssetType.Texture,
    priority: "critical",
  },
  domainEnv1: {
    url: "./Domains/Domain1.png",
    type: AssetType.Texture,
    priority: "critical",
  },
  domainEnv2: {
    url: "./Domains/Domain2.png",
    type: AssetType.Texture,
    priority: "critical",
  },
  domainEnv3: {
    url: "./Domains/Domain3.png",
    type: AssetType.Texture,
    priority: "critical",
  },
  thumb_domainEnv: {
    url: "./Domains/thumbs/thumb_Domain.jpg",
    type: AssetType.Texture,
    priority: "critical",
  },
  thumb_domainEnv1: {
    url: "./Domains/thumbs/thumb_Domain1.jpg",
    type: AssetType.Texture,
    priority: "critical",
  },
  thumb_domainEnv2: {
    url: "./Domains/thumbs/thumb_Domain2.jpg",
    type: AssetType.Texture,
    priority: "critical",
  },
  thumb_domainEnv3: {
    url: "./Domains/thumbs/thumb_Domain3.jpg",
    type: AssetType.Texture,
    priority: "critical",
  },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      handTracking: true,
      meshDetection: true,
      planeDetection: true
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
    .addComponent(PhysicsBody, {
      state: PhysicsState.Kinematic,
      gravityFactor: 0.0,
      linearDamping: 0.1,
      angularDamping: 0.1,
    })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Sphere,
      dimensions: [0.15, 0.15, 0.15],
      restitution: 0.95,
      friction: 0.05,
      density: 1.0
    });

  const transcriptBoard = new JugnuTranscriptBoard();
  transcriptBoard.position.set(1.0, deskTopY + 0.5, -1.0);
  transcriptBoard.rotation.y = -Math.PI / 8; // Angled slightly towards the user
  world.createTransformEntity(transcriptBoard)
    .addComponent(TranscriptUI)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget })
    .addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: [1.6, 1.6, 0.05] });

  const consoleBoard = new XRConsoleBoard();
  consoleBoard.position.set(-1.0, deskTopY + 0.5, -1.0);
  consoleBoard.rotation.y = Math.PI / 8; // Angled slightly towards the user
  world.createTransformEntity(consoleBoard)
    .addComponent(ConsoleUI)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget })
    .addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: [1.6, 1.6, 0.05] });

  const menuBoard = new XRMenuBoard();
  menuBoard.visible = false;
  // We'll let the XRMenuSystem manage the menuBoard's position and visibility when the gesture is triggered
  world.createTransformEntity(menuBoard)
    .addComponent(MenuUI)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget })
    .addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: [0.8, 0.8, 0.05] });
  
  world.createTransformEntity(menuBoard.buttonConsole)
    .addComponent(Interactable)
    .addComponent(ToggleAction, { action: "console" });
  
  world.createTransformEntity(menuBoard.buttonTranscript)
    .addComponent(Interactable)
    .addComponent(ToggleAction, { action: "transcript" });
  
  world.createTransformEntity(menuBoard.buttonEdges)
    .addComponent(Interactable)
    .addComponent(ToggleAction, { action: "scan_edges" });



  world.registerSystem(PanelSystem).registerSystem(RobotSystem).registerSystem(JugnuSystem).registerSystem(RoomVisualizerSystem).registerSystem(DomainExpansionSystem).registerSystem(CityMapSystem).registerSystem(XRMenuSystem);
});