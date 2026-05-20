import * as THREE from 'three';

interface LogEntry {
    type: 'info' | 'warn' | 'error';
    text: string;
    timestamp: string;
}

export class JugnuDebugBoard extends THREE.Group {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    private mesh: THREE.Mesh;
    
    private logs: LogEntry[] = [];
    private maxLogs = 14;

    // Save original console functions
    private originalLog = console.log;
    private originalWarn = console.warn;
    private originalError = console.error;

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
        
        // Match the 1.6 x 1.6 size of the Transcript board for layout balance
        const geometry = new THREE.PlaneGeometry(1.6, 1.6);
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);

        // Hook console logging
        this.hookConsole();

        // Add initial system logs
        this.addLog('info', 'DEBUG CONSOLE: System Initialized');
        this.addLog('info', 'Mode: DEVELOPMENT');
        this.addLog('info', 'Waiting for WebXR inputs...');
        
        this.redraw();
    }

    private hookConsole() {
        const self = this;

        console.log = function(...args: any[]) {
            self.originalLog.apply(console, args);
            const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            self.addLog('info', msg);
        };

        console.warn = function(...args: any[]) {
            self.originalWarn.apply(console, args);
            const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            self.addLog('warn', msg);
        };

        console.error = function(...args: any[]) {
            self.originalError.apply(console, args);
            const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            self.addLog('error', msg);
        };
    }

    // Clean up original console functions when disposed
    public dispose() {
        console.log = this.originalLog;
        console.warn = this.originalWarn;
        console.error = this.originalError;
        this.texture.dispose();
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(m => m.dispose());
        } else {
            this.mesh.material.dispose();
        }
    }

    private addLog(type: 'info' | 'warn' | 'error', text: string) {
        // Skip hot path animation frames or spam logs if they clutter the board
        if (text.includes('[IWER]') || text.includes('requestAnimationFrame') || text.includes('Render frame')) {
            return;
        }

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        // Handle multiline or very long messages by splitting them
        const maxCharPerLine = 48;
        if (text.length > maxCharPerLine) {
            const lines = [];
            for (let i = 0; i < text.length; i += maxCharPerLine) {
                lines.push(text.substring(i, i + maxCharPerLine));
            }
            lines.forEach((line, idx) => {
                this.logs.push({
                    type,
                    text: idx === 0 ? line : `  ${line}`,
                    timestamp: idx === 0 ? timeStr : '        '
                });
            });
        } else {
            this.logs.push({ type, text, timestamp: timeStr });
        }

        while (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.redraw();
    }

    private redraw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const x = 15;
        const y = 15;
        const w = this.canvas.width - 30;
        const h = this.canvas.height - 30;

        // Dark glassmorphic background
        ctx.fillStyle = 'rgba(5, 5, 20, 0.9)';
        ctx.fillRect(x, y, w, h);

        // Cyberpunk style neon double borders with glowing colors
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'; // Electric Cyan
        ctx.strokeRect(x, y, w, h);

        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 0, 128, 0.4)'; // Magenta secondary
        ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);

        // Corner accents
        ctx.fillStyle = '#00ffff';
        const accentSize = 25;
        // Top Left
        ctx.fillRect(x, y, accentSize, 6);
        ctx.fillRect(x, y, 6, accentSize);
        // Top Right
        ctx.fillRect(x + w - accentSize, y, accentSize, 6);
        ctx.fillRect(x + w - 6, y, 6, accentSize);
        // Bottom Left
        ctx.fillRect(x, y + h - 6, accentSize, 6);
        ctx.fillRect(x, y + h - accentSize, 6, accentSize);
        // Bottom Right
        ctx.fillRect(x + w - accentSize, y + h - 6, accentSize, 6);
        ctx.fillRect(x + w - 6, y + h - accentSize, 6, accentSize);

        // Console Header text
        ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillText("SYSTEM DEBUG CONSOLE", this.canvas.width / 2, 70);
        ctx.shadowBlur = 0; // Reset shadow

        // Header separation line
        ctx.beginPath();
        ctx.moveTo(40, 95);
        ctx.lineTo(this.canvas.width - 40, 95);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Print logs
        let currentY = 150;
        ctx.textAlign = 'left';
        ctx.font = '24px monospace';

        this.logs.forEach(log => {
            // Time tag
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillText(`[${log.timestamp}]`, 60, currentY);

            // Log prefix & content depending on level
            let prefix = '';
            if (log.type === 'info') {
                ctx.fillStyle = '#00e5ff'; // Neon Cyan
                prefix = '[INFO] ';
            } else if (log.type === 'warn') {
                ctx.fillStyle = '#ffd600'; // Amber/Yellow
                prefix = '[WARN] ';
            } else if (log.type === 'error') {
                ctx.fillStyle = '#ff1744'; // Red
                prefix = '[FAIL] ';
            }

            ctx.fillText(prefix, 190, currentY);

            // Log body
            ctx.fillStyle = log.type === 'error' ? '#ff8a80' : 'rgba(255, 255, 255, 0.95)';
            ctx.fillText(log.text, 280, currentY);

            currentY += 56;
        });

        // Add retro blinking caret at the bottom
        const now = Date.now();
        if (Math.floor(now / 500) % 2 === 0) {
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(60, currentY - 20, 16, 26);
        }

        this.texture.needsUpdate = true;
    }
}
