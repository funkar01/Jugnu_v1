import { createSystem } from "@iwsdk/core";
import * as THREE from "three";
import { Jugnu } from "./jugnu.js";

interface EmberParticle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    color: THREE.Color;
    baseScale: number;
    phase: number;
    life: number;
    age: number;
}

class DialogueBubble extends THREE.Group {
    private texture: THREE.CanvasTexture;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private mesh: THREE.Mesh;
    
    constructor(text: string) {
        super();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d')!;
        
        this.drawBubble(text);
        
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const geometry = new THREE.PlaneGeometry(0.8, 0.4);
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);
    }
    
    private drawBubble(text: string) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        
        const r = 24;
        const pad = 12;
        const bubbleW = w - pad * 2;
        const bubbleH = h - pad * 2 - 20;
        
        ctx.shadowColor = 'rgba(255, 102, 0, 0.4)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = 'rgba(10, 15, 35, 0.88)';
        ctx.strokeStyle = '#ff7c25';
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.roundRect(pad, pad, bubbleW, bubbleH, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(10, 15, 35, 0.88)';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 15, pad + bubbleH);
        ctx.lineTo(w / 2 + 15, pad + bubbleH);
        ctx.lineTo(w / 2, h - pad);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#ff7c25';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 15, pad + bubbleH);
        ctx.lineTo(w / 2, h - pad);
        ctx.lineTo(w / 2 + 15, pad + bubbleH);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '600 22px system-ui, -apple-system, sans-serif';
        
        const words = text.split(' ');
        let line = '';
        const lines: string[] = [];
        const maxWidth = bubbleW - 40;
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
                lines.push(line.trim());
                line = words[i] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line.trim());
        
        const startY = pad + bubbleH / 2 - ((lines.length - 1) * 30) / 2 + 6;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], w / 2, startY + i * 30);
        }
    }
    
    public dispose() {
        this.texture.dispose();
        if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(m => m.dispose());
        } else {
            this.mesh.material.dispose();
        }
        this.mesh.geometry.dispose();
    }
}

export class OnboardingSystem extends createSystem({ jugnu: { required: [Jugnu] } }) {
    // Void Mesh
    private voidMesh!: THREE.Mesh;
    
    // Embers Particle System
    private readonly MAX_EMBERS = 150;
    private embersPool: EmberParticle[] = [];
    private embersMesh!: THREE.InstancedMesh;
    private emberDummy = new THREE.Object3D();
    
    // Dynamic Orange PointLight
    private pointLight!: THREE.PointLight;
    

    
    // Dialogue Bubble for Phase 4
    private dialogueBubble: DialogueBubble | null = null;
    
    // Testing Timer Overlay
    private testTimerDiv: HTMLDivElement | null = null;
    
    // Audio Synthesizer Context
    private audioCtx: AudioContext | null = null;
    
    // Drone nodes
    private droneOsc1: OscillatorNode | null = null;
    private droneOsc2: OscillatorNode | null = null;
    private droneFilter: BiquadFilterNode | null = null;
    private droneGain: GainNode | null = null;
    private droneLfo: OscillatorNode | null = null;
    
    // Heartbeat nodes
    private heartbeatPanner: PannerNode | null = null;
    private heartbeatTimer = 0.0;
    private heartbeatInterval = 1.4; // 1.4s (85 BPM) in Phase 1, sweeps down to 0.6s (100 BPM) in Phase 2
    
    // Chime node timer
    private chimeTimer = 0.0;
    
    // Phase 3 & 4 Audio Track arrays
    private sportsSynthOscillators: OscillatorNode[] = [];
    private sportsSynthNodes: AudioBufferSourceNode[] = [];
    
    // Original Light intensities to restore
    private originalLights: { light: THREE.Light, intensity: number }[] = [];
    
    // Onboarding duration & timing
    private onboardingTime = 0.0;
    public state: 'phase1' | 'phase2' | 'revealing' | 'hello' | 'complete' = 'phase1';
    
    // Durations (Exactly 5.0 seconds each)
    private activeDuration = 5.0;     // 5s of slow drift and hand repulsion (Phase 1)
    private gatheringDuration = 5.0;  // 5s of swirling convergence galaxy (Phase 2)
    private transitionDuration = 5.0; // 5s of extruded star expansion & flash (Phase 3)
    private helloDuration = 5.0;      // 5s of giggle, 360 flip and dialogue (Phase 4)
    
    // Hands & controller tracking scratch variables
    private leftHandTip = new THREE.Vector3();
    private rightHandTip = new THREE.Vector3();
    private mousePos = new THREE.Vector3(0, 1.45, -0.6);
    private mouseCoords = new THREE.Vector2(); // Screen coordinates [-1, 1]
    private jugnuBasePos = new THREE.Vector3();
    
    // Scratch variables for Zero-GC loops
    private scratchV3 = new THREE.Vector3();
    private scratchV3_2 = new THREE.Vector3();
    private scratchColor = new THREE.Color();
    private scratchMatrix = new THREE.Matrix4();
    private originalBackground: THREE.Color | THREE.Texture | null = null;
    
