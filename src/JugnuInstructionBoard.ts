import * as THREE from 'three';

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
        
        // Hand-drawn aesthetic Background
        ctx.fillStyle = 'rgba(5, 5, 26, 0.85)'; // Dark blue background
        ctx.strokeStyle = '#ffd700'; // Yellow hand-drawn border
        
        const x = 10;
        const y = 10;
        const w = this.canvas.width - 20;
        const h = this.canvas.height - 20;

        // Base jagged background
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 2);
        ctx.lineTo(x + w / 2, y + 1);
        ctx.lineTo(x + w - 3, y + 5);
        ctx.lineTo(x + w + 1, y + h / 2);
        ctx.lineTo(x + w - 5, y + h - 3);
        ctx.lineTo(x + w / 2, y + h + 1);
        ctx.lineTo(x + 3, y + h - 5);
        ctx.lineTo(x - 1, y + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Secondary sketchy stroke
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 4);
        ctx.lineTo(x + w / 2, y + 3);
        ctx.lineTo(x + w - 4, y + 8);
        ctx.lineTo(x + w - 2, y + h / 2);
        ctx.lineTo(x + w - 6, y + h - 4);
        ctx.lineTo(x + w / 2, y + h - 2);
        ctx.lineTo(x + 4, y + h - 6);
        ctx.lineTo(x + 1, y + h / 2);
        ctx.closePath();
        ctx.stroke();

        // Title/Header
        ctx.fillStyle = '#ffd700';
        ctx.font = '600 24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("TUTORIAL", this.canvas.width / 2, 45);

        // Instruction Text
        let instructionText = "";
        if (step === 0) {
            instructionText = "Pinch me with your index & thumb!";
        } else if (step === 1) {
            instructionText = "Touch your index fingers together!";
        } else if (step === 2) {
            instructionText = "Tap the glowing button on your left wrist!";
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '500 24px system-ui, -apple-system, sans-serif';
        this.wrapText(instructionText, this.canvas.width / 2, 100, 460, 32);

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
