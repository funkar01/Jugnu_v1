import { createSystem, AssetManager } from "@iwsdk/core";
import * as THREE from "three";
import { Jugnu } from "./jugnu.js";

// Fast 3D Value Noise for the warp shader
const noiseShader = `
float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

export class DomainExpansionSystem extends createSystem({
    jugnu: { required: [Jugnu] }
}) {
    private isDomainExpansionTriggered = false;
    private state: 'None' | 'UI' | 'Bleed' | 'Exit' = 'None';
    private uiTimer = 0;
    private exitTimer = 0;

    private uiMesh!: THREE.Mesh;
    private domainMesh!: THREE.Mesh;
    private bleedProgress = 0.0;
    private customMaterial!: THREE.ShaderMaterial;
    private initSphere!: THREE.Mesh;

    // Joint positions
    private leftTip = new THREE.Vector3();
    private rightTip = new THREE.Vector3();

    // Debug visuals
    private leftDebugSphere!: THREE.Mesh;
    private rightDebugSphere!: THREE.Mesh;

    private debugXPressed = false;
    private debugYPressed = false;
    private debugMPressed = false;
    private debugPPressed = false; // Key for desktop simulation of pinch
    
    private domainKeys = ["domainEnv", "domainEnv1", "domainEnv2", "domainEnv3"];
    private coords = [
        { lat: 35.6595, lng: 139.7006 }, // Shibuya, Tokyo
        { lat: 40.7580, lng: -73.9855 }, // Times Square, New York
        { lat: 48.8584, lng: 2.2945 },   // Eiffel Tower, Paris
        { lat: 41.8902, lng: 12.4922 }   // Colosseum, Rome
    ];
    private currentDomainIndex = 0;
    private switchCooldown = 0;
    private switchState: 'None' | 'Out' | 'In' = 'None';
    private switchProgress = 1.0;

    private isMenuOpen = false;
    private menuMesh!: THREE.Mesh;
    private wristButtonMesh!: THREE.Mesh;
    private wristPos = new THREE.Vector3();
    private leftWristQuat = new THREE.Quaternion();
    private menuToggleCooldown = 0;

    // --- Minimap & Circular Floating Table ---
    private tableGroup!: THREE.Group;
    private tableBase!: THREE.Mesh;
    private minimapBuildings!: THREE.InstancedMesh;
    private minimapTraffic: { mesh: THREE.Mesh; angle: number; radius: number; speed: number }[] = [];
    private radarRing!: THREE.Mesh;
    private radarTime = 0;
    private locationPin!: THREE.Group;
    private minimapMapPlane!: THREE.Mesh;
    private minimapMapPlaneMat!: THREE.MeshBasicMaterial;
    
    // Scale tracking for table & menu animations
    private isTableSpawned = false;
    private targetTableScale = 0.0;
    private currentTableScale = 0.0;
    
    // Menu category tab and rendering fields
    private activeTab: 'genai' | 'maps' = 'genai';
    private menuCanvas!: HTMLCanvasElement;
    private menuCtx!: CanvasRenderingContext2D;
    private menuTex!: THREE.CanvasTexture;

    // Menu scaling / proximity fields
    private menuActiveState = true; // True if not toggled closed by middle pinch
    private targetMenuScale = 0.0;
    private currentMenuScale = 0.0;
    private proximityThreshold = 0.25; // 25cm to expand
    
    // Middle pinch gesture state
    private wasMiddlePinchingLeft = false;
    private wasMiddlePinchingRight = false;
    private middlePinchCooldown = 0;

    init() {
        // --- Debug Keyboard Listener for Desktop ---
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'x') this.debugXPressed = true;
            if (e.key.toLowerCase() === 'y') this.debugYPressed = true;
            if (e.key.toLowerCase() === 'm') this.debugMPressed = true;
            if (e.key.toLowerCase() === 'p') this.debugPPressed = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'x') this.debugXPressed = false;
            if (e.key.toLowerCase() === 'y') this.debugYPressed = false;
            if (e.key.toLowerCase() === 'm') this.debugMPressed = false;
            if (e.key.toLowerCase() === 'p') this.debugPPressed = false;
        });

        // --- Phase 2: High-Performance Spatial UI ---
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;

        // Glass panel background
        ctx.fillStyle = 'rgba(15, 15, 18, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, 492, 236, 24);
        ctx.fill();
        ctx.stroke();

        // Text Shadow/Glow for modern aesthetic
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.font = '300 32px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("DOMAIN EXPANSION", 256, 75);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '400 16px system-ui, -apple-system, sans-serif';
        ctx.fillText("Initialize spatial warp?", 256, 105);

        // Sleek Rounded Buttons
        const drawButton = (x: number, y: number, w: number, h: number, text: string, color: string) => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 16);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = '600 20px system-ui, -apple-system, sans-serif';
            ctx.fillText(text, x + w / 2, y + h / 2 + 6);
        };

        drawButton(80, 140, 150, 60, "INITIALIZE", "rgba(100, 255, 255, 0.9)");
        drawButton(282, 140, 150, 60, "ABORT", "rgba(255, 100, 120, 0.9)");

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;

        const uiMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        this.uiMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), uiMat);
        this.uiMesh.visible = false;

        this.world.createTransformEntity(this.uiMesh);

        // --- Debug Spheres for Index Fingers ---
        this.leftDebugSphere = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this.rightDebugSphere = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
        this.leftDebugSphere.visible = false;
        this.rightDebugSphere.visible = false;
        this.world.createTransformEntity(this.leftDebugSphere);
        this.world.createTransformEntity(this.rightDebugSphere);

        // --- Phase 3: HDRI Loading & The Warp Bleed Transition ---
        const sphereGeom = new THREE.SphereGeometry(500, 60, 40);
        // Do not scale(-1, 1, 1) because THREE.BackSide handles rendering the inside correctly.

        const envTexture = AssetManager.getTexture("domainEnv");
        if (envTexture) {
            envTexture.colorSpace = THREE.SRGBColorSpace;
            envTexture.mapping = THREE.EquirectangularReflectionMapping;
        }

        this.customMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_texture: { value: envTexture },
                u_bleedProgress: { value: 0.0 },
                u_time: { value: 0.0 }
            },
            vertexShader: `
                uniform float u_bleedProgress;
                uniform float u_time;
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    
                    // Warp effect
                    float distortion = sin(worldPosition.y * 0.5 + u_time * 5.0) * 10.0;
                    // Ease out distortion as progress reaches 1.0
                    float warpAmt = (1.0 - u_bleedProgress) * distortion * step(0.01, u_bleedProgress);
                    
                    vec3 pos = position + normal * warpAmt;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                ${noiseShader}
                
                uniform sampler2D u_texture;
                uniform float u_bleedProgress;
                uniform float u_time;
                
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                
                void main() {
                    float n = noise(vWorldPosition * 0.5 + u_time * 0.5);
                    // noise ranges 0..1
                    
                    if (n + u_bleedProgress < 1.0) {
                        discard; // reveal AR passthrough
                    }
                    
                    vec4 texColor = texture2D(u_texture, vUv);
                    
                    // Add glowing edge where it bleeds
                    float edge = smoothstep(1.0, 1.05, n + u_bleedProgress);
                    vec3 glowColor = vec3(0.0, 1.0, 1.0) * (1.0 - edge) * 2.0;
                    
                    gl_FragColor = vec4(texColor.rgb + glowColor, 1.0);
                }
            `,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false
        });

        this.domainMesh = new THREE.Mesh(sphereGeom, this.customMaterial);
        this.domainMesh.visible = false;
        this.world.createTransformEntity(this.domainMesh);

        // --- Init Sphere ---
        const initSphereGeom = new THREE.SphereGeometry(20.0, 32, 16); // Scaled 10x
        const initSphereTex = AssetManager.getTexture(this.domainKeys[this.currentDomainIndex]) || new THREE.Texture();
        initSphereTex.colorSpace = THREE.SRGBColorSpace;
        const initSphereMat = new THREE.ShaderMaterial({
            uniforms: {
                u_texture: { value: initSphereTex },
                u_progress: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D u_texture;
                uniform float u_progress;
                varying vec2 vUv;
                
                void main() {
                    vec4 texColor = texture2D(u_texture, vUv);
                    
                    // Equator is at vUv.y == 0.5. Distance from equator: 0.0 to 0.5
                    float distFromEquator = abs(vUv.y - 0.5);
                    
                    // Fade-in spread threshold based on u_progress (0.0 to 1.0)
                    // We go slightly above 0.5 to ensure the poles are fully covered at the end
                    float threshold = u_progress * 0.55; 
                    
                    // Smoothstep creates a soft edge transition
                    float alpha = smoothstep(threshold + 0.1, threshold - 0.1, distFromEquator);
                    
                    gl_FragColor = vec4(texColor.rgb, texColor.a * alpha * 0.9);
                }
            `,
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.initSphere = new THREE.Mesh(initSphereGeom, initSphereMat);
        this.initSphere.renderOrder = -99; // Render before other transparent objects to fix overlapping
        this.initSphere.visible = false;
        this.world.createTransformEntity(this.initSphere);

        // --- Wrist Button Mesh ---
        const wristBtnGeom = new THREE.CylinderGeometry(0.0127, 0.0127, 0.005, 32); // 1 inch diameter
        wristBtnGeom.rotateX(Math.PI / 2);
        const wristBtnMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
        this.wristButtonMesh = new THREE.Mesh(wristBtnGeom, wristBtnMat);
        this.wristButtonMesh.visible = false;
        this.world.createTransformEntity(this.wristButtonMesh);

        // --- Domain Menu UI Mesh ---
        this.menuCanvas = document.createElement('canvas');
        this.menuCanvas.width = 1024;
        this.menuCanvas.height = 256;
        this.menuCtx = this.menuCanvas.getContext('2d')!;
        
        this.menuTex = new THREE.CanvasTexture(this.menuCanvas);
        this.menuTex.colorSpace = THREE.SRGBColorSpace;
        
        // Render initial dynamic tabs and thumbnails
        this.redrawMenuCanvas();

        const loadThumbnails = async () => {
            this.redrawMenuCanvas();
        };
        setTimeout(loadThumbnails, 1000);

        const menuGeom = new THREE.PlaneGeometry(1.0, 0.25);
        const menuMat = new THREE.MeshBasicMaterial({ map: this.menuTex, transparent: true, side: THREE.DoubleSide, depthTest: false });
        this.menuMesh = new THREE.Mesh(menuGeom, menuMat);
        this.menuMesh.renderOrder = 99;
        this.menuMesh.visible = false;
        
        // --- Circular Floating Table & Minimap ---
        this.tableGroup = new THREE.Group();
        this.tableGroup.scale.setScalar(0.0);
        this.tableGroup.visible = false;

        // Table base: flat transparent glass cylinder
        const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 64);
        const baseMat = new THREE.MeshPhysicalMaterial({
            color: 0x050515,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.85,
            transmission: 0.6,
            side: THREE.DoubleSide
        });
        this.tableBase = new THREE.Mesh(baseGeom, baseMat);
        this.tableBase.position.y = -0.005;
        this.tableGroup.add(this.tableBase);

        // Glowing outer neon ring
        const ringGeom = new THREE.RingGeometry(0.195, 0.2, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.001;
        this.tableGroup.add(ringMesh);

        // Holographic Minimap Grid (Circular Polar Grid Helper)
        const gridHelper = new THREE.PolarGridHelper(0.18, 16, 6, 64, 0x00ffff, 0x004488);
        gridHelper.position.y = 0.001;
        if (gridHelper.material instanceof THREE.Material) {
            gridHelper.material.transparent = true;
            gridHelper.material.opacity = 0.45;
        }
        this.tableGroup.add(gridHelper);

        // Interactive Radar scanning ring
        const radarGeom = new THREE.RingGeometry(0, 0.19, 64);
        const radarMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.15
        });
        this.radarRing = new THREE.Mesh(radarGeom, radarMat);
        this.radarRing.rotation.x = -Math.PI / 2;
        this.radarRing.position.y = 0.0015;
        this.tableGroup.add(this.radarRing);

        // Procedural Holographic Buildings using InstancedMesh
        const numBldgs = 40;
        const bldgGeom = new THREE.BoxGeometry(1, 1, 1);
        bldgGeom.translate(0, 0.5, 0); // Origin at bottom
        const bldgMat = new THREE.MeshPhysicalMaterial({
            color: 0x00ffff,
            emissive: 0x003366,
            metalness: 0.5,
            roughness: 0.2,
            transparent: true,
            opacity: 0.65,
            transmission: 0.3
        });
        this.minimapBuildings = new THREE.InstancedMesh(bldgGeom, bldgMat, numBldgs);
        const dummy = new THREE.Object3D();
        const bColors = new THREE.Color();
        const bData = [];
        const tableRadius = 0.18;

        for (let i = 0; i < numBldgs; i++) {
            const r = Math.random() * (tableRadius - 0.02);
            const theta = Math.random() * Math.PI * 2;
            const bx = r * Math.cos(theta);
            const bz = r * Math.sin(theta);
            const bw = 0.008 + Math.random() * 0.012;
            const bd = 0.008 + Math.random() * 0.012;
            
            const dist = Math.sqrt(bx*bx + bz*bz);
            const bh = Math.max(0.01, 0.05 - dist * 0.15) + Math.random() * 0.02;

            bData.push({ x: bx, z: bz, w: bw, d: bd, h: bh, rot: Math.random() * Math.PI });
            this.minimapBuildings.setColorAt(i, bColors.setHSL(0.5 + Math.random() * 0.1, 0.8, 0.5));
        }
        this.minimapBuildings.userData.bData = bData;
        this.tableGroup.add(this.minimapBuildings);

        // Orbiting Traffic particles
        const trafficGeom = new THREE.BoxGeometry(0.003, 0.003, 0.005);
        const trafficMat = new THREE.MeshBasicMaterial({ color: 0xffa500 });
        const numTraffic = 15;
        for (let i = 0; i < numTraffic; i++) {
            const tMesh = new THREE.Mesh(trafficGeom, trafficMat);
            const radius = 0.04 + Math.random() * 0.12;
            const speed = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            
            this.minimapTraffic.push({ mesh: tMesh, radius, speed, angle });
            this.tableGroup.add(tMesh);
        }

        // Location Pin (neon glowing)
        this.locationPin = new THREE.Group();
        const pinHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.006, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff3333 })
        );
        pinHead.position.y = 0.02;
        const pinBody = new THREE.Mesh(
            new THREE.ConeGeometry(0.004, 0.012, 16),
            new THREE.MeshBasicMaterial({ color: 0xff3333 })
        );
        pinBody.position.y = 0.01;
        pinBody.rotation.x = Math.PI;
        const pinGlow = new THREE.Mesh(
            new THREE.RingGeometry(0.006, 0.009, 32),
            new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        pinGlow.rotation.x = -Math.PI / 2;
        pinGlow.position.y = 0.001;
        this.locationPin.add(pinHead, pinBody, pinGlow);
        this.tableGroup.add(this.locationPin);

        // 2D dynamic Map Plane layered on the table base
        const mapPlaneGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.001, 64);
        this.minimapMapPlaneMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        this.minimapMapPlane = new THREE.Mesh(mapPlaneGeom, this.minimapMapPlaneMat);
        this.minimapMapPlane.position.y = 0.002;
        this.tableGroup.add(this.minimapMapPlane);
        
        // Trigger initial map textures
        this.updateMinimapTexture();

        // Curved holographic connecting arm from table base to menu (longer/more separated)
        const curveGeom = new THREE.CylinderGeometry(0.004, 0.004, 0.22, 16);
        curveGeom.rotateZ(Math.PI / 3); // Angled to the left
        const curveMat = new THREE.MeshPhysicalMaterial({
            color: 0x00ffff,
            emissive: 0x002244,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.75
        });
        const connectingArm = new THREE.Mesh(curveGeom, curveMat);
        connectingArm.position.set(-0.16, 0.03, 0);
        this.tableGroup.add(connectingArm);

        // Attach menuMesh to the tableGroup (clearly separated to prevent accidental touches)
        this.menuMesh.position.set(-0.32, 0.08, 0);
        this.menuMesh.rotation.y = Math.PI / 6; // Angled facing inward towards the player
        this.tableGroup.add(this.menuMesh);

        // Register tableGroup with the world
        this.world.createTransformEntity(this.tableGroup);
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

    private getWristData(handedness: 'left' | 'right', posOut: THREE.Vector3, quatOut: THREE.Quaternion): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;

        const wrist = source.hand.get('wrist');
        if (!wrist) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const pose = frame.getJointPose(wrist, refSpace);
        if (pose) {
            const m = new THREE.Matrix4().compose(
                new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z),
                new THREE.Quaternion(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w),
                new THREE.Vector3(1, 1, 1)
            );
            m.premultiply(this.player.matrixWorld);
            m.decompose(posOut, quatOut, new THREE.Vector3());
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

    private checkMiddlePinch(): boolean {
        if (this.debugPPressed) return true; // Keyboard simulation key 'P'
        
        let pinched = false;
        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        
        const isLeftMiddlePinching = this.getMiddlePinchData('left', leftTip);
        const isRightMiddlePinching = this.getMiddlePinchData('right', rightTip);
        
        // Edge trigger detection for pinch start
        if (isLeftMiddlePinching && !this.wasMiddlePinchingLeft) {
            pinched = true;
        }
        if (isRightMiddlePinching && !this.wasMiddlePinchingRight) {
            pinched = true;
        }
        
        this.wasMiddlePinchingLeft = isLeftMiddlePinching;
        this.wasMiddlePinchingRight = isRightMiddlePinching;
        
        return pinched;
    }

    private async loadStreetView(lat: number, lng: number) {
        console.log(`[StreetView] Fetching panorama metadata for coords: ${lat}, ${lng}`);
        try {
            let metadata;
            let fetchedFromProxy = false;
            
            // Try fetching from local Vite proxy first
            try {
                const metaResponse = await fetch(`/api/streetview-metadata?location=${lat},${lng}`);
                if (metaResponse.ok) {
                    metadata = await metaResponse.json();
                    if (metadata.status === "OK" && metadata.pano_id) {
                        fetchedFromProxy = true;
                        console.log(`[StreetView] Successfully fetched metadata from Vite proxy.`);
                    }
                }
            } catch (e) {
                console.warn(`[StreetView] Vite proxy metadata fetch failed, falling back to direct client request...`, e);
            }

            // Dual-path: If proxy failed, fetch directly from Google API
            if (!fetchedFromProxy) {
                console.log(`[StreetView] Attempting direct browser request for metadata...`);
                const apiKey = "AIzaSyB0XK4ln1T1h1CfGvpE6KpPXg4SbU4PAoo"; // Browser fallback key
                const directUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${apiKey}`;
                const directResponse = await fetch(directUrl);
                if (!directResponse.ok) throw new Error("Both proxy and direct metadata requests failed");
                metadata = await directResponse.json();
            }
            
            if (metadata.status !== "OK" || !metadata.pano_id) {
                throw new Error("No Street View panorama found at these coordinates");
            }
            
            const panoId = metadata.pano_id;
            console.log(`[StreetView] Found Pano ID: ${panoId}`);

            // Stitch the tiles at zoom level 2 (4x2 tiles of 512x512 = 2048x1024 panorama)
            const tileWidth = 512;
            const tileHeight = 512;
            const cols = 4;
            const rows = 2;
            
            const offscreenCanvas = document.createElement("canvas");
            offscreenCanvas.width = 2048;
            offscreenCanvas.height = 1024;
            const ctx = offscreenCanvas.getContext("2d")!;
            
            // Draw dark futuristic loading screen on dome sphere until tiles load
            ctx.fillStyle = "#02020a";
            ctx.fillRect(0, 0, 2048, 1024);
            ctx.fillStyle = "#00ffff";
            ctx.font = "bold 48px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("STITCHING QUANTUM SPATIAL PANORAMA...", 1024, 512);

            const tempTexture = new THREE.CanvasTexture(offscreenCanvas);
            tempTexture.colorSpace = THREE.SRGBColorSpace;
            tempTexture.mapping = THREE.EquirectangularReflectionMapping;
            if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = tempTexture;
            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                this.initSphere.material.uniforms.u_texture.value = tempTexture;
            }

            // Load all 8 tiles in parallel with automatic direct fallback
            const loadTile = (x: number, y: number): Promise<HTMLImageElement> => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    
                    let attempts = 0;
                    img.onload = () => resolve(img);
                    
                    img.onerror = () => {
                        attempts++;
                        if (attempts === 1) {
                            // Retry using direct Google cbk server to solve proxy DNS EAI_AGAIN issues
                            console.warn(`[StreetView] Proxy tile [${x},${y}] failed. Retrying direct request...`);
                            img.src = `https://cbk0.google.com/cbk?output=tile&panoid=${panoId}&zoom=2&x=${x}&y=${y}`;
                        } else {
                            reject(new Error(`Failed to load tile [${x},${y}] after retry`));
                        }
                    };
                    
                    // Try local proxy first
                    img.src = `/api/streetview-tile?output=tile&panoid=${panoId}&zoom=2&x=${x}&y=${y}`;
                });
            };

            const tilePromises: Promise<{ img: HTMLImageElement; x: number; y: number }>[] = [];
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    tilePromises.push(loadTile(x, y).then(img => ({ img, x, y })));
                }
            }

            const loadedTiles = await Promise.all(tilePromises);
            
            // Clear loading text and stitch tiles
            ctx.clearRect(0, 0, 2048, 1024);
            for (const tile of loadedTiles) {
                ctx.drawImage(tile.img, tile.x * tileWidth, tile.y * tileHeight, tileWidth, tileHeight);
            }
            
            // Add a subtle futuristic HUD overlay on the panorama (looks AMAZING in VR!)
            ctx.strokeStyle = "rgba(0, 255, 255, 0.25)";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(1024, 512, 120, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
            ctx.font = "bold 16px monospace";
            ctx.textAlign = "center";
            ctx.fillText("SECURE ENCRYPTED HUD LINK - QUANTUM TELEPORTATION ACTIVE", 1024, 660);

            // Generate fine-tuned ThreeJS texture
            const finalTexture = new THREE.CanvasTexture(offscreenCanvas);
            finalTexture.colorSpace = THREE.SRGBColorSpace;
            finalTexture.mapping = THREE.EquirectangularReflectionMapping;
            finalTexture.needsUpdate = true;

            // Apply texture to shader bubble
            if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = finalTexture;
            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                this.initSphere.material.uniforms.u_texture.value = finalTexture;
            }
            
            console.log(`[StreetView] Live panorama successfully loaded and stitched!`);
            
        } catch (error) {
            console.warn(`[StreetView] Failed to load live Google Street View. Falling back to local domain textures.`, error);
            // Fallback to preloaded local index
            const fallbackKey = this.domainKeys[this.currentDomainIndex];
            const newTex = AssetManager.getTexture(fallbackKey);
            if (newTex) {
                newTex.colorSpace = THREE.SRGBColorSpace;
                newTex.mapping = THREE.EquirectangularReflectionMapping;
                
                if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = newTex;
                if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                    this.initSphere.material.uniforms.u_texture.value = newTex;
                }
            }
        }
    }

    private redrawMenuCanvas() {
        if (!this.menuCtx || !this.menuCanvas) return;

        const ctx = this.menuCtx;
        const w = this.menuCanvas.width;
        const h = this.menuCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Sleek futuristic semi-transparent glass panel background
        ctx.fillStyle = 'rgba(10, 10, 16, 0.9)';
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(10, 10, w - 20, h - 20, 24);
        ctx.fill();
        ctx.stroke();

        // 2. Render Tabs
        const tabWidth = (w - 40) / 2;
        const tabHeight = 44;

        // Gen-AI Tab (Left)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(20, 20, tabWidth - 5, tabHeight, 12);
        if (this.activeTab === 'genai') {
            const grad = ctx.createLinearGradient(20, 20, 20 + tabWidth, 20 + tabHeight);
            grad.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
            grad.addColorStop(1, 'rgba(0, 100, 255, 0.15)');
            ctx.fillStyle = grad;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2.5;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = this.activeTab === 'genai' ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("✦ GEN-AI DOMAINS ✦", 20 + (tabWidth - 5) / 2, 48);

        // Real Maps Tab (Right)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(20 + tabWidth + 5, 20, tabWidth - 5, tabHeight, 12);
        if (this.activeTab === 'maps') {
            const grad = ctx.createLinearGradient(20 + tabWidth + 5, 20, w - 20, 20 + tabHeight);
            grad.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
            grad.addColorStop(1, 'rgba(0, 100, 255, 0.15)');
            ctx.fillStyle = grad;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2.5;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = this.activeTab === 'maps' ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("🗺️ REAL-WORLD PORTALS (GOOGLE MAPS)", 20 + tabWidth + 5 + (tabWidth - 5) / 2, 48);

        // 3. Render 4 Content Thumbnails
        const padding = 20;
        const thumbW = 226;
        const thumbH = 120;
        const thumbY = 80;

        const thumbKeys = ["thumb_domainEnv", "thumb_domainEnv1", "thumb_domainEnv2", "thumb_domainEnv3"];
        const genaiNames = ["Quantum Void", "Neon Grid", "Cyber City", "Solar Flare"];
        const mapsNames = ["Tokyo (Shibuya)", "New York (Times Sq)", "Paris (Eiffel)", "Rome (Colosseum)"];

        for (let i = 0; i < 4; i++) {
            const x = padding + 10 + i * (thumbW + padding + 6);
            const tex = AssetManager.getTexture(thumbKeys[i]);

            if (tex && tex.image) {
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, thumbY, thumbW, thumbH, 14);
                ctx.clip();
                ctx.drawImage(tex.image as CanvasImageSource, x, thumbY, thumbW, thumbH);
                ctx.restore();

                // Highlight border if active selection
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, thumbY, thumbW, thumbH, 14);
                if (this.currentDomainIndex === i) {
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 3.5;
                    ctx.shadowColor = '#00ffff';
                    ctx.shadowBlur = 8;
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 1.5;
                }
                ctx.stroke();
                ctx.restore();

                // Draw Text Label below thumbnail
                ctx.fillStyle = this.currentDomainIndex === i ? '#00ffff' : '#ffffff';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                const label = this.activeTab === 'genai' ? genaiNames[i] : mapsNames[i];
                ctx.fillText(label, x + thumbW / 2, thumbY + thumbH + 24);
            }
        }

        // 4. Render Launch Immersive Dome Button at the bottom
        const btnX = w / 2 - 300;
        const btnY = 210;
        const btnW = 600;
        const btnH = 34;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 10);
        
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
        btnGrad.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
        btnGrad.addColorStop(0.5, 'rgba(0, 100, 255, 0.2)');
        btnGrad.addColorStop(1, 'rgba(0, 255, 255, 0.4)');
        ctx.fillStyle = btnGrad;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 6;
        
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("✦ LAUNCH 360° IMMERSIVE DOME ✦", w / 2, btnY + 22);

        if (this.menuTex) {
            this.menuTex.needsUpdate = true;
        }
    }

    private updateMinimapTexture() {
        if (!this.minimapMapPlaneMat) return;

        if (this.activeTab === 'genai') {
            // Draw a beautiful procedural neon-blueprint sci-fi grid texture for the Gen-AI mode
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, 512, 512);

            // Draw circular scan lines
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            for (let r = 50; r < 256; r += 40) {
                ctx.beginPath();
                ctx.arc(256, 256, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Draw crosshairs
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.moveTo(256, 0); ctx.lineTo(256, 512);
            ctx.moveTo(0, 256); ctx.lineTo(512, 256);
            ctx.stroke();

            // Draw fine grid lines
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            for (let xy = 0; xy < 512; xy += 32) {
                ctx.beginPath();
                ctx.moveTo(xy, 0); ctx.lineTo(xy, 512);
                ctx.moveTo(0, xy); ctx.lineTo(512, xy);
                ctx.stroke();
            }

            // Text Label
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            const genaiNames = ["QUANTUM VOID", "NEON GRID", "CYBER CITY", "SOLAR FLARE"];
            ctx.fillText(genaiNames[this.currentDomainIndex], 256, 264);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;
            this.minimapMapPlaneMat.map = tex;
            this.minimapMapPlaneMat.needsUpdate = true;
        } else {
            // Load real Google Static Map centered on current location
            const c = this.coords[this.currentDomainIndex];
            const style = "style=element:geometry|color:0x0f0f18&style=element:labels.text.stroke|color:0x000000&style=element:labels.text.fill|color:0x00ffff&style=feature:landscape|element:geometry|color:0x151525&style=feature:road|element:geometry|color:0x2f2f4f&style=feature:road|element:geometry.stroke|color:0x00ffff&style=feature:water|element:geometry|color:0x050510";
            
            const apiKey = "AIzaSyB0XK4ln1T1h1CfGvpE6KpPXg4SbU4PAoo";
            const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${c.lat},${c.lng}&zoom=15&size=512x512&scale=2&maptype=roadmap&${style}&key=${apiKey}`;

            console.log(`[Minimap] Fetching dynamic Google Map for coords: ${c.lat}, ${c.lng}`);

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const tex = new THREE.Texture(img);
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.needsUpdate = true;
                this.minimapMapPlaneMat.map = tex;
                this.minimapMapPlaneMat.needsUpdate = true;
                console.log(`[Minimap] Successfully updated Google Map texture on table base.`);
            };
            img.onerror = () => {
                console.warn(`[Minimap] Failed to load Google Static Map image. Retrying procedural placeholder.`);
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d')!;

                ctx.fillStyle = '#100c14';
                ctx.fillRect(0, 0, 512, 512);

                ctx.strokeStyle = 'rgba(255, 165, 0, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(256, 256, 180, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = '#ffa500';
                ctx.font = 'bold 24px monospace';
                ctx.textAlign = 'center';
                const cityNames = ["Tokyo (Shibuya)", "New York (Times Sq)", "Paris (Eiffel)", "Rome (Colosseum)"];
                ctx.fillText(cityNames[this.currentDomainIndex].toUpperCase(), 256, 240);
                ctx.font = '16px monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillText("MAP CONNECTION ENCRYPTED", 256, 280);

                const tex = new THREE.CanvasTexture(canvas);
                tex.colorSpace = THREE.SRGBColorSpace;
                this.minimapMapPlaneMat.map = tex;
                this.minimapMapPlaneMat.needsUpdate = true;
            };
            img.src = mapUrl;
        }
    }

    private checkMButton(): boolean {
        return this.debugMPressed;
    }

    private checkXButton(): boolean {
        if (this.debugXPressed) return true;
        const session = this.renderer.xr.getSession();
        if (!session) return false;
        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.buttons) {
                const button4 = source.gamepad.buttons[4];
                if (button4 && button4.pressed) return true;
            }
        }
        return false;
    }

    private checkYButton(): boolean {
        if (this.debugYPressed) return true;
        const session = this.renderer.xr.getSession();
        if (!session) return false;
        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.buttons) {
                const button5 = source.gamepad.buttons[5];
                if (button5 && button5.pressed) return true;
            }
        }
        return false;
    }

    update(dt: number) {
        if (this.switchCooldown > 0) this.switchCooldown -= dt;

        const hasLeftWrist = this.getWristData('left', this.wristPos, this.leftWristQuat);
        if (hasLeftWrist) {
            this.wristButtonMesh.position.copy(this.wristPos);
            this.wristButtonMesh.quaternion.copy(this.leftWristQuat);
            // Move it slightly up along the local Y axis (normal to the back of the wrist)
            this.wristButtonMesh.translateY(0.03); 
            this.wristButtonMesh.visible = true;
        } else {
            this.wristButtonMesh.visible = false;
        }

        if (this.menuToggleCooldown > 0) this.menuToggleCooldown -= dt;

        // Toggle via wrist tap
        let wristTapped = false;
        if (this.rightTip.lengthSq() > 0 && hasLeftWrist && this.wristButtonMesh.visible) {
            const dist = this.rightTip.distanceTo(this.wristButtonMesh.position);
            if (dist < 0.03) { // 3cm distance to tap the button
                wristTapped = true;
            }
        }

        if ((wristTapped || this.checkMButton()) && this.menuToggleCooldown <= 0) {
            this.menuToggleCooldown = 0.8; // 800ms debounce
            this.isTableSpawned = !this.isTableSpawned;
            
            if (this.isTableSpawned) {
                this.targetTableScale = 1.0;
                this.tableGroup.visible = true;
                this.menuMesh.visible = true;
                this.menuActiveState = true; // Starts active/waiting for proximity

                // Spawn circular table in front of the user
                const dir = new THREE.Vector3(0, 0, -1);
                dir.applyQuaternion(this.player.head.quaternion);
                
                // Position 0.55m in front, and slightly below chin height
                const spawnPos = this.player.head.position.clone().addScaledVector(dir, 0.55);
                spawnPos.y -= 0.25; // Ergonomic height for interactive table
                
                this.tableGroup.position.copy(spawnPos);
                
                // Rotate table to face the user (Yaw only)
                const lookTarget = this.player.head.position.clone();
                lookTarget.y = spawnPos.y;
                this.tableGroup.lookAt(lookTarget);
                this.tableGroup.rotateY(Math.PI); // Rotate 180 so left-attached menu is on user's left

                // Advance Tutorial step
                this.queries.jugnu.entities.forEach(e => {
                    if (e.getValue(Jugnu, "instructionStep") === 2) {
                        e.setValue(Jugnu, "instructionStep", 3);
                    }
                });
            } else {
                this.targetTableScale = 0.0;
            }
        }

        // Smoothly interpolate table scale
        if (this.currentTableScale !== this.targetTableScale) {
            this.currentTableScale += (this.targetTableScale - this.currentTableScale) * dt * 8.0;
            if (Math.abs(this.currentTableScale - this.targetTableScale) < 0.01) {
                this.currentTableScale = this.targetTableScale;
                if (this.currentTableScale === 0.0) {
                    this.tableGroup.visible = false;
                    this.menuMesh.visible = false;
                }
            }
            this.tableGroup.scale.setScalar(this.currentTableScale);

            // Animate buildings growth
            const bldDummy = new THREE.Object3D();
            const bData = this.minimapBuildings.userData.bData;
            for (let i = 0; i < bData.length; i++) {
                const b = bData[i];
                bldDummy.position.set(b.x, 0, b.z);
                bldDummy.rotation.y = b.rot;
                bldDummy.scale.set(b.w, b.h * this.currentTableScale, b.d);
                bldDummy.updateMatrix();
                this.minimapBuildings.setMatrixAt(i, bldDummy.matrix);
            }
            this.minimapBuildings.instanceMatrix.needsUpdate = true;
        }

        // Animate circular table elements when active
        if (this.tableGroup.visible) {
            this.radarTime += dt;
            
            // Pulsing radar sweep
            const radarScale = (this.radarTime * 0.5) % 1.0;
            this.radarRing.scale.set(radarScale, radarScale, 1.0);
            if (this.radarRing.material instanceof THREE.Material) {
                this.radarRing.material.opacity = (1.0 - radarScale) * 0.25;
            }

            // Pulsing location pin
            this.locationPin.position.y = Math.sin(this.radarTime * 3.5) * 0.003;

            // Rotating traffic
            for (const t of this.minimapTraffic) {
                t.angle += t.speed * dt;
                t.mesh.position.set(t.radius * Math.cos(t.angle), 0.0025, t.radius * Math.sin(t.angle));
                t.mesh.rotation.y = -t.angle;
            }
        }

        const hasLeft = this.getIndexData('left', this.leftTip);
        const hasRight = this.getIndexData('right', this.rightTip);

        // Middle Finger Pinch Gesture detection (or keyboard 'P')
        if (this.middlePinchCooldown > 0) {
            this.middlePinchCooldown -= dt;
        }
        const middlePinchDetected = this.checkMiddlePinch();
        if (middlePinchDetected && this.middlePinchCooldown <= 0 && this.isTableSpawned) {
            this.middlePinchCooldown = 0.8;
            this.menuActiveState = !this.menuActiveState;
        }

        // Determine target scale for menu
        if (!this.isTableSpawned) {
            this.targetMenuScale = 0.0;
        } else if (!this.menuActiveState) {
            this.targetMenuScale = 0.0; // Toggled closed
        } else {
            this.targetMenuScale = 1.0; // Displays at full scale directly, no proximity triggers
        }

        // Smoothly animate menu scale transitions
        if (this.currentMenuScale !== this.targetMenuScale) {
            this.currentMenuScale += (this.targetMenuScale - this.currentMenuScale) * dt * 8.0;
            if (Math.abs(this.currentMenuScale - this.targetMenuScale) < 0.005) {
                this.currentMenuScale = this.targetMenuScale;
            }
            this.menuMesh.scale.setScalar(this.currentMenuScale);
        }

        // Domain Menu Poke Interactions (Only allowed when expanded for precision)
        if (this.isTableSpawned && this.currentMenuScale > 0.8 && this.menuMesh.visible && this.rightTip.lengthSq() > 0) {
            const localTip = this.rightTip.clone();
            this.menuMesh.worldToLocal(localTip);

            // Plane is 1.0 width x 0.25 height
            // Z depth threshold: 0.05
            if (Math.abs(localTip.z) < 0.05) {
                // Check if Poke is in the TAB Header area (y > 0.06)
                if (localTip.y > 0.06 && localTip.y < 0.125 && this.menuToggleCooldown <= 0.0) {
                    const oldTab = this.activeTab;
                    if (localTip.x < 0.0) {
                        this.activeTab = 'genai';
                    } else {
                        this.activeTab = 'maps';
                    }
                    if (this.activeTab !== oldTab) {
                        console.log(`[DomainMenu] Switched active tab to: ${this.activeTab}`);
                        this.currentDomainIndex = 0; // Reset index for new tab
                        this.redrawMenuCanvas();
                        this.updateMinimapTexture(); // Render correct map texture style immediately!
                        this.menuToggleCooldown = 0.4; // 400ms quick tab debounce
                    }
                }
                // Check if Poke is in the THUMBNAILS content area (-0.06 <= y <= 0.06)
                else if (localTip.y >= -0.06 && localTip.y <= 0.06 && this.menuToggleCooldown <= 0.0) {
                    let selectedIndex = -1;
                    if (localTip.x > -0.5 && localTip.x <= -0.25) selectedIndex = 0;
                    else if (localTip.x > -0.25 && localTip.x <= 0.0) selectedIndex = 1;
                    else if (localTip.x > 0.0 && localTip.x <= 0.25) selectedIndex = 2;
                    else if (localTip.x > 0.25 && localTip.x <= 0.5) selectedIndex = 3;

                    if (selectedIndex !== -1) {
                        this.currentDomainIndex = selectedIndex;
                        this.redrawMenuCanvas(); // Highlight selection instantly
                        this.updateMinimapTexture(); // Load corresponding maps/blueprint on the circular minimap!
                        this.menuToggleCooldown = 0.5; // Debounce (keeps menu open for easy browsing)
                        console.log(`[DomainMenu] Selected index: ${this.currentDomainIndex}. Loading minimap...`);
                    }
                }
                // Check if Poke is in the LAUNCH button area (y < -0.06)
                else if (localTip.y < -0.06 && Math.abs(localTip.x) < 0.3 && this.menuToggleCooldown <= 0.0) {
                    this.menuActiveState = false; // Collapse menu after launching portal
                    this.menuToggleCooldown = 1.0; // 1s selection debounce

                    console.log(`[DomainMenu] Launching 360 Immersive Dome for index ${this.currentDomainIndex}...`);
                    
                    this.state = 'Bleed';
                    if (this.uiMesh) this.uiMesh.visible = false;
                    if (this.domainMesh) {
                        this.domainMesh.visible = true;
                        this.domainMesh.position.set(0, 0, 0); // Center bubble
                    }
                    this.isDomainExpansionTriggered = true;

                    if (this.activeTab === 'genai') {
                        const fallbackKey = this.domainKeys[this.currentDomainIndex];
                        const newTex = AssetManager.getTexture(fallbackKey);
                        if (newTex) {
                            newTex.colorSpace = THREE.SRGBColorSpace;
                            newTex.mapping = THREE.EquirectangularReflectionMapping;
                            if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = newTex;
                            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                                this.initSphere.material.uniforms.u_texture.value = newTex;
                            }
                        }
                    } else {
                        const c = this.coords[this.currentDomainIndex];
                        this.loadStreetView(c.lat, c.lng);
                    }

                    if (this.initSphere) {
                        this.initSphere.position.copy(this.rightTip.lengthSq() > 0 ? this.rightTip : this.player.head.position);
                        this.initSphere.visible = true;
                    }

                    // Trigger the fade-in switch transition
                    if (this.switchState === 'None') {
                        this.switchState = 'Out';
                        this.switchProgress = 1.0;
                        this.switchCooldown = 2.0;
                    }
                }
            }
        }

        // --- Domain Switching (Y Button / Y Key) ---
        if (this.checkYButton() && this.switchCooldown <= 0 && this.state === 'Bleed' && this.bleedProgress >= 1.0 && this.switchState === 'None') {
            this.switchState = 'Out';
            this.switchProgress = 1.0;
            this.switchCooldown = 2.0; // Debounce for the full out/in cycle
        }

        if (this.switchState === 'Out') {
            this.switchProgress -= dt * 1.5; // Faster fade out (~0.6s)
            if (this.switchProgress <= 0.0) {
                this.switchProgress = 0.0;
                this.switchState = 'In';
                
                // Swap texture when sphere is invisible
                if (this.activeTab === 'genai') {
                    this.currentDomainIndex = (this.currentDomainIndex + 1) % this.domainKeys.length;
                    const fallbackKey = this.domainKeys[this.currentDomainIndex];
                    const newTex = AssetManager.getTexture(fallbackKey);
                    if (newTex) {
                        newTex.colorSpace = THREE.SRGBColorSpace;
                        newTex.mapping = THREE.EquirectangularReflectionMapping;
                        if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = newTex;
                        if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                            this.initSphere.material.uniforms.u_texture.value = newTex;
                        }
                    }
                } else {
                    this.currentDomainIndex = (this.currentDomainIndex + 1) % this.coords.length;
                    const c = this.coords[this.currentDomainIndex];
                    this.loadStreetView(c.lat, c.lng);
                }
                this.redrawMenuCanvas(); // Refresh selection outline highlight!
            }
            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                this.initSphere.material.uniforms.u_progress.value = this.switchProgress;
            }
        } else if (this.switchState === 'In') {
            this.switchProgress += dt * 1.5;
            if (this.switchProgress >= 1.0) {
                this.switchProgress = 1.0;
                this.switchState = 'None';
            }
            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                this.initSphere.material.uniforms.u_progress.value = this.switchProgress;
            }
        }

        // --- Debug: Controller X Button Trigger ---
        if (this.state !== 'Bleed' && this.state !== 'Exit' && this.checkXButton()) {
            this.state = 'Bleed';
            if (this.uiMesh) this.uiMesh.visible = false;
            if (this.domainMesh) {
                this.domainMesh.visible = true;
                this.domainMesh.position.set(0, 0, 0);
            }
            this.isDomainExpansionTriggered = true;

            // Fetch environment or Street View dynamically!
            if (this.activeTab === 'genai') {
                const fallbackKey = this.domainKeys[this.currentDomainIndex];
                const newTex = AssetManager.getTexture(fallbackKey);
                if (newTex) {
                    newTex.colorSpace = THREE.SRGBColorSpace;
                    newTex.mapping = THREE.EquirectangularReflectionMapping;
                    if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = newTex;
                    if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                        this.initSphere.material.uniforms.u_texture.value = newTex;
                    }
                }
            } else {
                const c = this.coords[this.currentDomainIndex];
                this.loadStreetView(c.lat, c.lng);
            }
            
            // Advance Instruction Step 1 -> 2
            this.queries.jugnu.entities.forEach(e => {
                if (e.getValue(Jugnu, "instructionStep") === 1) {
                    e.setValue(Jugnu, "instructionStep", 2);
                }
            });

            if (this.initSphere) {
                // If hand tracking isn't active (rightTip is 0,0,0), fallback to head position
                this.initSphere.position.copy(this.rightTip.lengthSq() > 0 ? this.rightTip : this.player.head.position);
                this.initSphere.visible = true;
            }
        }

        // Debug Spheres update
        if (hasLeft) {
            this.leftDebugSphere.position.copy(this.leftTip);
            this.leftDebugSphere.visible = true;
        } else {
            this.leftDebugSphere.visible = false;
        }

        if (hasRight) {
            this.rightDebugSphere.position.copy(this.rightTip);
            this.rightDebugSphere.visible = true;
        } else {
            this.rightDebugSphere.visible = false;
        }

        if (this.state === 'None') {
            // --- Phase 1: Bimanual Index Trigger ---
            if (hasLeft && hasRight && !this.isDomainExpansionTriggered) {
                const dist = this.leftTip.distanceTo(this.rightTip);
                if (dist < 0.15) { // 15cm trigger distance to prevent tracking dropout when hands get too close
                    this.isDomainExpansionTriggered = true;
                    this.state = 'UI';
                    this.uiTimer = 10.0; // 10-second window
                    this.uiMesh.visible = true;
                    
                    // Advance Instruction Step 1 -> 2
                    this.queries.jugnu.entities.forEach(e => {
                        if (e.getValue(Jugnu, "instructionStep") === 1) {
                            e.setValue(Jugnu, "instructionStep", 2);
                        }
                    });
                }
            }
        } else if (this.state === 'UI') {
            this.uiTimer -= dt;
            if (this.uiTimer <= 0) {
                // Timeout reached
                this.state = 'None';
                this.uiMesh.visible = false;
                setTimeout(() => { this.isDomainExpansionTriggered = false; }, 2000);
                return;
            }

            // Continuously follow Jugnu
            for (const entity of this.queries.jugnu.entities) {
                if (!entity.object3D) continue;
                this.uiMesh.position.copy(entity.object3D.position);
                this.uiMesh.position.y += 0.25; // Float above Jugnu
                break;
            }
            this.uiMesh.lookAt(this.player.head.position);

            // Check interaction for both hands
            const tips = [];
            if (hasLeft) tips.push(this.leftTip);
            if (hasRight) tips.push(this.rightTip);

            for (const tip of tips) {
                const localTip = tip.clone();
                this.uiMesh.worldToLocal(localTip);

                // If finger is close to the plane's depth
                if (Math.abs(localTip.z) < 0.05) {
                    // INITIALIZE Button region
                    if (localTip.x > -0.3 && localTip.x < 0.0 && localTip.y > -0.15 && localTip.y < 0.05) {
                        this.state = 'Bleed';
                        this.uiMesh.visible = false;
                        this.domainMesh.visible = true;
                        this.domainMesh.position.set(0, 0, 0); // Fixed massive sphere

                        // Fetch environment or Street View dynamically!
                        if (this.activeTab === 'genai') {
                            const fallbackKey = this.domainKeys[this.currentDomainIndex];
                            const newTex = AssetManager.getTexture(fallbackKey);
                            if (newTex) {
                                newTex.colorSpace = THREE.SRGBColorSpace;
                                newTex.mapping = THREE.EquirectangularReflectionMapping;
                                if (this.customMaterial) this.customMaterial.uniforms.u_texture.value = newTex;
                                if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                                    this.initSphere.material.uniforms.u_texture.value = newTex;
                                }
                            }
                        } else {
                            const c = this.coords[this.currentDomainIndex];
                            this.loadStreetView(c.lat, c.lng);
                        }

                        if (this.initSphere) {
                            this.initSphere.position.copy(tip);
                            this.initSphere.visible = true;
                        }
                        break;
                    }
                    // ABORT Button region
                    if (localTip.x > 0.0 && localTip.x < 0.3 && localTip.y > -0.15 && localTip.y < 0.05) {
                        this.state = 'None';
                        this.uiMesh.visible = false;
                        setTimeout(() => { this.isDomainExpansionTriggered = false; }, 2000); // 2s debounce
                        break;
                    }
                }
            }
        } else if (this.state === 'Bleed') {
            // Check for exit gesture (holding index fingers close)
            if (hasLeft && hasRight) {
                const dist = this.leftTip.distanceTo(this.rightTip);
                if (dist < 0.15) {
                    this.exitTimer += dt;
                    if (this.exitTimer >= 1.5) {
                        this.state = 'Exit';
                        this.exitTimer = 0;
                        return;
                    }
                } else {
                    this.exitTimer = 0;
                }
            } else {
                this.exitTimer = 0;
            }

            // Normal bleed progress
            if (this.bleedProgress < 1.0) {
                this.bleedProgress += dt * 0.5; // Takes 2 seconds to complete
                if (this.bleedProgress >= 1.0) {
                    this.bleedProgress = 1.0;
                }
            }

            this.customMaterial.uniforms.u_bleedProgress.value = this.bleedProgress;
            this.customMaterial.uniforms.u_time.value += dt;

            // Sync the equator fade-in with the bleed progress, ONLY if not actively switching
            if (this.switchState === 'None') {
                if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                    this.initSphere.material.uniforms.u_progress.value = this.bleedProgress;
                }
            }
        } else if (this.state === 'Exit') {
            // Reverse the bleed progress
            this.bleedProgress -= dt * 0.5;
            
            if (this.bleedProgress <= 0.0) {
                this.bleedProgress = 0.0;
                this.state = 'None';
                // Wait 2 seconds before allowing re-trigger to prevent instant loop
                setTimeout(() => { this.isDomainExpansionTriggered = false; }, 2000);
                if (this.domainMesh) this.domainMesh.visible = false;
                if (this.initSphere) this.initSphere.visible = false;
            }

            this.customMaterial.uniforms.u_bleedProgress.value = this.bleedProgress;
            this.customMaterial.uniforms.u_time.value += dt;

            // Sync the equator fade-out
            if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                this.initSphere.material.uniforms.u_progress.value = this.bleedProgress;
            }
        }
    }
}
