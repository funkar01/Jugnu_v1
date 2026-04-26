import { createSystem } from "@iwsdk/core";
import * as THREE from "three";

export class CityMapSystem extends createSystem() {
    private mapRoot!: THREE.Group;
    private mapContent!: THREE.Group; // Group for panning content
    private buildingsMesh!: THREE.InstancedMesh;
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
        this.mapContent.add(this.buildingsMesh);

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
        if (!source || !source.hand || !frame || typeof frame.getJointPose !== 'function') return false;
        
        const indexTip = source.hand.get('index-finger-tip');
        const thumbTip = source.hand.get('thumb-tip');
        if (!indexTip || !thumbTip) return false;

        const indexPose = frame.getJointPose(indexTip, refSpace);
        const thumbPose = frame.getJointPose(thumbTip, refSpace);
        
        if (indexPose && thumbPose) {
           const ip = new THREE.Vector3().copy(indexPose.transform.position as any);
           const tp = new THREE.Vector3().copy(thumbPose.transform.position as any);
           
           const isPinching = ip.distanceTo(tp) < 0.02;
           tipPosOut.copy(ip).applyMatrix4(this.player.matrixWorld);
           return isPinching;
        }
        return false;
    }

    update(dt: number) {
        let shakaDetected = false;
        let mapTargetPos = new THREE.Vector3();
        let mapTargetQuat = new THREE.Quaternion();

        const leftSource = this.input.getPrimaryInputSource('left');
        const rightSource = this.input.getPrimaryInputSource('right');
        const frame = this.xrFrame;
        const refSpace = this.renderer.xr.getReferenceSpace();

        if (leftSource && leftSource.hand && frame && refSpace) {
            const gestureData = this.detectShakaGesture(leftSource.hand, refSpace);
            
            if (gestureData && gestureData.isShaka) {
                shakaDetected = true;
                
                // Position exactly at the wrist/forearm like a smartwatch hologram
                // Y: 3cm above back of wrist, Z: 8cm towards the elbow (forearm)
                const offset = new THREE.Vector3(0, 0.03, 0.08); 
                offset.applyQuaternion(gestureData.wristQuat);
                
                mapTargetPos.copy(gestureData.wristPos).add(offset);
                mapTargetPos.applyMatrix4(this.player.matrixWorld);

                // Level Orientation: Extract only Yaw (Y-axis rotation) relative to player
                const euler = new THREE.Euler().setFromQuaternion(gestureData.wristQuat, "YXZ");
                mapTargetQuat.setFromEuler(new THREE.Euler(0, euler.y, 0));
                
                const playerRot = new THREE.Quaternion();
                this.player.matrixWorld.decompose(new THREE.Vector3(), playerRot, new THREE.Vector3());
                mapTargetQuat.premultiply(playerRot);
            }
        }

        // Pinch to Drag (Panning) logic
        if (this.isMapActive && refSpace) {
            const pinchPos = new THREE.Vector3();
            // Check right hand for pinch (or left hand if you want, but Shaka is left hand)
            const rightPinch = this.getPinchData('right', refSpace, pinchPos);
            
            if (rightPinch) {
                if (!this.isPinching) {
                    // Start pinch
                    this.isPinching = true;
                    this.lastPinchPos.copy(pinchPos);
                } else {
                    // Continue pinch: calculate delta in local map space
                    const delta = new THREE.Vector3().subVectors(pinchPos, this.lastPinchPos);
                    
                    // Transform delta into map's local space to know panning direction
                    const invRot = this.mapRoot.quaternion.clone().invert();
                    delta.applyQuaternion(invRot);
                    
                    // Apply delta to map offset
                    // Invert x/z because dragging right should move map left
                    this.mapOffset.x -= delta.x;
                    this.mapOffset.y -= delta.z; // mapped to z
                    
                    this.lastPinchPos.copy(pinchPos);
                }
            } else {
                this.isPinching = false;
            }
        } else {
            this.isPinching = false;
        }

        // State Machine for map visibility
        if (shakaDetected) {
            if (!this.isMapActive) {
                this.isMapActive = true;
                this.mapRoot.visible = true;
                this.mapRoot.position.copy(mapTargetPos); // Snap on initial appear
                this.mapRoot.quaternion.copy(mapTargetQuat);
            }
            this.targetScale = 1.0;
        } else {
            this.targetScale = 0.0;
        }

        // Smoothly lerp scale
        if (this.currentScale !== this.targetScale) {
            this.currentScale += (this.targetScale - this.currentScale) * 10.0 * dt;
            if (Math.abs(this.currentScale - this.targetScale) < 0.01) {
                this.currentScale = this.targetScale;
                if (this.currentScale === 0) {
                    this.isMapActive = false;
                    this.mapRoot.visible = false;
                }
            }
            this.mapRoot.scale.setScalar(this.currentScale);
        }

        // Update logic if active
        if (this.isMapActive) {
            // Spring Arm Tracking
            if (shakaDetected) {
                const hoverTarget = mapTargetPos;
                
                // Spring physics: F = -k*x - c*v
                const safeDt = Math.min(dt, 0.03);
                const displacement = new THREE.Vector3().subVectors(this.mapRoot.position, hoverTarget);
                const force = displacement.multiplyScalar(-this.springStiffness * 0.5); // Soft spring
                force.sub(this.velocity.clone().multiplyScalar(this.springDamping));

                this.velocity.add(force.multiplyScalar(safeDt));
                this.mapRoot.position.add(this.velocity.clone().multiplyScalar(safeDt));
                
                // Slerp rotation
                this.mapRoot.quaternion.slerp(mapTargetQuat, 10.0 * safeDt);
            }

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
