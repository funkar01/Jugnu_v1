import { createSystem } from "@iwsdk/core";
import * as THREE from "three";

interface SparkParticle {
    active: boolean;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    color: THREE.Color;
    life: number;
    age: number;
    scale: number;
}

export class SpatialFXSystem extends createSystem({}) {
    // Spatial Audio context & nodes
    private ctx: AudioContext | null = null;
    private hoverOsc: OscillatorNode | null = null;
    private hoverGain: GainNode | null = null;
    private hoverPanner: PannerNode | null = null;

    private vibrateOsc: OscillatorNode | null = null;
    private vibrateGain: GainNode | null = null;
    private vibratePanner: PannerNode | null = null;

    // Sparks instanced particle system
    private MAX_SPARKS = 150;
    private sparksPool: SparkParticle[] = [];
    private sparksMesh!: THREE.InstancedMesh;
    private sparkDummy = new THREE.Object3D();
    private activeSparksCount = 0;

    // Scratch variables for zero-GC loop
    private scratchV3 = new THREE.Vector3();
    private scratchV3_2 = new THREE.Vector3();
    private scratchMatrix = new THREE.Matrix4();
    private colorCache = new THREE.Color();

    init() {
        // Expose system globally for simple call-sites
        (window as any).spatialFX = this;

        // Initialize pre-allocated spark pool
        for (let i = 0; i < this.MAX_SPARKS; i++) {
            this.sparksPool.push({
                active: false,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                life: 0,
                age: 0,
                scale: 1
            });
        }

        // Initialize InstancedMesh for sparks
        const geometry = new THREE.BoxGeometry(0.0012, 0.0012, 0.0012);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sparksMesh = new THREE.InstancedMesh(geometry, material, this.MAX_SPARKS);
        this.sparksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.sparksMesh.instanceColor) {
            this.sparksMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        // Hide all instances initially
        const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < this.MAX_SPARKS; i++) {
            this.sparksMesh.setMatrixAt(i, zeroMatrix);
            this.sparksMesh.setColorAt(i, this.colorCache.setHex(0x000000));
        }
        this.sparksMesh.instanceMatrix.needsUpdate = true;
        if (this.sparksMesh.instanceColor) this.sparksMesh.instanceColor.needsUpdate = true;

