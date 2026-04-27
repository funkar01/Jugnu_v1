import * as THREE from 'three';
import { AssetManager } from '@iwsdk/core';

export class JugnuInstructionBoard extends THREE.Group {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    private mesh: THREE.Mesh;
    private currentStep: number = -1;

    constructor() {
        super();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d')!;
        
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const geometry = new THREE.PlaneGeometry(0.5, 0.25);
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);

        this.setStep(0);
    }

    public setStep(step: number) {
        if (this.currentStep === step) return;
        this.currentStep = step;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Instruction Image
        let texKey = "";
        if (step === 0) {
            texKey = "tutorial_pinch";
        } else if (step === 1) {
            texKey = "tutorial_uwu";
        } else if (step === 2) {
            texKey = "tutorial_tap";
        }

        if (texKey) {
            const tex = AssetManager.getTexture(texKey);
            if (tex && tex.image) {
                const img = tex.image as CanvasImageSource;
                const srcW = (img as any).width || 256;
                const srcH = (img as any).height || 256;
                
                const maxWidth = 460;
                const maxHeight = 230;
                const scale = Math.min(maxWidth / srcW, maxHeight / srcH);
                const w = srcW * scale;
                const h = srcH * scale;
                
                const imgX = (this.canvas.width - w) / 2;
                const imgY = (this.canvas.height - h) / 2;
                
                ctx.drawImage(img, imgX, imgY, w, h);
            } else {
                // Fallback text if image isn't loaded yet
                let instructionText = "";
                if (step === 0) instructionText = "Pinch me with your index & thumb!";
                else if (step === 1) instructionText = "Touch your index fingers together!";
                else if (step === 2) instructionText = "Tap the glowing button on your left wrist!";
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = '500 24px system-ui, -apple-system, sans-serif';
                this.wrapText(instructionText, this.canvas.width / 2, 120, 460, 32);
                
                // Retry drawing the image shortly after
                setTimeout(() => this.setStep(this.currentStep), 500);
            }
        }

        this.texture.needsUpdate = true;
    }

    private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
        const words = text.split(' ');
        let line = '';
        let currentY = y;
        this.ctx.textAlign = 'center';

        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                this.ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            }
            else {
                line = testLine;
            }
        }
        this.ctx.fillText(line, x, currentY);
        return currentY;
    }
}
