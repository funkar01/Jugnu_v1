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

    private async loadStreetView(lat: number, lng: number) {
        console.log(`[StreetView] Fetching panorama metadata for: ${lat}, ${lng}`);
        
        const loadingCanvas = document.createElement('canvas');
        loadingCanvas.width = 1024;
        loadingCanvas.height = 512;
        const lCtx = loadingCanvas.getContext('2d')!;
        lCtx.fillStyle = '#020d1e';
        lCtx.fillRect(0, 0, 1024, 512);
        
        lCtx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        lCtx.lineWidth = 2;
        lCtx.strokeRect(50, 50, 924, 412);
        
        lCtx.fillStyle = '#00ffff';
        lCtx.font = 'bold 32px monospace';
        lCtx.textAlign = 'center';
        lCtx.fillText("INITIATING SECURE SATELLITE DATA-LINK...", 512, 220);
        lCtx.fillText("STITCHING QUANTUM PANORAMA TILES (ZOOM 2)...", 512, 280);
        
        const loadingTex = new THREE.CanvasTexture(loadingCanvas);
        loadingTex.colorSpace = THREE.SRGBColorSpace;
        loadingTex.mapping = THREE.EquirectangularReflectionMapping;
        this.domainMat.map = loadingTex;
        this.domainMat.needsUpdate = true;
        
        try {
            const metaUrl = `/api/streetview-metadata?location=${lat},${lng}`;
            const metaRes = await fetch(metaUrl);
            if (!metaRes.ok) throw new Error("Metadata request failed");
            const meta = await metaRes.json();
            
            if (meta.status !== "OK" || !meta.pano_id) {
                throw new Error("No Street View panorama found at these coordinates");
            }
            
            const panoId = meta.pano_id;
            console.log(`[StreetView] Found Pano ID: ${panoId}`);
            
            const tiles: { x: number; y: number; img: HTMLImageElement }[] = [];
            const promises: Promise<void>[] = [];
            
            for (let x = 0; x < 4; x++) {
                for (let y = 0; y < 2; y++) {
                    const tx = x;
                    const ty = y;
                    promises.push(
                        (async () => {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            
                            const proxyUrl = `/api/streetview-tile?output=tile&panoid=${panoId}&zoom=2&x=${tx}&y=${ty}`;
                            const fallbackUrl = `https://cbk0.google.com/cbk?output=tile&panoid=${panoId}&zoom=2&x=${tx}&y=${ty}`;
                            
                            const loaded = new Promise<void>((resolve, reject) => {
                                img.onload = () => resolve();
                                img.onerror = () => reject(new Error(`Failed to load tile x:${tx}, y:${ty}`));
                            });
                            
                            try {
                                img.src = proxyUrl;
                                await Promise.race([
                                    loaded,
                                    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 3500))
                                ]);
                            } catch (e) {
                                console.warn(`[StreetView] Proxy failed or timed out for tile x:${tx}, y:${ty}. Falling back directly to cbk.google.com...`);
                                const imgFallback = new Image();
                                imgFallback.crossOrigin = "anonymous";
                                const fallbackLoaded = new Promise<void>((resolve, reject) => {
                                    imgFallback.onload = () => resolve();
                                    imgFallback.onerror = () => reject(new Error("Fallback failed"));
                                });
                                imgFallback.src = fallbackUrl;
                                await fallbackLoaded;
                                tiles.push({ x: tx, y: ty, img: imgFallback });
                                return;
                            }
                            
                            tiles.push({ x: tx, y: ty, img });
                        })()
                    );
                }
            }
            
            await Promise.all(promises);
            console.log(`[StreetView] Finished downloading all 8 tiles successfully!`);
            
            const stitchCanvas = document.createElement('canvas');
            stitchCanvas.width = 2048;
            stitchCanvas.height = 1024;
            const sCtx = stitchCanvas.getContext('2d')!;
            
            tiles.forEach(tile => {
                sCtx.drawImage(tile.img, tile.x * 512, tile.y * 512, 512, 512);
            });
            
            sCtx.fillStyle = 'rgba(0, 255, 255, 0.04)';
            for (let y = 0; y < 1024; y += 4) {
                sCtx.fillRect(0, y, 2048, 2);
            }
            
            sCtx.strokeStyle = '#00ffff';
            sCtx.lineWidth = 8;
            sCtx.strokeRect(20, 20, 2008, 984);
            
            sCtx.lineWidth = 2;
            sCtx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
            sCtx.strokeRect(30, 30, 1988, 964);
            
            sCtx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
            sCtx.lineWidth = 3;
            
            sCtx.beginPath();
            sCtx.arc(1024, 512, 120, 0, Math.PI * 2);
            sCtx.stroke();
            
            sCtx.beginPath();
            sCtx.arc(1024, 512, 60, 0, Math.PI * 2);
            sCtx.stroke();
            
            sCtx.beginPath();
            sCtx.moveTo(1024 - 180, 512); sCtx.lineTo(1024 - 20, 512);
            sCtx.moveTo(1024 + 20, 512); sCtx.lineTo(1024 + 180, 512);
            sCtx.moveTo(1024, 512 - 180); sCtx.lineTo(1024, 512 - 20);
            sCtx.moveTo(1024, 512 + 20); sCtx.lineTo(1024, 512 + 180);
            sCtx.stroke();
            
            sCtx.fillStyle = '#00ffff';
            sCtx.font = 'bold 28px monospace';
            sCtx.shadowColor = '#00ffff';
            sCtx.shadowBlur = 8;
            
            sCtx.textAlign = 'left';
            sCtx.fillText("COORDINATES LOCKED", 60, 80);
            sCtx.font = '22px monospace';
            sCtx.fillStyle = 'rgba(0, 255, 255, 0.85)';
            sCtx.fillText(`LATITUDE  : ${lat.toFixed(6)}°`, 60, 120);
            sCtx.fillText(`LONGITUDE : ${lng.toFixed(6)}°`, 60, 150);
            sCtx.fillText(`PANORAMA  : ${panoId.substring(0, 12)}...`, 60, 180);
            
            sCtx.textAlign = 'right';
            sCtx.font = 'bold 28px monospace';
            sCtx.fillStyle = '#00ffff';
            sCtx.fillText("SAT-LINK DEPLOYED", 1988, 80);
            sCtx.font = '22px monospace';
            sCtx.fillStyle = 'rgba(0, 255, 255, 0.85)';
            sCtx.fillText("TELEMETRY STATUS: ONLINE", 1988, 120);
            sCtx.fillText("BANDWIDTH: 4.8 GB/S", 1988, 150);
            sCtx.fillText("FEED PRESET: HIGH_STITCH", 1988, 180);
            
            sCtx.textAlign = 'center';
            sCtx.font = 'bold 24px monospace';
            sCtx.fillStyle = '#00ffff';
            sCtx.fillText("<<< TACTICAL SYSTEM VIEWPORT — PINCH 'X' TO EXIT PASSTHROUGH DOME >>>", 1024, 970);
            
            const texture = new THREE.CanvasTexture(stitchCanvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.mapping = THREE.EquirectangularReflectionMapping;
            
            this.domainMat.map = texture;
            this.domainMat.needsUpdate = true;
            console.log(`[StreetView] Seamless high-tech panorama applied to expanded 360 dome sphere successfully.`);
            
        } catch (error: any) {
            console.error(`[StreetView] Error loading street view panorama:`, error);
            
            const errorCanvas = document.createElement('canvas');
            errorCanvas.width = 1024;
            errorCanvas.height = 512;
            const eCtx = errorCanvas.getContext('2d')!;
            eCtx.fillStyle = '#1e0202';
            eCtx.fillRect(0, 0, 1024, 512);
            
            eCtx.strokeStyle = '#ff3333';
            eCtx.lineWidth = 4;
            eCtx.strokeRect(40, 40, 944, 432);
            
            eCtx.fillStyle = '#ff3333';
            eCtx.font = 'bold 36px monospace';
            eCtx.textAlign = 'center';
            eCtx.fillText("GPS FEED ERROR / DISCONNECTED", 512, 200);
            eCtx.font = '24px monospace';
            eCtx.fillStyle = '#ffaaaa';
            eCtx.fillText(`MESSAGE: ${error.message || error}`, 512, 260);
            eCtx.fillText("FALLING BACK TO IMMERSIVE SECURE SCAN STATE", 512, 320);
            
            const errorTex = new THREE.CanvasTexture(errorCanvas);
            errorTex.colorSpace = THREE.SRGBColorSpace;
            errorTex.mapping = THREE.EquirectangularReflectionMapping;
            this.domainMat.map = errorTex;
            this.domainMat.needsUpdate = true;
        }
    }
}
