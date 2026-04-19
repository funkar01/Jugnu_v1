import * as THREE from 'three';

export type Mood = 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy';

export class JugnuV2Model extends THREE.Group {
    private clock: THREE.Clock;
    
    private palettes = [
        { main: 0xff3300, emissive: 0xcc2200, stroke: '#fffce0', shadow: 'rgba(255,120,0,1)',   glow: [ [0,'rgba(255,70,0,1)'],  [0.3,'rgba(255,30,0,0.6)'],  [1,'rgba(255,10,0,0)'] ], shellColor: 0xffeedd, el2: 0xff6600, pcol2: 'rgba(255,100,0,0.4)', name: 'ASTRA', class: 'Celestial Vanguard', noiseOpts: { depth: 0.08, speed: 1.5, freq: 3.5 } },
        { main: 0x0088ff, emissive: 0x0044cc, stroke: '#e0f0ff', shadow: 'rgba(0,100,255,1)',   glow: [ [0,'rgba(0,120,255,1)'], [0.3,'rgba(0,50,255,0.6)'],  [1,'rgba(0,10,255,0)'] ], shellColor: 0xddeeff, el2: 0x0055ff, pcol2: 'rgba(0,100,255,0.4)', name: 'LUMEN', class: 'Abyssal Navigator', noiseOpts: { depth: 0.15, speed: 0.5, freq: 1.5 } },
        { main: 0x00ff66, emissive: 0x00aa33, stroke: '#e0ffef', shadow: 'rgba(0,255,100,1)',   glow: [ [0,'rgba(0,255,100,1)'], [0.3,'rgba(0,150,50,0.6)'],  [1,'rgba(0,50,10,0)']  ], shellColor: 0xeeffdd, el2: 0x00ff44, pcol2: 'rgba(0,200,50,0.4)', name: 'VERDANT', class: 'Flora Guardian', noiseOpts: { depth: 0.05, speed: 2.2, freq: 5.0 } },
        { main: 0xaa00ff, emissive: 0x5500aa, stroke: '#f0e0ff', shadow: 'rgba(150,0,255,1)',   glow: [ [0,'rgba(180,0,255,1)'], [0.3,'rgba(100,0,255,0.6)'], [1,'rgba(50,0,255,0)'] ], shellColor: 0xffddff, el2: 0xaa00ff, pcol2: 'rgba(150,0,255,0.4)', name: 'NEBULA', class: 'Void Weaver', noiseOpts: { depth: 0.12, speed: 3.0, freq: 2.5 } }
    ];
    
    private colorIdx = 0;
    private currentMood: Mood = 'happy';

    private coreMat: THREE.MeshPhysicalMaterial;
    private shellMat: THREE.MeshPhysicalMaterial;
    private glowMat: THREE.MeshBasicMaterial;
    private particleMat: THREE.PointsMaterial;
    private particleGeo: THREE.BufferGeometry;
    private faceTex: THREE.CanvasTexture;
    
    // Components
    private canvasFace: HTMLCanvasElement;
    private ctxFace: CanvasRenderingContext2D;
    private el2Light: THREE.DirectionalLight;
    private envMap: THREE.Texture;
    
    // Tracking for particles
    private particlesCount = 15;
    
    // Internal scale and pulse properties
    public pulseIntensity: number = 0;

