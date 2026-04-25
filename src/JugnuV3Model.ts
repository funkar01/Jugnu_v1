import * as THREE from 'three';

export type Mood = 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy';

export class JugnuV3Model extends THREE.Group {
    private currentMood: Mood = 'happy';
    
    // 2 videos provided for V4 testing
    private videoPaths = [
        "/JugnuV3/BlueCasual.mp4",
        "/JugnuV3/OrangeHappy.mp4"
    ];
    
    private videoElements: HTMLVideoElement[] = [];
    private videoTextures: THREE.VideoTexture[] = [];
    private spriteTextures: Record<Mood, THREE.CanvasTexture> = {} as any;
    private material: THREE.ShaderMaterial;
    
    // Scale and pulse properties used by jugnu.ts
    public pulseIntensity: number = 0;
    public pinchProgress: number = 0;

    constructor() {
        super();
        
        // Use a 3x3 plane, but scale it down to 0.2 to match V2's 0.6x0.6 physical size
        const geometry = new THREE.PlaneGeometry(3, 3);
        
        // Initialize videos
        for (const path of this.videoPaths) {
            const video = document.createElement('video');
            video.src = path;
            video.crossOrigin = 'anonymous';
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.play().catch(e => console.warn("Video autoplay blocked until user interaction", e));
            
            this.videoElements.push(video);
            
            const texture = new THREE.VideoTexture(video);
            texture.colorSpace = THREE.SRGBColorSpace;
            this.videoTextures.push(texture);
        }

        // Generate Placeholder Sprites for the 5 moods
        const moods: Mood[] = ['happy', 'sad', 'angry', 'surprised', 'sleepy'];
        for (const m of moods) {
            this.spriteTextures[m] = this.generateSprite(m);
        }

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform sampler2D U_Video1;
            uniform sampler2D U_Video2;
            uniform sampler2D U_Sprite;
            uniform float U_Transition;
            uniform float u_time;
            varying vec2 vUv;
            
            // Function to convert HSL to RGB
            vec3 hsl2rgb(vec3 c) {
                vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
                return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
            }

            void main() {
                vec4 color1 = texture2D(U_Video1, vUv);
                vec4 color2 = texture2D(U_Video2, vUv);
                
                vec4 texColor = mix(color1, color2, U_Transition);
                
                // Extract value (Luminance) from the input to use as Fac
                float val = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
                
                // ColorRamp 2: Alpha mapping (0 to 0.036 -> 0 to 1)
                float bodyAlpha = smoothstep(0.0, 0.036, val);
                
                // ColorRamp 1: HSL Rainbow cycling over time
                // Hue varies based on the input value AND time for smooth cycling
                float hue = fract(val * 0.5 - u_time * 0.1); // Slowed down from 0.5 to 0.1
                vec3 baseColor = hsl2rgb(vec3(hue, 1.0, 0.5));
                
                // Sample Sprite for emotion layer
                vec4 sprite = texture2D(U_Sprite, vUv);
                
                // Alpha blend sprite over the procedural base
                // If it's a white-ish sprite, it will just draw white. If colored, draws color.
                vec3 finalColor = mix(baseColor, sprite.rgb, sprite.a);
                
                // The final alpha should encompass both the body and the floating sprite elements
                float finalAlpha = max(bodyAlpha, sprite.a);
                
                if (finalAlpha < 0.01) discard;
                
                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                U_Video1: { value: this.videoTextures[0] },
                U_Video2: { value: this.videoTextures[1] },
                U_Sprite: { value: this.spriteTextures['happy'] }, // Default state
                U_Transition: { value: 0.0 },
                u_time: { value: 0.0 }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, this.material);
        this.add(mesh);
        
        // Scale to match old Jugnu
        this.scale.setScalar(0.2);
        
        // Add a click-to-play listener to ensure videos start in VR browsers
        window.addEventListener('pointerdown', () => {
            this.videoElements.forEach(v => {
                if (v.paused) v.play().catch(()=>{});
            });
        }, { once: true });
    }

    private generateSprite(mood: Mood): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        
        ctx.clearRect(0, 0, 512, 512);
        
        // Placeholder Emojis for moods
        let emoji = '😊';
        switch(mood) {
            case 'happy': emoji = '😊'; break;
            case 'sad': emoji = '😢'; break;
            case 'angry': emoji = '😠'; break;
            case 'surprised': emoji = '😲'; break;
            case 'sleepy': emoji = '😴'; break;
        }

        ctx.font = '150px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Adding a white soft glow behind the emoji so it pops against the Jugnu body
        ctx.shadowColor = 'rgba(255, 255, 255, 1.0)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = 'white';
        // Draw slightly lower so it sits in the middle of the "body" shape
        ctx.fillText(emoji, 256, 300);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    public setMood(mood: Mood) {
        if (this.currentMood === mood) return;
        this.currentMood = mood;
        
        // Swap the sprite texture seamlessly
        if (this.material && this.material.uniforms.U_Sprite) {
            this.material.uniforms.U_Sprite.value = this.spriteTextures[mood];
        }
    }

    // speedMultiplier comes from JugnuSystem based on interaction/velocity
    public update(dt: number, speedMultiplier: number = 1.0) {
        if (this.material && this.material.uniforms.U_Transition) {
            this.material.uniforms.U_Transition.value = this.pinchProgress;
        }
        if (this.material && this.material.uniforms.u_time) {
            // Speed up when moving, stop when stationary (speedMultiplier = 0)
            this.material.uniforms.u_time.value += dt * speedMultiplier;
        }
    }
}
