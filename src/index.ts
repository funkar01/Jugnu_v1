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
import { Jugnu, JugnuSystem } from "./jugnu.js";

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
  environmentDesk: {
    url: "./gltf/environmentDesk/environmentDesk.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  plantSansevieria: {
    url: "./gltf/plantSansevieria/plantSansevieria.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  robot: {
    url: "./gltf/robot/robot.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  jugu1: {
    url: "./gltf/jugu1/jugu1.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: true,
    sceneUnderstanding: false,
    environmentRaycast: true,
  },
}).then((world) => {
  const { camera } = world;

  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

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

  const { scene: robotMesh } = AssetManager.getGLTF("robot")!;
  robotMesh.position.set(-1.2, 0.95, -1.8);
  robotMesh.scale.setScalar(0.5);

  world
    .createTransformEntity(robotMesh)
    .addComponent(Interactable)
    .addComponent(Robot)
    .addComponent(AudioSource, {
      src: "./audio/chime.mp3",
      maxInstances: 3,
      playbackMode: PlaybackMode.FadeRestart,
    })
    .addComponent(PhysicsBody, {
      state: PhysicsState.Kinematic,
      linearDamping: 0.3,
      angularDamping: 0.3,
      gravityFactor: 0.0,
    })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.ConvexHull,
      density: 1.0,
      friction: 0.7,
      restitution: 0.05,
    });

  const juguGltf = AssetManager.getGLTF("jugu1");
  if (!juguGltf) {
    throw new Error("jugu1 asset failed to load: AssetManager.getGLTF('jugu1') returned null.");
  }
  const { scene: juguObj } = juguGltf;
  juguObj.scale.setScalar(1.0);

  const juguBounds = new Box3().setFromObject(juguObj);
  const juguSize = new Vector3();
  const juguCenter = new Vector3();
  juguBounds.getSize(juguSize);
  juguBounds.getCenter(juguCenter);
  console.log("jugu1 bounds:", {
    min: juguBounds.min.toArray(),
    max: juguBounds.max.toArray(),
    size: juguSize.toArray(),
    center: juguCenter.toArray(),
  });

  const deskTopY = 1.05;
  const targetY = deskTopY - juguBounds.min.y;
  juguObj.position.set(0, targetY, -0.8);
  
  // Update the bounding box to match the new position
  juguObj.updateMatrixWorld(true);
  juguBounds.setFromObject(juguObj);

  const boxHelper = new Box3Helper(juguBounds, 0xff0000);
  world.createTransformEntity(boxHelper);

  // Render jugu1 and make it interactable for the voice system.
  // Using Box instead of ConvexHull to prevent complex GLB geometry merge errors.
  world.createTransformEntity(juguObj)
    .addComponent(Interactable)
    .addComponent(Jugnu)
    .addComponent(PhysicsBody, {
      state: PhysicsState.Kinematic,
      gravityFactor: 0.0,
    })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
    });

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/welcome.json", // This is correct (relative)
      maxHeight: 0.8,
      maxWidth: 1.6,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: "20px",
      left: "20px",
      height: "40%",
    });
  
  if (panelEntity.object3D) {
    panelEntity.object3D.position.set(0, 1.29, -1.9);
  }

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

  world.registerSystem(PanelSystem).registerSystem(RobotSystem).registerSystem(JugnuSystem);
});