    constructor(renderer: THREE.WebGLRenderer) {
        super();
        this.clock = new THREE.Clock();

        const p = this.palettes[this.colorIdx];

        // 1. Internal light for the core
        const internalLight = new THREE.PointLight(0xff9900, 3, 10);
        this.add(internalLight);

        // 2. Core Sphere
        const coreGeo = new THREE.SphereGeometry(1.0, 64, 64);
        this.coreMat = new THREE.MeshPhysicalMaterial({
            color: p.main,
            emissive: p.emissive,
            emissiveIntensity: 0.4,
            roughness: 0.1,
            metalness: 0.05,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.65
        });
        const core = new THREE.Mesh(coreGeo, this.coreMat);
        this.add(core);

        // 3. Face (Plane Geometry)
        this.canvasFace = document.createElement('canvas');
        this.canvasFace.width = 512;
        this.canvasFace.height = 512;
        const ctxCtx = this.canvasFace.getContext('2d');
        if (!ctxCtx) throw new Error("Could not get 2d context");
        this.ctxFace = ctxCtx;
        
        this.ctxFace.shadowColor = 'rgba(255, 120, 0, 1)';
        this.ctxFace.shadowBlur = 25;
        this.ctxFace.strokeStyle = '#fffce0';
        this.ctxFace.lineWidth = 22;
        this.ctxFace.lineCap = 'round';
        this.ctxFace.lineJoin = 'round';

        this.drawFace();

        this.faceTex = new THREE.CanvasTexture(this.canvasFace);
        this.faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const faceMat = new THREE.MeshBasicMaterial({
            map: this.faceTex,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const faceGeo = new THREE.PlaneGeometry(2.7, 2.7);
        const faceMesh = new THREE.Mesh(faceGeo, faceMat);
        faceMesh.position.z = 1.05; // Just outside the core
        this.add(faceMesh);

        // 4. Star-shaped Glassy Shell
        const shellGeo = new THREE.SphereGeometry(1.35, 128, 128);
        const posAttribute = shellGeo.attributes.position;
        const vertex = new THREE.Vector3();
        
        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // Polar coordinates in XY plane
            const radiusXY = Math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y);
            const angleXY = Math.atan2(vertex.y, vertex.x);
            
            // Clean 5-pointed star
            const indent = 0.28 * Math.pow(Math.abs(Math.cos(angleXY * 2.5)), 1.5);
            
            // Smooth out at poles
            const zFactor = 1.0 - Math.min(1.0, Math.pow(Math.abs(vertex.z / 1.35), 1.5)); 
            
            // Radial displacement
            const displacement = 1.0 + indent * zFactor;
            
            // Apply star shape to X and Y
            vertex.x *= displacement;
            vertex.y *= displacement;
            
            // Flatten the shape along Z axis like a cushion
            vertex.z *= 0.55;
            
            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        shellGeo.computeVertexNormals();

        // Procedural env map
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const envScene = new THREE.Scene();
        const el1 = new THREE.DirectionalLight(0xffffff, 3);
        el1.position.set(1, 1, 1);
        envScene.add(el1);
        this.el2Light = new THREE.DirectionalLight(p.el2, 2);
        this.el2Light.position.set(-1, -0.5, 1);
        envScene.add(this.el2Light);
        const el3 = new THREE.DirectionalLight(0xffffff, 1);
        el3.position.set(0, -1, -1);
        envScene.add(el3);
        this.envMap = pmremGenerator.fromScene(envScene).texture;

        this.shellMat = new THREE.MeshPhysicalMaterial({
            color: p.shellColor,
            metalness: 0.05,
            roughness: 0.08,
            transmission: 1.0,
            thickness: 1.2,
            ior: 1.15,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            envMap: this.envMap,
            envMapIntensity: 1.2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02
        });

        this.shellMat.userData = {
            noiseOpts: p.noiseOpts,
            shader: null
        };

        this.shellMat.onBeforeCompile = (shader) => {
            this.shellMat.userData.shader = shader;
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uNoiseDepth = { value: this.shellMat.userData.noiseOpts.depth };
            shader.uniforms.uNoiseSpeed = { value: this.shellMat.userData.noiseOpts.speed };
            shader.uniforms.uNoiseFreq = { value: this.shellMat.userData.noiseOpts.freq };

            shader.vertexShader = `
                uniform float uTime;
                uniform float uNoiseDepth;
                uniform float uNoiseSpeed;
                uniform float uNoiseFreq;

                float snoise(vec3 v) {
                    return sin(v.x * uNoiseFreq + uTime * uNoiseSpeed) * 
                           cos(v.y * uNoiseFreq + uTime * uNoiseSpeed * 0.8) * 
                           sin(v.z * uNoiseFreq - uTime * uNoiseSpeed * 0.5);
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                float noiseVal = snoise(position);
                transformed += normal * noiseVal * uNoiseDepth;
                `
            );
        };
        
        const shell = new THREE.Mesh(shellGeo, this.shellMat);
        this.add(shell);

        // 5. Background Glow
        const glowGeo = new THREE.PlaneGeometry(12, 12);
        this.glowMat = new THREE.MeshBasicMaterial({
            map: this.createRadialGlow(),
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, this.glowMat);
        glow.position.z = -1.5;
        this.add(glow);

        // 6. Floating Light Particles
        this.particleGeo = new THREE.BufferGeometry();
        const particlePos = new Float32Array(this.particlesCount * 3);
        const particlePhases = new Float32Array(this.particlesCount);
        
        for(let i = 0; i < this.particlesCount; i++) {
            let r = 0.9 + Math.random() * 0.7; // Embedded in shell or slightly outside
            let theta = Math.random() * Math.PI * 2;
            let phi = Math.acos((Math.random() * 2) - 1);
            
            particlePos[i*3] = r * Math.sin(phi) * Math.cos(theta);
            particlePos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            particlePos[i*3+2] = (r * Math.cos(phi)) * 0.4 + 0.5; // Front-weighted
            
            particlePhases[i] = Math.random() * Math.PI * 2;
        }
        this.particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
        this.particleGeo.setAttribute('phase', new THREE.BufferAttribute(particlePhases, 1));

        this.particleMat = new THREE.PointsMaterial({
            size: 0.15,
            transparent: true,
            blending: THREE.AdditiveBlending,
            map: this.generateParticleTex(),
            depthWrite: false
        });
        const particles = new THREE.Points(this.particleGeo, this.particleMat);
        this.add(particles);

        // We scale the overall character group down a bit to match the original V1 Jugu scale
        this.scale.setScalar(0.2);
    }

    private drawFace() {
        if (!this.ctxFace) return;
        const ctx = this.ctxFace;
        const cx = 256;
        const cy = 256;

        ctx.clearRect(0, 0, 512, 512);

        const p = this.palettes[this.colorIdx];
        const m = this.currentMood;

        ctx.strokeStyle = p.stroke;
        ctx.shadowColor = p.shadow;

        const renderPath = () => {
            ctx.beginPath();
            if (m === 'happy') {
                ctx.moveTo(cx - 75, cy - 5); ctx.lineTo(cx - 45, cy - 45); ctx.lineTo(cx - 15, cy - 5);
                ctx.moveTo(cx + 15, cy - 5); ctx.lineTo(cx + 45, cy - 45); ctx.lineTo(cx + 75, cy - 5);
                ctx.moveTo(cx - 35, cy + 15); ctx.arc(cx, cy + 15, 35, 0.15 * Math.PI, 0.85 * Math.PI, false);
            } else if (m === 'sad') {
                ctx.moveTo(cx - 75, cy - 45); ctx.lineTo(cx - 45, cy - 5); ctx.lineTo(cx - 15, cy - 45);
                ctx.moveTo(cx + 15, cy - 45); ctx.lineTo(cx + 45, cy - 5); ctx.lineTo(cx + 75, cy - 45);
                ctx.moveTo(cx + 35, cy + 45); ctx.arc(cx, cy + 45, 35, 1.15 * Math.PI, 1.85 * Math.PI, false);
            } else if (m === 'angry') {
                ctx.moveTo(cx - 75, cy - 45); ctx.lineTo(cx - 15, cy - 15);
                ctx.moveTo(cx + 15, cy - 15); ctx.lineTo(cx + 75, cy - 45);
                ctx.moveTo(cx - 30, cy + 30); ctx.lineTo(cx - 10, cy + 15); ctx.lineTo(cx + 10, cy + 30); ctx.lineTo(cx + 30, cy + 15);
            } else if (m === 'surprised') {
                ctx.moveTo(cx - 75, cy - 25); ctx.lineTo(cx - 45, cy - 65); ctx.lineTo(cx - 15, cy - 25);
                ctx.moveTo(cx + 15, cy - 25); ctx.lineTo(cx + 45, cy - 65); ctx.lineTo(cx + 75, cy - 25);
                ctx.moveTo(cx + 15, cy + 25); ctx.arc(cx, cy + 25, 15, 0, Math.PI * 2);
            } else if (m === 'sleepy') {
                ctx.moveTo(cx - 75, cy - 15); ctx.lineTo(cx - 15, cy - 15);
                ctx.moveTo(cx + 15, cy - 15); ctx.lineTo(cx + 75, cy - 15);
                ctx.moveTo(cx - 20, cy + 15); ctx.bezierCurveTo(cx - 10, cy + 25, cx + 10, cy + 25, cx + 20, cy + 15);
            }
            ctx.stroke();
        };

        ctx.shadowBlur = 10;
        renderPath();
        ctx.shadowBlur = 5; 
        renderPath();
    }

    private createRadialGlow() {
        const p = this.palettes[this.colorIdx];
        const canvas2 = document.createElement('canvas');
        canvas2.width = 512;
        canvas2.height = 512;
        const context = canvas2.getContext('2d')!;
        const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(p.glow[0][0] as number, p.glow[0][1] as string);
        gradient.addColorStop(p.glow[1][0] as number, p.glow[1][1] as string);
        gradient.addColorStop(p.glow[2][0] as number, p.glow[2][1] as string);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 512);
        return new THREE.CanvasTexture(canvas2);
    }

