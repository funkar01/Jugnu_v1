import * as THREE from 'three';

export class XRMenuBoard extends THREE.Group {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    public texture: THREE.CanvasTexture;
    private mesh: THREE.Mesh;

    public buttonConsole: THREE.Mesh;
    public buttonTranscript: THREE.Mesh;
    public buttonEdges: THREE.Mesh;

    constructor() {
        super();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 512;
        this.ctx = this.canvas.getContext('2d')!;
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // The main background panel
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), material);
        this.add(this.mesh);

        // Render main background
        this.renderBackground();

        // Create 3 button meshes that float slightly above the background
        this.buttonConsole = this.createButtonMesh(0.6, 0.15, 0, 0.15, 0.01);
        this.buttonTranscript = this.createButtonMesh(0.6, 0.15, 0, -0.05, 0.01);
        this.buttonEdges = this.createButtonMesh(0.6, 0.15, 0, -0.25, 0.01);

        this.add(this.buttonConsole);
        this.add(this.buttonTranscript);
        this.add(this.buttonEdges);
    }

    private renderBackground() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(10, 10, this.canvas.width - 20, this.canvas.height - 20, 24);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = '600 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("Toggle Menu", this.canvas.width / 2, 60);

        ctx.beginPath();
        ctx.moveTo(40, 80);
        ctx.lineTo(this.canvas.width - 40, 80);
        ctx.stroke();

        this.texture.needsUpdate = true;
    }

    private createButtonMesh(w: number, h: number, x: number, y: number, z: number) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        
        const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.set(x, y, z);
        mesh.userData = { canvas, ctx: canvas.getContext('2d')!, texture };
        return mesh;
    }

    public updateButton(button: THREE.Mesh, label: string, state: boolean) {
        const data = button.userData;
        const ctx = data.ctx as CanvasRenderingContext2D;
        const canvas = data.canvas as HTMLCanvasElement;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Button BG
        ctx.fillStyle = state ? 'rgba(50, 200, 100, 0.8)' : 'rgba(200, 50, 50, 0.8)';
        ctx.beginPath();
        ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 16);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${label}: ${state ? 'ON' : 'OFF'}`, canvas.width / 2, canvas.height / 2);

        data.texture.needsUpdate = true;
    }
}
