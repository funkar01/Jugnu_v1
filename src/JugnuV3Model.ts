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
            uniform float U_Transition;
            varying vec2 vUv;
            void main() {
                vec4 color1 = texture2D(U_Video1, vUv);
                vec4 color2 = texture2D(U_Video2, vUv);
                
                vec4 color = mix(color1, color2, U_Transition);
                
                // Calculate brightness (Luminance)
                float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                
                // Thresholding: adjust values to handle compression noise in the black areas
                float alpha = smoothstep(0.04, 0.12, brightness); 
                
                // Optional: discard if nearly invisible to save depth complexity
                if (alpha < 0.01) discard;
                
                gl_FragColor = vec4(color.rgb, alpha);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                U_Video1: { value: this.videoTextures[0] },
                U_Video2: { value: this.videoTextures[1] },
                U_Transition: { value: 0.0 }
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

    public setMood(mood: Mood) {
        if (this.currentMood === mood) return;
        this.currentMood = mood;
        
        // Map moods sequentially to the 4 videos
        let idx = 0;
        switch(mood) {
            case 'happy': idx = 0; break;
            case 'sad': idx = 1; break;
            case 'angry': idx = 2; break;
            case 'surprised': idx = 3; break;
            case 'sleepy': idx = 0; break; // Wrap around to first
        }
        
        if (idx < this.videoTextures.length) {
            // this.material.uniforms.U_VideoTexture.value = this.videoTextures[idx];
        }
    }

    public update(dt: number) {
        if (this.material && this.material.uniforms.U_Transition) {
            this.material.uniforms.U_Transition.value = this.pinchProgress;
        }
    }
}