    private generateParticleTex() {
        const p = this.palettes[this.colorIdx];
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const cx = c.getContext('2d')!;
        const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.1, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.4, p.pcol2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grad;
        cx.fillRect(0,0,64,64);
        return new THREE.CanvasTexture(c);
    }

    public setMood(mood: Mood) {
        if (this.currentMood === mood) return;
        this.currentMood = mood;
        this.drawFace();
        if (this.faceTex) this.faceTex.needsUpdate = true;
    }

    public setColor(idx: number) {
        this.colorIdx = idx % this.palettes.length;
        const p = this.palettes[this.colorIdx];

        this.coreMat.color.setHex(p.main);
        this.coreMat.emissive.setHex(p.emissive);

        this.shellMat.color.setHex(p.shellColor);
        if (this.el2Light) this.el2Light.color.setHex(p.el2);
        
        this.shellMat.userData.noiseOpts = p.noiseOpts;
        if (this.shellMat.userData.shader) {
            this.shellMat.userData.shader.uniforms.uNoiseDepth.value = p.noiseOpts.depth;
            this.shellMat.userData.shader.uniforms.uNoiseSpeed.value = p.noiseOpts.speed;
            this.shellMat.userData.shader.uniforms.uNoiseFreq.value = p.noiseOpts.freq;
        } 
        
        this.drawFace();
        this.faceTex.needsUpdate = true;
        this.glowMat.map = this.createRadialGlow();
        this.particleMat.map = this.generateParticleTex();
    }

