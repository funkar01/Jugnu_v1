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
    private state: 'None' | 'UI' | 'Bleed' = 'None';
    
    private uiMesh!: THREE.Mesh;
    private domainMesh!: THREE.Mesh;
    private bleedProgress = 0.0;
    private customMaterial!: THREE.ShaderMaterial;
    
    // Joint positions
    private leftTip = new THREE.Vector3();
    private rightTip = new THREE.Vector3();
    
    init() {
        // --- Phase 2: High-Performance Spatial UI ---
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        
        // Draw dark rounded rect
        ctx.fillStyle = 'rgba(20, 20, 20, 0.8)';
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 256, 32);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText("DOMAIN EXPANSION", 256, 80);
        
        // Button bounds visual
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(80, 140, 150, 60);
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(282, 140, 150, 60);
        
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Courier New';
        ctx.fillText("[ YES ]", 155, 178);
        ctx.fillStyle = '#ffffff';
        ctx.fillText("[ CANCEL ]", 357, 178);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        
        const uiMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        this.uiMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), uiMat);
        this.uiMesh.visible = false;
        
        this.world.createTransformEntity(this.uiMesh);

        // --- Phase 3: HDRI Loading & The Warp Bleed Transition ---
        const sphereGeom = new THREE.SphereGeometry(500, 60, 40);
        sphereGeom.scale(-1, 1, 1); // invert normals

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
    }
    
    private getPinchData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        if (!source || !source.hand || !this.xrFrame) return false;
        
        const indexTip = source.hand.get('index-finger-tip');
        if (!indexTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace) return false;

        const indexPose = this.xrFrame.getJointPose(indexTip, refSpace);
        
        if (indexPose) {
           tipPosOut.set(
               indexPose.transform.position.x,
               indexPose.transform.position.y,
               indexPose.transform.position.z
           );
           tipPosOut.applyMatrix4(this.player.matrixWorld);
           return true;
        }
        return false;
    }

    update(dt: number) {
        const hasLeft = this.getPinchData('left', this.leftTip);
        const hasRight = this.getPinchData('right', this.rightTip);
        
        if (this.state === 'None') {
            // --- Phase 1: Bimanual Index Trigger ---
            if (hasLeft && hasRight && !this.isDomainExpansionTriggered) {
                const dist = this.leftTip.distanceTo(this.rightTip);
                if (dist < 0.03) {
                    this.isDomainExpansionTriggered = true;
                    this.state = 'UI';
                    
                    // Spawn UI above Jugnu
                    for (const entity of this.queries.jugnu.entities) {
                        this.uiMesh.position.copy(entity.object3D.position);
                        break;
                    }
                    this.uiMesh.position.y += 0.25;
                    this.uiMesh.visible = true;
                }
            }
        } else if (this.state === 'UI') {
            this.uiMesh.lookAt(this.player.head.position);
            
            // Check interaction
            if (hasRight) {
                const localTip = this.rightTip.clone();
                this.uiMesh.worldToLocal(localTip);
                
                // If finger is close to the plane's depth
                if (Math.abs(localTip.z) < 0.05) { 
                    // YES Button region
                    if (localTip.x > -0.3 && localTip.x < 0.0 && localTip.y > -0.15 && localTip.y < 0.05) {
                        this.state = 'Bleed';
                        this.uiMesh.visible = false;
                        this.domainMesh.visible = true;
                        this.domainMesh.position.set(0, 0, 0); // Fixed massive sphere
                    }
                    // CANCEL Button region
                    if (localTip.x > 0.0 && localTip.x < 0.3 && localTip.y > -0.15 && localTip.y < 0.05) {
                        this.state = 'None';
                        this.uiMesh.visible = false;
                        setTimeout(() => { this.isDomainExpansionTriggered = false; }, 2000); // 2s debounce
                    }
                }
            }
        } else if (this.state === 'Bleed') {
            this.bleedProgress += dt * 0.5; // Takes 2 seconds to complete
            this.customMaterial.uniforms.u_bleedProgress.value = this.bleedProgress;
            this.customMaterial.uniforms.u_time.value += dt;
            
            if (this.bleedProgress >= 1.0) {
                this.bleedProgress = 1.0;
            }
        }
    }
}
