import { createSystem, AssetManager } from "@iwsdk/core";
import * as THREE from "three";

export class CityMapSystem extends createSystem() {
    private mapRoot!: THREE.Group;
    private mapContent!: THREE.Group; // Group for panning content
    private buildingsMesh!: THREE.InstancedMesh;
    private stadiumMesh!: THREE.Group;
    private stadiumBaseScale = 1.0;
    private trafficBoxes: THREE.Mesh[] = [];
    private targetScale = 0.0;
    private currentScale = 0.0;
    private isMapActive = false;

    // To store traffic animation data
    private trafficData: { mesh: THREE.Mesh; angle: number; radius: number; speed: number }[] = [];

    // Spring Arm Physics
    private velocity = new THREE.Vector3();
    // Tighter spring so it feels attached like a hologram, minimizing lag
    private springStiffness = 400.0;
    private springDamping = 25.0;
    
    // Panning / Pinch to Drag
    private isPinching = false;
    private lastPinchPos = new THREE.Vector3();
    private mapOffset = new THREE.Vector2(0, 0);

    // Two-handed Pinch to Scale
    private isTwoHandScaling = false;
    private initialHandDist = 0.0;
    private initialUserScale = 1.0;
    private userScaleFactor = 1.0;
    private shakaCooldown = 0.0;

    // Log states to prevent console spam
    private lastLeftPinch = false;
    private lastRightPinch = false;
    private lastLoggedScale = 1.0;
    private wasShakaLeft = false;




    init() {
        this.mapRoot = new THREE.Group();
        this.mapContent = new THREE.Group();
        this.mapRoot.scale.setScalar(0.0);
        this.mapRoot.visible = false;
        
        // Base - dark transparent glassy base for MR
        const baseGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.005, 64);
        const baseMat = new THREE.MeshPhysicalMaterial({
            color: 0x111115,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.8,
            transmission: 0.5,
            side: THREE.DoubleSide
        });
        const baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.position.y = -0.0025;
        this.mapRoot.add(baseMesh);

