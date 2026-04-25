import * as THREE from 'three';

export type Mood = 'bored' | 'calm' | 'happy' | 'sad' | 'bright' | 'blushing' | 'winking';

export const MoodColors: Record<Mood, THREE.Color> = {
    'bored': new THREE.Color(0xa1c4fd),
    'calm': new THREE.Color(0xfcf4a3),
    'happy': new THREE.Color(0xffb347),
    'sad': new THREE.Color(0xc1a1fd),
    'bright': new THREE.Color(0xffff66),
    'blushing': new THREE.Color(0xffb6c1),
    'winking': new THREE.Color(0x90ee90)
};

export const MoodCompColors: Record<Mood, THREE.Color> = {
    'bored': new THREE.Color(0xfda1a1), // Reddish
    'calm': new THREE.Color(0xa3abfc), // Purple-ish
    'happy': new THREE.Color(0x4793ff), // Blue-ish
    'sad': new THREE.Color(0xfdfaa1), // Yellow-ish
    'bright': new THREE.Color(0x6666ff), // Blue-ish
    'blushing': new THREE.Color(0xb6ffc1), // Mint
    'winking': new THREE.Color(0xff90ee) // Pink-ish
};

const ExpressionPaths: Record<Mood, string> = {
    'bored': '/Expressions_V1/Bored Blue.png',
    'calm': '/Expressions_V1/Calm Yellow.png',
    'happy': '/Expressions_V1/Happy Orange.png',
    'sad': '/Expressions_V1/Sad Violet.png',
    'bright': '/Expressions_V1/Bright Yellow.png',
    'blushing': '/Expressions_V1/Blushing Pink.png',
    'winking': '/Expressions_V1/Winking Green.png'
};

export class JugnuV3Model extends THREE.Group {
    private currentMood: Mood = 'happy';
    private targetColor: THREE.Color = MoodColors['happy'].clone();
    private targetCompColor: THREE.Color = MoodCompColors['happy'].clone();


    // 2 videos provided for V4 testing
    private videoPaths = [
        "/JugnuV4/JugnuRotate.mp4",
        "/JugnuV4/JugnuPinched.mp4"
    ];

    private videoElements: HTMLVideoElement[] = [];
    private videoTextures: THREE.VideoTexture[] = [];
    private spriteTextures: Record<Mood, THREE.Texture> = {} as any;
    private material: THREE.ShaderMaterial;

    // Scale and pulse properties used by jugnu.ts
    public pulseIntensity: number = 0;
    public pinchProgress: number = 0;
    private pinchAnimTimer: number = 0;

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

