import * as THREE from 'three';
import { AssetManager } from '@iwsdk/core';

export class JugnuInstructionBoard extends THREE.Group {
    private mesh: THREE.Mesh;
    private currentStep: number = -1;

    constructor() {
        super();
        
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.1
        });
        
        const geometry = new THREE.PlaneGeometry(0.3, 0.3);
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);

        this.setStep(0);
    }

    public setStep(step: number) {
        if (this.currentStep === step) return;
        this.currentStep = step;

        let texKey = "";
        if (step === 0) texKey = "tutorial_pinch";
        else if (step === 1) texKey = "tutorial_uwu";
        else if (step === 2) texKey = "tutorial_tap";

        if (texKey) {
            const tex = AssetManager.getTexture(texKey);
            if (tex) {
                tex.colorSpace = THREE.SRGBColorSpace;
                const mat = this.mesh.material as THREE.MeshBasicMaterial;
                mat.map = tex;
                mat.needsUpdate = true;
                
                if (tex.image) {
                    const img = tex.image as HTMLImageElement;
                    const w = img.width || 1;
                    const h = img.height || 1;
                    const aspect = w / h;
                    
                    this.mesh.geometry.dispose();
                    // Keep height at 25cm, scale width by aspect ratio
                    this.mesh.geometry = new THREE.PlaneGeometry(0.25 * aspect, 0.25);
                }
            } else {
                this.currentStep = -1;
                setTimeout(() => this.setStep(step), 500);
            }
        }
    }
}