        // Grid/Ring accents for the base
        const ringGeom = new THREE.RingGeometry(0.145, 0.15, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.001;
        this.mapRoot.add(ringMesh);

        // Map Content (buildings & traffic) attached to mapRoot via mapContent for panning
        this.mapRoot.add(this.mapContent);

        // Procedural Buildings using InstancedMesh for performance
        const numBuildings = 80;
        const bldgGeom = new THREE.BoxGeometry(1, 1, 1);
        bldgGeom.translate(0, 0.5, 0);
        
        const bldgMat = new THREE.MeshPhysicalMaterial({
            color: 0x222233,
            metalness: 0.7,
            roughness: 0.2,
            emissive: 0x050510,
        });

        this.buildingsMesh = new THREE.InstancedMesh(bldgGeom, bldgMat, numBuildings);
        const color = new THREE.Color();

        // Store base building attributes in userData for panning reconstruction
        const buildingData = [];
        for (let i = 0; i < numBuildings; i++) {
            const bx = (Math.random() - 0.5) * 0.3; // Distribute across wider area for panning
            const bz = (Math.random() - 0.5) * 0.3;
            const bw = 0.005 + Math.random() * 0.01;
            const bd = 0.005 + Math.random() * 0.01;
            
            // Dist to center to decide height
            const dist = Math.sqrt(bx*bx + bz*bz);
            const bh = 0.01 + Math.max(0, 0.04 - dist * 0.2); 
            
            buildingData.push({ x: bx, z: bz, w: bw, d: bd, h: bh, rot: Math.random() * Math.PI });
            
            const l = 0.8 + Math.random() * 0.4;
            this.buildingsMesh.setColorAt(i, color.setHSL(0.6, 0.2, l * 0.2));
        }
        this.buildingsMesh.userData.bData = buildingData;
        this.buildingsMesh.visible = false; // Hide default buildings
        this.mapContent.add(this.buildingsMesh);

        // Load custom stadium model
        const stadiumAsset = AssetManager.getGLTF("wankhede");
        if (stadiumAsset) {
            this.stadiumMesh = stadiumAsset.scene.clone();
            
            // Measure bounding box to scale it correctly to fit the map
            const box = new THREE.Box3().setFromObject(this.stadiumMesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            // We want it to be about 0.20m diameter (0.10m radius) to fit the minimap beautifully
            const maxDim = Math.max(size.x, size.z);
            this.stadiumBaseScale = 0.20 / (maxDim || 1.0);
            this.stadiumMesh.scale.setScalar(this.stadiumBaseScale);
            this.stadiumMesh.position.set(0, 0.008, 0);
            this.mapContent.add(this.stadiumMesh);
        } else {
            // Fallback circular procedural stadium
            const fallbackGroup = new THREE.Group();
            const outerWall = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32, 1, true),
                new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, wireframe: true })
            );
            fallbackGroup.add(outerWall);
            this.stadiumMesh = fallbackGroup as any;
            this.stadiumMesh.position.set(0, 0.008, 0);
            this.stadiumBaseScale = 1.0;
            this.mapContent.add(this.stadiumMesh);
        }

        // Traffic geometry
        const trafficGeom = new THREE.BoxGeometry(0.002, 0.002, 0.004);
        const trafficMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const numTraffic = 30;

        for (let i = 0; i < numTraffic; i++) {
            const tMesh = new THREE.Mesh(trafficGeom, trafficMat);
            const radius = 0.04 + Math.random() * 0.1;
            const speed = (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.5);
            const angle = Math.random() * Math.PI * 2;
            
            this.trafficData.push({ mesh: tMesh, radius, speed, angle });
            this.mapContent.add(tMesh);
        }

        // Location Pin (Red marker) - Fixed to the mapRoot center, not affected by panning
        const pinGroup = new THREE.Group();
        const pinHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.005, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff2222 })
        );
        pinHead.position.y = 0.015;
        
        const pinBody = new THREE.Mesh(
            new THREE.ConeGeometry(0.003, 0.01, 16),
            new THREE.MeshBasicMaterial({ color: 0xff2222 })
        );
        pinBody.position.y = 0.005;
        pinBody.rotation.x = Math.PI;

        const pinGlow = new THREE.Mesh(
            new THREE.RingGeometry(0.004, 0.006, 32),
            new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        pinGlow.rotation.x = -Math.PI / 2;
        pinGlow.position.y = 0.001;
        
        pinGroup.add(pinHead, pinBody, pinGlow);
        pinGroup.position.set(0, 0, 0);
        
        this.mapRoot.userData.pinGroup = pinGroup;
        this.mapRoot.userData.time = 0;
        this.mapRoot.add(pinGroup);

        this.world.createTransformEntity(this.mapRoot);

        // Pre-compile shaders in WebGL to prevent any first-time WebXR stutter/crashes
        try {
            this.renderer.compile(this.mapRoot, this.camera);
            console.log("[CityMapSystem] Shader pre-compilation successful!");
        } catch (e) {
            console.warn("[CityMapSystem] Shader pre-compilation failed/skipped:", e);
        }
    }

    private getJointPose(hand: XRHand, jointName: XRHandJoint, refSpace: XRReferenceSpace): XRPose | null {
        const joint = hand.get(jointName);
        if (!joint || typeof this.xrFrame?.getJointPose !== 'function') return null;
        return this.xrFrame.getJointPose(joint, refSpace) || null;
    }

    private detectShakaGesture(hand: XRHand, refSpace: XRReferenceSpace): { isShaka: boolean, wristPos: THREE.Vector3, wristQuat: THREE.Quaternion } | null {
        const thumbTip = this.getJointPose(hand, 'thumb-tip', refSpace);
        const indexTip = this.getJointPose(hand, 'index-finger-tip', refSpace);
        const middleTip = this.getJointPose(hand, 'middle-finger-tip', refSpace);
        const ringTip = this.getJointPose(hand, 'ring-finger-tip', refSpace);
        const pinkyTip = this.getJointPose(hand, 'pinky-finger-tip', refSpace);
        const wrist = this.getJointPose(hand, 'wrist', refSpace);

        if (!thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip || !wrist) return null;

        const pThumb = new THREE.Vector3().copy(thumbTip.transform.position as any);
        const pIndex = new THREE.Vector3().copy(indexTip.transform.position as any);
        const pMiddle = new THREE.Vector3().copy(middleTip.transform.position as any);
        const pRing = new THREE.Vector3().copy(ringTip.transform.position as any);
        const pPinky = new THREE.Vector3().copy(pinkyTip.transform.position as any);
        const pWrist = new THREE.Vector3().copy(wrist.transform.position as any);

        const thumbPinkyDist = pThumb.distanceTo(pPinky);
        const isThumbPinkyOut = thumbPinkyDist > 0.12; 
        
        const isIndexCurled = pIndex.distanceTo(pWrist) < 0.08;
        const isMiddleCurled = pMiddle.distanceTo(pWrist) < 0.08;
        const isRingCurled = pRing.distanceTo(pWrist) < 0.08;

        return {
            isShaka: isThumbPinkyOut && isIndexCurled && isMiddleCurled && isRingCurled,
            wristPos: pWrist,
            wristQuat: new THREE.Quaternion().copy(wrist.transform.orientation as any)
        };
    }

    private getPinchData(handedness: 'left' | 'right', refSpace: XRReferenceSpace, tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;
        
        const indexTip = source.hand.get('index-finger-tip');
        const thumbTip = source.hand.get('thumb-tip');
        if (!indexTip || !thumbTip) return false;

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

            // Generous 3.5cm threshold for highly robust index-thumb pinch detection in VR
            const distSq = (ix - tx) ** 2 + (iy - ty) ** 2 + (iz - tz) ** 2;
            const isPinching = distSq < 0.035 * 0.035;

            tipPosOut.set(ix, iy, iz);
            if (this.player) {
                tipPosOut.applyMatrix4(this.player.matrixWorld);
            }

            return isPinching;
        }
        return false;
    }

    update(dt: number) {
        // 1. Update shaka cooldown timer
        if (this.shakaCooldown > 0) {
            this.shakaCooldown -= dt;
        }

        // 2. Detect Shaka gesture on left hand
        let shakaDetected = false;
        const leftSource = this.input.getPrimaryInputSource('left');
        const frame = this.xrFrame;
        const refSpace = this.renderer.xr.getReferenceSpace();

        if (leftSource && leftSource.hand && frame && refSpace) {
            const gestureData = this.detectShakaGesture(leftSource.hand, refSpace);
            if (gestureData && gestureData.isShaka) {
                shakaDetected = true;
            }
        }

        // 3. Handle Shaka spatial toggle (Rising-edge triggered to prevent rapid toggle loops)
        if (shakaDetected && !this.wasShakaLeft) {
            this.isMapActive = !this.isMapActive;
            
            console.log(`[CityMapSystem] Toggle triggered! New Active State: ${this.isMapActive}`);

            if (this.isMapActive) {
                // Spawn stably floating 0.4m in front of chest (0.25m below head)
                if (this.player && this.player.head) {
                    const headPos = new THREE.Vector3();
                    this.player.head.getWorldPosition(headPos);
                    
                    const headQuat = new THREE.Quaternion();
                    this.player.head.getWorldQuaternion(headQuat);
                    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
                    forward.y = 0; // Keep horizontal
                    forward.normalize();
                    
                    // Floating position: 0.4m in front, 0.25m below head
                    const spawnPos = new THREE.Vector3().copy(headPos).addScaledVector(forward, 0.4);
                    spawnPos.y = headPos.y - 0.25;
                    
                    this.mapRoot.position.copy(spawnPos);
                    
                    // Singularity-free look at player (face player)
                    const dx = headPos.x - spawnPos.x;
                    const dz = headPos.z - spawnPos.z;
                    const yaw = Math.atan2(dx, dz);
                    this.mapRoot.quaternion.setFromEuler(new THREE.Euler(0, yaw + Math.PI, 0));
                    
                    console.log(`[CityMapSystem] Floating minimap spawned at position: (${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`);
                } else {
                    // Fallback absolute spawn
                    this.mapRoot.position.set(0, 1.25, -0.4);
                    this.mapRoot.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0));
                    console.log(`[CityMapSystem] Floating minimap spawned at absolute fallback.`);
                }
                
                this.mapRoot.visible = true;
                
                // Reset panning, scaling, and physics velocity back to default on fresh spawn
                this.mapOffset.set(0, 0);
                this.userScaleFactor = 1.0;
                this.velocity.set(0, 0, 0);
                
                // Reset pinch logging states
                this.lastLeftPinch = false;
                this.lastRightPinch = false;
                this.lastLoggedScale = 1.0;
            } else {
                console.log(`[CityMapSystem] Minimap closing, animating scale down to 0.`);
            }
        }
        this.wasShakaLeft = shakaDetected; // Save shaka state for rising-edge check

        // 4. Two-handed Pinch to Scale & Single-handed Drag Panning (Active only if Map is Active)
        if (this.isMapActive && refSpace) {
            const leftPinchPos = new THREE.Vector3();
            const rightPinchPos = new THREE.Vector3();
            
            const leftPinch = this.getPinchData('left', refSpace, leftPinchPos);
            const rightPinch = this.getPinchData('right', refSpace, rightPinchPos);
            
            // Console Logging for Pinch Detection State Transitions (Clean, non-spammy)
            if (leftPinch !== this.lastLeftPinch) {
                console.log(`[CityMapSystem] Left Hand Pinch changed: ${leftPinch ? "PINCHING" : "RELEASED"} at pos: (${leftPinchPos.x.toFixed(2)}, ${leftPinchPos.y.toFixed(2)}, ${leftPinchPos.z.toFixed(2)})`);
                this.lastLeftPinch = leftPinch;
            }
            if (rightPinch !== this.lastRightPinch) {
                console.log(`[CityMapSystem] Right Hand Pinch changed: ${rightPinch ? "PINCHING" : "RELEASED"} at pos: (${rightPinchPos.x.toFixed(2)}, ${rightPinchPos.y.toFixed(2)}, ${rightPinchPos.z.toFixed(2)})`);
                this.lastRightPinch = rightPinch;
            }

            if (leftPinch && rightPinch) {
                // Two-handed scaling interaction (We remove distance checks entirely for dual-pinch to scale,
                // making the gesture 100% robust and reliable anywhere in your field of view!)
                const currentHandDist = leftPinchPos.distanceTo(rightPinchPos);
                
                if (!this.isTwoHandScaling) {
                    this.isTwoHandScaling = true;
                    this.initialHandDist = currentHandDist;
                    this.initialUserScale = this.userScaleFactor;
                    console.log(`[CityMapSystem] Two-handed scaling ENGAGED. Hand distance: ${currentHandDist.toFixed(3)}m. Base Scale: ${this.userScaleFactor.toFixed(2)}`);
                } else {
                    // Proportional scaling based on hand distance delta
                    if (this.initialHandDist > 0.01) {
                        const ratio = currentHandDist / this.initialHandDist;
                        let targetUserScale = this.initialUserScale * ratio;
                        
                        // Normal size is 1.0 (0.3m diameter) to max 3.0m diameter (10.0 scale multiplier)
                        this.userScaleFactor = THREE.MathUtils.clamp(targetUserScale, 1.0, 10.0);
                        
                        // Log only on significant scale changes to avoid spamming the debug board
                        if (Math.abs(this.userScaleFactor - this.lastLoggedScale) > 0.5) {
                            console.log(`[CityMapSystem] Scaling: current scale is ${this.userScaleFactor.toFixed(2)}`);
                            this.lastLoggedScale = this.userScaleFactor;
                        }
                    }
                }
                this.isPinching = false; // Disable single hand panning
            } else {
                if (this.isTwoHandScaling) {
                    console.log(`[CityMapSystem] Two-handed scaling COMPLETED. Final scale: ${this.userScaleFactor.toFixed(2)}`);
                    this.isTwoHandScaling = false;
                }
                
                // Single-handed Drag Panning (Right hand only) - Adding a generous 40cm distance check to avoid accidental trigger
                const distRightToMap = rightPinchPos.distanceTo(this.mapRoot.position);
                if (rightPinch && distRightToMap < 0.40) {
                    if (!this.isPinching) {
                        this.isPinching = true;
                        this.lastPinchPos.copy(rightPinchPos);
                        console.log(`[CityMapSystem] Single-handed panning ENGAGED.`);
                    } else {
                        const delta = new THREE.Vector3().subVectors(rightPinchPos, this.lastPinchPos);
                        const invRot = this.mapRoot.quaternion.clone().invert();
                        delta.applyQuaternion(invRot);
                        
                        // Precise visual "sticky" panning scaled by the current scale factor
                        const scaleScale = Math.max(0.01, this.currentScale);
                        this.mapOffset.x -= delta.x / scaleScale;
                        this.mapOffset.y -= delta.z / scaleScale;
                        
                        this.lastPinchPos.copy(rightPinchPos);
                    }
                } else {
                    if (this.isPinching) {
                        console.log(`[CityMapSystem] Single-handed panning completed. Map offset: (${this.mapOffset.x.toFixed(2)}, ${this.mapOffset.y.toFixed(2)})`);
                        this.isPinching = false;
                    }
                }
            }
        } else {
            this.isPinching = false;
            this.isTwoHandScaling = false;
        }

        // 5. Target Scale State Machine
        if (this.isMapActive) {
            this.targetScale = this.userScaleFactor;
        } else {
            this.targetScale = 0.0;
        }

        // 6. Smoothly lerp scale
        if (this.currentScale !== this.targetScale) {
            this.currentScale += (this.targetScale - this.currentScale) * 10.0 * dt;
            if (Math.abs(this.currentScale - this.targetScale) < 0.01) {
                this.currentScale = this.targetScale;
                if (this.currentScale === 0) {
                    this.mapRoot.visible = false;
                }
            }
            this.mapRoot.scale.setScalar(this.currentScale);
        }

        // 7. Update components visual animation loop if visible
        if (this.currentScale > 0.0) {
            this.mapRoot.userData.time += dt;

            // Animate Pin
            const pinGroup = this.mapRoot.userData.pinGroup;
            if (pinGroup) {
                pinGroup.position.y = Math.sin(this.mapRoot.userData.time * 3.0) * 0.005;
            }

            // Procedural Panning Update (Buildings)
            const dummy = new THREE.Object3D();
            const bData = this.buildingsMesh.userData.bData as any[];
            const mapRadius = 0.15;

            for (let i = 0; i < bData.length; i++) {
                const b = bData[i];
                // Apply map offset and wrap using modulo
                // To keep them within the circle, we tile the space from -mapRadius to +mapRadius
                let px = (b.x + this.mapOffset.x) % (mapRadius * 2);
                if (px < -mapRadius) px += mapRadius * 2;
                if (px > mapRadius) px -= mapRadius * 2;
                
                let pz = (b.z + this.mapOffset.y) % (mapRadius * 2);
                if (pz < -mapRadius) pz += mapRadius * 2;
                if (pz > mapRadius) pz -= mapRadius * 2;
                
                // Only scale up buildings if they are inside the circular radius
                const distToCenter = Math.sqrt(px*px + pz*pz);
                let currentScale = 0;
                if (distToCenter < mapRadius - 0.01) {
                    currentScale = 1.0; // Visible
                }

                dummy.position.set(px, 0, pz);
                dummy.scale.set(b.w * currentScale, b.h * currentScale, b.d * currentScale);
                dummy.rotation.y = b.rot;
                dummy.updateMatrix();
                this.buildingsMesh.setMatrixAt(i, dummy.matrix);
            }
            this.buildingsMesh.instanceMatrix.needsUpdate = true;

            // Stadium Panning Update
            if (this.stadiumMesh) {
                let px = this.mapOffset.x;
                let pz = this.mapOffset.y;
                
                const distToCenter = Math.sqrt(px*px + pz*pz);
                
                if (distToCenter < mapRadius) {
                    this.stadiumMesh.position.set(px, 0.008, pz);
                    this.stadiumMesh.visible = true;
                    
                    // Smoothly scale down as it reaches the edge
                    const edgeDist = mapRadius - distToCenter;
                    const fadeScale = Math.min(1.0, edgeDist / 0.03); // Fade out in last 3cm
                    this.stadiumMesh.scale.setScalar(this.stadiumBaseScale * fadeScale);
                } else {
                    this.stadiumMesh.visible = false;
                }
            }

            // Animate Traffic (orbiting traffic also affected by panning center)
            for (const t of this.trafficData) {
                t.angle += t.speed * dt;
                
                let px = (t.radius * Math.cos(t.angle) + this.mapOffset.x) % (mapRadius * 2);
                if (px < -mapRadius) px += mapRadius * 2;
                if (px > mapRadius) px -= mapRadius * 2;

                let pz = (t.radius * Math.sin(t.angle) + this.mapOffset.y) % (mapRadius * 2);
                if (pz < -mapRadius) pz += mapRadius * 2;
                if (pz > mapRadius) pz -= mapRadius * 2;

                const dist = Math.sqrt(px*px + pz*pz);
                
                if (dist < mapRadius - 0.01) {
                    t.mesh.visible = true;
                    t.mesh.position.set(px, 0, pz);
                    t.mesh.rotation.y = -t.angle;
                } else {
                    t.mesh.visible = false;
                }
            }
        }
    }
}
