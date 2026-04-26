import { createSystem, createComponent, Pressed, Vector3 } from "@iwsdk/core";
import { XRMenuBoard } from "./XRMenuBoard.js";
import { TranscriptUI } from "./jugnu.js";
import { GlobalRoomConfig } from "./roomVisualizer.js";
import * as THREE from "three";

export const ToggleAction = createComponent("ToggleAction", { action: String });
export const ConsoleUI = createComponent("ConsoleUI", {});
export const MenuUI = createComponent("MenuUI", {});

export class XRMenuSystem extends createSystem({
    menuClicks: { required: [ToggleAction, Pressed] },
    menus: { required: [MenuUI] },
    consoles: { required: [ConsoleUI] },
    transcripts: { required: [TranscriptUI] }
}) {
    private gestureCooldown = 0;
    
    // States
    private menuVisible = false;
    private consoleVisible = false;
    private transcriptVisible = true;
    private edgesVisible = true;

    init() {
        // Initialize States visually on the menus
        this.queries.menus.entities.forEach(entity => {
            const menuBoard = entity.object3D as XRMenuBoard;
            if (menuBoard) {
                menuBoard.updateButton(menuBoard.buttonConsole, "Console Log", this.consoleVisible);
                menuBoard.updateButton(menuBoard.buttonTranscript, "Jugnu Transcript", this.transcriptVisible);
                menuBoard.updateButton(menuBoard.buttonEdges, "Room Edges", this.edgesVisible);
                menuBoard.visible = this.menuVisible;
            }
        });

        // Initialize Console visibility
        this.queries.consoles.entities.forEach(e => {
            if (e.object3D) e.object3D.visible = this.consoleVisible;
        });

        // Initialize Transcript visibility
        this.queries.transcripts.entities.forEach(e => {
            if (e.object3D) e.object3D.visible = this.transcriptVisible;
        });

        // Initialize Edges visibility
        GlobalRoomConfig.showEdges = this.edgesVisible;

        // Subscribe to button clicks
        this.queries.menuClicks.subscribe("qualify", (entity) => {
            const action = entity.getValue(ToggleAction, "action");
            const menuBoardEntity = this.queries.menus.entities[0];
            if (!menuBoardEntity) return;
            const menuBoard = menuBoardEntity.object3D as XRMenuBoard;

            if (action === "console") {
                this.consoleVisible = !this.consoleVisible;
                menuBoard.updateButton(menuBoard.buttonConsole, "Console Log", this.consoleVisible);
                this.queries.consoles.entities.forEach(e => {
                    if (e.object3D) e.object3D.visible = this.consoleVisible;
                });
            } else if (action === "transcript") {
                this.transcriptVisible = !this.transcriptVisible;
                menuBoard.updateButton(menuBoard.buttonTranscript, "Jugnu Transcript", this.transcriptVisible);
                this.queries.transcripts.entities.forEach(e => {
                    if (e.object3D) e.object3D.visible = this.transcriptVisible;
                });
            } else if (action === "scan_edges") {
                this.edgesVisible = !this.edgesVisible;
                menuBoard.updateButton(menuBoard.buttonEdges, "Room Edges", this.edgesVisible);
                GlobalRoomConfig.showEdges = this.edgesVisible;
            }
        });
    }

    private detectPeaceSign(handedness: 'left' | 'right'): boolean {
        const source = this.input.getPrimaryInputSource(handedness);
        const frame = this.xrFrame;
        if (!source || !source.hand || !frame) return false;
        
        const wrist = source.hand.get('wrist');
        const indexTip = source.hand.get('index-finger-tip');
        const middleTip = source.hand.get('middle-finger-tip');
        const ringTip = source.hand.get('ring-finger-tip');
        const pinkyTip = source.hand.get('pinky-finger-tip');

        if (!wrist || !indexTip || !middleTip || !ringTip || !pinkyTip) return false;

        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace || typeof frame.getJointPose !== 'function') return false;

        const wPose = frame.getJointPose(wrist, refSpace);
        const iPose = frame.getJointPose(indexTip, refSpace);
        const mPose = frame.getJointPose(middleTip, refSpace);
        const rPose = frame.getJointPose(ringTip, refSpace);
        const pPose = frame.getJointPose(pinkyTip, refSpace);

        if (wPose && iPose && mPose && rPose && pPose) {
            const wPos = wPose.transform.position;
            
            const dist = (pose: XRJointPose) => {
                const p = pose.transform.position;
                return Math.sqrt((p.x - wPos.x)**2 + (p.y - wPos.y)**2 + (p.z - wPos.z)**2);
            };

            const iDist = dist(iPose);
            const mDist = dist(mPose);
            const rDist = dist(rPose);
            const pDist = dist(pPose);

            // Peace sign: index and middle extended, ring and pinky curled.
            // Usually extended distance is > 0.12m, curled is < 0.08m
            if (iDist > 0.12 && mDist > 0.12 && rDist < 0.10 && pDist < 0.10) {
                return true;
            }
        }

        return false;
    }

    update(dt: number) {
        if (this.gestureCooldown > 0) {
            this.gestureCooldown -= dt;
        } else {
            const peaceLeft = this.detectPeaceSign('left');
            const peaceRight = this.detectPeaceSign('right');

            if (peaceLeft || peaceRight) {
                this.menuVisible = !this.menuVisible;
                this.gestureCooldown = 2.0; // 2 second cooldown to prevent flickering

                this.queries.menus.entities.forEach(entity => {
                    const menuBoard = entity.object3D as XRMenuBoard;
                    if (menuBoard) {
                        menuBoard.visible = this.menuVisible;
                        if (this.menuVisible) {
                            // Spawn in front of the camera
                            const headPos = new THREE.Vector3();
                            this.player.head.getWorldPosition(headPos);
                            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                            forward.y = 0; 
                            forward.normalize();
                            
                            const spawnPos = headPos.clone().add(forward.multiplyScalar(1.0));
                            menuBoard.position.copy(spawnPos);
                            menuBoard.lookAt(headPos);
                        }
                    }
                });
            }
        }
    }
}
