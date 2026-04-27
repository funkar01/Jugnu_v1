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
        
        // Hand-drawn aesthetic Background
        ctx.fillStyle = 'rgba(5, 5, 26, 0.85)'; // Dark blue background
        ctx.strokeStyle = '#ffd700'; // Yellow hand-drawn border
        
        const x = 15;
        const y = 15;
        const w = this.canvas.width - 30;
        const h = this.canvas.height - 30;

        // Base jagged background
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 5);
        ctx.lineTo(x + w / 2, y + 2);
        ctx.lineTo(x + w - 5, y + 10);
        ctx.lineTo(x + w + 2, y + h / 2);
        ctx.lineTo(x + w - 10, y + h - 5);
        ctx.lineTo(x + w / 2, y + h + 2);
        ctx.lineTo(x + 5, y + h - 10);
        ctx.lineTo(x - 2, y + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Secondary sketchy stroke
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 8);
        ctx.lineTo(x + w / 2, y + 6);
        ctx.lineTo(x + w - 8, y + 15);
        ctx.lineTo(x + w - 4, y + h / 2);
        ctx.lineTo(x + w - 12, y + h - 8);
        ctx.lineTo(x + w / 2, y + h - 4);
        ctx.lineTo(x + 8, y + h - 12);
        ctx.lineTo(x + 2, y + h / 2);
        ctx.closePath();
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
