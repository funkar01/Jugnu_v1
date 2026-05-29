import { createSystem, XRMesh, XRPlane, PhysicsBody, PhysicsState, PhysicsShape, PhysicsShapeType } from "@iwsdk/core";
import * as THREE from "three";

export class RoomVisualizerSystem extends createSystem({
    meshes: { required: [XRMesh] },
    planes: { required: [XRPlane] }
}) {
    private wireframeMat!: THREE.MeshStandardMaterial;
    private planeMat!: THREE.MeshStandardMaterial;
    private edgeMat!: THREE.LineBasicMaterial;

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
        // Read the global toggle set by the Compass RESET button
        const showWalls = !!((window as any).showRoomWalls);

        // Iterate over all mesh entities mapped by the SceneUnderstandingSystem
        this.queries.meshes.entities.forEach(entity => {
            if (!entity.hasComponent(PhysicsBody)) {
                // Always add physics — invisible trimesh colliders
                entity.addComponent(PhysicsBody, { state: PhysicsState.Static })
                      .addComponent(PhysicsShape, {
                          shape: PhysicsShapeType.TriMesh,
                          friction: 0.5,
                          restitution: 0.8
                      });
                const obj = entity.object3D;
                if (obj) {
                    obj.visible = false; // Physics-only; wireframe handled on planes
                }
            }
        });

        // Iterate over all plane entities mapped by the SceneUnderstandingSystem
        this.queries.planes.entities.forEach(entity => {
            const obj = entity.object3D;
            if (!obj) return;

            if (!entity.hasComponent(PhysicsBody)) {
                // First time: compute bounding box, add collider, add edge lines
                obj.visible = showWalls;

                const box = new THREE.Box3().setFromObject(obj);
                const size = new THREE.Vector3();
                box.getSize(size);

                if (size.x < 0.01) size.x = 0.05;
                if (size.y < 0.01) size.y = 0.05;
                if (size.z < 0.01) size.z = 0.05;

                obj.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = this.planeMat;
                        // Only add edge lines if not already added
                        if (!child.userData.edgesAdded) {
                            const edges = new THREE.EdgesGeometry(child.geometry);
                            const line = new THREE.LineSegments(edges, this.edgeMat);
                            line.userData.isRoomEdge = true;
                            child.add(line);
                            child.userData.edgesAdded = true;
                        }
                    }
                });

                entity.addComponent(PhysicsBody, { state: PhysicsState.Static })
                      .addComponent(PhysicsShape, {
                          shape: PhysicsShapeType.Box,
                          dimensions: [size.x, size.y, size.z],
                          friction: 0.2,
                          restitution: 1.2
                      });
            } else {
                // Every frame: sync visibility to the toggle flag
                obj.visible = showWalls;
            }
        });
    }
}