    public cycleColor() {
        this.setColor(this.colorIdx + 1);
    }

    // Called on the game loop inside JugnuSystem
    public update(dt: number) {
        const time = this.clock.getElapsedTime();

        // Pulse the core based on native time and pulseIntensity from listening state
        this.coreMat.emissiveIntensity = 0.4 + Math.sin(time * 3) * 0.1 + (this.pulseIntensity * 0.4);
        this.glowMat.opacity = 0.15 + Math.sin(time * 2) * 0.05 + (this.pulseIntensity * 0.1);

        this.shellMat.envMapIntensity = 1.1 + Math.sin(time * 2.2) * 0.35 + (this.pulseIntensity * 0.2);
        this.shellMat.roughness = 0.08 + Math.cos(time * 1.5) * 0.02;

        if (this.shellMat.userData.shader) {
            this.shellMat.userData.shader.uniforms.uTime.value = time;
        }

        // Vibrate particles
        const positions = this.particleGeo.attributes.position.array as Float32Array;
        const phases = this.particleGeo.attributes.phase.array as Float32Array;
        for(let i=0; i<this.particlesCount; i++) {
            positions[i*3+1] += Math.sin(time * 2 + phases[i]) * 0.002;
            positions[i*3] += Math.cos(time * 1.5 + phases[i]) * 0.002;
        }
        this.particleGeo.attributes.position.needsUpdate = true;
    }
}