        // Load Expression Images for the 7 moods
        const moods: Mood[] = ['bored', 'calm', 'happy', 'sad', 'bright', 'blushing', 'winking'];
        const textureLoader = new THREE.TextureLoader();
        for (const m of moods) {
            const tex = textureLoader.load(ExpressionPaths[m]);
            tex.colorSpace = THREE.SRGBColorSpace;
            this.spriteTextures[m] = tex;
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
            uniform vec3 U_MoodColor;
            uniform vec3 U_CompColor;
            uniform float U_Transition;
            uniform float u_time;
            varying vec2 vUv;
            
            void main() {
                vec4 color1 = texture2D(U_Video1, vUv);
                vec4 color2 = texture2D(U_Video2, vUv);
                
                vec4 texColor = mix(color1, color2, U_Transition);
                
                // Extract value (Luminance) from the input to use as Fac
                float val = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
                
                // ColorRamp 2: Alpha mapping (0 to 0.036 -> 0 to 1)
                float bodyAlpha = smoothstep(0.0, 0.036, val);
                
                // Circular gradient at the center
                float dist = distance(vUv, vec2(0.5));
                vec3 radialColor = mix(U_MoodColor + vec3(0.15), U_MoodColor * 0.85, smoothstep(0.0, 0.4, dist));
                
                // Edge outline mask based on val
                float edgeMask = smoothstep(0.01, 0.05, val) - smoothstep(0.1, 0.3, val);
                
                // Base color tinted by the current mood color and complementary edge
                vec3 baseColor = mix(radialColor, U_CompColor, edgeMask * 0.9);
                
                // Scale UV from the center to shrink the sprite to 75%
                // Offset by 0.1 to the right (subtract from UV)
                vec2 center = vec2(0.5, 0.5);
                vec2 offset = vec2(0.025, 0.0);
                float scale = 0.75;
                vec2 spriteUv = (vUv - offset - center) * (1.0 / scale) + center;
                
                // Sample Sprite for emotion layer, ensuring we don't sample past boundaries
                vec4 sprite = vec4(0.0);
                if (spriteUv.x >= 0.0 && spriteUv.x <= 1.0 && spriteUv.y >= 0.0 && spriteUv.y <= 1.0) {
                    sprite = texture2D(U_Sprite, spriteUv);
                }
                
                // Calculate an alpha mask from the luminance of the sprite (black becomes 0.0, white becomes 1.0)
                float expressionMask = dot(sprite.rgb, vec3(0.299, 0.587, 0.114));
                
                // Mix pure white over the procedural base using the expression mask
                vec3 finalColor = mix(baseColor, vec3(1.0), expressionMask);
                
                // The final alpha should encompass both the body and the floating expression mask
                float finalAlpha = max(bodyAlpha, expressionMask);
                
                if (finalAlpha < 0.01) discard;
                
                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                U_Video1: { value: this.videoTextures[0] },
                U_Video2: { value: this.videoTextures[1] },
                U_Sprite: { value: this.spriteTextures['happy'] }, // Default state
                U_MoodColor: { value: MoodColors['happy'].clone() },
                U_CompColor: { value: MoodCompColors['happy'].clone() },
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
                if (v.paused) v.play().catch(() => { });
            });
        }, { once: true });
    }

    public setMood(mood: Mood) {
        if (this.currentMood === mood) return;
        this.currentMood = mood;

        // Swap the sprite texture seamlessly
        if (this.material && this.material.uniforms.U_Sprite) {
            this.material.uniforms.U_Sprite.value = this.spriteTextures[mood];
        }

        // Smooth color transition targeted in update loop
        this.targetColor.copy(MoodColors[mood]);
        this.targetCompColor.copy(MoodCompColors[mood]);
    }

    public triggerPinchAnimation() {
        if (this.videoElements.length > 1) {
            this.videoElements[1].currentTime = 0;
            const duration = this.videoElements[1].duration;
            this.pinchAnimTimer = (duration && !isNaN(duration)) ? duration : 2.0;
        }
    }

    // speedMultiplier comes from JugnuSystem based on interaction/velocity
    public update(dt: number, speedMultiplier: number = 1.0) {
        let targetTransition = this.pinchProgress;
        if (this.pinchAnimTimer > 0) {
            this.pinchAnimTimer -= dt;
            targetTransition = 1.0;
        }

        if (this.material && this.material.uniforms.U_Transition) {
            // Smoothly lerp towards target transition
            this.material.uniforms.U_Transition.value = THREE.MathUtils.lerp(
                this.material.uniforms.U_Transition.value, 
                targetTransition, 
                dt * 15.0
            );
        }
        if (this.material && this.material.uniforms.u_time) {
            // Speed up when moving, stop when stationary (speedMultiplier = 0)
            this.material.uniforms.u_time.value += dt * speedMultiplier;
        }
        if (this.material && this.material.uniforms.U_MoodColor) {
            // Interpolate towards the target color for smooth transitions
            this.material.uniforms.U_MoodColor.value.lerp(this.targetColor, dt * 2.0);
        }
        if (this.material && this.material.uniforms.U_CompColor) {
            this.material.uniforms.U_CompColor.value.lerp(this.targetCompColor, dt * 2.0);
        }
    }
}
