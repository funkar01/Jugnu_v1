import * as THREE from 'three';

export class JugnuTranscriptBoard extends THREE.Group {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    private mesh: THREE.Mesh;

    constructor() {
        super();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 1024;
        this.ctx = this.canvas.getContext('2d')!;
        
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const geometry = new THREE.PlaneGeometry(1.6, 1.6);
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);

        this.updateText("Ready to chat!", "Click Jugnu to start...");
    }

    public updateText(userText: string, jugnuReply: string) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Glassmorphism Background
        ctx.fillStyle = 'rgba(15, 15, 18, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(10, 10, this.canvas.width - 20, this.canvas.height - 20, 32);
        ctx.fill();
        ctx.stroke();

        // Title/Header
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '600 24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("LIVE TRANSCRIPT", this.canvas.width / 2, 60);

        // Separator line
        ctx.beginPath();
        ctx.moveTo(40, 80);
        ctx.lineTo(this.canvas.width - 40, 80);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        let currentY = 140;
        ctx.textAlign = 'left';

        // User Query Section
        if (userText) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.9)'; // Sleek Cyan
            ctx.font = '600 32px system-ui, -apple-system, sans-serif';
            ctx.fillText('You:', 60, currentY);
            currentY += 45;

            ctx.fillStyle = '#ffffff';
            ctx.font = '400 34px system-ui, -apple-system, sans-serif';
            currentY = this.wrapText(userText, 60, currentY, 900, 48);
            currentY += 70; // Margin
        }

        // Jugnu Reply Section
        if (jugnuReply) {
            ctx.fillStyle = 'rgba(255, 180, 100, 0.9)'; // Sleek Orange
            ctx.font = '600 32px system-ui, -apple-system, sans-serif';
            ctx.fillText('Jugnu:', 60, currentY);
            currentY += 45;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = '400 34px system-ui, -apple-system, sans-serif';
            this.wrapText(jugnuReply, 60, currentY, 900, 48);
        }

        this.texture.needsUpdate = true;
    }

    private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

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
