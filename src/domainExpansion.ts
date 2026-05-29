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
    
    if (isMatch('field') || isMatch('grass')) {
        newMat.color.setHex(0x113e19);
        newMat.roughness = 0.85;
        newMat.metalness = 0.05;
    } else if (isMatch('pitch') || isMatch('wicket')) {
        newMat.color.setHex(0xc2a679);
        newMat.roughness = 0.9;
        newMat.metalness = 0.0;
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
    } else if (isMatch('boundary') || isMatch('rope')) {
        newMat.color.setHex(0x00ffff);
        newMat.emissive.setHex(0x008888);
        newMat.roughness = 0.2;
        newMat.metalness = 0.5;
    } else if (isMatch('floodlight') || isMatch('light')) {
        newMat.color.setHex(0x334155);
        newMat.roughness = 0.15;
        newMat.metalness = 0.9;
        newMat.emissive.setHex(0xffffff);
    } else if (isMatch('roof') || isMatch('top') || isMatch('canopy')) {
        newMat.color.setHex(0xe2e8f0);
        newMat.roughness = 0.3;
        newMat.metalness = 0.75;
        newMat.transparent = true;
        newMat.opacity = 0.92;
    } else {
        newMat.color.setHex(0x0f172a);
        newMat.roughness = 0.45;
        newMat.metalness = 0.55;
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
    private buttonPinchProgress: number[] = [0.0, 0.0, 0.0, 0.0];
    private scoreDisplayMeshes: THREE.Mesh[] = [];
    // Roof arc parameters (in table-local space)
    private readonly ROOF_Y = 0.095;      // Height of stadium roof rim
    private readonly ROOF_RADIUS = 0.096; // Radius of stadium inner roof arc

    // Physics Bouncing Simulation & Stadium Selection
    private currentStadiumType: 'default' | 'berlin' | 'inuit' = 'default';
    private berlinMesh: THREE.Mesh | null = null;
    private inuitMesh: THREE.Mesh | null = null;
    private ballVelocity = new THREE.Vector3(0.04, 0.03, 0.05);
    private lastBubbleSkinStadium: string = 'default'; // tracks which stadium the bubbles were last skinned for

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

        // Overhauled Table base: multi-tiered transparent glass cylinders for luxury depth
        const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 64);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0x030712, // Ultra-rich obsidian black
            transparent: true,
            opacity: 0.9,
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
        this.techRing1.position.y = 0.0015;
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
        this.techRing2.position.y = 0.0015;
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
        this.techRing3.position.y = 0.0015;
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
        ringMesh.position.y = 0.001;
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
        this.minimapMapPlane.position.y = 0.002;
        this.tableGroup.add(this.minimapMapPlane);

        // Draw realistic high-tech urban blueprint roadmap on a procedural canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Blueprint background
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, 512, 512);

        // Drawing detailed concentric radar rings
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        for (let r = 50; r < 256; r += 50) {
            ctx.beginPath();
            ctx.arc(256, 256, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw urban major highways/arterials (thick, glowing gray-cyan paths)
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
        ctx.lineWidth = 12;
        ctx.beginPath();
        // Ring road highway
        ctx.arc(256, 256, 140, 0, Math.PI * 2);
        // Main arterial cross-junction
        ctx.moveTo(256, 0); ctx.lineTo(256, 512);
        ctx.moveTo(0, 256); ctx.lineTo(512, 256);
        ctx.stroke();

        // Draw detailed inner lane markings on highways
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(256, 256, 140, 0, Math.PI * 2);
        ctx.moveTo(256, 0); ctx.lineTo(256, 512);
        ctx.moveTo(0, 256); ctx.lineTo(512, 256);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // Draw minor grid streets/lots (representing residential blocks)
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.12)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let offset = 40; offset < 256; offset += 32) {
            // Horizontal grid lines
            ctx.moveTo(0, 256 - offset); ctx.lineTo(512, 256 - offset);
            ctx.moveTo(0, 256 + offset); ctx.lineTo(512, 256 + offset);
            // Vertical grid lines
            ctx.moveTo(256 - offset, 0); ctx.lineTo(256 - offset, 512);
            ctx.moveTo(256 + offset, 0); ctx.lineTo(256 + offset, 512);
        }
        ctx.stroke();

        // Draw filled block building lots (futuristic blueprint shading on lots)
        ctx.fillStyle = 'rgba(0, 255, 255, 0.04)';
        for (let x = 60; x < 450; x += 32) {
            for (let y = 60; y < 450; y += 32) {
                // Avoid placing blocks on the main arterial highways
                if (Math.abs(x - 256) > 20 && Math.abs(y - 256) > 20 && Math.abs(Math.sqrt((x-256)**2 + (y-256)**2) - 140) > 15) {
                    ctx.fillRect(x + 4, y + 4, 24, 24);
                }
            }
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

            // Volumetric-style cyan SpotLight pointing directly at the central pitch removed as per request

            // Measure bounding box to scale it correctly to fit the map
            const box = new THREE.Box3().setFromObject(this.stadiumMesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            // We want the stadium to fit nicely inside the table, about 0.24m in diameter
            const maxDim = Math.max(size.x, size.z);
            this.stadiumBaseScale = 0.24 / (maxDim || 1.0);
            this.stadiumMesh.scale.setScalar(this.stadiumBaseScale);
            this.stadiumMesh.position.set(0, -0.002, 0);
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

        this.pinchProgresses = new Array(this.domainKeys.length).fill(0);
        this.hoverProgresses = new Array(this.domainKeys.length).fill(0);

        // --- Holographic Domain Expansion Selection Bubbles (Octagon arrangement on Edge Ring) ---
        const bubbleGeom = new THREE.SphereGeometry(0.035, 32, 16);
        const bubbleRingGeom = new THREE.RingGeometry(0.023, 0.027, 32);
        const loaderRingGeom = new THREE.RingGeometry(0.012, 0.015, 32);
        const nameTagGeom = new THREE.PlaneGeometry(0.08, 0.02);

        const totalDomains = this.domainKeys.length;
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
            const name = this.domainNames[i];
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
        
        // Initialize Ball Tracking & Interactive Sixes Buttons on the tactical deck
        this.initBallTracking();
        this.initTrackingButtons();

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

    private setStadiumType(stadiumType: 'default' | 'berlin' | 'inuit') {
        console.log(`[StadiumSelector] Switching stadium from ${this.currentStadiumType} to ${stadiumType}`);
        this.currentStadiumType = stadiumType;

        // ── Swap domain key/name tables for the new stadium ──────────────────
        if (stadiumType === 'berlin') {
            this.domainKeys  = [...this.DOMAIN_KEYS_BERLIN];
            this.domainNames = [...this.DOMAIN_NAMES_BERLIN];
        } else if (stadiumType === 'inuit') {
            this.domainKeys  = [...this.DOMAIN_KEYS_INUIT];
            this.domainNames = [...this.DOMAIN_NAMES_INUIT];
        } else {
            this.domainKeys  = [...this.DOMAIN_KEYS_DEFAULT];
            this.domainNames = [...this.DOMAIN_NAMES_DEFAULT];
        }

        // ── Re-skin selection bubbles with low-res thumbs ────────────────────
        const thumbKeys = stadiumType === 'berlin' ? this.THUMB_KEYS_BERLIN
                        : stadiumType === 'inuit'  ? this.THUMB_KEYS_INUIT
                        : this.THUMB_KEYS_DEFAULT;

        this.selectionBubbles.forEach((bubble, idx) => {
            const tKey = thumbKeys[idx] ?? thumbKeys[0];
            const bMat = this.bubbleMats[idx] as THREE.MeshStandardMaterial;
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

        // 2. Lazily create new meshes if they don't exist yet
        if (stadiumType === 'berlin' && !this.berlinMesh) {
            const berlinGroup = new THREE.Group();
            
            // Hollow Cylinder wall (openEnded: true)
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

            // Top neon ring
            const topRingGeo = new THREE.TorusGeometry(0.096, 0.0012, 8, 64);
            topRingGeo.rotateX(Math.PI / 2);
            topRingGeo.translate(0, 0.095, 0);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 });
            const topRing = new THREE.Mesh(topRingGeo, ringMat);
            berlinGroup.add(topRing);

            // Bottom neon ring
            const bottomRingGeo = new THREE.TorusGeometry(0.096, 0.0012, 8, 64);
            bottomRingGeo.rotateX(Math.PI / 2);
            bottomRingGeo.translate(0, 0.002, 0);
            const bottomRing = new THREE.Mesh(bottomRingGeo, ringMat);
            berlinGroup.add(bottomRing);

            // Grid floor
            const floorGeo = new THREE.PlaneGeometry(0.192, 0.192);
            floorGeo.rotateX(-Math.PI / 2);
            const floorMat = new THREE.MeshBasicMaterial({
                color: 0x051525,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.position.y = 0.001;
            berlinGroup.add(floorMesh);

            const gridHelper = new THREE.GridHelper(0.192, 10, 0x22d3ee, 0x114466);
            gridHelper.position.y = 0.0015;
            berlinGroup.add(gridHelper);

            this.berlinMesh = berlinGroup as any;
            this.tableGroup.add(this.berlinMesh!);
        }

        if (stadiumType === 'inuit' && !this.inuitMesh) {
            const inuitGroup = new THREE.Group();

            // Extruded Elliptical Wall (oval cross-section tube)
            const segments = 64;
            const height = 0.095;
            const a = 0.11;
            const b = 0.07;
            const inuitGeo = new THREE.BufferGeometry();
            const vertices: number[] = [];
            const indices: number[] = [];
            const uvs: number[] = [];

            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * 2 * Math.PI;
                const x = a * Math.cos(theta);
                const z = b * Math.sin(theta);
                
                // Bottom vertex
                vertices.push(x, 0.002, z);
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

            // Bottom neon ring
            const bottomPoints: THREE.Vector3[] = [];
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * 2 * Math.PI;
                bottomPoints.push(new THREE.Vector3(a * Math.cos(theta), 0.002, b * Math.sin(theta)));
            }
            const bottomRingGeo = new THREE.BufferGeometry().setFromPoints(bottomPoints);
            const bottomRing = new THREE.Line(bottomRingGeo, ringMat);
            inuitGroup.add(bottomRing);

            // Grid floor
            const floorGeo = new THREE.PlaneGeometry(0.22, 0.14);
            floorGeo.rotateX(-Math.PI / 2);
            const floorMat = new THREE.MeshBasicMaterial({
                color: 0x1a0d02,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.position.y = 0.001;
            inuitGroup.add(floorMesh);

            const gridHelper = new THREE.GridHelper(0.22, 10, 0xf97316, 0x663311);
            gridHelper.position.y = 0.0015;
            inuitGroup.add(gridHelper);

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
        
        // Assign color based on stadium
        const colors = { default: 0xff6600, berlin: 0x22d3ee, inuit: 0xf97316 };
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
            const newLabel = stadiumType === 'berlin' ? 'OLYMPIASTADION' : stadiumType === 'inuit' ? 'CRYPTO.COM ARENA' : 'WANKHEDE STADIUM';
            
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
    }

    update(dt: number) {
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
            // Float up and down gently around Y = 0.115
            const yOffset = 0.115 + Math.sin(this.arFloatTime * 2.5) * 0.006;
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

            const isScalingAbove2m = this.currentTableScale > 3.33;

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
                if (triggerSimulation) {
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
                p.group.position.lerp(p.targetPos, dt * 1.5);
                p.currentPos.copy(p.group.position);

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

                // Scaling activation check: only load player tags and player markers when scaling is above 2 meters (table scale > 3.33)
                const isScalingAbove2m = this.currentTableScale > 3.33;
                
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
                
                // Scale up hovered player
                let isHovered = false;
                if (isScalingAbove2m) {
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
                
                // 2. Smoothly fade in/out and scale the player name tag
                // Only batsmen get persistent name tags; other roles only show on hover
                const tagMat = p.tag.material as THREE.MeshBasicMaterial;
                let targetOpacityTag = 0.0;
                let targetTagScale = 0.0;
                
                if (isScalingAbove2m) {
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
                        
                        // strictly clamped from 1.0 (base 0.60m diameter) up to 5.0 (3.0m maximum diameter)
                        this.userTableScale = THREE.MathUtils.clamp(targetUserScale, 1.0, 5.0);
                        
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

            for (let i = 0; i < this.domainKeys.length; i++) {
                const bubble = this.selectionBubbles[i];
                const bMat = this.bubbleMats[i];
                const ring = this.anchorRings[i];
                const rMat = ring.material as THREE.MeshBasicMaterial;
                const loader = this.loaderRings[i];
                const lMat = loader.material as THREE.MeshBasicMaterial;
                const nameTag = this.nameTags[i];

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
            // At scale <= 1.8, fully visible. At scale >= 3.0, completely invisible.
            const fadeFactor = THREE.MathUtils.clamp(
                THREE.MathUtils.mapLinear(this.currentTableScale, 1.8, 3.0, 1.0, 0.0),
                0.0,
                1.0
            );

            const targetPinOpacity = 0.9 * fadeFactor;
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

            // Scale-gated fade-out for AR TV Billboard: vanishes smoothly as we scale the stadium up
            if (this.arBillboard) {
                this.arBillboard.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const mat = child.material as THREE.Material;
                        if (mat && mat.transparent) {
                            const defOpacity = child.userData.defaultOpacity ?? 0.8;
                            const targetOpacity = defOpacity * fadeFactor;
                            mat.opacity += (targetOpacity - mat.opacity) * dt * 8.0;
                        }
                    }
                });
                
                // Hide/show the billboard entirely based on opacity to save draw calls
                if (this.arBillboard.children[1] instanceof THREE.Mesh) {
                    const firstMat = this.arBillboard.children[1].material as THREE.Material;
                    this.arBillboard.visible = firstMat.opacity > 0.01;
                }
            }

            // 7. Holographic Close "X" Button Billboard & Poke check
            if (this.isDomainActive) {
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
            // Buttons now use index-finger hover — pass index tip positions
            this.updateTrackingButtons(
                leftIndexPinchPos,
                rightIndexPinchPos,
                hasLeftIndex,
                hasRightIndex,
                dt
            );
        } else {
            // Table is closed: hide close button instantly
            this.xButton.visible = false;
            this.xButton.scale.setScalar(0.01);
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
        this.arBillboard.position.set(0, 0.115, 0); 

        const bannerGeom = new THREE.PlaneGeometry(0.18, 0.1146);
        const bannerMat = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const banner = new THREE.Mesh(bannerGeom, bannerMat);
        banner.userData.defaultOpacity = 1.0;
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

        // Define precise local path coordinates on the mini Wankhede wicket pitch
        const points: THREE.Vector3[] = [];
        
        if (pathType === 'SIX') {
            points.push(new THREE.Vector3(0.0, 0.02, -0.045));    // Bowler crease release
            points.push(new THREE.Vector3(0.0, 0.001, 0.015));   // Center bounce coordinate
            points.push(new THREE.Vector3(0.0, 0.016, 0.038));   // Strike zone contact
            points.push(new THREE.Vector3(0.03, 0.05, 0.065));   // Sky rise arc
            points.push(new THREE.Vector3(0.06, 0.075, 0.09));   // High peak over stand canopy
            points.push(new THREE.Vector3(0.08, 0.045, 0.11));   // Landing in stands
        } else if (pathType === 'WICKET') {
            points.push(new THREE.Vector3(0.002, 0.02, -0.045)); // Release slightly off-center
            points.push(new THREE.Vector3(-0.001, 0.001, 0.018));// Bounce close to crease
            points.push(new THREE.Vector3(-0.002, 0.012, 0.042));// Directly striking stumps!
            points.push(new THREE.Vector3(-0.004, 0.002, 0.048));// Bumping away
        } else { // DOT
            points.push(new THREE.Vector3(-0.002, 0.02, -0.045));
            points.push(new THREE.Vector3(0.001, 0.001, 0.014));
            points.push(new THREE.Vector3(0.003, 0.015, 0.038)); // Swing & miss
            points.push(new THREE.Vector3(0.004, 0.02, 0.047));  // Safely caught by keeper
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
            { id: "b1", name: "Y. Jaiswal",   role: "batsman", jersey: "1",  team: "yellow", x:  0.013, z:  0.000, primary: "Runs: 68* (42)",       secondary: "SR: 161.9",        rcbCardKey: "" },
            { id: "b2", name: "S. Samson",    role: "batsman", jersey: "13", team: "yellow", x: -0.013, z:  0.000, primary: "Runs: 31 (20)",        secondary: "SR: 155.0",        rcbCardKey: "" },
            // ── Umpires ─────────────────────────────────────────────────────
            { id: "u1", name: "M. Erasmus",   role: "umpire",  jersey: "U1", team: "neutral", x: -0.020, z:  0.000, primary: "Umpire (Bowler's)",   secondary: "Decisions: 100%",  rcbCardKey: "" },
            { id: "u2", name: "N. Llong",     role: "umpire",  jersey: "U2", team: "neutral", x:  0.013, z:  0.020, primary: "Umpire (Sq. Leg)",    secondary: "Decisions: 100%",  rcbCardKey: "" },
            // ── Fielding: Royal Challengers Bengaluru (Blue) ────────────────
            { id: "f1",  name: "J. Cox",        role: "fielder", jersey: "60", team: "blue", x:  0.018, z:  0.000, primary: "Catches: 1, St: 0",    secondary: "Wicketkeeper",      rcbCardKey: "rcbJordanCox"  },
            { id: "f2",  name: "B. Kumar",      role: "fielder", jersey: "15", team: "blue", x: -0.028, z:  0.000, primary: "Overs: 3.2-0-22-2",   secondary: "Active: Bowler",    rcbCardKey: "rcbBhuvi"      },
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
            // Goalkeeper
            { id: "gk", name: "M. Neuer",      role: "fielder", jersey: "1",  team: "blue",   x:  0.000, z: -0.090, primary: "Saves: 3 / 5",        secondary: "GK — Penalty Box",  rcbCardKey: "" },
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
          : rosterCricket;

        // ── Shared Phong materials (created ONCE per team — not 22× per player) ───────
        // This alone cuts shader compilations from 220 → 24 and avoids redundant GPU uploads
        const mk = (col: number, shine: number, emissiveHex = 0x000000) =>
            new THREE.MeshPhongMaterial({ color: col, shininess: shine,
                emissive: new THREE.Color(emissiveHex) });

        const sharedMats = {
            blue:    {
                body:   mk(0xcc1111, 55, 0x1e0000),
                sec:    mk(0xd4a017, 80, 0x100a00),
                pants:  mk(0x1a1a2e, 28),
                accent: mk(0xff4444, 60, 0x180000),
            },
            yellow:  {
                body:   mk(0xd90f55, 55, 0x1a0010),
                sec:    mk(0x1565c0, 80, 0x000a14),
                pants:  mk(0xf0f0f0, 28),
                accent: mk(0x64b5f6, 60, 0x001020),
            },
            neutral: {
                body:   mk(0x1e88e5, 55, 0x001220),
                sec:    mk(0x263238, 60),
                pants:  mk(0x0d1117, 28),
                accent: mk(0x90caf9, 50, 0x001020),
            },
        };
        const sharedSkin  = mk(0xf5c5a3, 20);
        const sharedBlack = mk(0x1a1a2e, 15);
        const sharedWood  = mk(0xb5823a, 40, 0x080300);
        const sharedMetal = mk(0x455a64, 130);
        const sharedPad   = mk(0xfafafa, 50);
        const sharedLedMats = {
            blue:    new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: new THREE.Color(0xffd700).multiplyScalar(0.85), shininess: 200 }),
            yellow:  new THREE.MeshPhongMaterial({ color: 0x00e5ff, emissive: new THREE.Color(0x00e5ff).multiplyScalar(0.85), shininess: 200 }),
            neutral: new THREE.MeshPhongMaterial({ color: 0xe0f7fa, emissive: new THREE.Color(0xe0f7fa).multiplyScalar(0.5),  shininess: 200 }),
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
        const gHead     = new THREE.SphereGeometry(H_HEAD * 0.78, 8, 7);
        const gHelmet   = new THREE.SphereGeometry(H_HEAD * 0.86, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.58);
        const gBrim     = new THREE.CylinderGeometry(H_HEAD * 0.94, H_HEAD * 0.94, 0.00006, 10, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
        const gGrill    = new THREE.CylinderGeometry(0.000048, 0.000048, H_HEAD, 4);
        const gVisor    = new THREE.BoxGeometry(H_HEAD * 1.4, H_HEAD * 0.22, H_HEAD * 0.18);
        const gShoulder = new THREE.BoxGeometry(W_TORSO * 1.1, H_TORSO * 0.16, W_TORSO * 0.8);
        const gUArm     = (() => { const g = new THREE.CylinderGeometry(0.000325, 0.00026, UA_H, 6); g.translate(0, -UA_H / 2, 0); return g; })();
        const gFArm     = (() => { const g = new THREE.CylinderGeometry(0.00024, 0.00019, FA_H, 5); g.translate(0, -FA_H / 2, 0); return g; })();
        const gThigh    = (() => { const g = new THREE.CylinderGeometry(0.000425, 0.00036, THIGH_H, 6); g.translate(0, -THIGH_H / 2, 0); return g; })();
        const gShin     = (() => { const g = new THREE.CylinderGeometry(0.00034, 0.00024, SHIN_H, 5);  g.translate(0, -SHIN_H / 2, 0);  return g; })();
        const gShoe     = new THREE.BoxGeometry(0.0004, 0.00019, 0.00065);
        const gPad      = new THREE.BoxGeometry(0.00045, SHIN_H * 0.88, 0.000275);
        const gRing     = (() => { const g = new THREE.RingGeometry(0.0018, 0.0026, 16); g.rotateX(-Math.PI / 2); return g; })();

        roster.forEach((p, idx) => {
            const team  = p.team as 'blue' | 'yellow' | 'neutral';
            const mats  = sharedMats[team];
            const ledM  = sharedLedMats[team];

            const playerGroup = new THREE.Group();
            this.tableGroup.add(playerGroup);

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

            // LED visor (emissive stripe)
            const visorMesh = new THREE.Mesh(gVisor, ledM);
            visorMesh.position.set(0, headY + H_HEAD * 0.08, H_HEAD * 0.75);
            mesh.add(visorMesh);

            // ── Shoulder pads ─────────────────────────────────────────────────────────
            const padW = W_TORSO * 1.1;
            [-(W_TORSO + padW * 0.42), (W_TORSO + padW * 0.42)].forEach(ox => {
                const s = new THREE.Mesh(gShoulder, mats.sec);
                s.position.set(ox, H_TORSO * 0.85, 0);
                mesh.add(s);
            });

            // ── Arms (upper + forearm) ─────────────────────────────────────────────────
            const lArmMesh = new THREE.Mesh(gUArm, mats.body);
            lArmMesh.position.set(-(W_TORSO + 0.0003), H_TORSO * 0.82, 0);
            mesh.add(lArmMesh);
            const rArmMesh = new THREE.Mesh(gUArm, mats.body);
            rArmMesh.position.set( (W_TORSO + 0.0003), H_TORSO * 0.82, 0);
            mesh.add(rArmMesh);

            const lFArm = new THREE.Mesh(gFArm, sharedSkin);
            lFArm.position.y = -UA_H;
            lArmMesh.add(lFArm);
            const rFArm = new THREE.Mesh(gFArm, sharedSkin);
            rFArm.position.y = -UA_H;
            rArmMesh.add(rFArm);

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

            // ── Role-specific extras & poses ─────────────────────────────────────────
            if (p.role === 'batsman') {
                // Leg pads
                [lShin, rShin].forEach(sh => {
                    const lp = new THREE.Mesh(gPad, sharedPad);
                    lp.position.set(0, -SHIN_H * 0.45, 0.000275);
                    sh.add(lp);
                });
                // Bat (blade + grip)
                const bladeG = new THREE.BoxGeometry(0.000325, 0.0029, 0.00013);
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
                lArmMesh.rotation.set(-Math.PI / 6,  0,  Math.PI / 5);
                rArmMesh.rotation.set(-Math.PI / 4,  0, -Math.PI / 5);
                lLegMesh.rotation.set( Math.PI / 9,  0, -Math.PI / 14);
                rLegMesh.rotation.set( Math.PI / 9,  0,  Math.PI / 14);
            } else if (p.role === 'fielder') {
                lArmMesh.rotation.set(-Math.PI / 5,  0,  Math.PI / 7);
                rArmMesh.rotation.set(-Math.PI / 5,  0, -Math.PI / 7);
                lLegMesh.rotation.set( Math.PI / 11, 0, -Math.PI / 13);
                rLegMesh.rotation.set( Math.PI / 11, 0,  Math.PI / 13);
            } else {
                lArmMesh.rotation.set( Math.PI / 8,  0, -Math.PI / 9);
                rArmMesh.rotation.set( Math.PI / 8,  0,  Math.PI / 9);
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
    }

    private initTrackingButtons() {
        // ─── Stadium Roof Arc – SixHoloview Buttons ───────────────────────────
        // 4 action buttons curved along the inner roof rim of the stadium.
        // The arc spans ~110° centred on the "back" of the stadium (angle = -Math.PI/2 = top of map).
        // Buttons face inward (toward pitch centre) so the user can read them from above.
        const buttonInfo = [
            { label: "SIX: KOHLI",  color: 0xff6600 },
            { label: "SIX: SHARMA", color: 0xffff00 },
            { label: "SIX: SCOOP",  color: 0x00ff66 },
            { label: "CLEAR",       color: 0xff3333 }
        ];

        const numButtons = buttonInfo.length;
        // Arc spans 110°, centred at angle 0 (positive-Z axis of the table)
        const arcSpan    = Math.PI * (110 / 180);
        const arcCenter  = 0; // face the front of the stadium
        const arcStart   = arcCenter - arcSpan / 2;
        const arcStep    = arcSpan / (numButtons - 1);

        // Thin curved button geometry (flat box, small depth)
        const btnGeom = new THREE.BoxGeometry(0.022, 0.004, 0.008);

        buttonInfo.forEach((b, i) => {
            const angle = arcStart + i * arcStep;

            // Place on roof rim, pointing inward
            const bx = Math.sin(angle) * this.ROOF_RADIUS;
            const bz = Math.cos(angle) * this.ROOF_RADIUS;

            const btnGroup = new THREE.Group();
            btnGroup.position.set(bx, this.ROOF_Y, bz);
            // Rotate the group so the button faces the centre (inward)
            btnGroup.rotation.y = angle + Math.PI; // face pitch centre
            this.tableGroup.add(btnGroup);

            // Glowing glass plate
            const bMat = new THREE.MeshBasicMaterial({
                color: b.color,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            });
            const btnMesh = new THREE.Mesh(btnGeom, bMat);
            btnGroup.add(btnMesh);
            this.trackingButtons.push(btnMesh);
            this.buttonMats.push(bMat);

            // Canvas Text Label rendered on the outward face of the button
            const canvas = document.createElement('canvas');
            canvas.width = 192;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, 192, 64);

            ctx.fillStyle = 'rgba(3, 3, 15, 0.92)';
            ctx.fillRect(0, 0, 192, 64);

            const hexStr = b.color === 0xff6600 ? '#ff6600' :
                           b.color === 0xffff00 ? '#ffff00' :
                           b.color === 0x00ff66 ? '#00ff66' : '#ff3333';
            ctx.strokeStyle = hexStr;
            ctx.lineWidth = 5;
            ctx.strokeRect(3, 3, 186, 58);

            ctx.shadowColor = hexStr;
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.label, 96, 32);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;

            // Label panel sits just inside the button, tilted slightly outward for readability
            const labelGeom = new THREE.PlaneGeometry(0.022, 0.007);
            const labelMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const labelMesh = new THREE.Mesh(labelGeom, labelMat);
            // Float label 8mm above button on the same plane
            labelMesh.position.set(0, 0.008, 0);
            btnGroup.add(labelMesh);
            this.buttonLabels.push(labelMesh);
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
            const FLOOR_Y  = 0.009;
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
            if (this.activeBall.position.y <= FLOOR_Y) {
                this.activeBall.position.y = FLOOR_Y;
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
        const speed = 0.36; // 1.0 / 2.8s
        this.ballAnimT += dt * speed;

        if (this.ballAnimT >= 1.0) {
            this.ballAnimT = 0.0;
            this.trailPoints = []; // Reset trail for next loop
        }

        const t = this.ballAnimT;

        // Calculate positions
        let start = new THREE.Vector3();
        let hitPos = new THREE.Vector3();
        let landing = new THREE.Vector3();
        let ballPos = new THREE.Vector3();

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

        // Set active ball position
        this.activeBall.position.copy(ballPos);

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
        const btnWorldPos = new THREE.Vector3();

        for (let i = 0; i < this.trackingButtons.length; i++) {
            const btn = this.trackingButtons[i];
            btn.getWorldPosition(btnWorldPos);

            let distToLeft  = Infinity;
            let distToRight = Infinity;
            if (hasLeft)  distToLeft  = leftIndexPos.distanceTo(btnWorldPos);
            if (hasRight) distToRight = rightIndexPos.distanceTo(btnWorldPos);

            // Hover threshold: index finger tip within 2.5 cm of the button
            const isHovered = distToLeft < 0.025 || distToRight < 0.025;

            // Glow feedback — brighter when hovered
            const targetOpacity = isHovered ? 0.97 : 0.55;
            this.buttonMats[i].opacity += (targetOpacity - this.buttonMats[i].opacity) * 10.0 * dt;

            if (isHovered) {
                // Accumulate hover dwell time (2-second hold to activate)
                this.buttonPinchProgress[i] += dt;
                if (this.buttonPinchProgress[i] > 2.0) {
                    this.buttonPinchProgress[i] = 2.0;
                }

                const chargeRatio = this.buttonPinchProgress[i] / 2.0;

                // Vertical stretch as charge indicator
                btn.scale.y = 1.0 + chargeRatio * 2.5;
                // Micro-vibration energy feedback
                btn.position.y = Math.sin(this.radarTime * 60.0) * 0.001 * chargeRatio;

                if (this.buttonPinchProgress[i] >= 2.0 && this.menuToggleCooldown <= 0.0) {
                    this.menuToggleCooldown = 0.8;
                    this.buttonPinchProgress[i] = 0.0;

                    // Squeeze shockwave click feedback
                    btn.scale.set(1.2, 0.4, 1.2);
                    this.triggerSixAnimation(i);
                }
            } else {
                // Drain dwell time when finger moves away
                this.buttonPinchProgress[i] -= dt * 2.0;
                if (this.buttonPinchProgress[i] < 0.0) {
                    this.buttonPinchProgress[i] = 0.0;
                }

                // Restore default button geometry
                btn.scale.y += (1.0 - btn.scale.y) * 10.0 * dt;
                btn.scale.x += (1.0 - btn.scale.x) * 10.0 * dt;
                btn.scale.z += (1.0 - btn.scale.z) * 10.0 * dt;
                btn.position.y += (0.0 - btn.position.y) * 10.0 * dt;
            }
        }
    }
}
