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
    } else if (isMatch('ameneties')) {
        newMat.color.setHex(0x0ea5e9); // Sleek sky blue/cyan default
        newMat.roughness = 0.2;
        newMat.metalness = 0.8;
        newMat.transparent = true;
        newMat.opacity = 0.75;
    } else if (isMatch('net')) {
        newMat.color.setHex(0x00ffff); // Cyan glowing net
        newMat.emissive.setHex(0x008888);
        newMat.roughness = 0.5;
        newMat.metalness = 0.1;
        newMat.transparent = true;
        newMat.opacity = 0.55;
    } else if (isMatch('goal') || isMatch('post') || isMatch('basket')) {
        newMat.color.setHex(0xffffff); // Clean white post/hoop frame
        newMat.roughness = 0.1;
        newMat.metalness = 0.8;
        newMat.transparent = true;
        newMat.opacity = 0.9;
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
    private wristBtnCanvas!: HTMLCanvasElement;
    private wristBtnTexture!: THREE.CanvasTexture;
    private wristWasTouching = false;
    private wristHoldTimer = 0.0;
    // Quit confirmation popup
    private isQuitPopupVisible = false;
    private quitPopup!: THREE.Mesh;
    private quitPopupMat!: THREE.MeshBasicMaterial;
    private quitPopupCanvas!: HTMLCanvasElement;
    private quitPopupTexture!: THREE.CanvasTexture;
    private quitPopupHoveredBtn = -1; // 0 = YES, 1 = NO

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

    private f1RosterBgImage: HTMLImageElement | null = null;

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


    private scoreDisplayMeshes: THREE.Mesh[] = [];
    private iplTextures: (THREE.Texture | null)[] = [];
    private soccerTextures: (THREE.Texture | null)[] = [];
    private iplBillboardTexture: THREE.Texture | null = null;
    private soccerBillboardTexture: THREE.Texture | null = null;
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
        colorType: 'merc' | 'ferrari' | 'mclaren',
        driverId: string
    }[] = [];
    private holoCylinder!: THREE.Mesh;
    private holoCylinderWire!: THREE.LineSegments;
    private nurburgringF1Car!: THREE.Group;
    private nurburgringF1Wheels: THREE.Mesh[] = [];
    private nurburgringF1WheelMats: THREE.MeshBasicMaterial[] = [];
    private nurburgringF1Progress = 0.0;
    private nurburgringOvertakePhase = 0.0;
    private nurburgringF1Speed = 0.052;
    private nurburgringTrackMat!: THREE.MeshBasicMaterial;
    private monacoRoadMesh: THREE.Group | null = null;
    private carRaycaster = new THREE.Raycaster();
    private carRayDirection = new THREE.Vector3(0, -1, 0);
    private f1Markers: THREE.Mesh[] = [];

    // --- F1 Live Roster and Spawning Player Cards ---
    private f1RosterMesh!: THREE.Mesh;
    private f1RosterCanvas!: HTMLCanvasElement;
    private f1RosterCtx!: CanvasRenderingContext2D;
    private f1RosterTexture!: THREE.CanvasTexture;
    private f1RosterMat!: THREE.MeshBasicMaterial;
    private f1RosterHoveredRowIndex = -1;
    private f1RosterMinimized = false;
    private f1TouchCooldown = 0.0;

    private f1ActiveCardGroup!: THREE.Group;
    private f1ActiveCardImgMesh!: THREE.Mesh;
    private f1ActiveCardMesh!: THREE.Mesh;
    private f1ActiveCardCanvas!: HTMLCanvasElement;
    private f1ActiveCardCtx!: CanvasRenderingContext2D;
    private f1ActiveCardTexture!: THREE.CanvasTexture;
    private f1ActiveCardMat!: THREE.MeshBasicMaterial;
    private f1ActiveCardDriverId: string | null = null;
    private f1ActiveCardTimer = 0.0;

    private f1CarLaps: Record<string, number> = { f1_gr: 1, f1_ka: 1, f1_cl: 1, f1_lh: 1, f1_ln: 1, f1_op: 1 };
    private f1CarPrevProgress: Record<string, number> = { f1_gr: 0, f1_ka: 0, f1_cl: 0, f1_lh: 0, f1_ln: 0, f1_op: 0 };


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
    private f1VortexInitialized = false;

    private f1VortexLeft_RB!: THREE.Line;
    private f1VortexRight_RB!: THREE.Line;
    private f1VortexLeftPoints_RB: THREE.Vector3[] = [];
    private f1VortexRightPoints_RB: THREE.Vector3[] = [];

    private f1VortexLeft_FE!: THREE.Line;
    private f1VortexRight_FE!: THREE.Line;
    private f1VortexLeftPoints_FE: THREE.Vector3[] = [];
    private f1VortexRightPoints_FE: THREE.Vector3[] = [];

    // F1 Wet Spray Particles
    private f1SprayMesh!: THREE.InstancedMesh;
    private f1SprayData!: Float32Array; // 360 particles: x, y, z, vx, vy, vz, age, active (8 values per particle)
    private f1SprayEmitSlots = [0, 0, 0, 0, 0, 0];
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
    private scratchMatrix2 = new THREE.Matrix4();

    private scratchVector1 = new THREE.Vector3();
    private scratchVector2 = new THREE.Vector3();
    private scratchVector3 = new THREE.Vector3();
    private scratchVector4 = new THREE.Vector3();
    private scratchVector5 = new THREE.Vector3();
    private scratchVector6 = new THREE.Vector3();
    private scratchQuat1 = new THREE.Quaternion();
    private scratchQuat2 = new THREE.Quaternion();
    private sequenceBallTrailCount = 0;

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



    // Choreographed Sport Sequences & AR Props
    private isSportSequenceActive = false;
    private sportSequenceTime = 0.0;
    private sportSequencePhase = 0; // 0 = prep, 1 = strike/flight, 2 = score/contact, 3 = card reveal
    private sportPropsGroup!: THREE.Group;
    private sequenceBall!: THREE.Mesh;
    private sequenceBallTrail!: THREE.Line;


    // Holographic Telemetry Projector Disk System
    private ballProjectorDisk!: THREE.Group;
    private ballProjectorDiskMat!: THREE.MeshBasicMaterial;

    // Cricket Wankhede props
    private cricketBatMesh!: THREE.Group;
    private cricketStumpsMesh!: THREE.Group;

    // Football Goal posts (Berlin references)
    private berlinGoal1: any = null;
    private berlinGoal2: any = null;
    private goal1NetMesh: any = null;
    private goal2NetMesh: any = null;
    private goalWiggleTime = 0.0;
    private isGoalWiggling = false;
    private wigglingGoalNet: any = null;

    // Basketball Inuit hoops
    private basketballHoop1: any = null;
    private basketballHoop2: any = null;
    private hoop1NetMesh: any = null;
    private hoop2NetMesh: any = null;
    private hoopWiggleTime = 0.0;
    private isHoopWiggling = false;
    private wigglingHoopNet: any = null;

    // AR Celebration overlay
    private sportCelebrationCard!: THREE.Group;
    private sportCelebrationCardMat!: THREE.MeshBasicMaterial;
    private sportCelebrationTexture!: THREE.CanvasTexture;
    private celebrationCardCanvas!: HTMLCanvasElement;
    private celebrationCardCtx!: CanvasRenderingContext2D;



    // Per-stadium domain key/name tables
    private readonly DOMAIN_KEYS_DEFAULT = ["mivVideo", "iplCam2", "iplCam3", "iplCam4", "iplCam5", "iplCam6"];
    private readonly DOMAIN_NAMES_DEFAULT = ["Wankhede — Cam 1", "Wankhede — Cam 2", "Wankhede — Cam 3", "Wankhede — Cam 4", "Wankhede — Cam 5", "Wankhede — Cam 6"];
    private readonly DOMAIN_KEYS_BERLIN = ["berlin360_1", "berlin360_2", "berlin360_3", "berlin360_4", "berlin360_5", "berlin360_6"];
    private readonly DOMAIN_NAMES_BERLIN = ["Olympiastadion — 1", "Olympiastadion — 2", "Olympiastadion — 3", "Olympiastadion — 4", "Olympiastadion — 5", "Olympiastadion — 6"];
    private readonly DOMAIN_KEYS_INUIT = ["inuit360_1", "inuit360_2", "inuit360_3", "inuit360_4", "inuit360_5", "inuit360_6"];
    private readonly DOMAIN_NAMES_INUIT = ["Crypto.com Arena — 1", "Crypto.com Arena — 2", "Crypto.com Arena — 3", "Crypto.com Arena — 4", "Crypto.com Arena — 5", "Crypto.com Arena — 6"];
    // Thumb key suffix: appending "_thumb" to each key gives the low-res bubble texture key
    private readonly THUMB_KEYS_DEFAULT = ["iplCam1", "iplCam2", "iplCam3", "iplCam4", "iplCam5", "iplCam6"];
    private readonly THUMB_KEYS_BERLIN = ["berlin360_1_thumb", "berlin360_2_thumb", "berlin360_3_thumb", "berlin360_4_thumb", "berlin360_5_thumb", "berlin360_6_thumb"];
    private readonly THUMB_KEYS_INUIT = ["inuit360_1_thumb", "inuit360_2_thumb", "inuit360_3_thumb", "inuit360_4_thumb", "inuit360_5_thumb", "inuit360_6_thumb"];
    private readonly DOMAIN_KEYS_BUTTERFLIES = ["butterfly360_1", "butterfly360_2", "butterfly360_3", "butterfly360_4", "butterfly360_5", "butterfly360_6", "butterfly360_7", "butterfly360_8", "butterfly360_9", "butterfly360_10"];
    private readonly DOMAIN_NAMES_BUTTERFLIES = ["FIFA Stadium — 1", "FIFA Stadium — 2", "FIFA Stadium — 3", "FIFA Stadium — 4", "FIFA Stadium — 5", "FIFA Stadium — 6", "FIFA Stadium — 7", "FIFA Stadium — 8", "FIFA Stadium — 9", "FIFA Stadium — 10"];
    private readonly THUMB_KEYS_BUTTERFLIES = ["butterfly360_1", "butterfly360_2", "butterfly360_3", "butterfly360_4", "butterfly360_5", "butterfly360_6", "butterfly360_7", "butterfly360_8", "butterfly360_9", "butterfly360_10"];
    private readonly DOMAIN_KEYS_NURBURGRING = ["nurburgring360_1", "nurburgring360_2", "nurburgring360_3", "nurburgring360_4", "nurburgring360_5", "nurburgring360_6"];
    private readonly DOMAIN_NAMES_NURBURGRING = ["GP Pit Lane", "Hatzenbach", "Adenauer Forst", "Karussell", "Pflanzgarten", "Döttinger Höhe"];
    private readonly THUMB_KEYS_NURBURGRING = ["nurburgring360_1_thumb", "nurburgring360_2_thumb", "nurburgring360_3_thumb", "nurburgring360_4_thumb", "nurburgring360_5_thumb", "nurburgring360_6_thumb"];


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

        this.f1RosterBgImage = new Image();
        this.f1RosterBgImage.src = './textures/F1RosterFrame.png';
        this.f1RosterBgImage.onload = () => {
            if (this.f1RosterCtx) {
                this.drawF1Roster();
            }
        };

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
                const dist = Math.sqrt(bx * bx + bz * bz);
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
                this.mivVideo.play().catch(() => { });
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

        // Initialize Fireworks, Weather, Controls, and Sport Sequence Systems
        this.initFireworks();
        this.initWeatherSystem();
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

        // Initialize Left Wrist Button — flat holographic close button
        this.wristBtnCanvas = document.createElement('canvas');
        this.wristBtnCanvas.width = 128;
        this.wristBtnCanvas.height = 128;
        this.wristBtnTexture = new THREE.CanvasTexture(this.wristBtnCanvas);
        this.wristBtnTexture.colorSpace = THREE.SRGBColorSpace;

        this.wristButtonMat = new THREE.MeshBasicMaterial({
            map: this.wristBtnTexture,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide,
            alphaTest: 0.01
        });
        this.drawWristButton(0, false);
        this.wristButton = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), this.wristButtonMat);
        this.wristButton.visible = false;
        this.world.createTransformEntity(this.wristButton);

        // Quit confirmation popup — shown on 3-second hold
        this.quitPopupCanvas = document.createElement('canvas');
        this.quitPopupCanvas.width = 256;
        this.quitPopupCanvas.height = 128;
        this.quitPopupTexture = new THREE.CanvasTexture(this.quitPopupCanvas);
        this.quitPopupTexture.colorSpace = THREE.SRGBColorSpace;
        this.quitPopupMat = new THREE.MeshBasicMaterial({
            map: this.quitPopupTexture,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        this.quitPopup = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), this.quitPopupMat);
        this.quitPopup.visible = false;
        this.world.createTransformEntity(this.quitPopup);
        this.drawQuitPopup(-1);

        // Register tableGroup with the world
        this.world.createTransformEntity(this.tableGroup);

        // Pre-compile shaders in WebGL to prevent any WebXR stutters/crashes
        try {
            this.renderer.compile(this.tableGroup, this.camera);
            this.renderer.compile(this.domainMesh, this.camera);
            console.log("[DomainExpansionSystem] Shader pre-compilation successful!");
            (window as any).domainExpansionShadersCompiled = true;
        } catch (e) {
            console.warn("[DomainExpansionSystem] Shader pre-compilation failed/skipped:", e);
            (window as any).domainExpansionShadersCompiled = true;
        }

        // Expose global minimap APIs for the Action Compass UI in JugnuSystem
        (window as any).triggerMinimapSportSequence = () => this.triggerSportSequence();
        (window as any).cycleMinimapWeather = () => {
            if (this.weatherMode === 'off') this.setWeatherMode('rain');
            else if (this.weatherMode === 'rain') this.setWeatherMode('neon_dust');
            else this.setWeatherMode('off');
            console.log(`[ActionCompass] Weather cycled to: ${this.weatherMode}`);
        };
        (window as any).toggleMinimapNavigation = () => {
            this.isNavLayerActive = !this.isNavLayerActive;
            console.log(`[ActionCompass] Navigation layer: ${this.isNavLayerActive}`);
        };
        (window as any).clearMinimapSystems = () => {
            this.setWeatherMode('off');
            this.isSportSequenceActive = false;
            this.restoreHoopScales();
            if (this.sportCelebrationCard) this.sportCelebrationCard.visible = false;
            if (this.sequenceBall) this.sequenceBall.visible = false;
            if (this.sequenceBallTrail) this.sequenceBallTrail.visible = false;
            if (this.arBillboard) this.arBillboard.visible = true;
            console.log("[ActionCompass] All systems cleared!");
        };
        (window as any).isMinimapNavigationActive = () => this.isNavLayerActive;
        (window as any).isMinimapSportSequenceActive = () => this.isSportSequenceActive;
        (window as any).getMinimapWeatherMode = () => this.weatherMode;
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
            this.domainKeys = [...this.DOMAIN_KEYS_BERLIN];
            this.domainNames = [...this.DOMAIN_NAMES_BERLIN];
        } else if (stadiumType === 'inuit') {
            this.domainKeys = [...this.DOMAIN_KEYS_INUIT];
            this.domainNames = [...this.DOMAIN_NAMES_INUIT];
        } else if (stadiumType === 'butterflies') {
            this.domainKeys = [...this.DOMAIN_KEYS_BUTTERFLIES];
            this.domainNames = [...this.DOMAIN_NAMES_BUTTERFLIES];
        } else if (stadiumType === 'nurburgring') {
            this.domainKeys = [...this.DOMAIN_KEYS_NURBURGRING];
            this.domainNames = [...this.DOMAIN_NAMES_NURBURGRING];
            this.f1VortexInitialized = false;
        } else {
            this.domainKeys = [...this.DOMAIN_KEYS_DEFAULT];
            this.domainNames = [...this.DOMAIN_NAMES_DEFAULT];
        }

        // ── Re-skin selection bubbles with low-res thumbs ────────────────────
        const thumbKeys = stadiumType === 'berlin' ? this.THUMB_KEYS_BERLIN
            : stadiumType === 'inuit' ? this.THUMB_KEYS_INUIT
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
        if (this.minimapMapPlane) {
            this.minimapMapPlane.visible = true;
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

        // Hide Cricket Hawk-Eye lines and balls during F1/other maps
        if (this.hawkeyeLine) {
            this.hawkeyeLine.visible = (stadiumType === 'default');
        }
        if (this.hawkeyeBall) {
            this.hawkeyeBall.visible = (stadiumType === 'default');
        }
        if (this.hawkeyeRipple) {
            this.hawkeyeRipple.visible = (stadiumType === 'default');
        }

        // Lazily build Butterfly Park flat ground and butterflies
        if (stadiumType === 'butterflies' && !this.butterflyGroup) {
            this.createButterflyGroup();
        }

        // Lazily build Nürburgring racetrack — deferred via setTimeout to run
        // OUTSIDE the XRFrame callback. createNurburgringGroup() is CPU-heavy.
        // Running it inside rAF causes frame drops and freezes hand meshes (the ghost hand bug).
        if (stadiumType === 'nurburgring' && !this.nurburgringGroup && !(this as any)._nurburgringBuilding) {
            (this as any)._nurburgringBuilding = true;
            setTimeout(() => {
                this.createNurburgringGroup();
                (this as any)._nurburgringBuilding = false;
                if (this.nurburgringGroup) {
                    this.nurburgringGroup.visible = (this.currentStadiumType === 'nurburgring');
                }
                console.log('[NurburgringMap] Deferred build complete — outside XRFrame.');
            }, 50);
        }
        if (this.nurburgringGroup) {
            this.nurburgringGroup.visible = (stadiumType === 'nurburgring');
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

                // Find field mesh and map goalposts during traversal
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

                        // Link built-in goalposts
                        if (name.includes('olympiagoalpost')) {
                            child.userData.originalScale = child.scale.clone();
                            if (child.position.z > 0) {
                                this.berlinGoal1 = child;
                                this.goal1NetMesh = child;
                            } else {
                                this.berlinGoal2 = child;
                                this.goal2NetMesh = child;
                            }
                            console.log(`[BerlinStadium] Linked built-in goalpost "${child.name}" (Z: ${child.position.z.toFixed(4)})`);
                        }
                    }
                });
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

            // Grid floor & anchor helper removed

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

                        // Link built-in hoops and nets
                        if (name.includes('inuit basket') || name.includes('inuitbasket')) {
                            child.userData.originalScale = child.scale.clone();
                            if (child.position.z > 0) {
                                this.basketballHoop1 = child;
                            } else {
                                this.basketballHoop2 = child;
                            }
                            console.log(`[InuitStadium] Linked built-in basket "${child.name}" (Z: ${child.position.z.toFixed(4)})`);
                        }
                        if (name.includes('inuitnet')) {
                            child.userData.originalScale = child.scale.clone();
                            if (child.position.z > 0) {
                                this.hoop1NetMesh = child;
                            } else {
                                this.hoop2NetMesh = child;
                            }
                            console.log(`[InuitStadium] Linked built-in net "${child.name}" (Z: ${child.position.z.toFixed(4)})`);
                        }
                    }
                });
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

                // GridHelper floor lines removed

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

        // Make ball size in cricket stadium 50% smaller (relative to enhanced baseline)
        const ballScale = (stadiumType === 'default') ? 0.85 : 1.65;
        if (this.hawkeyeBall) this.hawkeyeBall.scale.setScalar(ballScale);
        if (this.sequenceBall) this.sequenceBall.scale.setScalar(ballScale);

        // 4. Update the player markers for the active sport/stadium
        this.players.forEach(p => {
            this.tableGroup.remove(p.group);
        });
        this.players = [];
        this.initPlayerMarkers();

        // Clear collected original stadium material states to prevent weather updates leaking across stadiums
        this.standsOriginalColors = [];
        this.floodlightOriginalColors = [];

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
            const newLabel = stadiumType === 'berlin' ? 'UEFA' : stadiumType === 'inuit' ? 'NBA' : stadiumType === 'butterflies' ? 'FIFA' : stadiumType === 'nurburgring' ? 'F1' : 'IPL';

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
            : stadiumType === 'inuit' ? [0xf97316, 0x00ffff, 0xffff00]
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

        // --- Dynamic Scoreboard & Central Billboard Texture Swapping ---
        const scoreboardConfigs = [
            { angleOffset: -55 },
            { angleOffset: -25 },
            { angleOffset: 0 },
            { angleOffset: 25 },
            { angleOffset: 55 }
        ];

        // IPL cards follow the stadium roof arc, tangent to the curve (so they
        // hug the stadium and stay inside it). The arc gives the symmetric
        // concave depth: center furthest back, extremes nearest the viewer.
        const IPL_ARC_RADIUS = 0.090;          // just inside ROOF_RADIUS (0.096)
        const iplAngleOffsets = [-70, -35, 0, 35, 70];
        const IPL_ROW_Y = this.ROOF_Y + 0.006;

        if (stadiumType === 'default') {
            // Restore IPL score display meshes
            this.scoreDisplayMeshes.forEach((mesh, idx) => {
                mesh.visible = true;
                mesh.scale.set(1.0, 1.0, 1.0);
                const angle = Math.PI + (iplAngleOffsets[idx] * Math.PI / 180);
                const px = Math.sin(angle) * IPL_ARC_RADIUS;
                const pz = Math.cos(angle) * IPL_ARC_RADIUS;
                mesh.position.set(px, IPL_ROW_Y, pz);
                mesh.rotation.set(0, angle + Math.PI, 0);

                const mat = mesh.material as THREE.MeshBasicMaterial;
                if (this.iplTextures[idx]) {
                    mat.map = this.iplTextures[idx];
                    mat.needsUpdate = true;
                }
            });

            // Restore IPL billboard
            if (this.arBillboard && this.arBillboard.children[0]) {
                const bannerMat = (this.arBillboard.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
                if (this.iplBillboardTexture) {
                    bannerMat.map = this.iplBillboardTexture;
                    bannerMat.needsUpdate = true;
                }
            }
        } else if (stadiumType === 'berlin' || stadiumType === 'butterflies') {
            // Apply Soccer score display meshes
            this.scoreDisplayMeshes.forEach((mesh, idx) => {
                mesh.visible = true;

                // Adjust scale and position for vertical panels (Slot 0 and Slot 4)
                if (idx === 0) {
                    // Slot 0 (rr_stats replacement): Bayern stats (vertical card)
                    mesh.scale.set(0.281, 1.818, 1.0);
                    const angle = Math.PI + (-55 * Math.PI / 180);
                    const px = Math.sin(angle) * this.ROOF_RADIUS;
                    const pz = Math.cos(angle) * this.ROOF_RADIUS;
                    mesh.position.set(px, this.ROOF_Y + 0.006 + 0.009, pz);
                } else if (idx === 4) {
                    // Slot 4 (rcb_stats replacement): BVB stats (vertical card)
                    mesh.scale.set(0.281, 1.905, 1.0);
                    const angle = Math.PI + (55 * Math.PI / 180);
                    const px = Math.sin(angle) * this.ROOF_RADIUS;
                    const pz = Math.cos(angle) * this.ROOF_RADIUS;
                    mesh.position.set(px, this.ROOF_Y + 0.006 + 0.009, pz);
                } else {
                    // Reset scale and position for horizontal panels
                    mesh.scale.set(1.0, 1.0, 1.0);
                    const angle = Math.PI + (scoreboardConfigs[idx].angleOffset * Math.PI / 180);
                    const px = Math.sin(angle) * this.ROOF_RADIUS;
                    const pz = Math.cos(angle) * this.ROOF_RADIUS;
                    mesh.position.set(px, this.ROOF_Y + 0.006, pz);
                }

                const mat = mesh.material as THREE.MeshBasicMaterial;
                if (this.soccerTextures[idx]) {
                    mat.map = this.soccerTextures[idx];
                    mat.needsUpdate = true;
                }
            });

            // Set Soccer billboard
            if (this.arBillboard && this.arBillboard.children[0]) {
                const bannerMat = (this.arBillboard.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
                if (this.soccerBillboardTexture) {
                    bannerMat.map = this.soccerBillboardTexture;
                    bannerMat.needsUpdate = true;
                }
            }
        } else {
            // Hide panels for other stadiums
            this.scoreDisplayMeshes.forEach((mesh) => {
                mesh.visible = false;
            });
            // Hide central billboard for other stadiums
            if (this.arBillboard) {
                this.arBillboard.visible = false;
            }
        }

        // Dynamic Coloring of the Holographic Cylinder and Wireframe
        const colors: Record<string, number> = { default: 0xff6600, berlin: 0x22d3ee, inuit: 0xf97316, butterflies: 0x10b981, nurburgring: 0x22d3ee };
        const activeColor = colors[stadiumType] || 0x00ffff;
        if (this.holoCylinder && this.holoCylinder.material) {
            (this.holoCylinder.material as THREE.MeshPhongMaterial).color.setHex(activeColor);
        }
        if (this.holoCylinderWire && this.holoCylinderWire.material) {
            (this.holoCylinderWire.material as THREE.LineBasicMaterial).color.setHex(activeColor);
        }



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



    update(dt: number) {
        (window as any).isMinimapSpawned = this.isTableSpawned;
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
        // Commented out:
        if (false && this.currentStadiumType === 'butterflies' && this.butterflyGroup && this.tableGroup.visible) {
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
            this.nurburgringGroup.updateMatrixWorld(true);

            // Update base race progress (75s Monaco lap time)
            const isImmersive = this.currentTableScale >= 2.5;
            this.nurburgringF1Progress += dt / 75.0;
            if (this.nurburgringF1Progress > 1.0) this.nurburgringF1Progress -= 1.0;

            // Determine if the track is in a corner at current progress using tangent change curvature check
            const t1 = this.scratchVector1;
            const t2 = this.scratchVector2;
            this.nurburgringCurve.getTangentAt(this.nurburgringF1Progress, t1);
            this.nurburgringCurve.getTangentAt((this.nurburgringF1Progress + 0.015) % 1.0, t2);
            const dot = t1.normalize().dot(t2.normalize());
            const isCorner = dot < 0.992; // high curvature = corner

            let targetPhase = 0.0;
            if (this.isSportSequenceActive) {
                // Cinematic Lap Overtake Choreography:
                // 0s to 12.0s: Mercedes (Hamilton) leads (overtakePhase = 0)
                // 12.0s to 13.5s: Red Bull (Verstappen) passes Mercedes (overtakePhase goes 0 -> PI)
                // 13.5s to 18.0s: Red Bull (Verstappen) leads (overtakePhase = PI) (corresponds to P1 Verstappen card at 15s)
                // 18.0s to 19.8s: Mercedes passes Red Bull back on finish straight (overtakePhase goes PI -> 2PI)
                // 19.8s onwards: Mercedes wins! (overtakePhase = 2PI)
                const time = this.sportSequenceTime;
                if (time < 12.0) {
                    this.nurburgringOvertakePhase = 0.0;
                } else if (time >= 12.0 && time < 13.5) {
                    const t = (time - 12.0) / 1.5;
                    this.nurburgringOvertakePhase = t * Math.PI;
                } else if (time >= 13.5 && time < 18.0) {
                    this.nurburgringOvertakePhase = Math.PI;
                } else if (time >= 18.0 && time < 19.8) {
                    const t = (time - 18.0) / 1.8;
                    this.nurburgringOvertakePhase = Math.PI + t * Math.PI;
                } else {
                    this.nurburgringOvertakePhase = 2.0 * Math.PI;
                }
                targetPhase = Math.round(this.nurburgringOvertakePhase / Math.PI) * Math.PI;
            } else {
                targetPhase = Math.round(this.nurburgringOvertakePhase / Math.PI) * Math.PI;
                if (isCorner) {
                    // Advance overtake phase in corners
                    this.nurburgringOvertakePhase += dt * 1.5;
                } else {
                    // Snap/lerp to nearest lead state on straights (drafting in single file)
                    this.nurburgringOvertakePhase += (targetPhase - this.nurburgringOvertakePhase) * 5.0 * dt;
                }
            }

            // Update all six detailed F1 cars
            this.nurburgringCars.forEach((car) => {
                car.group.visible = true;

                // Calculate progress and lateral offset for the car to simulate a realistic battle
                let carProgress = 0.0;
                let lateralOffset = 0.0;

                let phaseOffset = 0.0;
                let sign = 1.0;
                if (car.driverId === 'f1_gr') {
                    phaseOffset = 0.0;
                    sign = 1.0;
                } else if (car.driverId === 'f1_ka') {
                    phaseOffset = 0.0;
                    sign = -1.0;
                } else if (car.driverId === 'f1_cl') {
                    phaseOffset = 1.2;
                    sign = 1.0;
                } else if (car.driverId === 'f1_lh') {
                    phaseOffset = 1.2;
                    sign = -1.0;
                } else if (car.driverId === 'f1_ln') {
                    phaseOffset = 2.4;
                    sign = 1.0;
                } else if (car.driverId === 'f1_op') {
                    phaseOffset = 2.4;
                    sign = -1.0;
                }

                // Gap between cars: sequential 0.03 progress offsets to keep cars staggered in a single file line
                const baseLag = 
                    car.driverId === 'f1_gr' ? 0.00 :
                    car.driverId === 'f1_ka' ? -0.03 :
                    car.driverId === 'f1_cl' ? -0.06 :
                    car.driverId === 'f1_lh' ? -0.09 :
                    car.driverId === 'f1_ln' ? -0.12 :
                    car.driverId === 'f1_op' ? -0.15 : 0.0;
                // Force zero lateral offset so all cars run in a single centerline lane
                lateralOffset = 0.0;
                carProgress = (this.nurburgringF1Progress + baseLag + 1.0) % 1.0;

                car.progress = carProgress;

                // Detect lap count increments
                const prevP = this.f1CarPrevProgress[car.driverId] ?? 0;
                if (carProgress < prevP && (prevP - carProgress) > 0.5) {
                    this.f1CarLaps[car.driverId] = (this.f1CarLaps[car.driverId] ?? 1) + 1;
                }
                this.f1CarPrevProgress[car.driverId] = carProgress;

                // ── POSITION: sample spline at car's progress ──
                this.nurburgringCurve.getPointAt(carProgress, this.f1Pos);

                // ── HEADING: look-ahead 1.5% of lap for smooth forward vector ──
                const lookAheadProgress = (carProgress + 0.015) % 1.0;
                const lookAheadPos = this.scratchVector2;
                this.nurburgringCurve.getPointAt(lookAheadProgress, lookAheadPos);

                // Forward direction = lookahead − current, normalized
                this.f1zAxis.subVectors(lookAheadPos, this.f1Pos);
                if (this.f1zAxis.lengthSq() < 1e-8) {
                    this.f1zAxis.set(0, 0, 1);
                } else {
                    this.f1zAxis.normalize();
                }

                // Build orthonormal basis: right = worldUp × forward, up = forward × right
                const worldUp = this.scratchVector1.set(0, 1, 0);
                this.f1xAxis.crossVectors(worldUp, this.f1zAxis);
                if (this.f1xAxis.lengthSq() < 1e-8) {
                    this.f1xAxis.set(1, 0, 0);
                } else {
                    this.f1xAxis.normalize();
                }
                this.f1yAxis.crossVectors(this.f1zAxis, this.f1xAxis).normalize();

                // Apply tiny lateral offset to stay on track center
                this.f1Pos.addScaledVector(this.f1xAxis, lateralOffset);

                // ── SET POSITION ──
                car.group.position.copy(this.f1Pos);
                car.group.position.y += 0.0011 * 0.384;

                // ── SET ORIENTATION: car nose is at local +Z, travel direction is f1zAxis ──
                // makeBasis columns = local X, Y, Z axes expressed in world space.
                // We want local +Z (nose) → world f1zAxis (travel), so pass f1zAxis as the Z column.
                // Right-hand basis: xAxis=right, yAxis=up, zAxis=forward(travel).
                this.f1RotationMatrix.makeBasis(this.f1xAxis, this.f1yAxis, this.f1zAxis);

                // Validate matrix (no NaN) before extracting quaternion
                let hasNaN = false;
                const elems = this.f1RotationMatrix.elements;
                for (let idx = 0; idx < 16; idx++) {
                    if (!isFinite(elems[idx])) { hasNaN = true; break; }
                }

                if (!hasNaN) {
                    // Slerp toward target orientation — prevents snap/spin on sharp corners
                    this.scratchQuat1.setFromRotationMatrix(this.f1RotationMatrix);
                    // Ensure we take the SHORT arc (dot < 0 means we'd spin 360°, so flip)
                    if (car.group.quaternion.dot(this.scratchQuat1) < 0) {
                        this.scratchQuat1.set(
                            -this.scratchQuat1.x,
                            -this.scratchQuat1.y,
                            -this.scratchQuat1.z,
                            -this.scratchQuat1.w
                        );
                    }
                    car.group.quaternion.slerp(this.scratchQuat1, Math.min(1.0, 12.0 * dt));
                } // else: keep previous quaternion — no garbage rotation

                // NOTE: NO rotateY steer-slip added — that was the source of 360° spins.
                // The look-ahead vector already encodes all cornering direction naturally.

                // Spin wheels locally
                car.wheels.forEach((wheel) => {
                    wheel.rotation.x -= dt * 35.0;
                });

                // Sync position with corresponding driver player card group
                const pMarker = this.players.find(p => p.id === car.driverId);
                if (pMarker) {
                    pMarker.group.position.copy(car.group.position);
                    pMarker.currentPos.copy(car.group.position);
                }
            });

            if (isImmersive) {
                // Show HUD on Mercedes car
                if (this.f1HudMesh) this.f1HudMesh.visible = true;

                // ── 1. DYNAMIC WET TRACK REFLECTION ──
                if (this.nurburgringTrackMat) {
                    if (this.weatherMode === 'rain') {
                        this.nurburgringTrackMat.color.setHex(0x0a0a0f); // darker when wet
                    } else {
                        this.nurburgringTrackMat.color.setHex(0x2a2a33);
                    }
                }

                // ── 2. SPEED, GEAR, RPM, THROTTLE, BRAKE PROFILING ──
                const tel = this.getF1Telemetry(this.nurburgringF1Progress);
                const speed = tel.speed;
                const gear = tel.gear;
                const rpm = tel.rpm;
                const throttle = tel.throttle;
                const brake = tel.brake;

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

                // Wheel thermal glow removed (MeshBasicMaterial, no emissive support)

                // ── 5. VORTEX VAPOR TRAILS ──
                if (this.f1VortexLeft && this.f1VortexRight) {
                    this.f1VortexLeft.visible = true;
                    this.f1VortexRight.visible = true;
                    (this.f1VortexLeft.material as THREE.LineBasicMaterial).opacity = 0.85;
                    (this.f1VortexRight.material as THREE.LineBasicMaterial).opacity = 0.85;

                    const rbCar = this.nurburgringCars.find(c => c.colorType === 'mclaren')?.group;
                    if (rbCar && this.f1VortexLeft_RB) {
                        this.f1VortexLeft_RB.visible = true;
                        this.f1VortexRight_RB.visible = true;
                        (this.f1VortexLeft_RB.material as THREE.LineBasicMaterial).opacity = 0.85;
                        (this.f1VortexRight_RB.material as THREE.LineBasicMaterial).opacity = 0.85;
                    }

                    const feCar = this.nurburgringCars.find(c => c.colorType === 'ferrari')?.group;
                    if (feCar && this.f1VortexLeft_FE) {
                        this.f1VortexLeft_FE.visible = true;
                        this.f1VortexRight_FE.visible = true;
                        (this.f1VortexLeft_FE.material as THREE.LineBasicMaterial).opacity = 0.85;
                        (this.f1VortexRight_FE.material as THREE.LineBasicMaterial).opacity = 0.85;
                    }

                    // Pre-initialize vortex trail points to rear wheels if not done yet to prevent centering glitch
                    if (!this.f1VortexInitialized) {
                        this.nurburgringF1Car.updateMatrix();
                        if (rbCar) rbCar.updateMatrix();
                        if (feCar) feCar.updateMatrix();

                        for (let i = 0; i < 25; i++) {
                            this.f1VortexLeftPoints[i].set(-0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);
                            this.f1VortexRightPoints[i].set(0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);

                            if (rbCar) {
                                this.f1VortexLeftPoints_RB[i].set(-0.0035, 0.0035, -0.007).applyMatrix4(rbCar.matrix);
                                this.f1VortexRightPoints_RB[i].set(0.0035, 0.0035, -0.007).applyMatrix4(rbCar.matrix);
                            }

                            if (feCar) {
                                this.f1VortexLeftPoints_FE[i].set(-0.0035, 0.0035, -0.007).applyMatrix4(feCar.matrix);
                                this.f1VortexRightPoints_FE[i].set(0.0035, 0.0035, -0.007).applyMatrix4(feCar.matrix);
                            }
                        }
                        this.f1VortexInitialized = true;
                    }

                    // Shift points array back to keep buffer pre-allocated (Zero-GC)
                    for (let i = 0; i < 24; i++) {
                        this.f1VortexLeftPoints[i].copy(this.f1VortexLeftPoints[i + 1]);
                        this.f1VortexRightPoints[i].copy(this.f1VortexRightPoints[i + 1]);

                        this.f1VortexLeftPoints_RB[i].copy(this.f1VortexLeftPoints_RB[i + 1]);
                        this.f1VortexRightPoints_RB[i].copy(this.f1VortexRightPoints_RB[i + 1]);

                        this.f1VortexLeftPoints_FE[i].copy(this.f1VortexLeftPoints_FE[i + 1]);
                        this.f1VortexRightPoints_FE[i].copy(this.f1VortexRightPoints_FE[i + 1]);
                    }

                    // Copy new wing tip positions in track local coordinates
                    this.nurburgringF1Car.updateMatrix();
                    this.f1VortexLeftPoints[24].set(-0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);
                    this.f1VortexRightPoints[24].set(0.0035, 0.0035, -0.007).applyMatrix4(this.nurburgringF1Car.matrix);

                    if (rbCar) {
                        rbCar.updateMatrix();
                        this.f1VortexLeftPoints_RB[24].set(-0.0035, 0.0035, -0.007).applyMatrix4(rbCar.matrix);
                        this.f1VortexRightPoints_RB[24].set(0.0035, 0.0035, -0.007).applyMatrix4(rbCar.matrix);
                    }

                    if (feCar) {
                        feCar.updateMatrix();
                        this.f1VortexLeftPoints_FE[24].set(-0.0035, 0.0035, -0.007).applyMatrix4(feCar.matrix);
                        this.f1VortexRightPoints_FE[24].set(0.0035, 0.0035, -0.007).applyMatrix4(feCar.matrix);
                    }

                    // Copy vectors directly to buffer attribute array (Zero-GC)
                    const arrL = this.f1VortexLeft.geometry.attributes.position.array as Float32Array;
                    const arrR = this.f1VortexRight.geometry.attributes.position.array as Float32Array;
                    const arrL_RB = this.f1VortexLeft_RB.geometry.attributes.position.array as Float32Array;
                    const arrR_RB = this.f1VortexRight_RB.geometry.attributes.position.array as Float32Array;
                    const arrL_FE = this.f1VortexLeft_FE.geometry.attributes.position.array as Float32Array;
                    const arrR_FE = this.f1VortexRight_FE.geometry.attributes.position.array as Float32Array;

                    for (let i = 0; i < 25; i++) {
                        const idx = i * 3;
                        arrL[idx] = this.f1VortexLeftPoints[i].x;
                        arrL[idx + 1] = this.f1VortexLeftPoints[i].y;
                        arrL[idx + 2] = this.f1VortexLeftPoints[i].z;

                        arrR[idx] = this.f1VortexRightPoints[i].x;
                        arrR[idx + 1] = this.f1VortexRightPoints[i].y;
                        arrR[idx + 2] = this.f1VortexRightPoints[i].z;

                        arrL_RB[idx] = this.f1VortexLeftPoints_RB[i].x;
                        arrL_RB[idx + 1] = this.f1VortexLeftPoints_RB[i].y;
                        arrL_RB[idx + 2] = this.f1VortexLeftPoints_RB[i].z;

                        arrR_RB[idx] = this.f1VortexRightPoints_RB[i].x;
                        arrR_RB[idx + 1] = this.f1VortexRightPoints_RB[i].y;
                        arrR_RB[idx + 2] = this.f1VortexRightPoints_RB[i].z;

                        arrL_FE[idx] = this.f1VortexLeftPoints_FE[i].x;
                        arrL_FE[idx + 1] = this.f1VortexLeftPoints_FE[i].y;
                        arrL_FE[idx + 2] = this.f1VortexLeftPoints_FE[i].z;

                        arrR_FE[idx] = this.f1VortexRightPoints_FE[i].x;
                        arrR_FE[idx + 1] = this.f1VortexRightPoints_FE[i].y;
                        arrR_FE[idx + 2] = this.f1VortexRightPoints_FE[i].z;
                    }
                    (this.f1VortexLeft.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                    (this.f1VortexRight.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                    (this.f1VortexLeft_RB.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                    (this.f1VortexRight_RB.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                    (this.f1VortexLeft_FE.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                    (this.f1VortexRight_FE.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
                }

                // ── 6. WET SPRAY INSTANCED PARTICLES (DISABLED BY USER REQUEST) ──
                if (this.f1SprayMesh) {
                    this.f1SprayMesh.visible = false;
                }

                // Hide floating markers if stadium not active
                if (this.f1Markers && this.f1Markers.length > 0) {
                    this.f1Markers.forEach(m => { m.visible = false; });
                }

            } else {
                // Hide F1 car
                this.nurburgringF1Car.visible = false;
                if (this.f1HudMesh) this.f1HudMesh.visible = false;

                // Hide floating markers if stadium not active
                if (this.f1Markers && this.f1Markers.length > 0) {
                    this.f1Markers.forEach(m => { m.visible = false; });
                }
                this.f1VortexInitialized = false;
                if (this.f1VortexLeft) {
                    this.f1VortexLeft.visible = false;
                    this.f1VortexRight.visible = false;
                    this.f1VortexLeftPoints.forEach(p => p.set(0, 0, 0));
                    this.f1VortexRightPoints.forEach(p => p.set(0, 0, 0));
                }
                if (this.f1VortexLeft_RB) {
                    this.f1VortexLeft_RB.visible = false;
                    this.f1VortexRight_RB.visible = false;
                    this.f1VortexLeftPoints_RB.forEach(p => p.set(0, 0, 0));
                    this.f1VortexRightPoints_RB.forEach(p => p.set(0, 0, 0));
                }
                if (this.f1VortexLeft_FE) {
                    this.f1VortexLeft_FE.visible = false;
                    this.f1VortexRight_FE.visible = false;
                    this.f1VortexLeftPoints_FE.forEach(p => p.set(0, 0, 0));
                    this.f1VortexRightPoints_FE.forEach(p => p.set(0, 0, 0));
                }

                // ── F1 LIVE ROSTER & ACTIVE PLAYER CARD SPATIAL UPDATES ──
                if (this.f1RosterMesh) {
                    // A. Draw/refresh roster list
                    this.drawF1Roster();

                    // B. Roster World-Space Position & Billboarding
                    // The mesh is a scene-root child (NOT inside nurburgringGroup) so it never
                    // scales with the table. We anchor it to the table's world position each frame.
                    if (this.player && this.player.head) {
                        const headPos = this.scratchVector3;
                        this.player.head.getWorldPosition(headPos);

                        // World position of the table center
                        const tableWorldPos = this.scratchVector1;
                        this.tableGroup.getWorldPosition(tableWorldPos);

                        // Direction from table to player (horizontal only)
                        const toPlayer = this.scratchVector2.subVectors(headPos, tableWorldPos);
                        toPlayer.y = 0;
                        const distH = toPlayer.length();
                        if (distH > 0.001) toPlayer.normalize(); else toPlayer.set(0, 0, 1);

                        // Place roster: if minimized, sit lower near the base (Y offset 0.16m).
                        // If maximized, sit at normal height (Y offset 0.28m).
                        const rosterYOffset = this.f1RosterMinimized ? 0.16 : 0.28;
                        this.f1RosterMesh.position.copy(tableWorldPos);
                        this.f1RosterMesh.position.y += rosterYOffset;
                        this.f1RosterMesh.position.addScaledVector(toPlayer, 0.18);

                        // LookAt: front face (+Z of PlaneGeometry) → player
                        // lookAt(headPos) points the local +Z toward the target, which IS the front face.
                        this.f1RosterMesh.lookAt(headPos);
                    }

                    // C. Index Finger Touch Checking on Roster
                    const leftIndexTip = this.scratchVector1;
                    const rightIndexTip = this.scratchVector2;
                    const hasLeft = this.getIndexData('left', leftIndexTip);
                    const hasRight = this.getIndexData('right', rightIndexTip);

                    if (hasLeft || hasRight) {
                        const tipsToCheck = [];
                        if (hasLeft) tipsToCheck.push(leftIndexTip);
                        if (hasRight) tipsToCheck.push(rightIndexTip);

                        const inv = this.scratchMatrix2.copy(this.f1RosterMesh.matrixWorld).invert();
                        let touchedRow = -1;
                        let touchedMinimize = false;
                        let touchedMaximize = false;
                        let isTouchingRoster = false;
                        let touchTipUsed = leftIndexTip;

                        for (const tip of tipsToCheck) {
                            const localTip = tip.clone().applyMatrix4(inv);
                            
                            if (this.f1RosterMinimized) {
                                // Minimized size: 0.24m wide by 0.08m high. localTip Y range: -0.04 to 0.04
                                if (Math.abs(localTip.z) < 0.015 && Math.abs(localTip.x) < 0.12 && Math.abs(localTip.y) < 0.04) {
                                    isTouchingRoster = true;
                                    touchTipUsed = tip;
                                    touchedMaximize = true;
                                    break;
                                }
                            } else {
                                // Maximized size: 0.24m wide by 0.28m high. localTip Y range: -0.14 to 0.14
                                if (Math.abs(localTip.z) < 0.015 && Math.abs(localTip.x) < 0.12 && Math.abs(localTip.y) < 0.14) {
                                    isTouchingRoster = true;
                                    touchTipUsed = tip;

                                    // Map local coordinates to Canvas space (512 x 600)
                                    const cx = (localTip.x + 0.12) / 0.24 * 512;
                                    const cy = (0.14 - localTip.y) / 0.28 * 600;

                                    // Check rows 0, 1, 2
                                    if (cy >= 144 && cy <= 384) {
                                        const rowIndex = Math.floor((cy - 144) / 80);
                                        if (rowIndex >= 0 && rowIndex < 3) {
                                            touchedRow = rowIndex;
                                        }
                                    }
                                    // Check Minimize button at Y = 430 to 510
                                    else if (cy >= 430 && cy <= 510 && cx >= 32 && cx <= 480) {
                                        touchedMinimize = true;
                                    }
                                    break;
                                }
                            }
                        }

                        if (!this.f1RosterMinimized) {
                            if (touchedRow !== this.f1RosterHoveredRowIndex) {
                                this.f1RosterHoveredRowIndex = touchedRow;
                                this.drawF1Roster();
                            }
                        }

                        if (touchedMaximize && this.f1TouchCooldown <= 0.0) {
                            this.f1TouchCooldown = 0.5;
                            this.f1RosterMinimized = false;
                            
                            // Recreate PlaneGeometry for maximized state
                            this.f1RosterMesh.geometry.dispose();
                            this.f1RosterMesh.geometry = new THREE.PlaneGeometry(0.24, 0.28);
                            
                            // Resize Canvas
                            this.f1RosterCanvas.width = 512;
                            this.f1RosterCanvas.height = 600;
                            
                            this.drawF1Roster();

                            // Trigger click sound and sparks right at the finger tip!
                            const spatialFX = (window as any).spatialFX;
                            if (spatialFX) {
                                spatialFX.playPositionalSound('click', touchTipUsed);
                                spatialFX.triggerSpark(touchTipUsed, new THREE.Color(0x00ffff), 12);
                            }

                            // Trigger physical controller haptics
                            const activeHand = (touchTipUsed === rightIndexTip && hasRight) ? 'right' : 'left';
                            const source = this.input.getPrimaryInputSource(activeHand);
                            if (source?.gamepad?.hapticActuators?.[0]) {
                                source.gamepad.hapticActuators[0].pulse(0.8, 40);
                            }
                        }
                        else if (touchedMinimize && this.f1TouchCooldown <= 0.0) {
                            this.f1TouchCooldown = 0.5;
                            this.f1RosterMinimized = true;
                            
                            // Recreate PlaneGeometry for minimized state
                            this.f1RosterMesh.geometry.dispose();
                            this.f1RosterMesh.geometry = new THREE.PlaneGeometry(0.24, 0.08);
                            
                            // Resize Canvas
                            this.f1RosterCanvas.width = 512;
                            this.f1RosterCanvas.height = 170;
                            
                            this.drawF1Roster();

                            // Trigger click sound and sparks right at the finger tip!
                            const spatialFX = (window as any).spatialFX;
                            if (spatialFX) {
                                spatialFX.playPositionalSound('click', touchTipUsed);
                                spatialFX.triggerSpark(touchTipUsed, new THREE.Color(0x00ffff), 12);
                            }

                            // Trigger physical controller haptics
                            const activeHand = (touchTipUsed === rightIndexTip && hasRight) ? 'right' : 'left';
                            const source = this.input.getPrimaryInputSource(activeHand);
                            if (source?.gamepad?.hapticActuators?.[0]) {
                                source.gamepad.hapticActuators[0].pulse(0.8, 40);
                            }
                        }
                        else if (touchedRow !== -1 && isTouchingRoster && this.f1TouchCooldown <= 0.0) {
                            const sortedDrivers = this.getSortedDrivers();
                            const selectedDriver = sortedDrivers[touchedRow];
                            if (selectedDriver) {
                                this.f1TouchCooldown = 0.5; // 500ms cooldown
                                this.triggerPlayerCard(selectedDriver.driverId);

                                // Trigger click sound and sparks right at the finger tip!
                                const spatialFX = (window as any).spatialFX;
                                if (spatialFX) {
                                    spatialFX.playPositionalSound('click', touchTipUsed);
                                    spatialFX.triggerSpark(touchTipUsed, new THREE.Color(0x00ffff), 12);
                                }

                                // Trigger physical controller haptics
                                const activeHand = (touchTipUsed === rightIndexTip && hasRight) ? 'right' : 'left';
                                const source = this.input.getPrimaryInputSource(activeHand);
                                if (source?.gamepad?.hapticActuators?.[0]) {
                                    source.gamepad.hapticActuators[0].pulse(0.8, 40);
                                }
                            }
                        }
                    } else {
                        if (this.f1RosterHoveredRowIndex !== -1) {
                            this.f1RosterHoveredRowIndex = -1;
                            this.drawF1Roster();
                        }
                    }

                    if (this.f1TouchCooldown > 0.0) {
                        this.f1TouchCooldown -= dt;
                    }
                }

                // D. Spawned Player Card Updates
                if (this.f1ActiveCardDriverId !== null && this.f1ActiveCardGroup) {
                    // Find driver's F1 car
                    const activeCar = this.nurburgringCars.find(c => c.driverId === this.f1ActiveCardDriverId);
                    if (activeCar) {
                        // Update timer
                        this.f1ActiveCardTimer += dt;

                        if (this.f1ActiveCardTimer >= 30.0) {
                            // Collapse completely after 30 seconds
                            this.f1ActiveCardGroup.visible = false;
                            this.f1ActiveCardDriverId = null;
                        } else {
                            // Position card group directly above the car in table local coordinates
                            // Floating 0.065m (6.5cm) high
                            this.f1ActiveCardGroup.position.copy(activeCar.group.position);
                            this.f1ActiveCardGroup.position.y += 0.065;

                            // Redraw telemetry canvas
                            const tel = this.getF1Telemetry(activeCar.progress);
                            this.drawF1ActiveCard(tel.speed, tel.gear, tel.rpm, tel.throttle, tel.brake);

                            // Easing scale animation: spawn & collapse
                            let scale = 1.0;
                            if (this.f1ActiveCardTimer < 0.4) {
                                // Spawn: scale up from 0 to 1 over first 0.4s
                                const t = this.f1ActiveCardTimer / 0.4;
                                scale = 1.0 - Math.pow(1.0 - t, 3); // out-cubic easing
                            } else if (this.f1ActiveCardTimer > 6.6) {
                                // Collapse: scale down from 1 to 0 over final 0.4s
                                const t = (7.0 - this.f1ActiveCardTimer) / 0.4;
                                scale = Math.max(0.0, 1.0 - Math.pow(1.0 - t, 3));
                            }

                            this.f1ActiveCardGroup.scale.setScalar(scale);

                            // Card Billboarding (always face user)
                            if (this.player && this.player.head) {
                                this.f1ActiveCardGroup.updateMatrixWorld(true);

                                const headPos = this.scratchVector3;
                                this.player.head.getWorldPosition(headPos);

                                const cardWorldPos = this.scratchVector1;
                                this.f1ActiveCardGroup.getWorldPosition(cardWorldPos);

                                // Look at the player's head in world space and convert to parent local space
                                const m = this.scratchMatrix;
                                const worldUp = this.scratchVector2;
                                worldUp.set(0, 1, 0);
                                m.lookAt(cardWorldPos, headPos, worldUp);

                                const targetWorldQuat = this.scratchQuat1;
                                targetWorldQuat.setFromRotationMatrix(m);

                                // Flip 180° so PlaneGeometry front (+Z) faces user
                                const flipQuat = this.scratchQuat2;
                                flipQuat.setFromAxisAngle(worldUp, Math.PI);
                                targetWorldQuat.multiply(flipQuat);

                                const parentWorldQuat = this.scratchQuat2; // reuse scratchQuat2
                                this.nurburgringGroup.getWorldQuaternion(parentWorldQuat);

                                const localQuat = this.scratchQuat1; // reuse scratchQuat1
                                localQuat.copy(parentWorldQuat).invert().multiply(targetWorldQuat);
                                this.f1ActiveCardGroup.quaternion.copy(localQuat);
                            }
                        }
                    }
                } else if (this.f1ActiveCardGroup && this.f1ActiveCardGroup.visible) {
                    this.f1ActiveCardGroup.visible = false;
                }

                if (this.f1SprayMesh) this.f1SprayMesh.visible = false;
            }

            // Billboard all floating markers in this.f1Markers dynamically
            if (this.f1Markers && this.f1Markers.length > 0) {
                const headPos = this.scratchVector3;
                if (this.player && this.player.head) {
                    this.player.head.getWorldPosition(headPos);
                } else if (this.camera) {
                    this.camera.getWorldPosition(headPos);
                } else {
                    headPos.set(0, 1.45, 0.4);
                }
                this.f1Markers.forEach(marker => {
                    marker.visible = true;
                    marker.lookAt(headPos);
                });
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
        const wristWorldQuat = new THREE.Quaternion();

        if (leftSource && leftSource.hand && frame) {
            const wristJoint = leftSource.hand.get('wrist');
            if (wristJoint) {
                const refSpace = this.renderer.xr.getReferenceSpace();
                if (refSpace && typeof frame.getJointPose === 'function') {
                    const wristPose = frame.getJointPose(wristJoint, refSpace);
                    if (wristPose) {
                        wristWorldPos.set(
                            wristPose.transform.position.x,
                            wristPose.transform.position.y,
                            wristPose.transform.position.z,
                        );
                        wristWorldPos.applyMatrix4(this.player.matrixWorld);
                        // Capture joint orientation and rotate into world space
                        wristWorldQuat.set(
                            wristPose.transform.orientation.x,
                            wristPose.transform.orientation.y,
                            wristPose.transform.orientation.z,
                            wristPose.transform.orientation.w,
                        );
                        const playerQuat = new THREE.Quaternion();
                        this.player.matrixWorld.decompose(new THREE.Vector3(), playerQuat, new THREE.Vector3());
                        wristWorldQuat.premultiply(playerQuat);
                        leftWristFound = true;
                    }
                }
            }
        }

        // Place button flat on the dorsal (back-of-hand) surface.
        // Quest wrist joint: +Y = finger direction, +Z = roughly palm-facing.
        // Rotating 90° around local X converts the plane from "standing up" to lying flat.
        // Then offset 2.5 cm outward from the corrected normal so the button floats above the skin.
        if (leftWristFound) {
            const orientFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            const flatQuat = wristWorldQuat.clone().multiply(orientFix);
            const skinNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(flatQuat);
            this.wristButton.position.copy(wristWorldPos).addScaledVector(skinNormal, 0.025);
            this.wristButton.quaternion.copy(flatQuat);
            this.wristButtonMat.opacity = THREE.MathUtils.lerp(this.wristButtonMat.opacity, 0.9, dt * 10.0);
            this.wristButton.visible = true;
        } else {
            this.wristButtonMat.opacity = THREE.MathUtils.lerp(this.wristButtonMat.opacity, 0.0, dt * 10.0);
            if (this.wristButtonMat.opacity < 0.01) {
                this.wristButton.visible = false;
            }
        }

        // Right index tip poke — close-stack tap vs hold-to-quit
        const rightIndexTip = new THREE.Vector3();
        const hasRightIndex = this.getIndexData('right', rightIndexTip);
        const distToWristBtn = (leftWristFound && hasRightIndex)
            ? rightIndexTip.distanceTo(this.wristButton.position)
            : Infinity;
        const nowTouchingWrist = distToWristBtn < 0.03;

        if (nowTouchingWrist) {
            // Rising edge: snap haptic — mimics Quest keyboard physical stop
            if (!this.wristWasTouching) {
                const rSnap = this.input.getPrimaryInputSource('right');
                if (rSnap?.gamepad?.hapticActuators?.[0]) {
                    rSnap.gamepad.hapticActuators[0].pulse(1.0, 60);
                }
                this.drawWristButton(0, true); // immediately go green
            }

            this.wristHoldTimer += dt;
            const holdProgress = Math.min(this.wristHoldTimer / 3.0, 1.0);

            if (!this.isQuitPopupVisible) {
                // Escalating hold haptic (skip first frame so snap stands out)
                if (this.wristHoldTimer > 0.08) {
                    const rSrc = this.input.getPrimaryInputSource('right');
                    if (rSrc?.gamepad?.hapticActuators?.[0]) {
                        rSrc.gamepad.hapticActuators[0].pulse(0.1 + 0.8 * holdProgress, 16);
                    }
                }
                this.drawWristButton(holdProgress, true);
            }

            if (this.wristHoldTimer >= 3.0 && !this.isQuitPopupVisible) {
                this.isQuitPopupVisible = true;
                this.quitPopup.visible = true;
                this.quitPopupHoveredBtn = -1;
                this.drawQuitPopup(-1);
                this.drawWristButton(0, false); // reset to idle once popup appears
                console.log('[WristBtn] 3 s hold — showing quit confirmation.');
            }
        } else {
            if (this.wristWasTouching) {
                this.drawWristButton(0, false); // reset to idle on release
                if (this.wristHoldTimer < 0.5 && !this.isQuitPopupVisible && this.menuToggleCooldown <= 0.0) {
                    this.menuToggleCooldown = 0.6;
                    this.handleWristClose();
                }
            }
            this.wristHoldTimer = 0.0;
        }
        this.wristWasTouching = nowTouchingWrist;

        // Quit popup — position above wrist, billboard face user, handle YES/NO poke
        if (this.isQuitPopupVisible && this.quitPopup) {
            if (leftWristFound) {
                const dorsalDir = new THREE.Vector3(0, 0, 1).applyQuaternion(wristWorldQuat);
                this.quitPopup.position.copy(wristWorldPos).addScaledVector(dorsalDir, 0.12);
            } else if (this.player && this.player.head) {
                const hp2 = new THREE.Vector3();
                this.player.head.getWorldPosition(hp2);
                const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                fwd.y = 0; fwd.normalize();
                this.quitPopup.position.copy(hp2).addScaledVector(fwd, 0.4);
                this.quitPopup.position.y = hp2.y - 0.1;
            }
            if (this.player && this.player.head) {
                const hp3 = new THREE.Vector3();
                this.player.head.getWorldPosition(hp3);
                this.quitPopup.lookAt(hp3);
            }
            this.quitPopupMat.opacity = THREE.MathUtils.lerp(this.quitPopupMat.opacity, 0.95, dt * 15.0);

            if (hasRightIndex && this.menuToggleCooldown <= 0.0) {
                const inv = new THREE.Matrix4().copy(this.quitPopup.matrixWorld).invert();
                const localTip = rightIndexTip.clone().applyMatrix4(inv);
                // Popup plane is 0.12 m × 0.06 m, canvas 256 × 128
                if (Math.abs(localTip.z) < 0.025 && Math.abs(localTip.x) < 0.06 && Math.abs(localTip.y) < 0.03) {
                    const cx2 = (localTip.x + 0.06) / 0.12 * 256;
                    const cy2 = (0.03 - localTip.y) / 0.06 * 128;
                    let hovBtn = -1;
                    if (cy2 >= 48 && cy2 <= 84) {
                        if (cx2 >= 16 && cx2 <= 112) hovBtn = 0;      // YES
                        else if (cx2 >= 144 && cx2 <= 240) hovBtn = 1; // NO
                    }
                    if (hovBtn !== this.quitPopupHoveredBtn) {
                        this.quitPopupHoveredBtn = hovBtn;
                        this.drawQuitPopup(hovBtn);
                    }
                    if (Math.abs(localTip.z) < 0.012 && hovBtn !== -1) {
                        this.menuToggleCooldown = 0.8;
                        if (hovBtn === 0) {
                            console.log('[WristBtn] YES — exiting XR.');
                            this.world.exitXR();
                        } else {
                            console.log('[WristBtn] NO — dismissing quit popup.');
                            this.isQuitPopupVisible = false;
                            this.quitPopupMat.opacity = 0.0;
                            this.quitPopup.visible = false;
                        }
                    }
                } else if (this.quitPopupHoveredBtn !== -1) {
                    this.quitPopupHoveredBtn = -1;
                    this.drawQuitPopup(-1);
                }
            }
        } else if (this.quitPopup && !this.isQuitPopupVisible) {
            this.quitPopupMat.opacity = THREE.MathUtils.lerp(this.quitPopupMat.opacity, 0.0, dt * 15.0);
            if (this.quitPopupMat.opacity < 0.01 && this.quitPopup.visible) {
                this.quitPopup.visible = false;
            }
        }

        // Minimap toggle via keyboard shortcut or compass MINIMAP spoke (wrist button no longer toggles minimap)
        const toggleMinimap = this.checkMButton() || (window as any).triggerMinimapToggle;

        if (toggleMinimap && this.menuToggleCooldown <= 0.0) {
            if ((window as any).triggerMinimapToggle) {
                (window as any).triggerMinimapToggle = false;
            }
            this.menuToggleCooldown = 0.8;
            this.isTableSpawned = !this.isTableSpawned;
            this.drawWristButton(0, false); // Update wrist button icon
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

                // (Transition 2 -> 3 is now handled reactively in the zoom gesture loop)
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
                if (!this.isSportSequenceActive && this.currentStadiumType !== 'nurburgring') {
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

                p.tag.visible = (this.currentStadiumType !== 'nurburgring') && (tagMat.opacity > 0.01);
                p.mesh.visible = (this.currentStadiumType !== 'nurburgring') && (bodyMat.opacity > 0.01);
                p.ring.visible = (this.currentStadiumType !== 'nurburgring') && (ringMat.opacity > 0.01);

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

                        // strictly clamped from 1.0 (base 0.60m diameter) up to 10.0 (Player Immersive maximum)
                        this.userTableScale = THREE.MathUtils.clamp(targetUserScale, 1.0, 10.0);

                        // Advance tutorial step 2 -> 3 when two-handed scaling is actively performed
                        this.queries.jugnu.entities.forEach(e => {
                            if (e.getValue(Jugnu, "instructionStep") === 2) {
                                e.setValue(Jugnu, "instructionStep", 3);
                            }
                        });

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

                        // Advance tutorial step 1 -> 2 when rotation is actively performed
                        this.queries.jugnu.entities.forEach(e => {
                            if (e.getValue(Jugnu, "instructionStep") === 1) {
                                e.setValue(Jugnu, "instructionStep", 2);
                            }
                        });
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
                    if (this.pinchProgresses[i] > 1.0) {
                        this.pinchProgresses[i] = 1.0;
                    }

                    const chargeRatio = this.pinchProgresses[i] / 1.0; // 0.0 to 1.0

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
                    if (this.pinchProgresses[i] >= 1.0 && this.menuToggleCooldown <= 0.0) {
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

                    const chargeRatio = this.pinchProgresses[i] / 1.0;

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

            const targetPinOpacity = (this.isSportSequenceActive || this.currentTableScale >= 2.5 || this.currentStadiumType !== 'default') ? 0.0 : (0.9 * fadeFactor);
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
                // Floating top banner hides by the 2nd scale level (~2.0) and
                // reappears when scaled back down. Fully visible at <=1.5.
                const billboardFade = THREE.MathUtils.clamp(
                    THREE.MathUtils.mapLinear(this.currentTableScale, 1.5, 2.0, 1.0, 0.0),
                    0.0,
                    1.0
                );
                this.arBillboard.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const mat = child.material as THREE.Material;
                        if (mat && mat.transparent) {
                            const defOpacity = child.userData.defaultOpacity ?? 0.8;
                            const targetOpacity = (areFireworksPlaying || this.isSportSequenceActive) ? 0.0 : (defOpacity * billboardFade);
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
                this.arBillboard.visible = (this.currentStadiumType === 'default' || this.currentStadiumType === 'berlin' || this.currentStadiumType === 'butterflies') && (maxOpacity > 0.01);
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

            if (this.currentStadiumType === 'butterflies') {
                this.scoreDisplayMeshes.forEach(s => s.visible = false);
                this.fireworkSeqTimer = -1.0;
                this.fireworkSeqIndex = 0;
                this.updateFireworks(dt);
            } else {
                this.updateFireworks(dt);
                this.updateWeather(dt);
                this.updateSportSequence(dt);
                this.updateNetsWiggling(dt);
                this.updateBallProjectorDisk();

                // - Small Version (Minimized): [1.0, 2.0) -> fully visible (stFadeFactor = 1.0)
                // - Medium Version: [2.0, 2.5) -> if isNavLayerActive, fade to 0.70 (30% transparency), else 0.90 (90% solid)
                // - Player Immersive View: [2.5, 10.0] -> structural meshes smoothly fade to 0.0 from their starting opacity
                let stFadeFactor = 1.0;
                if (this.currentTableScale >= 2.5) {
                    const startVal = this.isNavLayerActive ? 0.70 : 0.90;
                    stFadeFactor = THREE.MathUtils.clamp(
                        THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 10.0, startVal, 0.0),
                        0.0,
                        startVal
                    );
                } else if (this.currentTableScale >= 2.0) {
                    stFadeFactor = this.isNavLayerActive ? 0.70 : 0.90;
                } else {
                    stFadeFactor = 1.0;
                }

                const activeStMesh = this.currentStadiumType === 'default' ? this.stadiumMesh
                    : this.currentStadiumType === 'berlin' ? this.berlinMesh
                        : this.currentStadiumType === 'inuit' ? this.inuitMesh
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
                                matches('field') || matches('grass') || matches('goal') || matches('net') || matches('post') || matches('basket') ||
                                matches('court') || matches('hardwood') || matches('floor') || matches('paint') || matches('key') || matches('restrict') || matches('hoop') || matches('backboard')
                            );
                            const isAmenities = matches('ameneties');

                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            let hasVisibleMat = false;
                            mats.forEach((mat: any) => {
                                if (mat) {
                                    // Store original material opacity and transparency in userData so we can scale relative to it!
                                    if (mat.userData.baseOpacity === undefined) {
                                        mat.userData.baseOpacity = mat.opacity ?? 1.0;
                                        mat.userData.originallyTransparent = mat.transparent ?? false;
                                    }

                                    const factor = (isGameplay || isAmenities) ? 1.0 : stFadeFactor;
                                    const targetOp = mat.userData.baseOpacity * factor;
                                    // Smoothly interpolate opacity to prevent jarring flashes
                                    mat.opacity += (targetOp - mat.opacity) * dt * 10.0;

                                    // Dynamic transparency to avoid sorting bugs when fully opaque
                                    mat.transparent = mat.userData.originallyTransparent || (mat.opacity < 0.99);

                                    // Dynamic pulsing highlight for amenities under navigation
                                    if (isAmenities && mat.emissive) {
                                        if (this.isNavLayerActive) {
                                            mat.emissive.setHex(0xffaa00); // Amber-gold glow
                                            const pulse = 0.7 + Math.sin(Date.now() * 0.006) * 0.5;
                                            mat.emissiveIntensity = pulse;
                                            mat.opacity = 1.0; // Overrides factor/lerp to keep it fully opaque!
                                        } else {
                                            mat.emissive.setHex(0x000000);
                                            mat.emissiveIntensity = 0.0;
                                        }
                                    }

                                    if (mat.opacity > 0.005) {
                                        hasVisibleMat = true;
                                    }
                                }
                            });
                            child.visible = hasVisibleMat;
                        }
                    });
                }

                // TCD (Action Deck) menu system removed from stadium; now handled by Companion Compass UI (jugnu.ts)
            }

            // --- Holographic Containment Cylinder Update ---
            if (this.currentTableScale >= 2.5 && this.currentStadiumType !== 'butterflies') {
                this.holoCylinder.visible = true;
                this.holoCylinderWire.visible = true;

                const cylinderAlpha = THREE.MathUtils.clamp(
                    THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 10.0, 0.0, 0.15),
                    0.0,
                    0.15
                );
                const wireframeAlpha = THREE.MathUtils.clamp(
                    THREE.MathUtils.mapLinear(this.currentTableScale, 2.5, 10.0, 0.0, 0.5),
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
            this.restoreHoopScales();
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
            // TCD visibility resets handled by companion UI

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
                    this.mivVideo.play().catch(() => { });
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
        [80, 150, 240].forEach(r => { ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke(); });

        ctx.strokeStyle = 'rgba(0,255,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 300, H / 2); ctx.lineTo(W / 2 - 20, H / 2);
        ctx.moveTo(W / 2 + 20, H / 2); ctx.lineTo(W / 2 + 300, H / 2);
        ctx.moveTo(W / 2, H / 2 - 300); ctx.lineTo(W / 2, H / 2 - 20);
        ctx.moveTo(W / 2, H / 2 + 20); ctx.lineTo(W / 2, H / 2 + 300);
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
        ctx.fillText(cityLabels[cityKey] || cityKey, W / 2, 90);
        ctx.font = '34px monospace'; ctx.fillStyle = 'rgba(0,255,255,0.85)';
        ctx.fillText(`LAT ${lat.toFixed(4)}\u00b0   LNG ${lng.toFixed(4)}\u00b0`, W / 2, 148);
        ctx.font = 'bold 42px monospace'; ctx.fillStyle = '#00ffff';
        ctx.fillText('ACQUIRING SATELLITE LINK...', W / 2, H / 2 - 30);
        ctx.font = '30px monospace'; ctx.fillStyle = 'rgba(0,255,255,0.7)';
        ctx.fillText('FETCHING STREET VIEW PANORAMA TILES', W / 2, H / 2 + 20);
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
                flipped.data[dst] = imageData.data[src];
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
        [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]].forEach(([cx, cy], i) => {
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
        sCtx.fillText(`${lat.toFixed(4)}\u00b0  ${lng.toFixed(4)}\u00b0  |  PANO ${panoId.substring(0, 10)}...`, 28, 66);
        sCtx.textAlign = 'right'; sCtx.font = 'bold 20px monospace';
        sCtx.fillStyle = 'rgba(0,255,255,0.9)';
        sCtx.fillText('GOOGLE STREET VIEW', W - 28, 44);
        sCtx.textAlign = 'center'; sCtx.font = 'bold 16px monospace';
        sCtx.fillStyle = 'rgba(0,255,255,0.75)';
        sCtx.fillText("PINCH 'X' TO EXIT DOMAIN", W / 2, H - 18);

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
        ctx.moveTo(W / 2 + 20, H / 2); ctx.lineTo(W / 2 + 200, H / 2);
        ctx.moveTo(W / 2, H / 2 - 200); ctx.lineTo(W / 2, H / 2 - 20);
        ctx.moveTo(W / 2, H / 2 + 20); ctx.lineTo(W / 2, H / 2 + 200);
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

        const cityLabels: Record<string, string> = {
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
            const g = data[i + 1];
            const b = data[i + 2];
            const luma = Math.max(r, g, b);
            if (luma < 15) {
                data[i + 3] = 0;
            } else if (luma < 40) {
                data[i + 3] = (luma - 15) * 10;
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

        const bannerGeom = new THREE.PlaneGeometry(0.108, 0.0608);
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

        texLoader.load('./ui/ipl/center (1).png', (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            this.iplBillboardTexture = tex;
            if (this.currentStadiumType === 'default' || !this.currentStadiumType) {
                bannerMat.map = tex;
                bannerMat.needsUpdate = true;
            }
        });

        texLoader.load('./ui/football/ucl_score_banner.png', (tex) => {
            const alphaTex = this.makeBlackTransparent(tex.image);
            this.soccerBillboardTexture = alphaTex;
            if (this.currentStadiumType === 'berlin' || this.currentStadiumType === 'butterflies') {
                bannerMat.map = alphaTex;
                bannerMat.needsUpdate = true;
            }
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
            depthWrite: false,
            depthTest: false
        });
        this.hawkeyeBall = new THREE.Mesh(ballGeom, ballMat);
        this.hawkeyeBall.userData = { defaultOpacity: 0.95 };
        this.hawkeyeBall.renderOrder = 9999;
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
            { id: "b1", name: "Y. Jaiswal", role: "batsman", jersey: "1", team: "yellow", x: 0.035, z: -0.005, primary: "Runs: 68* (42)", secondary: "SR: 161.9", rcbCardKey: "" },
            { id: "b2", name: "S. Samson", role: "batsman", jersey: "13", team: "yellow", x: -0.035, z: 0.005, primary: "Runs: 31 (20)", secondary: "SR: 155.0", rcbCardKey: "" },
            // ── Umpires ─────────────────────────────────────────────────────
            { id: "u1", name: "M. Erasmus", role: "umpire", jersey: "U1", team: "neutral", x: -0.055, z: 0.000, primary: "Umpire (Bowler's)", secondary: "Decisions: 100%", rcbCardKey: "" },
            { id: "u2", name: "N. Llong", role: "umpire", jersey: "U2", team: "neutral", x: 0.035, z: 0.020, primary: "Umpire (Sq. Leg)", secondary: "Decisions: 100%", rcbCardKey: "" },
            // ── Fielding: Royal Challengers Bengaluru (Blue) ────────────────
            { id: "f1", name: "J. Cox", role: "fielder", jersey: "60", team: "blue", x: 0.052, z: 0.000, primary: "Catches: 1, St: 0", secondary: "Wicketkeeper", rcbCardKey: "rcbJordanCox" },
            { id: "f2", name: "B. Kumar", role: "fielder", jersey: "15", team: "blue", x: -0.055, z: 0.000, primary: "Overs: 3.2-0-22-2", secondary: "Active: Bowler", rcbCardKey: "rcbBhuvi" },
            { id: "f3", name: "K. Pandya", role: "fielder", jersey: "24", team: "blue", x: 0.022, z: 0.026, primary: "Overs: 2-0-18-1", secondary: "Pos: Point", rcbCardKey: "rcbKrunal" },
            { id: "f4", name: "V. Kohli", role: "fielder", jersey: "18", team: "blue", x: -0.004, z: 0.028, primary: "4s/6s: 3/4 | SR:250", secondary: "Pos: Cover", rcbCardKey: "rcbKohli" },
            { id: "f5", name: "V. Iyer", role: "fielder", jersey: "10", team: "blue", x: 0.022, z: -0.018, primary: "Runs Saved: 5", secondary: "Pos: Gully", rcbCardKey: "rcbVenkatesh" },
            { id: "f6", name: "T. David", role: "fielder", jersey: "8", team: "blue", x: -0.065, z: 0.060, primary: "Catches: 0", secondary: "Pos: Deep Mid-On", rcbCardKey: "rcbTimDavid" },
            { id: "f7", name: "J. Bethell", role: "fielder", jersey: "34", team: "blue", x: 0.065, z: 0.055, primary: "Runs Saved: 4", secondary: "Pos: Deep Cover", rcbCardKey: "rcbBethell" },
            { id: "f8", name: "R. Shepherd", role: "fielder", jersey: "9", team: "blue", x: -0.075, z: -0.020, primary: "Overs: 2-0-14-1", secondary: "Pos: Long-On", rcbCardKey: "rcbShepherd" },
            { id: "f9", name: "J. Hazlewood", role: "fielder", jersey: "23", team: "blue", x: 0.060, z: -0.055, primary: "Overs: 3-0-20-2", secondary: "Pos: Fine Leg", rcbCardKey: "rcbHazlewood" },
            { id: "f10", name: "J. Duffy", role: "fielder", jersey: "77", team: "blue", x: -0.045, z: -0.070, primary: "Overs: 2-0-16-0", secondary: "Pos: Deep Mid-Wkt", rcbCardKey: "rcbDuffy" },
            { id: "f11", name: "R. Patidar", role: "fielder", jersey: "21", team: "blue", x: 0.002, z: -0.082, primary: "Catches: 1", secondary: "Pos: Long-Off", rcbCardKey: "rcbPatidar" },
        ];

        const rosterFootball: PlayerEntry[] = [
            // ── Berlin FC (Blue — home) ──────────────────────────────────────
            // Goalkeeper (re-positioned so he stands right in front of the goal line at z = -0.055 table space)
            { id: "gk", name: "M. Neuer", role: "fielder", jersey: "1", team: "blue", x: 0.000, z: -0.055, primary: "Saves: 3 / 5", secondary: "GK — Penalty Box", rcbCardKey: "" },
            // Defenders
            { id: "d2", name: "R. Rüdiger", role: "fielder", jersey: "22", team: "blue", x: 0.040, z: -0.045, primary: "Interceptions: 3", secondary: "CB — Right", rcbCardKey: "" },
            { id: "d3", name: "J. Kimmich", role: "fielder", jersey: "6", team: "blue", x: -0.070, z: -0.035, primary: "Crosses: 5", secondary: "RB — Wing", rcbCardKey: "" },
            // Midfielders
            { id: "m2", name: "L. Goretzka", role: "fielder", jersey: "8", team: "blue", x: 0.025, z: -0.030, primary: "Passes: 42 / 48", secondary: "CM — Defensive", rcbCardKey: "" },
            // Forwards
            { id: "fw1", name: "L. Sané", role: "fielder", jersey: "10", team: "blue", x: -0.055, z: 0.015, primary: "Shots: 2 / 4", secondary: "LW — Forward", rcbCardKey: "" },
            { id: "fw3", name: "H. Kane", role: "batsman", jersey: "9", team: "blue", x: 0.000, z: 0.020, primary: "Goals: 1  Shots: 4", secondary: "ST — Striker", rcbCardKey: "" },
            // Away team
            { id: "a1", name: "J. Bellingham", role: "batsman", jersey: "22", team: "yellow", x: 0.013, z: 0.040, primary: "Goals: 1  Assists: 1", secondary: "AM — Attacking", rcbCardKey: "" },
            // Referee
            { id: "ref", name: "S. Marciniak", role: "umpire", jersey: "R", team: "neutral", x: 0.000, z: 0.000, primary: "Referee", secondary: "UEFA Pro", rcbCardKey: "" },
        ];

        const rosterBasketball: PlayerEntry[] = [
            // ── Indiana Pacers (Blue — home) ──────────────────────────────────
            { id: "p1", name: "T. Haliburton", role: "batsman", jersey: "0", team: "blue", x: 0.000, z: 0.010, primary: "Pts: 20.1  Ast: 10.9", secondary: "PG — Playmaker", rcbCardKey: "nbaTyreseHaliburton" },
            { id: "p2", name: "M. Turner", role: "batsman", jersey: "33", team: "blue", x: 0.000, z: -0.010, primary: "Pts: 17.1  Blk: 1.9", secondary: "C — Post", rcbCardKey: "nbaMylesTurner" },
            { id: "p3", name: "A. Nembhard", role: "fielder", jersey: "2", team: "blue", x: -0.030, z: 0.025, primary: "Pts: 12.9  Ast: 4.1", secondary: "SG — Guard", rcbCardKey: "nbaAndrewNembhard" },
            { id: "p4", name: "A. Nesmith", role: "fielder", jersey: "23", team: "blue", x: 0.030, z: 0.025, primary: "Pts: 12.2  Reb: 3.8", secondary: "SF — Wing", rcbCardKey: "nbaAaronNesmith" },
            { id: "p5", name: "P. Siakam", role: "fielder", jersey: "43", team: "blue", x: -0.045, z: 0.000, primary: "Pts: 21.7  Reb: 7.1", secondary: "PF — Forward", rcbCardKey: "nbaPascalSiakam" },
            // ── Oklahoma City Thunder (Yellow — away) ──────────────────────────
            { id: "a1", name: "S. Gilgeous-Alex", role: "batsman", jersey: "2", team: "yellow", x: 0.000, z: 0.035, primary: "Pts: 30.1  Stl: 2.0", secondary: "PG — Guard", rcbCardKey: "nbaShaiSGA" },
            { id: "a2", name: "C. Holmgren", role: "batsman", jersey: "7", team: "yellow", x: 0.000, z: 0.050, primary: "Pts: 16.5  Blk: 2.3", secondary: "C — Center", rcbCardKey: "nbaChetHolmgren" },
            { id: "a3", name: "J. Williams", role: "fielder", jersey: "8", team: "yellow", x: 0.040, z: 0.045, primary: "Pts: 19.1  Ast: 4.5", secondary: "PF — Forward", rcbCardKey: "nbaJalenWilliams" },
            { id: "a4", name: "A. Caruso", role: "fielder", jersey: "9", team: "yellow", x: -0.040, z: 0.045, primary: "Pts: 10.1  Def: Elite", secondary: "SG — Defender", rcbCardKey: "nbaAlexCaruso" },
            { id: "a5", name: "L. Dort", role: "fielder", jersey: "5", team: "yellow", x: -0.055, z: 0.035, primary: "Pts: 10.9  Def: Lock", secondary: "SF — Wing", rcbCardKey: "nbaLuguentzDort" },
            // Officials
            { id: "ref", name: "M. Carettini", role: "umpire", jersey: "R", team: "neutral", x: 0.020, z: 0.025, primary: "NBA Referee", secondary: "15 yrs experience", rcbCardKey: "" },
        ];

        const rosterNurburgring: PlayerEntry[] = [
            { id: "f1_cl", name: "C. Leclerc", role: "fielder", jersey: "16", team: "yellow", x: 0, z: 0, primary: "Charles Leclerc", secondary: "Ferrari", rcbCardKey: "f1CharlesLeclerc" },
            { id: "f1_ln", name: "L. Norris", role: "fielder", jersey: "4", team: "blue", x: 0, z: 0, primary: "Lando Norris", secondary: "McLaren", rcbCardKey: "f1LandoNorris" },
            { id: "f1_gr", name: "G. Russell", role: "fielder", jersey: "63", team: "neutral", x: 0, z: 0, primary: "George Russell", secondary: "Mercedes", rcbCardKey: "f1GeorgeRussell" }
        ];

        const roster: PlayerEntry[] =
            (this.currentStadiumType === 'berlin' || this.currentStadiumType === 'butterflies') ? rosterFootball
                : this.currentStadiumType === 'inuit' ? rosterBasketball
                    : this.currentStadiumType === 'nurburgring' ? rosterNurburgring
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
            blue: {
                body: mkGlass(0xee2222, 0xff0044, 0.82),  // Glowing ruby red
                sec: mkGlass(0xffcc00, 0xffb700, 0.95),  // Glowing neon gold
                pants: mkGlass(0x0f172a, 0x1e293b, 0.85),  // Holographic navy/slate
                accent: mkGlass(0xff3355, 0xff0055, 0.90),
            },
            yellow: {
                body: mkGlass(0xff0088, 0xff00cc, 0.82),  // Glowing cyber pink/magenta
                sec: mkGlass(0x0099ff, 0x00ccff, 0.95),  // Glowing electric blue
                pants: mkGlass(0xe2e8f0, 0xffffff, 0.85),  // Frosted silver glass
                accent: mkGlass(0x00ffff, 0x00ffff, 0.90),
            },
            neutral: {
                body: mkGlass(0x090d16, 0x0f172a, 0.85),  // Cyber obsidian
                sec: mkGlass(0x00ffff, 0x00ffff, 0.95),  // Glowing cyan trims
                pants: mkGlass(0x1e293b, 0x334155, 0.85),  // Dark slate pants
                accent: mkGlass(0xffffff, 0xffffff, 0.90),
            },
        };
        // Soft glowing frosted-ice holographic skin!
        const sharedSkin = mkGlass(0xe2e8f0, 0x00ffcc, 0.88);
        const sharedBlack = mkGlass(0x05050f, 0x000000, 0.95);
        const sharedWood = mkGlass(0xb5823a, 0xe2af37, 0.95);
        const sharedMetal = mkGlass(0x475569, 0x00ffff, 0.90);
        const sharedPad = mkGlass(0xf1f5f9, 0x00ffff, 0.90);
        const sharedLedMats = {
            blue: new THREE.MeshPhongMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffcc00).multiplyScalar(1.5), shininess: 200 }),
            yellow: new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: new THREE.Color(0x00ffff).multiplyScalar(1.5), shininess: 200 }),
            neutral: new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff).multiplyScalar(1.5), shininess: 200 }),
        };

        // ── Figure proportions at 50% of previous scale ──────────────────────────────
        const H_LEGS = 0.00375;
        const H_TORSO = 0.00275;
        const H_HEAD = 0.00125;
        const W_TORSO = 0.00090;
        const W_WAIST = 0.00065;
        const UA_H = H_TORSO * 0.75;
        const FA_H = H_TORSO * 0.60;
        const THIGH_H = H_LEGS * 0.54;
        const SHIN_H = H_LEGS * 0.46;

        // ── Shared geometry pool (ONE geometry object per body part — reused across all 22 players) ─
        const gTorso = new THREE.CylinderGeometry(W_TORSO, W_WAIST, H_TORSO, 7);
        gTorso.translate(0, H_TORSO / 2, 0);
        const gStripe = new THREE.BoxGeometry(W_TORSO * 1.8, H_TORSO * 0.18, W_TORSO * 0.25);
        const gNeck = new THREE.CylinderGeometry(0.000275, 0.0003, 0.0006, 6);
        const gHead = new THREE.IcosahedronGeometry(H_HEAD * 0.78, 1); // Faceted crystal head!
        const gHelmet = new THREE.IcosahedronGeometry(H_HEAD * 0.86, 1); // Sleek cybernetic faceted headgear shell!
        const gBrim = new THREE.CylinderGeometry(H_HEAD * 0.94, H_HEAD * 0.94, 0.00006, 10, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
        const gGrill = new THREE.CylinderGeometry(0.000048, 0.000048, H_HEAD, 4);
        const gVisor = new THREE.BoxGeometry(H_HEAD * 1.5, H_HEAD * 0.25, H_HEAD * 0.22); // Wraparound VR-style visor!
        const gShoulder = new THREE.BoxGeometry(W_TORSO * 1.1, H_TORSO * 0.16, W_TORSO * 0.8);
        const gUArm = (() => { const g = new THREE.CylinderGeometry(0.000325, 0.00026, UA_H, 6); g.translate(0, -UA_H / 2, 0); return g; })();
        const gFArm = (() => { const g = new THREE.CylinderGeometry(0.00024, 0.00019, FA_H, 5); g.translate(0, -FA_H / 2, 0); return g; })();
        const gThigh = (() => { const g = new THREE.CylinderGeometry(0.000425, 0.00036, THIGH_H, 6); g.translate(0, -THIGH_H / 2, 0); return g; })();
        const gShin = (() => { const g = new THREE.CylinderGeometry(0.00034, 0.00024, SHIN_H, 5); g.translate(0, -SHIN_H / 2, 0); return g; })();
        const gShoe = new THREE.BoxGeometry(0.0004, 0.00019, 0.00065);
        const gPad = new THREE.BoxGeometry(0.00045, SHIN_H * 0.88, 0.000275);
        const gRing = (() => { const g = new THREE.RingGeometry(0.0018, 0.0026, 16); g.rotateX(-Math.PI / 2); return g; })();

        // Additional custom geometries for sport-specific models (Zero-GC)
        const gGlove = new THREE.BoxGeometry(0.00075, 0.00075, 0.00075); // goalkeeper gloves
        const gHeadband = new THREE.CylinderGeometry(H_HEAD * 0.82, H_HEAD * 0.82, 0.0003, 10); // tennis/soccer headbands
        const gHair = new THREE.SphereGeometry(H_HEAD * 0.35, 8, 8); // hair bun for soccer style

        roster.forEach((p, idx) => {
            const team = p.team as 'blue' | 'yellow' | 'neutral';
            const mats = sharedMats[team];
            const ledM = sharedLedMats[team];

            const playerGroup = new THREE.Group();
            this.tableGroup.add(playerGroup);

            // Active sport flags
            const isCricket = this.currentStadiumType === 'default';
            const isFootball = this.currentStadiumType === 'berlin' || this.currentStadiumType === 'butterflies';
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
            rArmMesh.position.set((W_TORSO + 0.0003), H_TORSO * 0.82, 0);
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
            rLegMesh.position.set(W_WAIST * 0.75, 0, 0);
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
                const blade = new THREE.Mesh(bladeG, sharedWood);
                blade.position.y = 0.00145;
                const gripG = new THREE.CylinderGeometry(0.0001, 0.0001, 0.0008, 5);
                const grip = new THREE.Mesh(gripG, sharedBlack);
                grip.position.y = -0.00075;
                blade.add(grip);
                const batPivot = new THREE.Group();
                batPivot.add(blade);
                batPivot.position.set(W_TORSO * 0.9, H_TORSO * 0.35, W_TORSO * 0.7);
                batPivot.rotation.set(-Math.PI / 4.5, 0.15, Math.PI / 5.5);
                mesh.add(batPivot);

                // Natural athletic stance, arms not crossed
                lArmMesh.rotation.set(-Math.PI / 4, 0, -Math.PI / 12);
                rArmMesh.rotation.set(-Math.PI / 3, 0, Math.PI / 12);
                lLegMesh.rotation.set(Math.PI / 9, 0, -Math.PI / 14);
                rLegMesh.rotation.set(Math.PI / 9, 0, Math.PI / 14);
            } else if (p.role === 'fielder') {
                // Normal fielders (or soccer/basketball): arms at sides, not crossed
                lArmMesh.rotation.set(-Math.PI / 18, 0, -Math.PI / 10);
                rArmMesh.rotation.set(-Math.PI / 18, 0, Math.PI / 10);
                lLegMesh.rotation.set(Math.PI / 11, 0, -Math.PI / 13);
                rLegMesh.rotation.set(Math.PI / 11, 0, Math.PI / 13);
            } else {
                // Umpires and officials: neutral arms hanging naturally down
                lArmMesh.rotation.set(0, 0, -Math.PI / 12);
                rArmMesh.rotation.set(0, 0, Math.PI / 12);
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
                targetPos: new THREE.Vector3(sx, 0.009, sz),
                currentPos: new THREE.Vector3(sx, 0.009, sz),
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
            const borderBackGeom = new THREE.PlaneGeometry(0.061, 0.0793);
            const borderGeom = new THREE.EdgesGeometry(borderBackGeom);
            const borderMat = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.0, // Init to 0, synced in update()
                depthWrite: false
            });
            const borderMesh = new THREE.LineSegments(borderGeom, borderMat);
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
            depthWrite: false,
            depthTest: false
        });
        this.sequenceBall = new THREE.Mesh(ballGeom, ballMat);
        this.sequenceBall.visible = false;
        this.sequenceBall.renderOrder = 9999;
        this.tableGroup.add(this.sequenceBall);

        const trailGeom = new THREE.BufferGeometry();
        trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(150), 3));
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
        // Play spatialized launch sound
        const localPos = this.scratchVector6.set(x, y, z);
        const worldPos = localPos.applyMatrix4(this.tableGroup.matrixWorld);
        const spatialFX = (window as any).spatialFX;
        if (spatialFX) {
            spatialFX.playPositionalSound('fireworkLaunch', worldPos, scale);
        }

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

                        // Play spatialized explosion sound
                        const localPos = this.scratchVector6.set(px_curr, py_curr, pz_curr);
                        const worldPos = localPos.applyMatrix4(this.tableGroup.matrixWorld);
                        const spatialFX = (window as any).spatialFX;
                        if (spatialFX) {
                            spatialFX.playPositionalSound('fireworkExplode', worldPos, this.fireworkScale[i]);
                        }

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



    private initTrackingButtons() {
        // --- Score Display curved arc ---
        this.initScoreDisplay();
    }

    private initScoreDisplay() {
        const texLoader = new THREE.TextureLoader();

        const iplFiles = ['left extreme.png', 'left.png', 'center (1).png', 'right.png', 'right extreme.png'];
        const soccerFiles = ['bayern_stats.png', 'soccer_metrics.png', 'ucl_score_banner.png', 'soccer_boundaries.png', 'bvb_stats.png'];

        // Symmetric 5-board row: 2 left + center + 2 right, evenly spaced, all
        // All cards face the same forward (+Z) direction. Depth is TIERED, not
        // coplanar: extremes sit closest to the viewer, the left/right pair one
        // step back, and the center furthest back (a symmetric concave fan).
        // Each pair shares one Z plane; X spacing keeps them from overlapping.
        // Common height keeps tops/bottoms aligned; widths follow each PNG's
        // aspect ratio (left extreme = 2.0, all others = 1.777).
        // Cards sit ON the stadium roof arc (radius CARD_RADIUS, slightly inside
        // the rim) and are oriented TANGENT to the curve so they hug the stadium
        // and never poke outside. The arc naturally gives the symmetric concave
        // depth: center furthest back, extremes nearest the viewer.
        // Height trimmed a touch so all 5 fit tangent without overlapping.
        const PANEL_H = 0.030;
        const CARD_RADIUS = 0.090;             // just inside ROOF_RADIUS (0.096)
        const configs = [
            { file: 'left extreme.png', angleOffset: -70, w: PANEL_H * 2.0, h: PANEL_H },
            { file: 'left.png', angleOffset: -35, w: PANEL_H * 1.777, h: PANEL_H },
            { file: 'center (1).png', angleOffset: 0, w: PANEL_H * 1.777, h: PANEL_H },
            { file: 'right.png', angleOffset: 35, w: PANEL_H * 1.777, h: PANEL_H },
            { file: 'right extreme.png', angleOffset: 70, w: PANEL_H * 1.777, h: PANEL_H }
        ];

        const PANEL_Y = this.ROOF_Y + 0.006;  // resting height on the roof rim

        for (let i = 0; i < configs.length; i++) {
            this.iplTextures.push(null);
            this.soccerTextures.push(null);
        }

        configs.forEach((cfg, idx) => {
            const angle = Math.PI + (cfg.angleOffset * Math.PI / 180);
            const px = Math.sin(angle) * CARD_RADIUS;
            const pz = Math.cos(angle) * CARD_RADIUS;

            const panelGeom = new THREE.PlaneGeometry(cfg.w, cfg.h);
            const panelMat = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.8,            // 20% transparency
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const panelMesh = new THREE.Mesh(panelGeom, panelMat);

            if (iplFiles[idx]) {
                texLoader.load(`./ui/ipl/${iplFiles[idx]}`, (tex) => {
                    // black -> alpha channel (transparent background)
                    const alphaTex = this.makeBlackTransparent(tex.image);
                    this.iplTextures[idx] = alphaTex;
                    if (this.currentStadiumType === 'default' || !this.currentStadiumType) {
                        panelMat.map = alphaTex;
                        panelMat.needsUpdate = true;
                    }
                });
            }

            texLoader.load(`./ui/football/${soccerFiles[idx]}`, (tex) => {
                const alphaTex = this.makeBlackTransparent(tex.image);
                this.soccerTextures[idx] = alphaTex;
                if (this.currentStadiumType === 'berlin' || this.currentStadiumType === 'butterflies') {
                    panelMat.map = alphaTex;
                    panelMat.needsUpdate = true;
                }
            });

            panelMesh.position.set(px, PANEL_Y, pz);
            panelMesh.rotation.y = angle + Math.PI;  // tangent to the roof arc
            panelMesh.rotation.x = 0;

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





    private restoreHoopScales() {
        if (this.basketballHoop1 && this.basketballHoop1.userData.originalScale) {
            this.basketballHoop1.scale.copy(this.basketballHoop1.userData.originalScale);
        }
        if (this.basketballHoop2 && this.basketballHoop2.userData.originalScale) {
            this.basketballHoop2.scale.copy(this.basketballHoop2.userData.originalScale);
        }
        if (this.hoop1NetMesh && this.hoop1NetMesh.userData.originalScale) {
            this.hoop1NetMesh.scale.copy(this.hoop1NetMesh.userData.originalScale);
        }
        if (this.hoop2NetMesh && this.hoop2NetMesh.userData.originalScale) {
            this.hoop2NetMesh.scale.copy(this.hoop2NetMesh.userData.originalScale);
        }
        if (this.goal1NetMesh && this.goal1NetMesh.userData.originalScale) {
            this.goal1NetMesh.scale.copy(this.goal1NetMesh.userData.originalScale);
        }
        if (this.goal2NetMesh && this.goal2NetMesh.userData.originalScale) {
            this.goal2NetMesh.scale.copy(this.goal2NetMesh.userData.originalScale);
        }
    }

    private triggerSportSequence() {
        if (this.isSportSequenceActive) return;

        // Store original local scale of the hoops/nets/goals if not already stored
        if (this.basketballHoop1 && !this.basketballHoop1.userData.originalScale) {
            this.basketballHoop1.userData.originalScale = this.basketballHoop1.scale.clone();
        }
        if (this.basketballHoop2 && !this.basketballHoop2.userData.originalScale) {
            this.basketballHoop2.userData.originalScale = this.basketballHoop2.scale.clone();
        }
        if (this.hoop1NetMesh && !this.hoop1NetMesh.userData.originalScale) {
            this.hoop1NetMesh.userData.originalScale = this.hoop1NetMesh.scale.clone();
        }
        if (this.hoop2NetMesh && !this.hoop2NetMesh.userData.originalScale) {
            this.hoop2NetMesh.userData.originalScale = this.hoop2NetMesh.scale.clone();
        }
        if (this.goal1NetMesh && !this.goal1NetMesh.userData.originalScale) {
            this.goal1NetMesh.userData.originalScale = this.goal1NetMesh.scale.clone();
        }
        if (this.goal2NetMesh && !this.goal2NetMesh.userData.originalScale) {
            this.goal2NetMesh.userData.originalScale = this.goal2NetMesh.scale.clone();
        }

        console.log(`[SportSequence] Triggered sequence for: ${this.currentStadiumType}`);
        this.isSportSequenceActive = true;
        this.sportSequenceTime = 0.0;
        this.sportSequencePhase = 0;
        this.sequenceBallTrailCount = 0;
        this.f1VortexInitialized = false;

        // Clear existing trails
        this.sequenceBallTrail.geometry.setDrawRange(0, 0);
        if (this.sequenceBallTrail.geometry.attributes.position) {
            (this.sequenceBallTrail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

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
        } else if (stType === 'nurburgring') {
            // F1: No sequence ball - the real F1 cars ARE the actors. Hide ball.
            this.sequenceBall.visible = false;
            this.sequenceBallTrail.visible = false;
            // Boost Mercedes to ghost-car breakaway speed at sequence start
            this.nurburgringF1Speed = 0.13; // 2.5x normal speed for cinematic lap
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
        } else if (stType === 'nurburgring') {
            grad.addColorStop(0, '#22d3ee'); // Cyan
            grad.addColorStop(1, '#a855f7'); // Purple
            textVal = "FASTEST LAP";
            borderStroke = '#22d3ee';
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
        if (this.currentStadiumType === 'butterflies') {
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
                        this.scratchVector4.set(0.035, 0.012, 0.0),
                        this.scratchVector5.set(0.026, 0.012, 0.022),
                        reboundT
                    );
                    if (fielder3) runPlayer(fielder3, 0.026, 0.022, dt * 6.0);
                }

                if (time >= 2.0) {
                    const throwT = Math.min((time - 2.0) / 1.0, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        this.scratchVector4.set(0.026, 0.012, 0.022),
                        this.scratchVector5.set(-0.035, 0.009, 0.0),
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
                        this.scratchVector4.set(0.048, 0.025, 0.0),
                        this.scratchVector5.set(-0.035, 0.009, 0.0),
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
                        this.scratchVector4.set(0.035, 0.012, 0.0),
                        this.scratchVector5.set(0.065, -0.010, 0.085), // boundary point at grass level (-0.010)
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
                        this.scratchVector4.set(0.035, 0.012, 0.0),
                        this.scratchVector5.set(0.026, 0.012, 0.022),
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
                        this.scratchVector4.set(0.0 * S, 0.003, 0.02 * S),
                        this.scratchVector5.set(-0.055 * S, 0.003, 0.015 * S),
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
                    const startPos = this.scratchVector4.set(-0.065 * S, 0.003, -0.035 * S);
                    const endPos = this.scratchVector5.set(0.0 * S, 0.005, -0.045 * S); // box center
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
                if (kane) runPlayer(kane, 0.0 * S, -0.045 * S, dt * 22.0);
                if (rudiger) runPlayer(rudiger, 0.003 * S, -0.042 * S, dt * 22.0);

                // Contesting header: Kane leaps!
                if (time >= 9.0 && time < 10.2) {
                    if (kane) kane.group.position.y = 0.018; // jump 9mm high!
                    if (time >= 9.0 && time < 9.1) {
                        this.triggerFirework(0.0 * S, 0.018, -0.045 * S, 0x00ffff, 0.01);
                    }
                } else if (kane) {
                    kane.group.position.y = 0.009;
                }

                // Ball rebounds off Rüdiger's block back to Bellingham
                if (time >= 9.2) {
                    const reboundT = Math.min((time - 9.2) / 1.8, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        this.scratchVector4.set(0.0 * S, 0.018, -0.045 * S),
                        this.scratchVector5.set(0.0 * S, 0.003, -0.025 * S), // bellingham rebound spot
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

                // Ball passed to Kane at (0.0, 0.003, -0.050 * S)
                if (time >= 13.5) {
                    const throwT = Math.min((time - 13.5) / 1.5, 1.0);
                    this.sequenceBall.position.lerpVectors(
                        this.scratchVector4.set(0.0 * S, 0.003, -0.025 * S),
                        this.scratchVector5.set(0.0 * S, 0.003, -0.050 * S),
                        throwT
                    );
                    if (bellingham) stopPlayer(bellingham);
                    // Kane Receive (Soccer, phase 5): Run at dt * 22.0
                    if (kane) runPlayer(kane, 0.0 * S, -0.050 * S, dt * 22.0);
                } else {
                    this.sequenceBall.position.set(0.0 * S, 0.003, -0.025 * S);
                }
            } else if (time >= 16.0 && time < 20.0) {
                // --- Kane Curving Goal Shot, Neuer Dives (16.0s - 20.0s) ---
                showPlayerCard("fw3"); // Highlight Kane
                const shotT = Math.min((time - 16.0) / 1.2, 1.0);

                // Ball flies into Goal 2 (bottom right corner of net)
                // Adjust shot ending position to z = -0.061 and Neuer's dive position to z = -0.055 (physical coordinates)
                const startX = 0.0 * S, startY = 0.003, startZ = -0.050 * S;
                const endX = 0.008 * S, endY = 0.004, endZ = -0.061; // Physical endZ = -0.061

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
                    this.triggerFirework(0.008 * S, 0.004, -0.061, 0x22d3ee, 0.015);
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
        else if (stType === 'inuit') {

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
                            this.scratchVector4.set(0.0, 0.015, -0.015),
                            this.scratchVector5.set(-0.035, 0.015, -0.04),
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
                        this.scratchVector4.set(-0.035, 0.015, -0.04),
                        this.scratchVector5.set(0.03, 0.015, -0.035), // Reaves behind 3-pt line
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

                    // High parabolic 3-pointer flight to Goal 1 Hoop at (0.0005, 0.023, -0.0439)
                    const flightT = Math.min((time - 12.0) / 2.5, 1.0);
                    if (time >= 12.0) {
                        const startPos = this.scratchVector4.set(0.03, 0.022, -0.035);
                        const endPos = this.scratchVector5.set(0.0005, 0.023, -0.0439);
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
                    this.scratchVector4.set(0.0005, 0.023, -0.0439),
                    this.scratchVector5.set(0.0005, 0.005, -0.0439),
                    swishT
                );

                if (time >= 15.8) {
                    if (this.basketballHoop1) {
                        const orig = this.basketballHoop1.userData.originalScale || new THREE.Vector3(1, 1, 1);
                        this.basketballHoop1.scale.set(orig.x * 50.0, orig.y * 50.0, orig.z * 50.0);
                    }
                }

                if (time >= 15.8 && time < 15.9) {
                    // Net wiggles!
                    this.isHoopWiggling = true;
                    this.hoopWiggleTime = 0.0;
                    this.wigglingHoopNet = this.hoop2NetMesh;
                    // Flash basketball rim crimson red
                    if (this.basketballHoop2 && (this.basketballHoop2 as any).rimMesh) {
                        const rim = (this.basketballHoop2 as any).rimMesh as THREE.Mesh;
                        (rim.material as THREE.MeshBasicMaterial).color.setHex(0xff3300);
                    }
                    // Trigger sparkler
                    this.triggerFirework(0.0005, 0.023, -0.0439, 0xf97316, 0.015);
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
        } else if (stType === 'nurburgring') {
            // --- 3b. F1 NÜRBURGRING RACE CHOREOGRAPHY (20s cinematic lap) ---

            const mercCar = this.nurburgringCars.find(c => c.colorType === 'merc');
            const rbCar = this.nurburgringCars.find(c => c.colorType === 'mclaren');
            const feCar = this.nurburgringCars.find(c => c.colorType === 'ferrari');

            // Helper: draw sector card using the shared celebration canvas
            const drawSectorCard = (sectorLabel: string, sectorTime: string, color: string) => {
                const ctx = this.celebrationCardCtx;
                ctx.clearRect(0, 0, 256, 128);
                ctx.fillStyle = 'rgba(5, 10, 25, 0.92)';
                ctx.fillRect(0, 0, 256, 128);
                ctx.strokeStyle = color;
                ctx.lineWidth = 5;
                ctx.strokeRect(4, 4, 248, 120);
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(10, 10, 236, 108);
                // Sector label top
                ctx.font = 'bold 16px monospace';
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillText(sectorLabel, 128, 36);
                ctx.shadowBlur = 0;
                // Time big
                ctx.font = 'bold 40px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(sectorTime, 128, 86);
                this.sportCelebrationTexture.needsUpdate = true;
            };

            // Helper: draw DRS DETECTED flash card
            const drawDRSCard = () => {
                const ctx = this.celebrationCardCtx;
                ctx.clearRect(0, 0, 256, 128);
                ctx.fillStyle = 'rgba(0, 50, 0, 0.92)';
                ctx.fillRect(0, 0, 256, 128);
                ctx.strokeStyle = '#00ff44';
                ctx.lineWidth = 5;
                ctx.strokeRect(4, 4, 248, 120);
                ctx.font = 'bold 13px monospace';
                ctx.fillStyle = '#00ff44';
                ctx.shadowColor = '#00ff44';
                ctx.shadowBlur = 12;
                ctx.textAlign = 'center';
                ctx.fillText('DRS DETECTION ZONE', 128, 34);
                ctx.shadowBlur = 0;
                ctx.font = 'bold 36px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('DRS OPEN', 128, 80);
                ctx.font = '11px monospace';
                ctx.fillStyle = '#86efac';
                ctx.fillText('< 1.0s GAP DETECTED', 128, 108);
                this.sportCelebrationTexture.needsUpdate = true;
            };

            // Helper: draw pit-stop card
            const drawPitCard = (team: string, stopTime: string, color: string) => {
                const ctx = this.celebrationCardCtx;
                ctx.clearRect(0, 0, 256, 128);
                ctx.fillStyle = 'rgba(15, 5, 30, 0.92)';
                ctx.fillRect(0, 0, 256, 128);
                ctx.strokeStyle = color;
                ctx.lineWidth = 5;
                ctx.strokeRect(4, 4, 248, 120);
                ctx.font = 'bold 14px monospace';
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillText(`${team} PIT STOP`, 128, 36);
                ctx.shadowBlur = 0;
                ctx.font = 'bold 40px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(stopTime, 128, 84);
                ctx.font = '11px monospace';
                ctx.fillStyle = '#d1d5db';
                ctx.fillText('IN LAP — FRESH MEDIUMS', 128, 112);
                this.sportCelebrationTexture.needsUpdate = true;
            };

            // Helper: draw race position card
            const drawPositionCard = (pos: string, driver: string, team: string, color: string) => {
                const ctx = this.celebrationCardCtx;
                ctx.clearRect(0, 0, 256, 128);
                ctx.fillStyle = 'rgba(5, 5, 20, 0.92)';
                ctx.fillRect(0, 0, 256, 128);
                ctx.strokeStyle = color;
                ctx.lineWidth = 5;
                ctx.strokeRect(4, 4, 248, 120);
                ctx.font = 'bold 52px monospace';
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 14;
                ctx.textAlign = 'left';
                ctx.fillText(`P${pos}`, 18, 78);
                ctx.shadowBlur = 0;
                ctx.font = 'bold 18px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'right';
                ctx.fillText(driver, 242, 46);
                ctx.font = '12px monospace';
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(team, 242, 68);
                this.sportCelebrationTexture.needsUpdate = true;
            };

            // ── PHASE 0-5s: Mercedes solo breakaway on GP straight ──
            if (time < 5.0) {
                // Boost Mercedes to ghost-car speed; Red Bull and Ferrari hold normal pace
                if (mercCar) mercCar.speed = 0.13 + Math.sin(time * 2.0) * 0.015;
                if (rbCar) rbCar.speed = 0.042;
                if (feCar) feCar.speed = 0.038;

                // Wheel brake-glow on Ferrari (overheating)
                if (time > 2.0 && time < 2.1) {
                    // DRS zone flash spark at GP start/finish line
                    this.triggerFirework(0.0, 0.014, -0.085, 0x22d3ee, 0.008, 0, 0.006, 0, 0.6);
                    this.triggerFirework(0.02, 0.014, -0.085, 0xa855f7, 0.008, 0, 0.006, 0, 0.6);
                }

                // Show P1 card for Mercedes
                if (time >= 1.0 && time < 1.15) {
                    drawPositionCard('1', 'RUSSELL', 'MERCEDES', '#00d2be');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                }

                // ── PHASE 5-8s: DRS detection zone — DRS OPEN card ──
            } else if (time >= 5.0 && time < 8.0) {
                if (mercCar) mercCar.speed = 0.15; // full DRS flat
                if (rbCar) rbCar.speed = 0.048;
                if (feCar) feCar.speed = 0.042;

                if (time >= 5.0 && time < 5.2) {
                    drawDRSCard();
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    // DRS activation sparks — rear wing endplate flash
                    const mercPos = mercCar?.group.position ?? new THREE.Vector3();
                    this.triggerFirework(mercPos.x, mercPos.y + 0.004, mercPos.z, 0x00ff44, 0.006, 0, 0.003, 0, 0.5);
                }

                // Sector 1 time drops in
                if (time >= 7.0 && time < 7.2) {
                    drawSectorCard('⬛  SECTOR 1  ⬛', '1:23.418', '#22d3ee');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    this.triggerFirework(0.04, 0.014, -0.06, 0x22d3ee, 0.007, 0, 0.004, 0, 0.5);
                }

                // ── PHASE 8-11s: Ferrari battles Red Bull for P2 — wheel-to-wheel ──
            } else if (time >= 8.0 && time < 11.0) {
                if (mercCar) mercCar.speed = 0.12;
                // Ferrari and Red Bull neck-and-neck speed war
                if (rbCar) rbCar.speed = 0.052 + Math.sin(time * 8.0) * 0.004;
                if (feCar) feCar.speed = 0.052 - Math.sin(time * 8.0) * 0.004;

                if (time >= 8.0 && time < 8.2) {
                    drawPositionCard('2', 'NORRIS', 'MCLAREN', '#ff6600');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                }

                // Wheel-to-wheel spark at Hatzenbach apex
                if (time >= 9.5 && time < 9.65) {
                    this.triggerFirework(0.04, 0.007, -0.075, 0xef4444, 0.01, 0, 0.005, 0, 0.7);
                    this.triggerFirework(0.042, 0.007, -0.073, 0xff6600, 0.01, 0, 0.005, 0, 0.7);
                }

                // ── PHASE 11-14s: Red Bull pit stop sprint out of pit lane ──
            } else if (time >= 11.0 && time < 14.0) {
                if (mercCar) mercCar.speed = 0.11;
                if (feCar) feCar.speed = 0.055; // Ferrari now P2, quick
                // Red Bull pit-stop — momentarily hidden, then fast re-entry
                if (rbCar) {
                    if (time >= 11.0 && time < 12.5) {
                        rbCar.group.visible = false; // in pit lane
                    } else {
                        rbCar.group.visible = true;
                        rbCar.speed = 0.14; // blistering out-lap speed
                    }
                }

                if (time >= 11.0 && time < 11.25) {
                    drawPitCard('MCLAREN', '2.3s', '#ff6600');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    // Pit-stop spark at pit-lane entry (front straight outside)
                    this.triggerFirework(0.0, 0.012, -0.07, 0xff6600, 0.008, 0, 0.004, 0, 0.5);
                }

                // ── PHASE 14-16s: Sector 2 time card ──
            } else if (time >= 14.0 && time < 16.0) {
                if (mercCar) mercCar.speed = 0.105;
                if (rbCar) rbCar.speed = 0.13; // Red Bull charging hard on fresh tyres
                if (feCar) feCar.speed = 0.052;

                if (time >= 14.0 && time < 14.2) {
                    drawSectorCard('⬛  SECTOR 2  ⬛', '2:04.771', '#a855f7');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    this.triggerFirework(-0.03, 0.014, 0.075, 0xa855f7, 0.009, 0, 0.005, 0, 0.6);
                }

                // McLaren overtakes Mercedes on Döttinger approach
                if (time >= 15.0 && time < 15.15) {
                    drawPositionCard('1', 'NORRIS', 'MCLAREN', '#ff6600');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    this.triggerFirework(0.0, 0.018, -0.06, 0xff6600, 0.012, 0, 0.008, 0, 0.8);
                    this.triggerFirework(0.01, 0.018, -0.062, 0xfbbf24, 0.009, 0, 0.006, 0, 0.6);
                }

                // ── PHASE 16-20s: Döttinger Höhe flat-out, Sector 3 card, podium sparks ──
            } else if (time >= 16.0 && time < 20.0) {
                // All three cars flat-out on Döttinger straight
                if (mercCar) mercCar.speed = 0.16;
                if (rbCar) rbCar.speed = 0.165;
                if (feCar) feCar.speed = 0.155;

                if (time >= 16.0 && time < 16.2) {
                    drawSectorCard('⬛  SECTOR 3  ⬛', '1:41.055', '#22d3ee');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    this.triggerFirework(-0.06, 0.014, -0.06, 0x22d3ee, 0.009, 0, 0.005, 0, 0.6);
                }

                // Purple FASTEST LAP card at 18s
                if (time >= 18.0 && time < 18.2) {
                    const ctx2 = this.celebrationCardCtx;
                    ctx2.clearRect(0, 0, 256, 128);
                    ctx2.fillStyle = 'rgba(30, 5, 50, 0.95)';
                    ctx2.fillRect(0, 0, 256, 128);
                    ctx2.strokeStyle = '#a855f7';
                    ctx2.lineWidth = 5;
                    ctx2.strokeRect(4, 4, 248, 120);
                    ctx2.font = 'bold 13px monospace';
                    ctx2.fillStyle = '#a855f7';
                    ctx2.textAlign = 'center';
                    ctx2.shadowColor = '#a855f7';
                    ctx2.shadowBlur = 14;
                    ctx2.fillText('🟣  FASTEST LAP  🟣', 128, 32);
                    ctx2.shadowBlur = 0;
                    ctx2.font = 'bold 34px monospace';
                    ctx2.fillStyle = '#ffffff';
                    ctx2.fillText('5:09.244', 128, 76);
                    ctx2.font = '11px monospace';
                    ctx2.fillStyle = '#c084fc';
                    ctx2.fillText('NORRIS — MCLAREN RACING', 128, 108);
                    this.sportCelebrationTexture.needsUpdate = true;
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                    this.sportCelebrationCard.scale.set(0.001, 0.001, 0.001);
                    // Massive purple fastest-lap burst
                    this.triggerFirework(0.0, 0.025, 0.0, 0xa855f7, 0.018, 0, 0.015, 0, 1.4);
                    this.triggerFirework(0.02, 0.022, 0.0, 0x22d3ee, 0.014, 0, 0.011, 0, 1.0);
                }

                // Chequered flag & Russell P1 Winner card at 19.3s
                if (time >= 19.3 && time < 26.0) {
                    drawPositionCard('1', 'RUSSELL', 'MERCEDES', '#00d2be');
                    this.sportCelebrationCard.position.set(0.0, this.ROOF_Y + 0.055, 0.0);
                    this.sportCelebrationCard.visible = true;
                }
            }

            // ── SEQUENCE BALL is hidden for F1 — disable trail logic ──
            this.sequenceBall.visible = false;
            this.sequenceBallTrail.visible = false;
        }

        // --- 4. TRAIL RECORDING (non-F1 only) ---
        const isF1Seq = (stType === 'nurburgring');
        if (!isF1Seq) {
            if (time < 20.0) {
                const floorY = this.getFloorY();
                const ballRadius = 0.0022 * this.sequenceBall.scale.x;
                if (this.sequenceBall.position.y < floorY + ballRadius) {
                    this.sequenceBall.position.y = floorY + ballRadius;
                }

                const geom = this.sequenceBallTrail.geometry;
                const posAttr = geom.attributes.position as THREE.BufferAttribute;
                const arr = posAttr.array as Float32Array;

                if (this.sequenceBallTrailCount < 50) {
                    const idx = this.sequenceBallTrailCount * 3;
                    arr[idx] = this.sequenceBall.position.x;
                    arr[idx + 1] = this.sequenceBall.position.y;
                    arr[idx + 2] = this.sequenceBall.position.z;
                    this.sequenceBallTrailCount++;
                } else {
                    for (let i = 0; i < 49; i++) {
                        const to = i * 3;
                        const from = (i + 1) * 3;
                        arr[to] = arr[from];
                        arr[to + 1] = arr[from + 1];
                        arr[to + 2] = arr[from + 2];
                    }
                    const idx = 49 * 3;
                    arr[idx] = this.sequenceBall.position.x;
                    arr[idx + 1] = this.sequenceBall.position.y;
                    arr[idx + 2] = this.sequenceBall.position.z;
                }
                geom.setDrawRange(0, this.sequenceBallTrailCount);
                posAttr.needsUpdate = true;
            } else {
                // Ball and trail fade out
                this.sequenceBall.visible = false;
                this.sequenceBallTrail.visible = false;
            }
        }


        // --- 5. AUTOMATIC CELEBRATION CHOREOGRAPHED STAGED FIREWORKS & RESET ---
        if (time >= 20.0 && this.sportSequencePhase < 4) {
            this.sportSequencePhase = 4; // Finished stage
            if (!isF1Seq) {
                this.sportCelebrationCard.visible = false;
            }
            if (!isF1Seq) {
                this.sequenceBall.visible = false;
                this.sequenceBallTrail.visible = false;
            }
            showPlayerCard(null); // Hide all stats cards

            // F1: restore car speeds to normal idle racing pace
            if (isF1Seq) {
                this.nurburgringCars.forEach(c => { c.speed = 0.052; c.group.visible = true; });
                this.nurburgringF1Speed = 0.052;
            }

            // Trigger the ultimate 4-stage choreographed spatial pyrotechnics sequence!
            this.triggerManualFireworks();
            console.log("[SportSequence] 20s Replay complete! Staged pyrotechnics triggered.");
        }

        // --- 6. CELEBRATION CARD FLOAT ---
        if (time < 26.0 && this.sportCelebrationCard.visible) {
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
            this.restoreHoopScales();
            if (this.arBillboard) {
                this.arBillboard.visible = true; // restore match scoreboard
            }

            // Restore rim colors if they were changed
            if (this.basketballHoop1 && (this.basketballHoop1 as any).rimMesh) {
                const rim = (this.basketballHoop1 as any).rimMesh as THREE.Mesh;
                (rim.material as THREE.MeshBasicMaterial).color.setHex(0xf97316); // restore orange rim
            }
            if (this.basketballHoop2 && (this.basketballHoop2 as any).rimMesh) {
                const rim = (this.basketballHoop2 as any).rimMesh as THREE.Mesh;
                (rim.material as THREE.MeshBasicMaterial).color.setHex(0xf97316); // restore orange rim
            }

            // F1 reset: restore all car speeds and visibility
            if (stType === 'nurburgring') {
                this.nurburgringCars.forEach(c => { c.speed = 0.052; c.group.visible = true; });
                this.nurburgringF1Speed = 0.052;
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
            const origScale = this.wigglingGoalNet.userData.originalScale || new THREE.Vector3(1, 1, 1);
            if (t >= 1.0) {
                this.isGoalWiggling = false;
                this.wigglingGoalNet.scale.copy(origScale);
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
                this.wigglingGoalNet.scale.set(origScale.x, origScale.y * scaleY, origScale.z * scaleZ);

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
            const origScale = this.wigglingHoopNet.userData.originalScale || new THREE.Vector3(1, 1, 1);
            if (t >= 1.0) {
                this.isHoopWiggling = false;
                this.wigglingHoopNet.scale.copy(origScale);
                if (this.wigglingHoopNet.material instanceof THREE.LineBasicMaterial) {
                    (this.wigglingHoopNet.material as THREE.LineBasicMaterial).color.setHex(0x00ffff);
                }
            } else {
                // Net compress/shake swish animation
                const decay = Math.exp(-t * 4.0);
                const compressX = 1.0 - 0.2 * Math.exp(-t * 8.0) + Math.sin(t * 35.0) * 0.06 * decay;
                const compressZ = 1.0 - 0.2 * Math.exp(-t * 8.0) + Math.cos(t * 35.0) * 0.06 * decay;
                const stretchY = 1.0 + 0.15 * Math.exp(-t * 8.0);
                this.wigglingHoopNet.scale.set(origScale.x * compressX, origScale.y * stretchY, origScale.z * compressZ);

                // Flash net color between cyan and orange
                const flash = Math.sin(t * 45.0) > 0.0;
                if (this.wigglingHoopNet.material instanceof THREE.LineBasicMaterial) {
                    (this.wigglingHoopNet.material as THREE.LineBasicMaterial).color.setHex(flash ? 0xf97316 : 0x00ffff);
                }
            }
        }
    }

    private createButterflyGroup() {
        /*
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
        
        // Elegant grid floor removed
        
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
        */

        // NEW: Duplicate UEFA stadium (Olympiastadion) for FIFA
        this.butterflyGroup = new THREE.Group();
        const berlinAsset = AssetManager.getGLTF("olympiastadion");
        if (berlinAsset) {
            const mesh = berlinAsset.scene.clone();
            const box = new THREE.Box3().setFromObject(mesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.z);
            const berlinScale = 0.24 / (maxDim || 1.0);
            mesh.scale.setScalar(berlinScale);
            mesh.updateMatrixWorld(true);
            const berlinBox = new THREE.Box3().setFromObject(mesh);
            const berlinMinY = berlinBox.min.y;
            mesh.position.set(0, -berlinMinY + 0.0005, 0);
            this.butterflyGroup.add(mesh);

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
                    if (name.includes('olympiagoalpost')) {
                        child.userData.originalScale = child.scale.clone();
                        if (child.position.z > 0) {
                            this.berlinGoal1 = child;
                            this.goal1NetMesh = child;
                        } else {
                            this.berlinGoal2 = child;
                            this.goal2NetMesh = child;
                        }
                        console.log(`[FIFAStadium] Linked built-in goalpost "${child.name}" (Z: ${child.position.z.toFixed(4)})`);
                    }
                }
            });
            this.collectStadiumMaterials(mesh);
        } else {
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
            this.butterflyGroup.add(cylinderWall);
        }
        this.tableGroup.add(this.butterflyGroup);
    }

    private createNurburgringGroup() {
        this.nurburgringGroup = new THREE.Group();
        this.nurburgringGroup.position.y = 0.03; // Bring track, cars, and spline up on the y axis by 2 cm (0.01 -> 0.03)

        // 1. Create a flat ground base (Deep holographic cyan-blue)
        const groundGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.002, 64);
        const groundMat = new THREE.MeshBasicMaterial({
            color: 0x003355,
            transparent: true,
            opacity: 0.35
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        // Lower the ground base on the Y axis by 2 cm in world coordinates (-2cm relative to original world Y = 0.011, i.e. new world Y = -0.009, local Y = -0.039)
        ground.position.y = -0.039;
        this.nurburgringGroup.add(ground);

        // Elegant grid floor removed

        // 3. Add a glowing neon cyan border ring
        const borderGeo = new THREE.TorusGeometry(0.18, 0.0015, 8, 100);
        borderGeo.rotateX(Math.PI / 2);
        const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        // Lower the border ring on the Y axis by 2 cm in world coordinates (-2cm relative to original world Y = 0.01205, i.e. new world Y = -0.00795, local Y = -0.03795)
        border.position.y = -0.03795;
        this.nurburgringGroup.add(border);

        // 4. Closed winding 3D Spline representing Monaco GP with topography elevations
        const rawPoints = [
            new THREE.Vector3(-1.064908, 0.003440, -0.851310),
            new THREE.Vector3(-1.028964, 0.003439, -0.867917),
            new THREE.Vector3(-0.988597, 0.003436, -0.867089),
            new THREE.Vector3(-0.955786, 0.003435, -0.842298),
            new THREE.Vector3(-0.923667, 0.003433, -0.816631),
            new THREE.Vector3(-0.891943, 0.003432, -0.790463),
            new THREE.Vector3(-0.859939, 0.003431, -0.764641),
            new THREE.Vector3(-0.827734, 0.003430, -0.739069),
            new THREE.Vector3(-0.795528, 0.003429, -0.713496),
            new THREE.Vector3(-0.763323, 0.003429, -0.687923),
            new THREE.Vector3(-0.731118, 0.003428, -0.662349),
            new THREE.Vector3(-0.698914, 0.003427, -0.636776),
            new THREE.Vector3(-0.666709, 0.003426, -0.611202),
            new THREE.Vector3(-0.631316, 0.003425, -0.590344),
            new THREE.Vector3(-0.595582, 0.003425, -0.569993),
            new THREE.Vector3(-0.559847, 0.003424, -0.549641),
            new THREE.Vector3(-0.524113, 0.003423, -0.529288),
            new THREE.Vector3(-0.488379, 0.003422, -0.508935),
            new THREE.Vector3(-0.452645, 0.003422, -0.488582),
            new THREE.Vector3(-0.416911, 0.003421, -0.468229),
            new THREE.Vector3(-0.383094, 0.003420, -0.444857),
            new THREE.Vector3(-0.349468, 0.003420, -0.421183),
            new THREE.Vector3(-0.315841, 0.003419, -0.397510),
            new THREE.Vector3(-0.282215, 0.003419, -0.373836),
            new THREE.Vector3(-0.248589, 0.003418, -0.350162),
            new THREE.Vector3(-0.214965, 0.003417, -0.326487),
            new THREE.Vector3(-0.181340, 0.003417, -0.302811),
            new THREE.Vector3(-0.147715, 0.003416, -0.279136),
            new THREE.Vector3(-0.114090, 0.003416, -0.255460),
            new THREE.Vector3(-0.077503, 0.003415, -0.237137),
            new THREE.Vector3(-0.039586, 0.003414, -0.221215),
            new THREE.Vector3(-0.001670, 0.003414, -0.205294),
            new THREE.Vector3(0.036247, 0.003413, -0.189373),
            new THREE.Vector3(0.074163, 0.003412, -0.173450),
            new THREE.Vector3(0.112078, 0.003412, -0.157525),
            new THREE.Vector3(0.149993, 0.003411, -0.141601),
            new THREE.Vector3(0.187908, 0.003411, -0.125676),
            new THREE.Vector3(0.224520, 0.003410, -0.107333),
            new THREE.Vector3(0.258664, 0.003409, -0.084413),
            new THREE.Vector3(0.292808, 0.003408, -0.061492),
            new THREE.Vector3(0.326952, 0.003407, -0.038572),
            new THREE.Vector3(0.361094, 0.003406, -0.015649),
            new THREE.Vector3(0.395237, 0.003406, 0.007274),
            new THREE.Vector3(0.429379, 0.003405, 0.030196),
            new THREE.Vector3(0.465092, 0.003404, 0.050548),
            new THREE.Vector3(0.501068, 0.003403, 0.070470),
            new THREE.Vector3(0.537044, 0.003402, 0.090393),
            new THREE.Vector3(0.573014, 0.003401, 0.110324),
            new THREE.Vector3(0.608985, 0.003400, 0.130256),
            new THREE.Vector3(0.645685, 0.003399, 0.147905),
            new THREE.Vector3(0.686549, 0.003398, 0.152519),
            new THREE.Vector3(0.727413, 0.003397, 0.157133),
            new THREE.Vector3(0.767785, 0.003396, 0.150914),
            new THREE.Vector3(0.808062, 0.003394, 0.142612),
            new THREE.Vector3(0.844786, 0.003393, 0.126859),
            new THREE.Vector3(0.876594, 0.003391, 0.100794),
            new THREE.Vector3(0.908427, 0.003390, 0.074758),
            new THREE.Vector3(0.938195, 0.003388, 0.047066),
            new THREE.Vector3(0.956769, 0.003387, 0.010376),
            new THREE.Vector3(0.975343, 0.003386, -0.026314),
            new THREE.Vector3(0.987410, 0.003384, -0.065486),
            new THREE.Vector3(0.997986, 0.003383, -0.105226),
            new THREE.Vector3(1.003760, 0.003382, -0.145472),
            new THREE.Vector3(1.001680, 0.003380, -0.186543),
            new THREE.Vector3(1.002102, 0.003379, -0.227623),
            new THREE.Vector3(1.003876, 0.003378, -0.268708),
            new THREE.Vector3(1.016487, 0.003376, -0.306751),
            new THREE.Vector3(1.037109, 0.003374, -0.342054),
            new THREE.Vector3(1.071634, 0.003372, -0.364397),
            new THREE.Vector3(1.109165, 0.003371, -0.379529),
            new THREE.Vector3(1.149336, 0.003370, -0.388330),
            new THREE.Vector3(1.189507, 0.003370, -0.397130),
            new THREE.Vector3(1.229680, 0.003561, -0.405920),
            new THREE.Vector3(1.269853, 0.003753, -0.414710),
            new THREE.Vector3(1.310241, 0.004703, -0.422242),
            new THREE.Vector3(1.350857, 0.006457, -0.428440),
            new THREE.Vector3(1.391459, 0.008453, -0.434635),
            new THREE.Vector3(1.432001, 0.011489, -0.440822),
            new THREE.Vector3(1.472543, 0.014525, -0.447010),
            new THREE.Vector3(1.513113, 0.018197, -0.452639),
            new THREE.Vector3(1.553685, 0.021949, -0.458199),
            new THREE.Vector3(1.594259, 0.025699, -0.463759),
            new THREE.Vector3(1.634836, 0.029399, -0.469320),
            new THREE.Vector3(1.675414, 0.033100, -0.474880),
            new THREE.Vector3(1.716051, 0.036661, -0.479995),
            new THREE.Vector3(1.756936, 0.039643, -0.483270),
            new THREE.Vector3(1.797837, 0.042351, -0.486534),
            new THREE.Vector3(1.838789, 0.044266, -0.489766),
            new THREE.Vector3(1.877968, 0.045784, -0.485404),
            new THREE.Vector3(1.913224, 0.046424, -0.464244),
            new THREE.Vector3(1.927451, 0.045968, -0.427497),
            new THREE.Vector3(1.929242, 0.044990, -0.388769),
            new THREE.Vector3(1.908699, 0.043192, -0.353189),
            new THREE.Vector3(1.888101, 0.040666, -0.317687),
            new THREE.Vector3(1.870707, 0.037672, -0.280720),
            new THREE.Vector3(1.856630, 0.034303, -0.242227),
            new THREE.Vector3(1.842566, 0.030489, -0.203773),
            new THREE.Vector3(1.828593, 0.026544, -0.165298),
            new THREE.Vector3(1.815267, 0.022416, -0.126613),
            new THREE.Vector3(1.797711, 0.018342, -0.089774),
            new THREE.Vector3(1.786834, 0.013770, -0.051243),
            new THREE.Vector3(1.799049, 0.010008, -0.015680),
            new THREE.Vector3(1.832138, 0.008137, 0.005065),
            new THREE.Vector3(1.871072, 0.006287, 0.001953),
            new THREE.Vector3(1.901073, 0.003916, -0.023462),
            new THREE.Vector3(1.912286, 0.002273, -0.061717),
            new THREE.Vector3(1.911082, 0.001133, -0.102519),
            new THREE.Vector3(1.904440, 0.000350, -0.143094),
            new THREE.Vector3(1.901639, 0.000089, -0.184113),
            new THREE.Vector3(1.908812, -0.000102, -0.223880),
            new THREE.Vector3(1.934591, -0.000221, -0.253694),
            new THREE.Vector3(1.972109, -0.000278, -0.265018),
            new THREE.Vector3(2.012318, -0.000238, -0.256908),
            new THREE.Vector3(2.050310, -0.000122, -0.241800),
            new THREE.Vector3(2.087292, 0.000035, -0.223816),
            new THREE.Vector3(2.124273, 0.000272, -0.205830),
            new THREE.Vector3(2.160440, 0.000543, -0.186331),
            new THREE.Vector3(2.195822, 0.000846, -0.165375),
            new THREE.Vector3(2.221298, 0.001176, -0.134027),
            new THREE.Vector3(2.238162, 0.001520, -0.096872),
            new THREE.Vector3(2.215872, 0.001869, -0.063618),
            new THREE.Vector3(2.185779, 0.002214, -0.035593),
            new THREE.Vector3(2.153920, 0.002532, -0.009646),
            new THREE.Vector3(2.121383, 0.002839, 0.015501),
            new THREE.Vector3(2.088845, 0.003096, 0.040648),
            new THREE.Vector3(2.056307, 0.003316, 0.065795),
            new THREE.Vector3(2.024240, 0.003476, 0.091527),
            new THREE.Vector3(1.992768, 0.003560, 0.117997),
            new THREE.Vector3(1.961295, 0.003625, 0.144466),
            new THREE.Vector3(1.929822, 0.003624, 0.170935),
            new THREE.Vector3(1.898318, 0.003623, 0.197365),
            new THREE.Vector3(1.865213, 0.003623, 0.221761),
            new THREE.Vector3(1.832108, 0.003622, 0.246158),
            new THREE.Vector3(1.799002, 0.003621, 0.270554),
            new THREE.Vector3(1.765896, 0.003621, 0.294950),
            new THREE.Vector3(1.732790, 0.003620, 0.319346),
            new THREE.Vector3(1.697979, 0.003619, 0.341065),
            new THREE.Vector3(1.661878, 0.003619, 0.360760),
            new THREE.Vector3(1.625777, 0.003618, 0.380455),
            new THREE.Vector3(1.589675, 0.003617, 0.400148),
            new THREE.Vector3(1.553573, 0.003617, 0.419842),
            new THREE.Vector3(1.515349, 0.003616, 0.434689),
            new THREE.Vector3(1.476400, 0.003615, 0.447886),
            new THREE.Vector3(1.437451, 0.003615, 0.461081),
            new THREE.Vector3(1.398501, 0.003614, 0.474274),
            new THREE.Vector3(1.359550, 0.003613, 0.487466),
            new THREE.Vector3(1.319163, 0.003613, 0.493697),
            new THREE.Vector3(1.278173, 0.003612, 0.497008),
            new THREE.Vector3(1.237183, 0.003611, 0.500317),
            new THREE.Vector3(1.196192, 0.003610, 0.503622),
            new THREE.Vector3(1.155201, 0.003610, 0.506926),
            new THREE.Vector3(1.114871, 0.003609, 0.499595),
            new THREE.Vector3(1.074603, 0.003608, 0.491245),
            new THREE.Vector3(1.034338, 0.003607, 0.482891),
            new THREE.Vector3(0.994071, 0.003606, 0.474536),
            new THREE.Vector3(0.954789, 0.003606, 0.462568),
            new THREE.Vector3(0.915847, 0.003606, 0.449351),
            new THREE.Vector3(0.876905, 0.003605, 0.436134),
            new THREE.Vector3(0.837963, 0.003605, 0.422918),
            new THREE.Vector3(0.799021, 0.003604, 0.409701),
            new THREE.Vector3(0.760080, 0.003604, 0.396483),
            new THREE.Vector3(0.721138, 0.003604, 0.383266),
            new THREE.Vector3(0.682196, 0.003603, 0.370048),
            new THREE.Vector3(0.643255, 0.003603, 0.356831),
            new THREE.Vector3(0.605323, 0.003602, 0.340977),
            new THREE.Vector3(0.567524, 0.003602, 0.324780),
            new THREE.Vector3(0.529725, 0.003601, 0.308582),
            new THREE.Vector3(0.491925, 0.003601, 0.292384),
            new THREE.Vector3(0.454126, 0.003600, 0.276185),
            new THREE.Vector3(0.416327, 0.003600, 0.259986),
            new THREE.Vector3(0.378529, 0.003599, 0.243788),
            new THREE.Vector3(0.341603, 0.003599, 0.225953),
            new THREE.Vector3(0.307108, 0.003599, 0.203564),
            new THREE.Vector3(0.272613, 0.003598, 0.181175),
            new THREE.Vector3(0.238118, 0.003598, 0.158786),
            new THREE.Vector3(0.203624, 0.003598, 0.136397),
            new THREE.Vector3(0.169133, 0.003597, 0.114002),
            new THREE.Vector3(0.134755, 0.003597, 0.091435),
            new THREE.Vector3(0.100376, 0.003596, 0.068868),
            new THREE.Vector3(0.065997, 0.003596, 0.046301),
            new THREE.Vector3(0.031773, 0.003595, 0.023512),
            new THREE.Vector3(-0.001277, 0.003594, -0.000959),
            new THREE.Vector3(-0.036965, 0.003593, -0.020531),
            new THREE.Vector3(-0.076454, 0.003591, -0.024580),
            new THREE.Vector3(-0.114638, 0.003588, -0.009972),
            new THREE.Vector3(-0.154952, 0.003587, -0.011852),
            new THREE.Vector3(-0.185018, 0.003585, -0.037256),
            new THREE.Vector3(-0.197313, 0.003583, -0.075535),
            new THREE.Vector3(-0.215161, 0.003581, -0.111766),
            new THREE.Vector3(-0.242508, 0.003580, -0.141974),
            new THREE.Vector3(-0.273905, 0.003580, -0.168534),
            new THREE.Vector3(-0.305300, 0.003580, -0.195094),
            new THREE.Vector3(-0.336697, 0.003579, -0.221655),
            new THREE.Vector3(-0.368501, 0.003579, -0.247702),
            new THREE.Vector3(-0.401438, 0.003578, -0.272324),
            new THREE.Vector3(-0.434376, 0.003578, -0.296946),
            new THREE.Vector3(-0.467315, 0.003577, -0.321568),
            new THREE.Vector3(-0.500253, 0.003577, -0.346190),
            new THREE.Vector3(-0.533217, 0.003577, -0.370777),
            new THREE.Vector3(-0.566237, 0.003576, -0.395289),
            new THREE.Vector3(-0.599257, 0.003575, -0.419802),
            new THREE.Vector3(-0.632276, 0.003575, -0.444314),
            new THREE.Vector3(-0.665296, 0.003574, -0.468826),
            new THREE.Vector3(-0.698316, 0.003574, -0.493338),
            new THREE.Vector3(-0.731336, 0.003573, -0.517850),
            new THREE.Vector3(-0.763801, 0.003572, -0.543091),
            new THREE.Vector3(-0.796264, 0.003571, -0.568337),
            new THREE.Vector3(-0.828811, 0.003571, -0.593472),
            new THREE.Vector3(-0.861507, 0.003570, -0.618414),
            new THREE.Vector3(-0.897125, 0.003569, -0.636958),
            new THREE.Vector3(-0.937389, 0.003568, -0.645322),
            new THREE.Vector3(-0.977380, 0.003567, -0.648254),
            new THREE.Vector3(-1.016602, 0.003566, -0.635896),
            new THREE.Vector3(-1.055826, 0.003565, -0.623538),
            new THREE.Vector3(-1.093838, 0.003565, -0.608242),
            new THREE.Vector3(-1.130381, 0.003564, -0.589380),
            new THREE.Vector3(-1.166924, 0.003564, -0.570518),
            new THREE.Vector3(-1.203222, 0.003563, -0.551205),
            new THREE.Vector3(-1.238965, 0.003562, -0.530870),
            new THREE.Vector3(-1.274709, 0.003561, -0.510534),
            new THREE.Vector3(-1.305493, 0.003560, -0.483693),
            new THREE.Vector3(-1.334567, 0.003560, -0.454609),
            new THREE.Vector3(-1.363647, 0.003559, -0.425532),
            new THREE.Vector3(-1.392739, 0.003558, -0.396465),
            new THREE.Vector3(-1.421831, 0.003557, -0.367400),
            new THREE.Vector3(-1.430512, 0.003555, -0.327424),
            new THREE.Vector3(-1.438244, 0.003553, -0.287105),
            new THREE.Vector3(-1.429310, 0.003550, -0.246964),
            new THREE.Vector3(-1.433878, 0.003547, -0.207600),
            new THREE.Vector3(-1.447454, 0.003545, -0.168782),
            new THREE.Vector3(-1.470707, 0.003544, -0.134940),
            new THREE.Vector3(-1.494385, 0.003543, -0.101317),
            new THREE.Vector3(-1.518067, 0.003542, -0.067698),
            new THREE.Vector3(-1.541751, 0.003541, -0.034077),
            new THREE.Vector3(-1.565869, 0.003540, -0.000770),
            new THREE.Vector3(-1.590089, 0.003539, 0.032464),
            new THREE.Vector3(-1.614303, 0.003538, 0.065703),
            new THREE.Vector3(-1.637256, 0.003537, 0.099825),
            new THREE.Vector3(-1.660209, 0.003536, 0.133947),
            new THREE.Vector3(-1.683263, 0.003535, 0.168001),
            new THREE.Vector3(-1.712797, 0.003533, 0.195817),
            new THREE.Vector3(-1.748843, 0.003531, 0.205605),
            new THREE.Vector3(-1.788784, 0.003530, 0.195816),
            new THREE.Vector3(-1.827647, 0.003528, 0.202271),
            new THREE.Vector3(-1.855431, 0.003526, 0.228147),
            new THREE.Vector3(-1.872259, 0.003525, 0.265665),
            new THREE.Vector3(-1.889718, 0.003523, 0.302899),
            new THREE.Vector3(-1.906685, 0.003523, 0.340358),
            new THREE.Vector3(-1.923490, 0.003522, 0.377891),
            new THREE.Vector3(-1.940294, 0.003521, 0.415424),
            new THREE.Vector3(-1.952564, 0.003520, 0.454653),
            new THREE.Vector3(-1.964488, 0.003519, 0.494009),
            new THREE.Vector3(-1.975205, 0.003518, 0.533662),
            new THREE.Vector3(-1.982816, 0.003518, 0.574075),
            new THREE.Vector3(-1.990427, 0.003517, 0.614488),
            new THREE.Vector3(-1.988782, 0.003516, 0.655035),
            new THREE.Vector3(-1.982343, 0.003515, 0.695652),
            new THREE.Vector3(-1.973577, 0.003514, 0.735660),
            new THREE.Vector3(-1.959294, 0.003513, 0.774223),
            new THREE.Vector3(-1.945010, 0.003512, 0.812786),
            new THREE.Vector3(-1.938787, 0.003510, 0.853383),
            new THREE.Vector3(-1.951912, 0.003508, 0.890983),
            new THREE.Vector3(-1.976174, 0.003507, 0.920296),
            new THREE.Vector3(-2.016370, 0.003505, 0.928978),
            new THREE.Vector3(-2.055025, 0.003504, 0.916292),
            new THREE.Vector3(-2.091915, 0.003502, 0.898936),
            new THREE.Vector3(-2.124714, 0.003501, 0.874129),
            new THREE.Vector3(-2.157509, 0.003500, 0.849315),
            new THREE.Vector3(-2.190297, 0.003499, 0.824496),
            new THREE.Vector3(-2.216710, 0.003497, 0.793498),
            new THREE.Vector3(-2.232977, 0.003494, 0.756435),
            new THREE.Vector3(-2.232317, 0.003492, 0.716470),
            new THREE.Vector3(-2.215439, 0.003490, 0.679623),
            new THREE.Vector3(-2.199113, 0.003488, 0.642521),
            new THREE.Vector3(-2.189779, 0.003487, 0.602470),
            new THREE.Vector3(-2.180444, 0.003486, 0.562420),
            new THREE.Vector3(-2.171100, 0.003485, 0.522372),
            new THREE.Vector3(-2.161757, 0.003484, 0.482325),
            new THREE.Vector3(-2.147862, 0.003483, 0.443735),
            new THREE.Vector3(-2.132178, 0.003482, 0.405720),
            new THREE.Vector3(-2.116493, 0.003481, 0.367705),
            new THREE.Vector3(-2.100806, 0.003481, 0.329690),
            new THREE.Vector3(-2.085120, 0.003480, 0.291676),
            new THREE.Vector3(-2.067403, 0.003479, 0.254642),
            new THREE.Vector3(-2.047390, 0.003478, 0.218717),
            new THREE.Vector3(-2.027378, 0.003477, 0.182791),
            new THREE.Vector3(-2.007365, 0.003476, 0.146866),
            new THREE.Vector3(-1.987352, 0.003476, 0.110941),
            new THREE.Vector3(-1.967338, 0.003475, 0.075015),
            new THREE.Vector3(-1.947817, 0.003474, 0.038829),
            new THREE.Vector3(-1.929430, 0.003472, 0.002046),
            new THREE.Vector3(-1.911041, 0.003471, -0.034738),
            new THREE.Vector3(-1.892520, 0.003469, -0.071445),
            new THREE.Vector3(-1.870146, 0.003468, -0.105949),
            new THREE.Vector3(-1.847770, 0.003466, -0.140452),
            new THREE.Vector3(-1.825394, 0.003465, -0.174956),
            new THREE.Vector3(-1.801781, 0.003464, -0.208605),
            new THREE.Vector3(-1.777464, 0.003463, -0.241769),
            new THREE.Vector3(-1.753146, 0.003462, -0.274933),
            new THREE.Vector3(-1.728828, 0.003461, -0.308095),
            new THREE.Vector3(-1.704509, 0.003460, -0.341257),
            new THREE.Vector3(-1.680191, 0.003460, -0.374419),
            new THREE.Vector3(-1.650857, 0.003459, -0.403164),
            new THREE.Vector3(-1.621020, 0.003458, -0.431464),
            new THREE.Vector3(-1.591183, 0.003457, -0.459763),
            new THREE.Vector3(-1.561343, 0.003456, -0.488062),
            new THREE.Vector3(-1.531504, 0.003456, -0.516359),
            new THREE.Vector3(-1.501665, 0.003455, -0.544657),
            new THREE.Vector3(-1.469829, 0.003454, -0.570632),
            new THREE.Vector3(-1.437344, 0.003453, -0.595847),
            new THREE.Vector3(-1.404859, 0.003452, -0.621063),
            new THREE.Vector3(-1.372373, 0.003452, -0.646278),
            new THREE.Vector3(-1.339885, 0.003451, -0.671493),
            new THREE.Vector3(-1.307399, 0.003450, -0.696707),
            new THREE.Vector3(-1.274226, 0.003449, -0.720903),
            new THREE.Vector3(-1.238682, 0.003448, -0.741588),
            new THREE.Vector3(-1.203139, 0.003447, -0.762272),
            new THREE.Vector3(-1.168081, 0.003446, -0.783762),
            new THREE.Vector3(-1.133164, 0.003445, -0.805487),
            new THREE.Vector3(-1.098362, 0.003442, -0.827393)
        ];
        const s = 0.05;
        const theta = 4.3633;
        const tx = -0.022;
        const tz = 0.0003;

        // 5. Build 3D flat road geometry using InstancedMesh along the spline
        this.nurburgringTrackMat = new THREE.MeshBasicMaterial({
            color: 0x2a2a33
        });

        let points: THREE.Vector3[] = [];

        // Load custom 3D track mesh from MonacoRoad.glb and auto-align spline points using its local transforms
        const monacoAsset = AssetManager.getGLTF("monacoRoad");
        if (monacoAsset) {
            const mesh = monacoAsset.scene.clone();

            const roadGroup = new THREE.Group();
            roadGroup.add(mesh);

            // Apply uniform scale parameters to preserve correct, un-stretched Monaco GP track proportions
            roadGroup.scale.set(0.05, 0.05, 0.05);

            // Set rotation directly on the Y axis to -10 degrees as requested. The spline will automatically align!
            roadGroup.rotation.y = -10 * Math.PI / 180;
            roadGroup.position.set(-0.022, 0.0005, 0.0003); // Align centers

            mesh.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.nurburgringTrackMat;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.nurburgringGroup.add(roadGroup);
            this.monacoRoadMesh = roadGroup;

            // Find the child mesh containing the geometry to compute local relative transformation matrix
            let roadMeshChild: THREE.Object3D = mesh;
            mesh.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    roadMeshChild = child;
                }
            });

            // Update all local matrices along the transform chain
            roadMeshChild.updateMatrix();
            let relativeMatrix = new THREE.Matrix4().copy(roadMeshChild.matrix);
            let currentParent = roadMeshChild.parent;
            while (currentParent && currentParent !== mesh) {
                currentParent.updateMatrix();
                relativeMatrix.premultiply(currentParent.matrix);
                currentParent = currentParent.parent;
            }
            mesh.updateMatrix();
            roadGroup.updateMatrix();
            relativeMatrix.premultiply(mesh.matrix);
            relativeMatrix.premultiply(roadGroup.matrix);

            // Map raw points directly to the transformed geometry space
            points = rawPoints.map(p => {
                const pt = p.clone().applyMatrix4(relativeMatrix);
                pt.y += 0.0005; // sit on surface
                return pt;
            });

            console.log("[MonacoRoad] Custom 3D track model loaded, and spline points aligned dynamically!");
        } else {
            console.warn("[MonacoRoad] Asset not found in AssetManager! Falling back to baseline mapping.");
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            points = rawPoints.map(p => {
                const rx = p.x * s * cos - p.z * s * sin + tx;
                const rz = p.x * s * sin + p.z * s * cos + tz;
                return new THREE.Vector3(rx, p.y * s + 0.0005, rz);
            });
        }

        // Resample the curve at 300 equidistant points along its arc length to guarantee uniform spacing and speed
        const tempCurve = new THREE.CatmullRomCurve3(points, true);
        const equidistantPoints = tempCurve.getSpacedPoints(300);

        this.nurburgringCurve = new THREE.CatmullRomCurve3(equidistantPoints, true);
        (this.nurburgringCurve as any).isNurburgring = true;
        (this.nurburgringCurve as any).__arcLengthDivisions = 3000; // High-precision LUT mapping

        // Override computeFrenetFrames directly on this curve instance to enforce flat road framing with Up-Vector (0, 1, 0)
        // This avoids globally polluting THREE.Curve.prototype which interferes with WebXR hand skeletal mesh updates
        (this.nurburgringCurve as any).computeFrenetFrames = function (segments: number, closed?: boolean) {
            const tangents: THREE.Vector3[] = [];
            const normals: THREE.Vector3[] = [];
            const binormals: THREE.Vector3[] = [];

            const tempBinormal = new THREE.Vector3();
            const tempNormal = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);

            for (let i = 0; i <= segments; i++) {
                const u = i / segments;
                const tangent = this.getTangentAt(u, new THREE.Vector3());
                if (tangent.lengthSq() < 0.0001) {
                    tangent.set(0, 0, 1);
                } else {
                    tangent.normalize();
                }
                tangents.push(tangent);

                // Binormal = Tangent x Up (normalized) to keep road width perfectly horizontal
                tempBinormal.crossVectors(tangent, up);
                if (tempBinormal.lengthSq() < 0.0001) {
                    tempBinormal.set(0, 0, 1);
                } else {
                    tempBinormal.normalize();
                }
                binormals.push(tempBinormal.clone());

                // Normal = Binormal x Tangent
                tempNormal.crossVectors(tempBinormal, tangent);
                if (tempNormal.lengthSq() < 0.0001) {
                    tempNormal.set(0, 1, 0);
                } else {
                    tempNormal.normalize();
                }
                normals.push(tempNormal.clone());
            }

            return { tangents, normals, binormals };
        };

        const segments = 800;
        this.nurburgringFrenetFrames = (this.nurburgringCurve as any).computeFrenetFrames(segments, true);

        if (!monacoAsset) {

            const roadWidth = 0.016;
            const roadThickness = 0.0005;
            const roadGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
            const roadMesh = new THREE.InstancedMesh(roadGeo, this.nurburgringTrackMat, segments);

            const tempMatrix = new THREE.Matrix4();
            const xAxis = new THREE.Vector3();
            const yAxis = new THREE.Vector3();
            const zAxis = new THREE.Vector3();
            const scale = new THREE.Vector3();

            for (let i = 0; i < segments; i++) {
                const u = i / segments;
                const p = this.nurburgringCurve.getPointAt(u);

                // Extract Frenet frame vectors
                const tangent = this.nurburgringFrenetFrames.tangents[i];
                const normal = this.nurburgringFrenetFrames.normals[i];
                const binormal = this.nurburgringFrenetFrames.binormals[i];

                // Align: width is along binormal, normal is along normal, length is along tangent
                xAxis.copy(binormal);
                yAxis.copy(normal);
                zAxis.copy(tangent);

                tempMatrix.makeBasis(xAxis, yAxis, zAxis);
                tempMatrix.setPosition(p);

                // Segment length is distance to the next point along the spline
                const nextP = this.nurburgringCurve.getPointAt((i + 1) / segments % 1.0);
                const len = p.distanceTo(nextP);

                // Scale geometry (unit box) to correct width, thickness and length
                // 1.8x overlap on length (z-axis) removes step-ladder gaps on curves completely
                scale.set(roadWidth, roadThickness, len * 1.8);
                tempMatrix.scale(scale);

                roadMesh.setMatrixAt(i, tempMatrix);
            }
            roadMesh.instanceMatrix.needsUpdate = true;
            this.nurburgringGroup.add(roadMesh);
        }

        // 6. Overlay glowing neon racing outline guide lines for Sectors (Red/Cyan/Yellow)
        // Sector 1: [0.95, 1.0] and [0.0, 0.35]
        const sec1Points: THREE.Vector3[] = [];
        for (let u = 0.95; u <= 1.0; u += 0.005) {
            const p = this.nurburgringCurve.getPointAt(u).clone();
            p.y += 0.0006;
            sec1Points.push(p);
        }
        for (let u = 0.0; u <= 0.35; u += 0.005) {
            const p = this.nurburgringCurve.getPointAt(u).clone();
            p.y += 0.0006;
            sec1Points.push(p);
        }
        const sec1Geo = new THREE.BufferGeometry().setFromPoints(sec1Points);
        const sec1Mat = new THREE.LineBasicMaterial({
            color: 0xef4444, // Sector 1 Red
            linewidth: 2,
            transparent: true,
            opacity: 0.85
        });
        const sec1Line = new THREE.Line(sec1Geo, sec1Mat);
        this.nurburgringGroup.add(sec1Line);

        // Sector 2: [0.35, 0.68]
        const sec2Points: THREE.Vector3[] = [];
        for (let u = 0.35; u <= 0.68; u += 0.005) {
            const p = this.nurburgringCurve.getPointAt(u).clone();
            p.y += 0.0006;
            sec2Points.push(p);
        }
        const sec2Geo = new THREE.BufferGeometry().setFromPoints(sec2Points);
        const sec2Mat = new THREE.LineBasicMaterial({
            color: 0x06b6d4, // Sector 2 Cyan
            linewidth: 2,
            transparent: true,
            opacity: 0.85
        });
        const sec2Line = new THREE.Line(sec2Geo, sec2Mat);
        this.nurburgringGroup.add(sec2Line);

        // Sector 3: [0.68, 0.95]
        const sec3Points: THREE.Vector3[] = [];
        for (let u = 0.68; u <= 0.95; u += 0.005) {
            const p = this.nurburgringCurve.getPointAt(u).clone();
            p.y += 0.0006;
            sec3Points.push(p);
        }
        const sec3Geo = new THREE.BufferGeometry().setFromPoints(sec3Points);
        const sec3Mat = new THREE.LineBasicMaterial({
            color: 0xeab308, // Sector 3 Yellow
            linewidth: 2,
            transparent: true,
            opacity: 0.85
        });
        const sec3Line = new THREE.Line(sec3Geo, sec3Mat);
        this.nurburgringGroup.add(sec3Line);

        // Clear any old markers
        this.f1Markers.forEach(m => {
            if (m.geometry) m.geometry.dispose();
            if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
            } else if (m.material) {
                m.material.dispose();
            }
        });
        this.f1Markers = [];

        // Helper text marker definitions:
        // Turn numbers
        const turns = [
            { text: "01", pos: this.nurburgringCurve.getPointAt(0.000) },
            { text: "02", pos: this.nurburgringCurve.getPointAt(0.045) },
            { text: "03", pos: this.nurburgringCurve.getPointAt(0.091) },
            { text: "04", pos: this.nurburgringCurve.getPointAt(0.136) },
            { text: "05", pos: this.nurburgringCurve.getPointAt(0.182) },
            { text: "06", pos: this.nurburgringCurve.getPointAt(0.227) },
            { text: "07", pos: this.nurburgringCurve.getPointAt(0.273) },
            { text: "08", pos: this.nurburgringCurve.getPointAt(0.318) },
            { text: "09", pos: this.nurburgringCurve.getPointAt(0.364) },
            { text: "10", pos: this.nurburgringCurve.getPointAt(0.500) },
            { text: "11", pos: this.nurburgringCurve.getPointAt(0.545) },
            { text: "12", pos: this.nurburgringCurve.getPointAt(0.591) },
            { text: "13", pos: this.nurburgringCurve.getPointAt(0.636) },
            { text: "14", pos: this.nurburgringCurve.getPointAt(0.682) },
            { text: "15", pos: this.nurburgringCurve.getPointAt(0.727) },
            { text: "16", pos: this.nurburgringCurve.getPointAt(0.773) },
            { text: "17", pos: this.nurburgringCurve.getPointAt(0.818) },
            { text: "18", pos: this.nurburgringCurve.getPointAt(0.864) },
            { text: "19", pos: this.nurburgringCurve.getPointAt(0.909) }
        ];

        turns.forEach(t => {
            // White text on dark slate circle
            const mesh = this.createTextMarker(t.text, "#1e293b", "#ffffff", 0.010, 0.010, true);
            // Position above the track
            mesh.position.copy(t.pos);
            mesh.position.y += 0.015;
            this.nurburgringGroup!.add(mesh);
            this.f1Markers.push(mesh);
        });

        // Sector Badges
        // Sector 1: Red
        const s1Pos = this.nurburgringCurve.getPointAt(0.18);
        const s1Badge = this.createTextMarker("SECTOR 1", "#ef4444", "#ffffff", 0.026, 0.0075, false);
        s1Badge.position.copy(s1Pos);
        s1Badge.position.y += 0.020;
        this.nurburgringGroup.add(s1Badge);
        this.f1Markers.push(s1Badge);

        // Sector 2: Cyan
        const s2Pos = this.nurburgringCurve.getPointAt(0.50);
        const s2Badge = this.createTextMarker("SECTOR 2", "#06b6d4", "#ffffff", 0.026, 0.0075, false);
        s2Badge.position.copy(s2Pos);
        s2Badge.position.y += 0.020;
        this.nurburgringGroup.add(s2Badge);
        this.f1Markers.push(s2Badge);

        // Sector 3: Yellow
        const s3Pos = this.nurburgringCurve.getPointAt(0.81);
        const s3Badge = this.createTextMarker("SECTOR 3", "#eab308", "#111111", 0.026, 0.0075, false);
        s3Badge.position.copy(s3Pos);
        s3Badge.position.y += 0.020;
        this.nurburgringGroup.add(s3Badge);
        this.f1Markers.push(s3Badge);

        // Speed Trap (Magenta badge + track dot)
        const stPos = this.nurburgringCurve.getPointAt(0.50); // mid tunnel
        const stDotGeo = new THREE.SphereGeometry(0.002, 8, 8);
        const stDotMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const stDot = new THREE.Mesh(stDotGeo, stDotMat);
        stDot.position.copy(stPos);
        stDot.position.y += 0.0005;
        this.nurburgringGroup.add(stDot);

        const stBadge = this.createTextMarker("SPEED TRAP", "#d946ef", "#ffffff", 0.030, 0.0075, false);
        stBadge.position.copy(stPos);
        stBadge.position.y += 0.026;
        this.nurburgringGroup.add(stBadge);
        this.f1Markers.push(stBadge);

        // DRS Detection Zone 1 (Green badge + track dot)
        const drsPos = this.nurburgringCurve.getPointAt(0.86); // near T17 entry
        const drsDotGeo = new THREE.SphereGeometry(0.002, 8, 8);
        const drsDotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const drsDot = new THREE.Mesh(drsDotGeo, drsDotMat);
        drsDot.position.copy(drsPos);
        drsDot.position.y += 0.0005;
        this.nurburgringGroup.add(drsDot);

        const drsBadge = this.createTextMarker("DRS DETECTION 1", "#22c55e", "#ffffff", 0.038, 0.0075, false);
        drsBadge.position.copy(drsPos);
        drsBadge.position.y += 0.026;
        this.nurburgringGroup.add(drsBadge);
        this.f1Markers.push(drsBadge);

        // 7. Spawn all 3 detailed F1 cars (Russell, Leclerc, Norris)
        this.nurburgringCars = [];
        this.nurburgringF1WheelMats = [];

        // Helper to build and register a car
        const spawnCar = (bodyColor: number, accentColor: number, liveryColor: number, colorType: 'merc' | 'ferrari' | 'mclaren', driverId: string, startProgress: number, isMain: boolean) => {
            const grp = new THREE.Group();
            const built = this.createDetailedF1Car(bodyColor, accentColor, liveryColor, colorType);
            grp.add(built.car);
            this.nurburgringGroup!.add(grp);
            this.nurburgringCars.push({ group: grp, progress: startProgress, speed: 0.052, wheels: built.wheels, colorType, driverId });
            if (isMain) {
                this.nurburgringF1Car = grp;
                this.nurburgringF1Wheels = built.wheels;
            }
        };

        // P1 – Mercedes: George Russell  (silver / cyan)  — primary tracked car (no permanent HUD)
        spawnCar(0xa1a1aa, 0xffffff, 0x00d2be, 'merc', 'f1_gr',  0.000, true);
        // this.createNurburgringF1HUD(); // Removed permanent AR billboard/HUD from the first car

        // P2 – Ferrari: Charles Leclerc  (red / yellow)
        spawnCar(0xdc0000, 0xffcc00, 0xff2200, 'ferrari', 'f1_cl', 0.950, false);

        // P3 – McLaren: Lando Norris     (papaya orange / black)
        spawnCar(0xff8000, 0x111111, 0xff6600, 'mclaren', 'f1_ln', 0.900, false);

        // --- Create F1 Live Roster ---
        this.f1RosterMinimized = false;
        this.f1RosterCanvas = document.createElement('canvas');
        this.f1RosterCanvas.width = 512;
        this.f1RosterCanvas.height = 600; // Aspect ratio for 0.24 x 0.28
        this.f1RosterCtx = this.f1RosterCanvas.getContext('2d')!;

        this.f1RosterTexture = new THREE.CanvasTexture(this.f1RosterCanvas);
        this.f1RosterTexture.colorSpace = THREE.SRGBColorSpace;

        this.f1RosterMat = new THREE.MeshBasicMaterial({
            map: this.f1RosterTexture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Roster billboard — added to tableGroup's scene-root parent so it is NEVER
        // affected by tableGroup scale or nurburgringGroup rotation.
        // World position is recalculated every frame in the update loop.
        const rosterGeom = new THREE.PlaneGeometry(0.24, 0.28);
        this.f1RosterMesh = new THREE.Mesh(rosterGeom, this.f1RosterMat);
        // Temporary world position — will be overridden in update() every frame
        this.f1RosterMesh.position.set(0, 1.3, -0.4);
        // Add to the THREE.js scene root (tableGroup.parent) so scale is fully independent
        if (this.tableGroup.parent) {
            this.tableGroup.parent.add(this.f1RosterMesh);
        } else {
            // Fallback: add to tableGroup (should not happen at runtime)
            this.nurburgringGroup.add(this.f1RosterMesh);
        }
        this.drawF1Roster(); // Draw initial empty roster

        // --- Create F1 Spawning Active Player Card Group ---
        this.f1ActiveCardGroup = new THREE.Group();
        this.f1ActiveCardGroup.visible = false;
        this.nurburgringGroup.add(this.f1ActiveCardGroup);

        // Left Panel: Player Card Image
        // Aspect ratio 3:4. size: 0.06m wide by 0.08m high.
        // Positioned centered on the left: x = -0.045m
        const imgGeom = new THREE.PlaneGeometry(0.06, 0.08);
        const imgMat = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.f1ActiveCardImgMesh = new THREE.Mesh(imgGeom, imgMat);
        this.f1ActiveCardImgMesh.position.set(-0.045, 0, 0.001); // offset slightly forward
        this.f1ActiveCardGroup.add(this.f1ActiveCardImgMesh);

        // Right Panel: Telemetry Canvas
        // size: 0.09m wide by 0.08m high.
        // Positioned centered on the right: x = 0.035m (leaves a 0.005m gap)
        this.f1ActiveCardCanvas = document.createElement('canvas');
        this.f1ActiveCardCanvas.width = 256;
        this.f1ActiveCardCanvas.height = 228;
        this.f1ActiveCardCtx = this.f1ActiveCardCanvas.getContext('2d')!;

        this.f1ActiveCardTexture = new THREE.CanvasTexture(this.f1ActiveCardCanvas);
        this.f1ActiveCardTexture.colorSpace = THREE.SRGBColorSpace;

        const telMat = new THREE.MeshBasicMaterial({
            map: this.f1ActiveCardTexture,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const telGeom = new THREE.PlaneGeometry(0.09, 0.08);
        this.f1ActiveCardMesh = new THREE.Mesh(telGeom, telMat);
        this.f1ActiveCardMesh.position.set(0.035, 0, 0.001);
        this.f1ActiveCardGroup.add(this.f1ActiveCardMesh);

        // Backing geometry: 0.16m wide by 0.09m high.
        // Positioned centered at x = -0.005m (covers both left and right panel)
        const cardBackGeom = new THREE.PlaneGeometry(0.16, 0.09);
        const cardBackMat = new THREE.MeshBasicMaterial({
            color: 0x050c1c,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const cardBackMesh = new THREE.Mesh(cardBackGeom, cardBackMat);
        cardBackMesh.position.set(-0.005, 0, 0.0);
        this.f1ActiveCardGroup.add(cardBackMesh);

        // Neon cyan wireframe border outline
        const cardBorderGeom = new THREE.EdgesGeometry(cardBackGeom);
        const cardBorderMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        const cardBorderMesh = new THREE.LineSegments(cardBorderGeom, cardBorderMat);
        cardBorderMesh.position.set(-0.005, 0, 0.0005);
        this.f1ActiveCardGroup.add(cardBorderMesh);

        // V17 approach: add directly to tableGroup as a normal child.
        // The ECS TransformSystem is fine with this since tableGroup is already registered;
        // nurburgringGroup has no entityIdx so TransformSystem ignores it during parenting.
        this.tableGroup.add(this.nurburgringGroup);
        this.initNurburgringVortexAndSpray();
        console.log("[NurburgringMap] High-fidelity wider racetrack, line guides, and 3 detailed F1 racing cars initialized!");
    }

    private createTextMarker(text: string, bgColor: string, textColor: string, width: number, height: number, isCircle: boolean = true): THREE.Mesh {
        const canvas = document.createElement('canvas');
        canvas.width = isCircle ? 256 : 512;
        canvas.height = isCircle ? 256 : 128;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isCircle) {
            // Draw circle background
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.arc(128, 128, 110, 0, 2 * Math.PI);
            ctx.fill();

            // Draw border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 10;
            ctx.stroke();

            // Draw text
            ctx.fillStyle = textColor;
            ctx.font = 'bold 110px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 128, 128);
        } else {
            // Draw rounded rectangle background
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            const radius = 24;
            const padX = 12;
            const padY = 12;
            const w = canvas.width - padX * 2;
            const h = canvas.height - padY * 2;
            ctx.moveTo(padX + radius, padY);
            ctx.lineTo(padX + w - radius, padY);
            ctx.quadraticCurveTo(padX + w, padY, padX + w, padY + radius);
            ctx.lineTo(padX + w, padY + h - radius);
            ctx.quadraticCurveTo(padX + w, padY + h, padX + w - radius, padY + h);
            ctx.lineTo(padX + radius, padY + h);
            ctx.quadraticCurveTo(padX, padY + h, padX, padY + h - radius);
            ctx.lineTo(padX, padY + radius);
            ctx.quadraticCurveTo(padX, padY, padX + radius, padY);
            ctx.closePath();
            ctx.fill();

            // Draw border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 6;
            ctx.stroke();

            // Draw text
            ctx.fillStyle = textColor;
            ctx.font = 'bold 50px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const geo = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geo, mat);
        return mesh;
    }

    private createDetailedF1Car(bodyColor: number, helmetColor: number, visorColor: number, colorType: 'merc' | 'ferrari' | 'mclaren') {
        const car = new THREE.Group();
        const wheels: THREE.Mesh[] = [];

        // Materials — MeshBasicMaterial: no PBR shader compile stall in WebXR
        const bodyMat = new THREE.MeshBasicMaterial({ color: bodyColor });
        const carbonMat = new THREE.MeshBasicMaterial({ color: 0x18181b });
        const helmetMat = new THREE.MeshBasicMaterial({ color: helmetColor });
        const visorMat = new THREE.MeshBasicMaterial({ color: visorColor });
        const axleMat = new THREE.MeshBasicMaterial({ color: 0xd1d5db });

        // 1. Carbon chassis base & Underbody Venturi Skirts
        const baseGeo = new THREE.BoxGeometry(0.004, 0.0008, 0.014);
        const baseMesh = new THREE.Mesh(baseGeo, carbonMat);
        baseMesh.position.y = 0.0006;
        car.add(baseMesh);

        // Floor Venturi side skirts
        const floorGeo = new THREE.BoxGeometry(0.0068, 0.0003, 0.010);
        const floorMesh = new THREE.Mesh(floorGeo, carbonMat);
        floorMesh.position.set(0, 0.0003, -0.001);
        car.add(floorMesh);

        // Rear Diffuser (upswept)
        const diffuserGeo = new THREE.BoxGeometry(0.0055, 0.0010, 0.0015);
        const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
        diffuser.position.set(0, 0.0006, -0.0075);
        diffuser.rotation.x = 0.25;
        car.add(diffuser);

        // 2. Sleek tapered aerodynamic nosecone
        const noseGeo = new THREE.CylinderGeometry(0.0004, 0.0011, 0.007, 12);
        noseGeo.rotateX(Math.PI / 2);
        const noseMesh = new THREE.Mesh(noseGeo, bodyMat);
        noseMesh.position.set(0, 0.0012, 0.0035);
        car.add(noseMesh);

        // 3. Sculpted sidepods (wider front intake with downwash ramp shape)
        // Left Sidepod
        const leftPodInlet = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0014, 0.003), bodyMat);
        leftPodInlet.position.set(-0.0024, 0.0012, 0.0);
        const leftPodRamp = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0009, 0.0035, 8), bodyMat);
        leftPodRamp.geometry.rotateX(Math.PI / 2);
        leftPodRamp.position.set(-0.0022, 0.0009, -0.00325);
        car.add(leftPodInlet, leftPodRamp);

        // Right Sidepod
        const rightPodInlet = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0014, 0.003), bodyMat);
        rightPodInlet.position.set(0.0024, 0.0012, 0.0);
        const rightPodRamp = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0009, 0.0035, 8), bodyMat);
        rightPodRamp.geometry.rotateX(Math.PI / 2);
        rightPodRamp.position.set(0.0022, 0.0009, -0.00325);
        car.add(rightPodInlet, rightPodRamp);

        // 4. Driver Cockpit & Helmet
        const cockpitGeo = new THREE.BoxGeometry(0.0018, 0.0008, 0.003);
        const cockpitMesh = new THREE.Mesh(cockpitGeo, carbonMat);
        cockpitMesh.position.set(0, 0.0018, -0.0015);
        car.add(cockpitMesh);

        // Halo Safety Ring
        const haloRingGeo = new THREE.TorusGeometry(0.0014, 0.0003, 8, 24, Math.PI);
        const haloRing = new THREE.Mesh(haloRingGeo, carbonMat);
        haloRing.rotation.x = Math.PI / 2;
        haloRing.rotation.y = Math.PI; // Point forwards
        haloRing.position.set(0, 0.0024, -0.001);
        car.add(haloRing);

        const haloStrutGeo = new THREE.CylinderGeometry(0.0002, 0.0002, 0.0014, 6);
        const haloStrut = new THREE.Mesh(haloStrutGeo, carbonMat);
        haloStrut.position.set(0, 0.0019, 0.0001);
        haloStrut.rotation.x = 0.25; // Tilt back
        car.add(haloStrut);

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

        // Airbox intake scoop above driver helmet
        const airboxGeo = new THREE.CylinderGeometry(0.0006, 0.0008, 0.0016, 8);
        airboxGeo.rotateX(Math.PI / 2);
        const airbox = new THREE.Mesh(airboxGeo, carbonMat);
        airbox.position.set(0, 0.0034, -0.0028);
        car.add(airbox);

        // Yellow T-Camera pod on top of the airbox
        const tCamGeo = new THREE.BoxGeometry(0.0004, 0.0003, 0.001);
        const tCamMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
        const tCam = new THREE.Mesh(tCamGeo, tCamMat);
        tCam.position.set(0, 0.0043, -0.0028);
        car.add(tCam);

        // Dark intakes on front face of sidepods (creates hollow depth illusion)
        const leftIntakeGeo = new THREE.BoxGeometry(0.0014, 0.001, 0.0002);
        const leftIntake = new THREE.Mesh(leftIntakeGeo, carbonMat);
        leftIntake.position.set(-0.0024, 0.0012, 0.0016);
        const rightIntake = new THREE.Mesh(leftIntakeGeo, carbonMat);
        rightIntake.position.set(0.0024, 0.0012, 0.0016);
        car.add(leftIntake, rightIntake);

        // Sleek engine cover spine (tapered cylinder)
        const spineGeo = new THREE.CylinderGeometry(0.0005, 0.0011, 0.0042, 8);
        spineGeo.rotateX(Math.PI / 2);
        const spineMesh = new THREE.Mesh(spineGeo, bodyMat);
        spineMesh.position.set(0, 0.0020, -0.0038);
        car.add(spineMesh);

        // Shark Fin vertical stabilizer
        const finGeo = new THREE.BoxGeometry(0.0002, 0.0015, 0.0032);
        const finMesh = new THREE.Mesh(finGeo, bodyMat);
        finMesh.position.set(0, 0.0032, -0.0044);
        car.add(finMesh);

        // 5. Arrow Front Wing with Endplates (swept-back double deck)
        const leftFrontWingGeo = new THREE.BoxGeometry(0.0038, 0.0006, 0.0015);
        const leftFrontWing = new THREE.Mesh(leftFrontWingGeo, carbonMat);
        leftFrontWing.position.set(-0.0018, 0.0006, 0.007);
        leftFrontWing.rotation.y = -0.15; // swept back
        leftFrontWing.rotation.z = -0.05;
        car.add(leftFrontWing);

        const rightFrontWingGeo = new THREE.BoxGeometry(0.0038, 0.0006, 0.0015);
        const rightFrontWing = new THREE.Mesh(rightFrontWingGeo, carbonMat);
        rightFrontWing.position.set(0.0018, 0.0006, 0.007);
        rightFrontWing.rotation.y = 0.15; // swept back
        rightFrontWing.rotation.z = 0.05;
        car.add(rightFrontWing);

        const endplateGeo = new THREE.BoxGeometry(0.0002, 0.0015, 0.002);
        const leftFrontEndplate = new THREE.Mesh(endplateGeo, bodyMat);
        leftFrontEndplate.position.set(-0.00375, 0.0013, 0.007);
        leftFrontEndplate.rotation.y = -0.15;
        const rightFrontEndplate = new THREE.Mesh(endplateGeo, bodyMat);
        rightFrontEndplate.position.set(0.00375, 0.0013, 0.007);
        rightFrontEndplate.rotation.y = 0.15;
        car.add(leftFrontEndplate, rightFrontEndplate);

        // 6. Multi-plane Rear Wing with Endplates
        // Rear Wing Upper Plane
        const rearWingGeo = new THREE.BoxGeometry(0.0068, 0.0003, 0.0018);
        const rearWing = new THREE.Mesh(rearWingGeo, bodyMat);
        rearWing.position.set(0, 0.0035, -0.007);
        rearWing.rotation.x = 0.12; // angle of attack
        car.add(rearWing);

        // Rear Wing Lower Beam Wing
        const rearWingLowerGeo = new THREE.BoxGeometry(0.0068, 0.0002, 0.0012);
        const rearWingLower = new THREE.Mesh(rearWingLowerGeo, carbonMat);
        rearWingLower.position.set(0, 0.0026, -0.0073);
        car.add(rearWingLower);

        // Struts
        const strutGeo = new THREE.BoxGeometry(0.0004, 0.0025, 0.0004);
        const leftStrut = new THREE.Mesh(strutGeo, carbonMat);
        leftStrut.position.set(-0.001, 0.00225, -0.007);
        const rightStrut = new THREE.Mesh(strutGeo, carbonMat);
        rightStrut.position.set(0.001, 0.00225, -0.007);
        car.add(leftStrut, rightStrut);

        // Rear endplates
        const rearEndplateGeo = new THREE.BoxGeometry(0.0002, 0.0034, 0.0026);
        const leftRearEndplate = new THREE.Mesh(rearEndplateGeo, carbonMat);
        leftRearEndplate.position.set(-0.0034, 0.0030, -0.0072);
        const rightRearEndplate = new THREE.Mesh(rearEndplateGeo, carbonMat);
        rightRearEndplate.position.set(0.0034, 0.0030, -0.0072);
        car.add(leftRearEndplate, rightRearEndplate);

        // DRS actuator pod in the center of the rear wing upper plane
        const drsPodGeo = new THREE.BoxGeometry(0.0005, 0.0006, 0.0010);
        const drsPod = new THREE.Mesh(drsPodGeo, carbonMat);
        drsPod.position.set(0, 0.0039, -0.007);
        car.add(drsPod);

        // Exhaust pipe (exits out of the rear engine cover)
        const exhaustGeo = new THREE.CylinderGeometry(0.0003, 0.0003, 0.0018, 6);
        exhaustGeo.rotateX(Math.PI / 2);
        const exhaust = new THREE.Mesh(exhaustGeo, axleMat);
        exhaust.position.set(0, 0.0015, -0.0062);
        car.add(exhaust);

        // Blinking rain safety light in the diffuser center
        const rainLightGeo = new THREE.BoxGeometry(0.0006, 0.0006, 0.0003);
        const rainLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const rainLight = new THREE.Mesh(rainLightGeo, rainLightMat);
        rainLight.position.set(0, 0.0006, -0.0083);
        car.add(rainLight);

        // Suspension wishbones/struts (carbon fiber rods)
        const suspensionGeo = new THREE.BoxGeometry(0.0032, 0.0002, 0.0003);
        const suspLeftFront = new THREE.Mesh(suspensionGeo, carbonMat);
        suspLeftFront.position.set(-0.0018, 0.001, 0.0048);
        suspLeftFront.rotation.z = -0.22;
        const suspRightFront = new THREE.Mesh(suspensionGeo, carbonMat);
        suspRightFront.position.set(0.0018, 0.001, 0.0048);
        suspRightFront.rotation.z = 0.22;
        car.add(suspLeftFront, suspRightFront);

        const suspLeftRear = new THREE.Mesh(suspensionGeo, carbonMat);
        suspLeftRear.position.set(-0.0018, 0.001, -0.0048);
        suspLeftRear.rotation.z = -0.22;
        const suspRightRear = new THREE.Mesh(suspensionGeo, carbonMat);
        suspRightRear.position.set(0.0018, 0.001, -0.0048);
        suspRightRear.rotation.z = 0.22;
        car.add(suspLeftRear, suspRightRear);

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

        // Rim cover geometry (slightly thinner outer cylinder cover)
        const rimCoverGeo = new THREE.CylinderGeometry(0.0010, 0.0010, 0.0003, 8);
        rimCoverGeo.rotateZ(Math.PI / 2);

        wheelOffsets.forEach((offset) => {
            const wMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
            if (colorType === 'merc') {
                this.nurburgringF1WheelMats.push(wMat);
            }
            const wheel = new THREE.Mesh(wheelGeo, wMat);
            wheel.position.set(offset.x, 0.001, offset.z);
            car.add(wheel);
            wheels.push(wheel);

            const rimMat = new THREE.MeshBasicMaterial({ color: bodyColor });
            const rim = new THREE.Mesh(rimCoverGeo, rimMat);
            const rimOffsetX = offset.x > 0 ? 0.0005 : -0.0005;
            rim.position.set(offset.x + rimOffsetX, 0.001, offset.z);
            car.add(rim);

            // Sidewall Pirelli compound stripe
            const stripeGeo = new THREE.RingGeometry(0.0012, 0.0014, 16);
            stripeGeo.rotateY(Math.PI / 2);
            const stripeMat = new THREE.MeshBasicMaterial({
                color: visorColor, // color-coded compound matching team accents
                side: THREE.DoubleSide
            });
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            const stripeOffsetX = offset.x > 0 ? 0.00062 : -0.00062;
            stripe.position.set(offset.x + stripeOffsetX, 0.001, offset.z);
            car.add(stripe);
        });

        // 40% smaller than previous: 0.64 * 0.6 = 0.384
        car.scale.setScalar(0.384);

        return { car, wheels };
    }

    private getF1Telemetry(fProgress: number): { speed: number, gear: number, rpm: number, throttle: number, brake: number } {
        let speed = 220;
        let gear = 5;
        let rpm = 11500;
        let throttle = 1.0;
        let brake = 0.0;

        if (fProgress >= 0.94 || fProgress < 0.05) {
            // Main straight & DRS Zone
            const ratio = fProgress >= 0.94 ? (fProgress - 0.94) / 0.11 : (fProgress + 0.06) / 0.11;
            speed = Math.floor(150 + ratio * 140); // 150 to 290 km/h
            gear = Math.floor(3 + ratio * 5); // 3 to 8
            rpm = Math.floor(9000 + ratio * 3800);
            throttle = 1.0;
            brake = 0.0;
        } else if (fProgress >= 0.05 && fProgress < 0.09) {
            // Sainte Devote (Turn 1) braking
            const ratio = (fProgress - 0.05) / 0.04;
            speed = Math.floor(290 - ratio * 180); // 290 down to 110 km/h
            gear = Math.max(2, Math.floor(8 - ratio * 6));
            rpm = Math.floor(12800 - ratio * 4300);
            throttle = 0.0;
            brake = Math.sin(ratio * Math.PI) * 1.0;
        } else if (fProgress >= 0.09 && fProgress < 0.26) {
            // Beau Rivage uphill & Massenet/Casino curves
            const ratio = (fProgress - 0.09) / 0.17;
            if (ratio < 0.5) {
                // uphill accelerate
                speed = Math.floor(110 + ratio * 2 * 110); // 110 to 220 km/h
                gear = Math.floor(2 + ratio * 2 * 3);
                throttle = 1.0;
                brake = 0.0;
            } else {
                // slow down for Massenet/Casino
                speed = Math.floor(220 - (ratio - 0.5) * 2 * 80); // 220 down to 140 km/h
                gear = Math.floor(5 - (ratio - 0.5) * 2 * 2);
                throttle = 0.3;
                brake = 0.4;
            }
            rpm = Math.floor(8500 + Math.sin(ratio * Math.PI * 2) * 2500 + 1000);
        } else if (fProgress >= 0.26 && fProgress < 0.38) {
            // Mirabeau Haute and Fairmont Hairpin (slowest corner in F1)
            const ratio = (fProgress - 0.26) / 0.12;
            if (ratio < 0.7) {
                // braking for hairpin
                speed = Math.floor(140 - (ratio / 0.7) * 95); // 140 to 45 km/h
                gear = Math.max(1, Math.floor(3 - (ratio / 0.7) * 2));
                brake = 0.8;
                throttle = 0.1;
                rpm = Math.floor(10000 - (ratio / 0.7) * 3000);
            } else {
                // exit hairpin
                speed = Math.floor(45 + ((ratio - 0.7) / 0.3) * 25); // 45 to 70 km/h
                gear = 1;
                brake = 0.0;
                throttle = 0.5;
                rpm = Math.floor(7000 + ((ratio - 0.7) / 0.3) * 2000);
            }
        } else if (fProgress >= 0.38 && fProgress < 0.58) {
            // Portier and Tunnel acceleration
            const ratio = (fProgress - 0.38) / 0.20;
            speed = Math.floor(70 + ratio * 220); // 70 to 290 km/h (tunnel top speed)
            gear = Math.floor(2 + ratio * 6); // 2 to 8
            rpm = Math.floor(8000 + ratio * 4800);
            throttle = 1.0;
            brake = 0.0;
        } else if (fProgress >= 0.58 && fProgress < 0.65) {
            // Nouvelle Chicane braking
            const ratio = (fProgress - 0.58) / 0.07;
            speed = Math.floor(290 - ratio * 210); // 290 down to 80 km/h
            gear = Math.max(2, Math.floor(8 - ratio * 6));
            rpm = Math.floor(12800 - ratio * 4000);
            throttle = 0.0;
            brake = Math.sin(ratio * Math.PI) * 1.0;
        } else if (fProgress >= 0.65 && fProgress < 0.82) {
            // Tabac and Swimming Pool
            const ratio = (fProgress - 0.65) / 0.17;
            if (ratio < 0.3) {
                speed = Math.floor(80 + (ratio / 0.3) * 80); // 80 to 160 km/h (Tabac)
                gear = 4;
                throttle = 0.8;
                brake = 0.0;
            } else if (ratio < 0.75) {
                speed = Math.floor(160 + ((ratio - 0.3) / 0.45) * 40); // 160 to 200 km/h (Swimming Pool entry)
                gear = 5;
                throttle = 0.8;
                brake = 0.0;
            } else {
                speed = Math.floor(200 - ((ratio - 0.75) / 0.25) * 80); // 200 down to 120 km/h (chicane exit)
                gear = 3;
                throttle = 0.0;
                brake = 0.7;
            }
            rpm = Math.floor(9000 + Math.sin(ratio * Math.PI * 3) * 1500 + 1000);
        } else {
            // Rascasse and Anthony Noghes
            const ratio = (fProgress - 0.82) / 0.12;
            if (ratio < 0.5) {
                speed = Math.floor(120 - (ratio / 0.5) * 65); // 120 down to 55 km/h (Rascasse hairpin)
                gear = Math.max(1, Math.floor(3 - (ratio / 0.5) * 2));
                brake = 0.9;
                throttle = 0.1;
                rpm = Math.floor(9500 - (ratio / 0.5) * 3500);
            } else {
                speed = Math.floor(55 + ((ratio - 0.5) / 0.5) * 95); // 55 to 150 km/h (Antony Noghes exit)
                gear = 3;
                brake = 0.0;
                throttle = 1.0;
                rpm = Math.floor(7000 + ((ratio - 0.5) / 0.5) * 2500);
            }
        }

        return { speed, gear, rpm, throttle, brake };
    }

    private getSortedDrivers(): {
        driverId: string;
        name: string;
        team: string;
        rcbCardKey: string;
        progress: number;
        lap: number;
        totalProgress: number;
    }[] {
        const rosterNurburgring = [
            { id: "f1_cl", name: "C. Leclerc", team: "Ferrari", rcbCardKey: "f1CharlesLeclerc" },
            { id: "f1_ln", name: "L. Norris", team: "McLaren", rcbCardKey: "f1LandoNorris" },
            { id: "f1_gr", name: "G. Russell", team: "Mercedes", rcbCardKey: "f1GeorgeRussell" }
        ];

        const drivers = rosterNurburgring.map(d => {
            const car = this.nurburgringCars.find(c => c.driverId === d.id);
            const progress = car ? (car as any).progress ?? 0 : 0;
            const lap = this.f1CarLaps[d.id] ?? 1;
            const totalProgress = (lap - 1) + progress;
            return {
                driverId: d.id,
                name: d.name,
                team: d.team,
                rcbCardKey: d.rcbCardKey,
                progress,
                lap,
                totalProgress
            };
        });

        // Sort by totalProgress in descending order (highest progress = leading)
        return drivers.sort((a, b) => b.totalProgress - a.totalProgress);
    }

    private drawF1Roster() {
        if (!this.f1RosterCtx) return;
        const ctx = this.f1RosterCtx;

        if (this.f1RosterMinimized) {
            ctx.clearRect(0, 0, 512, 170);

            // Minimized layout: compact card with high-vis cyan border & show action text
            ctx.fillStyle = 'rgba(6, 10, 24, 0.95)';
            ctx.fillRect(0, 0, 512, 170);

            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, 502, 160);

            ctx.font = 'bold 32px "Orbitron", "Courier New", monospace';
            ctx.fillStyle = '#00ffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('[+] SHOW F1 ROSTER', 256, 85);
        } else {
            ctx.clearRect(0, 0, 512, 600);

            if (this.f1RosterBgImage && this.f1RosterBgImage.complete && this.f1RosterBgImage.naturalHeight > 0) {
                ctx.drawImage(this.f1RosterBgImage, 0, 0, 512, 600);
            } else {
                // Fallback backing panel
                ctx.fillStyle = 'rgba(6, 10, 24, 0.88)';
                ctx.fillRect(0, 0, 512, 600);
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
                ctx.lineWidth = 6;
                ctx.strokeRect(6, 6, 500, 588);
            }

            // Title Text
            ctx.font = 'bold 24px "Orbitron", "Courier New", monospace';
            ctx.fillStyle = '#22d3ee'; // Cyan
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('JUGNU F1 LIVE', 48, 80);

            // Current maximum lap count
            const maxLap = Object.keys(this.f1CarLaps).length > 0 ? Math.max(...Object.values(this.f1CarLaps)) : 0;
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.fillStyle = '#f59e0b'; // Amber
            ctx.textAlign = 'right';
            ctx.fillText(`LAP ${maxLap}`, 464, 80);

            // Separator line
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(32, 100);
            ctx.lineTo(480, 100);
            ctx.stroke();

            // Draw Rows vertically (3 rows only for 3 cars)
            const sortedDrivers = this.getSortedDrivers();
            const rowH = 80;
            const startY = 110;

            for (let i = 0; i < 3; i++) {
                const driver = sortedDrivers[i];
                if (!driver) continue;

                const rowTop = startY + i * rowH;

                // Hover state backing card highlight
                if (this.f1RosterHoveredRowIndex === i) {
                    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
                    ctx.fillRect(32, rowTop + 4, 448, rowH - 8);
                    ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(32, rowTop + 4, 448, rowH - 8);
                }

                // Subtle divider
                if (i < 2) {
                    ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(48, rowTop + rowH);
                    ctx.lineTo(464, rowTop + rowH);
                    ctx.stroke();
                }

                // A. Position number block
                ctx.fillStyle = i === 0 ? '#f59e0b' : (i === 1 ? '#cbd5e1' : '#b45309');
                ctx.fillRect(48, rowTop + 25, 30, 30);
                ctx.font = 'bold 18px monospace';
                ctx.fillStyle = '#090d16';
                ctx.textAlign = 'center';
                ctx.fillText(`${i + 1}`, 63, rowTop + 46);

                // B. Driver name & Jersey
                const rosterNurburgringRaw = [
                    { id: "f1_lh", jersey: "44" },
                    { id: "f1_cl", jersey: "16" },
                    { id: "f1_ln", jersey: "4" },
                    { id: "f1_op", jersey: "81" },
                    { id: "f1_gr", jersey: "63" },
                    { id: "f1_ka", jersey: "12" }
                ];
                const jersey = rosterNurburgringRaw.find(r => r.id === driver.driverId)?.jersey ?? "";
                ctx.font = 'bold 18px "Courier New", monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(`${driver.name} #${jersey}`, 96, rowTop + 40);

                // C. Team logo tag (color coded border)
                let teamColor = '#00ffff'; // Mercedes cyan
                if (driver.team === 'Ferrari') teamColor = '#e11d48'; // Red
                else if (driver.team === 'McLaren') teamColor = '#ea580c'; // Orange

                ctx.strokeStyle = teamColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(96, rowTop + 50, 86, 20);
                ctx.font = '11px monospace';
                ctx.fillStyle = teamColor;
                ctx.textAlign = 'center';
                ctx.fillText(driver.team.toUpperCase(), 139, rowTop + 64);

                // D. Telemetry Snippet: Lap and Live Speed
                const tel = this.getF1Telemetry(driver.progress);
                ctx.font = 'bold 16px "Courier New", monospace';
                ctx.fillStyle = '#22d3ee';
                ctx.textAlign = 'right';
                ctx.fillText(`${tel.speed} KM/H`, 464, rowTop + 40);

                ctx.font = '14px "Courier New", monospace';
                ctx.fillStyle = '#a1a1aa';
                ctx.fillText(`LAP ${driver.lap}`, 464, rowTop + 64);
            }

            // Draw "MINIMIZE" Button at the bottom (Y = 430 to 510)
            ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
            ctx.fillRect(32, 430, 448, 80);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.strokeRect(32, 430, 448, 80);

            ctx.font = 'bold 26px "Orbitron", "Courier New", monospace';
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('[-] HIDE ROSTER', 256, 470);
        }

        this.f1RosterTexture.needsUpdate = true;
    }

    private triggerPlayerCard(driverId: string) {
        this.f1ActiveCardDriverId = driverId;
        this.f1ActiveCardTimer = 0.0;
        this.f1ActiveCardGroup.visible = true;
        this.f1ActiveCardGroup.scale.setScalar(0.0);

        // Play spatial spawn sounds!
        const spatialFX = (window as any).spatialFX;
        if (spatialFX) {
            // Trigger sparkle positional sound at the F1 car position
            const car = this.nurburgringCars.find(c => c.driverId === driverId);
            if (car) {
                const worldPos = new THREE.Vector3();
                car.group.getWorldPosition(worldPos);
                spatialFX.playPositionalSound('sparkle', worldPos);
                spatialFX.triggerSpark(worldPos, new THREE.Color(0x00ffff), 12);
            }
        }

        // Apply texture map lazily
        const rosterNurburgringRaw = [
            { id: "f1_lh", rcbCardKey: "f1LewisHamilton" },
            { id: "f1_cl", rcbCardKey: "f1CharlesLeclerc" },
            { id: "f1_ln", rcbCardKey: "f1LandoNorris" },
            { id: "f1_op", rcbCardKey: "f1OscarPiastri" },
            { id: "f1_gr", rcbCardKey: "f1GeorgeRussell" },
            { id: "f1_ka", rcbCardKey: "f1KimiAntonelli" }
        ];
        const cardKey = rosterNurburgringRaw.find(r => r.id === driverId)?.rcbCardKey ?? "";
        if (cardKey) {
            const tex = AssetManager.getTexture(cardKey);
            const cardMat = this.f1ActiveCardImgMesh.material as THREE.MeshBasicMaterial;
            if (tex && cardMat) {
                tex.colorSpace = THREE.SRGBColorSpace;
                cardMat.map = tex;
                cardMat.needsUpdate = true;
            }
        }
        console.log(`[F1Roster] Spawned telemetry card for driver ${driverId}`);
    }

    private drawF1ActiveCard(speed: number, gear: number, rpm: number, throttle: number, brake: number) {
        if (!this.f1ActiveCardCtx) return;
        const ctx = this.f1ActiveCardCtx;
        ctx.clearRect(0, 0, 256, 228);

        // 1. Dark slate backing (covers the canvas)
        ctx.fillStyle = 'rgba(5, 12, 28, 0.9)';
        ctx.fillRect(0, 0, 256, 228);

        // 2. Neon cyan accent top bar
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.fillRect(0, 0, 256, 44);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 44);
        ctx.lineTo(256, 44);
        ctx.stroke();

        // 3. Driver/Telemetry Title
        const driverName = this.f1ActiveCardDriverId === 'f1_lh' ? 'L. HAMILTON'
            : this.f1ActiveCardDriverId === 'f1_cl' ? 'C. LECLERC'
                : this.f1ActiveCardDriverId === 'f1_ln' ? 'L. NORRIS'
                    : this.f1ActiveCardDriverId === 'f1_op' ? 'O. PIASTRI'
                        : this.f1ActiveCardDriverId === 'f1_gr' ? 'G. RUSSELL'
                            : this.f1ActiveCardDriverId === 'f1_ka' ? 'K. ANTONELLI'
                                : 'TELEMETRY';

        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(driverName, 12, 28);

        // 4. Speedometer text display
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${speed}`, 12, 94);

        ctx.font = '12px monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText('KM/H', 88, 86);

        // 5. Gear block display
        ctx.fillStyle = '#ea580c'; // McLaren orange / Amber gear color
        ctx.font = 'bold 42px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${gear}`, 240, 96);
        ctx.font = '10px monospace';
        ctx.fillText('GEAR', 240, 60);

        // 6. Throttle & Brake visual channels
        ctx.fillStyle = '#1f2937'; // dark container bar
        ctx.fillRect(12, 134, 108, 14);
        ctx.fillStyle = '#10b981'; // Green throttle
        ctx.fillRect(12, 134, Math.floor(throttle * 108), 14);

        ctx.fillStyle = '#1f2937';
        ctx.fillRect(136, 134, 108, 14);
        ctx.fillStyle = '#ef4444'; // Red brake
        ctx.fillRect(136, 134, Math.floor(brake * 108), 14);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'left';
        ctx.fillText('THROTTLE', 12, 126);
        ctx.fillText('BRAKE', 136, 126);

        // 7. RPM glowing progress indicator bar
        const rpmRatio = Math.max(0, Math.min(1.0, (rpm - 5000) / 10000));
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(12, 186, 232, 12);

        const rpmCol = rpm > 12500 ? '#f43f5e' : '#22d3ee'; // shifts rose/pink at rev limiter
        ctx.fillStyle = rpmCol;
        ctx.fillRect(12, 186, Math.floor(rpmRatio * 232), 12);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(`RPM: ${rpm}`, 12, 178);

        // RPM segment dividers
        ctx.strokeStyle = '#050c1c';
        ctx.lineWidth = 2;
        for (let j = 1; j < 10; j++) {
            ctx.beginPath();
            ctx.moveTo(12 + Math.floor(j * 23.2), 186);
            ctx.lineTo(12 + Math.floor(j * 23.2), 198);
            ctx.stroke();
        }

        this.f1ActiveCardTexture.needsUpdate = true;
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

        // Scaled to compensate for the F1 car group 0.64 scale so HUD is 50% larger (0.030x0.015) in world space
        const hudGeom = new THREE.PlaneGeometry(0.046875, 0.0234375);
        this.f1HudMesh = new THREE.Mesh(hudGeom, this.f1HudMat);
        // Position it floating directly above the driver helmet inside F1 car local space
        this.f1HudMesh.position.set(0, 0.0234375, -0.00234375);
        this.nurburgringF1Car.add(this.f1HudMesh);
    }

    private initNurburgringVortexAndSpray() {
        // --- 9. F1 VORTEX VAPOR TRAILS INITIALIZATION ---
        const vortexLeftGeo = new THREE.BufferGeometry();
        vortexLeftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
        const vortexRightGeo = new THREE.BufferGeometry();
        vortexRightGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));

        const vortexMat = new THREE.LineBasicMaterial({
            color: 0x22d3ee, // Cyberpunk cyan glow
            transparent: true,
            opacity: 0.0, // starts hidden
            linewidth: 2,
            depthWrite: false
        });

        this.f1VortexLeft = new THREE.Line(vortexLeftGeo, vortexMat);
        this.f1VortexRight = new THREE.Line(vortexRightGeo, vortexMat);

        // Red Bull
        const vortexLeftGeo_RB = new THREE.BufferGeometry();
        vortexLeftGeo_RB.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
        const vortexRightGeo_RB = new THREE.BufferGeometry();
        vortexRightGeo_RB.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
        const vortexMat_RB = new THREE.LineBasicMaterial({
            color: 0xff6600, // McLaren papaya orange glow
            transparent: true,
            opacity: 0.0,
            linewidth: 2,
            depthWrite: false
        });
        this.f1VortexLeft_RB = new THREE.Line(vortexLeftGeo_RB, vortexMat_RB);
        this.f1VortexRight_RB = new THREE.Line(vortexRightGeo_RB, vortexMat_RB);

        // Ferrari
        const vortexLeftGeo_FE = new THREE.BufferGeometry();
        vortexLeftGeo_FE.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
        const vortexRightGeo_FE = new THREE.BufferGeometry();
        vortexRightGeo_FE.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
        const vortexMat_FE = new THREE.LineBasicMaterial({
            color: 0xef4444, // Ferrari red glow
            transparent: true,
            opacity: 0.0,
            linewidth: 2,
            depthWrite: false
        });
        this.f1VortexLeft_FE = new THREE.Line(vortexLeftGeo_FE, vortexMat_FE);
        this.f1VortexRight_FE = new THREE.Line(vortexRightGeo_FE, vortexMat_FE);

        if (this.nurburgringGroup) {
            this.nurburgringGroup.add(
                this.f1VortexLeft, this.f1VortexRight,
                this.f1VortexLeft_RB, this.f1VortexRight_RB,
                this.f1VortexLeft_FE, this.f1VortexRight_FE
            );
        }

        this.f1VortexLeftPoints = [];
        this.f1VortexRightPoints = [];
        this.f1VortexLeftPoints_RB = [];
        this.f1VortexRightPoints_RB = [];
        this.f1VortexLeftPoints_FE = [];
        this.f1VortexRightPoints_FE = [];

        for (let i = 0; i < 25; i++) {
            this.f1VortexLeftPoints.push(new THREE.Vector3());
            this.f1VortexRightPoints.push(new THREE.Vector3());
            this.f1VortexLeftPoints_RB.push(new THREE.Vector3());
            this.f1VortexRightPoints_RB.push(new THREE.Vector3());
            this.f1VortexLeftPoints_FE.push(new THREE.Vector3());
            this.f1VortexRightPoints_FE.push(new THREE.Vector3());
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
        // 360 particles max (60 per car for 6 cars)
        this.f1SprayMesh = new THREE.InstancedMesh(sprayGeom, sprayMat, 360);
        if (this.nurburgringGroup) {
            this.nurburgringGroup.add(this.f1SprayMesh);
        }

        // Pre-allocate Float32Array for particle states (360 particles * 8 values: x, y, z, vx, vy, vz, age, active)
        this.f1SprayData = new Float32Array(360 * 8);

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

    // holdProgress 0–1 only matters when isTouching = true.
    // idle → cyan,  touch (progress 0) → green,  hold (progress → 1) → red.
    private drawWristButton(holdProgress: number, isTouching: boolean) {
        const ctx = this.wristBtnCanvas.getContext('2d')!;
        const cx = 64, cy = 64;
        ctx.clearRect(0, 0, 128, 128);

        // Resolve accent colour: cyan → green → red
        let r: number, g: number, b: number;
        if (!isTouching) {
            r = 34; g = 211; b = 238;  // cyan
        } else {
            // green (34,197,94) ──lerp──► red (239,68,68) by holdProgress
            r = Math.round(34 + (239 - 34) * holdProgress);
            g = Math.round(197 + (68 - 197) * holdProgress);
            b = Math.round(94 + (68 - 94) * holdProgress);
        }
        const accentCss = `rgb(${r},${g},${b})`;
        const accentDim = `rgba(${r},${g},${b},0.3)`;
        const accentGlow = `rgba(${r},${g},${b},0.8)`;

        // Dark glass background
        const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 56);
        grad.addColorStop(0, 'rgba(15,25,50,0.92)');
        grad.addColorStop(1, 'rgba(5,10,30,0.80)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 56, 0, Math.PI * 2);
        ctx.fill();

        // Accent border ring
        ctx.strokeStyle = accentCss;
        ctx.lineWidth = 5;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, 54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner dim ring
        ctx.strokeStyle = accentDim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 46, 0, Math.PI * 2);
        ctx.stroke();

        // Icon: × (cross) when open, Map when closed
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = 8;
        if (this.isTableSpawned) {
            // × cross icon
            const arm = 16;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy - arm); ctx.lineTo(cx + arm, cy + arm);
            ctx.moveTo(cx + arm, cy - arm); ctx.lineTo(cx - arm, cy + arm);
            ctx.stroke();
        } else {
            // 3-fold map icon
            ctx.beginPath();
            // Left fold
            ctx.moveTo(cx - 16, cy - 12);
            ctx.lineTo(cx - 6, cy - 18);
            ctx.lineTo(cx - 6, cy + 10);
            ctx.lineTo(cx - 16, cy + 16);
            ctx.closePath();

            // Middle fold
            ctx.moveTo(cx - 6, cy - 18);
            ctx.lineTo(cx + 6, cy - 12);
            ctx.lineTo(cx + 6, cy + 16);
            ctx.lineTo(cx - 6, cy + 10);
            ctx.closePath();

            // Right fold
            ctx.moveTo(cx + 6, cy - 12);
            ctx.lineTo(cx + 16, cy - 18);
            ctx.lineTo(cx + 16, cy + 10);
            ctx.lineTo(cx + 6, cy + 16);
            ctx.closePath();

            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Progress arc — clockwise from 12 o'clock, outside the main ring
        if (isTouching && holdProgress > 0) {
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + Math.PI * 2 * holdProgress;
            // Dim track
            ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
            ctx.lineWidth = 6;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.arc(cx, cy, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
            ctx.stroke();
            // Filled arc
            ctx.strokeStyle = accentCss;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.shadowColor = accentGlow;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(cx, cy, 62, startAngle, endAngle);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        this.wristBtnTexture.needsUpdate = true;
    }

    private handleWristClose() {
        if (this.isTableSpawned) {
            // Close minimap
            this.isTableSpawned = false;
            this.targetTableScale = 0.0;
            this.isDomainActive = false;
            console.log('[WristBtn] Closed minimap table.');
        } else {
            // Open minimap in front of the user
            this.isTableSpawned = true;
            this.userTableScale = 1.0;
            this.lastLoggedScale = 1.0;
            this.isTwoHandScaling = false;
            this.targetTableScale = 1.0;
            this.tableGroup.visible = true;
            this.isRotatingMap = false;

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

            console.log('[WristBtn] Opened minimap table.');
        }

        // Re-draw the wrist button to reflect the new state immediately
        this.drawWristButton(0, false);
    }

    private drawQuitPopup(hoveredBtn: number) {
        const ctx = this.quitPopupCanvas.getContext('2d')!;
        const w = 256, h = 128;
        ctx.clearRect(0, 0, w, h);

        // Dark background
        ctx.fillStyle = 'rgba(10, 5, 20, 0.96)';
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 10);
        ctx.fill();

        // Red border glow
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Title
        ctx.fillStyle = '#fef2f2';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT XR?', w / 2, 28);

        // Divider
        ctx.strokeStyle = 'rgba(239,68,68,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, 38); ctx.lineTo(w - 16, 38);
        ctx.stroke();

        // YES button (left)
        const yesH = hoveredBtn === 0;
        ctx.fillStyle = yesH ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.15)';
        ctx.beginPath(); ctx.roundRect(16, 48, 96, 36, 8); ctx.fill();
        ctx.strokeStyle = yesH ? '#22c55e' : 'rgba(34,197,94,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(16, 48, 96, 36, 8); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.fillText('YES', 64, 71);

        // NO button (right)
        const noH = hoveredBtn === 1;
        ctx.fillStyle = noH ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.15)';
        ctx.beginPath(); ctx.roundRect(144, 48, 96, 36, 8); ctx.fill();
        ctx.strokeStyle = noH ? '#ef4444' : 'rgba(239,68,68,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(144, 48, 96, 36, 8); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText('NO', 192, 71);

        // Hint
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px monospace';
        ctx.fillText('poke YES or NO with right index finger', w / 2, 110);

        this.quitPopupTexture.needsUpdate = true;
    }
}
