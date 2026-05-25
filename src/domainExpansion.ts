import { createSystem, AssetManager } from "@iwsdk/core";
import * as THREE from "three";
import { Jugnu } from "./jugnu.js";

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
    private bubbleMats: THREE.MeshBasicMaterial[] = [];
    private anchorRings: THREE.Mesh[] = [];
    private loaderRings: THREE.Mesh[] = [];
    private nameTags: THREE.Mesh[] = [];
    private nameTagMats: THREE.MeshBasicMaterial[] = [];
    private pinchProgresses: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    private hoverProgresses: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    private domainMesh!: THREE.Mesh;
    private domainMat!: THREE.MeshBasicMaterial;
    private isDomainActive = false;
    private bleedProgress = 0.0;
    private exitTimer = 0;
    private menuToggleCooldown = 0;

    // Holographic Close "X" button
    private xButton!: THREE.Group;
    private xButtonMat!: THREE.MeshBasicMaterial;
    private xCrossMats: THREE.MeshBasicMaterial[] = [];
    private lastActiveDomainIndex = -1;

    private currentDomainIndex = 0;
    private domainKeys = [
        "domainEnv",  // 0: VOID
        "",           // 1: TOKYO
        "domainEnv1", // 2: SHRINE
        "",           // 3: NEW YORK
        "domainEnv2", // 4: FOREST
        "",           // 5: PARIS
        "domainEnv3", // 6: OCEAN
        ""            // 7: ROME
    ];

    private realWorldCoords = [
        { lat: 0, lng: 0 },             // 0: VOID (abstract)
        { lat: 35.6595, lng: 139.7006 }, // 1: Tokyo Shibuya
        { lat: 0, lng: 0 },             // 2: SHRINE (abstract)
        { lat: 40.7580, lng: -73.9855 }, // 3: NYC Times Sq
        { lat: 0, lng: 0 },             // 4: FOREST (abstract)
        { lat: 48.8584, lng: 2.2945 },  // 5: Paris Eiffel
        { lat: 0, lng: 0 },             // 6: OCEAN (abstract)
        { lat: 41.8902, lng: 12.4922 }  // 7: Rome Colosseum
    ];

    private domainNames = [
        "VOID",
        "TOKYO",
        "SHRINE",
        "NEW YORK",
        "FOREST",
        "PARIS",
        "OCEAN",
        "ROME"
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

        // Table base: flat transparent glass cylinder (using safe MeshBasicMaterial - NO transmission)
        const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 64);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0x050515,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.tableBase = new THREE.Mesh(baseGeom, baseMat);
        this.tableBase.position.y = -0.005;
        this.tableGroup.add(this.tableBase);

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
        this.tableGroup.add(this.minimapBuildings);

        // Location Pin (Pure triangle geometries)
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
        
        this.locationPin.add(pinHead, pinBody, pinGlow);
        this.tableGroup.add(this.locationPin);

        // --- Holographic Domain Expansion Selection Bubbles (Octagon arrangement on Edge Ring) ---
        const bubbleGeom = new THREE.SphereGeometry(0.035, 32, 16);
        const bubbleRingGeom = new THREE.RingGeometry(0.023, 0.027, 32);
        const loaderRingGeom = new THREE.RingGeometry(0.012, 0.015, 32);
        const nameTagGeom = new THREE.PlaneGeometry(0.08, 0.02);

        for (let i = 0; i < 8; i++) {
            // Symmetrical octagon placement on the edge ring (radius = 0.17m) at 45-degree intervals
            const angle = i * (Math.PI / 4);
            const bx = Math.cos(angle) * 0.17;
            const bz = Math.sin(angle) * 0.17;

            const bMat = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            
            // Alternating pattern: i = 0,2,4,6 are abstract domains; 1,3,5,7 are real-world coordinates
            if (i % 2 === 0) {
                const texKey = this.domainKeys[i];
                const tex = AssetManager.getTexture(texKey);
                if (tex) {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    bMat.map = tex;
                }
            } else {
                // Real-world domain: use a beautiful procedural high-tech cyber sphere texture
                const name = this.domainNames[i];
                const coords = this.realWorldCoords[i];
                const tex = this.createRealWorldBubbleTexture(name, coords.lat, coords.lng);
                bMat.map = tex;
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
        
        this.xButton.add(beam1, beam2);
        this.tableGroup.add(this.xButton);

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

    update(dt: number) {
        if (this.middlePinchCooldown > 0) {
            this.middlePinchCooldown -= dt;
        }
        if (this.menuToggleCooldown > 0) {
            this.menuToggleCooldown -= dt;
        }

        // Expose a global window variable so Jugnu System ignores index pinches when this table is actively rotating
        (window as any).isRotatingMap = this.tableGroup.visible && this.isRotatingMap;
        (window as any).minimapTableVisible = this.tableGroup.visible;
        (window as any).minimapTablePosition = this.tableGroup.position;

        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        
        // Fetch middle pinch coordinate values
        this.getMiddlePinchData('left', leftTip);
        this.getMiddlePinchData('right', rightTip);

        const middlePinchDetected = this.checkMiddlePinch(dt) || this.checkMButton();

        if (middlePinchDetected && this.middlePinchCooldown <= 0) {
            this.middlePinchCooldown = 0.8;
            this.isTableSpawned = !this.isTableSpawned;
            
            if (this.isTableSpawned) {
                this.targetTableScale = 1.0;
                this.tableGroup.visible = true;
                this.isRotatingMap = false; // Reset rotation state

                // Determine spawning position adaptive to user height, but fixed in space once spawned
                let pinchPos = new THREE.Vector3(0, 1.15, -0.55);
                let headHeight = 1.6;

                if (this.player && this.player.head) {
                    const headPos = new THREE.Vector3();
                    this.player.head.getWorldPosition(headPos);
                    headHeight = headPos.y;

                    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                    // Spawn at hand pinch if active, otherwise in front of the head
                    if (this.wasMiddlePinchingLeft) {
                        pinchPos.copy(leftTip);
                    } else if (this.wasMiddlePinchingRight) {
                        pinchPos.copy(rightTip);
                    } else {
                        pinchPos.copy(headPos).addScaledVector(dir, 0.55);
                    }
                }
                
                // Adaptive height (fixed on spawn relative to head height - placed at a convenient desk height of headHeight - 0.45 meters)
                const spawnPos = new THREE.Vector3(pinchPos.x, Math.max(0.4, headHeight - 0.45), pinchPos.z);
                this.tableGroup.position.copy(spawnPos);
                
                // Singularity-Free Analytical Rotation (faces head's XZ direction)
                if (this.player && this.player.head) {
                    const headPos = new THREE.Vector3();
                    this.player.head.getWorldPosition(headPos);
                    const dx = headPos.x - spawnPos.x;
                    const dz = headPos.z - spawnPos.z;
                    const yaw = Math.atan2(dx, dz);
                    this.tableGroup.rotation.set(0, yaw + Math.PI, 0); // Face player
                } else {
                    this.tableGroup.rotation.set(0, Math.PI, 0);
                }

                // Advance Tutorial step if needed
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
            
            // 1. Fetch index finger tips
            const leftIndexPinchPos = new THREE.Vector3();
            const rightIndexPinchPos = new THREE.Vector3();
            
            const isLeftIndexPinching = this.getIndexPinchData('left', leftIndexPinchPos);
            const isRightIndexPinching = this.getIndexPinchData('right', rightIndexPinchPos);

            const hasLeftIndex = this.getIndexData('left', leftIndexPinchPos);
            const hasRightIndex = this.getIndexData('right', rightIndexPinchPos);

            // 2. Pinch-to-Rotate Map Turntable Interaction (Index + Thumb pinch)
            if (!this.isRotatingMap) {
                // Check if either hand is pinching close to the table base to start rotation
                let startedRotation = false;
                if (isRightIndexPinching) {
                    const distToTable = rightIndexPinchPos.distanceTo(this.tableGroup.position);
                    if (distToTable < 0.28) { // 28cm radius of interaction
                        this.isRotatingMap = true;
                        this.rotationHandedness = 'right';
                        startedRotation = true;
                    }
                }
                if (isLeftIndexPinching && !startedRotation) {
                    const distToTable = leftIndexPinchPos.distanceTo(this.tableGroup.position);
                    if (distToTable < 0.28) {
                        this.isRotatingMap = true;
                        this.rotationHandedness = 'left';
                        startedRotation = true;
                    }
                }
                
                if (startedRotation) {
                    // Record start of the drag
                    const handPos = this.rotationHandedness === 'right' ? rightIndexPinchPos : leftIndexPinchPos;
                    const dx = handPos.x - this.tableGroup.position.x;
                    const dz = handPos.z - this.tableGroup.position.z;
                    this.initialHandAngle = Math.atan2(dx, dz);
                    this.initialTableRotationY = this.tableGroup.rotation.y;
                }
            } else {
                // We are actively rotating: check if the corresponding hand is still pinching
                const isStillPinching = this.rotationHandedness === 'right' ? isRightIndexPinching : isLeftIndexPinching;
                const handPos = this.rotationHandedness === 'right' ? rightIndexPinchPos : leftIndexPinchPos;
                
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


            // 3. Selection Bubbles Hover Overlap Proximity check & Pinch-and-Hold 3-Second Charge check
            const hoverState = [false, false, false, false, false, false, false, false];
            const bubbleWorldPos = new THREE.Vector3();

            // Hover Proximity Check (6cm threshold)
            for (let i = 0; i < 8; i++) {
                this.selectionBubbles[i].getWorldPosition(bubbleWorldPos);
                let distToLeft = Infinity;
                let distToRight = Infinity;
                if (hasLeftIndex) distToLeft = leftIndexPinchPos.distanceTo(bubbleWorldPos);
                if (hasRightIndex) distToRight = rightIndexPinchPos.distanceTo(bubbleWorldPos);
                if (distToLeft < 0.06 || distToRight < 0.06) {
                    hoverState[i] = true;
                }
            }

            let bubblePinchEngaged = [false, false, false, false, false, false, false, false];

            // Detect overlapping pinch for each of the 8 bubbles (5cm threshold)
            for (let i = 0; i < 8; i++) {
                this.selectionBubbles[i].getWorldPosition(bubbleWorldPos);

                const isPinchingNearLeft = isLeftIndexPinching && leftIndexPinchPos.distanceTo(bubbleWorldPos) < 0.05;
                const isPinchingNearRight = isRightIndexPinching && rightIndexPinchPos.distanceTo(bubbleWorldPos) < 0.05;

                if (isPinchingNearLeft || isPinchingNearRight) {
                    bubblePinchEngaged[i] = true;
                }
            }

            // Update progresses, loader rings, billboarding name tags, and trigger events
            let headPos = new THREE.Vector3(0, 1.6, 0);
            if (this.player && this.player.head) {
                this.player.head.getWorldPosition(headPos);
            }

            for (let i = 0; i < 8; i++) {
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

                    // 2. High-Frequency Visual Vibration Feedback
                    if (chargeRatio > 0.05) {
                        // Vibrate position relative to its default center
                        const angle = i * (Math.PI / 4);
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
                            
                            // Check if this is an abstract domain or a real-world coordinates bubble
                            if (i % 2 === 0) {
                                // Abstract domain
                                const domeTex = AssetManager.getTexture(this.domainKeys[this.currentDomainIndex]);
                                if (domeTex) {
                                    domeTex.colorSpace = THREE.SRGBColorSpace;
                                    domeTex.mapping = THREE.EquirectangularReflectionMapping;
                                    this.domainMat.map = domeTex;
                                    this.domainMat.needsUpdate = true;
                                }
                            } else {
                                // Real-world domain: load Google Maps Street View stitching engine
                                const coords = this.realWorldCoords[i];
                                this.loadStreetView(coords.lat, coords.lng);
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
                    const angle = i * (Math.PI / 4);
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
                        const hoverPhase = this.radarTime * 1.5 + i * (Math.PI / 2);
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
}
