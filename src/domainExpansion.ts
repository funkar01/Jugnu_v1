import { createSystem, AssetManager } from "@iwsdk/core";
import * as THREE from "three";
import { Jugnu } from "./jugnu.js";

interface PlayerMarker {
    id: string;
    name: string;
    role: 'fielder' | 'batsman' | 'umpire';
    jersey: string;
    team: 'blue' | 'yellow' | 'neutral';
    originalBasePos: THREE.Vector3;
    targetPos: THREE.Vector3;
    currentPos: THREE.Vector3;
    speed: number;
    stats: {
        primary: string;
        secondary: string;
    };
    group: THREE.Group;
    mesh: THREE.Mesh;
    ring: THREE.Mesh;
    tag: THREE.Mesh;
    statsCard: THREE.Group;
    hoverScale: number;
    isHovered: boolean;
}

const applyStadiumMaterial = (mat: THREE.Material | undefined, name: string, parentName: string): THREE.Material => {
    const newMat = new THREE.MeshStandardMaterial();
    if (mat) {
        if (typeof (mat as any).copy === 'function') {
            try {
                newMat.copy(mat as any);
            } catch (e) {
                if ((mat as any).color) newMat.color.copy((mat as any).color);
                if ((mat as any).map) newMat.map = (mat as any).map;
            }
        } else {
            if ((mat as any).color) newMat.color.copy((mat as any).color);
            if ((mat as any).map) newMat.map = (mat as any).map;
        }
    }
    
    const isMatch = (str: string) => name.includes(str) || parentName.includes(str);
    
    if (isMatch('court') || isMatch('hardwood') || isMatch('floor')) {
        // High-gloss premium NBA hardwood floor reflecting cyber overlays!
        newMat.roughness = 0.05;
        newMat.metalness = 0.22;
        if (!newMat.map && mat && (mat as any).map) {
            newMat.map = (mat as any).map;
        }
        if (!newMat.map) {
            newMat.color.setHex(0xb45309); // Honey maple wood fallback
        }
        newMat.transparent = true;
        newMat.opacity = 0.60; // Holographic semi-transparent playing field base
    } else if (isMatch('paint') || isMatch('key') || isMatch('restrict')) {
        // Vibrant neon purple/cyan painted key lanes
        newMat.roughness = 0.08;
        newMat.metalness = 0.3;
        if (!newMat.map) {
            newMat.color.setHex(0x6d28d9); // Cyber neon violet key fallback
        }
        newMat.transparent = true;
        newMat.opacity = 0.60;
    } else if (isMatch('field') || isMatch('grass')) {
        newMat.color.setHex(0x113e19);
        newMat.roughness = 0.85;
        newMat.metalness = 0.05;
        newMat.transparent = true;
        newMat.opacity = 0.60;
    } else if (isMatch('pitch') || isMatch('wicket')) {
        newMat.color.setHex(0xc2a679);
        newMat.roughness = 0.9;
        newMat.metalness = 0.0;
        newMat.transparent = true;
        newMat.opacity = 0.60;
    } else if (isMatch('stands') || isMatch('seating') || isMatch('seats')) {
        if (name.includes('.001') || name.includes('1')) {
            newMat.color.setHex(0xaa2222); // RCB Red stands
        } else if (name.includes('.002') || name.includes('2')) {
            newMat.color.setHex(0xcc9900); // RCB Gold stands
        } else if (name.includes('.003') || name.includes('3')) {
            newMat.color.setHex(0xe0115f); // RR Pink stands
        } else {
            newMat.color.setHex(0x0a1e3f); // Corporate stadium blue
        }
        newMat.roughness = 0.6;
        newMat.metalness = 0.2;
        newMat.transparent = true;
        newMat.opacity = 0.45;
    } else if (isMatch('boundary') || isMatch('rope')) {
        newMat.color.setHex(0x00ffff);
        newMat.emissive.setHex(0x008888);
        newMat.roughness = 0.2;
        newMat.metalness = 0.5;
        newMat.transparent = true;
        newMat.opacity = 0.70;
    } else if (isMatch('floodlight') || isMatch('light')) {
        newMat.color.setHex(0x334155);
        newMat.roughness = 0.15;
        newMat.metalness = 0.9;
        newMat.emissive.setHex(0xffffff);
        newMat.transparent = true;
        newMat.opacity = 0.85;
    } else if (isMatch('roof') || isMatch('top') || isMatch('canopy')) {
        newMat.color.setHex(0xe2e8f0);
        newMat.roughness = 0.3;
        newMat.metalness = 0.75;
        newMat.transparent = true;
        newMat.opacity = 0.50; // translucent roof
    } else {
        // Concrete, foundation, outer terrain: deep cyan-blue transparent glass
        newMat.color.setHex(0x002244);
        newMat.roughness = 0.45;
        newMat.metalness = 0.55;
        newMat.transparent = true;
        newMat.opacity = 0.35;
    }
    
    return newMat;
};

export class DomainExpansionSystem extends createSystem({
    jugnu: { required: [Jugnu] }
}) {
    private isTableSpawned = false;
    private targetTableScale = 0.0;
    private currentTableScale = 0.0;

    private tableGroup!: THREE.Group;
    private tableBase!: THREE.Mesh;
    private radarRing!: THREE.Mesh;
    private radarTime = 0;
    private locationPin!: THREE.Group;
    private minimapBuildings!: THREE.InstancedMesh;
    private minimapMapPlane!: THREE.Mesh;
    private minimapMapPlaneMat!: THREE.MeshBasicMaterial;

    // Domain Expansion & 360 Dome variables
    private selectionBubbles: THREE.Mesh[] = [];
    private bubbleMats: THREE.Material[] = [];
    private anchorRings: THREE.Mesh[] = [];
    private loaderRings: THREE.Mesh[] = [];
    private nameTags: THREE.Mesh[] = [];
    private nameTagMats: THREE.MeshBasicMaterial[] = [];
    private pinchProgresses: number[] = [];
    private hoverProgresses: number[] = [];
    private domainMesh!: THREE.Mesh;
    private domainMat!: THREE.MeshBasicMaterial;
    private stadiumMesh!: THREE.Group;
    private stadiumBaseScale = 1.0;
    private arBillboard!: THREE.Group;
    private arFloatTime = 0;
    private isDomainActive = false;
    private bleedProgress = 0.0;
    private exitTimer = 0;
    private menuToggleCooldown = 0;

    // Left Wrist Button
    private wristButton!: THREE.Mesh;
    private wristButtonMat!: THREE.MeshBasicMaterial;

    // Video MIV position variables
    private mivVideo!: HTMLVideoElement;
    private mivVideoTex!: THREE.VideoTexture;

    // Real-Time B2B Broadcast Scenario Telemetry
    private activePrediction: 'SIX' | 'WICKET' | 'DOT' | null = null;
    private predictionTimer = 0.0;
    private predictionCooldown = 0.0;
    private evaluationTimer = 0.0;
    private predictionStatusText = "SELECT ANALYTICS KERNEL TO INITIATE PROJECTION";
    private predictionFlashColor = "";
    private predictionButtons: THREE.Group[] = [];
    private predictionButtonMats: THREE.MeshBasicMaterial[] = [];
    
    private billboardCanvas!: HTMLCanvasElement;
    private billboardCtx!: CanvasRenderingContext2D;
    private billboardTexture!: THREE.CanvasTexture;

    // Hawk-Eye Telemetry Splines
    private hawkeyeLine!: THREE.Line;
    private hawkeyeBall!: THREE.Mesh;
    private hawkeyeCurve!: THREE.CatmullRomCurve3;
    private hawkeyeProgress = 0.0;
    private hawkeyeTime = 0.0;
    private hawkeyeRipple!: THREE.Mesh;
    private hawkeyeRippleMat!: THREE.MeshBasicMaterial;
    private currentHawkeyePath: 'SIX' | 'WICKET' | 'DOT' = 'DOT';
    private isHawkeyeRunning = false;
    private hawkeyeCooldown = 3.0; // Trigger passively after 3s on load

    // Concentric Tech Telemetry Rings
    private techRing1!: THREE.Mesh;
    private techRing2!: THREE.Mesh;
    private techRing3!: THREE.Mesh;

    // Holographic Close "X" button
    private xButton!: THREE.Group;
    private xButtonMat!: THREE.MeshBasicMaterial;
    private xCrossMats: THREE.MeshBasicMaterial[] = [];
    private lastActiveDomainIndex = -1;

    private currentDomainIndex = 0;
    private domainKeys = [
        "mivVideo",
        "iplCam2",
        "iplCam3",
        "iplCam4",
        "iplCam5",
        "iplCam6"
    ];

    private domainNames = [
        "IPL FINAL (1)",
        "IPL FINAL (2)",
        "IPL FINAL (3)",
        "IPL FINAL (4)",
        "IPL FINAL (5)",
        "IPL FINAL (6)"
    ];

    // Sustained-release timers to filter hand-tracking noise/jitter (de-noising)
    private leftMiddlePinchReleasedTime = 0.5;
    private rightMiddlePinchReleasedTime = 0.5;
    private wasMiddlePinchingLeft = false;
    private wasMiddlePinchingRight = false;
    private middlePinchCooldown = 0;

    // Pinch-to-Rotate state variables
    private isRotatingMap = false;
    private rotationHandedness: 'left' | 'right' | 'none' = 'none';
    private initialHandAngle = 0;
    private initialTableRotationY = 0;

    // Two-handed Pinch to Scale circular table (Command Deck)
    private isTwoHandScaling = false;
    private initialHandDist = 0.0;
    private initialUserScale = 1.0;
    private userTableScale = 1.0;
    private lastLoggedScale = 1.0;
    private lastLeftPinch = false;
    private lastRightPinch = false;

    // Real-Time low-poly player markers inside Wankhede Stadium
    private players: PlayerMarker[] = [];
    private playerSimTime = 0.0;

    // Ball Tracking & Interactive Sixes Visualization System
    private activeBall!: THREE.Mesh;
    private ballTrail!: THREE.Line;
    private trailPoints: THREE.Vector3[] = [];
    private maxTrailPoints = 120;
    private isBallAnimating = false;
    private ballAnimT = 0.0;
    private currentSixIndex = -1;
    private trackingButtons: THREE.Mesh[] = [];
    private buttonMats: THREE.MeshBasicMaterial[] = [];
    private buttonLabels: THREE.Mesh[] = [];
    private buttonPinchProgress: number[] = [0.0, 0.0, 0.0, 0.0, 0.0];
    private scoreDisplayMeshes: THREE.Mesh[] = [];
    // Roof arc parameters (in table-local space)
    private readonly ROOF_Y = 0.095;      // Height of stadium roof rim
    private readonly ROOF_RADIUS = 0.096; // Radius of stadium inner roof arc

    // Physics Bouncing Simulation & Stadium Selection
    private currentStadiumType: 'default' | 'berlin' | 'inuit' | 'butterflies' | 'nurburgring' = '' as any;
    private berlinMesh: THREE.Mesh | null = null;
    private inuitMesh: THREE.Mesh | null = null;
    private butterflyGroup: THREE.Group | null = null;
    private butterflies: {
        mesh: THREE.Group,
        leftWing: THREE.Mesh,
        rightWing: THREE.Mesh,
        speed: number,
        phase: number,
        pos: THREE.Vector3,
        vel: THREE.Vector3,
        wanderTime: number,
        baseScale: number
    }[] = [];
    private ballVelocity = new THREE.Vector3(0.04, 0.03, 0.05);
    private lastBubbleSkinStadium: string = 'default'; // tracks which stadium the bubbles were last skinned for
    private nurburgringGroup: THREE.Group | null = null;
    private nurburgringCurve!: THREE.CatmullRomCurve3;
    private nurburgringCars: {
        group: THREE.Group,
        progress: number,
        speed: number,
        wheels: THREE.Mesh[],
        colorType: 'merc' | 'redbull' | 'ferrari'
    }[] = [];
    private holoCylinder!: THREE.Mesh;
    private holoCylinderWire!: THREE.LineSegments;
    private nurburgringF1Car!: THREE.Group;
    private nurburgringF1Wheels: THREE.Mesh[] = [];
    private nurburgringF1WheelMats: THREE.MeshStandardMaterial[] = [];
    private nurburgringF1Progress = 0.0;
    private nurburgringOvertakePhase = 0.0;
    private nurburgringF1Speed = 0.052;
    private nurburgringTrackMat!: THREE.MeshStandardMaterial;

    // F1 Telemetry HUD System
    private f1HudCanvas!: HTMLCanvasElement;
    private f1HudCtx!: CanvasRenderingContext2D;
    private f1HudTexture!: THREE.CanvasTexture;
    private f1HudMat!: THREE.MeshBasicMaterial;
    private f1HudMesh!: THREE.Mesh;

    // F1 Vortex Vapor Trails
    private f1VortexLeft!: THREE.Line;
    private f1VortexRight!: THREE.Line;
    private f1VortexLeftPoints: THREE.Vector3[] = [];
    private f1VortexRightPoints: THREE.Vector3[] = [];

    // F1 Wet Spray Particles
    private f1SprayMesh!: THREE.InstancedMesh;
    private f1SprayData!: Float32Array; // 60 particles: x, y, z, vx, vy, vz, age, active (8 values per particle)
    private f1SprayEmitSlot = 0;
    private f1SprayDummy = new THREE.Object3D();
    private isNavLayerActive = false;
    private navPlaceholdersGroup!: THREE.Group;

    private nurburgringFrenetFrames: any = null;
    private dynamicFloorY = 0.001;
    private f1Pos = new THREE.Vector3();
    private tinyCarPos = new THREE.Vector3();
    private f1xAxis = new THREE.Vector3();
    private f1yAxis = new THREE.Vector3();
    private f1zAxis = new THREE.Vector3();
    private f1RotationMatrix = new THREE.Matrix4();
    private scratchMatrix = new THREE.Matrix4();

    private scratchVector1 = new THREE.Vector3();
    private scratchVector2 = new THREE.Vector3();
    private scratchVector3 = new THREE.Vector3();
    private scratchQuat1 = new THREE.Quaternion();
    private scratchQuat2 = new THREE.Quaternion();

    // Highly Optimized, Zero-GC Holographic Fireworks System
    private fireworksMesh!: THREE.InstancedMesh;
    private readonly MAX_FIREWORKS = 24;
    private readonly PARTICLES_PER_FIREWORK = 350;
    private fireworkActive = new Uint8Array(24);
    private fireworkAge = new Float32Array(24);
    private fireworkMaxAge = new Float32Array(24);
    private fireworkPositions = new Float32Array(24 * 3);
    private fireworkColors = new Uint32Array(24);
    private particleVelocities = new Float32Array(8400 * 3);
    private particleOffsets = new Float32Array(8400 * 3);
    private particleColors = new Uint32Array(8400);
    private fireworkPhase = new Uint8Array(24); // 0 = rocket rising, 1 = burst
    private fireworkLaunchY = new Float32Array(24); // initial launch height
    private fireworkTargetHeight = new Float32Array(24); // vertical flight height before burst
    private fireworkLaunchVelocities = new Float32Array(24 * 3); // 3D launch velocity vector (vx, vy, vz)
    private fireworkScale = new Float32Array(24); // individual burst scale multiplier
    private fireworkSeqTimer = -1.0; // manual fireworks sequence state
    private fireworkSeqIndex = 0;    // sequential index of manual firework
    private fireworkDummy = new THREE.Object3D();
    private fireworkColorObj = new THREE.Color();

    // Volumetric Weather System
    private weatherMesh!: THREE.InstancedMesh;
    private readonly MAX_WEATHER_PARTICLES = 400;
    private weatherMode: 'off' | 'rain' | 'neon_dust' = 'off';
    private weatherPositions = new Float32Array(400 * 3);
    private weatherVelocities = new Float32Array(400 * 3);
    private weatherColors = new Uint32Array(400);
    private isLightningStriking = false;
    private lightningStrikeDuration = 0.0;
    private lightningTimer = 0.0;
    private lightningNextStrikeTime = 6.0;
    private standsOriginalColors: { mat: THREE.MeshStandardMaterial, wireframe: boolean, emissiveHex: number, emissiveIntensity: number }[] = [];
    private floodlightOriginalColors: { mat: THREE.MeshStandardMaterial, emissiveHex: number, emissiveIntensity: number }[] = [];

    // Flick-to-Bounce Sandbox Ball System
    private sandboxBall!: THREE.Mesh;
    private isSandboxBallActive = false;
    private isSandboxBallGrabbed = false;
    private sandboxBallVel = new THREE.Vector3();
    private lastGrabPos = new THREE.Vector3();
    private isLeftPinchActive = false;
    private isRightPinchActive = false;

    // Choreographed Sport Sequences & AR Props
    private isSportSequenceActive = false;
    private sportSequenceTime = 0.0;
    private sportSequencePhase = 0; // 0 = prep, 1 = strike/flight, 2 = score/contact, 3 = card reveal
    private sportPropsGroup!: THREE.Group;
    private sequenceBall!: THREE.Mesh;
    private sequenceBallTrail!: THREE.Line;
    private sequenceBallPoints: THREE.Vector3[] = [];
    
    // Holographic Telemetry Projector Disk System
    private ballProjectorDisk!: THREE.Group;
    private ballProjectorDiskMat!: THREE.MeshBasicMaterial;
    
    // Cricket Wankhede props
    private cricketBatMesh!: THREE.Group;
    private cricketStumpsMesh!: THREE.Group;
    
    // Football Goal posts (Berlin references)
    private berlinGoal1: THREE.Group | null = null;
    private berlinGoal2: THREE.Group | null = null;
    private goal1NetMesh: THREE.LineSegments | null = null;
    private goal2NetMesh: THREE.LineSegments | null = null;
    private goalWiggleTime = 0.0;
    private isGoalWiggling = false;
    private wigglingGoalNet: THREE.LineSegments | null = null;
    
    // Basketball Inuit hoops
    private basketballHoop1: THREE.Group | null = null;
    private basketballHoop2: THREE.Group | null = null;
    private hoop1NetMesh: THREE.LineSegments | null = null;
    private hoop2NetMesh: THREE.LineSegments | null = null;
    private hoopWiggleTime = 0.0;
    private isHoopWiggling = false;
    private wigglingHoopNet: THREE.LineSegments | null = null;
    
    // AR Celebration overlay
    private sportCelebrationCard!: THREE.Group;
    private sportCelebrationCardMat!: THREE.MeshBasicMaterial;
    private sportCelebrationTexture!: THREE.CanvasTexture;
    private celebrationCardCanvas!: HTMLCanvasElement;
    private celebrationCardCtx!: CanvasRenderingContext2D;

    // Tactical Core Deck (TCD) Menu System
    private tcdVisible = false;
    private tcdPanelGroup!: THREE.Group;
    private tcdLauncherButton!: THREE.Mesh;
    private tcdLauncherMat!: THREE.MeshBasicMaterial;
    private tcdLauncherPinchProgress = 0.0;
    private tcdButtons: THREE.Mesh[] = [];
    private tcdButtonMats: THREE.MeshBasicMaterial[] = [];
    private tcdButtonLabels: THREE.Mesh[] = [];
    private tcdButtonHoverTimes = new Float32Array(7); // 7 buttons

    // Per-stadium domain key/name tables
    private readonly DOMAIN_KEYS_DEFAULT  = ["mivVideo","iplCam2","iplCam3","iplCam4","iplCam5","iplCam6"];
    private readonly DOMAIN_NAMES_DEFAULT = ["Wankhede — Cam 1","Wankhede — Cam 2","Wankhede — Cam 3","Wankhede — Cam 4","Wankhede — Cam 5","Wankhede — Cam 6"];
    private readonly DOMAIN_KEYS_BERLIN   = ["berlin360_1","berlin360_2","berlin360_3","berlin360_4","berlin360_5","berlin360_6"];
    private readonly DOMAIN_NAMES_BERLIN  = ["Olympiastadion — 1","Olympiastadion — 2","Olympiastadion — 3","Olympiastadion — 4","Olympiastadion — 5","Olympiastadion — 6"];
    private readonly DOMAIN_KEYS_INUIT    = ["inuit360_1","inuit360_2","inuit360_3","inuit360_4","inuit360_5","inuit360_6"];
    private readonly DOMAIN_NAMES_INUIT   = ["Crypto.com Arena — 1","Crypto.com Arena — 2","Crypto.com Arena — 3","Crypto.com Arena — 4","Crypto.com Arena — 5","Crypto.com Arena — 6"];
    // Thumb key suffix: appending "_thumb" to each key gives the low-res bubble texture key
    private readonly THUMB_KEYS_DEFAULT = ["iplCam1","iplCam2","iplCam3","iplCam4","iplCam5","iplCam6"];
    private readonly THUMB_KEYS_BERLIN  = ["berlin360_1_thumb","berlin360_2_thumb","berlin360_3_thumb","berlin360_4_thumb","berlin360_5_thumb","berlin360_6_thumb"];
    private readonly THUMB_KEYS_INUIT   = ["inuit360_1_thumb","inuit360_2_thumb","inuit360_3_thumb","inuit360_4_thumb","inuit360_5_thumb","inuit360_6_thumb"];
    private readonly DOMAIN_KEYS_BUTTERFLIES  = ["butterfly360_1","butterfly360_2","butterfly360_3","butterfly360_4","butterfly360_5","butterfly360_6","butterfly360_7","butterfly360_8","butterfly360_9","butterfly360_10"];
    private readonly DOMAIN_NAMES_BUTTERFLIES = ["Butterfly Park — 1","Butterfly Park — 2","Butterfly Park — 3","Butterfly Park — 4","Butterfly Park — 5","Butterfly Park — 6","Butterfly Park — 7","Butterfly Park — 8","Butterfly Park — 9","Butterfly Park — 10"];
    private readonly THUMB_KEYS_BUTTERFLIES  = ["butterfly360_1","butterfly360_2","butterfly360_3","butterfly360_4","butterfly360_5","butterfly360_6","butterfly360_7","butterfly360_8","butterfly360_9","butterfly360_10"];
    private readonly DOMAIN_KEYS_NURBURGRING  = ["nurburgring360_1","nurburgring360_2","nurburgring360_3","nurburgring360_4","nurburgring360_5","nurburgring360_6"];
    private readonly DOMAIN_NAMES_NURBURGRING  = ["GP Pit Lane","Hatzenbach","Adenauer Forst","Karussell","Pflanzgarten","Döttinger Höhe"];
    private readonly THUMB_KEYS_NURBURGRING    = ["nurburgring360_1_thumb","nurburgring360_2_thumb","nurburgring360_3_thumb","nurburgring360_4_thumb","nurburgring360_5_thumb","nurburgring360_6_thumb"];


    // Keyboard debug listeners
    private debugMPressed = false;
    private debugPPressed = false;

    init() {
        // --- Debug Keyboard Listener for Desktop ---
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'm') this.debugMPressed = true;
            if (e.key.toLowerCase() === 'p') this.debugPPressed = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'm') this.debugMPressed = false;
            if (e.key.toLowerCase() === 'p') this.debugPPressed = false;
        });

        // --- Create High-Performance Tactical Minimap Group ---
        this.tableGroup = new THREE.Group();
        this.tableGroup.scale.setScalar(0.01); // Safe minimum scale
        this.tableGroup.visible = false;

        // Overhauled Table base: transparent holographic glass cylinder
        const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 64);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0x003355, // Deep holographic cyan-blue
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.tableBase = new THREE.Mesh(baseGeom, baseMat);
        this.tableBase.position.y = -0.005;
        this.tableGroup.add(this.tableBase);

        // Volumetric lower cyan base slab to construct glowing depth
        const underBaseGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.006, 64);
        const underBaseMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const underBaseMesh = new THREE.Mesh(underBaseGeom, underBaseMat);
        underBaseMesh.position.y = -0.012;
        this.tableGroup.add(underBaseMesh);

        // Concentric Tech Ring 1 (Inner rotating telemetry ring)
        const techRing1Geom = new THREE.RingGeometry(0.065, 0.067, 64);
        const techRing1Mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        });
        this.techRing1 = new THREE.Mesh(techRing1Geom, techRing1Mat);
        this.techRing1.rotation.x = -Math.PI / 2;
        this.techRing1.position.y = 0.0002;
        this.tableGroup.add(this.techRing1);

        // Concentric Tech Ring 2 (Middle counter-rotating telemetry ring)
        const techRing2Geom = new THREE.RingGeometry(0.13, 0.132, 64);
        const techRing2Mat = new THREE.MeshBasicMaterial({
            color: 0xe2af37, // Golden accent ring
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.18,
            depthWrite: false
        });
        this.techRing2 = new THREE.Mesh(techRing2Geom, techRing2Mat);
        this.techRing2.rotation.x = -Math.PI / 2;
        this.techRing2.position.y = 0.0002;
        this.tableGroup.add(this.techRing2);

        // Concentric Tech Ring 3 (Outer rotating telemetry ring)
        const techRing3Geom = new THREE.RingGeometry(0.188, 0.19, 64);
        const techRing3Mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.28,
            depthWrite: false
        });
        this.techRing3 = new THREE.Mesh(techRing3Geom, techRing3Mat);
        this.techRing3.rotation.x = -Math.PI / 2;
        this.techRing3.position.y = 0.0002;
        this.tableGroup.add(this.techRing3);

        // Glowing outer neon ring (Pure triangle geometry)
        const ringGeom = new THREE.RingGeometry(0.195, 0.2, 64);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.6, 
            depthWrite: false 
        });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.0001;
        this.tableGroup.add(ringMesh);

        // 2D dynamic Map Plane layered on the table base (renders realistic roads procedurally)
        const mapPlaneGeom = new THREE.RingGeometry(0, 0.18, 64);
        this.minimapMapPlaneMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.minimapMapPlane = new THREE.Mesh(mapPlaneGeom, this.minimapMapPlaneMat);
        this.minimapMapPlane.rotation.x = -Math.PI / 2;
        this.minimapMapPlane.position.y = 0.00015;
        this.tableGroup.add(this.minimapMapPlane);

        // Draw realistic high-tech urban blueprint roadmap on a procedural canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Blueprint background (cleared for transparency)
        ctx.clearRect(0, 0, 512, 512);

        // Drawing detailed concentric radar rings
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        for (let r = 50; r < 256; r += 50) {
            ctx.beginPath();
            ctx.arc(256, 256, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        const mapTexture = new THREE.CanvasTexture(canvas);
        mapTexture.colorSpace = THREE.SRGBColorSpace;
        mapTexture.needsUpdate = true;
        this.minimapMapPlaneMat.map = mapTexture;

        // Interactive Radar scanning ring (Pure triangle geometry)
        const radarGeom = new THREE.RingGeometry(0, 0.19, 64);
        const radarMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.15,
            depthWrite: false
        });
        this.radarRing = new THREE.Mesh(radarGeom, radarMat);
        this.radarRing.rotation.x = -Math.PI / 2;
        this.radarRing.position.y = 0.003;
        this.tableGroup.add(this.radarRing);

        // Procedural Holographic Buildings using InstancedMesh (100% stable triangle geometry and standard materials - NO transmission)
        const numBldgs = 180;
        const bldgGeom = new THREE.BoxGeometry(1, 1, 1);
        bldgGeom.translate(0, 0.5, 0); // Bottom origin
        const bldgMat = new THREE.MeshStandardMaterial({
            color: 0x0c1e3d,     // Deep slate cyber-blue structure
            emissive: 0x003366,  // Subtle inner glowing cyber-neon blue accent
            metalness: 0.85,     // Sleek, premium metallic finish
            roughness: 0.15,     // Reflective glossy surface to catch VR lighting
            transparent: false,  // 100% solid, fully removing transparency!
            depthWrite: true     // Write to depth buffer for perfect opaque occlusion
        });
        this.minimapBuildings = new THREE.InstancedMesh(bldgGeom, bldgMat, numBldgs);
        this.minimapBuildings.frustumCulled = false;
        const dummy = new THREE.Object3D();
        const bColors = new THREE.Color();
        const bData = [];
        const tableRadius = 0.18;

        // Distribute buildings procedurally directly on the urban lots/blocks
        let spawnedCount = 0;
        // Search grid points representing building lots - denser grid (0.015 spacing) to fill all quadrants!
        for (let bx = -0.15; bx <= 0.15 && spawnedCount < numBldgs; bx += 0.015) {
            for (let bz = -0.15; bz <= 0.15 && spawnedCount < numBldgs; bz += 0.015) {
                // Ensure inside circular boundary and not directly on major highways
                const dist = Math.sqrt(bx*bx + bz*bz);
                const onHighway = Math.abs(bx) < 0.01 || Math.abs(bz) < 0.01 || Math.abs(dist - 0.11) < 0.012;
                
                if (dist > 0.02 && dist < tableRadius - 0.015 && !onHighway) {
                    const bw = 0.005 + Math.random() * 0.005;
                    const bd = 0.005 + Math.random() * 0.005;
                    const bh = Math.max(0.01, 0.045 - dist * 0.1) + Math.random() * 0.015;
                    const rotY = (Math.random() > 0.5 ? 0 : Math.PI / 2); // Aligned to roadmap grid!

                    bData.push({ x: bx, z: bz, w: bw, d: bd, h: bh, rot: rotY });
                    
                    dummy.position.set(bx, 0.002, bz);
                    dummy.rotation.y = rotY;
                    dummy.scale.set(bw, bh, bd);
                    dummy.updateMatrix();
                    this.minimapBuildings.setMatrixAt(spawnedCount, dummy.matrix);
                    this.minimapBuildings.setColorAt(spawnedCount, bColors.setHSL(0.5 + Math.random() * 0.08, 0.8, 0.5));
                    spawnedCount++;
                }
            }
        }

        // Fill remaining if grid distribution falls short to guarantee full count
        for (let i = spawnedCount; i < numBldgs; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = 0.03 + Math.random() * 0.12;
            const bx = r * Math.cos(theta);
            const bz = r * Math.sin(theta);
            const bw = 0.006;
            const bd = 0.006;
            const bh = 0.015;
            const rotY = 0;
            bData.push({ x: bx, z: bz, w: bw, d: bd, h: bh, rot: rotY });
            dummy.position.set(bx, 0.002, bz);
            dummy.rotation.y = rotY;
            dummy.scale.set(bw, bh, bd);
            dummy.updateMatrix();
            this.minimapBuildings.setMatrixAt(i, dummy.matrix);
            this.minimapBuildings.setColorAt(i, bColors.setHSL(0.5, 0.8, 0.5));
        }

        this.minimapBuildings.instanceMatrix.needsUpdate = true;
        this.minimapBuildings.userData.bData = bData;
        this.minimapBuildings.visible = false; // Hide default buildings
        this.tableGroup.add(this.minimapBuildings);

        // Load custom stadium model
        const stadiumAsset = AssetManager.getGLTF("wankhede");
        if (stadiumAsset) {
            this.stadiumMesh = stadiumAsset.scene.clone();
            
            // Traverse child meshes to apply realistic PBR stadium materials
            this.stadiumMesh.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    const name = child.name.toLowerCase();
                    const parentName = child.parent ? child.parent.name.toLowerCase() : "";
                    
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((m: any) => applyStadiumMaterial(m, name, parentName));
                    } else {
                        child.material = applyStadiumMaterial(child.material, name, parentName);
                    }
                }
            });
            this.collectStadiumMaterials(this.stadiumMesh);

            // Measure bounding box to scale it correctly to fit the map
            const box = new THREE.Box3().setFromObject(this.stadiumMesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            // We want the stadium to fit nicely inside the table, about 0.24m in diameter
            const maxDim = Math.max(size.x, size.z);
            this.stadiumBaseScale = 0.24 / (maxDim || 1.0);
            this.stadiumMesh.scale.setScalar(this.stadiumBaseScale);

            // Bring the green pitch/field/grass mesh Y coordinate down by 1cm (2cm lower than prior)
            this.stadiumMesh.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();
                    if (name.includes('pitch') || name.includes('field') || name.includes('grass')) {
                        child.position.y -= 0.01 / this.stadiumBaseScale;
                    }
                }
            });

            // Recompute bounding box after scaling to determine exact bottom Y
            this.stadiumMesh.updateMatrixWorld(true);
            const scaledBox = new THREE.Box3().setFromObject(this.stadiumMesh);
            const wankhedeMinY = scaledBox.min.y;
            this.stadiumMesh.position.set(0, -wankhedeMinY + 0.0005, 0);
            this.tableGroup.add(this.stadiumMesh);

            // Spawn floating 3D TV-style AR matchup broadcast graphic
            this.initARBillboard();
        } else {
            // Fallback circular procedural stadium
            const fallbackGroup = new THREE.Group();
            const outerWall = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 0.02, 32, 1, true),
                new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, wireframe: true })
            );
            fallbackGroup.add(outerWall);
            this.stadiumMesh = fallbackGroup as any;
            this.stadiumMesh.position.set(0, -0.002, 0);
            this.stadiumBaseScale = 1.0;
            this.tableGroup.add(this.stadiumMesh);
        }

        // Initialize Hawk-Eye Splines & Ball Telemetry
        this.initHawkEye();

        // Initialize tactical low-poly player markers on the field
        this.initPlayerMarkers();

        // Location Pin (Pure triangle geometries with transparent materials for smooth scale-gated fade-out)
        this.locationPin = new THREE.Group();
        const pinHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.006, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.9 })
        );
        pinHead.position.y = 0.02;
        
        const pinBody = new THREE.Mesh(
            new THREE.ConeGeometry(0.004, 0.012, 16),
            new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.9 })
        );
        pinBody.position.y = 0.01;
        pinBody.rotation.x = Math.PI;
        
        const pinGlow = new THREE.Mesh(
            new THREE.RingGeometry(0.006, 0.009, 32),
            new THREE.MeshBasicMaterial({ 
                color: 0xff3333, 
                transparent: true, 
                opacity: 0.7, 
                side: THREE.DoubleSide,
                depthWrite: false 
            })
        );
        pinGlow.rotation.x = -Math.PI / 2;
        pinGlow.position.y = 0.004;
        
        // Floating high-res Wankhede Stadium location label card
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 64;
        const labelCtx = labelCanvas.getContext('2d')!;
        labelCtx.clearRect(0, 0, 256, 64);
        
        // High-tech dark pill background with glowing red border
        labelCtx.fillStyle = 'rgba(5, 5, 20, 0.88)';
        labelCtx.strokeStyle = '#ff3333';
        labelCtx.lineWidth = 4;
        
        const r2 = 16;
        const w2 = 246;
        const h2 = 54;
        const x2 = 5;
        const y2 = 5;
        
        labelCtx.beginPath();
        labelCtx.moveTo(x2 + r2, y2);
        labelCtx.lineTo(x2 + w2 - r2, y2);
        labelCtx.quadraticCurveTo(x2 + w2, y2, x2 + w2, y2 + r2);
        labelCtx.lineTo(x2 + w2, y2 + h2 - r2);
        labelCtx.quadraticCurveTo(x2 + w2, y2 + h2, x2 + w2 - r2, y2 + h2);
        labelCtx.lineTo(x2 + r2, y2 + h2);
        labelCtx.quadraticCurveTo(x2, y2 + h2, x2, y2 + h2 - r2);
        labelCtx.lineTo(x2, y2 + r2);
        labelCtx.quadraticCurveTo(x2, y2, x2 + r2, y2);
        labelCtx.closePath();
        labelCtx.fill();
        labelCtx.stroke();
        
        labelCtx.fillStyle = '#ffffff';
        labelCtx.font = 'bold 22px monospace';
        labelCtx.textAlign = 'center';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillText('WANKHEDE STADIUM', 128, 32);
        
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        labelTex.colorSpace = THREE.SRGBColorSpace;
        labelTex.needsUpdate = true;
        
        const labelGeom = new THREE.PlaneGeometry(0.06, 0.015);
        const labelMat = new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const pinLabelMesh = new THREE.Mesh(labelGeom, labelMat);
        pinLabelMesh.position.set(0, 0.035, 0); // Float 3.5cm above base (1.5cm above pin head)
        
        this.locationPin.add(pinHead, pinBody, pinGlow, pinLabelMesh);
        this.tableGroup.add(this.locationPin);

        // Initialize MIV video for CAM POS (5)
        this.mivVideo = document.createElement('video');
        this.mivVideo.src = "./360Videos/view1.mp4";
        this.mivVideo.crossOrigin = 'anonymous';
        this.mivVideo.loop = true;
        this.mivVideo.muted = true;
        this.mivVideo.playsInline = true;
        this.mivVideo.autoplay = true;
        this.mivVideo.play().catch(e => console.warn("Video autoplay blocked until user interaction", e));

        this.mivVideoTex = new THREE.VideoTexture(this.mivVideo);
        this.mivVideoTex.colorSpace = THREE.SRGBColorSpace;
        this.mivVideoTex.mapping = THREE.EquirectangularReflectionMapping;

        // Add a pointerdown listener to trigger play on first interaction (browser requirement)
        window.addEventListener('pointerdown', () => {
            if (this.mivVideo && this.mivVideo.paused) {
                this.mivVideo.play().catch(() => {});
            }
        }, { once: true });

        this.pinchProgresses = new Array(10).fill(0);
        this.hoverProgresses = new Array(10).fill(0);

        // --- Holographic Domain Expansion Selection Bubbles (Octagon arrangement on Edge Ring) ---
        const bubbleGeom = new THREE.SphereGeometry(0.035, 32, 16);
        const bubbleRingGeom = new THREE.RingGeometry(0.023, 0.027, 32);
        const loaderRingGeom = new THREE.RingGeometry(0.012, 0.015, 32);
        const nameTagGeom = new THREE.PlaneGeometry(0.08, 0.02);

        const totalDomains = 10;
        for (let i = 0; i < totalDomains; i++) {
            // Symmetrical arrangement around the stadium (radius = 0.17m)
            const angle = i * (2 * Math.PI / totalDomains);
            const bx = Math.cos(angle) * 0.17;
            const bz = Math.sin(angle) * 0.17;

            const bMat = new THREE.MeshStandardMaterial({
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
                depthWrite: false,
                roughness: 0.15,
                metalness: 0.85,
                emissive: new THREE.Color(0x008888),
                emissiveIntensity: 0.08
            });
            
            const texKey = this.domainKeys[i];
            if (texKey) {
                if (texKey === "mivVideo") {
                    // Live video texture
                    bMat.map = this.mivVideoTex;
                } else {
                    const tex = AssetManager.getTexture(texKey);
                    if (tex) {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        bMat.map = tex;
                    }
                }
            }

            const bubbleMesh = new THREE.Mesh(bubbleGeom, bMat);
            bubbleMesh.position.set(bx, 0.12, bz);
            this.tableGroup.add(bubbleMesh);
            this.selectionBubbles.push(bubbleMesh);
            this.bubbleMats.push(bMat);

            // Glowing anchor ring directly below the bubble on the map plane (radius = 0.17m)
            const rMat = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25,
                depthWrite: false
            });
            const ringMesh = new THREE.Mesh(bubbleRingGeom, rMat);
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.set(bx, 0.0025, bz);
            this.tableGroup.add(ringMesh);
            this.anchorRings.push(ringMesh);

            // Charging loader ring floating 5cm above the bubble's center height (0.12 + 0.05 = 0.17m)
            const lMat = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.0,
                depthWrite: false
            });
            const loaderMesh = new THREE.Mesh(loaderRingGeom, lMat);
            loaderMesh.rotation.x = -Math.PI / 2;
            loaderMesh.position.set(bx, 0.17, bz);
            loaderMesh.scale.setScalar(0.01);
            this.tableGroup.add(loaderMesh);
            this.loaderRings.push(loaderMesh);

            // Floating, billboarding canvas place name tag plate (at y = 0.16)
            const name = this.domainNames[i] || `View ${i + 1}`;
            const nameTex = this.createNameTagTexture(name);
            const nameMat = new THREE.MeshBasicMaterial({
                map: nameTex,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const nameTagMesh = new THREE.Mesh(nameTagGeom, nameMat);
            nameTagMesh.position.set(bx, 0.16, bz);
            this.tableGroup.add(nameTagMesh);
            this.nameTags.push(nameTagMesh);
            this.nameTagMats.push(nameMat);
        }

        // --- Immersive 360 Dome Sphere (Cinematic shockwave expansion - world radius 20.0m) ---
        const domeGeom = new THREE.SphereGeometry(20, 60, 40);
        this.domainMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.domainMesh = new THREE.Mesh(domeGeom, this.domainMat);
        this.domainMesh.visible = false;
        this.domainMesh.renderOrder = -100;
        this.world.createTransformEntity(this.domainMesh);

        // --- Holographic Close "X" Button Setup (floats above active bubble) ---
        this.xButton = new THREE.Group();
        this.xButton.scale.setScalar(0.01);
        this.xButton.visible = false;

        // Base red circular disk
        const xBackGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.003, 32);
        xBackGeom.rotateX(Math.PI / 2); // Stand upright relative to billboard lookAt
        this.xButtonMat = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        const xBackMesh = new THREE.Mesh(xBackGeom, this.xButtonMat);
        this.xButton.add(xBackMesh);

        // White cross beams ("X" symbol)
        const beamGeom = new THREE.BoxGeometry(0.002, 0.012, 0.002);
        const xCrossMat1 = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        const xCrossMat2 = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        this.xCrossMats.push(xCrossMat1, xCrossMat2);

        const beam1 = new THREE.Mesh(beamGeom, xCrossMat1);
        beam1.rotation.z = Math.PI / 4;
        beam1.position.z = 0.002; // Position slightly forward to prevent z-fighting with the red disk
        
        const beam2 = new THREE.Mesh(beamGeom, xCrossMat2);
        beam2.rotation.z = -Math.PI / 4;
        beam2.position.z = 0.002;
        
        this.xButton.add(beam1);
        this.xButton.add(beam2);
        this.tableGroup.add(this.xButton);
        
        // Initialize Ball Tracking & Interactive Sixes Buttons on the tactical deck
        this.initBallTracking();
        this.initWeatherSystem();
        this.initSandboxBall();
        this.initTrackingButtons();
        this.initSportSequenceSystem();

        // Holographic containment cylinder for immersive view (scales 2.5 to 3.5)
        const cylGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 32, 1, true);
        cylGeo.translate(0, 0.04, 0); // Base sits on table (y = 0)
        
        const cylMat = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
            shininess: 100
        });
        this.holoCylinder = new THREE.Mesh(cylGeo, cylMat);
        this.holoCylinder.visible = false;
        this.tableGroup.add(this.holoCylinder);

        const wireMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.0
        });
        this.holoCylinderWire = new THREE.LineSegments(new THREE.EdgesGeometry(cylGeo), wireMat);
        this.holoCylinderWire.visible = false;
        this.tableGroup.add(this.holoCylinderWire);

        // Navigation Placeholders Group
        this.navPlaceholdersGroup = new THREE.Group();
        this.navPlaceholdersGroup.visible = false;
        this.tableGroup.add(this.navPlaceholdersGroup);
        this.createNavPlaceholders();

        // Initialize Left Wrist Button
        const wristBtnGeom = new THREE.SphereGeometry(0.015, 16, 16);
        this.wristButtonMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8, // Neon blue
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        this.wristButton = new THREE.Mesh(wristBtnGeom, this.wristButtonMat);
        this.wristButton.visible = false;
        this.world.createTransformEntity(this.wristButton);

        // Register tableGroup with the world
        this.world.createTransformEntity(this.tableGroup);

        // Pre-compile shaders in WebGL to prevent any WebXR stutters/crashes
        try {
            this.renderer.compile(this.tableGroup, this.camera);
            this.renderer.compile(this.domainMesh, this.camera);
            console.log("[DomainExpansionSystem] Shader pre-compilation successful!");
        } catch (e) {
            console.warn("[DomainExpansionSystem] Shader pre-compilation failed/skipped:", e);
        }
    }

    private getIndexData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;

        const indexTip = source.hand.get('index-finger-tip');
        if (!indexTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const indexPose = frame.getJointPose(indexTip, refSpace);

        if (indexPose) {
            const ix = indexPose.transform.position.x;
            const iy = indexPose.transform.position.y;
            const iz = indexPose.transform.position.z;

            tipPosOut.set(ix, iy, iz);
            tipPosOut.applyMatrix4(this.player.matrixWorld);

            return true;
        }
        return false;
    }

    private getIndexPinchData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;

        const indexTip = source.hand.get('index-finger-tip');
        const thumbTip = source.hand.get('thumb-tip');
        if (!indexTip || !thumbTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const indexPose = frame.getJointPose(indexTip, refSpace);
        const thumbPose = frame.getJointPose(thumbTip, refSpace);

        if (indexPose && thumbPose) {
            const ix = indexPose.transform.position.x;
            const iy = indexPose.transform.position.y;
            const iz = indexPose.transform.position.z;
            const tx = thumbPose.transform.position.x;
            const ty = thumbPose.transform.position.y;
            const tz = thumbPose.transform.position.z;

            const distSq = (ix - tx) ** 2 + (iy - ty) ** 2 + (iz - tz) ** 2;
            const isPinching = distSq < 0.025 * 0.025; // 2.5cm threshold

            tipPosOut.set(ix, iy, iz);
            tipPosOut.applyMatrix4(this.player.matrixWorld);

            return isPinching;
        }
        return false;
    }

    private getMiddleData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;

        const middleTip = source.hand.get('middle-finger-tip');
        if (!middleTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const middlePose = frame.getJointPose(middleTip, refSpace);

        if (middlePose) {
            const mx = middlePose.transform.position.x;
            const my = middlePose.transform.position.y;
            const mz = middlePose.transform.position.z;

            tipPosOut.set(mx, my, mz);
            tipPosOut.applyMatrix4(this.player.matrixWorld);

            return true;
        }
        return false;
    }

    private getMiddlePinchData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;

        const middleTip = source.hand.get('middle-finger-tip');
        const thumbTip = source.hand.get('thumb-tip');
        if (!middleTip || !thumbTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const middlePose = frame.getJointPose(middleTip, refSpace);
        const thumbPose = frame.getJointPose(thumbTip, refSpace);

        if (middlePose && thumbPose) {
            const mx = middlePose.transform.position.x;
            const my = middlePose.transform.position.y;
            const mz = middlePose.transform.position.z;
            const tx = thumbPose.transform.position.x;
            const ty = thumbPose.transform.position.y;
            const tz = thumbPose.transform.position.z;

            const distSq = (mx - tx) ** 2 + (my - ty) ** 2 + (mz - tz) ** 2;
            const isPinching = distSq < 0.025 * 0.025; // 2.5cm

            tipPosOut.set(mx, my, mz);
            tipPosOut.applyMatrix4(this.player.matrixWorld);

            return isPinching;
        }
        return false;
    }

    private checkMiddlePinch(dt: number): boolean {
        if (this.debugPPressed) return true; // Keyboard simulation key 'P'
        
        let pinched = false;
        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        
        const isLeftMiddlePinching = this.getMiddlePinchData('left', leftTip);
        const isRightMiddlePinching = this.getMiddlePinchData('right', rightTip);
        
        // Left hand de-noising
        if (isLeftMiddlePinching) {
            if (this.leftMiddlePinchReleasedTime >= 0.4 && !this.wasMiddlePinchingLeft) {
                pinched = true;
                this.wasMiddlePinchingLeft = true;
            }
            this.leftMiddlePinchReleasedTime = 0.0;
        } else {
            this.leftMiddlePinchReleasedTime += dt;
            if (this.leftMiddlePinchReleasedTime >= 0.4) {
                this.wasMiddlePinchingLeft = false;
            }
        }
        
        // Right hand de-noising
        if (isRightMiddlePinching) {
            if (this.rightMiddlePinchReleasedTime >= 0.4 && !this.wasMiddlePinchingRight) {
                pinched = true;
                this.wasMiddlePinchingRight = true;
            }
            this.rightMiddlePinchReleasedTime = 0.0;
        } else {
            this.rightMiddlePinchReleasedTime += dt;
            if (this.rightMiddlePinchReleasedTime >= 0.4) {
                this.wasMiddlePinchingRight = false;
            }
        }
        
        return pinched;
    }

    private checkMButton(): boolean {
        return this.debugMPressed;
    }

    private setStadiumType(stadiumType: 'default' | 'berlin' | 'inuit' | 'butterflies' | 'nurburgring') {
        console.log(`[StadiumSelector] Switching stadium from ${this.currentStadiumType} to ${stadiumType}`);
        this.currentStadiumType = stadiumType;

        // ── Swap domain key/name tables for the new stadium ──────────────────
        if (stadiumType === 'berlin') {
            this.domainKeys  = [...this.DOMAIN_KEYS_BERLIN];
            this.domainNames = [...this.DOMAIN_NAMES_BERLIN];
        } else if (stadiumType === 'inuit') {
            this.domainKeys  = [...this.DOMAIN_KEYS_INUIT];
            this.domainNames = [...this.DOMAIN_NAMES_INUIT];
        } else if (stadiumType === 'butterflies') {
            this.domainKeys  = [...this.DOMAIN_KEYS_BUTTERFLIES];
            this.domainNames = [...this.DOMAIN_NAMES_BUTTERFLIES];
        } else if (stadiumType === 'nurburgring') {
            this.domainKeys  = [...this.DOMAIN_KEYS_NURBURGRING];
            this.domainNames = [...this.DOMAIN_NAMES_NURBURGRING];
        } else {
            this.domainKeys  = [...this.DOMAIN_KEYS_DEFAULT];
            this.domainNames = [...this.DOMAIN_NAMES_DEFAULT];
        }

        // ── Re-skin selection bubbles with low-res thumbs ────────────────────
        const thumbKeys = stadiumType === 'berlin' ? this.THUMB_KEYS_BERLIN
                        : stadiumType === 'inuit'  ? this.THUMB_KEYS_INUIT
                        : stadiumType === 'butterflies' ? this.THUMB_KEYS_BUTTERFLIES
                        : stadiumType === 'nurburgring' ? this.THUMB_KEYS_NURBURGRING
                        : this.THUMB_KEYS_DEFAULT;

        const totalDomains = this.domainKeys.length;
        this.selectionBubbles.forEach((bubble, idx) => {
            if (idx < totalDomains) {
                const angle = idx * (2 * Math.PI / totalDomains);
                const bx = Math.cos(angle) * 0.17;
                const bz = Math.sin(angle) * 0.17;
                
                // Symmetrical repositioning
                bubble.position.set(bx, 0.12, bz);
                bubble.visible = true;
                
                const ring = this.anchorRings[idx];
                if (ring) {
                    ring.position.set(bx, 0.0025, bz);
                    ring.visible = true;
                }
                
                const loader = this.loaderRings[idx];
                if (loader) {
                    loader.position.set(bx, 0.17, bz);
                    loader.scale.setScalar(0.01);
                    loader.visible = true;
                }
                
                const tag = this.nameTags[idx];
                if (tag) {
                    tag.position.set(bx, 0.16, bz);
                    tag.visible = true;
                }
                
                // Re-skin texture
                const bMat = this.bubbleMats[idx] as THREE.MeshStandardMaterial;
                const tKey = thumbKeys[idx] ?? thumbKeys[0];
                if (tKey === 'mivVideo') {
                    bMat.map = this.mivVideoTex;
                } else {
                    const tex = AssetManager.getTexture(tKey);
                    if (tex) {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        bMat.map = tex;
                    }
                }
                bMat.needsUpdate = true;
                
                // Update Name Tag texture
                const name = this.domainNames[idx];
                const nameTex = this.createNameTagTexture(name);
                const nameMat = this.nameTagMats[idx] as THREE.MeshBasicMaterial;
                if (nameMat.map) nameMat.map.dispose();
                nameMat.map = nameTex;
                nameMat.needsUpdate = true;
            } else {
                // Hide excess pre-allocated bubbles
                bubble.visible = false;
                if (this.anchorRings[idx]) this.anchorRings[idx].visible = false;
                if (this.loaderRings[idx]) this.loaderRings[idx].visible = false;
                if (this.nameTags[idx]) this.nameTags[idx].visible = false;
            }
        });

        this.lastBubbleSkinStadium = stadiumType;
        console.log(`[StadiumSelector] Bubble skins updated to ${stadiumType}`);

        // ── Show/hide existing stadium meshes ────────────────────────────────
        if (this.stadiumMesh) {
            this.stadiumMesh.visible = (stadiumType === 'default');
        }
        if (this.berlinMesh) {
            this.berlinMesh.visible = (stadiumType === 'berlin');
        }
        if (this.inuitMesh) {
            this.inuitMesh.visible = (stadiumType === 'inuit');
        }
        if (this.butterflyGroup) {
            this.butterflyGroup.visible = (stadiumType === 'butterflies');
        }
        if (this.nurburgringGroup) {
            this.nurburgringGroup.visible = (stadiumType === 'nurburgring');
        }
        if (this.minimapMapPlane) {
            this.minimapMapPlane.visible = (stadiumType !== 'butterflies' && stadiumType !== 'nurburgring');
        }
        if (this.techRing1) {
            this.techRing1.visible = (stadiumType !== 'butterflies');
        }
        if (this.techRing2) {
            this.techRing2.visible = (stadiumType !== 'butterflies');
        }
        if (this.techRing3) {
            this.techRing3.visible = (stadiumType !== 'butterflies');
        }

        // Lazily build Butterfly Park flat ground and butterflies
        if (stadiumType === 'butterflies' && !this.butterflyGroup) {
            this.createButterflyGroup();
        }

        // Lazily build Nürburgring racetrack
        if (stadiumType === 'nurburgring' && !this.nurburgringGroup) {
            this.createNurburgringGroup();
        }

        // 2. Lazily create new meshes if they don't exist yet
        if (stadiumType === 'berlin' && !this.berlinMesh) {
            const berlinGroup = new THREE.Group();
            
            const berlinAsset = AssetManager.getGLTF("olympiastadion");
            if (berlinAsset) {
                const mesh = berlinAsset.scene.clone();
                
                // Measure bounding box to scale it correctly to fit the map (0.24m diameter)
                const box = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                const maxDim = Math.max(size.x, size.z);
                const berlinScale = 0.24 / (maxDim || 1.0);
                mesh.scale.setScalar(berlinScale);
                // Align base of Berlin stadium to table surface dynamically
                mesh.updateMatrixWorld(true);
                const berlinBox = new THREE.Box3().setFromObject(mesh);
                const berlinMinY = berlinBox.min.y;
                mesh.position.set(0, -berlinMinY + 0.0005, 0);
                berlinGroup.add(mesh);
                
                // Find field mesh and attach football goal posts at opposite ends
                let fieldMesh: THREE.Mesh | null = null;
                mesh.traverse((child: any) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        const name = child.name.toLowerCase();
                        const parentName = child.parent ? child.parent.name.toLowerCase() : "";
                        
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map((m: any) => applyStadiumMaterial(m, name, parentName));
                        } else {
                            child.material = applyStadiumMaterial(child.material, name, parentName);
                        }

                        if (name.includes('field') || name.includes('grass') || name.includes('pitch')) {
                            fieldMesh = child;
                        }
                    }
                });

                if (fieldMesh) {
                    const goal1 = this.createGoalPost();
                    const goal2 = this.createGoalPost();
                    this.berlinGoal1 = goal1;
                    this.berlinGoal2 = goal2;
                    this.goal1NetMesh = goal1.children[3] as THREE.LineSegments;
                    this.goal2NetMesh = goal2.children[3] as THREE.LineSegments;

                    (fieldMesh as THREE.Mesh).geometry.computeBoundingBox();
                    const bbox = (fieldMesh as THREE.Mesh).geometry.boundingBox;
                    if (bbox) {
                        const fSize = new THREE.Vector3();
                        bbox.getSize(fSize);
                        const fCenter = new THREE.Vector3();
                        bbox.getCenter(fCenter);

                        // Position goal posts at local boundaries along the major axis
                        if (fSize.z > fSize.x) {
                            goal1.position.set(fCenter.x, fCenter.y, fCenter.z + fSize.z * 0.44);
                            goal1.rotation.y = Math.PI; // Face inward

                            goal2.position.set(fCenter.x, fCenter.y, fCenter.z - fSize.z * 0.44);
                            goal2.rotation.y = 0; // Face inward
                        } else {
                            goal1.position.set(fCenter.x + fSize.x * 0.44, fCenter.y, fCenter.z);
                            goal1.rotation.y = -Math.PI / 2; // Face inward

                            goal2.position.set(fCenter.x - fSize.x * 0.44, fCenter.y, fCenter.z);
                            goal2.rotation.y = Math.PI / 2; // Face inward
                        }
                    } else {
                        goal1.position.set(0.0, 0.002, 0.05);
                        goal2.position.set(0.0, 0.002, -0.05);
                        goal1.rotation.y = Math.PI;
                    }

                    mesh.add(goal1, goal2);
                    console.log("[BerlinStadium] Holographic goal posts attached to field boundaries!");
                }
                this.collectStadiumMaterials(mesh);
            } else {
                // Procedural Fallback Cylinder wall (openEnded: true)
                const cylinderGeo = new THREE.CylinderGeometry(0.096, 0.096, 0.095, 64, 1, true);
                cylinderGeo.translate(0, 0.095 / 2, 0);
                const berlinMat = new THREE.MeshStandardMaterial({
                    color: 0x22d3ee,
                    roughness: 0.1,
                    metalness: 0.8,
                    transparent: true,
                    opacity: 0.35,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const cylinderWall = new THREE.Mesh(cylinderGeo, berlinMat);
                berlinGroup.add(cylinderWall);
            }

            // Grid floor & anchor helper
            const gridHelper = new THREE.GridHelper(0.192, 10, 0x22d3ee, 0x114466);
            gridHelper.position.y = 0.0015;
            berlinGroup.add(gridHelper);

            this.berlinMesh = berlinGroup as any;
            this.tableGroup.add(this.berlinMesh!);
        }

        if (stadiumType === 'inuit' && !this.inuitMesh) {
            const inuitGroup = new THREE.Group();

            const inuitAsset = AssetManager.getGLTF("cryptocom");
            if (inuitAsset) {
                const mesh = inuitAsset.scene.clone();
                
                // Measure bounding box to scale it correctly to fit the map (0.24m diameter)
                const box = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                const maxDim = Math.max(size.x, size.z);
                const inuitScale = (0.24 / (maxDim || 1.0)) * 1.30;
                mesh.scale.setScalar(inuitScale);
                // Align base of Inuit/Crypto stadium to table surface dynamically
                mesh.updateMatrixWorld(true);
                const inuitBox = new THREE.Box3().setFromObject(mesh);
                const inuitMinY = inuitBox.min.y;
                mesh.position.set(0, -inuitMinY + 0.0005, 0);
                inuitGroup.add(mesh);
                
                // Traverse child meshes and recursively apply PBR materials
                let courtMesh: THREE.Mesh | null = null;
                mesh.traverse((child: any) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        const name = child.name.toLowerCase();
                        const parentName = child.parent ? child.parent.name.toLowerCase() : "";
                        
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map((m: any) => applyStadiumMaterial(m, name, parentName));
                        } else {
                            child.material = applyStadiumMaterial(child.material, name, parentName);
                        }

                        if (name.includes('court') || name.includes('floor') || name.includes('field') || name.includes('pitch') || name.includes('ground')) {
                            courtMesh = child;
                        }
                    }
                });

                const hoop1 = this.createBasketballHoop();
                const hoop2 = this.createBasketballHoop();
                this.basketballHoop1 = hoop1;
                this.basketballHoop2 = hoop2;
                this.hoop1NetMesh = (hoop1 as any).netMesh;
                this.hoop2NetMesh = (hoop2 as any).netMesh;

                if (courtMesh) {
                    (courtMesh as THREE.Mesh).geometry.computeBoundingBox();
                    const bbox = (courtMesh as THREE.Mesh).geometry.boundingBox;
                    if (bbox) {
                        const fSize = new THREE.Vector3();
                        bbox.getSize(fSize);
                        const fCenter = new THREE.Vector3();
                        bbox.getCenter(fCenter);

                        // Position hoops at local boundaries along the major axis
                        if (fSize.z > fSize.x) {
                            hoop1.position.set(fCenter.x, fCenter.y + 0.002, fCenter.z + fSize.z * 0.44);
                            hoop1.rotation.y = Math.PI; // Face inward

                            hoop2.position.set(fCenter.x, fCenter.y + 0.002, fCenter.z - fSize.z * 0.44);
                            hoop2.rotation.y = 0; // Face inward
                        } else {
                            hoop1.position.set(fCenter.x + fSize.x * 0.44, fCenter.y + 0.002, fCenter.z);
                            hoop1.rotation.y = -Math.PI / 2; // Face inward

                            hoop2.position.set(fCenter.x - fSize.x * 0.44, fCenter.y + 0.002, fCenter.z);
                            hoop2.rotation.y = Math.PI / 2; // Face inward
                        }
                    } else {
                        hoop1.position.set(0.0, 0.002, 0.045);
                        hoop1.rotation.y = Math.PI;
                        hoop2.position.set(0.0, 0.002, -0.045);
                        hoop2.rotation.y = 0;
                    }
                } else {
                    hoop1.position.set(0.0, 0.002, 0.045);
                    hoop1.rotation.y = Math.PI;
                    hoop2.position.set(0.0, 0.002, -0.045);
                    hoop2.rotation.y = 0;
                }

                mesh.add(hoop1, hoop2);
                console.log("[InuitStadium] Holographic basketball hoops attached to court boundaries!");
                this.collectStadiumMaterials(mesh);
            } else {
                // FALLBACK: Extruded Elliptical Wall (oval cross-section tube)
                const segments = 64;
                const height = 0.095;
                const a = 0.07 * 1.30; // Swapped and scaled up by 30%
                const b = 0.11 * 1.30; // Swapped and scaled up by 30%
                const inuitGeo = new THREE.BufferGeometry();
                const vertices: number[] = [];
                const indices: number[] = [];
                const uvs: number[] = [];

                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * 2 * Math.PI;
                    const x = a * Math.cos(theta);
                    const z = b * Math.sin(theta);
                    
                    // Bottom vertex (raised to 0.010)
                    vertices.push(x, 0.010, z);
                    uvs.push(i / segments, 0);

                    // Top vertex
                    vertices.push(x, height, z);
                    uvs.push(i / segments, 1);
                }

                for (let i = 0; i < segments; i++) {
                    const idx = i * 2;
                    indices.push(idx, idx + 1, idx + 2);
                    indices.push(idx + 1, idx + 3, idx + 2);
                }

                inuitGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                inuitGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                inuitGeo.setIndex(indices);
                inuitGeo.computeVertexNormals();

                const inuitMat = new THREE.MeshStandardMaterial({
                    color: 0xf97316,
                    roughness: 0.15,
                    metalness: 0.9,
                    transparent: true,
                    opacity: 0.35,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ovalWall = new THREE.Mesh(inuitGeo, inuitMat);
                inuitGroup.add(ovalWall);

                // Top neon ring
                const ringPoints: THREE.Vector3[] = [];
                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * 2 * Math.PI;
                    ringPoints.push(new THREE.Vector3(a * Math.cos(theta), height, b * Math.sin(theta)));
                }
                const topRingGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
                const ringMat = new THREE.LineBasicMaterial({ color: 0xf97316, linewidth: 3 });
                const topRing = new THREE.Line(topRingGeo, ringMat);
                inuitGroup.add(topRing);

                // Bottom neon ring (raised to 0.010)
                const bottomPoints: THREE.Vector3[] = [];
                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * 2 * Math.PI;
                    bottomPoints.push(new THREE.Vector3(a * Math.cos(theta), 0.010, b * Math.sin(theta)));
                }
                const bottomRingGeo = new THREE.BufferGeometry().setFromPoints(bottomPoints);
                const bottomRing = new THREE.Line(bottomRingGeo, ringMat);
                inuitGroup.add(bottomRing);

                // Grid floor: Oriented vertically to match Z-axis gameplay orientation and scaled by 30%
                const floorGeo = new THREE.PlaneGeometry(0.14 * 1.30, 0.22 * 1.30);
                floorGeo.rotateX(-Math.PI / 2);
                const floorMat = new THREE.MeshBasicMaterial({
                    color: 0x1a0d02,
                    transparent: true,
                    opacity: 0.8,
                    side: THREE.DoubleSide
                });
                const floorMesh = new THREE.Mesh(floorGeo, floorMat);
                floorMesh.position.y = 0.009; // raised from 0.001 to 0.009
                inuitGroup.add(floorMesh);

                const gridHelper = new THREE.GridHelper(0.22 * 1.30, 10, 0xf97316, 0x663311);
                gridHelper.position.y = 0.0095; // raised from 0.0015 to 0.0095
                inuitGroup.add(gridHelper);

                // Procedurally generate two glowing NBA basketball hoops (positions scaled by 30%)
                const hoop1 = this.createBasketballHoop();
                hoop1.position.set(0.0, 0.010, 0.045 * 1.30); // raised from 0.002 to 0.010
                hoop1.rotation.y = Math.PI; // Face inward
                
                const hoop2 = this.createBasketballHoop();
                hoop2.position.set(0.0, 0.010, -0.045 * 1.30); // raised from 0.002 to 0.010
                hoop2.rotation.y = 0; // Face inward

                inuitGroup.add(hoop1, hoop2);
                
                this.basketballHoop1 = hoop1;
                this.basketballHoop2 = hoop2;
                this.hoop1NetMesh = (hoop1 as any).netMesh;
                this.hoop2NetMesh = (hoop2 as any).netMesh;
            }

            this.inuitMesh = inuitGroup as any;
            this.tableGroup.add(this.inuitMesh!);
        }

        // 3. Reset Physics Bouncing ball & clear trail to avoid visual artifacts
        this.isBallAnimating = true;
        this.ballAnimT = 0.0;
        this.trailPoints = [];
        this.ballTrail.geometry.setFromPoints([]);
        
        // Reset to a safe starting location inside the new geometry
        this.activeBall.position.set(0, 0.025, 0.0);
        this.ballVelocity.set(0.045, 0.035, 0.055);
        (this.activeBall.material as THREE.MeshBasicMaterial).opacity = 1.0;
        (this.ballTrail.material as THREE.LineBasicMaterial).opacity = 0.95;
        
        // Make ball size in cricket stadium 50% smaller (relative to enhanced baseline)
        const ballScale = (stadiumType === 'default') ? 0.85 : 1.65;
        if (this.activeBall) this.activeBall.scale.setScalar(ballScale);
        if (this.hawkeyeBall) this.hawkeyeBall.scale.setScalar(ballScale);
        if (this.sequenceBall) this.sequenceBall.scale.setScalar(ballScale);
        if (this.sandboxBall) this.sandboxBall.scale.setScalar(ballScale);
        
        // Assign color based on stadium
        const colors = { default: 0xff6600, berlin: 0x22d3ee, inuit: 0xf97316, butterflies: 0x10b981, nurburgring: 0x22d3ee };
        (this.activeBall.material as THREE.MeshBasicMaterial).color.setHex(colors[stadiumType]);
        (this.ballTrail.material as THREE.LineBasicMaterial).color.setHex(colors[stadiumType]);

        // 4. Update the player markers for the active sport/stadium
        this.players.forEach(p => {
            this.tableGroup.remove(p.group);
        });
        this.players = [];
        this.initPlayerMarkers();

        // 5. Update bubble name tags
        this.nameTags.forEach((tagMesh, idx) => {
            const newName = this.domainNames[idx] || "Unknown";
            const newTex = this.createNameTagTexture(newName);
            const mat = tagMesh.material as THREE.MeshBasicMaterial;
            if (mat.map) mat.map.dispose();
            mat.map = newTex;
            mat.needsUpdate = true;
        });

        // 6. Update Wankhede/Berlin/Inuit Pin Label
        if (this.locationPin && this.locationPin.children.length >= 4) {
            const pinLabelMesh = this.locationPin.children[3] as THREE.Mesh;
            const pinLabelMat = pinLabelMesh.material as THREE.MeshBasicMaterial;
            const newLabel = stadiumType === 'berlin' ? 'OLYMPIASTADION' : stadiumType === 'inuit' ? 'CRYPTO.COM ARENA' : stadiumType === 'nurburgring' ? 'NÜRBURGRING 24H' : 'WANKHEDE STADIUM';
            
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'rgba(5, 5, 20, 0.88)';
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 4;
            const r2 = 16, w2 = 246, h2 = 54, x2 = 5, y2 = 5;
            ctx.beginPath();
            ctx.moveTo(x2 + r2, y2); ctx.lineTo(x2 + w2 - r2, y2);
            ctx.quadraticCurveTo(x2 + w2, y2, x2 + w2, y2 + r2);
            ctx.lineTo(x2 + w2, y2 + h2 - r2);
            ctx.quadraticCurveTo(x2 + w2, y2 + h2, x2 + w2 - r2, y2 + h2);
            ctx.lineTo(x2 + r2, y2 + h2);
            ctx.quadraticCurveTo(x2, y2 + h2, x2, y2 + h2 - r2);
            ctx.lineTo(x2, y2 + r2);
            ctx.quadraticCurveTo(x2, y2, x2 + r2, y2);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = newLabel.length > 15 ? 'bold 18px monospace' : 'bold 22px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(newLabel, 128, 32);
            
            if (pinLabelMat.map) pinLabelMat.map.dispose();
            const newTex = new THREE.CanvasTexture(canvas);
            newTex.colorSpace = THREE.SRGBColorSpace;
            pinLabelMat.map = newTex;
            pinLabelMat.needsUpdate = true;
        }

        // 7. Trigger celebratory fireworks on the outer circle of the top part of the stadium
        const stColors = stadiumType === 'berlin' ? [0x22d3ee, 0xffaa00, 0xff33aa]
                       : stadiumType === 'inuit'  ? [0xf97316, 0x00ffff, 0xffff00]
                       : stadiumType === 'nurburgring' ? [0xff5500, 0x22d3ee, 0xff00ff]
                       : [0xff6600, 0x00ff66, 0x00aaff];

        // Trigger 3 fireworks spaced out along the roof rim circle
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            this.triggerFirework(
                Math.sin(angle) * this.ROOF_RADIUS,
                this.ROOF_Y + 0.015,
                Math.cos(angle) * this.ROOF_RADIUS,
                stColors[i]
            );
        }

        // Toggle visibility of the cricket props based on stadium selection
        if (this.sportPropsGroup) {
            this.sportPropsGroup.visible = (stadiumType === 'default');
        }

        // Dynamic Coloring of the Holographic Cylinder and Wireframe
        const activeColor = colors[stadiumType] || 0x00ffff;
        if (this.holoCylinder && this.holoCylinder.material) {
            (this.holoCylinder.material as THREE.MeshPhongMaterial).color.setHex(activeColor);
        }
        if (this.holoCylinderWire && this.holoCylinderWire.material) {
            (this.holoCylinderWire.material as THREE.LineBasicMaterial).color.setHex(activeColor);
        }

        // Update the Tactical Command Dock (TCD) button labels dynamically
        this.updateTCDButtonLabels();

        // Compute dynamic floor Y based on loaded 3D meshes
        this.calculateDynamicFloorY();
    }

    private calculateDynamicFloorY() {
        let fieldMesh: any = null;
        const stType = this.currentStadiumType;

        if (stType === 'default' && this.stadiumMesh) {
            this.stadiumMesh.updateMatrixWorld(true);
            this.stadiumMesh.traverse((child: any) => {
                if (!fieldMesh && child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();
                    if (name.includes('pitch') || name.includes('field') || name.includes('grass')) {
                        fieldMesh = child;
                    }
                }
            });
        } else if (stType === 'berlin' && this.berlinMesh) {
            this.berlinMesh.updateMatrixWorld(true);
            this.berlinMesh.traverse((child: any) => {
                if (!fieldMesh && child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();
                    if (name.includes('pitch') || name.includes('field') || name.includes('grass')) {
                        fieldMesh = child;
                    }
                }
            });
        } else if (stType === 'inuit' && this.inuitMesh) {
            this.inuitMesh.updateMatrixWorld(true);
            this.inuitMesh.traverse((child: any) => {
                if (!fieldMesh && child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();
                    if (name.includes('court') || name.includes('floor') || name.includes('field') || name.includes('pitch') || name.includes('ground')) {
                        fieldMesh = child;
                    }
                }
            });
        }

        if (fieldMesh) {
            fieldMesh.geometry.computeBoundingBox();
            const bbox = fieldMesh.geometry.boundingBox;
            if (bbox) {
                const localMaxY = bbox.max.y;
                const tempVec = this.scratchVector3;
                tempVec.set(0, localMaxY, 0);

                let current: THREE.Object3D | null = fieldMesh;
                while (current && current !== this.tableGroup) {
                    tempVec.applyMatrix4(current.matrix);
                    current = current.parent;
                }

                this.dynamicFloorY = tempVec.y;
                console.log(`[DynamicFloorY] Computed floor Y for '${stType}': ${this.dynamicFloorY}`);
                return;
            }
        }

        // Fallback if no mesh found
        if (stType === 'inuit') {
            this.dynamicFloorY = 0.010;
        } else {
            this.dynamicFloorY = 0.001;
        }
        console.log(`[DynamicFloorY] Fallback floor Y for '${stType}': ${this.dynamicFloorY}`);
    }

    private updateTCDButtonLabels() {
        if (!this.tcdButtonLabels || this.tcdButtonLabels.length < 3) return;

        const stType = this.currentStadiumType;
        let labels = ["KOHLI", "SHARMA", "SCOOP"];
        const colors = [0x00ffff, 0xffff00, 0x00ff66];

        if (stType === 'berlin') {
            labels = ["CROSS", "HEADER", "VOLLEY"];
        } else if (stType === 'inuit') {
            labels = ["STEAL", "LAYUP", "3PT"];
        } else if (stType === 'butterflies') {
            labels = ["FLY", "FLUTTER", "GLIDE"];
        } else if (stType === 'nurburgring') {
            labels = ["RACE", "SPEED", "LAP"];
        }

        for (let i = 0; i < 3; i++) {
            const labelMesh = this.tcdButtonLabels[i];
            if (!labelMesh) continue;

            const labelVal = labels[i];
            const colorVal = colors[i];

            // Re-draw text on canvas
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, 128, 64);
            ctx.fillStyle = 'rgba(2, 6, 26, 0.94)';
            ctx.fillRect(0, 0, 128, 64);
            
            const hexStr = '#' + colorVal.toString(16).padStart(6, '0');
            ctx.strokeStyle = hexStr;
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 124, 60);

            ctx.fillStyle = '#ffffff';
            if (labelVal.length > 6) {
                ctx.font = 'bold 15px monospace';
            } else {
                ctx.font = 'bold 20px monospace';
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelVal, 64, 32);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;

            const mat = labelMesh.material as THREE.MeshBasicMaterial;
            if (mat.map) {
                mat.map.dispose();
            }
            mat.map = tex;
            mat.needsUpdate = true;
        }
    }

    update(dt: number) {
        (window as any).isSportSequenceActive = this.isSportSequenceActive;
        if (this.middlePinchCooldown > 0) {
            this.middlePinchCooldown -= dt;
        }
        if (this.menuToggleCooldown > 0) {
            this.menuToggleCooldown -= dt;
        }

        const desiredStadium = (window as any).selectedStadiumType || 'default';
        if (this.currentStadiumType !== desiredStadium) {
            this.setStadiumType(desiredStadium);
        }

        // --- Update Butterflies in the Minimap ---
        if (this.currentStadiumType === 'butterflies' && this.butterflyGroup && this.tableGroup.visible) {
            this.butterflies.forEach((b) => {
                b.wanderTime -= dt;
                if (b.wanderTime <= 0) {
                    b.wanderTime = 1.0 + Math.random() * 3.0;
                    b.vel.x += (Math.random() - 0.5) * 0.02;
                    b.vel.y += (Math.random() - 0.5) * 0.015;
                    b.vel.z += (Math.random() - 0.5) * 0.02;
                    b.vel.clampLength(0.01, 0.04);
                }
                
                // Position update
                b.pos.addScaledVector(b.vel, dt);
                
                // Boundaries (radius = 0.16m, height = 0.01 to 0.1m)
                const distFromCenter = Math.sqrt(b.pos.x * b.pos.x + b.pos.z * b.pos.z);
                if (distFromCenter > 0.16) {
                    b.vel.x *= -1;
                    b.vel.z *= -1;
                    b.pos.x = (b.pos.x / distFromCenter) * 0.158;
                    b.pos.z = (b.pos.z / distFromCenter) * 0.158;
                }
                if (b.pos.y < 0.01) {
                    b.pos.y = 0.01;
                    b.vel.y *= -1;
                } else if (b.pos.y > 0.1) {
                    b.pos.y = 0.1;
                    b.vel.y *= -1;
                }
                
                b.mesh.position.copy(b.pos);
                
                // Heading rotation
                if (b.vel.lengthSq() > 0.00001) {
                    b.mesh.rotation.y = Math.atan2(b.vel.x, b.vel.z);
                }
                
                // Flapping animation
                b.phase += dt * b.speed;
                const flap = Math.sin(b.phase) * (Math.PI / 3);
                b.leftWing.rotation.z = flap;
                b.rightWing.rotation.z = -flap;
            });
        }

        // --- Update Nürburgring in the Minimap ---
        if (this.currentStadiumType === 'nurburgring' && this.nurburgringGroup && this.tableGroup.visible) {
            const isImmersive = this.currentTableScale >= 2.5;

            // Update base race progress
            this.nurburgringF1Progress += dt * this.nurburgringF1Speed;
            if (this.nurburgringF1Progress > 1.0) this.nurburgringF1Progress -= 1.0;

            // Determine if the track is in a corner at current progress using tangent change curvature check
            const t1 = this.scratchVector1;
            const t2 = this.scratchVector2;
            this.nurburgringCurve.getTangentAt(this.nurburgringF1Progress, t1);
            this.nurburgringCurve.getTangentAt((this.nurburgringF1Progress + 0.015) % 1.0, t2);
            const dot = t1.normalize().dot(t2.normalize());
            const isCorner = dot < 0.992; // high curvature = corner

            if (isCorner) {
                // Advance overtake phase in corners
                this.nurburgringOvertakePhase += dt * 1.5;
            } else {
                // Snap/lerp to nearest lead state on straights (drafting in single file)
                const targetPhase = Math.round(this.nurburgringOvertakePhase / Math.PI) * Math.PI;
                this.nurburgringOvertakePhase += (targetPhase - this.nurburgringOvertakePhase) * 5.0 * dt;
            }

            // Update all three detailed F1 cars
            this.nurburgringCars.forEach((car) => {
                car.group.visible = true;

                // Calculate progress and lateral offset for the car to simulate a realistic battle
                let carProgress = 0.0;
                let lateralOffset = 0.0;

                if (car.colorType === 'merc') {
                    // Mercedes F1 car
                    const progressDiff = Math.cos(this.nurburgringOvertakePhase) * 0.007; // split the total 0.014 difference
                    carProgress = (this.nurburgringF1Progress + progressDiff + 1.0) % 1.0;
                    lateralOffset = Math.sin(this.nurburgringOvertakePhase) * 0.0035;
                } else if (car.colorType === 'redbull') {
                    // Red Bull F1 car
                    const progressDiff = -Math.cos(this.nurburgringOvertakePhase) * 0.007; // opposite sign
                    carProgress = (this.nurburgringF1Progress + progressDiff + 1.0) % 1.0;
                    lateralOffset = -Math.sin(this.nurburgringOvertakePhase) * 0.0035;
                } else {
                    // Ferrari F1 car (trailing in 3rd)
                    carProgress = (this.nurburgringF1Progress - 0.038 + 1.0) % 1.0;
                    lateralOffset = 0.001; // slightly off-center
                }

                // Query positions and tangents from Nurburgring spline curve
                this.nurburgringCurve.getPointAt(carProgress, this.f1Pos);
                this.nurburgringCurve.getTangentAt(carProgress, this.f1zAxis);
                this.f1zAxis.normalize();

                const worldUp = this.scratchVector1.set(0, 1, 0);
                this.f1xAxis.crossVectors(worldUp, this.f1zAxis).normalize();
                this.f1yAxis.crossVectors(this.f1zAxis, this.f1xAxis).normalize();

                // Apply lateral lane offsets to positions
                this.f1Pos.addScaledVector(this.f1xAxis, lateralOffset);

                // Set car position and scale-adjusted height
                car.group.position.copy(this.f1Pos);
                car.group.position.y += 0.0011 * 0.8; // 20% smaller height offset

                // Apply spatial rotation matrix to match curves and track elevations
                this.f1RotationMatrix.makeBasis(this.f1xAxis, this.f1yAxis, this.f1zAxis);
                car.group.quaternion.setFromRotationMatrix(this.f1RotationMatrix);

                // Spin wheels locally
                car.wheels.forEach((wheel) => {
                    wheel.rotation.x -= dt * 35.0;
                });
            });

            if (isImmersive) {
                // Show HUD on Mercedes car
                if (this.f1HudMesh) this.f1HudMesh.visible = true;

                // ── 1. DYNAMIC WET TRACK REFLECTION ──
                if (this.nurburgringTrackMat) {
                    if (this.weatherMode === 'rain') {
                        this.nurburgringTrackMat.roughness = 0.15;
                        this.nurburgringTrackMat.metalness = 0.85;
                        this.nurburgringTrackMat.color.setHex(0x0a0a0f); // darker when wet
                    } else {
                        this.nurburgringTrackMat.roughness = 0.75;
                        this.nurburgringTrackMat.metalness = 0.25;
                        this.nurburgringTrackMat.color.setHex(0x1b1b22);
                    }
                }

                // ── 2. SPEED, GEAR, RPM, THROTTLE, BRAKE PROFILING ──
                const fProgress = this.nurburgringF1Progress;
                let speed = 220;
                let gear = 5;
                let rpm = 11500;
                let throttle = 1.0;
                let brake = 0.0;

                if (fProgress >= 0.85 && fProgress < 0.98) {
                    // Main straight
                    const ratio = (fProgress - 0.85) / 0.13;
                    speed = Math.floor(290 + ratio * 55); // 290 to 345 km/h
                    gear = 8;
                    rpm = Math.floor(11500 + ratio * 1600);
                    throttle = 1.0;
                    brake = 0.0;
                } else if (fProgress >= 0.98 || fProgress < 0.04) {
                    // Heavy braking into T1
                    const ratio = fProgress >= 0.98 ? (fProgress - 0.98) / 0.06 : (fProgress + 0.02) / 0.06;
                    speed = Math.floor(345 - ratio * 230); // 345 down to 115 km/h
                    gear = Math.max(2, Math.floor(8 - ratio * 6));
                    rpm = Math.floor(13100 - ratio * 3900);
                    throttle = 0.0;
                    brake = Math.sin(ratio * Math.PI) * 1.0; // spikes up
                } else if (fProgress >= 0.04 && fProgress < 0.35) {
                    // Hatzenbach twisty curves
                    const ratio = (fProgress - 0.04) / 0.31;
                    speed = Math.floor(130 + Math.sin(ratio * Math.PI * 4) * 40 + ratio * 80);
                    gear = Math.floor(3 + ratio * 3);
                    rpm = Math.floor(9500 + Math.sin(ratio * Math.PI * 6) * 1500);
                    throttle = 0.6 + Math.sin(ratio * Math.PI * 4) * 0.3;
                    brake = Math.max(0.0, -Math.sin(ratio * Math.PI * 4) * 0.4);
                } else if (fProgress >= 0.35 && fProgress < 0.60) {
                    // Adenauer Forst & Wehrseifen corners
                    const ratio = (fProgress - 0.35) / 0.25;
                    speed = Math.floor(180 - ratio * 90);
                    gear = Math.max(2, Math.floor(5 - ratio * 3));
                    rpm = Math.floor(11000 - ratio * 2000);
                    throttle = 0.2 + ratio * 0.3;
                    brake = Math.max(0.0, Math.sin(ratio * Math.PI * 2) * 0.7);
                } else {
                    // Preparing and entering Döttinger straight
                    const ratio = (fProgress - 0.60) / 0.25;
                    speed = Math.floor(90 + ratio * 200);
                    gear = Math.floor(2 + ratio * 6);
                    rpm = Math.floor(8500 + ratio * 3000);
                    throttle = 1.0;
                    brake = 0.0;
                }

                // ── 3. DYNAMIC TELEMETRY HUD CANVAS DRAW ──
                if (this.f1HudCtx) {
                    const ctx = this.f1HudCtx;
                    ctx.clearRect(0, 0, 256, 128);

                    // Translucent backing panel
                    ctx.fillStyle = 'rgba(10, 15, 30, 0.82)';
                    ctx.fillRect(0, 0, 256, 128);

                    // Tech glowing border
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(4, 4, 248, 120);

                    // Speed display
                    ctx.font = 'bold 38px monospace';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(`${speed}`, 20, 50);
                    ctx.font = '14px monospace';
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText("KM/H", 102, 46);

                    // Gear selection
                    ctx.fillStyle = '#f59e0b'; // Amber gear
                    ctx.font = 'bold 44px monospace';
                    ctx.fillText(`${gear}`, 192, 54);
                    ctx.font = '11px monospace';
                    ctx.fillText("GEAR", 192, 18);

                    // Input visual progress bars
                    ctx.fillStyle = '#374151'; // dark slate
                    ctx.fillRect(20, 80, 100, 10);
                    ctx.fillStyle = '#10b981'; // Green throttle
                    ctx.fillRect(20, 80, Math.floor(throttle * 100), 10);

                    ctx.fillStyle = '#374151';
                    ctx.fillRect(136, 80, 100, 10);
                    ctx.fillStyle = '#ef4444'; // Red brake
                    ctx.fillRect(136, 80, Math.floor(brake * 100), 10);

                    ctx.font = '10px monospace';
                    ctx.fillStyle = '#9ca3af';
                    ctx.fillText("THR", 20, 74);
                    ctx.fillText("BRK", 136, 74);

                    // RPM visual bar
                    const rpmRatio = Math.max(0, Math.min(1.0, (rpm - 5000) / 10000));
                    ctx.fillStyle = '#374151';
                    ctx.fillRect(20, 105, 216, 8);
                    const rpmColor = rpm > 12000 ? '#ec4899' : '#06b6d4'; // shifts to pink/limiter
                    ctx.fillStyle = rpmColor;
                    ctx.fillRect(20, 105, Math.floor(rpmRatio * 216), 8);

                    this.f1HudTexture.needsUpdate = true;
                    this.f1HudMesh.visible = true;

                    // Face the player head (Zero-GC and using updated world-space matrices)
                    if (this.player && this.player.head) {
                        this.nurburgringF1Car.updateMatrixWorld(true);
                        const headPos = this.scratchVector3;
                        this.player.head.getWorldPosition(headPos);

                        const hudWorldPos = this.scratchVector1;
                        this.f1HudMesh.getWorldPosition(hudWorldPos);

                        // Look at the player's head in world space with vertical lock (no roll/pitch)
                        const m = this.scratchMatrix;
                        const worldUp = this.scratchVector2;
                        worldUp.set(0, 1, 0);
                        m.lookAt(hudWorldPos, headPos, worldUp);

                        const targetWorldQuat = this.scratchQuat1;
                        targetWorldQuat.setFromRotationMatrix(m);
                        
                        // Flip 180° so the plane's front face faces the user
                        const flipQuat = this.scratchQuat2;
                        flipQuat.setFromAxisAngle(worldUp, Math.PI);
                        targetWorldQuat.multiply(flipQuat);

                        // Convert world quaternion to local quaternion of f1HudMesh
                        const parentWorldQuat = this.scratchQuat2; // reuse scratchQuat2
                        this.nurburgringF1Car.getWorldQuaternion(parentWorldQuat);

                        const localQuat = this.scratchQuat1; // reuse scratchQuat1
                        localQuat.copy(parentWorldQuat).invert().multiply(targetWorldQuat);
                        this.f1HudMesh.quaternion.copy(localQuat);
                    }
                }

                // ── 4. WHEEL THERMALS & BRAKE DISC GLOW ──
                this.nurburgringF1WheelMats.forEach((wMat) => {
                    if (brake > 0.05) {
                        wMat.emissive.setHex(0xff3300).multiplyScalar(brake);
                    } else if (throttle < 0.85 && speed < 240) {
                        wMat.emissive.setHex(0x992200).multiplyScalar(0.4);
                    } else {
                        wMat.emissive.setHex(0x000000);
                    }
                });

                // ── 5. VORTEX VAPOR TRAILS ──
                if (this.f1VortexLeft && this.f1VortexRight) {
                    this.f1VortexLeft.visible = true;
                    this.f1VortexRight.visible = true;
                    (this.f1VortexLeft.material as THREE.LineBasicMaterial).opacity = 0.85;
                    (this.f1VortexRight.material as THREE.LineBasicMaterial).opacity = 0.85;

                    // Shift points array back to keep buffer pre-allocated (Zero-GC)
                    for (let i = 0; i < 24; i++) {
                        this.f1VortexLeftPoints[i].copy(this.f1VortexLeftPoints[i + 1]);
                        this.f1VortexRightPoints[i].copy(this.f1VortexRightPoints[i + 1]);
                    }

                    // Copy new wing tip positions in track local coordinates
                    this.f1VortexLeftPoints[24].set(-0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);
                    this.f1VortexRightPoints[24].set(0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);

                    this.f1VortexLeft.geometry.setFromPoints(this.f1VortexLeftPoints);
                    this.f1VortexRight.geometry.setFromPoints(this.f1VortexRightPoints);
                }

                // ── 6. WET SPRAY INSTANCED PARTICLES ──
                if (this.f1SprayMesh) {
                    if (this.weatherMode === 'rain') {
                        this.f1SprayMesh.visible = true;
                        (this.f1SprayMesh.material as THREE.MeshBasicMaterial).opacity = 0.45;

                        // Emit 2 new particles from rear tire contacts
                        const lRearPos = this.scratchVector1.set(-0.0037, 0.0002, -0.0048).applyMatrix4(this.nurburgringF1Car.matrix);
                        const rRearPos = this.scratchVector2.set(0.0037, 0.0002, -0.0048).applyMatrix4(this.nurburgringF1Car.matrix);
                        const heading = this.f1zAxis;

                        // FL slot
                        let idx = this.f1SprayEmitSlot * 8;
                        this.f1SprayData[idx + 0] = lRearPos.x;
                        this.f1SprayData[idx + 1] = lRearPos.y;
                        this.f1SprayData[idx + 2] = lRearPos.z;
                        this.f1SprayData[idx + 3] = heading.x * -0.008 + (Math.random() - 0.5) * 0.002;
                        this.f1SprayData[idx + 4] = 0.002 + Math.random() * 0.003;
                        this.f1SprayData[idx + 5] = heading.z * -0.008 + (Math.random() - 0.5) * 0.002;
                        this.f1SprayData[idx + 6] = 0.0;
                        this.f1SprayData[idx + 7] = 1.0; // active

                        // FR slot
                        idx = ((this.f1SprayEmitSlot + 1) % 60) * 8;
                        this.f1SprayData[idx + 0] = rRearPos.x;
                        this.f1SprayData[idx + 1] = rRearPos.y;
                        this.f1SprayData[idx + 2] = rRearPos.z;
                        this.f1SprayData[idx + 3] = heading.x * -0.008 + (Math.random() - 0.5) * 0.002;
                        this.f1SprayData[idx + 4] = 0.002 + Math.random() * 0.003;
                        this.f1SprayData[idx + 5] = heading.z * -0.008 + (Math.random() - 0.5) * 0.002;
                        this.f1SprayData[idx + 6] = 0.0;
                        this.f1SprayData[idx + 7] = 1.0; // active

                        this.f1SprayEmitSlot = (this.f1SprayEmitSlot + 2) % 60;

                        // Update all spray particles
                        for (let i = 0; i < 60; i++) {
                            const offset = i * 8;
                            if (this.f1SprayData[offset + 7] === 1.0) {
                                // move
                                this.f1SprayData[offset + 0] += this.f1SprayData[offset + 3];
                                this.f1SprayData[offset + 1] += this.f1SprayData[offset + 4];
                                this.f1SprayData[offset + 2] += this.f1SprayData[offset + 5];

                                // apply gravity / drag
                                this.f1SprayData[offset + 4] -= 0.005 * dt;
                                this.f1SprayData[offset + 3] *= 0.94;
                                this.f1SprayData[offset + 5] *= 0.94;

                                this.f1SprayData[offset + 6] += dt; // age
                                if (this.f1SprayData[offset + 6] > 0.35) {
                                    this.f1SprayData[offset + 7] = 0.0; // deactivate
                                    this.f1SprayDummy.position.set(0, -999, 0); // hide
                                    this.f1SprayDummy.updateMatrix();
                                    this.f1SprayMesh.setMatrixAt(i, this.f1SprayDummy.matrix);
                                } else {
                                    // Scale down as it ages
                                    const ageRatio = this.f1SprayData[offset + 6] / 0.35;
                                    const scale = 1.0 - ageRatio;

                                    this.f1SprayDummy.position.set(
                                        this.f1SprayData[offset + 0],
                                        this.f1SprayData[offset + 1],
                                        this.f1SprayData[offset + 2]
                                    );
                                    this.f1SprayDummy.scale.set(scale, scale, scale);
                                    this.f1SprayDummy.updateMatrix();
                                    this.f1SprayMesh.setMatrixAt(i, this.f1SprayDummy.matrix);
                                }
                            } else {
                                this.f1SprayDummy.position.set(0, -999, 0);
                                this.f1SprayDummy.updateMatrix();
                                this.f1SprayMesh.setMatrixAt(i, this.f1SprayDummy.matrix);
                            }
                        }
                        this.f1SprayMesh.instanceMatrix.needsUpdate = true;
                    } else {
                        this.f1SprayMesh.visible = false;
                    }
                }

            } else {
                // Hide F1 car
                this.nurburgringF1Car.visible = false;
                if (this.f1HudMesh) this.f1HudMesh.visible = false;
                if (this.f1VortexLeft) {
                    this.f1VortexLeft.visible = false;
                    this.f1VortexRight.visible = false;
                    this.f1VortexLeftPoints.forEach(p => p.set(0, 0, 0));
                    this.f1VortexRightPoints.forEach(p => p.set(0, 0, 0));
                }
                if (this.f1SprayMesh) this.f1SprayMesh.visible = false;
            }

            // Spectator particle effects removed — keep the map clean
        }

        // Expose a global window variable so Jugnu System ignores index pinches when this table is actively rotating
        (window as any).isRotatingMap = this.tableGroup.visible && this.isRotatingMap;
        (window as any).minimapTableVisible = this.tableGroup.visible;
        (window as any).minimapTablePosition = this.tableGroup.position;
        (window as any).minimapTableScale = this.currentTableScale;

        // Animate the B2B concentric tech telemetry rings in opposite directions
        if (this.tableGroup.visible && this.techRing1 && this.techRing2 && this.techRing3) {
            this.techRing1.rotation.z += dt * 0.22;
            this.techRing2.rotation.z -= dt * 0.14;
            this.techRing3.rotation.z += dt * 0.06;
        }

        // Update Floating AR TV Billboard (Floating and facing the player head)
        if (this.arBillboard && this.tableGroup.visible) {
            this.arFloatTime += dt;
            // Float up and down gently around Y = 0.175 (brought down by 4cm)
            const yOffset = 0.175 + Math.sin(this.arFloatTime * 2.5) * 0.006;
            this.arBillboard.position.y = yOffset;

            // Make the billboard face the player's head on Y-axis
            if (this.player && this.player.head) {
                const headPos = new THREE.Vector3();
                this.player.head.getWorldPosition(headPos);

                const billboardWorldPos = new THREE.Vector3();
                this.arBillboard.getWorldPosition(billboardWorldPos);

                // Ignore Y component of head to only rotate on the Y-axis (no awkward vertical tilt)
                const targetPos = headPos.clone();
                targetPos.y = billboardWorldPos.y;

                const toHead = new THREE.Vector3().subVectors(targetPos, billboardWorldPos).normalize();
                
                // Convert world view direction to tableGroup local space
                const localToHead = toHead.clone().applyQuaternion(this.tableGroup.quaternion.clone().invert());

                // Align the billboard's forward vector with localToHead direction
                const angle = Math.atan2(localToHead.x, localToHead.z);
                this.arBillboard.rotation.y = angle;
            }

            // --- B2B Broadcast Telemetry Scenario Selection Engine ---
            if (this.arBillboard.visible && this.currentTableScale <= 1.8) {
                const leftIndexTip = new THREE.Vector3();
                const rightIndexTip = new THREE.Vector3();
                const hasLeft = this.getIndexData('left', leftIndexTip);
                const hasRight = this.getIndexData('right', rightIndexTip);

                // Cooldown updates
                if (this.predictionCooldown > 0) this.predictionCooldown -= dt;

                this.predictionButtons.forEach((btn, index) => {
                    const btnWorldPos = new THREE.Vector3();
                    btn.getWorldPosition(btnWorldPos);

                    let distToLeft = Infinity;
                    let distToRight = Infinity;
                    if (hasLeft) distToLeft = leftIndexTip.distanceTo(btnWorldPos);
                    if (hasRight) distToRight = rightIndexTip.distanceTo(btnWorldPos);

                    const minDist = Math.min(distToLeft, distToRight);
                    const isHovered = minDist < 0.025; // 2.5cm proximity

                    // Visual hover scaling feedback
                    const targetScale = isHovered ? 1.18 : 1.0;
                    btn.scale.setScalar(THREE.MathUtils.lerp(btn.scale.x, targetScale, 10.0 * dt));

                    // Glow outer wireframe border outline
                    const borderMat = this.predictionButtonMats[index];
                    if (borderMat) {
                        const targetOpacity = isHovered ? 0.95 : 0.45;
                        borderMat.opacity = THREE.MathUtils.lerp(borderMat.opacity, targetOpacity, 10.0 * dt);
                    }

                    // Tactile virtual micro-vibrations
                    const baseLocalX = index === 0 ? -0.038 : (index === 2 ? 0.038 : 0.0);
                    const jitter = isHovered ? Math.sin(this.radarTime * 55.0) * 0.0006 : 0.0;
                    btn.position.x = baseLocalX + jitter;

                    // Proximity click tap trigger (1.3cm)
                    if (minDist < 0.014 && this.predictionCooldown <= 0.0 && !this.activePrediction && this.evaluationTimer <= 0.0) {
                        this.predictionCooldown = 1.2; // Cooldown limit

                        const betTypes: ('SIX' | 'WICKET' | 'DOT')[] = ['SIX', 'WICKET', 'DOT'];
                        const betType = betTypes[index];

                        this.activePrediction = betType;
                        this.predictionTimer = 3.5; // 3.5 seconds computation
                        this.predictionStatusText = `INITIATING TELEMETRY TRACE: ${betType}`;
                        
                        // Visual button compression click feedback
                        btn.scale.setScalar(0.7);

                        // Trigger visual confirmation flash
                        this.predictionFlashColor = 'rgba(0, 255, 204, 0.9)'; // Neon cyan flash
                        
                        this.redrawBillboard();
                    }
                });
            }

            // --- Telemetry Computation & Trajectory Trigger Engine ---
            if (this.activePrediction) {
                this.predictionTimer -= dt;
                
                this.redrawBillboard();

                if (this.predictionTimer <= 0.0) {
                    this.predictionTimer = 0.0;
                    
                    // Trigger B2B Hawk-Eye telemetry spline matching the chosen scenario
                    const chosenBet = this.activePrediction;
                    this.triggerHawkeye(chosenBet);
                    
                    this.activePrediction = null;
                    this.evaluationTimer = 2.0; // Wait 2s for ball delivery trajectory to complete
                    this.predictionStatusText = `HAWK-EYE TRAJECTORY CORE RUNNING...`;
                    this.redrawBillboard();
                }
            }

            if (this.evaluationTimer > 0.0) {
                this.evaluationTimer -= dt;
                if (this.evaluationTimer <= 0.0) {
                    this.evaluationTimer = 0.0;
                    
                    // Display premium data-rich analysis summaries
                    const path = this.currentHawkeyePath;
                    if (path === 'SIX') {
                        this.predictionStatusText = "exit velocity: 142km/h | launch: 32° | distance: 88m";
                    } else if (path === 'WICKET') {
                        this.predictionStatusText = "spin rate: 2200rpm | line: stump line | impact: inline";
                    } else {
                        this.predictionStatusText = "defensive index: 92.4% | control ratio: 88.6%";
                    }

                    this.predictionFlashColor = 'rgba(0, 255, 204, 0.95)'; // Greenish/cyan success flash
                    this.redrawBillboard();

                    // Restore standard status message after 4.5s
                    setTimeout(() => {
                        this.predictionStatusText = "SELECT ANALYTICS KERNEL TO INITIATE PROJECTION";
                        this.redrawBillboard();
                    }, 4500);
                }
            }

            // Dynamic flash color fade-out
            if (this.predictionFlashColor) {
                // Smoothly fade flash color back to empty/standard border
                if (Math.random() < 0.15) {
                    this.predictionFlashColor = '';
                    this.redrawBillboard();
                }
            }

            // --- B2B Hawk-Eye Passive Delivery Engine (DISABLED) ---
            // Trajectories now fire ONLY via interactive scenario button taps.
            // Passive auto-fire removed to prevent random yellow balls mid-session.

            // Tick B2B Hawk-Eye spline trajectory physics
            this.updateHawkEye(dt);
        }

        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        
        // Fetch middle pinch coordinate values
        this.getMiddlePinchData('left', leftTip);
        this.getMiddlePinchData('right', rightTip);

        // --- Left Wrist Button Tracking & Interaction ---
        const leftSource = this.input.getPrimaryInputSource('left');
        const frame = this.xrFrame;
        let leftWristFound = false;
        const wristWorldPos = new THREE.Vector3();

        if (leftSource && leftSource.hand && frame) {
            const wristJoint = leftSource.hand.get('wrist');
            if (wristJoint) {
                const refSpace = this.renderer.xr.getReferenceSpace();
                if (refSpace && typeof frame.getJointPose === 'function') {
                    const wristPose = frame.getJointPose(wristJoint, refSpace);
                    if (wristPose) {
                        const wx = wristPose.transform.position.x;
                        const wy = wristPose.transform.position.y;
                        const wz = wristPose.transform.position.z;
                        wristWorldPos.set(wx, wy, wz);
                        wristWorldPos.applyMatrix4(this.player.matrixWorld);
                        leftWristFound = true;
                    }
                }
            }
        }

        // Position and update visibility of left wrist button
        if (leftWristFound) {
            this.wristButton.position.copy(wristWorldPos);
            // Positioned slightly above the wrist on the dorsal side of the hand for natural tapping
            this.wristButton.position.y += 0.02; 
            this.wristButtonMat.opacity = THREE.MathUtils.lerp(this.wristButtonMat.opacity, 0.85, dt * 10.0);
            this.wristButton.visible = true;
        } else {
            this.wristButtonMat.opacity = THREE.MathUtils.lerp(this.wristButtonMat.opacity, 0.0, dt * 10.0);
            if (this.wristButtonMat.opacity < 0.01) {
                this.wristButton.visible = false;
            }
        }

        // Right index finger tip poke check on the wrist button
        const rightIndexTip = new THREE.Vector3();
        const hasRightIndex = this.getIndexData('right', rightIndexTip);
        let wristButtonTapped = false;

        if (leftWristFound && hasRightIndex) {
            const distToWrist = rightIndexTip.distanceTo(this.wristButton.position);
            if (distToWrist < 0.03) { // 3cm tap threshold
                wristButtonTapped = true;
            }
        }

        // Spawn or despawn the minimap table when wrist button is tapped or key M is pressed
        const toggleMinimap = wristButtonTapped || this.checkMButton() || (window as any).triggerMinimapToggle;

        if (toggleMinimap && this.menuToggleCooldown <= 0.0) {
            if ((window as any).triggerMinimapToggle) {
                (window as any).triggerMinimapToggle = false;
            }
            this.menuToggleCooldown = 0.8;
            this.isTableSpawned = !this.isTableSpawned;
            console.log(`[DomainExpansion] Minimap table toggled! isTableSpawned: ${this.isTableSpawned}`);

            if (this.isTableSpawned) {
                this.userTableScale = 1.0;
                this.lastLoggedScale = 1.0;
                this.isTwoHandScaling = false;
                this.targetTableScale = 1.0;
                this.tableGroup.visible = true;
                this.isRotatingMap = false; // Reset rotation state

                // Determine spawning position adaptive to user height, but fixed in space once spawned
                let spawnPos = new THREE.Vector3(0, 1.15, -0.55);
                let headHeight = 1.6;

                if (this.player && this.player.head) {
                    const headPos = new THREE.Vector3();
                    this.player.head.getWorldPosition(headPos);
                    headHeight = headPos.y;

                    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                    // Spawn 55cm in front of user's head
                    spawnPos.copy(headPos).addScaledVector(dir, 0.55);
                }
                
                // Adaptive desk height (headHeight - 0.45 meters)
                const finalSpawnPos = new THREE.Vector3(spawnPos.x, Math.max(0.4, headHeight - 0.45), spawnPos.z);
                this.tableGroup.position.copy(finalSpawnPos);
                
                // Singularity-Free Analytical Rotation (faces head's XZ direction)
                if (this.player && this.player.head) {
                    const headPos = new THREE.Vector3();
                    this.player.head.getWorldPosition(headPos);
                    const dx = headPos.x - finalSpawnPos.x;
                    const dz = headPos.z - finalSpawnPos.z;
                    const yaw = Math.atan2(dx, dz);
                    this.tableGroup.rotation.set(0, yaw + Math.PI, 0); // Face player
                } else {
                    this.tableGroup.rotation.set(0, Math.PI, 0);
                }

                // Advance Tutorial step 2 -> 3 if needed
                this.queries.jugnu.entities.forEach(e => {
                    if (e.getValue(Jugnu, "instructionStep") === 2) {
                        e.setValue(Jugnu, "instructionStep", 3);
                    }
                });
            } else {
                this.targetTableScale = 0.0;
                this.isDomainActive = false; // Exit immersive environment if table closed
            }
        }

        // Smoothly interpolate table scale (clamped to 0.01 minimum to prevent non-invertible matrices)
        if (this.isTableSpawned) {
            this.targetTableScale = this.userTableScale;
        } else {
            this.targetTableScale = 0.0;
        }

        if (this.currentTableScale !== this.targetTableScale) {
            this.currentTableScale += (this.targetTableScale - this.currentTableScale) * dt * 8.0;
            if (Math.abs(this.currentTableScale - this.targetTableScale) < 0.01) {
                this.currentTableScale = this.targetTableScale;
                if (this.currentTableScale === 0.0) {
                    this.tableGroup.visible = false;
                }
            }
            const clampedScale = Math.max(0.01, this.currentTableScale);
            this.tableGroup.scale.setScalar(clampedScale);
            
            // Safe building growth along the Y axis (clamped scale)
            this.minimapBuildings.scale.set(1.0, clampedScale, 1.0);
        }

        // Animate and interact with the circular table elements when active
        if (this.tableGroup.visible) {
            this.radarTime += dt;
            
            // 1. Fetch index finger tips (keep for pointing/hovering)
            const leftIndexPinchPos = new THREE.Vector3();
            const rightIndexPinchPos = new THREE.Vector3();
            const hasLeftIndex = this.getIndexData('left', leftIndexPinchPos);
            const hasRightIndex = this.getIndexData('right', rightIndexPinchPos);

            // 1.1. Fetch middle finger tips and pinch states for minimap interactions
            const leftMiddlePinchPos = new THREE.Vector3();
            const rightMiddlePinchPos = new THREE.Vector3();
            const isLeftMiddlePinching = this.getMiddlePinchData('left', leftMiddlePinchPos);
            const isRightMiddlePinching = this.getMiddlePinchData('right', rightMiddlePinchPos);
            const hasLeftMiddle = this.getMiddleData('left', leftMiddlePinchPos);
            const hasRightMiddle = this.getMiddleData('right', rightMiddlePinchPos);

            // 1.5. Real-Time Player Markers Update & Proximity Hand Hover Engine
            this.playerSimTime += dt;
            const triggerSimulation = this.playerSimTime > 6.0;
            if (triggerSimulation) {
                this.playerSimTime = 0.0;
            }

            const isScalingAbove2m = this.currentTableScale >= 2.0;

            let playerHeadPos = new THREE.Vector3(0, 1.6, 0);
            if (this.player && this.player.head) {
                this.player.head.getWorldPosition(playerHeadPos);
            }

            const playerWorldPos = new THREE.Vector3();

            // First pass check: determine if any player is actively hovered by the user's index finger
            let anyPlayerHovered = false;
            if (isScalingAbove2m) {
                this.players.forEach(p => {
                    p.group.getWorldPosition(playerWorldPos);
                    let distToLeft = Infinity;
                    let distToRight = Infinity;
                    if (hasLeftIndex) distToLeft = leftIndexPinchPos.distanceTo(playerWorldPos);
                    if (hasRightIndex) distToRight = rightIndexPinchPos.distanceTo(playerWorldPos);
                    if (distToLeft < 0.03 || distToRight < 0.03) {
                        anyPlayerHovered = true;
                    }
                });
            }
            
            this.players.forEach(p => {
                // Organic Movement Simulation (Field adjustments & crease strolls)
                if (triggerSimulation && !this.isSportSequenceActive) {
                    if (p.role === 'fielder') {
                        // Fielders shift organic sub-intervals (max 4mm drift from original base field position)
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * 0.004;
                        p.targetPos.set(
                            p.originalBasePos.x + Math.cos(angle) * dist,
                            p.originalBasePos.y,
                            p.originalBasePos.z + Math.sin(angle) * dist
                        );
                    } else if (p.role === 'batsman') {
                        // Batsmen stroll along the horizontal pitch axis (X direction) by max 2mm
                        const stroll = (Math.random() - 0.5) * 0.003;
                        p.targetPos.set(
                            p.originalBasePos.x + stroll,
                            p.originalBasePos.y,
                            p.originalBasePos.z
                        );
                    }
                }

                // Smooth position LERP — only update needed
                if (!this.isSportSequenceActive) {
                    p.group.position.lerp(p.targetPos, dt * 1.5);
                    p.currentPos.copy(p.group.position);
                }

                // Cyber-billboard floating tags to face player headset adaptively (Yaw-only in world space to prevent tilting!)
                const tagWorldPos = new THREE.Vector3();
                p.tag.getWorldPosition(tagWorldPos);
                const tagTarget = playerHeadPos.clone();
                tagTarget.y = tagWorldPos.y; // Level vertical height in world space
                p.tag.lookAt(tagTarget);

                const cardWorldPos = new THREE.Vector3();
                p.statsCard.getWorldPosition(cardWorldPos);
                const cardTarget = playerHeadPos.clone();
                cardTarget.y = cardWorldPos.y; // Level vertical height in world space
                p.statsCard.lookAt(cardTarget);

                // Scaling activation check: only load player tags and player markers when scaling is above 2 meters (table scale >= 2.0)
                const isScalingAbove2m = this.currentTableScale >= 2.0;
                
                // 1. Smoothly fade in/out the player group and markers
                const targetOpacityPlayer = isScalingAbove2m ? 0.95 : 0.0;
                const bodyMat = p.mesh.material as THREE.MeshBasicMaterial;
                bodyMat.opacity += (targetOpacityPlayer - bodyMat.opacity) * dt * 10.0;

                const curBodyOpacity = bodyMat.opacity;
                // Sync opacities recursively to all child meshes of the 3D player model group
                p.mesh.children.forEach((child) => {
                    if (child instanceof THREE.Mesh) {
                        const childMat = child.material as THREE.MeshBasicMaterial;
                        if (childMat) {
                            childMat.opacity = curBodyOpacity;
                        }
                    }
                });
                
                const ringMat = p.ring.material as THREE.MeshBasicMaterial;
                const targetOpacityRing = isScalingAbove2m ? 0.5 : 0.0;
                ringMat.opacity += (targetOpacityRing - ringMat.opacity) * dt * 10.0;
                
                // Scale up hovered player (skip hover interactions during active replay)
                let isHovered = false;
                if (isScalingAbove2m && !this.isSportSequenceActive) {
                    p.group.getWorldPosition(playerWorldPos);
                    
                    let distToLeft = Infinity;
                    let distToRight = Infinity;
                    
                    if (hasLeftIndex) distToLeft = leftIndexPinchPos.distanceTo(playerWorldPos);
                    if (hasRightIndex) distToRight = rightIndexPinchPos.distanceTo(playerWorldPos);
                    
                    isHovered = distToLeft < 0.03 || distToRight < 0.03;
                }
                p.isHovered = isHovered;

                const targetScale = isHovered ? 1.4 : 1.0;
                p.hoverScale += (targetScale - p.hoverScale) * dt * 8.0;

                // Smoothly scale the mesh and ring (shrink to zero when below 2m)
                const baseScaleFactor = isScalingAbove2m ? 1.0 : 0.0;
                p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.mesh.scale.x, baseScaleFactor * p.hoverScale, dt * 10.0));
                p.ring.scale.setScalar(THREE.MathUtils.lerp(p.ring.scale.x, baseScaleFactor * p.hoverScale, dt * 10.0));
                
                // 2. Smoothly fade in/out and scale the player name tag (always hide tags during replay)
                // Only batsmen get persistent name tags; other roles only show on hover
                const tagMat = p.tag.material as THREE.MeshBasicMaterial;
                let targetOpacityTag = 0.0;
                let targetTagScale = 0.0;
                
                if (isScalingAbove2m && !this.isSportSequenceActive) {
                    const isBatsman = p.role === 'batsman';
                    if (isHovered) {
                        targetOpacityTag = 1.0;
                        targetTagScale = 1.25;
                    } else if (isBatsman && !anyPlayerHovered) {
                        // Batsmen always show their tag when not overlapped by a hover
                        targetOpacityTag = 0.85;
                        targetTagScale = 0.95;
                    } else if (isBatsman && anyPlayerHovered) {
                        // Dim batsman tag slightly when another player is hovered
                        targetOpacityTag = 0.25;
                        targetTagScale = 0.75;
                    } else {
                        // Fielders, umpires: tag hidden unless they are directly hovered
                        targetOpacityTag = 0.0;
                        targetTagScale = 0.0;
                    }
                }
                
                tagMat.opacity += (targetOpacityTag - tagMat.opacity) * dt * 10.0;
                p.tag.scale.setScalar(THREE.MathUtils.lerp(p.tag.scale.x, targetTagScale, dt * 10.0));
                
                p.tag.visible = tagMat.opacity > 0.01;
                p.mesh.visible = bodyMat.opacity > 0.01;
                p.ring.visible = ringMat.opacity > 0.01;

                // Fade/Reveal stats card smoothly
                const cardMesh = p.statsCard.children[0] as THREE.Mesh;
                const cardMat = cardMesh.material as THREE.MeshBasicMaterial;

                // Lazy-load RCB card texture the first time the card becomes visible
                // (background-priority assets are not available during init)
                if (!cardMat.map && p.statsCard.userData.rcbCardKey) {
                    const tex = AssetManager.getTexture(p.statsCard.userData.rcbCardKey);
                    if (tex) {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        cardMat.map = tex;
                        cardMat.needsUpdate = true;
                    }
                }

                if (!this.isSportSequenceActive) {
                    const targetOpacity = (isHovered && isScalingAbove2m) ? 0.95 : 0.0;
                    cardMat.opacity += (targetOpacity - cardMat.opacity) * dt * 8.0;

                    const curCardOpacity = cardMat.opacity;
                    const hoverLerp = (p.hoverScale - 1.0) / 0.4;
                    const dy = hoverLerp * 0.007;
                    const dz = hoverLerp * 0.016;

                    // Sync opacities and apply 3D depth parallax shifts to all children of statsCard
                    p.statsCard.children.forEach((child) => {
                        if (child instanceof THREE.Mesh) {
                            const childMat = child.material as THREE.MeshBasicMaterial;
                            if (childMat) {
                                if (child !== cardMesh) {
                                    const baseOpacity = child.userData.baseOpacity ?? 0.85;
                                    childMat.opacity = curCardOpacity * (baseOpacity / 0.95);
                                }
                            }
                            
                            const baseY = p.statsCard.userData.baseY ?? 0.045;
                            const baseZ = child.userData.baseZ ?? 0.0;

                            // Slide factor for 3D parallax depth effect
                            let factor = 1.0;
                            if (child !== cardMesh && child.userData.baseOpacity !== 0.85) {
                                factor = 0.6; // Backing panel and border move slightly less
                            }
                            child.position.y = baseY + dy * factor;
                            child.position.z = baseZ + dz * factor;
                        }
                    });

                    p.statsCard.visible = cardMat.opacity > 0.01;
                }
            });

            // Log middle pinch status transitions
            if (isLeftMiddlePinching !== this.lastLeftPinch) {
                console.log(`[DomainExpansion] Left Middle Pinch changed: ${isLeftMiddlePinching ? "PINCHING" : "RELEASED"} at pos: (${leftMiddlePinchPos.x.toFixed(2)}, ${leftMiddlePinchPos.y.toFixed(2)}, ${leftMiddlePinchPos.z.toFixed(2)})`);
                this.lastLeftPinch = isLeftMiddlePinching;
            }
            if (isRightMiddlePinching !== this.lastRightPinch) {
                console.log(`[DomainExpansion] Right Middle Pinch changed: ${isRightMiddlePinching ? "PINCHING" : "RELEASED"} at pos: (${rightMiddlePinchPos.x.toFixed(2)}, ${rightMiddlePinchPos.y.toFixed(2)}, ${rightMiddlePinchPos.z.toFixed(2)})`);
                this.lastRightPinch = isRightMiddlePinching;
            }

            // Two-handed Pinch to Scale Gesture (No proximity bounds, works field-of-view-wide!)
            if (isLeftMiddlePinching && isRightMiddlePinching) {
                const currentHandDist = leftMiddlePinchPos.distanceTo(rightMiddlePinchPos);
                
                if (!this.isTwoHandScaling) {
                    this.isTwoHandScaling = true;
                    this.initialHandDist = currentHandDist;
                    this.initialUserScale = this.userTableScale;
                    console.log(`[DomainExpansion] Two-handed scaling ENGAGED. Hand distance: ${currentHandDist.toFixed(3)}m. Base Scale: ${this.userTableScale.toFixed(2)}`);
                } else {
                    if (this.initialHandDist > 0.01) {
                        const ratio = currentHandDist / this.initialHandDist;
                        const targetUserScale = this.initialUserScale * ratio;
                        
                        // strictly clamped from 1.0 (base 0.60m diameter) up to 3.5 (Player Immersive maximum)
                        this.userTableScale = THREE.MathUtils.clamp(targetUserScale, 1.0, 4.5);
                        
                        // Log only on significant scale changes to avoid spamming the debug board
                        if (Math.abs(this.userTableScale - this.lastLoggedScale) > 0.2) {
                            console.log(`[DomainExpansion] Scaling: current scale is ${this.userTableScale.toFixed(2)}`);
                            this.lastLoggedScale = this.userTableScale;
                        }
                    }
                }
                this.isRotatingMap = false; // Override rotation when scaling
                this.rotationHandedness = 'none';
            } else {
                if (this.isTwoHandScaling) {
                    console.log(`[DomainExpansion] Two-handed scaling COMPLETED. Final scale: ${this.userTableScale.toFixed(2)}`);
                    this.isTwoHandScaling = false;
                }

                // 2. Pinch-to-Rotate Map Turntable Interaction (Middle + Thumb pinch)
                if (!this.isRotatingMap) {
                    // Check if either hand is pinching close to the table base to start rotation (scaled by current scale!)
                    let startedRotation = false;
                    if (isRightMiddlePinching) {
                        const distToTable = rightMiddlePinchPos.distanceTo(this.tableGroup.position);
                        if (distToTable < 0.28 * this.currentTableScale) { // 28cm radius of interaction (scaled!)
                            this.isRotatingMap = true;
                            this.rotationHandedness = 'right';
                            startedRotation = true;
                        }
                    }
                    if (isLeftMiddlePinching && !startedRotation) {
                        const distToTable = leftMiddlePinchPos.distanceTo(this.tableGroup.position);
                        if (distToTable < 0.28 * this.currentTableScale) {
                            this.isRotatingMap = true;
                            this.rotationHandedness = 'left';
                            startedRotation = true;
                        }
                    }
                    
                    if (startedRotation) {
                        // Record start of the drag
                        const handPos = this.rotationHandedness === 'right' ? rightMiddlePinchPos : leftMiddlePinchPos;
                        const dx = handPos.x - this.tableGroup.position.x;
                        const dz = handPos.z - this.tableGroup.position.z;
                        this.initialHandAngle = Math.atan2(dx, dz);
                        this.initialTableRotationY = this.tableGroup.rotation.y;
                    }
                } else {
                    // We are actively rotating: check if the corresponding hand is still pinching
                    const isStillPinching = this.rotationHandedness === 'right' ? isRightMiddlePinching : isLeftMiddlePinching;
                    const handPos = this.rotationHandedness === 'right' ? rightMiddlePinchPos : leftMiddlePinchPos;
                    
                    if (isStillPinching) {
                        // Compute angle delta relative to table center and spin the table!
                        const dx = handPos.x - this.tableGroup.position.x;
                        const dz = handPos.z - this.tableGroup.position.z;
                        const currentAngle = Math.atan2(dx, dz);
                        const angleDiff = currentAngle - this.initialHandAngle;
                        
                        this.tableGroup.rotation.y = this.initialTableRotationY + angleDiff;
                    } else {
                        // Released pinch: lock rotation
                        this.isRotatingMap = false;
                        this.rotationHandedness = 'none';
                    }
                }
            }


            // 3. Selection Bubbles Hover Overlap Proximity check & Pinch-and-Hold 3-Second Charge check
            const hoverState = new Array(this.domainKeys.length).fill(false);
            const bubbleWorldPos = new THREE.Vector3();

            // Hover Proximity Check (6cm threshold)
            for (let i = 0; i < this.domainKeys.length; i++) {
                this.selectionBubbles[i].getWorldPosition(bubbleWorldPos);
                let distToLeft = Infinity;
                let distToRight = Infinity;
                if (hasLeftIndex) distToLeft = leftIndexPinchPos.distanceTo(bubbleWorldPos);
                if (hasRightIndex) distToRight = rightIndexPinchPos.distanceTo(bubbleWorldPos);
                if (distToLeft < 0.06 || distToRight < 0.06) {
                    hoverState[i] = true;
                }
            }

            // Index-finger hover activates the charge timer for selection bubbles.
            // bubblePinchEngaged is now simply an alias for hoverState — no pinch required.
            const bubblePinchEngaged = hoverState.slice();

            // Update progresses, loader rings, billboarding name tags, and trigger events
            let headPos = new THREE.Vector3(0, 1.6, 0);
            if (this.player && this.player.head) {
                this.player.head.getWorldPosition(headPos);
            }

            const showBubbles = (this.currentTableScale < 2.5);

            for (let i = 0; i < this.domainKeys.length; i++) {
                const bubble = this.selectionBubbles[i];
                const bMat = this.bubbleMats[i];
                const ring = this.anchorRings[i];
                const rMat = ring.material as THREE.MeshBasicMaterial;
                const loader = this.loaderRings[i];
                const lMat = loader.material as THREE.MeshBasicMaterial;
                const nameTag = this.nameTags[i];

                bubble.visible = showBubbles;
                if (ring) ring.visible = showBubbles;
                if (loader) loader.visible = showBubbles;
                if (nameTag) nameTag.visible = showBubbles;

                if (!showBubbles) {
                    this.pinchProgresses[i] = 0.0;
                    continue;
                }

                bubble.rotation.y += dt * 0.4;

                const isActive = this.currentDomainIndex === i;
                const isHovered = hoverState[i];

                // Billboard name tags to face player headset, and make them float exactly 4cm above the bubble
                nameTag.lookAt(headPos);
                nameTag.position.set(bubble.position.x, bubble.position.y + 0.04, bubble.position.z);

                if (bubblePinchEngaged[i]) {
                    // Accumulate progress
                    this.pinchProgresses[i] += dt;
                    if (this.pinchProgresses[i] > 3.0) {
                        this.pinchProgresses[i] = 3.0;
                    }

                    const chargeRatio = this.pinchProgresses[i] / 3.0; // 0.0 to 1.0

                    // 1. Animate Loader Ring
                    loader.scale.setScalar(THREE.MathUtils.lerp(0.01, 1.2, chargeRatio));
                    lMat.opacity = THREE.MathUtils.lerp(0.0, 1.0, chargeRatio);
                    loader.rotation.z += dt * (1.5 + chargeRatio * 15.0); // Spin faster as it charges!

                    // Dynamic visual compression: bubble shrinks and vibrates violently as charge increases
                    const baseHoverScale = isActive ? 1.25 : 1.15;
                    const scaleComp = baseHoverScale * (1.0 - chargeRatio * 0.25) + Math.sin(this.radarTime * 65.0) * 0.04 * chargeRatio;
                    bubble.scale.setScalar(scaleComp);

                    // 2. High-Frequency Visual Vibration Feedback
                    if (chargeRatio > 0.05) {
                        // Vibrate position relative to its default center
                        const angle = i * (2 * Math.PI / this.domainKeys.length);
                        const bx = Math.cos(angle) * 0.17;
                        const bz = Math.sin(angle) * 0.17;
                        const defaultHeight = isActive ? 0.135 : 0.11;
                        
                        const vibX = (Math.random() - 0.5) * 0.003 * chargeRatio;
                        const vibY = (Math.random() - 0.5) * 0.003 * chargeRatio;
                        const vibZ = (Math.random() - 0.5) * 0.003 * chargeRatio;
                        
                        bubble.position.set(bx + vibX, defaultHeight + vibY, bz + vibZ);
                    }

                    // 3. Check trigger condition
                    if (this.pinchProgresses[i] >= 3.0 && this.menuToggleCooldown <= 0.0) {
                        this.menuToggleCooldown = 0.8; // Debounce
                        
                        // Flash effect: quick scaling burst
                        bubble.scale.setScalar(1.6);
                        
                        if (this.currentDomainIndex === i) {
                            // Tapping/Holding the currently active domain toggles the dome expansion
                            this.isDomainActive = !this.isDomainActive;
                            console.log(`[DomainMenu] Toggled Immersive Dome active state to: ${this.isDomainActive}`);
                        } else {
                            // Tapping/Holding a different domain selects it and forces active!
                            this.currentDomainIndex = i;
                            this.isDomainActive = true;
                            console.log(`[DomainMenu] Charging completed: Activated Domain index ${i}`);
                        }

                        if (this.isDomainActive) {
                            this.domainMesh.visible = true;
                            this.domainMesh.position.set(0, 0, 0); // Center on tracking origin
                            
                            const currentKey = this.domainKeys[this.currentDomainIndex];
                            if (currentKey === "mivVideo") {
                                this.domainMat.map = this.mivVideoTex;
                                this.domainMat.needsUpdate = true;
                            } else {
                                const domeTex = AssetManager.getTexture(currentKey);
                                if (domeTex) {
                                    domeTex.colorSpace = THREE.SRGBColorSpace;
                                    domeTex.mapping = THREE.EquirectangularReflectionMapping;
                                    domeTex.wrapS = THREE.RepeatWrapping;
                                    domeTex.repeat.set(-1, 1);
                                    domeTex.offset.set(1, 0);
                                    this.domainMat.map = domeTex;
                                    this.domainMat.needsUpdate = true;
                                }
                            }
                        }

                        // Reset progress after success
                        this.pinchProgresses[i] = 0.0;
                    }
                } else {
                    // Drain progress back down to 0
                    if (this.pinchProgresses[i] > 0.0) {
                        this.pinchProgresses[i] = Math.max(0.0, this.pinchProgresses[i] - dt * 2.5);
                    }

                    const chargeRatio = this.pinchProgresses[i] / 3.0;

                    // Animate loader draining
                    loader.scale.setScalar(THREE.MathUtils.lerp(0.01, 1.2, chargeRatio));
                    lMat.opacity = THREE.MathUtils.lerp(0.0, 1.0, chargeRatio);
                    loader.rotation.z += dt * 1.5;

                    // Restore default floating/hover behavior
                    const angle = i * (2 * Math.PI / this.domainKeys.length);
                    const bx = Math.cos(angle) * 0.17;
                    const bz = Math.sin(angle) * 0.17;

                    if (isActive) {
                        // High-glow floating pulse for selected active bubble
                        const targetHeight = 0.135 + Math.sin(this.radarTime * 3.0) * 0.008;
                        bubble.position.x = THREE.MathUtils.lerp(bubble.position.x, bx, 10 * dt);
                        bubble.position.y = THREE.MathUtils.lerp(bubble.position.y, targetHeight, 10 * dt);
                        bubble.position.z = THREE.MathUtils.lerp(bubble.position.z, bz, 10 * dt);
                        
                        const baseScale = isHovered ? 1.25 : 1.15;
                        const scalePulse = baseScale + Math.sin(this.radarTime * 3.0) * 0.04;
                        bubble.scale.setScalar(THREE.MathUtils.lerp(bubble.scale.x, scalePulse, 10 * dt));
                        
                        bMat.opacity = THREE.MathUtils.lerp(bMat.opacity, 0.95, 10 * dt);
                        rMat.color.setHex(0x00ffff);
                        const targetRingOpacity = isHovered ? 0.95 : (0.7 + Math.sin(this.radarTime * 5.0) * 0.2);
                        rMat.opacity = THREE.MathUtils.lerp(rMat.opacity, targetRingOpacity, 10 * dt);
                    } else {
                        // Subtle passive hover for inactive bubbles
                        const hoverPhase = this.radarTime * 1.5 + i * (2 * Math.PI / this.domainKeys.length);
                        const targetHeight = 0.11 + Math.sin(hoverPhase) * 0.005;
                        bubble.position.x = THREE.MathUtils.lerp(bubble.position.x, bx, 10 * dt);
                        bubble.position.y = THREE.MathUtils.lerp(bubble.position.y, targetHeight, 10 * dt);
                        bubble.position.z = THREE.MathUtils.lerp(bubble.position.z, bz, 10 * dt);
                        
                        // Tactile hover feedback: expand slightly if index finger tip is nearby
                        if (isHovered) {
                            bubble.scale.setScalar(THREE.MathUtils.lerp(bubble.scale.x, 1.15, 10 * dt));
                            bMat.opacity = THREE.MathUtils.lerp(bMat.opacity, 0.85, 10 * dt);
                            rMat.color.setHex(0x00ffff);
                            const pulseRing = 0.7 + Math.sin(this.radarTime * 5.0) * 0.15;
                            rMat.opacity = THREE.MathUtils.lerp(rMat.opacity, pulseRing, 10 * dt);
                        } else {
                            bubble.scale.setScalar(THREE.MathUtils.lerp(bubble.scale.x, 0.85, 10 * dt));
                            bMat.opacity = THREE.MathUtils.lerp(bMat.opacity, 0.45, 10 * dt);
                            rMat.color.setHex(0x008888);
                            rMat.opacity = THREE.MathUtils.lerp(rMat.opacity, 0.18, 10 * dt);
                        }
                    }
                }
            }

            // 5. Animate pulsing radar sweep (clamped to 0.01 minimum scale)
            const radarScale = Math.max(0.01, (this.radarTime * 0.5) % 1.0);
            this.radarRing.scale.set(radarScale, radarScale, 1.0);
            if (this.radarRing.material instanceof THREE.Material) {
                this.radarRing.material.opacity = (1.0 - radarScale) * 0.25;
            }

            // 6. Pulsing location pin
            this.locationPin.position.y = 0.004 + Math.sin(this.radarTime * 3.5) * 0.003;

            // Yaw-only world-space billboarding for the location pin label
            const pinWorldPos = new THREE.Vector3();
            this.locationPin.getWorldPosition(pinWorldPos);
            const pinTarget = playerHeadPos.clone();
            pinTarget.y = pinWorldPos.y; // Level vertical height in world space
            this.locationPin.lookAt(pinTarget);

            // Scale-gated fade-out: Location Pin and AR Billboard fade away together smoothly as we scale the stadium up
            // At scale <= 1.8, fully visible. At scale >= 3.0, completely invisible. Also invisible during replays or immersive scale.
            const fadeFactor = THREE.MathUtils.clamp(
                THREE.MathUtils.mapLinear(this.currentTableScale, 1.8, 3.0, 1.0, 0.0),
                0.0,
                1.0
            );

            const targetPinOpacity = (this.isSportSequenceActive || this.currentTableScale >= 2.5) ? 0.0 : (0.9 * fadeFactor);
            this.locationPin.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshBasicMaterial;
                    if (mat && mat.transparent) {
                        mat.opacity += (targetPinOpacity - mat.opacity) * dt * 8.0;
                    }
                }
            });
            
            // Check opacity of the first mesh child to determine visibility
            if (this.locationPin.children[0] instanceof THREE.Mesh) {
                const firstMat = this.locationPin.children[0].material as THREE.MeshBasicMaterial;
                this.locationPin.visible = firstMat.opacity > 0.01;
            }

            // Scale-gated fade-out for AR TV Billboard: vanishes smoothly as we scale the stadium up, or when fireworks play, or during active replays
            if (this.arBillboard) {
                const areFireworksPlaying = this.areFireworksActive();
                this.arBillboard.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const mat = child.material as THREE.Material;
                        if (mat && mat.transparent) {
                            const defOpacity = child.userData.defaultOpacity ?? 0.8;
                            const targetOpacity = (areFireworksPlaying || this.isSportSequenceActive) ? 0.0 : (defOpacity * fadeFactor);
                            mat.opacity += (targetOpacity - mat.opacity) * dt * 8.0;
                        }
                    }
                });
                
                // Hide/show the billboard entirely based on opacity to save draw calls
                let maxOpacity = 0.0;
                this.arBillboard.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const mat = child.material as THREE.Material;
                        if (mat && mat.transparent) {
                            maxOpacity = Math.max(maxOpacity, mat.opacity);
                        }
                    }
                });
                this.arBillboard.visible = maxOpacity > 0.01;
            }

            // 7. Holographic Close "X" Button Billboard & Poke check (hide at scale >= 2.5)
            if (this.isDomainActive && this.currentTableScale < 2.5) {
                this.xButton.visible = true;
                const activeBubble = this.selectionBubbles[this.currentDomainIndex];
                
                // Float 7cm above active bubble
                this.xButton.position.set(activeBubble.position.x, 0.19, activeBubble.position.z);
                this.xButton.scale.setScalar(THREE.MathUtils.lerp(this.xButton.scale.x, 1.0, 8.0 * dt));
                
                // Fade in opacities
                this.xButtonMat.opacity = THREE.MathUtils.lerp(this.xButtonMat.opacity, 0.85, 8.0 * dt);
                this.xCrossMats.forEach(m => m.opacity = THREE.MathUtils.lerp(m.opacity, 0.95, 8.0 * dt));
                
                // Billboard to face player's head
                const headPos = new THREE.Vector3();
                this.player.head.getWorldPosition(headPos);
                this.xButton.lookAt(headPos);
                
                // Proximity Poke check (3.5cm radius)
                if (this.menuToggleCooldown <= 0.0) {
                    const xButtonWorldPos = new THREE.Vector3();
                    this.xButton.getWorldPosition(xButtonWorldPos);
                    
                    const leftTip = new THREE.Vector3();
                    const rightTip = new THREE.Vector3();
                    const hasLeft = this.getIndexData('left', leftTip);
                    const hasRight = this.getIndexData('right', rightTip);
                    
                    let xButtonPoked = false;
                    if (hasLeft && leftTip.distanceTo(xButtonWorldPos) < 0.035) xButtonPoked = true;
                    if (hasRight && rightTip.distanceTo(xButtonWorldPos) < 0.035) xButtonPoked = true;
                    
                    if (xButtonPoked) {
                        this.menuToggleCooldown = 0.8;
                        this.isDomainActive = false;
                        this.xButton.scale.setScalar(0.7); // Tap click visual feedback
                        console.log(`[DomainMenu] Floating close 'X' button tapped: deactivating domain.`);
                    }
                }
            } else {
                // Animate fade-out
                this.xButton.scale.setScalar(THREE.MathUtils.lerp(this.xButton.scale.x, 0.01, 8.0 * dt));
                this.xButtonMat.opacity = THREE.MathUtils.lerp(this.xButtonMat.opacity, 0.0, 8.0 * dt);
                this.xCrossMats.forEach(m => m.opacity = THREE.MathUtils.lerp(m.opacity, 0.0, 8.0 * dt));
                
                if (this.xButton.scale.x < 0.02) {
                    this.xButton.visible = false;
                }
            }

            // 8. Update Ball Tracking and Interactive Buttons
            this.updateBallTracking(dt);

            // Update Manual Fireworks Sequence (Staged Pyrotechnic Show)
            if (this.fireworkSeqTimer >= 0.0) {
                this.fireworkSeqTimer += dt;
                
                // Steps 0 to 9: Clockwise rim staggered climbers (0.5 second delays)
                if (this.fireworkSeqIndex < 10) {
                    if (this.fireworkSeqTimer >= this.fireworkSeqIndex * 0.5) {
                        const idx = this.fireworkSeqIndex;
                        const angle = (idx * Math.PI * 2) / 10;
                        const fx = Math.sin(angle) * this.ROOF_RADIUS;
                        const fy = this.ROOF_Y + 0.005;
                        const fz = Math.cos(angle) * this.ROOF_RADIUS;
                        
                        const colors = [0xff0055, 0x00ffff, 0xffff00, 0xff3300, 0x00ff66, 0xff00ff, 0xffaa00, 0x00aaff];
                        const col = colors[Math.floor(Math.random() * colors.length)];
                        
                        // Climbs inward towards pitch center
                        this.triggerFirework(
                            fx, fy, fz, col, 
                            0.02,                      // targetHeight
                            -Math.sin(angle) * 0.025,  // vx
                            0.085,                     // vy
                            -Math.cos(angle) * 0.025,  // vz
                            1.0                        // scale
                        );
                        this.fireworkSeqIndex++;
                    }
                } else if (this.fireworkSeqIndex === 10) {
                    // Step 10: 1.0s after staggered climbers (Time = 5.5s), launch dual cross-pitch crossing rockets!
                    if (this.fireworkSeqTimer >= 5.5) {
                        const colors = [0x00ffff, 0xffaa00]; // Cyan & Gold opposites
                        
                        // Point 0 (north) - angled South
                        const fx0 = 0.0;
                        const fz0 = this.ROOF_RADIUS;
                        this.triggerFirework(
                            fx0, this.ROOF_Y + 0.005, fz0, colors[0], 
                            0.035,  // targetHeight
                            0.0,    // vx
                            0.085,  // vy
                            -0.045, // vz (pointing south)
                            1.5     // scale
                        );
                        
                        // Point 5 (south) - angled North
                        const fx5 = 0.0;
                        const fz5 = -this.ROOF_RADIUS;
                        this.triggerFirework(
                            fx5, this.ROOF_Y + 0.005, fz5, colors[1], 
                            0.035,  // targetHeight
                            0.0,    // vx
                            0.085,  // vy
                            0.045,  // vz (pointing north)
                            1.5     // scale
                        );
                        
                        this.fireworkSeqIndex++;
                    }
                } else if (this.fireworkSeqIndex === 11) {
                    // Step 11: 1.0s later (Time = 6.5s), launch quad corner rockets (cardinals) blossoming outward!
                    if (this.fireworkSeqTimer >= 6.5) {
                        const colors = [0xff0055, 0x00ff66, 0xffaa00, 0x00aaff];
                        const cardinalAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
                        
                        cardinalAngles.forEach((angle, i) => {
                            const fx = Math.sin(angle) * this.ROOF_RADIUS;
                            const fy = this.ROOF_Y + 0.005;
                            const fz = Math.cos(angle) * this.ROOF_RADIUS;
                            
                            this.triggerFirework(
                                fx, fy, fz, colors[i], 
                                0.045,                   // targetHeight
                                Math.sin(angle) * 0.035,  // vx
                                0.08,                    // vy
                                Math.cos(angle) * 0.035,  // vz
                                1.8                      // scale
                            );
                        });
                        
                        this.fireworkSeqIndex++;
                    }
                } else if (this.fireworkSeqIndex === 12) {
                    // Step 12: Grand Finale (Time = 7.5s) - All 10 points on the rim + Colossal Center tracer!
                    if (this.fireworkSeqTimer >= 7.5) {
                        const colors = [0xff0055, 0x00ffff, 0xffff00, 0xff3300, 0x00ff66, 0xff00ff, 0xffaa00, 0x00aaff];
                        
                        // Launch all 10 rim points simultaneously, slightly outward blossoming
                        for (let i = 0; i < 10; i++) {
                            const angle = (i * Math.PI * 2) / 10;
                            const fx = Math.sin(angle) * this.ROOF_RADIUS;
                            const fy = this.ROOF_Y + 0.005;
                            const fz = Math.cos(angle) * this.ROOF_RADIUS;
                            const col = colors[Math.floor(Math.random() * colors.length)];
                            
                            this.triggerFirework(
                                fx, fy, fz, col, 
                                0.025,                   // targetHeight
                                Math.sin(angle) * 0.015,  // vx
                                0.09,                    // vy
                                Math.cos(angle) * 0.015,  // vz
                                1.3                      // scale
                            );
                        }
                        
                        // Launch Colossal center gold tracer from the pitch center, traveling up 2.5x-3x higher (17.5cm!)
                        this.triggerFirework(
                            0.0, 0.008, 0.0, 0xffd700, 
                            0.175,  // targetHeight
                            0.0,    // vx
                            0.12,   // vy (majestic climb speed)
                            0.0,    // vz
                            2.5     // scale (2.5x larger burst)
                        ); 
                        
                        // Complete sequence
                        this.fireworkSeqTimer = -1.0;
                        this.fireworkSeqIndex = 0;
                        console.log("[BallTracking] Manual fireworks Grand Finale sequence complete!");
                    }
                }
            }

            if (this.currentStadiumType === 'butterflies' || this.currentStadiumType === 'nurburgring') {
                if (this.weatherMesh) this.weatherMesh.visible = false;
                if (this.sandboxBall) this.sandboxBall.visible = false;
                if (this.activeBall) this.activeBall.visible = false;
                if (this.ballTrail) this.ballTrail.visible = false;
                if (this.sequenceBall) this.sequenceBall.visible = false;
                if (this.sequenceBallTrail) this.sequenceBallTrail.visible = false;
                if (this.tcdLauncherButton && this.tcdLauncherButton.parent) {
                    this.tcdLauncherButton.parent.visible = false;
                }
                if (this.tcdPanelGroup) this.tcdPanelGroup.visible = false;
                this.tcdVisible = false;
                this.trackingButtons.forEach(b => b.visible = false);
                this.buttonLabels.forEach(l => l.visible = false);
                this.scoreDisplayMeshes.forEach(s => s.visible = false);
                this.fireworkSeqTimer = -1.0;
                this.fireworkSeqIndex = 0;
                this.updateFireworks(dt);
            } else {
                this.updateFireworks(dt);
                this.updateWeather(dt);
                this.updateSandboxBall(dt);
                this.updateSportSequence(dt);
                this.updateNetsWiggling(dt);
                this.updateBallProjectorDisk();

                // - Small Version (Minimized): [1.0, 2.0) -> fully visible (stFadeFactor = 1.0)
                // - Medium Version: [2.0, 2.5) -> if isNavLayerActive, fade to 0.70 (30% transparency), else 0.90 (90% solid)
                // - Player Immersive View: [2.5, 4.5] -> structural meshes smoothly fade to 0.0 from their starting opacity
                let stFadeFactor = 1.0;
                if (this.currentTableScale >= 2.5) {
                    const startVal = this.isNavLayerActive ? 0.70 : 0.90;
                    stFadeFactor = THREE.MathUtils.clamp(
                        THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 4.5, startVal, 0.0),
                        0.0,
                        startVal
                    );
                } else if (this.currentTableScale >= 2.0) {
                    stFadeFactor = this.isNavLayerActive ? 0.70 : 0.90;
                } else {
                    stFadeFactor = 1.0;
                }

                const activeStMesh = this.currentStadiumType === 'default' ? this.stadiumMesh
                                   : this.currentStadiumType === 'berlin'  ? this.berlinMesh
                                   : this.currentStadiumType === 'inuit'   ? this.inuitMesh
                                   : null;

                if (activeStMesh) {
                    activeStMesh.traverse((child: any) => {
                        if (child instanceof THREE.Mesh) {
                            const name = child.name.toLowerCase();
                            const parentName = child.parent ? child.parent.name.toLowerCase() : "";
                            const matches = (str: string) => name.includes(str) || parentName.includes(str);
                            
                            // Gameplay Asset Retention Override
                            const isGameplay = (
                                matches('pitch') || matches('crease') || matches('wicket') || matches('stump') || matches('bat') || matches('boundary') || matches('rope') ||
                                matches('field') || matches('grass') || matches('goal') || matches('net') ||
                                matches('court') || matches('hardwood') || matches('floor') || matches('paint') || matches('key') || matches('restrict') || matches('hoop') || matches('backboard')
                            );

                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            let hasVisibleMat = false;
                            mats.forEach((mat: any) => {
                                if (mat) {
                                    // Store original material opacity and transparency in userData so we can scale relative to it!
                                    if (mat.userData.baseOpacity === undefined) {
                                        mat.userData.baseOpacity = mat.opacity ?? 1.0;
                                        mat.userData.originallyTransparent = mat.transparent ?? false;
                                    }
                                    
                                    const factor = isGameplay ? 1.0 : stFadeFactor;
                                    const targetOp = mat.userData.baseOpacity * factor;
                                    // Smoothly interpolate opacity to prevent jarring flashes
                                    mat.opacity += (targetOp - mat.opacity) * dt * 10.0;

                                    // Dynamic transparency to avoid sorting bugs when fully opaque
                                    mat.transparent = mat.userData.originallyTransparent || (mat.opacity < 0.99);

                                    if (mat.opacity > 0.005) {
                                        hasVisibleMat = true;
                                    }
                                }
                            });
                            child.visible = hasVisibleMat;
                        }
                    });
                }

                const showTCD = (this.currentTableScale < 2.5);
                if (this.tcdLauncherButton && this.tcdLauncherButton.parent) {
                    this.tcdLauncherButton.parent.visible = showTCD;
                }
                if (this.tcdPanelGroup) {
                    this.tcdPanelGroup.visible = showTCD && this.tcdVisible;
                }
                this.updateTrackingButtons(
                    leftIndexPinchPos,
                    rightIndexPinchPos,
                    hasLeftIndex,
                    hasRightIndex,
                    dt
                );
            }

            // --- Holographic Containment Cylinder Update ---
            if (this.currentTableScale >= 2.5 && this.currentStadiumType !== 'butterflies') {
                this.holoCylinder.visible = true;
                this.holoCylinderWire.visible = true;
                
                const cylinderAlpha = THREE.MathUtils.clamp(
                    THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 4.5, 0.0, 0.15),
                    0.0,
                    0.15
                );
                const wireframeAlpha = THREE.MathUtils.clamp(
                    THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 4.5, 0.0, 0.5),
                    0.0,
                    0.5
                );
                
                (this.holoCylinder.material as THREE.MeshPhongMaterial).opacity = cylinderAlpha;
                (this.holoCylinderWire.material as THREE.LineBasicMaterial).opacity = wireframeAlpha;
            } else {
                this.holoCylinder.visible = false;
                this.holoCylinderWire.visible = false;
            }

            // --- Venue Navigation Layer Placeholder Updates (Zero-GC) ---
            const showNav = this.isNavLayerActive && (this.currentTableScale >= 2.0);
            if (this.navPlaceholdersGroup) {
                this.navPlaceholdersGroup.visible = showNav;
                if (showNav) {
                    this.player.head.getWorldPosition(this.scratchVector1); // headPos
                    
                    this.navPlaceholdersGroup.children.forEach((placeholder: any) => {
                        const label = placeholder.getObjectByName("label");
                        if (label) {
                            label.getWorldPosition(this.scratchVector2); // labelWorldPos
                            this.scratchVector3.set(this.scratchVector1.x, this.scratchVector2.y, this.scratchVector1.z); // targetWorldPos (yaw-only height matched)
                            label.lookAt(this.scratchVector3);
                        }
                    });
                }
            }
        } else {
            // Table is closed: hide close button instantly
            this.xButton.visible = false;
            this.xButton.scale.setScalar(0.01);
            this.isSportSequenceActive = false;
            if (this.sportCelebrationCard) this.sportCelebrationCard.visible = false;
            if (this.sequenceBall) this.sequenceBall.visible = false;
            if (this.sequenceBallTrail) this.sequenceBallTrail.visible = false;
            if (this.arBillboard) this.arBillboard.visible = true; // Restore scoreboard
            this.fireworkSeqTimer = -1.0; // Reset active sequence
            this.fireworkSeqIndex = 0;
            if (this.fireworkActive) {
                for (let i = 0; i < this.MAX_FIREWORKS; i++) {
                    this.fireworkActive[i] = 0;
                }
            }
            this.weatherMode = 'off';
            if (this.weatherMesh) this.weatherMesh.visible = false;
            this.isSandboxBallActive = false;
            if (this.sandboxBall) this.sandboxBall.visible = false;
            this.tcdVisible = false;
            if (this.tcdPanelGroup) this.tcdPanelGroup.visible = false;
            
            // Reset Navigation and Cylinder Layer states
            this.isNavLayerActive = false;
            if (this.navPlaceholdersGroup) this.navPlaceholdersGroup.visible = false;
            if (this.holoCylinder) this.holoCylinder.visible = false;
            if (this.holoCylinderWire) this.holoCylinderWire.visible = false;
        }

        // --- Immersive 360° Dome expansion cinematic transitions ---
        if (this.isDomainActive) {
            if (this.lastActiveDomainIndex !== this.currentDomainIndex) {
                this.lastActiveDomainIndex = this.currentDomainIndex;
                this.domainMesh.visible = true;
                
                // Shockwave spawn point: copy active bubble's world coordinates
                const bubbleWorldPos = new THREE.Vector3();
                this.selectionBubbles[this.currentDomainIndex].getWorldPosition(bubbleWorldPos);
                this.domainMesh.position.copy(bubbleWorldPos);
                this.domainMesh.scale.setScalar(0.001);
                this.domainMat.opacity = 0.0;

                // Update texture mapping for transitioning
                const currentKey = this.domainKeys[this.currentDomainIndex];
                if (currentKey === "mivVideo") {
                    this.domainMat.map = this.mivVideoTex;
                    this.domainMat.needsUpdate = true;
                } else {
                    const domeTex = AssetManager.getTexture(currentKey);
                    if (domeTex) {
                        domeTex.colorSpace = THREE.SRGBColorSpace;
                        domeTex.mapping = THREE.EquirectangularReflectionMapping;
                        domeTex.wrapS = THREE.RepeatWrapping;
                        domeTex.repeat.set(-1, 1);
                        domeTex.offset.set(1, 0);
                        this.domainMat.map = domeTex;
                        this.domainMat.needsUpdate = true;
                    }
                }
            }

            // Expand and center dome sphere at tracking origin (0, 0, 0)
            this.domainMesh.scale.setScalar(THREE.MathUtils.lerp(this.domainMesh.scale.x, 1.0, 3.0 * dt));
            this.domainMesh.position.lerp(new THREE.Vector3(0, 0, 0), 3.0 * dt);
            this.domainMat.opacity = THREE.MathUtils.lerp(this.domainMat.opacity, 0.95, 3.0 * dt);
        } else {
            this.lastActiveDomainIndex = -1;
            
            if (this.domainMesh.visible) {
                // Query current active bubble's world position to contract back to
                const bubbleWorldPos = new THREE.Vector3();
                this.selectionBubbles[this.currentDomainIndex].getWorldPosition(bubbleWorldPos);
                
                // Shrink and contract back to the bubble position
                this.domainMesh.scale.setScalar(THREE.MathUtils.lerp(this.domainMesh.scale.x, 0.001, 3.5 * dt));
                this.domainMesh.position.lerp(bubbleWorldPos, 3.5 * dt);
                this.domainMat.opacity = THREE.MathUtils.lerp(this.domainMat.opacity, 0.0, 3.5 * dt);
                
                if (this.domainMesh.scale.x < 0.005 || this.domainMat.opacity < 0.01) {
                    this.domainMesh.visible = false;
                }
            }
        }

        // Play/pause MIV video based on active domain
        if (this.mivVideo) {
            const currentKey = this.domainKeys[this.currentDomainIndex];
            if (this.isDomainActive && currentKey === "mivVideo") {
                if (this.mivVideo.paused) {
                    this.mivVideo.play().catch(() => {});
                }
            } else {
                if (!this.mivVideo.paused) {
                    this.mivVideo.pause();
                }
            }
        }
    }

    private createRealWorldBubbleTexture(name: string, lat: number, lng: number): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#020d1e');
        grad.addColorStop(1, '#051b36');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);
        
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 512; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
            ctx.stroke();
        }
        for (let y = 0; y < 256; y += 32) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(512, y);
            ctx.stroke();
        }
        
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(256, 128, 60, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(256, 128, 40, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(256, 128, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 256, 70);
        
        ctx.fillStyle = 'rgba(0, 255, 255, 0.85)';
        ctx.font = '20px monospace';
        ctx.fillText(`GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 256, 180);
        ctx.fillText("SAT-LINK SECURED", 256, 210);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    }

    private createNameTagTexture(name: string): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        
        ctx.clearRect(0, 0, 256, 64);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(5, 27, 54, 0.8)';
        
        const r = 10;
        ctx.beginPath();
        ctx.roundRect(4, 4, 248, 56, r);
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    }

    private loadStreetView(lat: number, lng: number) {
        // Identify city for fallback & HUD label
        let cityKey = "TOKYO";
        if (Math.abs(lat - 40.7580) < 0.001) cityKey = "NEW_YORK";
        else if (Math.abs(lat - 48.8584) < 0.001) cityKey = "PARIS";
        else if (Math.abs(lat - 41.8902) < 0.001) cityKey = "ROME";

        // Show loading state immediately (synchronous)
        this._applyLoadingScreen(cityKey, lat, lng);

        // Kick off real fetch pipeline asynchronously
        this._fetchRealPanorama(lat, lng, cityKey).catch(err => {
            console.error(`[StreetView] Pipeline failed, falling back to procedural:`, err);
            this._applyFallbackPanorama(cityKey, lat, lng);
        });
    }

    private _applyLoadingScreen(cityKey: string, lat: number, lng: number) {
        const W = 2048, H = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;

        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#020812'); bg.addColorStop(1, '#010408');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W, 0); ctx.scale(-1, 1);

        ctx.strokeStyle = 'rgba(0,255,255,0.06)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 6;
        ctx.strokeRect(16, 16, W - 32, H - 32);

        ctx.strokeStyle = 'rgba(0,255,255,0.4)'; ctx.lineWidth = 3;
        [80, 150, 240].forEach(r => { ctx.beginPath(); ctx.arc(W/2, H/2, r, 0, Math.PI*2); ctx.stroke(); });

        ctx.strokeStyle = 'rgba(0,255,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W/2 - 300, H/2); ctx.lineTo(W/2 - 20, H/2);
        ctx.moveTo(W/2 + 20, H/2); ctx.lineTo(W/2 + 300, H/2);
        ctx.moveTo(W/2, H/2 - 300); ctx.lineTo(W/2, H/2 - 20);
        ctx.moveTo(W/2, H/2 + 20); ctx.lineTo(W/2, H/2 + 300);
        ctx.stroke();

        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 16;
        ctx.fillStyle = '#00ffff'; ctx.textAlign = 'center';
        const cityLabels: Record<string, string> = {
            TOKYO: 'SHIBUYA CROSSING \u2022 TOKYO',
            NEW_YORK: 'TIMES SQUARE \u2022 NEW YORK',
            PARIS: 'CHAMP DE MARS \u2022 PARIS',
            ROME: 'COLOSSEO \u2022 ROMA'
        };
        ctx.font = 'bold 52px monospace';
        ctx.fillText(cityLabels[cityKey] || cityKey, W/2, 90);
        ctx.font = '34px monospace'; ctx.fillStyle = 'rgba(0,255,255,0.85)';
        ctx.fillText(`LAT ${lat.toFixed(4)}\u00b0   LNG ${lng.toFixed(4)}\u00b0`, W/2, 148);
        ctx.font = 'bold 42px monospace'; ctx.fillStyle = '#00ffff';
        ctx.fillText('ACQUIRING SATELLITE LINK...', W/2, H/2 - 30);
        ctx.font = '30px monospace'; ctx.fillStyle = 'rgba(0,255,255,0.7)';
        ctx.fillText('FETCHING STREET VIEW PANORAMA TILES', W/2, H/2 + 20);
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.domainMat.map = tex;
        this.domainMat.needsUpdate = true;
    }

    private async _fetchRealPanorama(lat: number, lng: number, cityKey: string) {
        console.log(`[StreetView] Starting pipeline for ${cityKey} (${lat}, ${lng})`);

        // Step 1: Get panoId from server-side proxy
        const panoRes = await fetch('/api/sv/panoid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng })
        });
        if (!panoRes.ok) {
            const err = await panoRes.json().catch(() => ({ error: panoRes.statusText })) as { error: string };
            throw new Error(`PanoId lookup failed: ${err.error}`);
        }
        const { panoId } = await panoRes.json() as { panoId: string };
        console.log(`[StreetView] Got panoId: ${panoId}`);

        // Step 2: Fetch 8 tiles in parallel (zoom=2 -> 4 cols x 2 rows, 512x512 each)
        const ZOOM = 2, COLS = 4, ROWS = 2, tileSize = 512;
        const tilePromises: Promise<{ x: number; y: number; img: HTMLImageElement }>[] = [];
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                tilePromises.push(new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve({ x, y, img });
                    img.onerror = () => reject(new Error(`Tile ${x},${y} failed to load`));
                    img.src = `/api/sv/tile/${ZOOM}/${x}/${y}?panoId=${encodeURIComponent(panoId)}`;
                }));
            }
        }
        const tiles = await Promise.all(tilePromises);
        console.log(`[StreetView] All ${tiles.length} tiles loaded successfully.`);

        // Step 3: Stitch into 2048x1024 canvas
        const W = COLS * tileSize;
        const H = ROWS * tileSize;
        const stitchCanvas = document.createElement('canvas');
        stitchCanvas.width = W; stitchCanvas.height = H;
        const sCtx = stitchCanvas.getContext('2d')!;
        tiles.forEach(({ x, y, img }) => {
            sCtx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
        });

        // Step 4: Horizontal mirror (for interior sphere reading)
        const imageData = sCtx.getImageData(0, 0, W, H);
        const flipped = sCtx.createImageData(W, H);
        for (let row = 0; row < H; row++) {
            for (let col = 0; col < W; col++) {
                const src = (row * W + col) * 4;
                const dst = (row * W + (W - 1 - col)) * 4;
                flipped.data[dst]     = imageData.data[src];
                flipped.data[dst + 1] = imageData.data[src + 1];
                flipped.data[dst + 2] = imageData.data[src + 2];
                flipped.data[dst + 3] = imageData.data[src + 3];
            }
        }
        sCtx.putImageData(flipped, 0, 0);

        // Subtle scanline overlay
        sCtx.fillStyle = 'rgba(0,0,0,0.07)';
        for (let scanY = 0; scanY < H; scanY += 4) { sCtx.fillRect(0, scanY, W, 1); }

        // Minimal HUD frame
        sCtx.strokeStyle = 'rgba(0,255,255,0.65)'; sCtx.lineWidth = 4;
        sCtx.strokeRect(8, 8, W - 16, H - 16);
        const cl = 44;
        [[8,8],[W-8,8],[8,H-8],[W-8,H-8]].forEach(([cx, cy], i) => {
            const sx = i % 2 === 0 ? 1 : -1;
            const sy = i < 2 ? 1 : -1;
            sCtx.beginPath();
            sCtx.moveTo(cx + sx * cl, cy); sCtx.lineTo(cx, cy); sCtx.lineTo(cx, cy + sy * cl);
            sCtx.stroke();
        });

        // Small info text
        sCtx.shadowColor = '#00ffff'; sCtx.shadowBlur = 8;
        const cityLabels2: Record<string, string> = {
            TOKYO: 'SHIBUYA CROSSING \u2022 TOKYO, JAPAN',
            NEW_YORK: 'TIMES SQUARE \u2022 NEW YORK CITY, USA',
            PARIS: 'CHAMP DE MARS \u2022 PARIS, FRANCE',
            ROME: 'COLOSSEO \u2022 ROMA, ITALIA'
        };
        sCtx.fillStyle = 'rgba(0,255,255,0.9)'; sCtx.textAlign = 'left';
        sCtx.font = 'bold 20px monospace';
        sCtx.fillText(cityLabels2[cityKey] || cityKey, 28, 44);
        sCtx.font = '14px monospace'; sCtx.fillStyle = 'rgba(0,255,255,0.65)';
        sCtx.fillText(`${lat.toFixed(4)}\u00b0  ${lng.toFixed(4)}\u00b0  |  PANO ${panoId.substring(0,10)}...`, 28, 66);
        sCtx.textAlign = 'right'; sCtx.font = 'bold 20px monospace';
        sCtx.fillStyle = 'rgba(0,255,255,0.9)';
        sCtx.fillText('GOOGLE STREET VIEW', W - 28, 44);
        sCtx.textAlign = 'center'; sCtx.font = 'bold 16px monospace';
        sCtx.fillStyle = 'rgba(0,255,255,0.75)';
        sCtx.fillText("PINCH 'X' TO EXIT DOMAIN", W/2, H - 18);

        // Step 5: Apply to dome
        const texture = new THREE.CanvasTexture(stitchCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.set(-1, 1);
        texture.offset.set(1, 0);
        this.domainMat.map = texture;
        this.domainMat.needsUpdate = true;
        console.log(`[StreetView] Real photorealistic panorama applied for ${cityKey}!`);
    }

    private _applyFallbackPanorama(cityKey: string, lat: number, lng: number) {
        console.log(`[StreetView] Applying procedural fallback for ${cityKey}`);
        const W = 4096, H = 2048;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        this._drawCityPanorama(ctx, W, H, cityKey, lat, lng);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.set(-1, 1);
        texture.offset.set(1, 0);
        this.domainMat.map = texture;
        this.domainMat.needsUpdate = true;
    }

    private _drawCityPanorama(ctx: CanvasRenderingContext2D, W: number, H: number, city: string, lat: number, lng: number) {
        const horizon = H * 0.52; // horizon line (slightly below center)

        // ── SKY ─────────────────────────────────────────────────────────────────
        if (city === "TOKYO") {
            // Deep indigo night sky → orange-purple neon horizon
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, '#06001a');
            skyGrad.addColorStop(0.4, '#0d0530');
            skyGrad.addColorStop(0.75, '#1a0538');
            skyGrad.addColorStop(1, '#4a1060');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, horizon);

            // Stars
            ctx.save();
            for (let s = 0; s < 800; s++) {
                const sx = Math.random() * W;
                const sy = Math.random() * horizon * 0.8;
                const sr = Math.random() * 1.4;
                const alpha = 0.3 + Math.random() * 0.7;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,220,255,${alpha})`;
                ctx.fill();
            }
            ctx.restore();

            // Moon
            ctx.save();
            ctx.beginPath();
            ctx.arc(W * 0.15, H * 0.08, 44, 0, Math.PI * 2);
            ctx.fillStyle = '#fff5e0';
            ctx.shadowColor = '#ffffa0';
            ctx.shadowBlur = 30;
            ctx.fill();
            ctx.restore();

            // Neon glow at horizon
            const glowGrad = ctx.createLinearGradient(0, horizon - 120, 0, horizon);
            glowGrad.addColorStop(0, 'rgba(255,60,180,0)');
            glowGrad.addColorStop(1, 'rgba(255,40,120,0.55)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(0, horizon - 120, W, 120);

        } else if (city === "NEW_YORK") {
            // NYC: cool twilight blue-grey sky
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, '#030814');
            skyGrad.addColorStop(0.45, '#0a1628');
            skyGrad.addColorStop(0.8, '#1a2a4a');
            skyGrad.addColorStop(1, '#2a3a5a');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, horizon);

            // Stars
            ctx.save();
            for (let s = 0; s < 500; s++) {
                const sx = Math.random() * W;
                const sy = Math.random() * horizon * 0.6;
                ctx.beginPath();
                ctx.arc(sx, sy, Math.random() * 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,220,255,${0.4 + Math.random() * 0.5})`;
                ctx.fill();
            }
            ctx.restore();

            // Warm amber horizon glow (city light pollution)
            const glowGrad = ctx.createLinearGradient(0, horizon - 180, 0, horizon);
            glowGrad.addColorStop(0, 'rgba(255,150,50,0)');
            glowGrad.addColorStop(1, 'rgba(255,120,20,0.4)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(0, horizon - 180, W, 180);

        } else if (city === "PARIS") {
            // Paris: warm golden-blue dusk
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, '#050218');
            skyGrad.addColorStop(0.35, '#0a0830');
            skyGrad.addColorStop(0.65, '#251040');
            skyGrad.addColorStop(0.85, '#4a1a30');
            skyGrad.addColorStop(1, '#7a3020');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, horizon);

            // Stars
            ctx.save();
            for (let s = 0; s < 600; s++) {
                const sx = Math.random() * W;
                const sy = Math.random() * horizon * 0.7;
                ctx.beginPath();
                ctx.arc(sx, sy, Math.random() * 1.3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,240,200,${0.3 + Math.random() * 0.6})`;
                ctx.fill();
            }
            ctx.restore();

            // Golden sunset glow
            const glowGrad = ctx.createLinearGradient(0, horizon - 200, 0, horizon);
            glowGrad.addColorStop(0, 'rgba(255,150,50,0)');
            glowGrad.addColorStop(0.5, 'rgba(255,130,30,0.2)');
            glowGrad.addColorStop(1, 'rgba(255,180,60,0.5)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(0, horizon - 200, W, 200);

        } else { // ROME
            // Rome: warm terracotta dusk / late afternoon
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, '#080318');
            skyGrad.addColorStop(0.4, '#1a0a28');
            skyGrad.addColorStop(0.7, '#3a1020');
            skyGrad.addColorStop(1, '#7a2808');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, horizon);

            // Stars
            ctx.save();
            for (let s = 0; s < 500; s++) {
                const sx = Math.random() * W;
                const sy = Math.random() * horizon * 0.65;
                ctx.beginPath();
                ctx.arc(sx, sy, Math.random() * 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,235,210,${0.3 + Math.random() * 0.6})`;
                ctx.fill();
            }
            ctx.restore();

            // Terracotta sunset glow
            const glowGrad = ctx.createLinearGradient(0, horizon - 220, 0, horizon);
            glowGrad.addColorStop(0, 'rgba(255,80,20,0)');
            glowGrad.addColorStop(0.6, 'rgba(255,100,30,0.25)');
            glowGrad.addColorStop(1, 'rgba(255,140,50,0.55)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(0, horizon - 220, W, 220);
        }

        // ── GROUND ───────────────────────────────────────────────────────────────
        if (city === "TOKYO") {
            const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
            groundGrad.addColorStop(0, '#0a0012');
            groundGrad.addColorStop(0.3, '#080010');
            groundGrad.addColorStop(1, '#030008');
            ctx.fillStyle = groundGrad;
            ctx.fillRect(0, horizon, W, H - horizon);

            // Wet road reflections
            this._drawRoadReflections(ctx, W, H, horizon, '#ff40c0', '#00aaff', '#ff8800');

        } else if (city === "NEW_YORK") {
            const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
            groundGrad.addColorStop(0, '#080810');
            groundGrad.addColorStop(0.4, '#050508');
            groundGrad.addColorStop(1, '#020204');
            ctx.fillStyle = groundGrad;
            ctx.fillRect(0, horizon, W, H - horizon);

            this._drawRoadReflections(ctx, W, H, horizon, '#ffaa00', '#ff4400', '#4488ff');

        } else if (city === "PARIS") {
            const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
            groundGrad.addColorStop(0, '#100808');
            groundGrad.addColorStop(0.4, '#080404');
            groundGrad.addColorStop(1, '#040202');
            ctx.fillStyle = groundGrad;
            ctx.fillRect(0, horizon, W, H - horizon);

            this._drawRoadReflections(ctx, W, H, horizon, '#ffcc44', '#ff6644', '#aa88ff');

        } else { // ROME
            const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
            groundGrad.addColorStop(0, '#0e0604');
            groundGrad.addColorStop(0.4, '#090402');
            groundGrad.addColorStop(1, '#050202');
            ctx.fillStyle = groundGrad;
            ctx.fillRect(0, horizon, W, H - horizon);

            this._drawRoadReflections(ctx, W, H, horizon, '#ffaa44', '#ff6622', '#cc9944');
        }

        // ── SKYLINE / LANDMARKS ──────────────────────────────────────────────────
        if (city === "TOKYO") {
            this._drawTokyoSkyline(ctx, W, H, horizon);
        } else if (city === "NEW_YORK") {
            this._drawNYCSkyline(ctx, W, H, horizon);
        } else if (city === "PARIS") {
            this._drawParisSkyline(ctx, W, H, horizon);
        } else {
            this._drawRomeSkyline(ctx, W, H, horizon);
        }

        // ── SCANLINE OVERLAY ────────────────────────────────────────────────────
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        for (let y = 0; y < H; y += 4) {
            ctx.fillRect(0, y, W, 2);
        }
        ctx.restore();

        // ── HUD OVERLAY ─────────────────────────────────────────────────────────
        ctx.save();
        // Mirror for interior sphere reading
        ctx.translate(W, 0);
        ctx.scale(-1, 1);

        // Cyan frame
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 10;
        ctx.strokeRect(24, 24, W - 48, H - 48);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,255,255,0.35)';
        ctx.strokeRect(36, 36, W - 72, H - 72);

        // Corner accents
        const cornerLen = 80;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 6;
        [
            [24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]
        ].forEach(([cx, cy], idx) => {
            ctx.beginPath();
            const sx = idx % 2 === 0 ? 1 : -1;
            const sy = idx < 2 ? 1 : -1;
            ctx.moveTo(cx + sx * cornerLen, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + sy * cornerLen);
            ctx.stroke();
        });

        // Central crosshair
        ctx.strokeStyle = 'rgba(0,255,255,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W / 2 - 200, H / 2); ctx.lineTo(W / 2 - 20, H / 2);
        ctx.moveTo(W / 2 + 20, H / 2);  ctx.lineTo(W / 2 + 200, H / 2);
        ctx.moveTo(W / 2, H / 2 - 200); ctx.lineTo(W / 2, H / 2 - 20);
        ctx.moveTo(W / 2, H / 2 + 20);  ctx.lineTo(W / 2, H / 2 + 200);
        ctx.stroke();

        // HUD text
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('COORDINATES LOCKED', 80, 110);
        ctx.font = '36px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.9)';
        ctx.fillText(`LAT : ${lat.toFixed(4)}°`, 80, 168);
        ctx.fillText(`LNG : ${lng.toFixed(4)}°`, 80, 218);

        const cityLabels: Record<string,string> = {
            "TOKYO": "SHIBUYA CROSSING • TOKYO, JAPAN",
            "NEW_YORK": "TIMES SQUARE • NEW YORK CITY, USA",
            "PARIS": "CHAMP DE MARS • PARIS, FRANCE",
            "ROME": "COLOSSEO • ROMA, ITALIA"
        };
        ctx.font = 'bold 52px monospace';
        ctx.fillStyle = '#00ffff';
        ctx.textAlign = 'center';
        ctx.fillText(cityLabels[city] || city, W / 2, 110);

        ctx.textAlign = 'right';
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText('SAT-LINK ONLINE', W - 80, 110);
        ctx.font = '36px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.9)';
        ctx.fillText('FEED: SYNTHETIC-RT', W - 80, 168);
        ctx.fillText('STATUS: IMMERSIVE', W - 80, 218);

        ctx.textAlign = 'center';
        ctx.font = 'bold 38px monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText("<<< PINCH 'X' TO EXIT DOMAIN >>>", W / 2, H - 52);

        ctx.restore();
    }

    private _drawRoadReflections(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number, c1: string, c2: string, c3: string) {
        // Perspective road lines
        const vp = W / 2;
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (let i = -6; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(vp + i * 60, horizon + 2);
            ctx.lineTo(vp + i * 800, H);
            ctx.stroke();
        }
        ctx.restore();

        // Coloured puddle reflections
        const colours = [c1, c2, c3];
        for (let r = 0; r < 30; r++) {
            const rx = Math.random() * W;
            const ry = horizon + Math.random() * (H - horizon) * 0.9 + 10;
            const rw = 30 + Math.random() * 120;
            const rh = 4 + Math.random() * 12;
            ctx.save();
            ctx.globalAlpha = 0.08 + Math.random() * 0.12;
            const col = colours[Math.floor(Math.random() * colours.length)];
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    private _drawBuilding(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, winCols: number, winRows: number, bodyCol: string, litColour: string) {
        ctx.fillStyle = bodyCol;
        ctx.fillRect(x, top, w, h);

        // Windows
        const margin = w * 0.08;
        const availW = w - margin * 2;
        const availH = h - margin * 2;
        const cellW = availW / winCols;
        const cellH = availH / winRows;
        for (let wi = 0; wi < winCols; wi++) {
            for (let hi = 0; hi < winRows; hi++) {
                const lit = Math.random() > 0.35;
                if (!lit) continue;
                ctx.fillStyle = lit ? litColour : 'rgba(0,0,0,0)';
                ctx.globalAlpha = 0.3 + Math.random() * 0.7;
                ctx.fillRect(
                    x + margin + wi * cellW + cellW * 0.12,
                    top + margin + hi * cellH + cellH * 0.12,
                    cellW * 0.76,
                    cellH * 0.76
                );
                ctx.globalAlpha = 1.0;
            }
        }
    }

    private _drawTokyoSkyline(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number) {
        // Tiled across the full 360° width
        const tileCount = 3;
        for (let t = 0; t < tileCount; t++) {
            const ox = t * (W / tileCount);
            const tw = W / tileCount;

            // Background mega-structures
            const bgBuildings = [
                { rx: 0.02, w: 0.08, h: 0.55 }, { rx: 0.10, w: 0.06, h: 0.65 },
                { rx: 0.17, w: 0.05, h: 0.48 }, { rx: 0.22, w: 0.09, h: 0.70 },
                { rx: 0.31, w: 0.07, h: 0.58 }, { rx: 0.38, w: 0.06, h: 0.42 },
                { rx: 0.44, w: 0.10, h: 0.62 }, { rx: 0.54, w: 0.08, h: 0.50 },
                { rx: 0.62, w: 0.07, h: 0.68 }, { rx: 0.69, w: 0.05, h: 0.44 },
                { rx: 0.74, w: 0.09, h: 0.72 }, { rx: 0.84, w: 0.07, h: 0.55 },
                { rx: 0.91, w: 0.06, h: 0.48 },
            ];
            bgBuildings.forEach(b => {
                const bx = ox + b.rx * tw;
                const bw = b.w * tw;
                const bh = b.h * (H - horizon) * 0.9;
                this._drawBuilding(ctx, bx, horizon - bh, bw, bh, 5, Math.floor(bh / 30), '#0a0018', '#ff50d0');
            });

            // Tokyo Tower (iconic red & white)
            const ttX = ox + tw * 0.48;
            const ttBase = horizon;
            const ttH = (H - horizon) * 0.75;

            ctx.save();
            ctx.fillStyle = '#cc2200';
            // Main tower body (tapered triangle)
            ctx.beginPath();
            ctx.moveTo(ttX - 6, ttBase);
            ctx.lineTo(ttX, ttBase - ttH);
            ctx.lineTo(ttX + 6, ttBase);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ff4400';
            ctx.beginPath();
            ctx.moveTo(ttX - 18, ttBase);
            ctx.lineTo(ttX - 4, ttBase - ttH * 0.65);
            ctx.lineTo(ttX + 4, ttBase - ttH * 0.65);
            ctx.lineTo(ttX + 18, ttBase);
            ctx.closePath();
            ctx.fill();
            // Observation deck
            ctx.fillStyle = '#ff6600';
            ctx.fillRect(ttX - 20, ttBase - ttH * 0.68, 40, 22);
            // Beacon glow
            ctx.beginPath();
            ctx.arc(ttX, ttBase - ttH, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#ff0000';
            ctx.shadowColor = '#ff2200';
            ctx.shadowBlur = 30;
            ctx.fill();
            ctx.restore();

            // Neon signs (rectangles with coloured glow)
            const neonSigns = [
                { rx: 0.12, ry: 0.6, w: 0.06, h: 0.06, col: '#ff00cc' },
                { rx: 0.28, ry: 0.65, w: 0.05, h: 0.05, col: '#00ccff' },
                { rx: 0.56, ry: 0.58, w: 0.07, h: 0.04, col: '#ffcc00' },
                { rx: 0.72, ry: 0.62, w: 0.05, h: 0.055, col: '#ff3399' },
                { rx: 0.85, ry: 0.67, w: 0.06, h: 0.04, col: '#00ff88' },
            ];
            neonSigns.forEach(ns => {
                const nx = ox + ns.rx * tw;
                const buildH = (H - horizon) * 0.5;
                const ny = horizon - buildH * ns.ry;
                const nw = ns.w * tw;
                const nh = ns.h * (H - horizon);
                ctx.save();
                ctx.shadowColor = ns.col;
                ctx.shadowBlur = 24;
                ctx.fillStyle = ns.col;
                ctx.globalAlpha = 0.85;
                ctx.fillRect(nx, ny, nw, nh);
                ctx.restore();
            });
        }
    }

    private _drawNYCSkyline(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number) {
        const tileCount = 3;
        for (let t = 0; t < tileCount; t++) {
            const ox = t * (W / tileCount);
            const tw = W / tileCount;

            // Dense NYC towers
            const buildings = [
                { rx: 0.00, w: 0.07, h: 0.60 }, { rx: 0.07, w: 0.05, h: 0.75 },
                { rx: 0.12, w: 0.06, h: 0.55 }, { rx: 0.18, w: 0.08, h: 0.80 },
                { rx: 0.26, w: 0.05, h: 0.65 }, { rx: 0.31, w: 0.09, h: 0.90 },
                { rx: 0.40, w: 0.06, h: 0.70 }, { rx: 0.46, w: 0.07, h: 0.58 },
                { rx: 0.53, w: 0.08, h: 0.85 }, { rx: 0.61, w: 0.05, h: 0.68 },
                { rx: 0.66, w: 0.09, h: 0.78 }, { rx: 0.75, w: 0.06, h: 0.62 },
                { rx: 0.81, w: 0.07, h: 0.55 }, { rx: 0.88, w: 0.08, h: 0.72 },
                { rx: 0.96, w: 0.04, h: 0.58 },
            ];
            buildings.forEach(b => {
                const bx = ox + b.rx * tw;
                const bw = b.w * tw;
                const bh = b.h * (H - horizon) * 0.85;
                this._drawBuilding(ctx, bx, horizon - bh, bw, bh, 6, Math.floor(bh / 28), '#080818', '#ffaa44');
            });

            // Empire State / One WTC spire at centre
            const espX = ox + tw * 0.5;
            const espH = (H - horizon) * 0.88;
            ctx.save();
            ctx.fillStyle = '#1a2040';
            ctx.fillRect(espX - 22, horizon - espH, 44, espH);
            ctx.fillStyle = '#2a3060';
            ctx.fillRect(espX - 12, horizon - espH * 1.05, 24, espH * 0.1);
            // Spire
            ctx.beginPath();
            ctx.moveTo(espX - 3, horizon - espH * 1.05);
            ctx.lineTo(espX, horizon - espH * 1.25);
            ctx.lineTo(espX + 3, horizon - espH * 1.05);
            ctx.closePath();
            ctx.fillStyle = '#aaaacc';
            ctx.fill();
            // Beacon
            ctx.beginPath();
            ctx.arc(espX, horizon - espH * 1.25, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4400';
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 25;
            ctx.fill();
            ctx.restore();

            // Times Square billboard lights
            const billboards = [
                { rx: 0.20, col: '#ff4400', text: 'TIMES SQ' },
                { rx: 0.45, col: '#4488ff', text: 'NYC' },
                { rx: 0.70, col: '#ffcc00', text: 'BROADWAY' },
            ];
            billboards.forEach(bb => {
                const bbX = ox + bb.rx * tw;
                const bbY = horizon - (H - horizon) * 0.45;
                ctx.save();
                ctx.shadowColor = bb.col;
                ctx.shadowBlur = 20;
                ctx.fillStyle = bb.col;
                ctx.globalAlpha = 0.9;
                ctx.fillRect(bbX, bbY, tw * 0.08, (H - horizon) * 0.10);
                ctx.restore();
            });
        }
    }

    private _drawParisSkyline(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number) {
        const tileCount = 3;
        for (let t = 0; t < tileCount; t++) {
            const ox = t * (W / tileCount);
            const tw = W / tileCount;

            // Haussmann-style buildings (shorter, wider)
            const buildings = [
                { rx: 0.00, w: 0.10, h: 0.30 }, { rx: 0.10, w: 0.08, h: 0.35 },
                { rx: 0.18, w: 0.09, h: 0.28 }, { rx: 0.27, w: 0.07, h: 0.38 },
                { rx: 0.34, w: 0.11, h: 0.32 }, { rx: 0.45, w: 0.08, h: 0.30 },
                { rx: 0.53, w: 0.10, h: 0.36 }, { rx: 0.63, w: 0.07, h: 0.28 },
                { rx: 0.70, w: 0.09, h: 0.34 }, { rx: 0.79, w: 0.10, h: 0.32 },
                { rx: 0.89, w: 0.08, h: 0.30 },
            ];
            buildings.forEach(b => {
                const bx = ox + b.rx * tw;
                const bw = b.w * tw;
                const bh = b.h * (H - horizon) * 1.0;
                ctx.fillStyle = '#2a1a10';
                ctx.fillRect(bx, horizon - bh, bw, bh);
                // Mansard roof
                ctx.fillStyle = '#1a0e0a';
                ctx.beginPath();
                ctx.moveTo(bx, horizon - bh);
                ctx.lineTo(bx + bw * 0.1, horizon - bh - bh * 0.15);
                ctx.lineTo(bx + bw * 0.9, horizon - bh - bh * 0.15);
                ctx.lineTo(bx + bw, horizon - bh);
                ctx.closePath();
                ctx.fill();
                this._drawBuilding(ctx, bx, horizon - bh, bw, bh, 4, Math.floor(bh / 35), 'transparent', '#ffcc88');
            });

            // Eiffel Tower (centre)
            const etX = ox + tw * 0.5;
            const etH = (H - horizon) * 0.80;
            ctx.save();
            // Legs
            ctx.fillStyle = '#8b7040';
            ctx.beginPath();
            ctx.moveTo(etX - tw * 0.06, horizon);
            ctx.lineTo(etX - tw * 0.01, horizon - etH * 0.5);
            ctx.lineTo(etX - tw * 0.005, horizon - etH * 0.5);
            ctx.lineTo(etX + tw * 0.005, horizon - etH * 0.5);
            ctx.lineTo(etX + tw * 0.01, horizon - etH * 0.5);
            ctx.lineTo(etX + tw * 0.06, horizon);
            ctx.closePath();
            ctx.fill();
            // Second floor
            ctx.fillStyle = '#9b8050';
            ctx.fillRect(etX - tw * 0.025, horizon - etH * 0.52, tw * 0.05, etH * 0.07);
            // Upper section
            ctx.fillStyle = '#ab9060';
            ctx.beginPath();
            ctx.moveTo(etX - tw * 0.015, horizon - etH * 0.55);
            ctx.lineTo(etX, horizon - etH * 0.92);
            ctx.lineTo(etX + tw * 0.015, horizon - etH * 0.55);
            ctx.closePath();
            ctx.fill();
            // Antenna
            ctx.strokeStyle = '#c0a870';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(etX, horizon - etH * 0.92);
            ctx.lineTo(etX, horizon - etH * 1.02);
            ctx.stroke();
            // Beacon (Eiffel light show)
            ctx.beginPath();
            ctx.arc(etX, horizon - etH * 1.02, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffcc';
            ctx.shadowColor = '#ffff88';
            ctx.shadowBlur = 30;
            ctx.fill();
            // Light sweep
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = '#ffff88';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.moveTo(etX, horizon - etH * 1.02);
            ctx.lineTo(etX + 200, horizon - etH * 0.6);
            ctx.stroke();
            ctx.restore();
            ctx.restore();
        }
    }

    private _drawRomeSkyline(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number) {
        const tileCount = 3;
        for (let t = 0; t < tileCount; t++) {
            const ox = t * (W / tileCount);
            const tw = W / tileCount;

            // Roman low skyline with domes and walls
            const buildings = [
                { rx: 0.00, w: 0.12, h: 0.20 }, { rx: 0.12, w: 0.09, h: 0.25 },
                { rx: 0.21, w: 0.10, h: 0.22 }, { rx: 0.31, w: 0.08, h: 0.30 },
                { rx: 0.40, w: 0.12, h: 0.24 }, { rx: 0.54, w: 0.09, h: 0.28 },
                { rx: 0.64, w: 0.10, h: 0.22 }, { rx: 0.74, w: 0.08, h: 0.25 },
                { rx: 0.82, w: 0.11, h: 0.20 }, { rx: 0.93, w: 0.07, h: 0.26 },
            ];
            buildings.forEach(b => {
                const bx = ox + b.rx * tw;
                const bw = b.w * tw;
                const bh = b.h * (H - horizon);
                ctx.fillStyle = '#2e1a0e';
                ctx.fillRect(bx, horizon - bh, bw, bh);
                this._drawBuilding(ctx, bx, horizon - bh, bw, bh, 3, Math.floor(bh / 40), 'transparent', '#ffaa55');
            });

            // Dome of St Peter's
            ctx.save();
            const domX = ox + tw * 0.28;
            const domR = tw * 0.055;
            const domY = horizon - (H - horizon) * 0.30;
            ctx.fillStyle = '#1e1408';
            ctx.fillRect(domX - domR * 0.5, domY, domR, (H - horizon) * 0.30);
            ctx.beginPath();
            ctx.arc(domX, domY, domR, Math.PI, 0);
            ctx.fillStyle = '#2a1e10';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(domX, domY - domR * 0.1, domR * 0.2, Math.PI, 0);
            ctx.fillStyle = '#3a2818';
            ctx.fill();
            ctx.restore();

            // Colosseum (the main landmark - elliptical arched structure)
            const colX = ox + tw * 0.60;
            const colW = tw * 0.22;
            const colH = (H - horizon) * 0.55;
            const colTop = horizon - colH;

            ctx.save();
            // Main elliptical body
            ctx.fillStyle = '#3a2010';
            ctx.beginPath();
            ctx.ellipse(colX + colW / 2, colTop + colH * 0.5, colW / 2, colH / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Arch tiers
            const tiers = 4;
            for (let tier = 0; tier < tiers; tier++) {
                const tierY = colTop + (colH / tiers) * tier;
                const tierH2 = colH / tiers;
                const archCount = 6 + tier * 2;
                for (let arch = 0; arch < archCount; arch++) {
                    const angle = (arch / archCount) * Math.PI * 2;
                    const rx2 = colW / 2 * 0.88;
                    const ry2 = colH / 2 * 0.88;
                    const ax = colX + colW / 2 + rx2 * Math.cos(angle);
                    const ay = colTop + colH / 2 + ry2 * Math.sin(angle);
                    const archW = colW * 0.05;
                    const archH2 = tierH2 * 0.65;
                    ctx.fillStyle = '#1a0e06';
                    ctx.globalAlpha = 0.6;
                    ctx.fillRect(ax - archW / 2, ay - archH2 / 2, archW, archH2);
                    ctx.globalAlpha = 1.0;
                }
            }

            // Warm amber glow lighting the Colosseum
            const colGlow = ctx.createRadialGradient(colX + colW / 2, colTop + colH * 0.6, 0, colX + colW / 2, colTop + colH * 0.6, colW * 0.8);
            colGlow.addColorStop(0, 'rgba(255,140,40,0.3)');
            colGlow.addColorStop(1, 'rgba(255,80,10,0)');
            ctx.fillStyle = colGlow;
            ctx.fillRect(colX - colW * 0.3, colTop, colW * 1.6, colH);

            ctx.restore();

            // Pine trees (silhouettes)
            for (let pi = 0; pi < 6; pi++) {
                const px = ox + tw * (0.05 + pi * 0.16);
                const ph = (H - horizon) * (0.15 + Math.random() * 0.10);
                ctx.save();
                ctx.fillStyle = '#0a0804';
                ctx.beginPath();
                ctx.moveTo(px - tw * 0.012, horizon);
                ctx.lineTo(px, horizon - ph);
                ctx.lineTo(px + tw * 0.012, horizon);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }

    private makeBlackTransparent(image: HTMLImageElement): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const luma = Math.max(r, g, b);
            if (luma < 15) {
                data[i+3] = 0;
            } else if (luma < 40) {
                data[i+3] = (luma - 15) * 10;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipMapLinearFilter;
        return tex;
    }

    private initARBillboard() {
        this.arBillboard = new THREE.Group();
        this.arBillboard.position.set(0, 0.175, 0); // Spawning at 0.175m (brought down by 4cm)
        this.arBillboard.renderOrder = 990;

        const bannerGeom = new THREE.PlaneGeometry(0.108, 0.0688);
        const bannerMat = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const banner = new THREE.Mesh(bannerGeom, bannerMat);
        banner.userData.defaultOpacity = 1.0;
        banner.renderOrder = 990;
        this.arBillboard.add(banner);
        
        const texLoader = new THREE.TextureLoader();
        texLoader.load('./ui/ipl/grand_finale_banner.png', (tex) => {
            const alphaTex = this.makeBlackTransparent(tex.image);
            bannerMat.map = alphaTex;
            bannerMat.needsUpdate = true;
        });

        // Dummy objects to prevent errors in update/fade logic
        this.billboardCanvas = document.createElement('canvas');
        this.billboardCtx = this.billboardCanvas.getContext('2d')!;
        this.billboardTexture = new THREE.CanvasTexture(this.billboardCanvas);

        this.arBillboard.visible = false;
        this.tableGroup.add(this.arBillboard);
    }

    private redrawBillboard() {
        // Obsolete - using static grand finale banner
    }

    private initHawkEye() {
        // Create a thin glowing trajectory line
        const hawkeyeGeom = new THREE.BufferGeometry();
        const hawkeyeMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.0, // Hidden initially
            linewidth: 2,
            depthWrite: false
        });
        this.hawkeyeLine = new THREE.Line(hawkeyeGeom, hawkeyeMat);
        this.hawkeyeLine.userData = { defaultOpacity: 0.75 };
        this.tableGroup.add(this.hawkeyeLine);

        // Glowing ball sphere
        const ballGeom = new THREE.SphereGeometry(0.0022, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        this.hawkeyeBall = new THREE.Mesh(ballGeom, ballMat);
        this.hawkeyeBall.userData = { defaultOpacity: 0.95 };
        this.tableGroup.add(this.hawkeyeBall);

        // Flat bounce ripple ring on the wicket pitch
        const rippleGeom = new THREE.RingGeometry(0.0001, 0.005, 32);
        this.hawkeyeRippleMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.hawkeyeRipple = new THREE.Mesh(rippleGeom, this.hawkeyeRippleMat);
        this.hawkeyeRipple.rotation.x = -Math.PI / 2;
        this.tableGroup.add(this.hawkeyeRipple);
    }

    private triggerHawkeye(pathType: 'SIX' | 'WICKET' | 'DOT') {
        this.currentHawkeyePath = pathType;
        this.isHawkeyeRunning = true;
        this.hawkeyeProgress = 0.0;
        this.hawkeyeTime = 0.0;

        // Define precise local path coordinates on the mini Wankhede wicket pitch (Aligned along X-axis!)
        const points: THREE.Vector3[] = [];
        
        if (pathType === 'SIX') {
            points.push(new THREE.Vector3(-0.045, 0.02, 0.0));    // Bowler crease release
            points.push(new THREE.Vector3(0.015, 0.009, 0.0));   // Center bounce coordinate
            points.push(new THREE.Vector3(0.038, 0.016, 0.0));   // Strike zone contact
            points.push(new THREE.Vector3(0.065, 0.05, 0.03));   // Sky rise arc
            points.push(new THREE.Vector3(0.09, 0.075, 0.06));   // High peak over stand canopy
            points.push(new THREE.Vector3(0.11, 0.045, 0.08));   // Landing in stands
        } else if (pathType === 'WICKET') {
            points.push(new THREE.Vector3(-0.045, 0.02, 0.002)); // Release slightly off-center
            points.push(new THREE.Vector3(0.018, 0.009, -0.001));// Bounce close to crease
            points.push(new THREE.Vector3(0.042, 0.012, -0.002));// Directly striking stumps!
            points.push(new THREE.Vector3(0.048, 0.010, -0.004));// Bumping away
        } else { // DOT
            points.push(new THREE.Vector3(-0.045, 0.02, -0.002));
            points.push(new THREE.Vector3(0.014, 0.009, 0.001));
            points.push(new THREE.Vector3(0.038, 0.015, 0.003)); // Swing & miss
            points.push(new THREE.Vector3(0.047, 0.02, 0.004));  // Safely caught by keeper
        }

        this.hawkeyeCurve = new THREE.CatmullRomCurve3(points);
        
        // Populate trajectory line geometry
        const splinePoints = this.hawkeyeCurve.getPoints(50);
        this.hawkeyeLine.geometry.setFromPoints(splinePoints);
        
        // Reset opacities to active
        if (this.hawkeyeLine.material instanceof THREE.Material) {
            this.hawkeyeLine.material.opacity = 0.75;
            this.hawkeyeLine.material.needsUpdate = true;
        }
        if (this.hawkeyeBall.material instanceof THREE.Material) {
            this.hawkeyeBall.material.opacity = 0.95;
            this.hawkeyeBall.material.needsUpdate = true;
        }

        // Set trajectory line color based on path type
        const lineMat = this.hawkeyeLine.material as THREE.LineBasicMaterial;
        if (pathType === 'SIX') lineMat.color.setHex(0xe2af37); // Gold Six trajectory
        else if (pathType === 'WICKET') lineMat.color.setHex(0xff3333); // Red Wicket trajectory
        else lineMat.color.setHex(0x00ffff); // Cyan Dot trajectory

        // Reset bounce ripple
        this.hawkeyeRippleMat.opacity = 0.0;
        this.hawkeyeRipple.scale.setScalar(0.1);
        this.hawkeyeRipple.position.copy(points[1]); // Set position exactly at bounce coordinates
    }

    private updateHawkEye(dt: number) {
        if (!this.isHawkeyeRunning) return;

        this.hawkeyeProgress += dt * 0.9; // Plays the delivery in ~1.1s
        
        if (this.hawkeyeProgress >= 1.0) {
            this.hawkeyeProgress = 1.0;
            
            // Fade out spline line and ball over time
            const lineMat = this.hawkeyeLine.material as THREE.LineBasicMaterial;
            const ballMat = this.hawkeyeBall.material as THREE.MeshBasicMaterial;
            
            lineMat.opacity = Math.max(0, lineMat.opacity - dt * 2.0);
            ballMat.opacity = Math.max(0, ballMat.opacity - dt * 2.0);
            
            if (lineMat.opacity <= 0 && ballMat.opacity <= 0) {
                this.isHawkeyeRunning = false;
            }
            return;
        }

        // Move ball along spline curve
        const ballPos = this.hawkeyeCurve.getPointAt(this.hawkeyeProgress);
        this.hawkeyeBall.position.copy(ballPos);

        // Clamp height above floor
        const floorY = this.getFloorY();
        const ballRadius = 0.0022 * this.hawkeyeBall.scale.x;
        if (this.hawkeyeBall.position.y < floorY + ballRadius) {
            this.hawkeyeBall.position.y = floorY + ballRadius;
        }

        // Animate radar bounce ring as the ball passes the bounce point (~30% progress)
        if (this.hawkeyeProgress >= 0.28 && this.hawkeyeProgress <= 0.55) {
            const rippleRatio = (this.hawkeyeProgress - 0.28) / 0.27; // goes 0 to 1
            this.hawkeyeRipple.scale.setScalar(0.1 + rippleRatio * 2.5);
            this.hawkeyeRippleMat.opacity = Math.max(0, 1.0 - rippleRatio);
        }

        // Stumps flash alert for wicket outcome (~75% progress)
        if (this.currentHawkeyePath === 'WICKET' && this.hawkeyeProgress >= 0.72) {
            if (Math.floor(this.hawkeyeProgress * 50) % 2 === 0) {
                this.predictionFlashColor = 'rgba(255, 34, 34, 0.9)'; // bright red flash
            } else {
                this.predictionFlashColor = 'rgba(255, 255, 255, 0.7)';
            }
        }
    }

    private initPlayerMarkers() {
        // Positions are in table-local metres (the table diameter is 0.24m = ~0.12m radius).
        // Cards are 0.055m wide, so fielders need at least 0.06m separation to avoid overlap.
        // Inner ring r≈0.022-0.030m (pitch/crease), outer ring r≈0.055-0.095m (outfield).
        // ── Choose roster based on active stadium type ─────────────────────
        type PlayerEntry = {
            id: string; name: string;
            role: 'fielder' | 'batsman' | 'umpire';
            jersey: string;
            team: 'blue' | 'yellow' | 'neutral';
            x: number; z: number;
            primary: string; secondary: string;
            rcbCardKey: string;
        };

        const rosterCricket: PlayerEntry[] = [
            // ── Batting: Rajasthan Royals (Yellow) ──────────────────────────
            { id: "b1", name: "Y. Jaiswal",   role: "batsman", jersey: "1",  team: "yellow", x:  0.035, z: -0.005, primary: "Runs: 68* (42)",       secondary: "SR: 161.9",        rcbCardKey: "" },
            { id: "b2", name: "S. Samson",    role: "batsman", jersey: "13", team: "yellow", x: -0.035, z:  0.005, primary: "Runs: 31 (20)",        secondary: "SR: 155.0",        rcbCardKey: "" },
            // ── Umpires ─────────────────────────────────────────────────────
            { id: "u1", name: "M. Erasmus",   role: "umpire",  jersey: "U1", team: "neutral", x: -0.055, z:  0.000, primary: "Umpire (Bowler's)",   secondary: "Decisions: 100%",  rcbCardKey: "" },
            { id: "u2", name: "N. Llong",     role: "umpire",  jersey: "U2", team: "neutral", x:  0.035, z:  0.020, primary: "Umpire (Sq. Leg)",    secondary: "Decisions: 100%",  rcbCardKey: "" },
            // ── Fielding: Royal Challengers Bengaluru (Blue) ────────────────
            { id: "f1",  name: "J. Cox",        role: "fielder", jersey: "60", team: "blue", x:  0.052, z:  0.000, primary: "Catches: 1, St: 0",    secondary: "Wicketkeeper",      rcbCardKey: "rcbJordanCox"  },
            { id: "f2",  name: "B. Kumar",      role: "fielder", jersey: "15", team: "blue", x: -0.055, z:  0.000, primary: "Overs: 3.2-0-22-2",   secondary: "Active: Bowler",    rcbCardKey: "rcbBhuvi"      },
            { id: "f3",  name: "K. Pandya",     role: "fielder", jersey: "24", team: "blue", x:  0.022, z:  0.026, primary: "Overs: 2-0-18-1",     secondary: "Pos: Point",        rcbCardKey: "rcbKrunal"     },
            { id: "f4",  name: "V. Kohli",      role: "fielder", jersey: "18", team: "blue", x: -0.004, z:  0.028, primary: "4s/6s: 3/4 | SR:250", secondary: "Pos: Cover",        rcbCardKey: "rcbKohli"      },
            { id: "f5",  name: "V. Iyer",       role: "fielder", jersey: "10", team: "blue", x:  0.022, z: -0.018, primary: "Runs Saved: 5",        secondary: "Pos: Gully",        rcbCardKey: "rcbVenkatesh"  },
            { id: "f6",  name: "T. David",      role: "fielder", jersey: "8",  team: "blue", x: -0.065, z:  0.060, primary: "Catches: 0",           secondary: "Pos: Deep Mid-On",  rcbCardKey: "rcbTimDavid"   },
            { id: "f7",  name: "J. Bethell",    role: "fielder", jersey: "34", team: "blue", x:  0.065, z:  0.055, primary: "Runs Saved: 4",        secondary: "Pos: Deep Cover",   rcbCardKey: "rcbBethell"    },
            { id: "f8",  name: "R. Shepherd",   role: "fielder", jersey: "9",  team: "blue", x: -0.075, z: -0.020, primary: "Overs: 2-0-14-1",     secondary: "Pos: Long-On",      rcbCardKey: "rcbShepherd"   },
            { id: "f9",  name: "J. Hazlewood",  role: "fielder", jersey: "23", team: "blue", x:  0.060, z: -0.055, primary: "Overs: 3-0-20-2",     secondary: "Pos: Fine Leg",     rcbCardKey: "rcbHazlewood"  },
            { id: "f10", name: "J. Duffy",      role: "fielder", jersey: "77", team: "blue", x: -0.045, z: -0.070, primary: "Overs: 2-0-16-0",     secondary: "Pos: Deep Mid-Wkt", rcbCardKey: "rcbDuffy"      },
            { id: "f11", name: "R. Patidar",    role: "fielder", jersey: "21", team: "blue", x:  0.002, z: -0.082, primary: "Catches: 1",           secondary: "Pos: Long-Off",     rcbCardKey: "rcbPatidar"    },
        ];

        const rosterFootball: PlayerEntry[] = [
            // ── Berlin FC (Blue — home) ──────────────────────────────────────
            // Goalkeeper (re-positioned so he stands right in front of the goal line at z = -0.082 table space)
            { id: "gk", name: "M. Neuer",      role: "fielder", jersey: "1",  team: "blue",   x:  0.000, z: -0.114, primary: "Saves: 3 / 5",        secondary: "GK — Penalty Box",  rcbCardKey: "" },
            // Defenders
            { id: "d1", name: "T. Alexander",  role: "fielder", jersey: "5",  team: "blue",   x: -0.040, z: -0.065, primary: "Tackles: 4",           secondary: "CB — Left",         rcbCardKey: "" },
            { id: "d2", name: "R. Rüdiger",    role: "fielder", jersey: "22", team: "blue",   x:  0.040, z: -0.065, primary: "Interceptions: 3",     secondary: "CB — Right",        rcbCardKey: "" },
            { id: "d3", name: "J. Kimmich",    role: "fielder", jersey: "6",  team: "blue",   x: -0.070, z: -0.045, primary: "Crosses: 5",           secondary: "RB — Wing",         rcbCardKey: "" },
            { id: "d4", name: "A. Davies",     role: "fielder", jersey: "19", team: "blue",   x:  0.070, z: -0.045, primary: "Tackles: 2",           secondary: "LB — Wing",         rcbCardKey: "" },
            // Midfielders
            { id: "m1", name: "T. Müller",     role: "fielder", jersey: "25", team: "blue",   x: -0.025, z: -0.030, primary: "Key Passes: 3",        secondary: "CM — Box-to-Box",   rcbCardKey: "" },
            { id: "m2", name: "L. Goretzka",   role: "fielder", jersey: "8",  team: "blue",   x:  0.025, z: -0.030, primary: "Passes: 42 / 48",      secondary: "CM — Defensive",    rcbCardKey: "" },
            // Forwards
            { id: "fw1", name: "L. Sané",      role: "fielder", jersey: "10", team: "blue",   x: -0.055, z:  0.015, primary: "Shots: 2 / 4",        secondary: "LW — Forward",      rcbCardKey: "" },
            { id: "fw2", name: "S. Gnabry",    role: "fielder", jersey: "7",  team: "blue",   x:  0.055, z:  0.015, primary: "Dribbles: 3",          secondary: "RW — Forward",      rcbCardKey: "" },
            { id: "fw3", name: "H. Kane",      role: "batsman", jersey: "9",  team: "blue",   x:  0.000, z:  0.020, primary: "Goals: 1  Shots: 4",   secondary: "ST — Striker",      rcbCardKey: "" },
            // Away team
            { id: "a1",  name: "J. Bellingham",role: "batsman", jersey: "22", team: "yellow", x:  0.013, z:  0.040, primary: "Goals: 1  Assists: 1", secondary: "AM — Attacking",    rcbCardKey: "" },
            // Referee
            { id: "ref", name: "S. Marciniak", role: "umpire",  jersey: "R",  team: "neutral", x:  0.000, z:  0.000, primary: "Referee",             secondary: "UEFA Pro",          rcbCardKey: "" },
            { id: "ar1", name: "C. Kwiatkowski",role:"umpire", jersey: "A1", team: "neutral", x: -0.095, z:  0.000, primary: "Asst. Referee",        secondary: "Touchline — Left",  rcbCardKey: "" },
        ];

        const rosterBasketball: PlayerEntry[] = [
            // ── LA Lakers (Blue — home) ──────────────────────────────────────
            { id: "p1",  name: "L. James",     role: "batsman", jersey: "23", team: "blue",   x:  0.000, z:  0.010, primary: "Pts: 28  Reb: 7",      secondary: "SF — Paint",        rcbCardKey: "" },
            { id: "p2",  name: "A. Davis",     role: "batsman", jersey: "3",  team: "blue",   x:  0.000, z: -0.010, primary: "Pts: 22  Blk: 3",      secondary: "C — Post",          rcbCardKey: "" },
            { id: "p3",  name: "A. Reaves",    role: "fielder", jersey: "15", team: "blue",   x: -0.030, z:  0.025, primary: "Pts: 14  3PT: 3/6",    secondary: "PG — Perimeter",    rcbCardKey: "" },
            { id: "p4",  name: "R. Hachimura", role: "fielder", jersey: "28", team: "blue",   x:  0.030, z:  0.025, primary: "Pts: 10  Reb: 4",      secondary: "PF — Wing",         rcbCardKey: "" },
            { id: "p5",  name: "D. Russell",   role: "fielder", jersey: "1",  team: "blue",   x: -0.045, z:  0.000, primary: "Pts: 18  Ast: 9",      secondary: "PG — Ball Handler", rcbCardKey: "" },
            // ── Boston Celtics (Yellow — away) ──────────────────────────────
            { id: "a1",  name: "J. Brown",     role: "batsman", jersey: "7",  team: "yellow", x:  0.000, z:  0.035, primary: "Pts: 26  Reb: 5",      secondary: "SG — Wing",         rcbCardKey: "" },
            { id: "a2",  name: "J. Tatum",     role: "batsman", jersey: "0",  team: "yellow", x:  0.000, z:  0.050, primary: "Pts: 31  Ast: 6",      secondary: "SF — Perimeter",    rcbCardKey: "" },
            { id: "a3",  name: "K. Porzingis", role: "fielder", jersey: "8",  team: "yellow", x:  0.040, z:  0.045, primary: "Pts: 16  Blk: 2",      secondary: "C — Post",          rcbCardKey: "" },
            { id: "a4",  name: "D. White",     role: "fielder", jersey: "0",  team: "yellow", x: -0.040, z:  0.045, primary: "Pts: 12  3PT: 4/7",    secondary: "SG — Shooter",      rcbCardKey: "" },
            { id: "a5",  name: "J. Holiday",   role: "fielder", jersey: "11", team: "yellow", x: -0.055, z:  0.035, primary: "Pts: 11  Stl: 2",      secondary: "PG — Defender",     rcbCardKey: "" },
            // Officials
            { id: "ref", name: "M. Carettini", role: "umpire",  jersey: "R",  team: "neutral", x:  0.020, z:  0.025, primary: "NBA Referee",          secondary: "15 yrs experience", rcbCardKey: "" },
        ];

        const roster: PlayerEntry[] =
            this.currentStadiumType === 'berlin' ? rosterFootball
          : this.currentStadiumType === 'inuit'  ? rosterBasketball
          : (this.currentStadiumType === 'butterflies' || this.currentStadiumType === 'nurburgring') ? []
          : rosterCricket;

        // ── Shared Phong glassmorphic materials (created ONCE per team — not 22× per player) ───────
        const mkGlass = (col: number, emissiveHex: number, opacity: number = 0.82) =>
            new THREE.MeshPhongMaterial({
                color: col,
                shininess: 120,
                emissive: new THREE.Color(emissiveHex).multiplyScalar(0.75),
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide
            });

        const sharedMats = {
            blue:    {
                body:   mkGlass(0xee2222, 0xff0044, 0.82),  // Glowing ruby red
                sec:    mkGlass(0xffcc00, 0xffb700, 0.95),  // Glowing neon gold
                pants:  mkGlass(0x0f172a, 0x1e293b, 0.85),  // Holographic navy/slate
                accent: mkGlass(0xff3355, 0xff0055, 0.90),
            },
            yellow:  {
                body:   mkGlass(0xff0088, 0xff00cc, 0.82),  // Glowing cyber pink/magenta
                sec:    mkGlass(0x0099ff, 0x00ccff, 0.95),  // Glowing electric blue
                pants:  mkGlass(0xe2e8f0, 0xffffff, 0.85),  // Frosted silver glass
                accent: mkGlass(0x00ffff, 0x00ffff, 0.90),
            },
            neutral: {
                body:   mkGlass(0x090d16, 0x0f172a, 0.85),  // Cyber obsidian
                sec:    mkGlass(0x00ffff, 0x00ffff, 0.95),  // Glowing cyan trims
                pants:  mkGlass(0x1e293b, 0x334155, 0.85),  // Dark slate pants
                accent: mkGlass(0xffffff, 0xffffff, 0.90),
            },
        };
        // Soft glowing frosted-ice holographic skin!
        const sharedSkin  = mkGlass(0xe2e8f0, 0x00ffcc, 0.88);
        const sharedBlack = mkGlass(0x05050f, 0x000000, 0.95);
        const sharedWood  = mkGlass(0xb5823a, 0xe2af37, 0.95);
        const sharedMetal = mkGlass(0x475569, 0x00ffff, 0.90);
        const sharedPad   = mkGlass(0xf1f5f9, 0x00ffff, 0.90);
        const sharedLedMats = {
            blue:    new THREE.MeshPhongMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffcc00).multiplyScalar(1.5), shininess: 200 }),
            yellow:  new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: new THREE.Color(0x00ffff).multiplyScalar(1.5), shininess: 200 }),
            neutral: new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff).multiplyScalar(1.5), shininess: 200 }),
        };

        // ── Figure proportions at 50% of previous scale ──────────────────────────────
        const H_LEGS  = 0.00375;
        const H_TORSO = 0.00275;
        const H_HEAD  = 0.00125;
        const W_TORSO = 0.00090;
        const W_WAIST = 0.00065;
        const UA_H    = H_TORSO * 0.75;
        const FA_H    = H_TORSO * 0.60;
        const THIGH_H = H_LEGS  * 0.54;
        const SHIN_H  = H_LEGS  * 0.46;

        // ── Shared geometry pool (ONE geometry object per body part — reused across all 22 players) ─
        const gTorso    = new THREE.CylinderGeometry(W_TORSO, W_WAIST, H_TORSO, 7);
        gTorso.translate(0, H_TORSO / 2, 0);
        const gStripe   = new THREE.BoxGeometry(W_TORSO * 1.8, H_TORSO * 0.18, W_TORSO * 0.25);
        const gNeck     = new THREE.CylinderGeometry(0.000275, 0.0003, 0.0006, 6);
        const gHead     = new THREE.IcosahedronGeometry(H_HEAD * 0.78, 1); // Faceted crystal head!
        const gHelmet   = new THREE.IcosahedronGeometry(H_HEAD * 0.86, 1); // Sleek cybernetic faceted headgear shell!
        const gBrim     = new THREE.CylinderGeometry(H_HEAD * 0.94, H_HEAD * 0.94, 0.00006, 10, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
        const gGrill    = new THREE.CylinderGeometry(0.000048, 0.000048, H_HEAD, 4);
        const gVisor    = new THREE.BoxGeometry(H_HEAD * 1.5, H_HEAD * 0.25, H_HEAD * 0.22); // Wraparound VR-style visor!
        const gShoulder = new THREE.BoxGeometry(W_TORSO * 1.1, H_TORSO * 0.16, W_TORSO * 0.8);
        const gUArm     = (() => { const g = new THREE.CylinderGeometry(0.000325, 0.00026, UA_H, 6); g.translate(0, -UA_H / 2, 0); return g; })();
        const gFArm     = (() => { const g = new THREE.CylinderGeometry(0.00024, 0.00019, FA_H, 5); g.translate(0, -FA_H / 2, 0); return g; })();
        const gThigh    = (() => { const g = new THREE.CylinderGeometry(0.000425, 0.00036, THIGH_H, 6); g.translate(0, -THIGH_H / 2, 0); return g; })();
        const gShin     = (() => { const g = new THREE.CylinderGeometry(0.00034, 0.00024, SHIN_H, 5);  g.translate(0, -SHIN_H / 2, 0);  return g; })();
        const gShoe     = new THREE.BoxGeometry(0.0004, 0.00019, 0.00065);
        const gPad      = new THREE.BoxGeometry(0.00045, SHIN_H * 0.88, 0.000275);
        const gRing     = (() => { const g = new THREE.RingGeometry(0.0018, 0.0026, 16); g.rotateX(-Math.PI / 2); return g; })();

        // Additional custom geometries for sport-specific models (Zero-GC)
        const gGlove    = new THREE.BoxGeometry(0.00075, 0.00075, 0.00075); // goalkeeper gloves
        const gHeadband = new THREE.CylinderGeometry(H_HEAD * 0.82, H_HEAD * 0.82, 0.0003, 10); // tennis/soccer headbands
        const gHair     = new THREE.SphereGeometry(H_HEAD * 0.35, 8, 8); // hair bun for soccer style

        roster.forEach((p, idx) => {
            const team  = p.team as 'blue' | 'yellow' | 'neutral';
            const mats  = sharedMats[team];
            const ledM  = sharedLedMats[team];

            const playerGroup = new THREE.Group();
            this.tableGroup.add(playerGroup);

            // Active sport flags
            const isCricket = this.currentStadiumType === 'default';
            const isFootball = this.currentStadiumType === 'berlin';
            const isBasketball = this.currentStadiumType === 'inuit';

            // ── Torso ─────────────────────────────────────────────────────────────────
            const mesh = new THREE.Mesh(gTorso, mats.body);
            mesh.position.y = H_LEGS;
            playerGroup.add(mesh);

            // Chest stripe (secondary colour slab)
            const stripe = new THREE.Mesh(gStripe, mats.sec);
            stripe.position.set(0, H_TORSO * 0.55, W_TORSO * 0.9);
            mesh.add(stripe);

            // ── Neck ─────────────────────────────────────────────────────────────────
            const neckMesh = new THREE.Mesh(gNeck, sharedSkin);
            neckMesh.position.set(0, H_TORSO + 0.0003, 0);
            mesh.add(neckMesh);

            // ── Head ─────────────────────────────────────────────────────────────────
            const headY = H_TORSO + 0.0007 + H_HEAD * 0.78;
            const headMesh = new THREE.Mesh(gHead, sharedSkin);
            headMesh.position.set(0, headY, 0);
            mesh.add(headMesh);

            // ── Sport-Specific Headgear/Hair ─────────────────────────────────────────
            if (isCricket) {
                // Helmet shell
                const helmetMesh = new THREE.Mesh(gHelmet, mats.sec);
                helmetMesh.position.set(0, headY + H_HEAD * 0.04, 0);
                mesh.add(helmetMesh);

                // Helmet brim
                const brimMesh = new THREE.Mesh(gBrim, mats.sec);
                brimMesh.position.set(0, headY - H_HEAD * 0.35, H_HEAD * 0.45);
                mesh.add(brimMesh);

                // Face grill bars (metallic)
                [-0.00016, 0.00016].forEach(ox => {
                    const bar = new THREE.Mesh(gGrill, sharedMetal);
                    bar.position.set(ox, headY - H_HEAD * 0.15, H_HEAD * 0.86);
                    mesh.add(bar);
                });
            } else if (isFootball) {
                // Add stylish neon headband instead of helmet!
                const headband = new THREE.Mesh(gHeadband, ledM);
                headband.position.set(0, headY + H_HEAD * 0.1, 0);
                mesh.add(headband);

                // Hair bun on back of head
                const hairBun = new THREE.Mesh(gHair, sharedBlack);
                hairBun.position.set(0, headY + H_HEAD * 0.5, -H_HEAD * 0.35);
                mesh.add(hairBun);
            } else if (isBasketball) {
                // Basketball players: headbands only!
                const headband = new THREE.Mesh(gHeadband, ledM);
                headband.position.set(0, headY + H_HEAD * 0.1, 0);
                mesh.add(headband);
            }

            // LED visor (emissive stripe)
            const visorMesh = new THREE.Mesh(gVisor, ledM);
            visorMesh.position.set(0, headY + H_HEAD * 0.08, H_HEAD * 0.75);
            mesh.add(visorMesh);

            // ── Shoulder pads ─────────────────────────────────────────────────────────
            // Only Cricket and Football get shoulder panels
            if (isCricket || isFootball) {
                const padW = W_TORSO * 1.1;
                [-(W_TORSO + padW * 0.42), (W_TORSO + padW * 0.42)].forEach(ox => {
                    const s = new THREE.Mesh(gShoulder, mats.sec);
                    s.position.set(ox, H_TORSO * 0.85, 0);
                    mesh.add(s);
                });
            }

            // ── Arms (upper + forearm) ─────────────────────────────────────────────────
            // Basketball is sleeveless: upper arm is skin. Football/cricket are sleeved.
            const armMat = isBasketball ? sharedSkin : mats.body; 
            const lArmMesh = new THREE.Mesh(gUArm, armMat);
            lArmMesh.position.set(-(W_TORSO + 0.0003), H_TORSO * 0.82, 0);
            mesh.add(lArmMesh);
            const rArmMesh = new THREE.Mesh(gUArm, armMat);
            rArmMesh.position.set( (W_TORSO + 0.0003), H_TORSO * 0.82, 0);
            mesh.add(rArmMesh);

            // Forearm is skin for football/basketball (short sleeves / sleeveless)
            const forearmMat = isCricket ? mats.body : sharedSkin;
            const lFArm = new THREE.Mesh(gFArm, forearmMat);
            lFArm.position.y = -UA_H;
            lArmMesh.add(lFArm);
            const rFArm = new THREE.Mesh(gFArm, forearmMat);
            rFArm.position.y = -UA_H;
            rArmMesh.add(rFArm);

            // Goalkeeper Neuer gets goalkeeper gloves!
            if (isFootball && p.id === 'gk') {
                const lGlove = new THREE.Mesh(gGlove, mats.sec);
                lGlove.position.set(0, -FA_H * 0.9, 0.0);
                lFArm.add(lGlove);
                const rGlove = new THREE.Mesh(gGlove, mats.sec);
                rGlove.position.set(0, -FA_H * 0.9, 0.0);
                rFArm.add(rGlove);
            }

            // ── Legs (thigh + shin + shoe) ──────────────────────────────────────────
            const lLegMesh = new THREE.Mesh(gThigh, mats.pants);
            lLegMesh.position.set(-W_WAIST * 0.75, 0, 0);
            mesh.add(lLegMesh);
            const rLegMesh = new THREE.Mesh(gThigh, mats.pants);
            rLegMesh.position.set( W_WAIST * 0.75, 0, 0);
            mesh.add(rLegMesh);

            const lShin = new THREE.Mesh(gShin, mats.pants);
            lShin.position.y = -THIGH_H;
            lLegMesh.add(lShin);
            const rShin = new THREE.Mesh(gShin, mats.pants);
            rShin.position.y = -THIGH_H;
            rLegMesh.add(rShin);

            // Shoes
            [lShin, rShin].forEach(sh => {
                const shoe = new THREE.Mesh(gShoe, sharedBlack);
                shoe.position.set(0, -SHIN_H * 0.9, 0.00015);
                sh.add(shoe);
            });

            // ── Role-specific extras & poses (NO CROSSED HANDS) ───────────────────────
            if (p.role === 'batsman') {
                // Leg pads
                [lShin, rShin].forEach(sh => {
                    const lp = new THREE.Mesh(gPad, sharedPad);
                    lp.position.set(0, -SHIN_H * 0.45, 0.000275);
                    sh.add(lp);
                });
                // Bat (blade + grip) oriented flat side to X-axis
                const bladeG = new THREE.BoxGeometry(0.00013, 0.0029, 0.000325);
                const blade  = new THREE.Mesh(bladeG, sharedWood);
                blade.position.y = 0.00145;
                const gripG  = new THREE.CylinderGeometry(0.0001, 0.0001, 0.0008, 5);
                const grip   = new THREE.Mesh(gripG, sharedBlack);
                grip.position.y = -0.00075;
                blade.add(grip);
                const batPivot = new THREE.Group();
                batPivot.add(blade);
                batPivot.position.set(W_TORSO * 0.9, H_TORSO * 0.35, W_TORSO * 0.7);
                batPivot.rotation.set(-Math.PI / 4.5, 0.15, Math.PI / 5.5);
                mesh.add(batPivot);

                // Natural athletic stance, arms not crossed
                lArmMesh.rotation.set(-Math.PI / 4,  0, -Math.PI / 12);
                rArmMesh.rotation.set(-Math.PI / 3,  0,  Math.PI / 12);
                lLegMesh.rotation.set( Math.PI / 9,  0, -Math.PI / 14);
                rLegMesh.rotation.set( Math.PI / 9,  0,  Math.PI / 14);
            } else if (p.role === 'fielder') {
                // Normal fielders (or soccer/basketball): arms at sides, not crossed
                lArmMesh.rotation.set(-Math.PI / 18,  0, -Math.PI / 10);
                rArmMesh.rotation.set(-Math.PI / 18,  0,  Math.PI / 10);
                lLegMesh.rotation.set( Math.PI / 11, 0, -Math.PI / 13);
                rLegMesh.rotation.set( Math.PI / 11, 0,  Math.PI / 13);
            } else {
                // Umpires and officials: neutral arms hanging naturally down
                lArmMesh.rotation.set( 0,  0, -Math.PI / 12);
                rArmMesh.rotation.set( 0,  0,  Math.PI / 12);
            }

            // ── Underfoot single ring (simplified) ────────────────────────────────────
            const ring = new THREE.Mesh(gRing, new THREE.MeshBasicMaterial({
                color: team === 'blue' ? 0xcc1111 : (team === 'yellow' ? 0xd90f55 : 0x1e88e5),
                transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false
            }));
            ring.position.y = 0.0005;
            playerGroup.add(ring);

            // ── Name tag & stats card ──────────────────────────────────────────────────
            const tag = this.createPlayerTag(p.name, p.jersey, p.team);
            playerGroup.add(tag);
            const statsCard = this.createPlayerStatsCard(p.name, p.primary, p.secondary, p.team, (p as any).rcbCardKey || "");
            playerGroup.add(statsCard);

            // ── 0.72× boundary + facing toward pitch center ────────────────────────────
            const FIELD_SCALE = 0.72;
            const sx = p.x * FIELD_SCALE;
            const sz = p.z * FIELD_SCALE;
            playerGroup.position.set(sx, 0.009, sz);
            // Rotate player to face pitch center (0,0) from their field position
            // atan2(-sx, -sz) gives the Y-rotation so +Z faces toward (0,0)
            if (sx !== 0 || sz !== 0) {
                playerGroup.rotation.y = Math.atan2(-sx, -sz);
            }

            this.players.push({
                id: p.id, name: p.name, role: p.role, jersey: p.jersey, team: p.team,
                originalBasePos: new THREE.Vector3(sx, 0.009, sz),
                targetPos:       new THREE.Vector3(sx, 0.009, sz),
                currentPos:      new THREE.Vector3(sx, 0.009, sz),
                speed: p.role === 'fielder' ? 0.005 : 0.001,
                stats: { primary: p.primary, secondary: p.secondary },
                group: playerGroup, mesh, ring, tag, statsCard,
                hoverScale: 1.0, isHovered: false
            });
        });
    }



    private createPlayerTag(name: string, jersey: string, team: 'blue' | 'yellow' | 'neutral'): THREE.Mesh {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        
        ctx.clearRect(0, 0, 256, 64);
        
        // Draw pill shape
        ctx.fillStyle = 'rgba(5, 5, 20, 0.8)';
        ctx.strokeStyle = team === 'blue' ? '#00ffff' : (team === 'yellow' ? '#ffff00' : '#ffffff');
        ctx.lineWidth = 4;
        
        const r = 20;
        const w = 246;
        const h = 54;
        const x = 5;
        const y = 5;
        
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
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${jersey} ${name}`, 128, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        
        const tagGeom = new THREE.PlaneGeometry(0.04, 0.01);
        const tagMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(tagGeom, tagMat);
        mesh.position.y = 0.025; // Float 2.5cm above base (above medium player body)
        return mesh;
    }

    /**
     * Creates the hover stats card for a player.
     * When rcbCardKey is provided, a portrait image card is created.
     * The RCB texture is applied lazily in the update loop because background-
     * priority assets may not be loaded yet at init time.
     */
    private createPlayerStatsCard(
        name: string,
        primary: string,
        secondary: string,
        team: 'blue' | 'yellow' | 'neutral',
        rcbCardKey: string = ""
    ): THREE.Group {
        const cardGroup = new THREE.Group();

        if (rcbCardKey) {
            // Portrait card geometry — 3:4 aspect ratio matches the JPEG
            const planeGeom = new THREE.PlaneGeometry(0.055, 0.0733);
            const planeMat = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            // Try to apply texture immediately (works if asset already cached)
            const cardTex = AssetManager.getTexture(rcbCardKey);
            if (cardTex) {
                cardTex.colorSpace = THREE.SRGBColorSpace;
                planeMat.map = cardTex;
            }

            const cardMesh = new THREE.Mesh(planeGeom, planeMat);
            const BASE_Y = 0.075;
            cardMesh.position.y = BASE_Y;
            cardMesh.position.z = 0.001; // offset forward
            cardMesh.userData.baseZ = 0.001;
            cardGroup.add(cardMesh); // Child[0]

            // Holographic B2B backing panel (Obsidian glass style)
            const backGeom = new THREE.PlaneGeometry(0.060, 0.0783);
            const backMat = new THREE.MeshBasicMaterial({
                color: 0x050c1c,
                transparent: true,
                opacity: 0.0, // Init to 0, synced in update()
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const backMesh = new THREE.Mesh(backGeom, backMat);
            backMesh.position.y = BASE_Y;
            backMesh.position.z = 0.0;
            backMesh.userData.baseZ = 0.0;
            backMesh.userData.baseOpacity = 0.82;
            cardGroup.add(backMesh);

            // Neon cyan wireframe border outline
            const borderGeom = new THREE.PlaneGeometry(0.061, 0.0793);
            const borderMat = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                wireframe: true,
                transparent: true,
                opacity: 0.0, // Init to 0, synced in update()
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const borderMesh = new THREE.Mesh(borderGeom, borderMat);
            borderMesh.position.y = BASE_Y;
            borderMesh.position.z = 0.0;
            borderMesh.userData.baseZ = 0.0;
            borderMesh.userData.baseOpacity = 0.45;
            cardGroup.add(borderMesh);

            // Golden corner brackets
            const goldMat = new THREE.MeshBasicMaterial({
                color: 0xffd700, // Gold
                transparent: true,
                opacity: 0.0, // Init to 0, synced in update()
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const cornerSize = 0.010;
            const thickness = 0.0012;
            const halfW = 0.0305;
            const halfH = 0.047;

            // Helper to add a small segment
            const addSegment = (w: number, h: number, x: number, y: number) => {
                const geom = new THREE.PlaneGeometry(w, h);
                const mesh = new THREE.Mesh(geom, goldMat);
                mesh.position.set(x, BASE_Y + y, 0.002);
                mesh.userData.baseZ = 0.002;
                mesh.userData.baseOpacity = 0.85;
                cardGroup.add(mesh);
            };

            // Top-Left corner
            addSegment(cornerSize, thickness, -halfW + cornerSize / 2, halfH - thickness / 2); // Horizontal
            addSegment(thickness, cornerSize, -halfW + thickness / 2, halfH - cornerSize / 2); // Vertical

            // Top-Right corner
            addSegment(cornerSize, thickness, halfW - cornerSize / 2, halfH - thickness / 2); // Horizontal
            addSegment(thickness, cornerSize, halfW - thickness / 2, halfH - cornerSize / 2); // Vertical

            // Bottom-Left corner
            addSegment(cornerSize, thickness, -halfW + cornerSize / 2, -halfH + thickness / 2); // Horizontal
            addSegment(thickness, cornerSize, -halfW + thickness / 2, -halfH + cornerSize / 2); // Vertical

            // Bottom-Right corner
            addSegment(cornerSize, thickness, halfW - cornerSize / 2, -halfH + thickness / 2); // Horizontal
            addSegment(thickness, cornerSize, halfW - thickness / 2, -halfH + cornerSize / 2); // Vertical

            // Store metadata for lazy loading and correct position lerp in update()
            cardGroup.userData.rcbCardKey = rcbCardKey;
            cardGroup.userData.baseY = BASE_Y;
            cardGroup.scale.set(0.5, 0.5, 0.5);
            return cardGroup;
        }

        // ── Fallback: procedural canvas text card ─────────────────────────────
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 192;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, 384, 192);

        ctx.fillStyle = 'rgba(2, 6, 26, 0.92)';
        ctx.strokeStyle = team === 'blue' ? '#00ffff' : (team === 'yellow' ? '#ffff00' : '#ffffff');
        ctx.lineWidth = 6;

        const r = 24;
        const w = 372;
        const h = 180;
        const x = 6;
        const y = 6;

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

        ctx.strokeStyle = team === 'blue' ? 'rgba(0, 255, 255, 0.4)' : (team === 'yellow' ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 25); ctx.lineTo(x + 10, y + 10); ctx.lineTo(x + 25, y + 10);
        ctx.moveTo(x + w - 25, y + h - 10); ctx.lineTo(x + w - 10, y + h - 10); ctx.lineTo(x + w - 10, y + h - 25);
        ctx.stroke();

        ctx.fillStyle = team === 'blue' ? '#00ffff' : (team === 'yellow' ? '#ffff00' : '#ffffff');
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(name.toUpperCase(), x + 30, y + 45);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(x + 30, y + 65);
        ctx.lineTo(x + w - 30, y + 65);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px monospace';
        ctx.fillText(primary, x + 30, y + 105);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '22px monospace';
        ctx.fillText(secondary, x + 30, y + 145);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const planeGeom = new THREE.PlaneGeometry(0.08, 0.04);
        const planeMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const cardMesh = new THREE.Mesh(planeGeom, planeMat);
        cardMesh.position.y = 0.045;
        cardGroup.add(cardMesh);

        cardGroup.scale.set(0.5, 0.5, 0.5);
        return cardGroup;
    }

    private initBallTracking() {
        // 1. Glowing Ball Mesh (small glowing sphere)
        const ballGeom = new THREE.SphereGeometry(0.003, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.0 }); // Start hidden
        this.activeBall = new THREE.Mesh(ballGeom, ballMat);
        this.tableGroup.add(this.activeBall);

        // 2. Trajectory Line (glowing neon trail)
        const trailGeom = new THREE.BufferGeometry();
        const trailMat = new THREE.LineBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.0,
            linewidth: 3
        });
        this.ballTrail = new THREE.Line(trailGeom, trailMat);
        this.tableGroup.add(this.ballTrail);

        // 3. Holographic Fireworks Particle System
        this.initFireworks();
    }

    private initFireworks() {
        const totalParticles = this.MAX_FIREWORKS * this.PARTICLES_PER_FIREWORK;
        
        // Re-initialize arrays dynamically to match constant values
        this.fireworkActive = new Uint8Array(this.MAX_FIREWORKS);
        this.fireworkAge = new Float32Array(this.MAX_FIREWORKS);
        this.fireworkMaxAge = new Float32Array(this.MAX_FIREWORKS);
        this.fireworkPositions = new Float32Array(this.MAX_FIREWORKS * 3);
        this.fireworkColors = new Uint32Array(this.MAX_FIREWORKS);
        this.particleVelocities = new Float32Array(totalParticles * 3);
        this.particleOffsets = new Float32Array(totalParticles * 3);
        this.particleColors = new Uint32Array(totalParticles);
        this.fireworkPhase = new Uint8Array(this.MAX_FIREWORKS);
        this.fireworkLaunchY = new Float32Array(this.MAX_FIREWORKS);
        this.fireworkTargetHeight = new Float32Array(this.MAX_FIREWORKS);
        this.fireworkLaunchVelocities = new Float32Array(this.MAX_FIREWORKS * 3);
        this.fireworkScale = new Float32Array(this.MAX_FIREWORKS);

        // Defined as tiny 1mm geometry for dense point/mist resolution
        const particleGeom = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const particleMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.fireworksMesh = new THREE.InstancedMesh(particleGeom, particleMat, totalParticles);
        this.fireworksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.fireworksMesh.instanceColor) {
            this.fireworksMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        // Initialize all matrices to scale = 0 so they don't render initially
        const dummy = new THREE.Object3D();
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        const white = new THREE.Color(0xffffff);
        for (let i = 0; i < totalParticles; i++) {
            this.fireworksMesh.setMatrixAt(i, dummy.matrix);
            this.fireworksMesh.setColorAt(i, white);
            this.particleColors[i] = 0xffffff;
        }

        if (this.fireworksMesh.instanceColor) {
            this.fireworksMesh.instanceColor.needsUpdate = true;
        }
        this.tableGroup.add(this.fireworksMesh);
    }

    private collectStadiumMaterials(mesh: THREE.Object3D) {
        mesh.traverse((child: any) => {
            if (child instanceof THREE.Mesh) {
                const name = child.name.toLowerCase();
                const parentName = child.parent ? child.parent.name.toLowerCase() : "";
                
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((mat) => {
                    if (mat instanceof THREE.MeshStandardMaterial) {
                        if (name.includes('stands') || name.includes('seating') || name.includes('seats') || parentName.includes('stands') || parentName.includes('seating') || parentName.includes('seats')) {
                            if (!this.standsOriginalColors.find(x => x.mat === mat)) {
                                this.standsOriginalColors.push({
                                    mat: mat,
                                    wireframe: mat.wireframe,
                                    emissiveHex: mat.emissive.getHex(),
                                    emissiveIntensity: mat.emissiveIntensity
                                });
                            }
                        }
                        if (name.includes('floodlight') || name.includes('light') || parentName.includes('floodlight') || parentName.includes('light')) {
                            if (!this.floodlightOriginalColors.find(x => x.mat === mat)) {
                                this.floodlightOriginalColors.push({
                                    mat: mat,
                                    emissiveHex: mat.emissive.getHex(),
                                    emissiveIntensity: mat.emissiveIntensity
                                });
                            }
                        }
                    }
                });
            }
        });
    }

    private initWeatherSystem() {
        // Rain particle box geometry (very thin vertical lines)
        const rainGeom = new THREE.BoxGeometry(0.0003, 0.0025, 0.0003);
        const rainMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.weatherMesh = new THREE.InstancedMesh(rainGeom, rainMat, this.MAX_WEATHER_PARTICLES);
        this.weatherMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.weatherMesh.instanceColor) {
            this.weatherMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        this.weatherMesh.visible = false;
        this.tableGroup.add(this.weatherMesh);

        const dummy = new THREE.Object3D();
        const white = new THREE.Color(0xffffff);
        for (let i = 0; i < this.MAX_WEATHER_PARTICLES; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.13;
            const px = Math.cos(angle) * r;
            const py = Math.random() * 0.16 + 0.009;
            const pz = Math.sin(angle) * r;

            this.weatherPositions[i * 3 + 0] = px;
            this.weatherPositions[i * 3 + 1] = py;
            this.weatherPositions[i * 3 + 2] = pz;

            this.weatherVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.005;
            this.weatherVelocities[i * 3 + 1] = -0.15 - Math.random() * 0.1;
            this.weatherVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;

            dummy.position.set(px, py, pz);
            dummy.scale.setScalar(0); // hide initially
            dummy.updateMatrix();
            this.weatherMesh.setMatrixAt(i, dummy.matrix);
            this.weatherMesh.setColorAt(i, white);
            this.weatherColors[i] = 0x00ffff;
        }
        this.weatherMesh.instanceMatrix.needsUpdate = true;
        if (this.weatherMesh.instanceColor) {
            this.weatherMesh.instanceColor.needsUpdate = true;
        }
    }

    private setWeatherMode(mode: 'off' | 'rain' | 'neon_dust') {
        this.weatherMode = mode;
        if (mode === 'off') {
            if (this.weatherMesh) this.weatherMesh.visible = false;
            return;
        }

        if (this.weatherMesh) {
            this.weatherMesh.visible = true;
            const white = new THREE.Color(0xffffff);
            const cyan = new THREE.Color(0x00ffff);

            for (let i = 0; i < this.MAX_WEATHER_PARTICLES; i++) {
                if (mode === 'rain') {
                    // Rain drops: fast vertical falling speed
                    this.weatherVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.005;
                    this.weatherVelocities[i * 3 + 1] = -0.15 - Math.random() * 0.1;
                    this.weatherVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
                    this.weatherMesh.setColorAt(i, cyan);
                } else {
                    // Neon dust (Snow): slow horizontal swirling
                    this.weatherVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.01;
                    this.weatherVelocities[i * 3 + 1] = -0.015 - Math.random() * 0.01; // slow drift
                    this.weatherVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
                    this.weatherMesh.setColorAt(i, white);
                }
            }

            if (this.weatherMesh.instanceColor) {
                this.weatherMesh.instanceColor.needsUpdate = true;
            }
        }
    }

    private initSandboxBall() {
        const ballGeom = new THREE.SphereGeometry(0.005, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.95
        });
        this.sandboxBall = new THREE.Mesh(ballGeom, ballMat);
        this.sandboxBall.position.set(0.0, 0.009, 0.0);
        this.sandboxBall.visible = false;
        this.tableGroup.add(this.sandboxBall);

        // Add a glowing halo ring to the sandbox ball
        const haloGeom = new THREE.RingGeometry(0.006, 0.008, 16);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const halo = new THREE.Mesh(haloGeom, haloMat);
        halo.rotation.x = -Math.PI / 2;
        this.sandboxBall.add(halo);
    }

    private createGoalPost(): THREE.Group {
        const group = new THREE.Group();
        
        // Standard goal post dimensions at stadium local scale:
        // Width: 0.016m (1.6cm), Height: 0.008m (0.8cm)
        const postMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        
        // Vertical post cylinders: radius 0.5mm, height 8mm
        const postGeom = new THREE.CylinderGeometry(0.0005, 0.0005, 0.008, 8);
        // Horizontal crossbar cylinder: radius 0.5mm, length 16mm
        const crossbarGeom = new THREE.CylinderGeometry(0.0005, 0.0005, 0.016, 8);
        
        const leftPost = new THREE.Mesh(postGeom, postMat);
        leftPost.position.set(-0.008, 0.004, 0.0);
        
        const rightPost = new THREE.Mesh(postGeom, postMat);
        rightPost.position.set(0.008, 0.004, 0.0);
        
        const crossbar = new THREE.Mesh(crossbarGeom, postMat);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0.0, 0.008, 0.0);
        
        // Dynamic glowing neon cyan wireframe net!
        const netGeom = new THREE.BoxGeometry(0.016, 0.008, 0.006);
        const netWire = new THREE.EdgesGeometry(netGeom);
        const netMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.45
        });
        const netMesh = new THREE.LineSegments(netWire, netMat);
        netMesh.position.set(0.0, 0.004, -0.003); // extend backward
        
        group.add(leftPost, rightPost, crossbar, netMesh);
        return group;
    }

    private createBasketballHoop(): THREE.Group {
        const group = new THREE.Group();
        
        // Post support (slender, tilted)
        const postGeom = new THREE.CylinderGeometry(0.0005, 0.0005, 0.016, 8);
        const postMat = new THREE.MeshBasicMaterial({ color: 0x1f2937 });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(0, 0.008, -0.003);
        post.rotation.x = -Math.PI / 16;
        group.add(post);

        // Backboard: glass board
        const boardGeom = new THREE.BoxGeometry(0.015, 0.009, 0.0006);
        const boardMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        const board = new THREE.Mesh(boardGeom, boardMat);
        board.position.set(0, 0.015, -0.002);
        group.add(board);

        // Backboard orange border outline
        const boardBorderGeom = new THREE.EdgesGeometry(boardGeom);
        const boardBorderMat = new THREE.LineBasicMaterial({ color: 0xf97316 });
        const boardBorder = new THREE.LineSegments(boardBorderGeom, boardBorderMat);
        boardBorder.position.copy(board.position);
        group.add(boardBorder);

        // Rim: neon orange ring Torus
        const rimGeom = new THREE.TorusGeometry(0.0025, 0.0002, 8, 16);
        const rimMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
        const rim = new THREE.Mesh(rimGeom, rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, 0.0125, 0.001);
        group.add(rim);

        // Net: cyber cyan wireframe net
        const netGeom = new THREE.CylinderGeometry(0.0025, 0.0015, 0.004, 12, 1, true);
        const netWire = new THREE.EdgesGeometry(netGeom);
        const netMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.65
        });
        const netMesh = new THREE.LineSegments(netWire, netMat);
        netMesh.position.set(0, 0.0105, 0.001);
        group.add(netMesh);

        // Reference internal meshes
        (group as any).netMesh = netMesh;
        (group as any).rimMesh = rim;

        return group;
    }

    private initSportSequenceSystem() {
        // Create parent group for sports sequences props
        this.sportPropsGroup = new THREE.Group();
        this.tableGroup.add(this.sportPropsGroup);

        // --- 1. CRICKET PROPS (default) ---
        // Neon green Wickets/Stumps group (Aligned side-by-side along Z-axis!)
        const stumpsGroup = new THREE.Group();
        const stumpGeom = new THREE.CylinderGeometry(0.0002, 0.0002, 0.006, 8);
        const stumpMat = new THREE.MeshBasicMaterial({
            color: 0x00ff66,
            transparent: true,
            opacity: 0.85
        });
        const s1 = new THREE.Mesh(stumpGeom, stumpMat); s1.position.set(0, 0.003, -0.0012);
        const s2 = new THREE.Mesh(stumpGeom, stumpMat); s2.position.set(0, 0.003, 0);
        const s3 = new THREE.Mesh(stumpGeom, stumpMat); s3.position.set(0, 0.003, 0.0012);
        // Bail on top
        const bailGeom = new THREE.BoxGeometry(0.0002, 0.0002, 0.003);
        const bail = new THREE.Mesh(bailGeom, stumpMat); bail.position.set(0, 0.006, 0);
        stumpsGroup.add(s1, s2, s3, bail);
        stumpsGroup.position.set(0.045, 0.009, 0);
        this.cricketStumpsMesh = stumpsGroup;
        this.sportPropsGroup.add(this.cricketStumpsMesh);

        // Neon gold wooden bat group (Flat side facing X-axis!)
        const batGroup = new THREE.Group();
        const bladeGeom = new THREE.BoxGeometry(0.0004, 0.007, 0.0015);
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0xe2af37,
            roughness: 0.25,
            metalness: 0.1
        });
        const blade = new THREE.Mesh(bladeGeom, bladeMat);
        blade.position.y = 0.0035;
        const handleGeom = new THREE.CylinderGeometry(0.0002, 0.0002, 0.003, 8);
        const handleMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const handle = new THREE.Mesh(handleGeom, handleMat);
        handle.position.y = 0.0085;
        batGroup.add(blade, handle);
        batGroup.position.set(0.035, 0.009, 0);
        this.cricketBatMesh = batGroup;
        this.sportPropsGroup.add(this.cricketBatMesh);

        // --- 2. SEQUENCE BALL & TRAIL ---
        const ballGeom = new THREE.SphereGeometry(0.002, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        this.sequenceBall = new THREE.Mesh(ballGeom, ballMat);
        this.sequenceBall.visible = false;
        this.tableGroup.add(this.sequenceBall);

        const trailGeom = new THREE.BufferGeometry();
        const trailMat = new THREE.LineBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.0,
            linewidth: 3,
            depthWrite: false
        });
        this.sequenceBallTrail = new THREE.Line(trailGeom, trailMat);
        this.sequenceBallTrail.visible = false;
        this.tableGroup.add(this.sequenceBallTrail);

        // --- 3. DYNAMIC AR CELEBRATION BANNERS ---
        this.sportCelebrationCard = new THREE.Group();
        this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.075, 0.0);
        this.sportCelebrationCard.visible = false;
        this.sportCelebrationCard.renderOrder = 999;
        this.tableGroup.add(this.sportCelebrationCard);

        // Glass backing card
        const cardBackGeom = new THREE.BoxGeometry(0.09, 0.045, 0.002);
        const cardBackMat = new THREE.MeshBasicMaterial({
            color: 0x030712,
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });
        const cardBack = new THREE.Mesh(cardBackGeom, cardBackMat);
        cardBack.renderOrder = 999;
        this.sportCelebrationCard.add(cardBack);

        // Glowing border outline
        const cardBorderGeom = new THREE.EdgesGeometry(cardBackGeom);
        const cardBorderMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
        const cardBorder = new THREE.LineSegments(cardBorderGeom, cardBorderMat);
        cardBorder.renderOrder = 1000;
        this.sportCelebrationCard.add(cardBorder);

        // Draw Canvas texture
        this.celebrationCardCanvas = document.createElement('canvas');
        this.celebrationCardCanvas.width = 256;
        this.celebrationCardCanvas.height = 128;
        this.celebrationCardCtx = this.celebrationCardCanvas.getContext('2d')!;
        
        this.sportCelebrationTexture = new THREE.CanvasTexture(this.celebrationCardCanvas);
        this.sportCelebrationTexture.colorSpace = THREE.SRGBColorSpace;
        
        this.sportCelebrationCardMat = new THREE.MeshBasicMaterial({
            map: this.sportCelebrationTexture,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const cardPlaneGeom = new THREE.PlaneGeometry(0.088, 0.043);
        const cardPlane = new THREE.Mesh(cardPlaneGeom, this.sportCelebrationCardMat);
        cardPlane.position.z = 0.0015;
        cardPlane.renderOrder = 1000;
        this.sportCelebrationCard.add(cardPlane);

        // --- 4. DUAL-RING HOLOGRAPHIC PROJECTOR GLOW DISK ---
        const projGroup = new THREE.Group();
        this.ballProjectorDiskMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // Inner glowing core
        const innerGeom = new THREE.CircleGeometry(0.0018, 16);
        const innerMesh = new THREE.Mesh(innerGeom, this.ballProjectorDiskMat);
        projGroup.add(innerMesh);

        // Outer thin telemetry ring
        const outerGeom = new THREE.RingGeometry(0.0042, 0.005, 32);
        const outerMesh = new THREE.Mesh(outerGeom, this.ballProjectorDiskMat);
        projGroup.add(outerMesh);

        projGroup.rotation.x = -Math.PI / 2;
        projGroup.visible = false;
        this.ballProjectorDisk = projGroup;
        this.tableGroup.add(this.ballProjectorDisk);
    }

    private triggerFirework(
        x: number,
        y: number,
        z: number,
        colorHex: number,
        targetHeight: number = 0.02,
        vx: number = 0.0,
        vy: number = 0.09,
        vz: number = 0.0,
        scale: number = 1.0
    ) {
        let slot = -1;
        for (let i = 0; i < this.MAX_FIREWORKS; i++) {
            if (this.fireworkActive[i] === 0) {
                slot = i;
                break;
            }
        }

        if (slot === -1) {
            let oldestVal = -1;
            let oldestSlot = 0;
            for (let i = 0; i < this.MAX_FIREWORKS; i++) {
                if (this.fireworkAge[i] > oldestVal) {
                    oldestVal = this.fireworkAge[i];
                    oldestSlot = i;
                }
            }
            slot = oldestSlot;
        }

        this.fireworkActive[slot] = 1;
        this.fireworkAge[slot] = 0.0;
        this.fireworkPhase[slot] = 0; // Starts as rising rocket shell (fizzing ball)
        this.fireworkLaunchY[slot] = y;
        this.fireworkTargetHeight[slot] = targetHeight;
        this.fireworkPositions[slot * 3 + 0] = x;
        this.fireworkPositions[slot * 3 + 1] = y;
        this.fireworkPositions[slot * 3 + 2] = z;
        this.fireworkColors[slot] = colorHex;
        this.fireworkLaunchVelocities[slot * 3 + 0] = vx;
        this.fireworkLaunchVelocities[slot * 3 + 1] = vy;
        this.fireworkLaunchVelocities[slot * 3 + 2] = vz;
        this.fireworkScale[slot] = scale;
    }

    private updateFireworks(dt: number) {
        if (!this.fireworksMesh) return;

        let needsMatrixUpdate = false;
        let needsColorUpdate = false;

        const GRAVITY = 0.05; // gentle downward gravity in burst phase
        const DRAG = Math.pow(0.93, dt * 90); // atmospheric friction drag for fine mist expansion

        for (let i = 0; i < this.MAX_FIREWORKS; i++) {
            const startPIdx = i * this.PARTICLES_PER_FIREWORK;

            if (this.fireworkActive[i] === 1) {
                this.fireworkAge[i] += dt;
                const age = this.fireworkAge[i];

                if (this.fireworkPhase[i] === 0) {
                    // ─── PHASE 0: RISING ROCKET tracer (fizzing ball) ───
                    const originX = this.fireworkPositions[i * 3 + 0];
                    const originY = this.fireworkPositions[i * 3 + 1];
                    const originZ = this.fireworkPositions[i * 3 + 2];
                    const vx = this.fireworkLaunchVelocities[i * 3 + 0];
                    const vy = this.fireworkLaunchVelocities[i * 3 + 1];
                    const vz = this.fireworkLaunchVelocities[i * 3 + 2];

                    // Project coordinates along the 3D launch velocity vector
                    const px_curr = originX + vx * age;
                    const py_curr = originY + vy * age;
                    const pz_curr = originZ + vz * age;

                    // Calculate total travel distance
                    const travelDist = Math.sqrt((vx * age) ** 2 + (vy * age) ** 2 + (vz * age) ** 2);
                    const threshold = this.fireworkTargetHeight[i];

                    // Burst after exactly targetHeight meters of travel distance
                    if (travelDist >= threshold) {
                        this.fireworkPhase[i] = 1; // Transition to burst phase
                        this.fireworkAge[i] = 0.0; // Reset age for particle lifecycle
                        this.fireworkMaxAge[i] = 0.7 + Math.random() * 0.4; // burst duration 0.7s to 1.1s
                        
                        // Capture coordinates of the burst center
                        this.fireworkPositions[i * 3 + 0] = px_curr;
                        this.fireworkPositions[i * 3 + 1] = py_curr;
                        this.fireworkPositions[i * 3 + 2] = pz_curr;
                        const colorHex = this.fireworkColors[i];

                        // Define beautiful secondary/accent particle colors for maximum realism
                        const colors = [0xff0055, 0x00ffff, 0xffff00, 0xff3300, 0x00ff66, 0xff00ff, 0xffaa00, 0x00aaff];

                        // Generate spherical velocities for all particles originating at burst center
                        for (let j = 0; j < this.PARTICLES_PER_FIREWORK; j++) {
                            const pIdx = startPIdx + j;
                            
                            // Reset offsets at center
                            this.particleOffsets[pIdx * 3 + 0] = 0;
                            this.particleOffsets[pIdx * 3 + 1] = 0;
                            this.particleOffsets[pIdx * 3 + 2] = 0;

                            const theta = Math.random() * Math.PI * 2;
                            const phi = Math.acos(Math.random() * 2.0 - 1.0); // full sphere distribution
                            
                            // Fine density: spread particles like high-speed mist
                            const isOuterShell = Math.random() > 0.35;
                            const baseSpeed = isOuterShell ? (0.065 + Math.random() * 0.04) : (0.02 + Math.random() * 0.03);
                            
                            // Scale the particle velocity speed by the firework's burst scale multiplier
                            const fScale = this.fireworkScale[i];
                            const speed = baseSpeed * (0.8 + Math.random() * 0.4) * fScale; // chaotic dispersion

                            this.particleVelocities[pIdx * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
                            this.particleVelocities[pIdx * 3 + 1] = speed * Math.cos(phi);
                            this.particleVelocities[pIdx * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);

                            // Staggered complementary palette styling
                            let pCol = colorHex;
                            if (Math.random() > 0.5) {
                                if (colorHex === 0xff6600) pCol = 0xff00ff;
                                else if (colorHex === 0xffff00) pCol = 0xff3300;
                                else if (colorHex === 0x00ff66) pCol = 0x00ffff;
                                else if (colorHex === 0xff3333) pCol = 0xffaa00;
                                else {
                                    pCol = colors[Math.floor(Math.random() * colors.length)];
                                }
                            }
                            this.particleColors[pIdx] = pCol;
                        }
                    } else {
                        // Render tight, fizzing rocket tracer shell (dense bundle of tiny particles)
                        const colorHex = this.fireworkColors[i];
                        this.fireworkColorObj.setHex(colorHex);

                        for (let j = 0; j < this.PARTICLES_PER_FIREWORK; j++) {
                            const pIdx = startPIdx + j;
                            
                            // Fizzing noise (2.0mm radius max)
                            const theta = Math.random() * Math.PI * 2;
                            const r = Math.random() * 0.002; 
                            const px = px_curr + Math.cos(theta) * r;
                            const py = py_curr + (Math.random() - 0.5) * 0.002;
                            const pz = pz_curr + Math.sin(theta) * r;

                            this.fireworkDummy.position.set(px, py, pz);
                            // Rocket particles are tiny (1.2mm scale relative to 1mm geometry)
                            const scale = 1.2 * (0.8 + Math.random() * 0.4);
                            this.fireworkDummy.scale.setScalar(scale);
                            this.fireworkDummy.updateMatrix();

                            this.fireworksMesh.setMatrixAt(pIdx, this.fireworkDummy.matrix);
                            this.fireworksMesh.setColorAt(pIdx, this.fireworkColorObj);
                        }
                        needsMatrixUpdate = true;
                        needsColorUpdate = true;
                    }
                } else {
                    // ─── PHASE 1: BURST SHOWER ───
                    const maxAge = this.fireworkMaxAge[i];

                    if (age >= maxAge) {
                        this.fireworkActive[i] = 0;
                        this.fireworkDummy.scale.setScalar(0);
                        this.fireworkDummy.updateMatrix();
                        for (let j = 0; j < this.PARTICLES_PER_FIREWORK; j++) {
                            this.fireworksMesh.setMatrixAt(startPIdx + j, this.fireworkDummy.matrix);
                        }
                        needsMatrixUpdate = true;
                    } else {
                        const t = age / maxAge;
                        const originX = this.fireworkPositions[i * 3 + 0];
                        const originY = this.fireworkPositions[i * 3 + 1];
                        const originZ = this.fireworkPositions[i * 3 + 2];
                        const fScale = this.fireworkScale[i];

                        for (let j = 0; j < this.PARTICLES_PER_FIREWORK; j++) {
                            const pIdx = startPIdx + j;

                            // Physics
                            this.particleVelocities[pIdx * 3 + 1] -= GRAVITY * dt;
                            this.particleVelocities[pIdx * 3 + 0] *= DRAG;
                            this.particleVelocities[pIdx * 3 + 1] *= DRAG;
                            this.particleVelocities[pIdx * 3 + 2] *= DRAG;

                            this.particleOffsets[pIdx * 3 + 0] += this.particleVelocities[pIdx * 3 + 0] * dt;
                            this.particleOffsets[pIdx * 3 + 1] += this.particleVelocities[pIdx * 3 + 1] * dt;
                            this.particleOffsets[pIdx * 3 + 2] += this.particleVelocities[pIdx * 3 + 2] * dt;

                            const px = originX + this.particleOffsets[pIdx * 3 + 0];
                            const py = originY + this.particleOffsets[pIdx * 3 + 1];
                            const pz = originZ + this.particleOffsets[pIdx * 3 + 2];

                            this.fireworkDummy.position.set(px, py, pz);
                            
                            // Fine mist rendering: apply scale multiplier to physical particle scale
                            const scaleVar = 0.8 + (j % 4) * 0.15; // 0.8 to 1.25
                            const scale = 1.0 * (1.0 - t) * scaleVar * Math.min(1.5, fScale); 
                            this.fireworkDummy.scale.setScalar(scale);
                            this.fireworkDummy.updateMatrix();

                            this.fireworkColorObj.setHex(this.particleColors[pIdx]);
                            
                            let intensity = 1.0 - t;
                            if (t > 0.4) {
                                // Shimmering/twinkling crackle frequency
                                const shimmer = Math.sin(age * 65.0 + j * 23.0) * 0.5 + 0.5;
                                intensity *= shimmer;
                            }
                            this.fireworkColorObj.multiplyScalar(intensity);

                            this.fireworksMesh.setMatrixAt(pIdx, this.fireworkDummy.matrix);
                            this.fireworksMesh.setColorAt(pIdx, this.fireworkColorObj);
                        }
                        needsMatrixUpdate = true;
                        needsColorUpdate = true;
                    }
                }
            }
        }

        if (needsMatrixUpdate) {
            this.fireworksMesh.instanceMatrix.needsUpdate = true;
        }
        if (needsColorUpdate && this.fireworksMesh.instanceColor) {
            this.fireworksMesh.instanceColor.needsUpdate = true;
        }
    }

    private updateWeather(dt: number) {
        if (!this.weatherMesh) return;

        if (this.weatherMode === 'off') {
            if (this.weatherMesh.visible) {
                this.weatherMesh.visible = false;
                if (this.isLightningStriking) {
                    this.isLightningStriking = false;
                    this.standsOriginalColors.forEach(c => {
                        c.mat.wireframe = c.wireframe;
                        c.mat.emissive.setHex(c.emissiveHex);
                        c.mat.emissiveIntensity = c.emissiveIntensity;
                    });
                    this.floodlightOriginalColors.forEach(c => {
                        c.mat.emissive.setHex(c.emissiveHex);
                        c.mat.emissiveIntensity = c.emissiveIntensity;
                    });
                }
            }
            return;
        }

        this.weatherMesh.visible = true;
        this.lightningTimer += dt;

        // --- Handle Sheet Lightning flash cycle ---
        if (this.lightningTimer >= this.lightningNextStrikeTime) {
            this.lightningTimer = 0.0;
            this.isLightningStriking = true;
            this.lightningStrikeDuration = 0.15; // flash lasts 150ms
            this.lightningNextStrikeTime = 6.0 + Math.random() * 8.0;

            this.floodlightOriginalColors.forEach(c => {
                c.mat.emissive.setHex(0x00ffff);
                c.mat.emissiveIntensity = 5.0;
            });
            this.standsOriginalColors.forEach(c => {
                c.mat.wireframe = true;
                c.mat.emissive.setHex(0x00aaff);
                c.mat.emissiveIntensity = 2.5;
            });
        }

        if (this.isLightningStriking) {
            this.lightningStrikeDuration -= dt;
            if (this.lightningStrikeDuration <= 0.0) {
                this.isLightningStriking = false;
                this.floodlightOriginalColors.forEach(c => {
                    c.mat.emissive.setHex(c.emissiveHex);
                    c.mat.emissiveIntensity = c.emissiveIntensity;
                });
                this.standsOriginalColors.forEach(c => {
                    c.mat.wireframe = c.wireframe;
                    c.mat.emissive.setHex(c.emissiveHex);
                    c.mat.emissiveIntensity = c.emissiveIntensity;
                });
            }
        }

        // --- Animate falling/drifting instanced weather particles ---
        const dummy = new THREE.Object3D();
        const cyan = new THREE.Color(0x00ffff);
        const colorObj = new THREE.Color();
        const dustColors = [0xff00ff, 0x00ffff, 0xffaa00]; // Magenta, Cyan, Gold dust

        for (let i = 0; i < this.MAX_WEATHER_PARTICLES; i++) {
            let px = this.weatherPositions[i * 3 + 0];
            let py = this.weatherPositions[i * 3 + 1];
            let pz = this.weatherPositions[i * 3 + 2];

            const vx = this.weatherVelocities[i * 3 + 0];
            const vy = this.weatherVelocities[i * 3 + 1];
            const vz = this.weatherVelocities[i * 3 + 2];

            px += vx * dt;
            py += vy * dt;
            pz += vz * dt;

            if (py <= 0.009) {
                py = 0.16 + Math.random() * 0.02;
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * 0.13;
                px = Math.cos(angle) * r;
                pz = Math.sin(angle) * r;
            }

            this.weatherPositions[i * 3 + 0] = px;
            this.weatherPositions[i * 3 + 1] = py;
            this.weatherPositions[i * 3 + 2] = pz;

            dummy.position.set(px, py, pz);

            if (this.weatherMode === 'rain') {
                dummy.scale.set(1.0, 1.0, 1.0);
                dummy.updateMatrix();
                this.weatherMesh.setMatrixAt(i, dummy.matrix);
                this.weatherMesh.setColorAt(i, cyan);
            } else if (this.weatherMode === 'neon_dust') {
                this.weatherVelocities[i * 3 + 0] = Math.sin(this.radarTime * 2.0 + i) * 0.02;
                this.weatherVelocities[i * 3 + 1] = -0.015 - Math.random() * 0.01;
                this.weatherVelocities[i * 3 + 2] = Math.cos(this.radarTime * 2.0 + i) * 0.02;

                dummy.scale.set(1.0, 0.2, 1.0); // 50% smaller (was 2.0, 0.4, 2.0)
                dummy.updateMatrix();
                this.weatherMesh.setMatrixAt(i, dummy.matrix);
                
                colorObj.setHex(0xffffff); // Pure white snow
                this.weatherMesh.setColorAt(i, colorObj);
            }
        }

        this.weatherMesh.instanceMatrix.needsUpdate = true;
        if (this.weatherMesh.instanceColor) {
            this.weatherMesh.instanceColor.needsUpdate = true;
        }
    }

    private updateSandboxBall(dt: number) {
        if (!this.isSandboxBallActive) {
            this.sandboxBall.visible = false;
            return;
        }

        this.sandboxBall.visible = true;

        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        const leftPinch = this.getIndexPinchData('left', leftTip);
        const rightPinch = this.getIndexPinchData('right', rightTip);

        const ballWorldPos = new THREE.Vector3();
        this.sandboxBall.getWorldPosition(ballWorldPos);

        // --- Grabbing state check ---
        if (!this.isSandboxBallGrabbed) {
            let grabHand: 'left' | 'right' | null = null;
            if (leftPinch && leftTip.distanceTo(ballWorldPos) < 0.04) {
                grabHand = 'left';
            } else if (rightPinch && rightTip.distanceTo(ballWorldPos) < 0.04) {
                grabHand = 'right';
            }

            if (grabHand) {
                this.isSandboxBallGrabbed = true;
                this.lastGrabPos.copy(grabHand === 'left' ? leftTip : rightTip);
                this.sandboxBallVel.set(0, 0, 0);
            }
        }

        if (this.isSandboxBallGrabbed) {
            const isLeftGrab = leftPinch && leftTip.distanceTo(ballWorldPos) < 0.08;
            const isRightGrab = rightPinch && rightTip.distanceTo(ballWorldPos) < 0.08;
            
            if (!isLeftGrab && !isRightGrab) {
                this.isSandboxBallGrabbed = false;
                this.sandboxBallVel.multiplyScalar(1.4);
            } else {
                const targetHandPos = isLeftGrab ? leftTip : rightTip;
                const localHandPos = targetHandPos.clone().applyMatrix4(this.tableGroup.matrixWorld.clone().invert());
                
                const instVel = new THREE.Vector3().subVectors(localHandPos, this.sandboxBall.position).multiplyScalar(1.0 / Math.max(dt, 0.001));
                this.sandboxBallVel.lerp(instVel, 0.35);

                this.sandboxBall.position.copy(localHandPos);
                
                const halo = this.sandboxBall.children[0];
                if (halo) halo.rotation.z += dt * 5.0;
            }
        } else {
            // --- Euler physics simulation ---
            const GRAVITY = 0.45;
            const floorY = this.getFloorY();
            const ballRadius = 0.0022 * this.sandboxBall.scale.x;
            const limitY = floorY + ballRadius;
            const RESTITUTION = 0.65;
            const DAMPING = Math.pow(0.992, dt * 90);

            this.sandboxBallVel.y -= GRAVITY * dt;
            this.sandboxBallVel.multiplyScalar(DAMPING);

            this.sandboxBall.position.addScaledVector(this.sandboxBallVel, dt);

            // --- Bound Bouncing solver ---
            if (this.sandboxBall.position.y <= limitY) {
                this.sandboxBall.position.y = limitY;
                this.sandboxBallVel.y = Math.abs(this.sandboxBallVel.y) * RESTITUTION;
                this.sandboxBallVel.x *= RESTITUTION;
                this.sandboxBallVel.z *= RESTITUTION;

                if (Math.abs(this.sandboxBallVel.y) > 0.02) {
                    this.triggerFirework(
                        this.sandboxBall.position.x, limitY, this.sandboxBall.position.z, 
                        0xffaa00, 0.012, 0.0, 0.04, 0.0, 0.6
                    );
                }
            }

            const bx = this.sandboxBall.position.x;
            const bz = this.sandboxBall.position.z;
            const stType = this.currentStadiumType;

            if (stType === 'berlin') {
                const R = 0.13;
                const dist = Math.sqrt(bx * bx + bz * bz);
                if (dist >= R) {
                    const nx = bx / dist;
                    const nz = bz / dist;
                    const dot = this.sandboxBallVel.x * nx + this.sandboxBallVel.z * nz;
                    this.sandboxBallVel.x -= 2 * dot * nx * RESTITUTION;
                    this.sandboxBallVel.z -= 2 * dot * nz * RESTITUTION;

                    this.sandboxBall.position.x = nx * (R - 0.001);
                    this.sandboxBall.position.z = nz * (R - 0.001);

                    if (this.sandboxBallVel.lengthSq() > 0.0005) {
                        this.triggerFirework(bx, this.sandboxBall.position.y, bz, 0x22d3ee, 0.012, 0.0, 0.03, 0.0, 0.6);
                    }
                }
            } else if (stType === 'inuit') {
                const RX = 0.14, RZ = 0.11;
                const ellipse = (bx * bx) / (RX * RX) + (bz * bz) / (RZ * RZ);
                if (ellipse >= 1.0) {
                    const nx = (2 * bx) / (RX * RX);
                    const nz = (2 * bz) / (RZ * RZ);
                    const len = Math.sqrt(nx * nx + nz * nz) || 1.0;
                    const nnx = nx / len;
                    const nnz = nz / len;
                    const dot = this.sandboxBallVel.x * nnx + this.sandboxBallVel.z * nnz;
                    this.sandboxBallVel.x -= 2 * dot * nnx * RESTITUTION;
                    this.sandboxBallVel.z -= 2 * dot * nnz * RESTITUTION;

                    const s = 0.999 / Math.sqrt(ellipse);
                    this.sandboxBall.position.x = bx * s;
                    this.sandboxBall.position.z = bz * s;

                    if (this.sandboxBallVel.lengthSq() > 0.0005) {
                        this.triggerFirework(bx, this.sandboxBall.position.y, bz, 0xf97316, 0.012, 0.0, 0.03, 0.0, 0.6);
                    }
                }
            } else {
                const R = 0.12;
                const dist = Math.sqrt(bx * bx + bz * bz);
                if (dist >= R) {
                    const nx = bx / dist;
                    const nz = bz / dist;
                    const dot = this.sandboxBallVel.x * nx + this.sandboxBallVel.z * nz;
                    this.sandboxBallVel.x -= 2 * dot * nx * RESTITUTION;
                    this.sandboxBallVel.z -= 2 * dot * nz * RESTITUTION;

                    this.sandboxBall.position.x = nx * (R - 0.001);
                    this.sandboxBall.position.z = nz * (R - 0.001);

                    if (this.sandboxBallVel.lengthSq() > 0.0005) {
                        this.triggerFirework(bx, this.sandboxBall.position.y, bz, 0xff0055, 0.012, 0.0, 0.03, 0.0, 0.6);
                    }
                }
            }
        }
    }

    private initTrackingButtons() {
        // --- 1. CORE DOCK Hexagonal/Cylinder Launcher Button on Stadium Rim ---
        // Placed at the front-center of the roof rim (angle = 0)
        const launcherGroup = new THREE.Group();
        launcherGroup.position.set(0.0, this.ROOF_Y, this.ROOF_RADIUS);
        launcherGroup.rotation.y = Math.PI; // Face the player
        this.tableGroup.add(launcherGroup);

        const launcherGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.004, 32);
        this.tcdLauncherMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        });
        this.tcdLauncherButton = new THREE.Mesh(launcherGeom, this.tcdLauncherMat);
        this.tcdLauncherButton.rotation.x = Math.PI / 2; // Lie flat/tilted on rim
        launcherGroup.add(this.tcdLauncherButton);

        // Glowing Canvas Label on launcher
        const launchCanvas = document.createElement('canvas');
        launchCanvas.width = 192;
        launchCanvas.height = 64;
        const lCtx = launchCanvas.getContext('2d')!;
        lCtx.clearRect(0, 0, 192, 64);
        lCtx.fillStyle = 'rgba(2, 6, 26, 0.94)';
        lCtx.fillRect(0, 0, 192, 64);
        lCtx.strokeStyle = '#00ffff';
        lCtx.lineWidth = 5;
        lCtx.strokeRect(3, 3, 186, 58);
        lCtx.fillStyle = '#ffffff';
        lCtx.font = 'bold 20px monospace';
        lCtx.textAlign = 'center';
        lCtx.textBaseline = 'middle';
        lCtx.fillText("CORE DOCK", 96, 32);

        const lTex = new THREE.CanvasTexture(launchCanvas);
        lTex.colorSpace = THREE.SRGBColorSpace;
        lTex.needsUpdate = true;

        const lLabelGeom = new THREE.PlaneGeometry(0.02, 0.0075);
        const lLabelMat = new THREE.MeshBasicMaterial({
            map: lTex,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const lLabelMesh = new THREE.Mesh(lLabelGeom, lLabelMat);
        lLabelMesh.position.set(0.0, 0.006, 0.002);
        launcherGroup.add(lLabelMesh);

        // --- 2. Floating TCD Command Dock Panel Group ---
        this.tcdPanelGroup = new THREE.Group();
        this.tcdPanelGroup.position.set(0.0, this.ROOF_Y + 0.045, this.ROOF_RADIUS);
        this.tcdPanelGroup.visible = false;
        this.tableGroup.add(this.tcdPanelGroup);

        // Obsidian glass backing plane
        const backplaneGeom = new THREE.BoxGeometry(0.096, 0.065, 0.002);
        const backplaneMat = new THREE.MeshBasicMaterial({
            color: 0x030712,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        const backplane = new THREE.Mesh(backplaneGeom, backplaneMat);
        this.tcdPanelGroup.add(backplane);

        // Glowing cyan outline border
        const borderGeom = new THREE.EdgesGeometry(backplaneGeom);
        const borderMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        const border = new THREE.LineSegments(borderGeom, borderMat);
        this.tcdPanelGroup.add(border);

        // --- 3. Grid of 7 TCD Action Buttons ---
        const tcdButtonConfigs = [
            { label: "KOHLI",  color: 0x00ffff,  x: -0.026, y: 0.016 },
            { label: "SHARMA", color: 0xffff00,  x: 0.0,    y: 0.016 },
            { label: "SCOOP",  color: 0x00ff66,  x: 0.026,  y: 0.016 },
            { label: "Play SEQ", color: 0xff00ff,  x: -0.026, y: 0.001 },
            { label: "STORM",  color: 0x6366f1,  x: 0.0,    y: 0.001 },
            { label: "NAVIG",  color: 0xff5500,  x: 0.026,  y: 0.001 },
            { label: "CLEAR",  color: 0xff3333,  x: 0.0,    y: -0.014 }
        ];

        const btnGeom = new THREE.BoxGeometry(0.022, 0.011, 0.003);

        tcdButtonConfigs.forEach((cfg, idx) => {
            const btnGroup = new THREE.Group();
            btnGroup.position.set(cfg.x, cfg.y, 0.002);
            this.tcdPanelGroup.add(btnGroup);

            const bMat = new THREE.MeshBasicMaterial({
                color: cfg.color,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            });
            const btnMesh = new THREE.Mesh(btnGeom, bMat);
            btnGroup.add(btnMesh);
            this.tcdButtons.push(btnMesh);
            this.tcdButtonMats.push(bMat);

            // Canvas Text Label
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, 128, 64);
            ctx.fillStyle = 'rgba(2, 6, 26, 0.94)';
            ctx.fillRect(0, 0, 128, 64);
            
            const hexStr = '#' + cfg.color.toString(16).padStart(6, '0');
            ctx.strokeStyle = hexStr;
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 124, 60);

            ctx.fillStyle = '#ffffff';
            if (cfg.label.length > 6) {
                ctx.font = 'bold 15px monospace';
            } else {
                ctx.font = 'bold 20px monospace';
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cfg.label, 64, 32);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;

            const labelGeom = new THREE.PlaneGeometry(0.02, 0.009);
            const labelMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const labelMesh = new THREE.Mesh(labelGeom, labelMat);
            labelMesh.position.set(0.0, 0.0, 0.0025);
            btnGroup.add(labelMesh);
            this.tcdButtonLabels.push(labelMesh);
        });

        // ─── 3D Score Display – curved arc beside the buttons ─────────────────
        // Placed on the opposite arc segment (score display on the back half of roof)
        this.initScoreDisplay();
    }

    private initScoreDisplay() {
        const texLoader = new THREE.TextureLoader();
        
        const configs = [
            { file: 'rr_stats.png', angleOffset: -55, w: 0.08, h: 0.022 },
            { file: 'h2h_metrics.png', angleOffset: -25, w: 0.05, h: 0.029 },
            { file: 'ipl_champion_trophy.png', angleOffset: 0, w: 0.045, h: 0.028 },
            { file: 'h2h_boundaries.png', angleOffset: 25, w: 0.05, h: 0.029 },
            { file: 'rcb_stats.png', angleOffset: 55, w: 0.08, h: 0.021 }
        ];

        configs.forEach((cfg) => {
            const angle = Math.PI + (cfg.angleOffset * Math.PI / 180);
            const px = Math.sin(angle) * this.ROOF_RADIUS;
            const pz = Math.cos(angle) * this.ROOF_RADIUS;

            const panelGeom = new THREE.PlaneGeometry(cfg.w, cfg.h); 
            const panelMat = new THREE.MeshBasicMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const panelMesh = new THREE.Mesh(panelGeom, panelMat);

            texLoader.load(`./ui/ipl/${cfg.file}`, (tex) => {
                const alphaTex = this.makeBlackTransparent(tex.image);
                panelMat.map = alphaTex;
                panelMat.needsUpdate = true;
            });

            panelMesh.position.set(px, this.ROOF_Y + 0.006, pz);
            panelMesh.rotation.y = angle + Math.PI;
            panelMesh.rotation.x = -0.18; 

            this.tableGroup.add(panelMesh);
            this.scoreDisplayMeshes.push(panelMesh);
        });
    }

    private areFireworksActive(): boolean {
        if (!this.fireworkActive) return false;
        for (let i = 0; i < this.MAX_FIREWORKS; i++) {
            if (this.fireworkActive[i] === 1) return true;
        }
        return false;
    }

    private triggerManualFireworks() {
        console.log("[BallTracking] Manual fireworks sequence started!");
        this.fireworkSeqTimer = 0.0; // Starts sequential timer update loop
        this.fireworkSeqIndex = 0;   // Staged at index 0
    }

    private triggerSixAnimation(index: number) {
        if (index === 3) {
            // Clear / Reset
            this.isBallAnimating = false;
            this.currentSixIndex = -1;
            (this.activeBall.material as THREE.MeshBasicMaterial).opacity = 0.0;
            (this.ballTrail.material as THREE.LineBasicMaterial).opacity = 0.0;
            this.trailPoints = [];
            this.ballTrail.geometry.setFromPoints([]);
            console.log("[BallTracking] Active tracking animations cleared!");
            return;
        }

        if (index === 4) {
            // Trigger manual fireworks!
            this.triggerManualFireworks();
            return;
        }

        this.currentSixIndex = index;
        this.isBallAnimating = true;
        this.ballAnimT = 0.0;
        this.trailPoints = [];
        this.ballTrail.geometry.setFromPoints([]);
        
        // Make visible and set colors
        (this.activeBall.material as THREE.MeshBasicMaterial).opacity = 1.0;
        (this.ballTrail.material as THREE.LineBasicMaterial).opacity = 0.95;
        
        const colors = { default: [0xff6600, 0xffff00, 0x00ff66], berlin: 0x22d3ee, inuit: 0xf97316 };
        const stType = this.currentStadiumType;
        const colorHex = (stType === 'berlin' || stType === 'inuit') ? colors[stType] : colors.default[index];
        (this.activeBall.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        (this.ballTrail.material as THREE.LineBasicMaterial).color.setHex(colorHex);

        if (stType === 'berlin' || stType === 'inuit') {
            // Launch the ball dynamically from different strike positions with high-speed launch vectors!
            if (index === 0) {
                // Strike from Kohli's spot straight ahead
                this.activeBall.position.set(0.012, 0.009, 0.0);
                this.ballVelocity.set(-0.15, 0.16, 0.03); // Straight launch
            } else if (index === 1) {
                // Strike from Sharma's spot leg-side pull
                this.activeBall.position.set(-0.012, 0.009, 0.0);
                this.ballVelocity.set(-0.08, 0.18, 0.14); // Pull launch
            } else if (index === 2) {
                // Scoop shot behind wickets
                this.activeBall.position.set(0.012, 0.009, 0.0);
                this.ballVelocity.set(0.12, 0.16, -0.12); // Scoop launch
            }
        }

        console.log(`[BallTracking] Six ${index + 1} animation triggered!`);
    }

    private updateBallTracking(dt: number) {
        if (!this.isBallAnimating || this.currentSixIndex === -1) return;

        const stType = this.currentStadiumType;

        // ── Berlin / Inuit: Euler physics with wall bouncing ─────────────────
        if (stType === 'berlin' || stType === 'inuit') {
            const GRAVITY = 0.45; // m/s² at minimap scale
            const floorY = this.getFloorY();
            const ballRadius = 0.0022 * this.activeBall.scale.x;
            const limitY = floorY + ballRadius;
            const RESTITUTION = 0.58; // energy kept on bounce
            const DAMPING = 0.994;    // air resistance per frame

            // Clamp dt to prevent physics tunnelling at low frame-rates
            const safeDt = Math.min(dt, 0.033);

            // Apply gravity
            this.ballVelocity.y -= GRAVITY * safeDt;

            // Euler integration
            this.activeBall.position.x += this.ballVelocity.x * safeDt;
            this.activeBall.position.y += this.ballVelocity.y * safeDt;
            this.activeBall.position.z += this.ballVelocity.z * safeDt;

            // Floor bounce
            if (this.activeBall.position.y <= limitY) {
                this.activeBall.position.y = limitY;
                
                // Trigger localized mini sparkler burst on strong floor bounce
                if (Math.abs(this.ballVelocity.y) > 0.04) {
                    const colHex = stType === 'berlin' ? 0x22d3ee : 0xf97316;
                    this.triggerFirework(this.activeBall.position.x, limitY, this.activeBall.position.z, colHex);
                }

                this.ballVelocity.y = Math.abs(this.ballVelocity.y) * RESTITUTION;
                this.ballVelocity.x *= RESTITUTION;
                this.ballVelocity.z *= RESTITUTION;
            }

            // Wall bounce — Berlin: hollow cylinder (radius 0.13), Inuit: oval (rx=0.14, rz=0.11)
            const bx = this.activeBall.position.x;
            const bz = this.activeBall.position.z;

            if (stType === 'berlin') {
                const R = 0.13;
                const dist = Math.sqrt(bx * bx + bz * bz);
                if (dist >= R) {
                    // Trigger wall bounce sparkler
                    if (this.ballVelocity.lengthSq() > 0.001) {
                        this.triggerFirework(bx, this.activeBall.position.y, bz, 0x22d3ee);
                    }
                    
                    // Reflect velocity off the cylindrical wall normal
                    const nx = bx / dist;
                    const nz = bz / dist;
                    const dot = this.ballVelocity.x * nx + this.ballVelocity.z * nz;
                    this.ballVelocity.x -= 2 * dot * nx * RESTITUTION;
                    this.ballVelocity.z -= 2 * dot * nz * RESTITUTION;
                    // Push ball back inside
                    this.activeBall.position.x = nx * (R - 0.001);
                    this.activeBall.position.z = nz * (R - 0.001);
                }
            } else {
                // Inuit oval: elliptical boundary check
                const RX = 0.14, RZ = 0.11;
                const ellipseCheck = (bx * bx) / (RX * RX) + (bz * bz) / (RZ * RZ);
                if (ellipseCheck >= 1.0) {
                    // Trigger wall bounce sparkler
                    if (this.ballVelocity.lengthSq() > 0.001) {
                        this.triggerFirework(bx, this.activeBall.position.y, bz, 0xf97316);
                    }
                    
                    // Approximate normal from gradient of ellipse equation
                    const nx = (2 * bx) / (RX * RX);
                    const nz = (2 * bz) / (RZ * RZ);
                    const len = Math.sqrt(nx * nx + nz * nz) || 1.0;
                    const nnx = nx / len; const nnz = nz / len;
                    const dot = this.ballVelocity.x * nnx + this.ballVelocity.z * nnz;
                    this.ballVelocity.x -= 2 * dot * nnx * RESTITUTION;
                    this.ballVelocity.z -= 2 * dot * nnz * RESTITUTION;
                    // Pull ball back inside
                    const s = 0.999 / Math.sqrt(ellipseCheck);
                    this.activeBall.position.x = bx * s;
                    this.activeBall.position.z = bz * s;
                }
            }

            // Global velocity damping
            this.ballVelocity.multiplyScalar(DAMPING);

            // Loop: when ball nearly stops, re-launch with the same index
            const speed = this.ballVelocity.length();
            if (speed < 0.01) {
                this.triggerSixAnimation(this.currentSixIndex);
            }

            // Record trail
            this.trailPoints.push(this.activeBall.position.clone());
            if (this.trailPoints.length > this.maxTrailPoints) this.trailPoints.shift();
            this.ballTrail.geometry.setFromPoints(this.trailPoints);
            return;
        }

        // ── Default stadium: original Bezier spline path ─────────────────────
        const prevT = this.ballAnimT;
        const speed = 0.36; // 1.0 / 2.8s
        this.ballAnimT += dt * speed;

        let hasWrapped = false;
        if (this.ballAnimT >= 1.0) {
            this.ballAnimT = 0.0;
            this.trailPoints = []; // Reset trail for next loop
            hasWrapped = true;
        }

        const t = this.ballAnimT;

        // Calculate positions
        const start = new THREE.Vector3();
        const hitPos = new THREE.Vector3();
        const landing = new THREE.Vector3();
        const ballPos = new THREE.Vector3();

        if (this.currentSixIndex === 0) {
            // Kohli Straight Six over Long-On (Forward-Left direction)
            start.set(-0.024, 0.009, 0.0); // Bowler
            hitPos.set(0.012, 0.009, 0.0); // Striker Kohli
            landing.set(-0.13, 0.009, 0.00); // Straight out over long-on fence!
            
            // Phase 1: bowler delivery (t < 0.25)
            if (t < 0.25) {
                const subT = t / 0.25;
                ballPos.lerpVectors(start, hitPos, subT);
                ballPos.y += Math.sin(subT * Math.PI) * 0.008; // Small delivery bounce
            } else {
                const subT = (t - 0.25) / 0.75;
                // High parabolic curve
                const control = new THREE.Vector3((hitPos.x + landing.x)/2, 0.08, (hitPos.z + landing.z)/2);
                
                // Quadratic Bezier
                const mt = 1.0 - subT;
                ballPos.copy(hitPos).multiplyScalar(mt * mt)
                    .addScaledVector(control, 2 * mt * subT)
                    .addScaledVector(landing, subT * subT);
            }
        } else if (this.currentSixIndex === 1) {
            // Sharma Pull Shot over Deep Mid-Wicket (Bottom-Left quadrant)
            start.set(0.024, 0.009, 0.0); // Bowler from opposite stumps
            hitPos.set(-0.012, 0.009, 0.0); // Striker Sharma
            landing.set(-0.04, 0.009, 0.12); // Leg-side pull shot over boundary!
            
            if (t < 0.25) {
                const subT = t / 0.25;
                ballPos.lerpVectors(start, hitPos, subT);
                ballPos.y += Math.sin(subT * Math.PI) * 0.008;
            } else {
                const subT = (t - 0.25) / 0.75;
                const control = new THREE.Vector3((hitPos.x + landing.x)/2, 0.09, (hitPos.z + landing.z)/2);
                
                const mt = 1.0 - subT;
                ballPos.copy(hitPos).multiplyScalar(mt * mt)
                    .addScaledVector(control, 2 * mt * subT)
                    .addScaledVector(landing, subT * subT);
            }
        } else if (this.currentSixIndex === 2) {
            // Kohli Scoop Shot over Fine Leg (Top-Right quadrant, behind striker)
            start.set(-0.024, 0.009, 0.0);
            hitPos.set(0.012, 0.009, 0.0);
            landing.set(0.09, 0.009, -0.09); // Behind the wickets over fine leg boundary!
            
            if (t < 0.25) {
                const subT = t / 0.25;
                ballPos.lerpVectors(start, hitPos, subT);
                ballPos.y += Math.sin(subT * Math.PI) * 0.008;
            } else {
                const subT = (t - 0.25) / 0.75;
                const control = new THREE.Vector3((hitPos.x + landing.x)/2, 0.07, (hitPos.z + landing.z)/2);
                
                const mt = 1.0 - subT;
                ballPos.copy(hitPos).multiplyScalar(mt * mt)
                    .addScaledVector(control, 2 * mt * subT)
                    .addScaledVector(landing, subT * subT);
            }
        }

        // Trigger celebratory fireworks on bat hit (t = 0.25) and boundary landing (t = 1.0)
        const crossedHit = (prevT < 0.25 && (t >= 0.25 || hasWrapped));
        const crossedLanding = hasWrapped;

        const colors = { default: [0xff6600, 0xffff00, 0x00ff66], berlin: [0x22d3ee], inuit: [0xf97316] };
        const col = colors.default[this.currentSixIndex] || 0xff6600;

        if (crossedHit) {
            this.triggerFirework(hitPos.x, hitPos.y, hitPos.z, col);
        }
        if (crossedLanding) {
            this.triggerFirework(landing.x, landing.y, landing.z, col);
        }

        // Set active ball position
        this.activeBall.position.copy(ballPos);

        // Clamp height above floor
        const floorY = this.getFloorY();
        const ballRadius = 0.0022 * this.activeBall.scale.x;
        if (this.activeBall.position.y < floorY + ballRadius) {
            this.activeBall.position.y = floorY + ballRadius;
        }

        // Add to trail
        this.trailPoints.push(ballPos.clone());
        if (this.trailPoints.length > this.maxTrailPoints) {
            this.trailPoints.shift();
        }

        // Update trail geometry
        this.ballTrail.geometry.setFromPoints(this.trailPoints);
    }

    /**
     * Updates SixHoloview roof buttons.
     * Activation is driven purely by index-finger hover — no pinch required.
     * Hold index finger over a button for 2 seconds to trigger it.
     */
    private updateTrackingButtons(
        leftIndexPos: THREE.Vector3,
        rightIndexPos: THREE.Vector3,
        hasLeft: boolean,
        hasRight: boolean,
        dt: number
    ) {
        if (!this.tcdLauncherButton) return;

        const btnWorldPos = new THREE.Vector3();
        
        // --- 1. Update CORE DOCK Launcher Button ---
        this.tcdLauncherButton.getWorldPosition(btnWorldPos);
        let distL = Infinity;
        let distR = Infinity;
        if (hasLeft) distL = leftIndexPos.distanceTo(btnWorldPos);
        if (hasRight) distR = rightIndexPos.distanceTo(btnWorldPos);

        const isLauncherHovered = distL < 0.025 || distR < 0.025;
        const targetLauncherOpacity = isLauncherHovered ? 0.97 : 0.55;
        this.tcdLauncherMat.opacity += (targetLauncherOpacity - this.tcdLauncherMat.opacity) * 10.0 * dt;

        if (isLauncherHovered) {
            this.tcdLauncherPinchProgress += dt;
            if (this.tcdLauncherPinchProgress > 0.5) this.tcdLauncherPinchProgress = 0.5;

            const chargeRatio = this.tcdLauncherPinchProgress / 0.5;
            // Visual stretch & micro-vibration as charge indicators
            this.tcdLauncherButton.scale.set(1.0 + chargeRatio * 0.4, 1.0 + chargeRatio * 1.5, 1.0 + chargeRatio * 0.4);
            this.tcdLauncherButton.position.y = Math.sin(this.radarTime * 50.0) * 0.0006 * chargeRatio;

            if (this.tcdLauncherPinchProgress >= 0.5 && this.menuToggleCooldown <= 0.0) {
                this.menuToggleCooldown = 0.8;
                this.tcdLauncherPinchProgress = 0.0;

                // Toggle visibility
                this.tcdVisible = !this.tcdVisible;
                this.tcdPanelGroup.visible = this.tcdVisible;

                // Click shockwave visual scale burst
                this.tcdLauncherButton.scale.set(1.4, 0.4, 1.4);
            }
        } else {
            this.tcdLauncherPinchProgress -= dt * 2.0;
            if (this.tcdLauncherPinchProgress < 0.0) this.tcdLauncherPinchProgress = 0.0;

            this.tcdLauncherButton.scale.x += (1.0 - this.tcdLauncherButton.scale.x) * 10.0 * dt;
            this.tcdLauncherButton.scale.y += (1.0 - this.tcdLauncherButton.scale.y) * 10.0 * dt;
            this.tcdLauncherButton.scale.z += (1.0 - this.tcdLauncherButton.scale.z) * 10.0 * dt;
            this.tcdLauncherButton.position.y += (0.0 - this.tcdLauncherButton.position.y) * 10.0 * dt;
        }

        // --- 2. Update TCD Panel LookAt Billboarding ---
        if (this.tcdVisible && this.tcdPanelGroup) {
            const lPos = new THREE.Vector3();
            this.tcdLauncherButton.getWorldPosition(lPos);
            const localLPos = lPos.applyMatrix4(this.tableGroup.matrixWorld.clone().invert());
            this.tcdPanelGroup.position.set(localLPos.x, localLPos.y + 0.045, localLPos.z);

            if (this.player && this.player.head) {
                const headPos = new THREE.Vector3();
                this.player.head.getWorldPosition(headPos);

                const panelWorldPos = new THREE.Vector3();
                this.tcdPanelGroup.getWorldPosition(panelWorldPos);

                const targetPos = headPos.clone();
                targetPos.y = panelWorldPos.y;

                const toHead = new THREE.Vector3().subVectors(targetPos, panelWorldPos).normalize();
                const localToHead = toHead.clone().applyQuaternion(this.tableGroup.quaternion.clone().invert());

                const angle = Math.atan2(localToHead.x, localToHead.z);
                this.tcdPanelGroup.rotation.y = angle;
            }

            // --- 3. Raycast Dwell Updates for 7 Dock Buttons ---
            for (let i = 0; i < this.tcdButtons.length; i++) {
                const btn = this.tcdButtons[i];
                btn.getWorldPosition(btnWorldPos);

                let distToLeft = Infinity;
                let distToRight = Infinity;
                if (hasLeft) distToLeft = leftIndexPos.distanceTo(btnWorldPos);
                if (hasRight) distToRight = rightIndexPos.distanceTo(btnWorldPos);

                const isHovered = distToLeft < 0.02 || distToRight < 0.02; // Tight 2.0 cm hover radius
                const targetOpacity = isHovered ? 0.95 : 0.55;
                this.tcdButtonMats[i].opacity += (targetOpacity - this.tcdButtonMats[i].opacity) * 10.0 * dt;

                if (isHovered) {
                    this.tcdButtonHoverTimes[i] += dt;
                    if (this.tcdButtonHoverTimes[i] > 0.5) this.tcdButtonHoverTimes[i] = 0.5; // 0.5s dwell hold

                    const ratio = this.tcdButtonHoverTimes[i] / 0.5;
                    btn.scale.set(1.0 + ratio * 0.2, 1.0 + ratio * 1.5, 1.0 + ratio * 0.2);
                    btn.position.z = 0.002 + Math.sin(this.radarTime * 60.0) * 0.0005 * ratio;

                    if (this.tcdButtonHoverTimes[i] >= 0.5 && this.menuToggleCooldown <= 0.0) {
                        this.menuToggleCooldown = 0.8;
                        this.tcdButtonHoverTimes[i] = 0.0;

                        // Visual squeeze click feedback
                        btn.scale.set(1.2, 0.4, 1.2);

                        // Trigger actions
                        if (i === 0) this.triggerSixAnimation(0);      // KOHLI
                        else if (i === 1) this.triggerSixAnimation(1); // SHARMA
                        else if (i === 2) this.triggerSixAnimation(2); // SCOOP
                        else if (i === 3) this.triggerSportSequence(); // Play SEQ
                        else if (i === 4) {
                            // Cycle weather Mode: off -> rain -> neon_dust -> off
                            if (this.weatherMode === 'off') this.setWeatherMode('rain');
                            else if (this.weatherMode === 'rain') this.setWeatherMode('neon_dust');
                            else this.setWeatherMode('off');
                            console.log(`[TCD] Weather cycled to: ${this.weatherMode}`);
                        } else if (i === 5) {
                            // Toggle Navigation Layer
                            this.isNavLayerActive = !this.isNavLayerActive;
                            console.log(`[TCD] Stadium Navigation Layer active: ${this.isNavLayerActive}`);
                        } else if (i === 6) {
                            // CLEAR/Reset all
                            this.triggerSixAnimation(3);
                            this.isSandboxBallActive = false;
                            this.setWeatherMode('off');
                            this.isSportSequenceActive = false;
                            if (this.sportCelebrationCard) this.sportCelebrationCard.visible = false;
                            if (this.sequenceBall) this.sequenceBall.visible = false;
                            if (this.sequenceBallTrail) this.sequenceBallTrail.visible = false;
                            if (this.arBillboard) this.arBillboard.visible = true; // Restore scoreboard
                            console.log("[TCD] All animations, physics, and weather systems cleared!");
                        }
                    }
                } else {
                    this.tcdButtonHoverTimes[i] -= dt * 2.0;
                    if (this.tcdButtonHoverTimes[i] < 0.0) this.tcdButtonHoverTimes[i] = 0.0;

                    btn.scale.x += (1.0 - btn.scale.x) * 10.0 * dt;
                    btn.scale.y += (1.0 - btn.scale.y) * 10.0 * dt;
                    btn.scale.z += (1.0 - btn.scale.z) * 10.0 * dt;
                    btn.position.z += (0.002 - btn.position.z) * 10.0 * dt;
                }
            }
        }
    }

    private triggerSportSequence() {
        if (this.isSportSequenceActive) return;

        console.log(`[SportSequence] Triggered sequence for: ${this.currentStadiumType}`);
        this.isSportSequenceActive = true;
        this.tcdVisible = false;
        if (this.tcdPanelGroup) this.tcdPanelGroup.visible = false;
        this.sportSequenceTime = 0.0;
        this.sportSequencePhase = 0;
        this.sequenceBallPoints = [];

        // Clear existing trails
        this.sequenceBallTrail.geometry.setFromPoints([]);

        // Make ball and trail visible, reset sequence ball positions
        this.sequenceBall.visible = true;
        this.sequenceBallTrail.visible = true;
        (this.sequenceBall.material as THREE.MeshBasicMaterial).opacity = 1.0;
        (this.sequenceBallTrail.material as THREE.LineBasicMaterial).opacity = 0.95;

        // Reset bat swing rotation in case it was left rotated
        if (this.cricketBatMesh) {
            this.cricketBatMesh.rotation.set(0, 0, 0);
            this.cricketBatMesh.position.set(0.035, 0.009, 0);
        }

        const stType = this.currentStadiumType;
        if (stType === 'default') {
            // Cricket: Ball starts at bowler's release position (Aligned along X-axis!)
            this.sequenceBall.position.set(-0.045, 0.015, 0.0);
            (this.sequenceBall.material as THREE.MeshBasicMaterial).color.setHex(0xff3333); // Red cricket ball
            (this.sequenceBallTrail.material as THREE.LineBasicMaterial).color.setHex(0xffaa00);
        } else if (stType === 'berlin') {
            // Soccer: Ball starts on pitch center
            this.sequenceBall.position.set(0.0, 0.003, 0.0);
            (this.sequenceBall.material as THREE.MeshBasicMaterial).color.setHex(0xffffff); // White soccer ball
            (this.sequenceBallTrail.material as THREE.LineBasicMaterial).color.setHex(0x22d3ee);
        } else {
            // Basketball (Inuit): Ball starts at dribbling baseline
            this.sequenceBall.position.set(0.03, 0.015, 0.0);
            (this.sequenceBall.material as THREE.MeshBasicMaterial).color.setHex(0xf97316); // Orange basketball
            (this.sequenceBallTrail.material as THREE.LineBasicMaterial).color.setHex(0xffff00);
        }

        // --- DRAW AR CELEBRATION TEXT TO CANVAS ---
        const canvas = this.celebrationCardCanvas;
        const ctx = this.celebrationCardCtx;
        ctx.clearRect(0, 0, 256, 128);

        // Cyberpunk translucent glass panel background drawing
        ctx.fillStyle = 'rgba(10, 15, 45, 0.9)';
        ctx.fillRect(0, 0, 256, 128);

        // Harmonious, tailored, rich HSL styling gradients
        const grad = ctx.createLinearGradient(0, 0, 256, 0);
        let textVal = "";
        let borderStroke = "";

        if (stType === 'default') {
            grad.addColorStop(0, '#f43f5e'); // Pink
            grad.addColorStop(1, '#eab308'); // Gold
            textVal = "SIX!!!";
            borderStroke = '#f43f5e';
        } else if (stType === 'berlin') {
            grad.addColorStop(0, '#06b6d4'); // Cyan
            grad.addColorStop(1, '#ffffff'); // White
            textVal = "GOAL!!!";
            borderStroke = '#06b6d4';
        } else {
            grad.addColorStop(0, '#f97316'); // Orange
            grad.addColorStop(1, '#fbbf24'); // Yellow Fire
            textVal = "DUNK!!!";
            borderStroke = '#f97316';
        }

        // Draw glowing borders
        ctx.strokeStyle = borderStroke;
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 248, 120);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, 240, 112);

        // Draw main glowing text
        ctx.fillStyle = grad;
        ctx.shadowColor = borderStroke;
        ctx.shadowBlur = 15;
        ctx.font = 'bold italic 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textVal, 128, 64);
        
        ctx.shadowBlur = 0; // reset shadow

        this.sportCelebrationTexture.needsUpdate = true;
        this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001); // start tiny for bounce scaling animation
        this.sportCelebrationCard.visible = false;
    }

    private getFloorY(): number {
        return this.dynamicFloorY;
    }

    private updateSportSequence(dt: number) {
        if (this.currentStadiumType === 'butterflies' || this.currentStadiumType === 'nurburgring') {
            this.isSportSequenceActive = false;
            if (this.sequenceBall) this.sequenceBall.visible = false;
            if (this.sequenceBallTrail) this.sequenceBallTrail.visible = false;
            return;
        }
        if (!this.isSportSequenceActive) return;

        this.sportSequenceTime += dt;
        const time = this.sportSequenceTime;
        const stType = this.currentStadiumType;

        // Hide main AR matchup scoreboard to make way for the sport celebration card
        if (this.arBillboard) {
            this.arBillboard.visible = false;
        }

        // NBA Finals packed stadium camera flash strobe effect!
        if (stType === 'inuit' && Math.random() < 0.25) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 0.085 + Math.random() * 0.035; // seating stands radius
            const flashX = Math.sin(angle) * radius;
            const flashZ = Math.cos(angle) * radius;
            const flashY = 0.015 + Math.random() * 0.04;  // stands height
            
            // Trigger instant white shimmering camera flash spark in the stands!
            this.triggerFirework(flashX, flashY, flashZ, 0xffffff, 0.001, 0.0, 0.005, 0.0, 0.45);
        }

        // Helper to locate players
        const getPlayer = (id: string) => this.players.find(p => p.id === id);

        // Helper to animate running player
        const runPlayer = (p: any, targetX: number, targetZ: number, speedFactor: number) => {
            const dx = targetX - p.group.position.x;
            const dz = targetZ - p.group.position.z;
            p.group.position.x += dx * speedFactor;
            p.group.position.z += dz * speedFactor;
            
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                const targetAngle = Math.atan2(dx, dz);
                let diff = targetAngle - p.group.rotation.y;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // normalize to [-PI, PI]
                p.group.rotation.y += diff * 12.0 * dt;
                p.group.position.y = 0.009 + Math.abs(Math.sin(time * 15.0)) * 0.002; // bob up/down
            }
        };

        const stopPlayer = (p: any) => {
            p.group.position.y = 0.009;
        };

        // Helper to show/fade cards
        const showPlayerCard = (playerId: string | null) => {
            this.players.forEach(p => {
                const cardMesh = p.statsCard.children[0] as THREE.Mesh;
                const cardMat = cardMesh.material as THREE.MeshBasicMaterial;
                if (playerId && p.id === playerId) {
                    cardMat.opacity = 0.95;
                    p.statsCard.visible = true;
                    p.statsCard.children.forEach(child => {
                        if (child instanceof THREE.Mesh) {
                            const childMat = child.material as THREE.MeshBasicMaterial;
                            if (childMat && child !== cardMesh) {
                                const baseOpacity = child.userData.baseOpacity ?? 0.85;
                                childMat.opacity = 0.85;
                            }
                            const baseY = p.statsCard.userData.baseY ?? 0.045;
                            const baseZ = child.userData.baseZ ?? 0.0;
                            child.position.y = baseY + 0.007;
                            child.position.z = baseZ + 0.016;
                        }
                    });
                } else {
                    cardMat.opacity = 0.0;
                    p.statsCard.visible = false;
                }
            });
        };

        // --- 1. CRICKET CHOREOGRAPHY SEQUENCE (20.0s over - Aligned along X-axis!) ---
        if (stType === 'default') {
            const bowler = getPlayer("f2");   // B. Kumar
            const batsman = getPlayer("b2");  // S. Samson
            const partner = getPlayer("b1");  // Y. Jaiswal
            const keeper = getPlayer("f1");   // J. Cox
            const fielder3 = getPlayer("f3"); // K. Pandya
            const fielder7 = getPlayer("f7"); // J. Bethell
            const fielder6 = getPlayer("f6"); // T. David
            const fielder8 = getPlayer("f8"); // R. Shepherd

            if (time < 3.0) {
                // --- BALL 1: Defensive Block (0.0s - 3.0s) ---
                showPlayerCard("b2"); // Show Samson card
                const ballT = Math.min(time / 1.0, 1.0);
                
                // Bowler Kumar run up & bowl
                if (bowler) runPlayer(bowler, -0.035, 0.0, dt * 5.0);
                
                // Ball delivery trajectory (Bowler to Crease)
                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.035, endY = 0.012, endZ = 0.0;
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT - 0.002 * Math.sin(ballT * Math.PI),
                    startZ + (endZ - startZ) * ballT
                );

                if (time >= 1.0 && time < 1.1) {
                    if (this.cricketBatMesh) this.cricketBatMesh.rotation.y = -Math.PI / 4;
                    this.triggerFirework(0.035, 0.012, 0.0, 0xffaa00, 0.015);
                }

                // Ball rebounds to Point fielder f3
                if (time >= 1.0) {
                    const reboundT = Math.min((time - 1.0) / 1.0, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.035, 0.012, 0.0),
                        new THREE.Vector3(0.026, 0.012, 0.022),
                        reboundT
                    );
                    if (fielder3) runPlayer(fielder3, 0.026, 0.022, dt * 6.0);
                }
                
                if (time >= 2.0) {
                    const throwT = Math.min((time - 2.0) / 1.0, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.026, 0.012, 0.022),
                        new THREE.Vector3(-0.035, 0.009, 0.0),
                        throwT
                    );
                    if (this.cricketBatMesh) this.cricketBatMesh.rotation.y = 0;
                    if (fielder3) stopPlayer(fielder3);
                }
            } else if (time >= 3.0 && time < 6.0) {
                // --- BALL 2: High Bouncer (3.0s - 6.0s) ---
                showPlayerCard("f1"); // Show Wicketkeeper Cox card
                const ballT = Math.min((time - 3.0) / 1.2, 1.0);
                
                // Ball delivery trajectory (Bouncer - goes high)
                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.048, endY = 0.025, endZ = 0.0; // Keeper gloves
                
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT + 0.018 * Math.sin(ballT * Math.PI), // high bounce arc
                    startZ + (endZ - startZ) * ballT
                );

                // Samson ducks!
                if (batsman && ballT > 0.4 && ballT < 0.9) {
                    batsman.mesh.rotation.x = Math.PI / 4;
                } else if (batsman) {
                    batsman.mesh.rotation.x = 0;
                }

                // Ball tossed back to bowler Kumar
                if (time >= 4.5) {
                    const tossT = Math.min((time - 4.5) / 1.2, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.048, 0.025, 0.0),
                        new THREE.Vector3(-0.035, 0.009, 0.0),
                        tossT
                    );
                }
            } else if (time >= 6.0 && time < 9.5) {
                // --- BALL 3: Elegant Off-Drive FOUR (6.0s - 9.5s) ---
                showPlayerCard("b2"); // Highlight Samson
                const ballT = Math.min((time - 6.0) / 1.1, 1.0);
                
                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.035, endY = 0.012, endZ = 0.0;
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT - 0.002 * Math.sin(ballT * Math.PI),
                    startZ + (endZ - startZ) * ballT
                );

                if (time >= 7.1 && time < 7.2) {
                    if (this.cricketBatMesh) this.cricketBatMesh.rotation.y = -Math.PI / 3;
                    this.triggerFirework(0.035, 0.012, 0.0, 0x00ff66, 0.015);
                }

                // Ball runs to boundary, J. Bethell runs to field
                if (time >= 7.1) {
                    const flightT = Math.min((time - 7.1) / 1.4, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.035, 0.012, 0.0),
                        new THREE.Vector3(0.065, -0.010, 0.085), // boundary point at grass level (-0.010)
                        flightT
                    );
                    
                    if (fielder7) runPlayer(fielder7, 0.065, 0.085, dt * 4.0);
                }

                // Show FOUR celebration card near boundary
                if (time >= 8.5) {
                    this.sportCelebrationCard.position.set(0.055, this.ROOF_Y + 0.05, 0.075);
                    this.sportCelebrationCard.visible = false;
                    // Redraw canvas with FOUR
                    const ctx = this.celebrationCardCtx;
                    ctx.fillStyle = 'rgba(10, 15, 45, 0.9)';
                    ctx.fillRect(0, 0, 256, 128);
                    ctx.strokeStyle = '#00ff66';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(4, 4, 248, 120);
                    const grad = ctx.createLinearGradient(0, 0, 256, 0);
                    grad.addColorStop(0, '#00ff66');
                    grad.addColorStop(1, '#00ffff');
                    ctx.fillStyle = grad;
                    ctx.font = 'bold italic 48px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("FOUR!!!", 128, 64);
                    this.sportCelebrationTexture.needsUpdate = true;
                }

                // Batsmen swap crease ends!
                if (time >= 7.5 && time < 9.5) {
                    if (batsman) runPlayer(batsman, -0.035, 0.005, dt * 5.0);
                    if (partner) runPlayer(partner, 0.035, -0.005, dt * 5.0);
                }
            } else if (time >= 9.5 && time < 12.5) {
                // --- BALL 4: Clean Bowled Stumps flying (9.5s - 12.5s) ---
                showPlayerCard("f2"); // Highlight Bowler Kumar
                this.sportCelebrationCard.visible = false;
                const ballT = Math.min((time - 9.5) / 1.0, 1.0);

                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.045, endY = 0.010, endZ = 0.0; // Stumps
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT - 0.003 * Math.sin(ballT * Math.PI),
                    startZ + (endZ - startZ) * ballT
                );

                if (batsman) stopPlayer(batsman);
                if (partner) stopPlayer(partner);
                if (fielder7) stopPlayer(fielder7);

                // Wickets Fly & flash red!
                if (time >= 10.5 && time < 11.5) {
                    if (this.cricketStumpsMesh) {
                        this.cricketStumpsMesh.rotation.z = Math.PI / 4;
                        this.cricketStumpsMesh.position.x = 0.049;
                        this.cricketStumpsMesh.traverse((child: any) => {
                            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                                child.material.color.setHex(0xff0000); // glowing red dismissals!
                            }
                        });
                    }
                    if (time >= 10.5 && time < 10.6) {
                        this.triggerFirework(0.045, 0.010, 0.0, 0xff0055, 0.02);
                    }
                }
            } else if (time >= 12.5 && time < 15.5) {
                // --- BALL 5: Fast throw and safe defend (12.5s - 15.5s) ---
                showPlayerCard("b1"); // Highlight Jaiswal
                // Restore stumps & bat
                if (this.cricketStumpsMesh) {
                    this.cricketStumpsMesh.rotation.set(0, 0, 0);
                    this.cricketStumpsMesh.position.set(0.045, 0.009, 0);
                    this.cricketStumpsMesh.traverse((child: any) => {
                        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                            child.material.color.setHex(0x00ff66);
                        }
                    });
                }
                if (this.cricketBatMesh) {
                    this.cricketBatMesh.rotation.set(0, 0, 0);
                    this.cricketBatMesh.position.set(0.035, 0.009, 0);
                }
                const ballT = Math.min((time - 12.5) / 1.0, 1.0);
                
                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.035, endY = 0.012, endZ = 0.0;
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT - 0.002 * Math.sin(ballT * Math.PI),
                    startZ + (endZ - startZ) * ballT
                );

                if (time >= 13.5 && time < 14.5) {
                    const reboundT = Math.min((time - 13.5) / 1.0, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.035, 0.012, 0.0),
                        new THREE.Vector3(0.026, 0.012, 0.022),
                        reboundT
                    );
                }
            } else if (time >= 15.5 && time < 20.0) {
                // --- BALL 6: THE GRAND SIX FINALE (15.5s - 20.0s) ---
                showPlayerCard("b2"); // Highlight Samson Card
                const ballT = Math.min((time - 15.5) / 1.0, 1.0);
                
                const startX = -0.045, startY = 0.015, startZ = 0.0;
                const endX = 0.035, endY = 0.012, endZ = 0.0;
                this.sequenceBall.position.set(
                    startX + (endX - startX) * ballT,
                    startY + (endY - startY) * ballT - 0.002 * Math.sin(ballT * Math.PI),
                    startZ + (endZ - startZ) * ballT
                );

                if (time >= 16.5 && time < 16.6) {
                    if (this.cricketBatMesh) this.cricketBatMesh.rotation.y = -Math.PI / 2.5;
                    this.triggerFirework(0.035, 0.012, 0.0, 0xff00ff, 0.02);
                }

                // Parabolic SIX flight out of the stadium
                if (time >= 16.5) {
                    const flightT = Math.min((time - 16.5) / 1.6, 1.0);
                    const x0 = 0.035, y0 = 0.012, z0 = 0.0;
                    const x1 = 0.04, y1 = 0.16, z1 = -0.05;
                    const x2 = 0.115, y2 = 0.01, z2 = -0.09; // out of stadium

                    const mt = 1 - flightT;
                    const bx = mt * mt * x0 + 2 * mt * flightT * x1 + flightT * flightT * x2;
                    const by = mt * mt * y0 + 2 * mt * flightT * y1 + flightT * flightT * y2;
                    const bz = mt * mt * z0 + 2 * mt * flightT * z1 + flightT * flightT * z2;
                    this.sequenceBall.position.set(bx, by, bz);

                    // Deep fielder runs to boundary wall
                    if (fielder8) runPlayer(fielder8, 0.10, -0.075, dt * 3.5);
                }

                // Show SIX celebration card
                if (time >= 18.0) {
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.075, 0.0);
                    this.sportCelebrationCard.visible = false;
                    // Redraw canvas with SIX
                    const ctx = this.celebrationCardCtx;
                    ctx.fillStyle = 'rgba(10, 15, 45, 0.9)';
                    ctx.fillRect(0, 0, 256, 128);
                    ctx.strokeStyle = '#ff00ff';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(4, 4, 248, 120);
                    const grad = ctx.createLinearGradient(0, 0, 256, 0);
                    grad.addColorStop(0, '#ff00ff');
                    grad.addColorStop(1, '#ffaa00');
                    ctx.fillStyle = grad;
                    ctx.font = 'bold italic 48px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("SIX!!!", 128, 64);
                    this.sportCelebrationTexture.needsUpdate = true;
                }
            }
        }

        // --- 2. SOCCER CHOREOGRAPHY SEQUENCE (20.0s twist match) ---
        else if (stType === 'berlin') {
            const bellingham = getPlayer("a1"); // AM Attacking J. Bellingham
            const sane = getPlayer("fw1");      // LW L. Sané
            const kimmich = getPlayer("d3");    // RB J. Kimmich
            const rudiger = getPlayer("d2");    // CB R. Rüdiger
            const kane = getPlayer("fw3");      // ST H. Kane
            const neuer = getPlayer("gk");      // GK M. Neuer
            const goretzka = getPlayer("m2");   // CM Defensive L. Goretzka

            const S = 0.72; // scale factor to match FIELD_SCALE

            if (time < 4.0) {
                // --- Bellingham Dribbles & Passes (0.0s - 4.0s) ---
                showPlayerCard("a1"); // Highlight Bellingham
                const dribbleT = Math.min(time / 2.5, 1.0);
                
                // Bellingham runs and dribbles towards penalty box
                const startX = 0.013 * S, startZ = 0.040 * S;
                const endX = 0.0 * S, endZ = 0.02 * S;
                
                const bx = startX + (endX - startX) * dribbleT;
                const bz = startZ + (endZ - startZ) * dribbleT;
                const bob = Math.abs(Math.sin(time * 25.0)) * 0.002;
                const by = 0.003 + bob;
                
                this.sequenceBall.position.set(bx, by, bz);
                
                // Bellingham Dribble (Soccer, phase 1): Snap group position to (bx, 0.009 + bob, bz) and orient rotation directly to end direction
                if (bellingham) {
                    if (dribbleT < 1.0) {
                        bellingham.group.position.set(bx, 0.009 + bob, bz);
                        bellingham.group.rotation.y = Math.atan2(endX - startX, endZ - startZ);
                    } else {
                        stopPlayer(bellingham);
                    }
                }

                // Goretzka runs to intercept
                if (goretzka) runPlayer(goretzka, 0.015 * S, 0.022 * S, dt * 4.0);

                // Bellingham passes to Sané
                if (time >= 2.5) {
                    const passT = Math.min((time - 2.5) / 1.5, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.0 * S, 0.003, 0.02 * S),
                        new THREE.Vector3(-0.055 * S, 0.003, 0.015 * S),
                        passT
                    );
                    if (bellingham) stopPlayer(bellingham);
                    if (goretzka) stopPlayer(goretzka);
                    
                    // Sané Receive (Soccer, phase 2): Run at dt * 15.0 to receive the pass
                    if (sane) runPlayer(sane, -0.055 * S, 0.015 * S, dt * 15.0);
                }
            } else if (time >= 4.0 && time < 8.0) {
                // --- Sané Dribbles Wing & Crosses, Kimmich Slides (4.0s - 8.0s) ---
                showPlayerCard("fw1"); // Highlight Sané
                const runT = Math.min((time - 4.0) / 2.2, 1.0);

                // Sané runs with ball
                const startX = -0.055 * S, startZ = 0.015 * S;
                const endX = -0.065 * S, endZ = -0.035 * S; // Deep wing

                const bx = startX + (endX - startX) * runT;
                const bz = startZ + (endZ - startZ) * runT;
                const bob = Math.abs(Math.sin(time * 25.0)) * 0.002;
                const by = 0.003 + bob;

                if (runT < 1.0) {
                    this.sequenceBall.position.set(bx, by, bz);
                    // Sané Dribble (Soccer, phase 3): Snap position to (bx, 0.009 + bob, bz) and orient rotation
                    if (sane) {
                        sane.group.position.set(bx, 0.009 + bob, bz);
                        sane.group.rotation.y = Math.atan2(endX - startX, endZ - startZ);
                    }
                } else {
                    if (sane) stopPlayer(sane);
                }

                // Kimmich Slide (Soccer, phase 3): Elevate run speed to dt * 18.0
                if (kimmich) {
                    if (time < 6.0) {
                        runPlayer(kimmich, -0.05 * S, -0.015 * S, dt * 18.0);
                    } else {
                        // Slide flat!
                        kimmich.group.position.x += (-0.062 * S - kimmich.group.position.x) * dt * 18.0;
                        kimmich.group.position.z += (-0.03 * S - kimmich.group.position.z) * dt * 18.0;
                        kimmich.group.rotation.y = Math.PI / 4;
                        kimmich.mesh.rotation.z = Math.PI / 2.5; // fall flat
                    }
                }

                // Sané crosses the ball high into box
                if (time >= 6.5) {
                    const crossT = Math.min((time - 6.5) / 1.5, 1.0);
                    const startPos = new THREE.Vector3(-0.065 * S, 0.003, -0.035 * S);
                    const endPos = new THREE.Vector3(0.0 * S, 0.005, -0.065 * S); // box center
                    this.sequenceBall.position.set(
                        startPos.x + (endPos.x - startPos.x) * crossT,
                        startPos.y + (endPos.y - startPos.y) * crossT + 0.015 * Math.sin(crossT * Math.PI), // high cross arc
                        startPos.z + (endPos.z - startPos.z) * crossT
                    );
                    if (sane) stopPlayer(sane);
                }
            } else if (time >= 8.0 && time < 12.0) {
                // --- Kane/Rüdiger Header Duel & Rebound (8.0s - 12.0s) ---
                showPlayerCard("fw3"); // Highlight Kane
                if (sane) stopPlayer(sane);
                if (kimmich) {
                    kimmich.mesh.rotation.z = 0; // stand back up
                    stopPlayer(kimmich);
                }
                const duelT = Math.min((time - 8.0) / 1.2, 1.0);

                // Kane/Rüdiger Contest (Soccer, phase 4): Accelerate run speed to dt * 22.0
                if (kane) runPlayer(kane, 0.0 * S, -0.065 * S, dt * 22.0);
                if (rudiger) runPlayer(rudiger, 0.003 * S, -0.062 * S, dt * 22.0);

                // Contesting header: Kane leaps!
                if (time >= 9.0 && time < 10.2) {
                    if (kane) kane.group.position.y = 0.018; // jump 9mm high!
                    if (time >= 9.0 && time < 9.1) {
                        this.triggerFirework(0.0 * S, 0.018, -0.065 * S, 0x00ffff, 0.01);
                    }
                } else if (kane) {
                    kane.group.position.y = 0.009;
                }

                // Ball rebounds off Rüdiger's block back to Bellingham
                if (time >= 9.2) {
                    const reboundT = Math.min((time - 9.2) / 1.8, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.0 * S, 0.018, -0.065 * S),
                        new THREE.Vector3(0.0 * S, 0.003, -0.025 * S), // bellingham rebound spot
                        reboundT
                    );
                    // Bellingham Rebound (Soccer, phase 4): Accelerate run speed to dt * 20.0
                    if (bellingham) runPlayer(bellingham, 0.0 * S, -0.025 * S, dt * 20.0);
                }
            } else if (time >= 12.0 && time < 16.0) {
                // --- Bellingham Beats Defender & Feeds Kane (12.0s - 16.0s) ---
                showPlayerCard("a1"); // Highlight Bellingham again
                const passT = Math.min((time - 12.0) / 1.8, 1.0);
                if (kane) stopPlayer(kane);
                if (rudiger) stopPlayer(rudiger);

                // Bellingham Dribble/Pass (Soccer, phase 5): Snap position to (0.0, 0.009, -0.025 * S)
                if (bellingham) {
                    bellingham.group.position.set(0.0, 0.009, -0.025 * S);
                    bellingham.group.rotation.y = Math.PI; // Face goal
                }
                
                // Ball passed to Kane at (0.0, 0.003, -0.068)
                if (time >= 13.5) {
                    const throwT = Math.min((time - 13.5) / 1.5, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(0.0 * S, 0.003, -0.025 * S),
                        new THREE.Vector3(0.0 * S, 0.003, -0.068 * S),
                        throwT
                    );
                    if (bellingham) stopPlayer(bellingham);
                    // Kane Receive (Soccer, phase 5): Run at dt * 22.0
                    if (kane) runPlayer(kane, 0.0 * S, -0.068 * S, dt * 22.0);
                } else {
                    this.sequenceBall.position.set(0.0 * S, 0.003, -0.025 * S);
                }
            } else if (time >= 16.0 && time < 20.0) {
                // --- Kane Curving Goal Shot, Neuer Dives (16.0s - 20.0s) ---
                showPlayerCard("fw3"); // Highlight Kane
                const shotT = Math.min((time - 16.0) / 1.2, 1.0);
                
                // Ball flies into Goal 2 (bottom right corner of net)
                // Adjust shot ending position to z = -0.089 and Neuer's dive position to z = -0.082 (physical coordinates)
                const startX = 0.0 * S, startY = 0.003, startZ = -0.068 * S;
                const endX = 0.008 * S, endY = 0.004, endZ = -0.089; // Physical endZ = -0.089
                
                this.sequenceBall.position.set(
                    startX + (endX - startX) * shotT,
                    startY + (endY - startY) * shotT + 0.006 * Math.sin(shotT * Math.PI), // curve shot
                    startZ + (endZ - startZ) * shotT
                );

                if (time >= 17.2 && time < 17.3) {
                    // Net wiggles!
                    this.isGoalWiggling = true;
                    this.goalWiggleTime = 0.0;
                    this.wigglingGoalNet = this.goal2NetMesh;
                    // Sparkler trigger aligned perfectly with end positions
                    this.triggerFirework(0.008 * S, 0.004, -0.089, 0x22d3ee, 0.015);
                }

                // Neuer Dive (Soccer, phase 6): Set dive LERP speed to dt * 20.0
                if (neuer && time >= 16.5) {
                    neuer.group.position.x += (0.008 * S - neuer.group.position.x) * dt * 20.0;
                    neuer.mesh.rotation.z = -Math.PI / 2.2; // side dive
                }

                // Show GOAL celebration card
                if (time >= 17.5) {
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.075, 0.0);
                    this.sportCelebrationCard.visible = false;
                    // Redraw canvas with GOAL
                    const ctx = this.celebrationCardCtx;
                    ctx.fillStyle = 'rgba(10, 15, 45, 0.9)';
                    ctx.fillRect(0, 0, 256, 128);
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(4, 4, 248, 120);
                    const grad = ctx.createLinearGradient(0, 0, 256, 0);
                    grad.addColorStop(0, '#00ffff');
                    grad.addColorStop(1, '#ffffff');
                    ctx.fillStyle = grad;
                    ctx.font = 'bold italic 48px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("GOAL!!!", 128, 64);
                    this.sportCelebrationTexture.needsUpdate = true;
                }
            }
        }

        // --- 3. BASKETBALL CHOREOGRAPHY SEQUENCE (20.0s steal & 3-pt) ---
        else {
            const james = getPlayer("p1");    // SF L. James
            const russell = getPlayer("p5");  // PG D. Russell
            const brown = getPlayer("a1");    // SG J. Brown
            const tatum = getPlayer("a2");    // SF J Tatum
            const reaves = getPlayer("p3");   // PG A. Reaves
            const porzingis = getPlayer("a3"); // C K. Porzingis
            const white = getPlayer("a4");    // SG D. White

            if (time < 5.0) {
                // --- Steal and break (0.0s - 5.0s) ---
                showPlayerCard("p5"); // Highlight Russell
                
                const startX = 0.0, startZ = 0.035;
                const bob = Math.abs(Math.sin(time * 20.0)) * 0.005;

                // Brown Dribble (Basketball, phase 1): Snap position to (startX, 0.009 + bob, startZ) and look at Russell
                if (time < 1.5) {
                    if (brown) {
                        brown.group.position.set(startX, 0.009 + bob, startZ);
                        if (russell) {
                            const dx = russell.group.position.x - startX;
                            const dz = russell.group.position.z - startZ;
                            brown.group.rotation.y = Math.atan2(dx, dz);
                        }
                    }
                    // Russell Steal (Basketball, phase 1): Accelerate run to dt * 15.0
                    if (russell) runPlayer(russell, 0.005, 0.02, dt * 15.0);
                    this.sequenceBall.position.set(startX, 0.015 + bob, startZ);
                } else {
                    // Russell Dribble (Basketball, phase 2): Snap position to (bx, 0.009 + bob, bz) and orient rotation
                    const endX = 0.0, endZ = -0.015;
                    const runT = (time - 1.5) / 2.0;
                    const bx = startX + (endX - startX) * Math.min(runT, 1.0);
                    const bz = startZ + (endZ - startZ) * Math.min(runT, 1.0);
                    const rBob = Math.abs(Math.sin(time * 30.0)) * 0.006;
                    const by = 0.015 + rBob;
                    
                    if (time < 3.5) {
                        this.sequenceBall.position.set(bx, by, bz);
                        if (russell) {
                            russell.group.position.set(bx, 0.009 + rBob, bz);
                            russell.group.rotation.y = Math.atan2(endX - startX, endZ - startZ);
                        }
                    } else {
                        // Pass to LeBron cutting baseline (-0.035, 0.0, -0.04)
                        const passT = Math.min((time - 3.5) / 1.5, 1.0);
                        this.sequenceBall.position.lerpVectors(
                            new THREE.Vector3(0.0, 0.015, -0.015),
                            new THREE.Vector3(-0.035, 0.015, -0.04),
                            passT
                        );
                        if (russell) stopPlayer(russell);
                        // LeBron Receive (Basketball, phase 2): Accelerate run to dt * 18.0
                        if (james) runPlayer(james, -0.035, -0.04, dt * 18.0);
                    }
                    if (brown) stopPlayer(brown);
                }
            } else if (time >= 5.0 && time < 10.0) {
                // --- LeBron catches, pump fakes, draws defender (5.0s - 10.0s) ---
                showPlayerCard("p1"); // Highlight LeBron
                if (russell) stopPlayer(russell);

                // LeBron Catch (Basketball, phase 3): Snap position to catch coordinates (-0.035, 0.009, -0.04)
                if (james) {
                    james.group.position.set(-0.035, 0.009, -0.04);
                    james.group.rotation.y = Math.PI / 4;
                }
                this.sequenceBall.position.set(-0.035, 0.015, -0.04);

                // Tatum Contest (Basketball, phase 3): Accelerate run to dt * 18.0
                if (tatum) runPlayer(tatum, -0.03, -0.038, dt * 18.0);

                // LeBron does a pump fake (Bellingham crossover style)
                if (time >= 7.5) {
                    if (tatum) {
                        // Tatum leaps in the air, falling for pump fake!
                        tatum.group.position.y = 0.020;
                    }
                    // LeBron prepares to pass to A. Reaves at (0.03, 0.009, -0.035)
                    const passT = Math.min((time - 7.5) / 2.0, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        new THREE.Vector3(-0.035, 0.015, -0.04),
                        new THREE.Vector3(0.03, 0.015, -0.035), // Reaves behind 3-pt line
                        passT
                    );
                    // Reaves Receive (Basketball, phase 3): Accelerate run to dt * 20.0
                    if (reaves) runPlayer(reaves, 0.03, -0.035, dt * 20.0);
                }
            } else if (time >= 10.0 && time < 15.0) {
                // --- Reaves catches, Jumps & shoots 3-Pointer (10.0s - 15.0s) ---
                showPlayerCard("p3"); // Highlight Reaves card
                if (tatum) {
                    tatum.group.position.y = 0.009; // stand back down
                    stopPlayer(tatum);
                }
                if (james) stopPlayer(james);

                // Reaves Catch (Basketball, phase 4): Snap position to catching spot (0.03, 0.009, -0.035)
                if (reaves) {
                    reaves.group.position.set(0.03, 0.009, -0.035);
                    reaves.group.rotation.y = -Math.PI / 4; // Face hoop
                }
                this.sequenceBall.position.set(0.03, 0.015, -0.035);

                // Reaves Jumps high!
                if (time >= 11.5) {
                    if (reaves) reaves.group.position.y = 0.022; // jump shot
                    
                    // High parabolic 3-pointer flight to Goal 1 Hoop at (0.0, 0.0125, -0.041)
                    const flightT = Math.min((time - 12.0) / 2.5, 1.0);
                    if (time >= 12.0) {
                        const startPos = new THREE.Vector3(0.03, 0.022, -0.035);
                        const endPos = new THREE.Vector3(0.0, 0.0135, -0.041);
                        this.sequenceBall.position.set(
                            startPos.x + (endPos.x - startPos.x) * flightT,
                            startPos.y + (endPos.y - startPos.y) * flightT + 0.025 * Math.sin(flightT * Math.PI), // elegant high 3-pt arc
                            startPos.z + (endPos.z - startPos.z) * flightT
                        );
                    }
                }
            } else if (time >= 15.0 && time < 20.0) {
                // --- Ball swooshes through net, Hoop wiggles, scoring celebrate (15.0s - 20.0s) ---
                showPlayerCard("p3"); // Highlight Reaves
                if (reaves) reaves.group.position.y = 0.009; // land back on court
                if (reaves) stopPlayer(reaves);

                // Ball swooshes through hoop
                const swishT = Math.min((time - 15.0) / 0.8, 1.0);
                this.sequenceBall.position.lerpVectors(
                    new THREE.Vector3(0.0, 0.0135, -0.041),
                    new THREE.Vector3(0.0, 0.005, -0.041),
                    swishT
                );

                if (time >= 15.8 && time < 15.9) {
                    // Net wiggles!
                    this.isHoopWiggling = true;
                    this.hoopWiggleTime = 0.0;
                    this.wigglingHoopNet = this.hoop1NetMesh;
                    // Flash basketball rim crimson red
                    if (this.basketballHoop1 && (this.basketballHoop1 as any).rimMesh) {
                        const rim = (this.basketballHoop1 as any).rimMesh as THREE.Mesh;
                        (rim.material as THREE.MeshBasicMaterial).color.setHex(0xff3300);
                    }
                    // Trigger sparkler
                    this.triggerFirework(0.0, 0.0125, -0.041, 0xf97316, 0.015);
                }

                // Show 3-POINTER celebration card
                if (time >= 16.5) {
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.075, 0.0);
                    this.sportCelebrationCard.visible = false;
                    // Redraw canvas with 3-POINTER
                    const ctx = this.celebrationCardCtx;
                    ctx.fillStyle = 'rgba(10, 15, 45, 0.9)';
                    ctx.fillRect(0, 0, 256, 128);
                    ctx.strokeStyle = '#f97316';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(4, 4, 248, 120);
                    const grad = ctx.createLinearGradient(0, 0, 256, 0);
                    grad.addColorStop(0, '#f97316');
                    grad.addColorStop(1, '#ffff00');
                    ctx.fillStyle = grad;
                    ctx.font = 'bold italic 38px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("3-POINTER!!!", 128, 64);
                    this.sportCelebrationTexture.needsUpdate = true;
                }
            }
        }

        // --- 4. TRAIL RECORDING ---
        if (time < 20.0) {
            const floorY = this.getFloorY();
            const ballRadius = 0.0022 * this.sequenceBall.scale.x;
            if (this.sequenceBall.position.y < floorY + ballRadius) {
                this.sequenceBall.position.y = floorY + ballRadius;
            }

            this.sequenceBallPoints.push(this.sequenceBall.position.clone());
            if (this.sequenceBallPoints.length > 50) this.sequenceBallPoints.shift();
            this.sequenceBallTrail.geometry.setFromPoints(this.sequenceBallPoints);
        } else {
            // Ball and trail fade out
            this.sequenceBall.visible = false;
            this.sequenceBallTrail.visible = false;
        }

        // --- 5. AUTOMATIC CELEBRATION CHOREOGRAPHED STAGED FIREWORKS & RESET ---
        if (time >= 20.0 && this.sportSequencePhase < 4) {
            this.sportSequencePhase = 4; // Finished stage
            this.sportCelebrationCard.visible = false;
            this.sequenceBall.visible = false;
            this.sequenceBallTrail.visible = false;
            showPlayerCard(null); // Hide all stats cards
            
            // Trigger the ultimate 4-stage choreographed spatial pyrotechnics sequence!
            this.triggerManualFireworks();
            console.log("[SportSequence] 20s Replay complete! Staged pyrotechnics triggered.");
        }

        // --- 6. CELEBRATION CARD FLOAT ---
        if (time < 20.0 && this.sportCelebrationCard.visible) {
            const cardTime = Math.max(time - 8.0, 0.0);
            
            // Bouncy spring scale LERP
            const targetScale = 1.3;
            const currentScale = Math.min(cardTime * 5.0, 1.0);
            const scaleFactor = Math.sin(currentScale * Math.PI / 2.0) * targetScale;
            this.sportCelebrationCard.scale.set(scaleFactor, scaleFactor, scaleFactor);

            // Gentle floating orientation towards player/camera
            this.sportCelebrationCard.position.y = this.ROOF_Y + 0.075 + Math.sin(time * 4.5) * 0.003;
            this.sportCelebrationCard.rotation.y = Math.sin(time * 0.8) * 0.08;
        }

        // --- 7. AUTO-RESET AND SHUT DOWN REPLAY STATE AFTER SHOW ENDS (26.0s) ---
        if (time >= 26.0) {
            this.isSportSequenceActive = false;
            this.sportCelebrationCard.visible = false;
            if (this.arBillboard) {
                this.arBillboard.visible = true; // restore match scoreboard
            }
            
            // Restore rim colors if they were changed
            if (this.basketballHoop1 && (this.basketballHoop1 as any).rimMesh) {
                const rim = (this.basketballHoop1 as any).rimMesh as THREE.Mesh;
                (rim.material as THREE.MeshBasicMaterial).color.setHex(0xf97316); // restore orange rim
            }

            // Restore players to their exact original base positions
            this.players.forEach(p => {
                p.group.position.copy(p.originalBasePos);
                p.group.position.y = 0.009;
                if (p.originalBasePos.x !== 0 || p.originalBasePos.z !== 0) {
                    p.group.rotation.y = Math.atan2(-p.originalBasePos.x, -p.originalBasePos.z);
                } else {
                    p.group.rotation.y = 0;
                }
                p.mesh.rotation.set(0, 0, 0);
                showPlayerCard(null);
            });

            // Restore wickets & bat
            if (this.cricketStumpsMesh) {
                this.cricketStumpsMesh.rotation.set(0, 0, 0);
                this.cricketStumpsMesh.position.set(0.045, 0.009, 0);
                this.cricketStumpsMesh.traverse((child: any) => {
                    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                        child.material.color.setHex(0x00ff66);
                    }
                });
            }
            if (this.cricketBatMesh) {
                this.cricketBatMesh.rotation.set(0, 0, 0);
                this.cricketBatMesh.position.set(0.035, 0.009, 0);
            }

            console.log("[SportSequence] Full replay lifecycle complete. Minimap state restored.");
        }
    }

    private updateBallProjectorDisk() {
        if (!this.ballProjectorDisk) return;

        let activeBall: THREE.Mesh | null = null;

        if (this.isSportSequenceActive && this.sequenceBall && this.sequenceBall.visible) {
            activeBall = this.sequenceBall;
        } else if (this.isBallAnimating && this.activeBall && this.activeBall.visible) {
            activeBall = this.activeBall;
        } else if (this.isSandboxBallActive && this.sandboxBall && this.sandboxBall.visible) {
            activeBall = this.sandboxBall;
        } else if (this.isHawkeyeRunning && this.hawkeyeBall && this.hawkeyeBall.visible) {
            activeBall = this.hawkeyeBall;
        }

        if (activeBall) {
            this.ballProjectorDisk.visible = true;
            const floorY = this.getFloorY();
            const ballRadius = 0.0022 * activeBall.scale.x;
            
            // Position projector disk on the stadium floor directly under the ball
            this.ballProjectorDisk.position.set(activeBall.position.x, floorY + 0.0005, activeBall.position.z);
            
            // Color match with ball
            const ballColor = (activeBall.material as THREE.MeshBasicMaterial).color;
            if (ballColor) {
                this.ballProjectorDiskMat.color.copy(ballColor);
            }
            
            // Scale and opacity adjustment based on altitude/height above floor
            const height = Math.max(activeBall.position.y - (floorY + ballRadius), 0.0);
            const scaleFactor = 1.0 + Math.min(height * 20.0, 2.0);
            this.ballProjectorDisk.scale.setScalar(scaleFactor);
            
            // Projector beam fades out as the ball ascends higher
            this.ballProjectorDiskMat.opacity = Math.max(0.7 - height * 8.0, 0.0);
        } else {
            this.ballProjectorDisk.visible = false;
        }
    }

    private updateNetsWiggling(dt: number) {
        // Football net wiggle
        if (this.isGoalWiggling && this.wigglingGoalNet) {
            this.goalWiggleTime += dt;
            const t = this.goalWiggleTime;
            if (t >= 1.0) {
                this.isGoalWiggling = false;
                this.wigglingGoalNet.scale.set(1.0, 1.0, 1.0);
                const mat = this.wigglingGoalNet.material;
                if (mat instanceof THREE.Material) {
                    mat.opacity = 0.45;
                }
                if (mat instanceof THREE.LineBasicMaterial) {
                    mat.color.setHex(0x00ffff);
                }
            } else {
                // High frequency vibration damping
                const decay = Math.exp(-t * 3.5);
                const scaleY = 1.0 + Math.sin(t * 40.0) * 0.08 * decay;
                const scaleZ = 1.0 + Math.cos(t * 40.0) * 0.08 * decay;
                this.wigglingGoalNet.scale.set(1.0, scaleY, scaleZ);

                // Flash net color rapidly between cyan and neon gold
                const flash = Math.sin(t * 50.0) > 0.0;
                if (this.wigglingGoalNet.material instanceof THREE.LineBasicMaterial) {
                    (this.wigglingGoalNet.material as THREE.LineBasicMaterial).color.setHex(flash ? 0xffd700 : 0x00ffff);
                }
            }
        }

        // Basketball net wiggle
        if (this.isHoopWiggling && this.wigglingHoopNet) {
            this.hoopWiggleTime += dt;
            const t = this.hoopWiggleTime;
            if (t >= 1.0) {
                this.isHoopWiggling = false;
                this.wigglingHoopNet.scale.set(1.0, 1.0, 1.0);
                if (this.wigglingHoopNet.material instanceof THREE.LineBasicMaterial) {
                    (this.wigglingHoopNet.material as THREE.LineBasicMaterial).color.setHex(0x00ffff);
                }
            } else {
                // Net compress/shake swish animation
                const decay = Math.exp(-t * 4.0);
                const compressX = 1.0 - 0.2 * Math.exp(-t * 8.0) + Math.sin(t * 35.0) * 0.06 * decay;
                const compressZ = 1.0 - 0.2 * Math.exp(-t * 8.0) + Math.cos(t * 35.0) * 0.06 * decay;
                const stretchY = 1.0 + 0.15 * Math.exp(-t * 8.0);
                this.wigglingHoopNet.scale.set(compressX, stretchY, compressZ);

                // Flash net color between cyan and orange
                const flash = Math.sin(t * 45.0) > 0.0;
                if (this.wigglingHoopNet.material instanceof THREE.LineBasicMaterial) {
                    (this.wigglingHoopNet.material as THREE.LineBasicMaterial).color.setHex(flash ? 0xf97316 : 0x00ffff);
                }
            }
        }
    }

    private createButterflyGroup() {
        this.butterflyGroup = new THREE.Group();
        
        // 1. Create a flat ground for Butterfly Park
        const groundGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.002, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x042f2e, // Deep holographic green-teal
            roughness: 0.85,
            metalness: 0.1,
            transparent: true,
            opacity: 0.35
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = 0.001;
        ground.receiveShadow = true;
        this.butterflyGroup.add(ground);
        
        // 2. Add an elegant grid on top of the ground
        const gridHelper = new THREE.GridHelper(0.36, 12, 0x10b981, 0x064e3b);
        gridHelper.position.y = 0.00205;
        this.butterflyGroup.add(gridHelper);
        
        // 3. Add a glowing green border ring
        const borderGeo = new THREE.TorusGeometry(0.18, 0.0015, 8, 100);
        borderGeo.rotateX(Math.PI / 2);
        const borderMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.y = 0.00205;
        this.butterflyGroup.add(border);
        
        // 4. Create and add 12 butterflies fluttering above the ground
        this.butterflies = [];
        const numButterflies = 12;
        
        const bodyGeo = new THREE.CylinderGeometry(0.0006, 0.0006, 0.005, 8);
        bodyGeo.rotateX(Math.PI / 2);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x022c22 }); // Very dark green body
        
        const wingMatLeft = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        const wingMatRight = new THREE.MeshBasicMaterial({
            color: 0x059669,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        
        for (let i = 0; i < numButterflies; i++) {
            const bGroup = new THREE.Group();
            
            // Butterfly body
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            bGroup.add(body);
            
            // Left wing
            const leftWingGeo = new THREE.BufferGeometry();
            const leftVertices = new Float32Array([
                0, 0, 0,
                -0.006, 0, 0.004,
                -0.005, 0, -0.004
            ]);
            leftWingGeo.setAttribute('position', new THREE.BufferAttribute(leftVertices, 3));
            const leftWing = new THREE.Mesh(leftWingGeo, wingMatLeft);
            bGroup.add(leftWing);
            
            // Right wing
            const rightWingGeo = new THREE.BufferGeometry();
            const rightVertices = new Float32Array([
                0, 0, 0,
                0.005, 0, -0.004,
                0.006, 0, 0.004
            ]);
            rightWingGeo.setAttribute('position', new THREE.BufferAttribute(rightVertices, 3));
            const rightWing = new THREE.Mesh(rightWingGeo, wingMatRight);
            bGroup.add(rightWing);
            
            // Position
            const theta = Math.random() * Math.PI * 2;
            const r = 0.02 + Math.random() * 0.12;
            const pos = new THREE.Vector3(
                r * Math.cos(theta),
                0.02 + Math.random() * 0.08,
                r * Math.sin(theta)
            );
            
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.03
            );
            
            const baseScale = 0.8 + Math.random() * 0.6;
            bGroup.scale.setScalar(baseScale);
            bGroup.position.copy(pos);
            
            this.butterflyGroup.add(bGroup);
            
            this.butterflies.push({
                mesh: bGroup,
                leftWing,
                rightWing,
                speed: 12 + Math.random() * 8,
                phase: Math.random() * Math.PI * 2,
                pos,
                vel,
                wanderTime: Math.random() * 2.0,
                baseScale
            });
        }
        
        this.tableGroup.add(this.butterflyGroup);
    }

    private createNurburgringGroup() {
        this.nurburgringGroup = new THREE.Group();
        this.nurburgringGroup.position.y = 0.01; // Raise the road map on the ring up by 1 cm

        // 1. Create a flat ground base (Deep holographic cyan-blue)
        const groundGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.002, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x003355, // Deep holographic cyan-blue
            roughness: 0.9,
            metalness: 0.3,
            transparent: true,
            opacity: 0.35
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = 0.001;
        ground.receiveShadow = true;
        this.nurburgringGroup.add(ground);

        // 2. Add an elegant grid on top of the ground
        const gridHelper = new THREE.GridHelper(0.36, 12, 0x00ffff, 0x111122);
        gridHelper.position.y = 0.00205;
        this.nurburgringGroup.add(gridHelper);

        // 3. Add a glowing neon cyan border ring
        const borderGeo = new THREE.TorusGeometry(0.18, 0.0015, 8, 100);
        borderGeo.rotateX(Math.PI / 2);
        const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.y = 0.00205;
        this.nurburgringGroup.add(border);

        // 4. Closed winding 3D Spline representing Nürburgring with topography elevations
        const points = [
            new THREE.Vector3( 0.00,  0.003, -0.09), // Start/GP Straight
            new THREE.Vector3( 0.04,  0.005, -0.08), // Hatzenbach
            new THREE.Vector3( 0.08,  0.012, -0.05), // Flugplatz (elevation!)
            new THREE.Vector3( 0.06,  0.002, -0.01), // Fuchsroehre (dip!)
            new THREE.Vector3( 0.09,  0.008,  0.03), // Adenauer Forst
            new THREE.Vector3( 0.02,  0.006,  0.07), // Wehrseifen
            new THREE.Vector3(-0.03,  0.003,  0.09), // Karussell (steep bank / dip)
            new THREE.Vector3(-0.08,  0.010,  0.05), // Hohe Acht (highest point!)
            new THREE.Vector3(-0.07,  0.005, -0.01), // Pflanzgarten
            new THREE.Vector3(-0.05,  0.002, -0.06), // Schwalbenschwanz
            new THREE.Vector3(-0.03,  0.002, -0.08)  // Döttinger Höhe
        ];
        this.nurburgringCurve = new THREE.CatmullRomCurve3(points, true);
        this.nurburgringFrenetFrames = this.nurburgringCurve.computeFrenetFrames(1000, true);

        // 5. Extrude 3D flat road Geometry along spline
        const roadWidth = 0.018; // 50% wider road (previously 0.012)
        const roadThickness = 0.001;
        const roadShape = new THREE.Shape();
        roadShape.moveTo(-roadWidth / 2, -roadThickness / 2);
        roadShape.lineTo(roadWidth / 2, -roadThickness / 2);
        roadShape.lineTo(roadWidth / 2, roadThickness / 2);
        roadShape.lineTo(-roadWidth / 2, roadThickness / 2);
        roadShape.closePath();

        const extrudeSettings = {
            steps: 128,
            bevelEnabled: false,
            extrudePath: this.nurburgringCurve
        };
        const trackGeo = new THREE.ExtrudeGeometry(roadShape, extrudeSettings);
        this.nurburgringTrackMat = new THREE.MeshStandardMaterial({
            color: 0x1b1b22, // Dark asphalt gray
            roughness: 0.75,
            metalness: 0.25
        });
        const trackMesh = new THREE.Mesh(trackGeo, this.nurburgringTrackMat);
        trackMesh.receiveShadow = true;
        trackMesh.castShadow = true;
        this.nurburgringGroup.add(trackMesh);

        // 6. Overlay glowing neon racing outline guide line
        const linePoints = this.nurburgringCurve.getPoints(200);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x22d3ee, // Cyberpunk neon cyan
            linewidth: 2,
            transparent: true,
            opacity: 0.75
        });
        const lineMesh = new THREE.Line(lineGeo, lineMat);
        this.nurburgringGroup.add(lineMesh);

        // 7. Spawn the 3 detailed F1 cars (20% smaller)
        this.nurburgringCars = [];
        this.nurburgringF1WheelMats = [];

        // Mercedes: Silver body, white helmet, teal visor/axle accents (tracked car with HUD)
        this.nurburgringF1Car = new THREE.Group();
        this.nurburgringF1Wheels = [];
        this.nurburgringF1WheelMats = [];
        const merc = this.createDetailedF1Car(0xa1a1aa, 0xffffff, 0x00d2be, 'merc');
        this.nurburgringF1Car.add(merc.car);
        this.nurburgringF1Wheels = merc.wheels;
        this.createNurburgringF1HUD();
        this.nurburgringGroup.add(this.nurburgringF1Car);

        // Red Bull: Dark Blue body, yellow helmet, red visor/axle accents
        const rb = this.createDetailedF1Car(0x0c1630, 0xeab308, 0xef4444, 'redbull');
        this.nurburgringGroup.add(rb.car);

        // Ferrari: Rosso Corsa body, black helmet, white visor/axle accents
        const ferrari = this.createDetailedF1Car(0xd10000, 0x18181b, 0xffffff, 'ferrari');
        this.nurburgringGroup.add(ferrari.car);

        this.nurburgringCars.push(
            { group: this.nurburgringF1Car, progress: 0.0, speed: 0.052, wheels: this.nurburgringF1Wheels, colorType: 'merc' },
            { group: rb.car, progress: 0.0, speed: 0.052, wheels: rb.wheels, colorType: 'redbull' },
            { group: ferrari.car, progress: 0.0, speed: 0.052, wheels: ferrari.wheels, colorType: 'ferrari' }
        );

        this.tableGroup.add(this.nurburgringGroup);
        this.initNurburgringVortexAndSpray();
        console.log("[NurburgringMap] High-fidelity wider racetrack, line guides, and 3 detailed F1 racing cars initialized!");
    }

    private createDetailedF1Car(bodyColor: number, helmetColor: number, visorColor: number, colorType: 'merc' | 'redbull' | 'ferrari') {
        const car = new THREE.Group();
        const wheels: THREE.Mesh[] = [];

        // Materials
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.1,
            metalness: 0.8
        });
        const carbonMat = new THREE.MeshStandardMaterial({
            color: 0x18181b, // Carbon chassis base
            roughness: 0.5,
            metalness: 0.9
        });
        const helmetMat = new THREE.MeshStandardMaterial({
            color: helmetColor,
            roughness: 0.2
        });
        const visorMat = new THREE.MeshBasicMaterial({
            color: visorColor
        });
        const axleMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db, // Silver metal axles
            roughness: 0.2,
            metalness: 0.8
        });

        // 1. Carbon chassis base
        const baseGeo = new THREE.BoxGeometry(0.004, 0.0008, 0.014);
        const baseMesh = new THREE.Mesh(baseGeo, carbonMat);
        baseMesh.position.y = 0.0006;
        car.add(baseMesh);

        // 2. Tapered body nosecone (+Z is front)
        const noseGeo = new THREE.BoxGeometry(0.002, 0.001, 0.007);
        const noseMesh = new THREE.Mesh(noseGeo, bodyMat);
        noseMesh.position.set(0, 0.0012, 0.0035);
        noseMesh.rotation.x = -0.1;
        car.add(noseMesh);

        // 3. Side pods (left and right)
        const podGeo = new THREE.BoxGeometry(0.0018, 0.0015, 0.006);
        const leftPod = new THREE.Mesh(podGeo, bodyMat);
        leftPod.position.set(-0.0024, 0.0012, -0.001);
        const rightPod = new THREE.Mesh(podGeo, bodyMat);
        rightPod.position.set(0.0024, 0.0012, -0.001);
        car.add(leftPod, rightPod);

        // 4. Driver Cockpit & Helmet
        const cockpitGeo = new THREE.BoxGeometry(0.0018, 0.0008, 0.003);
        const cockpitMesh = new THREE.Mesh(cockpitGeo, carbonMat);
        cockpitMesh.position.set(0, 0.0018, -0.0015);
        car.add(cockpitMesh);

        // Helmet
        const helmetGeo = new THREE.SphereGeometry(0.0009, 16, 16);
        const helmetMesh = new THREE.Mesh(helmetGeo, helmetMat);
        helmetMesh.position.set(0, 0.0026, -0.0015);
        car.add(helmetMesh);

        // Visor
        const visorGeo = new THREE.BoxGeometry(0.0012, 0.0004, 0.0006);
        const visorMesh = new THREE.Mesh(visorGeo, visorMat);
        visorMesh.position.set(0, 0.0028, -0.001);
        car.add(visorMesh);

        // 5. Front Wing with Endplates
        const frontWingGeo = new THREE.BoxGeometry(0.0075, 0.0003, 0.0015);
        const frontWing = new THREE.Mesh(frontWingGeo, carbonMat);
        frontWing.position.set(0, 0.0008, 0.007);
        car.add(frontWing);

        const endplateGeo = new THREE.BoxGeometry(0.0002, 0.0015, 0.0018);
        const leftFrontEndplate = new THREE.Mesh(endplateGeo, bodyMat);
        leftFrontEndplate.position.set(-0.00375, 0.0014, 0.007);
        const rightFrontEndplate = new THREE.Mesh(endplateGeo, bodyMat);
        rightFrontEndplate.position.set(0.00375, 0.0014, 0.007);
        car.add(leftFrontEndplate, rightFrontEndplate);

        // 6. Rear Wing with Endplates
        const rearWingGeo = new THREE.BoxGeometry(0.007, 0.0004, 0.002);
        const rearWing = new THREE.Mesh(rearWingGeo, bodyMat);
        rearWing.position.set(0, 0.0035, -0.007);
        car.add(rearWing);

        // Struts
        const strutGeo = new THREE.BoxGeometry(0.0004, 0.0025, 0.0004);
        const leftStrut = new THREE.Mesh(strutGeo, carbonMat);
        leftStrut.position.set(-0.001, 0.00225, -0.007);
        const rightStrut = new THREE.Mesh(strutGeo, carbonMat);
        rightStrut.position.set(0.001, 0.00225, -0.007);
        car.add(leftStrut, rightStrut);

        // Rear endplates
        const rearEndplateGeo = new THREE.BoxGeometry(0.0002, 0.0032, 0.0024);
        const leftRearEndplate = new THREE.Mesh(rearEndplateGeo, carbonMat);
        leftRearEndplate.position.set(-0.0035, 0.0031, -0.007);
        const rightRearEndplate = new THREE.Mesh(rearEndplateGeo, carbonMat);
        rightRearEndplate.position.set(0.0035, 0.0031, -0.007);
        car.add(leftRearEndplate, rightRearEndplate);

        const wheelGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 0.0012, 16);
        wheelGeo.rotateZ(Math.PI / 2);

        const axleGeo = new THREE.CylinderGeometry(0.0003, 0.0003, 0.0068, 8);
        axleGeo.rotateZ(Math.PI / 2);

        // Front Axle
        const frontAxle = new THREE.Mesh(axleGeo, axleMat);
        frontAxle.position.set(0, 0.0009, 0.0048);
        car.add(frontAxle);

        // Rear Axle
        const rearAxle = new THREE.Mesh(axleGeo, axleMat);
        rearAxle.position.set(0, 0.0009, -0.0048);
        car.add(rearAxle);

        // 4 Wheels
        const wheelOffsets = [
            { x: -0.0037, z: 0.0048 },
            { x: 0.0037, z: 0.0048 },
            { x: -0.0037, z: -0.0048 },
            { x: 0.0037, z: -0.0048 }
        ];

        wheelOffsets.forEach((offset) => {
            const wMat = new THREE.MeshStandardMaterial({
                color: 0x09090b,
                roughness: 0.9,
                metalness: 0.1,
                emissive: new THREE.Color(0x000000)
            });
            if (colorType === 'merc') {
                this.nurburgringF1WheelMats.push(wMat);
            }
            const wheel = new THREE.Mesh(wheelGeo, wMat);
            wheel.position.set(offset.x, 0.001, offset.z);
            wheel.castShadow = true;
            car.add(wheel);
            wheels.push(wheel);
        });

        // 20% smaller F1 car size scale applied to the entire group
        car.scale.setScalar(0.8);

        return { car, wheels };
    }

    private createNurburgringF1HUD() {
        // --- 8. F1 TELEMETRY HUD INITIALIZATION ---
        this.f1HudCanvas = document.createElement('canvas');
        this.f1HudCanvas.width = 256;
        this.f1HudCanvas.height = 128;
        this.f1HudCtx = this.f1HudCanvas.getContext('2d')!;

        this.f1HudTexture = new THREE.CanvasTexture(this.f1HudCanvas);
        this.f1HudTexture.colorSpace = THREE.SRGBColorSpace;

        this.f1HudMat = new THREE.MeshBasicMaterial({
            map: this.f1HudTexture,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Scaled to compensate for the F1 car group 0.8 scale so HUD is 50% larger (0.030x0.015) in world space
        const hudGeom = new THREE.PlaneGeometry(0.0375, 0.01875);
        this.f1HudMesh = new THREE.Mesh(hudGeom, this.f1HudMat);
        // Position it floating directly above the driver helmet inside F1 car local space
        this.f1HudMesh.position.set(0, 0.01875, -0.001875);
        this.nurburgringF1Car.add(this.f1HudMesh);
    }

    private initNurburgringVortexAndSpray() {
        // --- 9. F1 VORTEX VAPOR TRAILS INITIALIZATION ---
        const vortexLeftGeo = new THREE.BufferGeometry();
        const vortexRightGeo = new THREE.BufferGeometry();
        
        const vortexMat = new THREE.LineBasicMaterial({
            color: 0x22d3ee, // Cyberpunk cyan glow
            transparent: true,
            opacity: 0.0, // starts hidden
            linewidth: 2,
            depthWrite: false
        });

        this.f1VortexLeft = new THREE.Line(vortexLeftGeo, vortexMat);
        this.f1VortexRight = new THREE.Line(vortexRightGeo, vortexMat);
        if (this.nurburgringGroup) {
            this.nurburgringGroup.add(this.f1VortexLeft, this.f1VortexRight);
        }
        this.f1VortexLeftPoints = [];
        this.f1VortexRightPoints = [];
        for (let i = 0; i < 25; i++) {
            this.f1VortexLeftPoints.push(new THREE.Vector3());
            this.f1VortexRightPoints.push(new THREE.Vector3());
        }

        // --- 10. F1 WET SPRAY INSTANCED PARTICLES ---
        const sprayGeom = new THREE.BoxGeometry(0.0006, 0.0006, 0.0006);
        const sprayMat = new THREE.MeshBasicMaterial({
            color: 0xddddff,
            transparent: true,
            opacity: 0.0, // starts hidden/faded
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        // 60 particles max
        this.f1SprayMesh = new THREE.InstancedMesh(sprayGeom, sprayMat, 60);
        if (this.nurburgringGroup) {
            this.nurburgringGroup.add(this.f1SprayMesh);
        }

        // Pre-allocate Float32Array for particle states (60 particles * 8 values: x, y, z, vx, vy, vz, age, active)
        this.f1SprayData = new Float32Array(60 * 8);

        // Hide initially
        if (this.nurburgringF1Car) this.nurburgringF1Car.visible = false;
    }

    private createNavLabel(text: string, colorString: string): THREE.Mesh {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        
        ctx.clearRect(0, 0, 256, 64);
        
        ctx.strokeStyle = colorString;
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(5, 5, 15, 0.85)';
        
        const r = 8;
        ctx.beginPath();
        ctx.roundRect(4, 4, 248, 56, r);
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowColor = colorString;
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        
        const geom = new THREE.PlaneGeometry(0.06, 0.015);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = "label";
        return mesh;
    }

    private createNavPlaceholders() {
        // 1. Parking Area (x = -0.11, z = 0.11)
        const parkingGroup = new THREE.Group();
        parkingGroup.position.set(-0.11, 0.002, 0.11);
        
        const parkGeo = new THREE.BoxGeometry(0.05, 0.001, 0.05);
        const parkMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 });
        const parkMesh = new THREE.Mesh(parkGeo, parkMat);
        parkingGroup.add(parkMesh);
        
        const parkEdgeGeo = new THREE.EdgesGeometry(parkGeo);
        const parkEdgeMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
        const parkEdge = new THREE.LineSegments(parkEdgeGeo, parkEdgeMat);
        parkingGroup.add(parkEdge);
        
        const parkLabel = this.createNavLabel("P - PARKING", "#3b82f6");
        parkLabel.position.set(0, 0.035, 0);
        parkingGroup.add(parkLabel);
        
        this.navPlaceholdersGroup.add(parkingGroup);
        
        // 2. Restrooms (x = 0.11, z = 0.11)
        const toiletGroup = new THREE.Group();
        toiletGroup.position.set(0.11, 0.002, 0.11);
        
        const cylGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 16);
        const toiletMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.8 });
        const toiletMesh = new THREE.Mesh(cylGeo, toiletMat);
        toiletMesh.position.y = 0.01;
        toiletGroup.add(toiletMesh);
        
        const toiletLabel = this.createNavLabel("RESTROOMS", "#3b82f6");
        toiletLabel.position.set(0, 0.035, 0);
        toiletGroup.add(toiletLabel);
        
        this.navPlaceholdersGroup.add(toiletGroup);
        
        // 3. Food Court (x = 0.11, z = -0.11)
        const foodGroup = new THREE.Group();
        foodGroup.position.set(0.11, 0.002, -0.11);
        
        const foodGeo = new THREE.BoxGeometry(0.025, 0.02, 0.025);
        const foodMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 });
        const foodMesh = new THREE.Mesh(foodGeo, foodMat);
        foodMesh.position.y = 0.01;
        foodGroup.add(foodMesh);
        
        const foodLabel = this.createNavLabel("FOOD & DRINK", "#10b981");
        foodLabel.position.set(0, 0.035, 0);
        foodGroup.add(foodLabel);
        
        this.navPlaceholdersGroup.add(foodGroup);
        
        // 4. First Aid (x = -0.11, z = -0.11)
        const medicalGroup = new THREE.Group();
        medicalGroup.position.set(-0.11, 0.002, -0.11);
        
        const medGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
        const medMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
        const medMesh = new THREE.Mesh(medGeo, medMat);
        medMesh.position.y = 0.011;
        medicalGroup.add(medMesh);
        
        const crossGeoH = new THREE.BoxGeometry(0.012, 0.003, 0.023);
        const crossGeoV = new THREE.BoxGeometry(0.003, 0.012, 0.023);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crossH = new THREE.Mesh(crossGeoH, crossMat);
        crossH.position.set(0, 0.011, 0);
        const crossV = new THREE.Mesh(crossGeoV, crossMat);
        crossV.position.set(0, 0.011, 0);
        medicalGroup.add(crossH, crossV);
        
        const medLabel = this.createNavLabel("FIRST AID", "#ef4444");
        medLabel.position.set(0, 0.035, 0);
        medicalGroup.add(medLabel);
        
        this.navPlaceholdersGroup.add(medicalGroup);
    }
}
