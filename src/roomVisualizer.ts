import { createSystem, XRMesh, XRPlane, PhysicsBody, PhysicsState, PhysicsShape, PhysicsShapeType } from "@iwsdk/core";
import * as THREE from "three";

export class RoomVisualizerSystem extends createSystem({
    meshes: { required: [XRMesh] },
    planes: { required: [XRPlane] }
}) {
    private wireframeMat!: THREE.MeshStandardMaterial;
    private planeMat!: THREE.MeshStandardMaterial;
    private edgeMat!: THREE.LineBasicMaterial;
    
    private edgesVisible: boolean = true;
    private lastShakaState: boolean = false;

    private getJointPose(hand: XRHand, jointName: XRHandJoint, refSpace: XRReferenceSpace): XRPose | null {
        const joint = hand.get(jointName);
        if (!joint || typeof this.xrFrame?.getJointPose !== 'function') return null;
        return this.xrFrame.getJointPose(joint, refSpace) || null;
    }

    private detectShakaGesture(hand: XRHand, refSpace: XRReferenceSpace): boolean {
        const thumbTip = this.getJointPose(hand, 'thumb-tip', refSpace);
        const indexTip = this.getJointPose(hand, 'index-finger-tip', refSpace);
        const middleTip = this.getJointPose(hand, 'middle-finger-tip', refSpace);
        const ringTip = this.getJointPose(hand, 'ring-finger-tip', refSpace);
        const pinkyTip = this.getJointPose(hand, 'pinky-finger-tip', refSpace);
        const wrist = this.getJointPose(hand, 'wrist', refSpace);

        if (!thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip || !wrist) return false;

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

        return isThumbPinkyOut && isIndexCurled && isMiddleCurled && isRingCurled;
    }

    init() {
        // A stark, neon glowing wireframe for detected room meshes
        this.wireframeMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: 0x00ffff, // Neon Cyan
            emissiveIntensity: 5.0,
            wireframe: true,
            transparent: true,
            opacity: 0.8,
        });

        // Transparent material for scanned planes (only edges will be visible)
        this.planeMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        // White material for plane edges
        this.edgeMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2
        });
    }

    update() {
        // Check for Shaka gesture to toggle edge visibility
        let shakaDetected = false;
        const leftSource = this.input?.getPrimaryInputSource('left');
        const frame = this.xrFrame;
        const refSpace = this.renderer?.xr?.getReferenceSpace();

        if (leftSource && leftSource.hand && frame && refSpace) {
            shakaDetected = this.detectShakaGesture(leftSource.hand, refSpace);
        }

        // Toggle on edge of gesture detection
        if (shakaDetected && !this.lastShakaState) {
            this.edgesVisible = !this.edgesVisible;
            if (this.edgeMat) this.edgeMat.visible = this.edgesVisible;
            if (this.wireframeMat) this.wireframeMat.visible = this.edgesVisible;
        }
        this.lastShakaState = shakaDetected;

        // Iterate over all mesh entities mapped by the SceneUnderstandingSystem
        this.queries.meshes.entities.forEach(entity => {
            if (!entity.hasComponent(PhysicsBody)) {
                // Phase 2: Anchor 1:1 static trimesh colliders inside the physics engine
                entity.addComponent(PhysicsBody, { state: PhysicsState.Static })
                      .addComponent(PhysicsShape, { 
                          shape: PhysicsShapeType.TriMesh, 
                          friction: 0.5, 
                          restitution: 0.8 
                      });
                
                // Phase 1: Create invisible collision meshes
                const obj = entity.object3D;
                if (obj) {
                    obj.visible = false;
                }
            }
        });

        // Iterate over all plane entities mapped by the SceneUnderstandingSystem
        this.queries.planes.entities.forEach(entity => {
            if (!entity.hasComponent(PhysicsBody)) {
                // Phase 1: Show detected planes with a green material
                const obj = entity.object3D;
                if (obj) {
                    obj.visible = true;
                    
                    // Compute bounding box to get dimensions for the Box collider
                    const box = new THREE.Box3().setFromObject(obj);
                    const size = new THREE.Vector3();
                    box.getSize(size);

                    // Ensure minimum thickness so physics engine doesn't fail on flat planes
                    if (size.x < 0.01) size.x = 0.05;
                    if (size.y < 0.01) size.y = 0.05;
                    if (size.z < 0.01) size.z = 0.05;

                    obj.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.material = this.planeMat;

                            // Add white edges to make the planes clearly visible
                            const edges = new THREE.EdgesGeometry(child.geometry);
                            const line = new THREE.LineSegments(edges, this.edgeMat);
                            child.add(line);
                        }
                    });

                    // Phase 2: Anchor static Box colliders inside the physics engine for solid bouncing
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Static })
                          .addComponent(PhysicsShape, { 
                              shape: PhysicsShapeType.Box, 
                              dimensions: [size.x, size.y, size.z],
                              friction: 0.2, 
                              restitution: 1.2 // High restitution to ensure it bounces back clearly
                          });
                }
            }
        });
    }
}
