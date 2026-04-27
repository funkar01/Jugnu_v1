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
    
    private domainKeys = ["domainEnv", "domainEnv1", "domainEnv2", "domainEnv3"];
    private currentDomainIndex = 0;
    private targetDomainIndex = 0;
    private switchCooldown = 0;
    private switchState: 'None' | 'Out' | 'In' = 'None';
    private switchProgress = 1.0;

    private isMenuOpen = false;
    private menuMesh!: THREE.Mesh;
    private wristButtonMesh!: THREE.Mesh;
    private wristPos = new THREE.Vector3();
    private leftWristQuat = new THREE.Quaternion();
    private menuToggleCooldown = 0;

    init() {
        // --- Debug Keyboard Listener for Desktop ---
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'x') this.debugXPressed = true;
            if (e.key.toLowerCase() === 'y') this.debugYPressed = true;
            if (e.key.toLowerCase() === 'm') this.debugMPressed = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'x') this.debugXPressed = false;
            if (e.key.toLowerCase() === 'y') this.debugYPressed = false;
            if (e.key.toLowerCase() === 'm') this.debugMPressed = false;
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
        const menuCanvas = document.createElement('canvas');
        menuCanvas.width = 1024;
        menuCanvas.height = 256;
        const menuCtx = menuCanvas.getContext('2d')!;
        
        // Glass Background
        menuCtx.fillStyle = 'rgba(15, 15, 18, 0.8)';
        menuCtx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        menuCtx.lineWidth = 4;
        menuCtx.beginPath();
        menuCtx.roundRect(10, 10, 1004, 236, 24);
        menuCtx.fill();
        menuCtx.stroke();
        
        const loadThumbnails = async () => {
            const thumbKeys = ["thumb_domainEnv", "thumb_domainEnv1", "thumb_domainEnv2", "thumb_domainEnv3"];
            const padding = 15;
            const thumbW = 237;
            const thumbH = 226;
            
            for (let i = 0; i < 4; i++) {
                const tex = AssetManager.getTexture(thumbKeys[i]);
                if (tex && tex.image) {
                    const x = padding + i * (thumbW + padding);
                    const y = padding;
                    
                    menuCtx.save();
                    menuCtx.beginPath();
                    menuCtx.roundRect(x, y, thumbW, thumbH, 16);
                    menuCtx.clip();
                    menuCtx.drawImage(tex.image as CanvasImageSource, x, y, thumbW, thumbH);
                    menuCtx.restore();
                    
                    menuCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    menuCtx.lineWidth = 2;
                    menuCtx.stroke();
                    
                    menuCtx.fillStyle = 'white';
                    menuCtx.font = '24px sans-serif';
                    menuCtx.textAlign = 'center';
                    menuCtx.fillText(`Domain ${i}`, x + thumbW/2, y + thumbH - 15);
                }
            }
            if (this.menuMesh && this.menuMesh.material instanceof THREE.MeshBasicMaterial) {
                if (this.menuMesh.material.map) this.menuMesh.material.map.needsUpdate = true;
            }
        };
        setTimeout(loadThumbnails, 1000);

        const menuTex = new THREE.CanvasTexture(menuCanvas);
        menuTex.colorSpace = THREE.SRGBColorSpace;
        const menuGeom = new THREE.PlaneGeometry(1.0, 0.25);
        const menuMat = new THREE.MeshBasicMaterial({ map: menuTex, transparent: true, side: THREE.DoubleSide, depthTest: false });
        this.menuMesh = new THREE.Mesh(menuGeom, menuMat);
        this.menuMesh.renderOrder = 99;
        this.menuMesh.visible = false;
        this.world.createTransformEntity(this.menuMesh);
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
            this.isMenuOpen = !this.isMenuOpen;
            this.menuToggleCooldown = 1.0; // 1s debounce

            if (this.isMenuOpen) {
                // Advance Instruction Step 2 -> 3
                this.queries.jugnu.entities.forEach(e => {
                    if (e.getValue(Jugnu, "instructionStep") === 2) {
                        e.setValue(Jugnu, "instructionStep", 3);
                    }
                });
                
                // Spawn menu in front of the user
                const dir = new THREE.Vector3(0, 0, -1);
                const headWorldQuat = new THREE.Quaternion();
                this.player.head.getWorldQuaternion(headWorldQuat);
                dir.applyQuaternion(headWorldQuat);
                // Position 0.6m in front, slightly down
                this.menuMesh.position.copy(this.player.head.position).addScaledVector(dir, 0.6);
                this.menuMesh.position.y -= 0.1;
                this.menuMesh.lookAt(this.player.head.position);
                this.menuMesh.visible = true;
            } else {
                this.menuMesh.visible = false;
            }
        }

        if (this.isMenuOpen && this.menuMesh.visible && this.rightTip.lengthSq() > 0) {
            const localTip = this.rightTip.clone();
            this.menuMesh.worldToLocal(localTip);

            // Plane is 1.0 width x 0.25 height
            // Z depth threshold: 0.05
            if (Math.abs(localTip.z) < 0.05) {
                let selectedIndex = -1;
                if (localTip.x > -0.5 && localTip.x <= -0.25) selectedIndex = 0;
                else if (localTip.x > -0.25 && localTip.x <= 0.0) selectedIndex = 1;
                else if (localTip.x > 0.0 && localTip.x <= 0.25) selectedIndex = 2;
                else if (localTip.x > 0.25 && localTip.x <= 0.5) selectedIndex = 3;

                if (selectedIndex !== -1 && localTip.y > -0.125 && localTip.y < 0.125 && this.menuToggleCooldown <= 0.5) {
                    // Poked a thumbnail!
                    this.targetDomainIndex = selectedIndex;
                    this.isMenuOpen = false;
                    this.menuMesh.visible = false;
                    this.menuToggleCooldown = 1.0;

                    // Trigger the switch transition (if in bleed state)
                    if (this.state === 'Bleed' && this.switchState === 'None') {
                        this.switchState = 'Out';
                        this.switchProgress = 1.0;
                        this.switchCooldown = 2.0;
                    }
                }
            }
        }

        // --- Domain Switching (Y Button / Y Key) ---
        if (this.checkYButton() && this.switchCooldown <= 0 && this.state === 'Bleed' && this.bleedProgress >= 1.0 && this.switchState === 'None') {
            this.targetDomainIndex = (this.currentDomainIndex + 1) % this.domainKeys.length;
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
                this.currentDomainIndex = this.targetDomainIndex;
                const newTex = AssetManager.getTexture(this.domainKeys[this.currentDomainIndex]);
                if (newTex) {
                    newTex.colorSpace = THREE.SRGBColorSpace;
                    newTex.mapping = THREE.EquirectangularReflectionMapping;
                    
                    if (this.customMaterial) {
                        this.customMaterial.uniforms.u_texture.value = newTex;
                    }
                    if (this.initSphere && this.initSphere.material instanceof THREE.ShaderMaterial) {
                        this.initSphere.material.uniforms.u_texture.value = newTex;
                    }
                }
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

        const hasLeft = this.getIndexData('left', this.leftTip);
        const hasRight = this.getIndexData('right', this.rightTip);

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
                    
                    // Directly initialize Bleed state
                    this.state = 'Bleed';
                    if (this.uiMesh) this.uiMesh.visible = false;
                    if (this.domainMesh) {
                        this.domainMesh.visible = true;
                        this.domainMesh.position.set(0, 0, 0);
                    }
                    
                    if (this.initSphere) {
                        // Spawn exactly between the two index fingers
                        this.initSphere.position.lerpVectors(this.leftTip, this.rightTip, 0.5);
                        this.initSphere.visible = true;
                    }
                    
                    // Advance Instruction Step 1 -> 2
                    this.queries.jugnu.entities.forEach(e => {
                        if (e.getValue(Jugnu, "instructionStep") === 1) {
                            e.setValue(Jugnu, "instructionStep", 2);
                        }
                    });
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