        // Add to ECS world
        this.world.createTransformEntity(this.sparksMesh);
        console.log("[SpatialFXSystem] Initialized spark instanced mesh and audio triggers.");
    }

    private initAudio() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn("[SpatialFXSystem] Failed to initialize AudioContext:", e);
        }
    }

    private resumeAudio() {
        this.initAudio();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch((err) => {
                console.warn("[SpatialFXSystem] Failed to resume AudioContext:", err);
            });
        }
    }

    private createNoiseBufferNode(): AudioBufferSourceNode | null {
        if (!this.ctx) return null;
        try {
            const bufferSize = this.ctx.sampleRate * 0.4;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            return source;
        } catch (e) {
            return null;
        }
    }

    private setupPanner(pos: THREE.Vector3): PannerNode | null {
        this.resumeAudio();
        if (!this.ctx) return null;

        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 0.05;
        panner.maxDistance = 10.0;
        panner.rolloffFactor = 2.0;

        this.updatePannerPosition(panner, pos);
        return panner;
    }

    private updatePannerPosition(panner: PannerNode, worldPos: THREE.Vector3) {
        if (!this.ctx) return;

        // Project world position into camera/head local space
        const localPos = this.scratchV3.copy(worldPos);
        if (this.player && this.player.head) {
            const headMat = this.player.head.matrixWorld;
            localPos.applyMatrix4(this.scratchMatrix.copy(headMat).invert());
        }

        const t = this.ctx.currentTime;
        // Standard Three.js coordinates align exactly with panner's relative coordinates
        panner.positionX.setValueAtTime(localPos.x, t);
        panner.positionY.setValueAtTime(localPos.y, t);
        panner.positionZ.setValueAtTime(localPos.z, t);
    }

    // --- Synthesizer APIs ---

    playPositionalSound(type: 'click' | 'sparkle' | 'lockBreak' | 'fireworkLaunch' | 'fireworkExplode', pos: THREE.Vector3, volumeScale = 1.0) {
        this.resumeAudio();
        if (!this.ctx) return;

        const panner = this.setupPanner(pos);
        if (!panner) return;
        panner.connect(this.ctx.destination);

        const t = this.ctx.currentTime;

        if (type === 'click') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(panner);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(150, t + 0.02);

            gain.gain.setValueAtTime(0.12 * volumeScale, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

            osc.start(t);
            osc.stop(t + 0.03);

        } else if (type === 'sparkle') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(panner);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(2500 + Math.random() * 800, t);

            gain.gain.setValueAtTime(0.05 * volumeScale, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);

            osc.start(t);
            osc.stop(t + 0.01);

        } else if (type === 'lockBreak') {
            const osc = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noise = this.createNoiseBufferNode();

            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(panner);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1000, t);
            osc2.frequency.exponentialRampToValueAtTime(40, t + 0.28);

            gain.gain.setValueAtTime(0.25 * volumeScale, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

            osc.start(t);
            osc2.start(t);
            osc.stop(t + 0.32);
            osc2.stop(t + 0.32);

            if (noise) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1000, t);
                filter.frequency.exponentialRampToValueAtTime(200, t + 0.25);
                filter.Q.setValueAtTime(2.0, t);

                const noiseGain = this.ctx.createGain();
                noise.connect(filter);
                filter.connect(noiseGain);
                noiseGain.connect(panner);

                noiseGain.gain.setValueAtTime(0.18 * volumeScale, t);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

                noise.start(t);
                noise.stop(t + 0.3);
            }

        } else if (type === 'fireworkLaunch') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(panner);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, t);
            osc.frequency.exponentialRampToValueAtTime(750, t + 0.65);

            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.06 * volumeScale, t + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.68);

            osc.start(t);
            osc.stop(t + 0.7);

        } else if (type === 'fireworkExplode') {
            const thump = this.ctx.createOscillator();
            const thumpGain = this.ctx.createGain();
            thump.connect(thumpGain);
            thumpGain.connect(panner);

            thump.type = 'sine';
            thump.frequency.setValueAtTime(110, t);
            thump.frequency.exponentialRampToValueAtTime(30, t + 0.22);

            thumpGain.gain.setValueAtTime(0.38 * volumeScale, t);
            thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

            thump.start(t);
            thump.stop(t + 0.27);

            const noise = this.createNoiseBufferNode();
            if (noise) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1600, t);
                filter.Q.setValueAtTime(3.5, t);

                const noiseGain = this.ctx.createGain();
                noise.connect(filter);
                filter.connect(noiseGain);
                noiseGain.connect(panner);

                noiseGain.gain.setValueAtTime(0.16 * volumeScale, t);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

                noise.start(t);
                noise.stop(t + 0.45);
            }
        }
    }

    // --- Jugnu Continuous Hover hum ---

    startJugnuHoverSound(pos: THREE.Vector3) {
        this.resumeAudio();
        if (!this.ctx || this.hoverOsc) return;

        this.hoverPanner = this.setupPanner(pos);
        if (!this.hoverPanner) return;
        this.hoverPanner.connect(this.ctx.destination);

        this.hoverGain = this.ctx.createGain();
        this.hoverGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

        this.hoverOsc = this.ctx.createOscillator();
        this.hoverOsc.type = 'triangle';
        this.hoverOsc.frequency.setValueAtTime(130, this.ctx.currentTime);

        this.hoverOsc.connect(this.hoverGain);
        this.hoverGain.connect(this.hoverPanner);

        this.hoverOsc.start(this.ctx.currentTime);
    }

    updateJugnuHoverSound(pos: THREE.Vector3, velocity: THREE.Vector3) {
        if (!this.ctx || !this.hoverOsc || !this.hoverGain || !this.hoverPanner) return;
        this.updatePannerPosition(this.hoverPanner, pos);

        const speed = velocity.length();
        const targetFreq = 125 + Math.min(speed * 25.0, 110);
        const targetVolume = 0.02 + Math.min(speed * 0.018, 0.07);

        this.hoverOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        this.hoverGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
    }

    stopJugnuHoverSound() {
        if (this.hoverOsc) {
            try {
                this.hoverOsc.stop();
                this.hoverOsc.disconnect();
            } catch (e) {}
            this.hoverOsc = null;
        }
        if (this.hoverGain) {
            this.hoverGain.disconnect();
            this.hoverGain = null;
        }
        if (this.hoverPanner) {
            this.hoverPanner.disconnect();
            this.hoverPanner = null;
        }
    }

    // --- Jugnu Lock Breakout shaking vibration sound ---

    startLockVibrationSound(pos: THREE.Vector3) {
        this.resumeAudio();
        if (!this.ctx || this.vibrateOsc) return;

        this.vibratePanner = this.setupPanner(pos);
        if (!this.vibratePanner) return;
        this.vibratePanner.connect(this.ctx.destination);

        this.vibrateGain = this.ctx.createGain();
        this.vibrateGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

        this.vibrateOsc = this.ctx.createOscillator();
        this.vibrateOsc.type = 'sawtooth';
        this.vibrateOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

        this.vibrateOsc.connect(this.vibrateGain);
        this.vibrateGain.connect(this.vibratePanner);

        this.vibrateOsc.start(this.ctx.currentTime);
    }

    updateLockVibrationSound(pos: THREE.Vector3, intensity: number) {
        if (!this.ctx || !this.vibrateOsc || !this.vibrateGain || !this.vibratePanner) return;
        this.updatePannerPosition(this.vibratePanner, pos);

        const targetFreq = 55 + intensity * 130.0;
        const targetVolume = intensity * 0.16;

        this.vibrateOsc.frequency.setValueAtTime(targetFreq, this.ctx.currentTime);
        this.vibrateGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
    }

    stopLockVibrationSound() {
        if (this.vibrateOsc) {
            try {
                this.vibrateOsc.stop();
                this.vibrateOsc.disconnect();
            } catch (e) {}
            this.vibrateOsc = null;
        }
        if (this.vibrateGain) {
            this.vibrateGain.disconnect();
            this.vibrateGain = null;
        }
        if (this.vibratePanner) {
            this.vibratePanner.disconnect();
            this.vibratePanner = null;
        }
    }

    // --- Instanced Sparks Spawning ---

    triggerSpark(pos: THREE.Vector3, color: THREE.Color, count: number) {
        let spawned = 0;
        
        // Find inactive slots in the sparks pool
        for (let i = 0; i < this.MAX_SPARKS; i++) {
            const p = this.sparksPool[i];
            if (!p.active) {
                p.active = true;
                p.position.copy(pos);
                
                // Add soft random offsets
                p.position.x += (Math.random() - 0.5) * 0.004;
                p.position.y += (Math.random() - 0.5) * 0.004;
                p.position.z += (Math.random() - 0.5) * 0.004;

                // Spherical random velocity
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                const speed = 0.08 + Math.random() * 0.15;
                p.velocity.set(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta) + 0.1, // slightly upward bias
                    Math.cos(phi)
                ).multiplyScalar(speed);

                p.color.copy(color);
                p.life = 0.25 + Math.random() * 0.25; // 0.25s - 0.5s life
                p.age = 0.0;
                p.scale = 1.0 + Math.random() * 1.5;

                spawned++;
                if (spawned >= count) break;
            }
        }

        // Trigger spatialized tick sound on sparks
        if (count > 0) {
            this.playPositionalSound('sparkle', pos, Math.min(count / 10, 1.0));
        }
    }

    update(dt: number) {
        if (dt <= 0.0001) return;

        let activeCount = 0;
        const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

        for (let i = 0; i < this.MAX_SPARKS; i++) {
            const p = this.sparksPool[i];
            if (p.active) {
                p.age += dt;
                if (p.age >= p.life) {
                    p.active = false;
                    this.sparksMesh.setMatrixAt(i, zeroMatrix);
                    this.sparksMesh.setColorAt(i, this.colorCache.setHex(0x000000));
                } else {
                    // Update physics (Euler linear integration)
                    p.position.addScaledVector(p.velocity, dt);
                    p.velocity.y -= 0.6 * dt; // gravity deceleration

                    // Interpolate size based on age decay
                    const t = p.age / p.life;
                    const size = (1.0 - t) * p.scale;

                    this.sparkDummy.position.copy(p.position);
                    this.sparkDummy.scale.set(size, size, size);
                    this.sparkDummy.updateMatrix();

                    this.sparksMesh.setMatrixAt(i, this.sparkDummy.matrix);
                    this.sparksMesh.setColorAt(i, p.color);
                    activeCount++;
                }
            } else {
                this.sparksMesh.setMatrixAt(i, zeroMatrix);
            }
        }

        this.activeSparksCount = activeCount;

        // Force GPU buffer updates
        if (this.sparksMesh) {
            this.sparksMesh.instanceMatrix.needsUpdate = true;
            if (this.sparksMesh.instanceColor) {
                this.sparksMesh.instanceColor.needsUpdate = true;
            }
        }
    }
}