    init() {
        console.log("[OnboardingSystem] Initializing Cinematic Onboarding Phase 1 & 2...");
        (window as any).onboardingSystem = this;
        (window as any).onboardingActive = true;
        (window as any).onboardingComplete = false;
        
        // Expose trigger to start audio on user interaction
        (window as any).startOnboardingAudio = () => this.startAudio();
        
        // Create void mesh - massive sphere blocking out surroundings in both AR and VR
        const voidGeo = new THREE.SphereGeometry(15, 32, 16);
        const voidMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
        this.voidMesh = new THREE.Mesh(voidGeo, voidMat);
        this.voidMesh.position.set(0, 0, 0);
        this.voidMesh.renderOrder = -100;
        this.world.createTransformEntity(this.voidMesh);
        
        // Create dynamic warm orange PointLight at the particle condensation point (Y=1.45 eye level, Z=-0.8 desk)
        this.pointLight = new THREE.PointLight(0xff6600, 0.0, 5.0);
        this.pointLight.position.set(0, 1.45, -0.8);
        this.pointLight.visible = false;
        this.world.createTransformEntity(this.pointLight);
        

        
        // Pre-allocate embers pool
        for (let i = 0; i < this.MAX_EMBERS; i++) {
            this.embersPool.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                baseScale: 1.0,
                phase: Math.random() * Math.PI * 2,
                life: 3.5 + Math.random() * 3.5,
                age: Math.random() * 3.0
            });
            this.respawnEmber(this.embersPool[i]);
        }
        
        // Setup InstancedMesh for embers
        const emberGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
        const emberMat = new THREE.MeshBasicMaterial({
            color: 0xffaa33, // Warm gold-orange fallback color
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.embersMesh = new THREE.InstancedMesh(emberGeo, emberMat, this.MAX_EMBERS);
        this.embersMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.embersMesh.instanceColor) {
            this.embersMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        
        // Hide all instances initially
        const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < this.MAX_EMBERS; i++) {
            this.embersMesh.setMatrixAt(i, zeroMatrix);
            this.embersMesh.setColorAt(i, this.scratchColor.setHex(0x000000));
        }
        this.embersMesh.instanceMatrix.needsUpdate = true;
        if (this.embersMesh.instanceColor) this.embersMesh.instanceColor.needsUpdate = true;
        
        this.world.createTransformEntity(this.embersMesh);
        
        // Register mouse move listener for 2D desktop preview interaction
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Fallback triggers for Web Audio API permissions
        window.addEventListener('pointerdown', () => this.startAudio(), { once: true });
        window.addEventListener('keydown', () => this.startAudio(), { once: true });

        // Create testing timer overlay in top right corner
        this.testTimerDiv = document.createElement('div');
        this.testTimerDiv.id = 'onboarding-test-timer';
        this.testTimerDiv.style.position = 'fixed';
        this.testTimerDiv.style.top = '20px';
        this.testTimerDiv.style.right = '20px';
        this.testTimerDiv.style.backgroundColor = 'rgba(10, 15, 30, 0.85)';
        this.testTimerDiv.style.border = '1.5px solid #ff7c25';
        this.testTimerDiv.style.borderRadius = '8px';
        this.testTimerDiv.style.padding = '10px 16px';
        this.testTimerDiv.style.color = '#ffaa33';
        this.testTimerDiv.style.fontFamily = 'monospace';
        this.testTimerDiv.style.fontSize = '15px';
        this.testTimerDiv.style.fontWeight = '600';
        this.testTimerDiv.style.boxShadow = '0 4px 20px rgba(255, 102, 0, 0.25)';
        this.testTimerDiv.style.zIndex = '99999';
        this.testTimerDiv.style.pointerEvents = 'none';
        document.body.appendChild(this.testTimerDiv);
    }
    
    private respawnEmber(p: EmberParticle) {
        // Spawn directly in front of the camera's view frustum
        p.position.set(
            (Math.random() - 0.5) * 3.0,
            0.6 + Math.random() * 1.5,
            -0.1 - Math.random() * 2.2
        );
        
        // Drifting velocity
        p.velocity.set(
            (Math.random() - 0.5) * 0.12,
            0.05 + Math.random() * 0.08, // Solid upward drift
            (Math.random() - 0.5) * 0.12
        );
        
        // Gradient color selection (Orange and Gold)
        const rand = Math.random();
        if (rand > 0.6) {
            p.color.setHex(0xffb547); // Warm bright gold
        } else if (rand > 0.25) {
            p.color.setHex(0xff7c25); // Vibrant neon orange
        } else {
            p.color.setHex(0xffd255); // Glowing pale gold
        }
        
        p.baseScale = 0.8 + Math.random() * 1.6;
        p.age = 0.0;
        p.life = 3.5 + Math.random() * 3.5;
        p.phase = Math.random() * Math.PI * 2;
    }
    
    private handleMouseMove(e: MouseEvent) {
        if (this.state === 'complete') return;
        this.mouseCoords.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseCoords.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }
    
    private getJointWorldData(handedness: 'left' | 'right', jointName: string, posOut: THREE.Vector3): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;
        
        const joint = source.hand.get(jointName as any);
        if (!joint) return false;
        
        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;
        
        const pose = frame.getJointPose(joint, refSpace);
        if (pose) {
            posOut.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
            posOut.applyMatrix4(this.player.matrixWorld);
            return true;
        }
        return false;
    }
    
    // Audio synthesis setup
    startAudio() {
        if (this.audioCtx) return;
        
        try {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            
            console.log("[OnboardingSystem] Initializing Web Audio Synth context.");
            const t = this.audioCtx.currentTime;
            
            // 1. Setup Drone Synth
            this.droneGain = this.audioCtx.createGain();
            this.droneGain.gain.setValueAtTime(0.001, t);
            this.droneGain.gain.exponentialRampToValueAtTime(0.04, t + 1.5); // Smooth fade in
            this.droneGain.connect(this.audioCtx.destination);
            
            this.droneFilter = this.audioCtx.createBiquadFilter();
            this.droneFilter.type = 'lowpass';
            this.droneFilter.frequency.setValueAtTime(130, t);
            this.droneFilter.Q.setValueAtTime(4.0, t);
            this.droneFilter.connect(this.droneGain);
            
            // Osc 1: Deep Sine wave drone at 55Hz (A1)
            this.droneOsc1 = this.audioCtx.createOscillator();
            this.droneOsc1.type = 'sine';
            this.droneOsc1.frequency.setValueAtTime(55, t);
            this.droneOsc1.connect(this.droneFilter);
            
            // Osc 2: Sub triangle wave drone at 110Hz (A2)
            this.droneOsc2 = this.audioCtx.createOscillator();
            this.droneOsc2.type = 'triangle';
            this.droneOsc2.frequency.setValueAtTime(110, t);
            this.droneOsc2.connect(this.droneFilter);
            
            // LFO to slowly modulate filter frequency
            this.droneLfo = this.audioCtx.createOscillator();
            this.droneLfo.type = 'sine';
            this.droneLfo.frequency.setValueAtTime(0.12, t);
            
            const lfoGain = this.audioCtx.createGain();
            lfoGain.gain.setValueAtTime(35, t);
            
            this.droneLfo.connect(lfoGain);
            lfoGain.connect(this.droneFilter.frequency);
            
            // Start oscillators
            this.droneOsc1.start(t);
            this.droneOsc2.start(t);
            this.droneLfo.start(t);
            
            // 2. Setup Heartbeat Spatial Panner
            this.heartbeatPanner = this.audioCtx.createPanner();
            this.heartbeatPanner.panningModel = 'HRTF';
            this.heartbeatPanner.distanceModel = 'inverse';
            this.heartbeatPanner.refDistance = 0.1;
            this.heartbeatPanner.maxDistance = 10.0;
            this.heartbeatPanner.rolloffFactor = 1.0;
            this.heartbeatPanner.connect(this.audioCtx.destination);
            
            this.playHeartbeat();
            
        } catch (e) {
            console.warn("[OnboardingSystem] AudioContext creation failed:", e);
        }
    }
    
    private playHeartbeat() {
        if (!this.audioCtx || this.state === 'complete') return;
        
        const t = this.audioCtx.currentTime;
        
        // Double heartbeat: lub-dub
        this.triggerHeartbeatPulse(t, 72, 0.15, 0.13);
        this.triggerHeartbeatPulse(t + 0.25, 82, 0.20, 0.16);
    }
    
    private triggerHeartbeatPulse(time: number, startFreq: number, volume: number, duration: number) {
        if (!this.audioCtx || !this.heartbeatPanner) return;
        
        const osc = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(this.heartbeatPanner);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(18, time + duration);
        
        gainNode.gain.setValueAtTime(0.001, time);
        gainNode.gain.linearRampToValueAtTime(volume * (this.state === 'revealing' ? 0.3 : 1.0), time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.start(time);
        osc.stop(time + duration + 0.05);
    }
    
    // Synthesize high-frequency glittering chime notes in rapid succession (glissando style)
    private playGlitterChime() {
        if (!this.audioCtx || !this.heartbeatPanner || this.state === 'complete') return;
        
        const t = this.audioCtx.currentTime;
        const notes = [1700, 2200, 2700];
        
        notes.forEach((freq, index) => {
            const timeOffset = index * 0.07; // Rapid cascade delay
            const osc = this.audioCtx!.createOscillator();
            const gainNode = this.audioCtx!.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(this.heartbeatPanner!);
            
            osc.type = 'sine';
            const actualFreq = freq + (Math.random() - 0.5) * 120; // Soft pitch randomization
            osc.frequency.setValueAtTime(actualFreq, t + timeOffset);
            
            gainNode.gain.setValueAtTime(0.001, t + timeOffset);
            gainNode.gain.linearRampToValueAtTime(0.025, t + timeOffset + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + timeOffset + 0.07);
            
            osc.start(t + timeOffset);
            osc.stop(t + timeOffset + 0.09);
        });
    }
    
    private captureAndDimLights() {
        if (this.originalLights.length > 0) return;
        
        console.log("[OnboardingSystem] Dimming lights to establish absolute dark space.");
        this.world.scene.traverse((obj) => {
            if ((obj as any).isLight) {
                const light = obj as THREE.Light;
                // Exclude our dynamic pointLight
                if (light !== this.pointLight) {
                    this.originalLights.push({
                        light,
                        intensity: light.intensity
                    });
                    light.intensity = 0.0;
                }
            }
        });
        
        // Capture background color/texture and set to pitch black
        this.originalBackground = this.world.scene.background;
        this.world.scene.background = new THREE.Color(0x000000);
    }
    
    private restoreLights(ratio: number) {
        // ratio: 0.0 -> 1.0
        for (const entry of this.originalLights) {
            entry.light.intensity = entry.intensity * ratio;
        }
        
        // Blend background color back safely
        const isXR = (this.renderer.xr as any).isPresenting;
        if (!isXR && this.originalBackground instanceof THREE.Color && this.world.scene.background instanceof THREE.Color) {
            this.world.scene.background.copy(this.originalBackground).multiplyScalar(ratio);
        }
    }
    
    update(dt: number) {
        if (this.state === 'complete') return;
        
        const safeDt = Math.min(dt, 0.03);
        this.onboardingTime += safeDt;

        // Update the testing timer overlay
        if (this.testTimerDiv) {
            let phaseNum = 1;
            if (this.state === 'phase2') phaseNum = 2;
            else if (this.state === 'revealing') phaseNum = 3;
            else if (this.state === 'hello') phaseNum = 4;
            this.testTimerDiv.textContent = `PHASE: ${phaseNum} (${this.state.toUpperCase()}) | TIME: ${this.onboardingTime.toFixed(2)}s`;
        }
        
        // Dim lights initially
        if (this.onboardingTime > 0.01) {
            this.captureAndDimLights();
        }
        
        // Lock void sphere position to the player's head center
        if (this.voidMesh && this.player) {
            this.voidMesh.position.copy(this.player.head.position);
        }
        
        // Heartbeat triggering schedule
        this.heartbeatTimer += safeDt;
        if (this.heartbeatTimer >= this.heartbeatInterval) {
            this.heartbeatTimer = 0.0;
            this.playHeartbeat();
        }
        
        // Orbit the heartbeat panner around the player's head (8D spatial panning)
        if (this.audioCtx && this.heartbeatPanner && this.player) {
            const time = this.onboardingTime;
            const radius = 1.6;
            const px = radius * Math.sin(time * 0.85);
            const py = 1.45 + 0.2 * Math.sin(time * 1.2);
            const pz = radius * Math.cos(time * 0.85);
            
            // Convert to head relative coordinates
            this.scratchV3.set(px, py, pz);
            const headMat = this.player.head.matrixWorld;
            this.scratchV3.applyMatrix4(this.scratchMatrix.copy(headMat).invert());
            
            const now = this.audioCtx.currentTime;
            this.heartbeatPanner.positionX.setValueAtTime(this.scratchV3.x, now);
            this.heartbeatPanner.positionY.setValueAtTime(this.scratchV3.y, now);
            this.heartbeatPanner.positionZ.setValueAtTime(this.scratchV3.z, now);
        }
        
        // Query hand tracking/controller data
        let leftActive = this.getJointWorldData('left', 'index-finger-tip', this.leftHandTip);
        let rightActive = this.getJointWorldData('right', 'index-finger-tip', this.rightHandTip);
        
        if (!leftActive && this.player && this.player.raySpaces.left) {
            this.player.raySpaces.left.getWorldPosition(this.leftHandTip);
            leftActive = true;
        }
        if (!rightActive && this.player && this.player.raySpaces.right) {
            this.player.raySpaces.right.getWorldPosition(this.rightHandTip);
            rightActive = true;
        }
        
        // Project 2D mouse cursor coordinates
        const isXR = (this.renderer.xr as any).isPresenting;
        if (!isXR && this.world.camera) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(this.mouseCoords, this.world.camera);
            raycaster.ray.at(1.1, this.mousePos);
        }
        
        // --- State Machine Transitions ---
        if (this.state === 'phase1') {
            if (this.onboardingTime >= this.activeDuration) {
                console.log("[OnboardingSystem] Transitioning to Phase 2: The Gathering...");
                this.state = 'phase2';
                this.pointLight.visible = true;
                this.chimeTimer = 0.0;
            }
        } else if (this.state === 'phase2') {
            if (this.onboardingTime >= this.activeDuration + this.gatheringDuration) {
                console.log("[OnboardingSystem] Transitioning to Phase 3: Ignition & Formation...");
                this.state = 'revealing';
                
                // Hide embers, reveal active companion with face visible
                this.embersMesh.visible = false;
                let jugEntity: any = null;
                for (const e of this.queries.jugnu.entities) {
                    jugEntity = e;
                    break;
                }
                if (jugEntity && jugEntity.object3D) {
                    const jugModel = jugEntity.object3D;
                    jugModel.visible = true;
                    this.jugnuBasePos.copy(jugModel.position);
                    if (typeof (jugModel as any).setFaceOpacity === 'function') {
                        (jugModel as any).setFaceOpacity(1.0);
                    }
                    if (typeof (jugModel as any).setMood === 'function') {
                        (jugModel as any).setMood('happy');
                    }
                    jugModel.scale.setScalar(0.001); // Shrink to animate expansion
                }
                
                // Pop & Synthesis track triggers
                this.playGlassyPop();
                if (this.audioCtx) {
                    this.playSportsSynthBeat(this.audioCtx.currentTime);
                }
            }
        } else if (this.state === 'revealing') {
            if (this.onboardingTime >= this.activeDuration + this.gatheringDuration + this.transitionDuration) {
                console.log("[OnboardingSystem] Transitioning to Phase 4: The Hello...");
                this.state = 'hello';
                
                // Play giggle and show dialogue bubble
                this.playJugnuGiggle();
                this.dialogueBubble = new DialogueBubble("Hey there! I'm Jugnu, your virtual captain. Ready to light up the field?");
                this.dialogueBubble.position.set(0, 1.82, -0.8);
                this.dialogueBubble.scale.setScalar(0.001);
                this.world.createTransformEntity(this.dialogueBubble);
            }
        } else if (this.state === 'hello') {
            if (this.onboardingTime >= this.activeDuration + this.gatheringDuration + this.transitionDuration + this.helloDuration) {
                this.completeOnboarding();
                return;
            }
        }
        
        // --- Phase 2: Audio Modulations and Chimes Swell ---
        if (this.state === 'phase2') {
            const ratio = (this.onboardingTime - this.activeDuration) / this.gatheringDuration;
            
            // Build dynamic point light intensity (up to 8.0) casting glow on hands
            this.pointLight.intensity = ratio * 8.0;
            
            // Synthesize glittering chime sweeps every 0.35s
            this.chimeTimer += safeDt;
            if (this.chimeTimer >= 0.35) {
                this.chimeTimer = 0.0;
                this.playGlitterChime();
            }
            
            // Sweep drone pitches and filters up to build a futuristic crescendo swell
            if (this.audioCtx && this.droneOsc1 && this.droneOsc2 && this.droneFilter && this.droneGain) {
                const t = this.audioCtx.currentTime;
                // Osc 1 (55Hz -> 165Hz), Osc 2 (110Hz -> 330Hz)
                this.droneOsc1.frequency.setValueAtTime(55 + ratio * 110, t);
                this.droneOsc2.frequency.setValueAtTime(110 + ratio * 220, t);
                
                // Filter frequency sweeps up (130Hz -> 550Hz) to open sound spectrum
                this.droneFilter.frequency.setValueAtTime(130 + ratio * 420, t);
                
                // Sweep drone volume swell (0.04 -> 0.12)
                this.droneGain.gain.setValueAtTime(0.04 + ratio * 0.08, t);
                
                // Heartbeat rate accelerates from 1.4s cycle down to 0.6s cycle
                this.heartbeatInterval = 1.4 - ratio * 0.8;
            }
        } else if (this.state === 'revealing') {
            const revealTime = this.onboardingTime - (this.activeDuration + this.gatheringDuration);
            
            // Underdamped spring jelly bounce scale animation
            const bounceScale = Math.max(0.001, 1.0 * (1.0 - Math.cos(revealTime * 14.0) * Math.exp(-revealTime * 5.0)));
            
            // Update active companion scale (0.2 is default scale, so scale goes 0 -> 0.2)
            let jugEntity: any = null;
            for (const e of this.queries.jugnu.entities) {
                jugEntity = e;
                break;
            }
            if (jugEntity && jugEntity.object3D) {
                const jugModel = jugEntity.object3D;
                jugModel.scale.setScalar(0.2 * bounceScale);
                if (typeof (jugModel as any).setFaceOpacity === 'function') {
                    (jugModel as any).setFaceOpacity(1.0);
                }
                if (typeof (jugModel as any).setMood === 'function') {
                    (jugModel as any).setMood('happy');
                }
            }
            
            // Light and environment flash behavior (first 1.5s is flash + stadium reveal)
            const flashDuration = 1.5;
            if (revealTime < flashDuration) {
                const ratio = revealTime / flashDuration;
                
                // Peak flash decay
                const flashIntensity = 50.0 * Math.exp(-revealTime * 6.0) + 8.0;
                this.pointLight.intensity = flashIntensity;
                
                // Void opacity: transparent (0.15) at peak, fades back to black (1.0)
                const voidOpacity = 0.15 + 0.85 * ratio;
                if (this.voidMesh.material) {
                    (this.voidMesh.material as THREE.Material).opacity = voidOpacity;
                }
                
                // Original lights: spike then decay
                this.restoreLights(1.3 * (1.0 - ratio));
            } else {
                // Stadium fade back finished, focus back on character
                this.pointLight.intensity = 8.0;
                if (this.voidMesh.material) {
                    (this.voidMesh.material as THREE.Material).opacity = 1.0;
                }
                this.restoreLights(0.0);
            }
            
            // Heartbeat remains at elevated speed
            this.heartbeatInterval = 0.6;
            
        } else if (this.state === 'hello') {
            const helloTime = this.onboardingTime - (this.activeDuration + this.gatheringDuration + this.transitionDuration);
            
            // Dialogue bubble scale spring animation (scales up in the first 0.6s)
            if (this.dialogueBubble) {
                const bubbleScale = Math.min(1.0, helloTime / 0.6);
                const springScale = Math.max(0.001, bubbleScale * (1.0 - Math.cos(helloTime * 12.0) * Math.exp(-helloTime * 6.0)));
                this.dialogueBubble.scale.setScalar(springScale);
                
                // Make bubble billboarding face camera
                if (this.world.camera) {
                    this.dialogueBubble.lookAt(this.world.camera.position);
                }
            }
            
            // Playful weightless 360 flip and face blink (starts fully visible, closes eyes and reopens)
            let faceOpacity = 1.0;
            if (helloTime >= 0.2 && helloTime < 0.35) {
                faceOpacity = 1.0 - (helloTime - 0.2) / 0.15; // smooth close
            } else if (helloTime >= 0.35 && helloTime < 0.5) {
                faceOpacity = (helloTime - 0.35) / 0.15; // smooth open
            } else {
                faceOpacity = 1.0;
            }
            
            const flipDuration = 1.5;
            let jugEntity: any = null;
            for (const e of this.queries.jugnu.entities) {
                jugEntity = e;
                break;
            }
            if (jugEntity && jugEntity.object3D) {
                const jugModel = jugEntity.object3D;
                if (typeof (jugModel as any).setFaceOpacity === 'function') {
                    (jugModel as any).setFaceOpacity(faceOpacity);
                }
                
                if (helloTime < flipDuration) {
                    const progress = helloTime / flipDuration;
                    
                    // 360 degree rotation around X axis
                    jugModel.rotation.x = progress * Math.PI * 2;
                    
                    // Weightless float jump (sine path)
                    const jumpHeight = 0.18;
                    jugModel.position.y = this.jugnuBasePos.y + jumpHeight * Math.sin(progress * Math.PI);
                    
                    // Emit sparkle trail
                    const spatialFX = (window as any).spatialFX;
                    if (spatialFX) {
                        spatialFX.triggerSpark(jugModel.position, new THREE.Color(0xffaa33), 2);
                    }
                } else {
                    // Reset position and rotation after flip completes
                    jugModel.rotation.x = 0;
                    jugModel.position.copy(this.jugnuBasePos);
                }
            }
            
            // In the last 1.5 seconds of Phase 4 (from 3.5s to 5.0s), fade out void sphere and fade in room lights
            if (helloTime > 3.5) {
                const fadeRatio = (helloTime - 3.5) / 1.5; // 0 -> 1
                
                // Fade out void dome opacity
                if (this.voidMesh.material) {
                    (this.voidMesh.material as THREE.Material).opacity = Math.max(1.0 - fadeRatio, 0.0);
                }
                
                // Smoothly restore room lighting intensities
                this.restoreLights(fadeRatio);
                
                // Fade out dialogue bubble
                if (this.dialogueBubble) {
                    this.dialogueBubble.scale.setScalar(Math.max(0.001, 1.0 - fadeRatio));
                }
            }
        }
        
        // --- Embers Particle Galaxy updates ---
        const centerPos = this.player ? this.player.head.position : this.scratchV3_2.set(0, 1.45, 0);
        
        // Target point where particles condense (Jugnu spawn point)
        const targetX = 0.0;
        const targetY = 1.45;
        const targetZ = -0.8;
        
        for (let i = 0; i < this.MAX_EMBERS; i++) {
            const p = this.embersPool[i];
            p.age += safeDt;
            
            if (p.age >= p.life) {
                this.respawnEmber(p);
            } else {
                p.phase += safeDt * 1.4;
                
                if (this.state === 'phase1') {
                    // --- Phase 1: Lazy drift + hand repulsion ---
                    p.position.addScaledVector(p.velocity, safeDt);
                    
                    if (leftActive) {
                        const distLeft = p.position.distanceTo(this.leftHandTip);
                        if (distLeft < 0.4) {
                            const pushDir = this.scratchV3.subVectors(p.position, this.leftHandTip).normalize();
                            p.velocity.addScaledVector(pushDir, (1.0 - distLeft / 0.4) * 2.8 * safeDt);
                        }
                    }
                    if (rightActive) {
                        const distRight = p.position.distanceTo(this.rightHandTip);
                        if (distRight < 0.4) {
                            const pushDir = this.scratchV3.subVectors(p.position, this.rightHandTip).normalize();
                            p.velocity.addScaledVector(pushDir, (1.0 - distRight / 0.4) * 2.8 * safeDt);
                        }
                    }
                    if (!isXR) {
                        const distMouse = p.position.distanceTo(this.mousePos);
                        if (distMouse < 0.35) {
                            const pushDir = this.scratchV3.subVectors(p.position, this.mousePos).normalize();
                            p.velocity.addScaledVector(pushDir, (1.0 - distMouse / 0.35) * 2.8 * safeDt);
                        }
                    }
                    
                    p.velocity.multiplyScalar(1.0 - 1.1 * safeDt); // High damping for slow float
                    
                } else {
                    // --- Phase 2, 3 & 4: Swirling Galaxy Gravitational Pull ---
                    const dx = targetX - p.position.x;
                    const dy = targetY - p.position.y;
                    const dz = targetZ - p.position.z;
                    
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    if (dist < 0.05) {
                        p.velocity.set(
                            (Math.random() - 0.5) * 0.18,
                            (Math.random() - 0.5) * 0.18,
                            (Math.random() - 0.5) * 0.18
                        );
                    } else {
                        const rx = dx / dist;
                        const ry = dy / dist;
                        const rz = dz / dist;
                        
                        const tx = -rz;
                        const ty = 0.0;
                        const tz = rx;
                        
                        const tLen = Math.sqrt(tx*tx + tz*tz);
                        const tnx = tLen > 0.0001 ? tx / tLen : 0.0;
                        const tnz = tLen > 0.0001 ? tz / tLen : 0.0;
                        
                        let ratio = 0.0;
                        if (this.state === 'phase2') {
                            ratio = (this.onboardingTime - this.activeDuration) / this.gatheringDuration;
                        } else {
                            ratio = 1.0;
                        }
                        
                        const pullAccel = 0.6 + ratio * 2.8;
                        const swirlAccel = 1.8 + ratio * 5.0;
                        
                        p.velocity.x += (rx * pullAccel + tnx * swirlAccel) * safeDt;
                        p.velocity.y += (ry * pullAccel) * safeDt;
                        p.velocity.z += (rz * pullAccel + tnz * swirlAccel) * safeDt;
                    }
                    
                    p.velocity.multiplyScalar(1.0 - 0.35 * safeDt);
                    p.position.addScaledVector(p.velocity, safeDt);
                }
                
                if (this.state === 'phase1') {
                    const distToCenter = p.position.distanceTo(centerPos);
                    if (distToCenter > 3.0 || p.position.y > 2.8 || p.position.y < 0.2) {
                        this.respawnEmber(p);
                    }
                }
                
                const ageRatio = p.age / p.life;
                let opacity = 1.0;
                if (ageRatio < 0.12) {
                    opacity = ageRatio / 0.12;
                } else if (ageRatio > 0.82) {
                    opacity = 1.0 - (ageRatio - 0.82) / 0.18;
                }
                
                if (this.state !== 'phase1') {
                    opacity *= Math.max(1.0 - (this.onboardingTime - this.activeDuration) / (this.gatheringDuration), 0.0);
                }
                
                const scale = p.baseScale * opacity;
                this.emberDummy.position.copy(p.position);
                
                if (this.state === 'phase1') {
                    this.emberDummy.position.x += Math.sin(p.phase) * 0.035; 
                    this.emberDummy.position.z += Math.cos(p.phase) * 0.035;
                }
                
                this.emberDummy.scale.set(scale, scale, scale);
                this.emberDummy.updateMatrix();
                this.embersMesh.setMatrixAt(i, this.emberDummy.matrix);
                
                this.scratchColor.copy(p.color).multiplyScalar(opacity);
                this.embersMesh.setColorAt(i, this.scratchColor);
            }
        }
        
        this.embersMesh.instanceMatrix.needsUpdate = true;
        if (this.embersMesh.instanceColor) this.embersMesh.instanceColor.needsUpdate = true;
    }
    
    // --- Audio Synthesis Methods for Phase 3 & 4 ---
    private playGlassyPop() {
        if (!this.audioCtx) return;
        
        const t = this.audioCtx.currentTime;
        
        // click triangle sweep
        const clickOsc = this.audioCtx.createOscillator();
        const clickGain = this.audioCtx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(3200, t);
        clickOsc.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
        
        clickGain.gain.setValueAtTime(0.03, t);
        clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        
        clickOsc.connect(clickGain);
        clickGain.connect(this.audioCtx.destination);
        clickOsc.start(t);
        clickOsc.stop(t + 0.05);
        
        // bubble sine sweep
        const popOsc = this.audioCtx.createOscillator();
        const popGain = this.audioCtx.createGain();
        popOsc.type = 'sine';
        popOsc.frequency.setValueAtTime(1100, t);
        popOsc.frequency.exponentialRampToValueAtTime(280, t + 0.08);
        
        popGain.gain.setValueAtTime(0.06, t);
        popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        
        popOsc.connect(popGain);
        popGain.connect(this.audioCtx.destination);
        popOsc.start(t);
        popOsc.stop(t + 0.1);
        
        this.sportsSynthOscillators.push(clickOsc, popOsc);
    }
    
    private playSportsSynthBeat(startTime: number) {
        if (!this.audioCtx) return;
        
        const bpm = 125;
        const beatSec = 60 / bpm;
        const numBeats = 10; // Schedule beats covering ~4.8 seconds
        
        const sampleRate = this.audioCtx.sampleRate;
        const noiseBufferSize = sampleRate * 3.0;
        const noiseBuffer = this.audioCtx.createBuffer(1, noiseBufferSize, sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBufferSize; i++) {
            data[i] = Math.random() * 2.0 - 1.0;
        }
        
        // Play Stadium Cheers wash
        const cheerNode = this.audioCtx.createBufferSource();
        cheerNode.buffer = noiseBuffer;
        
        const cheerFilter = this.audioCtx.createBiquadFilter();
        cheerFilter.type = 'bandpass';
        cheerFilter.frequency.setValueAtTime(800, startTime);
        cheerFilter.frequency.exponentialRampToValueAtTime(1400, startTime + 2.0);
        cheerFilter.frequency.exponentialRampToValueAtTime(1000, startTime + 4.5);
        cheerFilter.Q.setValueAtTime(1.5, startTime);
        
        const cheerGain = this.audioCtx.createGain();
        cheerGain.gain.setValueAtTime(0.001, startTime);
        cheerGain.gain.linearRampToValueAtTime(0.02, startTime + 1.2);
        cheerGain.gain.linearRampToValueAtTime(0.015, startTime + 2.8);
        cheerGain.gain.exponentialRampToValueAtTime(0.001, startTime + 4.8);
        
        cheerNode.connect(cheerFilter);
        cheerFilter.connect(cheerGain);
        cheerGain.connect(this.audioCtx.destination);
        cheerNode.start(startTime);
        cheerNode.stop(startTime + 4.8);
        
        this.sportsSynthNodes.push(cheerNode);
        
        for (let b = 0; b < numBeats; b++) {
            const beatTime = startTime + b * beatSec;
            
            this.triggerKickDrum(beatTime);
            
            const offBeatTime = beatTime + beatSec * 0.5;
            this.triggerHiHat(offBeatTime, noiseBuffer);
            
            const notes = [55.0, 65.4, 73.4, 98.0];
            const noteFreq = notes[b % notes.length];
            this.triggerBassNote(beatTime, noteFreq, beatSec * 0.4);
            
            const offBassFreq = noteFreq * 2.0;
            this.triggerBassNote(offBeatTime, offBassFreq, beatSec * 0.25, 0.3);
        }
    }
    
    private triggerKickDrum(time: number) {
        if (!this.audioCtx) return;
        
        const osc = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
        
        gainNode.gain.setValueAtTime(0.12, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        
        osc.start(time);
        osc.stop(time + 0.18);
        this.sportsSynthOscillators.push(osc);
    }
    
    private triggerHiHat(time: number, noiseBuffer: AudioBuffer) {
        if (!this.audioCtx) return;
        
        const source = this.audioCtx.createBufferSource();
        source.buffer = noiseBuffer;
        
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000, time);
        
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.012, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        
        source.start(time);
        source.stop(time + 0.06);
        this.sportsSynthNodes.push(source);
    }
    
    private triggerBassNote(time: number, freq: number, duration: number, volScale: number = 1.0) {
        if (!this.audioCtx) return;
        
        const osc = this.audioCtx.createOscillator();
        const filter = this.audioCtx.createBiquadFilter();
        const gainNode = this.audioCtx.createGain();
        
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, time);
        filter.frequency.exponentialRampToValueAtTime(150, time + duration);
        filter.Q.setValueAtTime(2.0, time);
        
        gainNode.gain.setValueAtTime(0.025 * volScale, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.start(time);
        osc.stop(time + duration + 0.05);
        this.sportsSynthOscillators.push(osc);
    }
    
    private playJugnuGiggle() {
        if (!this.audioCtx) return;
        
        const t = this.audioCtx.currentTime;
        const delays = [0.0, 0.06, 0.12, 0.18];
        const freqs = [
            { start: 900, end: 1400, type: 'sine' as OscillatorType },
            { start: 1100, end: 1600, type: 'sine' as OscillatorType },
            { start: 1300, end: 1800, type: 'sine' as OscillatorType },
            { start: 1600, end: 1300, type: 'sine' as OscillatorType }
        ];
        
        freqs.forEach((f, i) => {
            const timeOffset = delays[i];
            const osc = this.audioCtx!.createOscillator();
            const gainNode = this.audioCtx!.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(this.audioCtx!.destination);
            
            osc.type = f.type;
            osc.frequency.setValueAtTime(f.start, t + timeOffset);
            osc.frequency.exponentialRampToValueAtTime(f.end, t + timeOffset + 0.06);
            
            gainNode.gain.setValueAtTime(0.025, t + timeOffset);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + timeOffset + 0.07);
            
            osc.start(t + timeOffset);
            osc.stop(t + timeOffset + 0.08);
            this.sportsSynthOscillators.push(osc);
        });
    }
    
    private completeOnboarding() {
        console.log("[OnboardingSystem] Onboarding complete! Wake up Jugnu companion.");
        this.state = 'complete';
        (window as any).onboardingActive = false;
        (window as any).onboardingComplete = true;

        if (this.testTimerDiv) {
            this.testTimerDiv.remove();
            this.testTimerDiv = null;
        }
        
        this.voidMesh.visible = false;
        this.embersMesh.visible = false;
        this.pointLight.visible = false;
        
        // Ensure Jugnu is back to normal state
        let jugEntity: any = null;
        for (const e of this.queries.jugnu.entities) {
            jugEntity = e;
            break;
        }
        if (jugEntity && jugEntity.object3D) {
            const jugModel = jugEntity.object3D;
            jugModel.scale.setScalar(0.2);
            jugModel.rotation.x = 0;
            jugModel.position.set(0, 1.45, -0.8);
            if (typeof (jugModel as any).setFaceOpacity === 'function') {
                (jugModel as any).setFaceOpacity(1.0);
            }
        }

        if (this.dialogueBubble) {
            this.dialogueBubble.visible = false;
            this.dialogueBubble.dispose();
            this.dialogueBubble = null;
        }
        
        // Restore lights and background
        this.restoreLights(1.0);
        if (this.originalBackground) {
            this.world.scene.background = this.originalBackground;
        }
        
        // Stop audio
        this.stopAudio();
        
        // Dispose meshes and pointlight to free memory
        try {
            this.voidMesh.geometry.dispose();
            if (Array.isArray(this.voidMesh.material)) {
                this.voidMesh.material.forEach(m => m.dispose());
            } else {
                this.voidMesh.material.dispose();
            }
            this.embersMesh.geometry.dispose();
            if (Array.isArray(this.embersMesh.material)) {
                this.embersMesh.material.forEach(m => m.dispose());
            } else {
                this.embersMesh.material.dispose();
            }
        } catch (e) {
            console.warn("[OnboardingSystem] Error disposing resources:", e);
        }
        
        // Trigger golden burst sparks at Jugnu's starting position (center of galaxy)
        const spatialFX = (window as any).spatialFX;
        if (spatialFX) {
            const jugnuSpawnPos = new THREE.Vector3(0, 1.45, -0.8);
            spatialFX.triggerSpark(jugnuSpawnPos, new THREE.Color(0xffaa33), 85);
            spatialFX.playPositionalSound('fireworkExplode', jugnuSpawnPos, 0.6);
        }
    }
    
    stopAudio() {
        if (this.droneOsc1) {
            try { this.droneOsc1.stop(); this.droneOsc1.disconnect(); } catch (e) {}
            this.droneOsc1 = null;
        }
        if (this.droneOsc2) {
            try { this.droneOsc2.stop(); this.droneOsc2.disconnect(); } catch (e) {}
            this.droneOsc2 = null;
        }
        if (this.droneLfo) {
            try { this.droneLfo.stop(); this.droneLfo.disconnect(); } catch (e) {}
            this.droneLfo = null;
        }
        if (this.droneGain) {
            try { this.droneGain.disconnect(); } catch (e) {}
            this.droneGain = null;
        }
        if (this.droneFilter) {
            try { this.droneFilter.disconnect(); } catch (e) {}
            this.droneFilter = null;
        }
        if (this.heartbeatPanner) {
            try { this.heartbeatPanner.disconnect(); } catch (e) {}
            this.heartbeatPanner = null;
        }
        
        // Clean up sports synth beat track
        this.sportsSynthOscillators.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch (e) {}
        });
        this.sportsSynthOscillators = [];
        this.sportsSynthNodes.forEach(node => {
            try { node.stop(); node.disconnect(); } catch (e) {}
        });
        this.sportsSynthNodes = [];
        
        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch (e) {}
            this.audioCtx = null;
        }
    }
}
