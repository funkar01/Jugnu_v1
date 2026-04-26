import * as THREE from 'three';

export class XRConsoleBoard extends THREE.Group {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    public texture: THREE.CanvasTexture;
    private mesh: THREE.Mesh;
    private logs: { type: string, message: string }[] = [];
    private maxLogs = 20;

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

        this.interceptConsole();
        this.renderCanvas();
    }

    private interceptConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog(...args);
            this.addLog('log', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        };
        console.warn = (...args) => {
            originalWarn(...args);
            this.addLog('warn', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        };
        console.error = (...args) => {
            originalError(...args);
            this.addLog('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        };
    }

    private addLog(type: string, message: string) {
        this.logs.push({ type, message });
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        this.renderCanvas();
    }

    private renderCanvas() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Background
        ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
        ctx.strokeStyle = 'rgba(100, 255, 100, 0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(5, 5, this.canvas.width - 10, this.canvas.height - 10, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("XR CONSOLE LOG", this.canvas.width / 2, 40);

        ctx.beginPath();
        ctx.moveTo(20, 60);
        ctx.lineTo(this.canvas.width - 20, 60);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();

        ctx.font = '24px monospace';
        ctx.textAlign = 'left';

        let y = 100;
        for (const log of this.logs) {
            if (log.type === 'error') ctx.fillStyle = '#ff5555';
            else if (log.type === 'warn') ctx.fillStyle = '#ffaa00';
            else ctx.fillStyle = '#88ff88';

            const lines = this.getWrappedLines(`[${log.type.toUpperCase()}] ${log.message}`, this.canvas.width - 40);
            for (const line of lines) {
                ctx.fillText(line, 20, y);
                y += 30;
                if (y > this.canvas.height - 20) break;
            }
        }

        this.texture.needsUpdate = true;
    }

    private getWrappedLines(text: string, maxWidth: number): string[] {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine + word + ' ';
            const metrics = this.ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = word + ' ';
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        return lines;
    }
}
