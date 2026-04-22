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
        
        // Background Board
        ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
        ctx.beginPath();
        ctx.roundRect(0, 0, this.canvas.width, this.canvas.height, 40);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = '#4da6ff';
        ctx.lineWidth = 4;
        ctx.stroke();

        let currentY = 80;

        // User Query Section
        if (userText) {
            ctx.fillStyle = '#4da6ff'; // Accent Blue
            ctx.font = 'bold 36px Arial';
            ctx.fillText('You Asked:', 40, currentY);
            currentY += 50;

            ctx.fillStyle = '#ffffff';
            ctx.font = '36px Arial';
            currentY = this.wrapText(userText, 40, currentY, 940, 48);
            currentY += 60; // Margin
        }

        // Jugnu Reply Section
        if (jugnuReply) {
            ctx.fillStyle = '#ffb347'; // Accent Orange
            ctx.font = 'bold 36px Arial';
            ctx.fillText('Jugnu:', 40, currentY);
            currentY += 50;

            ctx.fillStyle = '#f0f0f0';
            ctx.font = '36px Arial';
            this.wrapText(jugnuReply, 40, currentY, 940, 48);
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
