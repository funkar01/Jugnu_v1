import { createSystem, XRMesh, PhysicsBody, PhysicsState, PhysicsShape, PhysicsShapeType } from "@iwsdk/core";
import * as THREE from "three";

export class RoomVisualizerSystem extends createSystem({
    meshes: { required: [XRMesh] }
}) {
    private wireframeMat!: THREE.MeshStandardMaterial;

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
    }

    update() {
        // Iterate over all entities mapped by the SceneUnderstandingSystem
        this.queries.meshes.entities.forEach(entity => {
            
            // If it doesn't have a PhysicsBody, this is a newly detected mesh
            if (!entity.hasComponent(PhysicsBody)) {
                
                // Phase 2: Anchor 1:1 static trimesh colliders inside the physics engine
                entity.addComponent(PhysicsBody, { state: PhysicsState.Static })
                      .addComponent(PhysicsShape, { 
                          shape: PhysicsShapeType.TriMesh, 
                          friction: 0.5, 
                          restitution: 0.8 
                      });
                
                // Phase 1: Apply custom shader material
                const obj = entity.object3D;
                if (obj) {
                    if (obj instanceof THREE.Mesh) {
                        obj.material = this.wireframeMat;
                    } else {
                        obj.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.material = this.wireframeMat;
                            }
                        });
                    }
                }
            }
        });
    }
}
