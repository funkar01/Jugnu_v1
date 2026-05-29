import { createComponent, createSystem, Pressed, Vector3, PhysicsBody, PhysicsState, PhysicsManipulation, PhysicsShape, PhysicsShapeType } from "@iwsdk/core";
import { MoodColors } from "./JugnuV3Model.js";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
const BACKEND_URL = ((import.meta as any).env.VITE_BACKEND_URL as string) || "/api/gemini";

import { JugnuInstructionBoard } from "./JugnuInstructionBoard.js";

export const Jugnu = createComponent("Jugnu", { instructionStep: { type: "Int8", default: 0 } });
export const TranscriptUI = createComponent("TranscriptUI", {});

export class JugnuSystem extends createSystem({
  jugnu: { required: [Jugnu] },
  jugnuClicked: { required: [Jugnu, Pressed] },
  transcriptBoard: { required: [TranscriptUI] },
  physicsShapes: { required: [PhysicsShape] },
}) {

  // Audio state
  private isListening = false;
  private isProcessingAudio = false;
  private synth!: SpeechSynthesis;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceTimer: number = 0;
  private listenTimer: number = 0;
  
  // Visual state
  private pulseTime = 0;
  private floatTime = 0;
  private basePositions = new Map<any, THREE.Vector3>();
  private baseQuats = new Map<any, THREE.Quaternion>();
  private baseScales = new Map<any, THREE.Vector3>();
  private interactDecay = 0;
  
  // For facing tracking
  private lookAtTarget!: Vector3;
  private vec3!: Vector3;
  private headQuat!: THREE.Quaternion;
  private headPos!: THREE.Vector3;

  // Interaction & Room State
  private interactionState: 'WaitingForRoom' | 'Idle' | 'Following' | 'LerpingToHand' | 'Attached' | 'Anchored' = 'WaitingForRoom';
  private roomPromptTimer = 0;
  private sceneCaptureRequested = false;
  private roomWaitTimer = 1.0;
  private fallbackSpawnTimer = 10.0;
  private throwTimer = 0;
  private lerpTime = 0;
  private lerpDuration = 0.3;
  private startPos = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private attachedHand: 'left' | 'right' | null = null;
  private wasPinchingLeft = false;
  private wasPinchingRight = false;
  private leftPinchTip = new THREE.Vector3();
  private rightPinchTip = new THREE.Vector3();
  private attractionRadius = 0.3;
  private alwaysAttractOnPinch = true;

  // Spring & Movement Constants
  private velocity = new THREE.Vector3();
  private springStiffness = 150.0;
  private springDamping = 12.0;
  private centerPos = new THREE.Vector3(0, 1.45, -0.8);
  private floatRadius = 0.12; // Calmed float radius (from 0.25 to 0.12) to avoid excessive drift
  private tempScale = new THREE.Vector3();
  private handVelocity = new THREE.Vector3();
  private previousHandPos = new THREE.Vector3();

  // Particle Trail System
  private particleMesh!: THREE.InstancedMesh;
  private maxParticles = 2000;
  private particleData: { active: boolean, pos: THREE.Vector3, life: number, maxLife: number }[] = [];
  private nextParticleIdx = 0;
  private lastJugnuPos = new THREE.Vector3();

  // Expression UI
  private expressionList: Mood[] = ['bored', 'calm', 'happy', 'sad', 'bright', 'blushing', 'winking'];
  private currentExpressionIndex = 2; // Default to happy

  private instructionBoard!: JugnuInstructionBoard;

  // Compass UI State
  private isCompassOpen = false;
  private isGridLocked = false;
  private compassGroup!: THREE.Group;
  private compassNeedle!: THREE.Mesh;
  private compassRing!: THREE.Mesh;
  private compassBackingBoard!: THREE.Mesh;
  private compassBackingCanvas!: HTMLCanvasElement;
  private compassBackingCtx!: CanvasRenderingContext2D;
  private compassBackingTexture!: THREE.CanvasTexture;
  private indexPinchTimer = 0.0;
  private pinchReleasedTimer = 0.0;
  private hoveredCellIndex = -1;
  private activeCompassTileIndex = -1; // -1 for none
  private compassInfoCard!: THREE.Mesh;
  private compassInfoMat!: THREE.MeshBasicMaterial;
  private compassInfoTextCanvas!: HTMLCanvasElement;
  private compassInfoTextCtx!: CanvasRenderingContext2D;
  private compassInfoTextTexture!: THREE.CanvasTexture;
  private buttonCooldown = 0.0;
  private isChatOpen = false;
  private compassChatCard!: THREE.Mesh;
  private compassChatMat!: THREE.MeshBasicMaterial;
  private compassChatCanvas!: HTMLCanvasElement;
  private compassChatCtx!: CanvasRenderingContext2D;
  private compassChatTexture!: THREE.CanvasTexture;
  private chatHistory: { sender: string, text: string }[] = [];
  private isDebugOpen = false;
  private compassDebugCard!: THREE.Mesh;
  private compassDebugMat!: THREE.MeshBasicMaterial;
  private compassDebugCanvas!: HTMLCanvasElement;
  private compassDebugCtx!: CanvasRenderingContext2D;
  private compassDebugTexture!: THREE.CanvasTexture;
  private debugHistory: { type: 'info' | 'warn' | 'error', text: string, timestamp: string }[] = [];
  private maxDebugLogs = 12;
  private originalLog = console.log;
  private originalWarn = console.warn;
  private originalError = console.error;
  private lockedCompassPos: THREE.Vector3 | null = null;
  private lockedCompassQuat: THREE.Quaternion | null = null;
  private isTutorialOpen = false;
  private compassTutorialCard!: THREE.Mesh;
  private compassTutorialMat!: THREE.MeshBasicMaterial;
  private compassTutorialCanvas!: HTMLCanvasElement;
  private compassTutorialCtx!: CanvasRenderingContext2D;
  private compassTutorialTexture!: THREE.CanvasTexture;

  init() {
    this.chatHistory.push({ sender: 'System', text: 'Jugnu XR Core Engine v13.4 initialized.' });
    this.chatHistory.push({ sender: 'System', text: 'Haptic controllers online & calibrated.' });
    this.chatHistory.push({ sender: 'System', text: 'Dual-tip magnetic true north gyro active.' });
    this.chatHistory.push({ sender: 'System', text: 'Gemini cognitive pipeline: standby.' });

    this.hookConsole();

    this.instructionBoard = new JugnuInstructionBoard();
    this.world.createTransformEntity(this.instructionBoard);

    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();
    this.headQuat = new THREE.Quaternion();
    this.headPos = new THREE.Vector3();

    this.synth = window.speechSynthesis;
    
    // Initialize Particle System
    const pGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    
    // Hide all particles initially
    const dummy = new THREE.Object3D();
    dummy.scale.setScalar(0);
    const initialColor = new THREE.Color(0xffffff);
    for (let i = 0; i < this.maxParticles; i++) {
        dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, dummy.matrix);
        this.particleMesh.setColorAt(i, initialColor);
        this.particleData.push({ active: false, pos: new THREE.Vector3(), life: 0, maxLife: 1.0 });
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.world.createTransformEntity(this.particleMesh);

    // Initialize UI and Keys
    this.createExpressionUI();
    this.initCompassUI();
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Handle Click
    this.queries.jugnuClicked.subscribe("qualify", async (entity) => {
      this.interactDecay = 8.0; 
      
      const jugModel = entity.object3D as JugnuV3Model;
      if (jugModel && typeof jugModel.setMood === 'function') {
         jugModel.setMood('bright'); 
      }
      if (jugModel && typeof jugModel.triggerPinchAnimation === 'function') {
         jugModel.triggerPinchAnimation();
      }
      
      if (this.isListening) {
         if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
             this.mediaRecorder.stop();
         }
      } else if (!this.isProcessingAudio) {
        if (this.synth && this.synth.speaking) {
           this.synth.cancel();
        }
        await this.startRecording();
      }
    });
  }

  updateTranscriptUI(userText: string, jugnuReply: string) {
      this.queries.transcriptBoard.entities.forEach(entity => {
          const board = entity.object3D as JugnuTranscriptBoard;
          if (board && typeof board.updateText === 'function') {
              board.updateText(userText, jugnuReply);
          }
      });

      if (userText === "Listening...") {
          this.chatHistory.push({ sender: 'System', text: 'Microphone recording active...' });
          this.redrawCompassChat();
      } else if (userText === "Processing Audio...") {
          this.chatHistory.push({ sender: 'System', text: 'Processing audio through Gemini...' });
          this.redrawCompassChat();
      } else {
          this.chatHistory.push({ sender: 'You', text: userText.substring(0, 46) + (userText.length > 46 ? '...' : '') });
          this.chatHistory.push({ sender: 'Jugnu', text: jugnuReply.substring(0, 46) + (jugnuReply.length > 46 ? '...' : '') });
          this.redrawCompassChat();
      }
  }

  createExpressionUI() {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.bottom = "20px";
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.display = "flex";
    container.style.gap = "10px";
    container.style.zIndex = "999";
    container.style.background = "rgba(0,0,0,0.5)";
    container.style.padding = "10px";
    container.style.borderRadius = "10px";
    container.style.alignItems = "center";
    
    const label = document.createElement("span");
    label.innerText = "Expressions (Q/E): ";
    label.style.color = "white";
    label.style.fontFamily = "sans-serif";
    container.appendChild(label);

    this.expressionList.forEach((mood, i) => {
        const btn = document.createElement("button");
        btn.innerText = mood;
        btn.style.padding = "5px 10px";
        btn.style.cursor = "pointer";
        btn.style.textTransform = "capitalize";
        btn.style.borderRadius = "5px";
        btn.style.border = "none";
        // Give hover and active effects for premium feel
        btn.style.transition = "background-color 0.2s, transform 0.1s";
        btn.onmouseenter = () => btn.style.backgroundColor = "#e0e0e0";
        btn.onmouseleave = () => btn.style.backgroundColor = "white";
        btn.onmousedown = () => btn.style.transform = "scale(0.95)";
        btn.onmouseup = () => btn.style.transform = "scale(1)";
        btn.onclick = () => this.setExpression(i);
        container.appendChild(btn);
    });

    document.body.appendChild(container);
  }

  handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'q') {
          let newIdx = this.currentExpressionIndex - 1;
          if (newIdx < 0) newIdx = this.expressionList.length - 1;
          this.setExpression(newIdx);
      } else if (e.key.toLowerCase() === 'e') {
          let newIdx = this.currentExpressionIndex + 1;
          if (newIdx >= this.expressionList.length) newIdx = 0;
          this.setExpression(newIdx);
      }
  }

  setExpression(index: number) {
      this.currentExpressionIndex = index;
      const mood = this.expressionList[index];
      this.queries.jugnu.entities.forEach(entity => {
          const jugModel = entity.object3D as JugnuV3Model;
          if (jugModel && typeof jugModel.setMood === 'function') {
              jugModel.setMood(mood);
          }
      });
  }

  async startRecording() {
     try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.isListening = true;
        this.updateTranscriptUI("Listening...", "");
        
        this.audioChunks = [];
        this.silenceTimer = 0;
        this.listenTimer = 0;

        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        this.mediaRecorder.ondataavailable = (e) => {
           if (e.data.size > 0) {
              this.audioChunks.push(e.data);
           }
        };

        this.mediaRecorder.onstop = async () => {
           this.isListening = false;
           this.isProcessingAudio = true;
           this.updateTranscriptUI("Processing Audio...", "Thinking...");

           stream.getTracks().forEach(track => track.stop());
           if (this.audioContext) {
               await this.audioContext.close();
               this.audioContext = null;
               this.analyser = null;
           }

           const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
           const base64Audio = await this.blobToBase64(audioBlob);
           this.audioChunks = [];
           
           if (base64Audio) {
               const base64Data = base64Audio.split(',')[1];
               if (base64Data) {
                   await this.handleAudioQuery(base64Data);
               }
           }
           this.isProcessingAudio = false;
        };

        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        this.mediaRecorder.start();
     } catch (err) {
        console.error("Microphone access denied or error:", err);
        this.isListening = false;
        this.speak("I cannot hear you. Please enable microphone permissions.");
     }
  }

  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  async handleAudioQuery(base64Data: string) {
    try {
      const url = BACKEND_URL;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `You are Jugnu, a friendly, concise robotic avatar companion in a WebVR environment. Keep your responses short and conversational. The user provided an audio message. Please transcribe and respond appropriately to their intent.\n\nFormat your exact response like this:\nTRANSCRIPT: [what you heard the user say]\nREPLY: [your conversational answer]\n\nAt the very end of your REPLY, please append exactly one mood tag from this list based on the sentiment: [MOOD: bored], [MOOD: calm], [MOOD: happy], [MOOD: sad], [MOOD: bright], [MOOD: blushing], [MOOD: winking].` },
              { inlineData: { mimeType: "audio/webm", data: base64Data } }
            ]
          }]
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "Unknown Gemini API Error");
      }
      
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
         let transcript = "Unknown audio";
         let reply = rawText;

         const tMatch = rawText.match(/TRANSCRIPT:\s*([\s\S]*?)\nREPLY:\s*([\s\S]*)/i);
         if (tMatch) {
             transcript = tMatch[1].trim();
             reply = tMatch[2].trim();
         }

         let mood: Mood = 'happy';
         const moodMatch = reply.match(/\[MOOD:\s*(bored|calm|happy|sad|bright|blushing|winking)\]/i);
         if (moodMatch) {
             mood = moodMatch[1].toLowerCase() as Mood;
         }
         reply = reply.replace(/\[MOOD:\s*[a-zA-Z]+\]/gi, '').trim();

         this.updateTranscriptUI(transcript, reply);

         this.queries.jugnu.entities.forEach(entity => {
             const jugModel = entity.object3D as JugnuV3Model;
             if (jugModel && typeof jugModel.setMood === 'function') {
                 jugModel.setMood(mood);
             }
         });

         this.speak(reply);
      }
    } catch (e) {
      console.error("Gemini Error:", e);
      this.queries.jugnu.entities.forEach(entity => {
          const jugModel = entity.object3D as JugnuV3Model;
          if (jugModel && typeof jugModel.setMood === 'function') {
              jugModel.setMood('sad');
          }
      });
      this.speak("Sorry, I am having trouble connecting to my brain right now.");
    }
  }

  speak(text: string) {
     if (this.synth && this.synth.speaking) {
         this.synth.cancel();
     }
     if (this.synth) {
         const utterance = new SpeechSynthesisUtterance(text);
         this.synth.speak(utterance);
     }
  }

  activateJugnu() {
      this.interactionState = 'Following';
      
      this.player.head.getWorldPosition(this.headPos);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
      forward.y = 0; 
      forward.normalize();
      
      const spawnPos = this.headPos.clone().add(forward.multiplyScalar(0.8));
      spawnPos.y = this.headPos.y - 0.2; 

      this.centerPos.copy(spawnPos); 

      this.queries.jugnu.entities.forEach(e => { 
          if (e.object3D) {
              e.object3D.position.copy(spawnPos);
              e.object3D.visible = true; 
          }
      });
  }

  private noise(t: number, seed: number): number {
    const t0 = Math.floor(t);
    const t1 = t0 + 1;
    const f = t - t0;
    const fade = f * f * (3 - 2 * f);
    const hash = (n: number) => {
       const x = Math.sin(n + seed * 123.456) * 43758.5453123;
       return (x - Math.floor(x)) * 2.0 - 1.0;
    };
    return hash(t0) * (1 - fade) + hash(t1) * fade;
  }

  private getPinchData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
    const source = this.input.getPrimaryInputSource(handedness);
    const frame = this.xrFrame;
    if (!source || !source.hand || !frame) return false;
    
    const indexTip = source.hand.get('index-finger-tip');
    const thumbTip = source.hand.get('thumb-tip');
    if (!indexTip || !thumbTip) return false;

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace || typeof frame.getJointPose !== 'function') return false;

    const indexPose = frame.getJointPose(indexTip, refSpace);
    const thumbPose = frame.getJointPose(thumbTip, refSpace);
    
    if (indexPose && thumbPose) {
       const ix = indexPose.transform.position.x;
       const iy = indexPose.transform.position.y;
       const iz = indexPose.transform.position.z;
       const tx = thumbPose.transform.position.x;
       const ty = thumbPose.transform.position.y;
       const tz = thumbPose.transform.position.z;
       
       const distSq = (ix - tx)**2 + (iy - ty)**2 + (iz - tz)**2;
       const isPinching = distSq < 0.02 * 0.02;

       tipPosOut.set(ix, iy, iz);
       tipPosOut.applyMatrix4(this.player.matrixWorld);

       return isPinching;
    }
    return false;
  }

  update(dt: number) {
    this.floatTime += dt;
    
    // Room Loading Block
    if (this.interactionState === 'WaitingForRoom') {
        const isXR = (this.renderer.xr as any).isPresenting;
        
        if (!isXR) {
            this.activateJugnu();
        } else {
            let roomFound = false;
            for (const entity of this.queries.physicsShapes.entities) {
                if (entity.getValue(PhysicsShape, 'shape') === PhysicsShapeType.TriMesh) {
                    roomFound = true;
                    break;
                }
            }
            
            if (roomFound) {
                this.activateJugnu();
            } else {
                this.roomWaitTimer -= dt;
                
                if (this.roomWaitTimer <= 0) {
                    if (!this.sceneCaptureRequested) {
                        this.sceneCaptureRequested = true;
                        const session = (this.renderer.xr as any).getSession ? (this.renderer.xr as any).getSession() : (this.renderer.xr as any).session;
                        if (session && typeof session.requestSceneCapture === 'function') {
                            session.requestSceneCapture().then(() => {
                                setTimeout(() => {
                                    if (this.interactionState === 'WaitingForRoom') {
                                        this.activateJugnu();
                                    }
                                }, 2000);
                            }).catch((err: any) => {
                                console.warn("Scene capture failed or denied:", err);
                                if (this.interactionState === 'WaitingForRoom') {
                                    this.activateJugnu();
                                }
                            });
                        } else {
                            this.activateJugnu();
                        }
                    } else {
                        // Wait for fallback timer to force spawn Jugnu
                        this.fallbackSpawnTimer -= dt;
                        if (this.fallbackSpawnTimer <= 0) {
                            if (this.interactionState === 'WaitingForRoom') {
                                this.activateJugnu();
                            }
                        }
                    }
                }
                this.queries.jugnu.entities.forEach(e => { if (e.object3D) e.object3D.visible = false; });
                return; 
            }
        }
    }

    if (this.interactDecay > 0) {
      this.interactDecay -= dt;
    }

    const safeDt = Math.min(dt, 0.03);

    // --- Pinch State Machine ---
    let isPinchingLeft = this.getPinchData('left', this.leftPinchTip);
    let isPinchingRight = this.getPinchData('right', this.rightPinchTip);

    // Safeguard: ignore index pinches if the user is currently rotating the tactical map or pinching near the open table
    if ((window as any).isRotatingMap) {
        isPinchingLeft = false;
        isPinchingRight = false;
    }
    if ((window as any).minimapTableVisible) {
        const tablePos = (window as any).minimapTablePosition as THREE.Vector3;
        if (tablePos) {
            if (this.leftPinchTip.distanceTo(tablePos) < 0.35) {
                isPinchingLeft = false;
            }
            if (this.rightPinchTip.distanceTo(tablePos) < 0.35) {
                isPinchingRight = false;
            }
        }
    }

    if ((this.interactionState === 'Idle' || this.interactionState === 'Following' || this.interactionState === 'Anchored') && !this.isGridLocked) {
        let activeHand: 'left' | 'right' | null = null;
        let activeTip = this.leftPinchTip;

        if (isPinchingLeft && !this.wasPinchingLeft) {
            activeHand = 'left';
            activeTip = this.leftPinchTip;
        } else if (isPinchingRight && !this.wasPinchingRight) {
            activeHand = 'right';
            activeTip = this.rightPinchTip;
        }

        if (activeHand) {
            let activeJugnuPos = new THREE.Vector3();
            for (const entity of this.queries.jugnu.entities) {
                if (!entity.object3D) continue;
                activeJugnuPos.copy(entity.object3D.position);
                break;
            }
            
            const dist = activeJugnuPos.distanceTo(activeTip);
            if (this.alwaysAttractOnPinch || dist < this.attractionRadius) {
                this.interactionState = 'LerpingToHand';
                this.attachedHand = activeHand;
                this.startPos.copy(activeJugnuPos);
                this.targetPos.copy(activeTip);
                this.previousHandPos.copy(activeTip);
                this.handVelocity.set(0, 0, 0);
                this.lerpTime = 0;
                this.velocity.set(0, 0, 0);

                this.queries.jugnu.entities.forEach(e => {
                    if (e.getValue(Jugnu, "instructionStep") === 0) {
                        e.setValue(Jugnu, "instructionStep", 1);
                    }
                    const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (e.hasComponent(PhysicsBody)) e.removeComponent(PhysicsBody);
                        e.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
                    }
                });
            }
        }
    } else if (this.interactionState === 'LerpingToHand') {
        const isPinching = this.attachedHand === 'left' ? isPinchingLeft : isPinchingRight;
        const currentTip = this.attachedHand === 'left' ? this.leftPinchTip : this.rightPinchTip;
        
        if (!isPinching) {
            this.attachedHand = null;
            if (this.handVelocity.lengthSq() > 1.0) {
                this.interactionState = 'Idle';
                this.throwTimer = 3.0; 
                this.queries.jugnu.entities.forEach(entity => {
                    if (!entity.object3D) return;
                    this.basePositions.set(entity, entity.object3D.position.clone());
                    if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                    if (!entity.hasComponent(PhysicsShape)) entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                        entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
                    }
                });
            }
            this.velocity.set(0, 0, 0);
        } else {
            this.lerpTime += safeDt;
            this.targetPos.copy(currentTip);
            if (safeDt > 0.001) {
               const instVel = new THREE.Vector3().subVectors(currentTip, this.previousHandPos).divideScalar(safeDt);
               this.handVelocity.lerp(instVel, 0.5);
            }
            this.previousHandPos.copy(currentTip);
            
            if (this.lerpTime >= this.lerpDuration) {
                this.interactionState = 'Attached';
            }
        }
    } else if (this.interactionState === 'Attached') {
        const isPinching = this.attachedHand === 'left' ? isPinchingLeft : isPinchingRight;
        const currentTip = this.attachedHand === 'left' ? this.leftPinchTip : this.rightPinchTip;
        
        if (!isPinching) {
            this.attachedHand = null;
            if (this.handVelocity.lengthSq() > 1.0) {
                this.interactionState = 'Idle';
                this.throwTimer = 3.0; 
                this.queries.jugnu.entities.forEach(entity => {
                    if (!entity.object3D) return;
                    this.basePositions.set(entity, entity.object3D.position.clone());
                    if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                    if (!entity.hasComponent(PhysicsShape)) entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                        entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
                    }
                });
            }
            this.velocity.set(0, 0, 0);
        } else {
            this.targetPos.copy(currentTip);
            if (safeDt > 0.001) {
               const instVel = new THREE.Vector3().subVectors(currentTip, this.previousHandPos).divideScalar(safeDt);
               this.handVelocity.lerp(instVel, 0.5);
            }
            this.previousHandPos.copy(currentTip);
        }
    }

    this.wasPinchingLeft = isPinchingLeft;
    this.wasPinchingRight = isPinchingRight;
    // --- End Pinch State Machine ---

    // Silence detection logic
    if (this.isListening && this.analyser && this.mediaRecorder?.state === "recording") {
        this.listenTimer += safeDt;
        if (this.listenTimer > 8.0) {
             this.mediaRecorder.stop();
             this.listenTimer = 0;
        } else {
             const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
             this.analyser.getByteFrequencyData(dataArray);
             let maxVolume = 0;
             for (let i = 0; i < dataArray.length; i++) {
                 if (dataArray[i] > maxVolume) maxVolume = dataArray[i];
             }
             if (maxVolume < 40) {
                 this.silenceTimer += safeDt;
                 if (this.silenceTimer > 2.0) { 
                     this.mediaRecorder.stop();
                     this.silenceTimer = 0;
                 }
             } else {
                 this.silenceTimer = 0; 
             }
        }
    }

    let activeJugnuModel: JugnuV3Model | null = null;
    let activeJugnuPos = new THREE.Vector3();
    let instructionStep = 0;

    this.queries.jugnu.entities.forEach((entity) => {
      instructionStep = entity.getValue(Jugnu, "instructionStep") as number;

      // Detect index fingers touching together for step 1 -> step 2 transition
      if (instructionStep === 1) {
          const leftSource = this.input.getPrimaryInputSource('left');
          const rightSource = this.input.getPrimaryInputSource('right');
          if (leftSource && leftSource.hand && rightSource && rightSource.hand) {
              const dist = this.leftPinchTip.distanceTo(this.rightPinchTip);
              if (dist < 0.03) { // 3cm threshold
                  entity.setValue(Jugnu, "instructionStep", 2);
                  console.log("[JugnuSystem] Step 1 complete: index fingers touched! Advancing to Step 2.");
              }
          }
      }

      const obj = entity.object3D;
      const jugModel = obj as JugnuV3Model;
      if (!obj || !jugModel || typeof jugModel.update !== 'function') return;
      
      activeJugnuModel = jugModel;
      activeJugnuPos.copy(obj.position);

      // Determine Interaction Speed for Colors
      let speedMult = 0.0;
      if (this.interactionState === 'Idle') {
          speedMult = this.velocity.length() * 2.0; // Fast cycle when thrown
      } else if (this.interactionState === 'Following') {
          speedMult = this.velocity.length() * 0.5; // Slow cycle while following
      } else {
          speedMult = 0.0; // Stable when attached or pinched
      }

      jugModel.update(safeDt, speedMult);

      if (!this.basePositions.has(entity)) {
        this.basePositions.set(entity, obj.position.clone());
        this.baseQuats.set(entity, obj.quaternion.clone());
        obj.scale.setScalar(0.03); // Initial compact baseline scale (tiny)
        this.baseScales.set(entity, obj.scale.clone());
      }
      const basePos = this.basePositions.get(entity)!;
      const baseScale = this.baseScales.get(entity)!;
      
      this.player.head.getWorldPosition(this.headPos);
      const distToPlayer = obj.position.distanceTo(this.headPos);
      
      // Baseline scale is 0.03 (tiny). When pinched (Attached or LerpingToHand), stay at 0.03.
      // When released close to us (within 1m), stay at 0.03.
      // When thrown away, increase in size up to a max of 0.25.
      let targetScale = 0.03;
      if (this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand' || this.isGridLocked) {
          targetScale = 0.03;
      } else {
          if (distToPlayer > 1.0) {
              targetScale = THREE.MathUtils.clamp(0.03 + (distToPlayer - 1.0) * 0.11, 0.03, 0.25);
          }
      }
      
      this.tempScale.setScalar(targetScale);
      baseScale.lerp(this.tempScale, 4.0 * safeDt);
      
      const isPinched = this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand';
      const targetPinchProgress = isPinched ? 1.0 : 0.0;
      jugModel.pinchProgress = THREE.MathUtils.lerp(jugModel.pinchProgress || 0, targetPinchProgress, 5.0 * safeDt);
      
      if (this.interactionState === 'Idle') {
          if (this.throwTimer > 0) {
              this.throwTimer -= safeDt;
          } else {
              this.interactionState = 'Anchored';
              this.centerPos.copy(obj.position);
              const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                  entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
              }
          }
      } else if (this.interactionState === 'Following' || this.interactionState === 'Anchored') {
          if (this.isGridLocked) {
              // Rigid Lock: perfectly frozen with zero floating/noise/drift
              obj.position.copy(this.centerPos);
              this.velocity.set(0, 0, 0);
          } else {
              if (this.interactionState === 'Following') {
                  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                  forward.y = 0; 
                  forward.normalize();
                  
                  // Calmed down: float farther away (1.25m instead of 0.95m) and lower to stay out of directly blocking user face
                  const targetCenter = this.headPos.clone().add(forward.multiplyScalar(1.25)); 
                  targetCenter.y -= 0.22; 
                  
                  // Calmed down: slower following transition (0.7x instead of 1.0x) so it floats lazily
                  this.centerPos.lerp(targetCenter, 0.7 * safeDt);
              }

              const floatX = this.noise(this.floatTime * 0.18, 0) * this.floatRadius;
              const floatY = this.noise(this.floatTime * 0.18, 1) * this.floatRadius * 0.5;
              const floatZ = this.noise(this.floatTime * 0.18, 2) * this.floatRadius;
              const hoverTarget = this.centerPos.clone().add(new THREE.Vector3(floatX, floatY, floatZ));

              const displacement = new THREE.Vector3().subVectors(obj.position, hoverTarget);
              const force = displacement.multiplyScalar(-this.springStiffness * 0.5); 
              force.sub(this.velocity.clone().multiplyScalar(this.springDamping));

              this.velocity.add(force.multiplyScalar(safeDt));
              obj.position.add(this.velocity.clone().multiplyScalar(safeDt));
          }
          
          entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });

      } else if (this.interactionState === 'LerpingToHand') {
          const t = Math.min(this.lerpTime / this.lerpDuration, 1.0);
          const smoothT = t * t * (3 - 2 * t);
          const oldPos = obj.position.clone();
          obj.position.lerpVectors(this.startPos, this.targetPos, smoothT);
          
          if (safeDt > 0.0001) {
              this.velocity.subVectors(obj.position, oldPos).divideScalar(safeDt);
              entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
          }
      } else if (this.interactionState === 'Attached') {
          const hoverTarget = this.targetPos.clone();
          // hoverTarget.y += 0.08; 

          const displacement = new THREE.Vector3().subVectors(obj.position, hoverTarget);
          const force = displacement.multiplyScalar(-this.springStiffness);
          force.sub(this.velocity.clone().multiplyScalar(this.springDamping));

          this.velocity.add(force.multiplyScalar(safeDt));
          obj.position.add(this.velocity.clone().multiplyScalar(safeDt));
          
          entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
      }

      obj.lookAt(this.headPos);

      if (this.interactionState !== 'Idle') {
          const tiltFactor = 0.5;
          const tiltAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.velocity);
          const tiltAngle = Math.min(tiltAxis.length() * tiltFactor, Math.PI / 4);
          if (tiltAngle > 0.001) {
              tiltAxis.normalize();
              const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tiltAngle);
              obj.quaternion.premultiply(tiltQuat);
          }
      }

      if (this.isListening || this.isProcessingAudio) {
        this.pulseTime += safeDt;
        const speed = this.isProcessingAudio ? 10 : 5;
        const pulseAmt = this.isProcessingAudio ? 0.05 : 0.25; 
        const pulse = 1.0 + Math.sin(this.pulseTime * speed) * pulseAmt;
        obj.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z * pulse);
        jugModel.pulseIntensity = Math.abs(Math.sin(this.pulseTime * speed));
      } else {
        this.pulseTime = 0;
        obj.scale.lerp(baseScale, 10.0 * safeDt);
        jugModel.pulseIntensity = 0;
      }
    });

    // Particle Trail Update
    if (activeJugnuModel && this.interactionState === 'Idle' && this.throwTimer > 0) {
        const currentMood = this.expressionList[this.currentExpressionIndex];
        const color = MoodColors[currentMood] || new THREE.Color(0xffffff);

        if (this.lastJugnuPos.lengthSq() === 0) {
            this.lastJugnuPos.copy(activeJugnuPos);
        }

        const numToSpawn = 15;
        for (let j = 0; j < numToSpawn; j++) {
            const p = this.particleData[this.nextParticleIdx];
            p.active = true;
            
            const t = j / numToSpawn;
            p.pos.lerpVectors(this.lastJugnuPos, activeJugnuPos, t);
            
            const spread = 0.08;
            p.pos.x += (Math.random() - 0.5) * spread;
            p.pos.y += (Math.random() - 0.5) * spread;
            p.pos.z += (Math.random() - 0.5) * spread;
            
            p.life = p.maxLife * (0.6 + Math.random() * 0.4);
            
            this.particleMesh.setColorAt(this.nextParticleIdx, color);
            
            this.nextParticleIdx = (this.nextParticleIdx + 1) % this.maxParticles;
        }
        if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // Update Instruction Board Position & Text
    if (activeJugnuModel && this.instructionBoard) {
        if (instructionStep < 3) {
            this.instructionBoard.visible = false; // Hidden for now
            this.instructionBoard.setStep(instructionStep);
            
            // Position it nicely 22cm above Jugnu and face the player
            this.instructionBoard.position.copy(activeJugnuPos);
            this.instructionBoard.position.y += 0.22;
            
            this.player.head.getWorldPosition(this.headPos);
            this.instructionBoard.lookAt(this.headPos);
        } else {
            this.instructionBoard.visible = false;
        }
    }
    
    if (activeJugnuPos.lengthSq() > 0) {
        this.lastJugnuPos.copy(activeJugnuPos);
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxParticles; i++) {
        const p = this.particleData[i];
        if (p.active) {
            p.life -= safeDt;
            if (p.life <= 0) {
                p.active = false;
                dummy.scale.setScalar(0);
            } else {
                const t = p.life / p.maxLife;
                const scale = t * t * t;
                dummy.position.copy(p.pos);
                dummy.scale.setScalar(scale);
            }
            dummy.updateMatrix();
            this.particleMesh.setMatrixAt(i, dummy.matrix);
        }
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    // ─── Compass Update Loop ───
    if (this.buttonCooldown > 0.0) {
        this.buttonCooldown -= safeDt;
    }

    if (activeJugnuModel) {
        const leftTip = new THREE.Vector3();
        const rightTip = new THREE.Vector3();
        const isLeftPinching = this.getPinchData('left', leftTip);
        const isRightPinching = this.getPinchData('right', rightTip);

        // Activation pinch must be close to Jugnu (within 0.25m)
        let isPinchingNearJugnu = false;
        if (isLeftPinching && leftTip.distanceTo(activeJugnuPos) < 0.25) {
            isPinchingNearJugnu = true;
        } else if (isRightPinching && rightTip.distanceTo(activeJugnuPos) < 0.25) {
            isPinchingNearJugnu = true;
        }

        // Active hold check: any index pinch held anywhere keeping it open
        const isAnyPinchHeld = isLeftPinching || isRightPinching;

        if (!this.isCompassOpen) {
            if (isPinchingNearJugnu) {
                this.indexPinchTimer += safeDt;
                if (this.indexPinchTimer >= 2.0) {
                    this.isCompassOpen = true;
                    this.indexPinchTimer = 0.0;
                    this.buttonCooldown = 0.5;

                    console.log(`[Compass] Compass toggled! Open: ${this.isCompassOpen}`);
                    
                    this.compassGroup.visible = true;
                    this.activeCompassTileIndex = -1;
                    this.hoveredCellIndex = -1;
                    this.compassInfoMat.opacity = 0.0;
                    this.compassInfoCard.position.set(0, 0, -0.005);
                    this.redrawCompassGrid(-1);
                    
                    const jugModel = activeJugnuModel as JugnuV3Model;
                    if (jugModel && typeof jugModel.setMood === 'function') {
                        jugModel.setMood('happy');
                    }
                    if (jugModel && typeof jugModel.triggerPinchAnimation === 'function') {
                        jugModel.triggerPinchAnimation();
                    }
                }
            } else {
                this.indexPinchTimer = 0.0;
            }
        } else {
            // Compass is already open
            if (isAnyPinchHeld) {
                this.pinchReleasedTimer = 0.0; // Keep open as long as a pinch is held
            } else {
                if (!this.isGridLocked) {
                    this.pinchReleasedTimer += safeDt;
                    if (this.pinchReleasedTimer >= 2.0) {
                        this.isCompassOpen = false;
                        this.pinchReleasedTimer = 0.0;
                        console.log("[Compass] Pinch released for 2.0s. Closing Compass UI.");
                    }
                } else {
                    this.pinchReleasedTimer = 0.0;
                }
            }
        }
    }

    if (this.compassGroup) {
        if (this.isCompassOpen) {
            this.compassGroup.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 10.0);
        } else {
            this.compassGroup.scale.lerp(new THREE.Vector3(0, 0, 0), safeDt * 10.0);
            if (this.compassGroup.scale.x < 0.01 && this.compassGroup.visible) {
                this.compassGroup.visible = false;
            }
        }

        if (this.compassGroup.visible && activeJugnuPos.lengthSq() > 0) {
            if (this.isGridLocked) {
                if (!this.lockedCompassPos) {
                    this.lockedCompassPos = new THREE.Vector3().copy(activeJugnuPos);
                    this.lockedCompassPos.y += 1.5 * activeJugnuModel!.scale.y + 0.041; // 5 cm closer to Jugnu (0.041 offset)
                    this.player.head.getWorldPosition(this.headPos);
                    
                    const tempObj = new THREE.Object3D();
                    tempObj.position.copy(this.lockedCompassPos);
                    tempObj.lookAt(this.headPos);
                    this.lockedCompassQuat = new THREE.Quaternion().copy(tempObj.quaternion);
                }
                this.compassGroup.position.copy(this.lockedCompassPos);
                this.compassGroup.quaternion.copy(this.lockedCompassQuat!);
            } else {
                this.lockedCompassPos = null;
                this.lockedCompassQuat = null;
                this.compassGroup.position.copy(activeJugnuPos);
                // Spawns very close to Jugnu almost touching the top edge (5 cm closer, using 0.041 instead of 0.091):
                this.compassGroup.position.y += 1.5 * activeJugnuModel!.scale.y + 0.041;

                this.player.head.getWorldPosition(this.headPos);
                this.compassGroup.lookAt(this.headPos);
            }

            if (this.compassNeedle) {
                const worldNorth = new THREE.Vector3(0, 0, -1);
                const localNorth = worldNorth.clone().applyQuaternion(this.compassGroup.quaternion.clone().invert());
                const angle = Math.atan2(localNorth.x, localNorth.y);
                this.compassNeedle.rotation.z = -angle;
            }

            if (this.compassRing) {
                this.compassRing.rotation.z += safeDt * 0.5; // Slow diagnostic spin
            }

            if (this.activeCompassTileIndex !== -1) {
                this.compassInfoMat.opacity = THREE.MathUtils.lerp(this.compassInfoMat.opacity, 0.95, safeDt * 8.0);
                this.compassInfoCard.position.z = THREE.MathUtils.lerp(this.compassInfoCard.position.z, -0.012, safeDt * 8.0);
            }

            // Multi-tab side-by-side slide math for Chat, Tutorial, and Debug
            let openCards: string[] = [];
            if (this.isChatOpen) openCards.push('CHAT');
            if (this.isTutorialOpen) openCards.push('TUTORIAL');
            if (this.isDebugOpen) openCards.push('DEBUG');

            let targetTranscriptX = 0.0;
            let targetTutorialX = 0.0;
            let targetDebugX = 0.0;

            if (openCards.length === 1) {
                targetTranscriptX = 0.0;
                targetTutorialX = 0.0;
                targetDebugX = 0.0;
            } else if (openCards.length === 2) {
                // Assign first open card to -0.135 and second open card to 0.135
                if (openCards[0] === 'CHAT') targetTranscriptX = -0.135;
                if (openCards[0] === 'TUTORIAL') targetTutorialX = -0.135;
                if (openCards[0] === 'DEBUG') targetDebugX = -0.135;

                if (openCards[1] === 'CHAT') targetTranscriptX = 0.135;
                if (openCards[1] === 'TUTORIAL') targetTutorialX = 0.135;
                if (openCards[1] === 'DEBUG') targetDebugX = 0.135;
            } else if (openCards.length === 3) {
                // Spacing layout with three tabs active: Chat (-0.27), Tutorial center (0.0), Debug right (0.27)
                targetTranscriptX = -0.27;
                targetTutorialX = 0.0;
                targetDebugX = 0.27;
            }

            // Smooth scaling & sliding transition for the Transcript card (slides vertically ABOVE the board)
            if (this.compassChatCard) {
                if (this.isChatOpen) {
                    this.compassChatMat.opacity = THREE.MathUtils.lerp(this.compassChatMat.opacity, 0.95, safeDt * 8.0);
                    this.compassChatCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 8.0);
                    this.compassChatCard.position.x = THREE.MathUtils.lerp(this.compassChatCard.position.x, targetTranscriptX, safeDt * 8.0);
                    this.compassChatCard.position.y = THREE.MathUtils.lerp(this.compassChatCard.position.y, 0.15, safeDt * 8.0); // Vertically on top
                    this.compassChatCard.position.z = THREE.MathUtils.lerp(this.compassChatCard.position.z, -0.01, safeDt * 8.0);
                } else {
                    this.compassChatMat.opacity = THREE.MathUtils.lerp(this.compassChatMat.opacity, 0.0, safeDt * 8.0);
                    this.compassChatCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 8.0);
                    this.compassChatCard.position.x = THREE.MathUtils.lerp(this.compassChatCard.position.x, 0.0, safeDt * 8.0);
                    this.compassChatCard.position.y = THREE.MathUtils.lerp(this.compassChatCard.position.y, -0.02, safeDt * 8.0);
                    this.compassChatCard.position.z = THREE.MathUtils.lerp(this.compassChatCard.position.z, -0.01, safeDt * 8.0);
                }
            }

            // Smooth scaling & sliding transition for the Tutorial card (slides vertically ABOVE the board)
            if (this.compassTutorialCard) {
                if (this.isTutorialOpen) {
                    this.compassTutorialMat.opacity = THREE.MathUtils.lerp(this.compassTutorialMat.opacity, 0.95, safeDt * 8.0);
                    this.compassTutorialCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 8.0);
                    this.compassTutorialCard.position.x = THREE.MathUtils.lerp(this.compassTutorialCard.position.x, targetTutorialX, safeDt * 8.0);
                    this.compassTutorialCard.position.y = THREE.MathUtils.lerp(this.compassTutorialCard.position.y, 0.15, safeDt * 8.0); // Vertically on top
                    this.compassTutorialCard.position.z = THREE.MathUtils.lerp(this.compassTutorialCard.position.z, -0.01, safeDt * 8.0);
                    
                    // Reactive dynamic update matching user instructionStep
                    this.redrawCompassTutorial(instructionStep);
                } else {
                    this.compassTutorialMat.opacity = THREE.MathUtils.lerp(this.compassTutorialMat.opacity, 0.0, safeDt * 8.0);
                    this.compassTutorialCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 8.0);
                    this.compassTutorialCard.position.x = THREE.MathUtils.lerp(this.compassTutorialCard.position.x, 0.0, safeDt * 8.0);
                    this.compassTutorialCard.position.y = THREE.MathUtils.lerp(this.compassTutorialCard.position.y, -0.02, safeDt * 8.0);
                    this.compassTutorialCard.position.z = THREE.MathUtils.lerp(this.compassTutorialCard.position.z, -0.01, safeDt * 8.0);
                }
            }

            // Smooth scaling & sliding transition for the Debug Console card (slides vertically ABOVE the board)
            if (this.compassDebugCard) {
                if (this.isDebugOpen) {
                    this.compassDebugMat.opacity = THREE.MathUtils.lerp(this.compassDebugMat.opacity, 0.95, safeDt * 8.0);
                    this.compassDebugCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 8.0);
                    this.compassDebugCard.position.x = THREE.MathUtils.lerp(this.compassDebugCard.position.x, targetDebugX, safeDt * 8.0);
                    this.compassDebugCard.position.y = THREE.MathUtils.lerp(this.compassDebugCard.position.y, 0.15, safeDt * 8.0); // Vertically on top
                    this.compassDebugCard.position.z = THREE.MathUtils.lerp(this.compassDebugCard.position.z, -0.01, safeDt * 8.0);
                } else {
                    this.compassDebugMat.opacity = THREE.MathUtils.lerp(this.compassDebugMat.opacity, 0.0, safeDt * 8.0);
                    this.compassDebugCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 8.0);
                    this.compassDebugCard.position.x = THREE.MathUtils.lerp(this.compassDebugCard.position.x, 0.0, safeDt * 8.0);
                    this.compassDebugCard.position.y = THREE.MathUtils.lerp(this.compassDebugCard.position.y, -0.02, safeDt * 8.0);
                    this.compassDebugCard.position.z = THREE.MathUtils.lerp(this.compassDebugCard.position.z, -0.01, safeDt * 8.0);
                }
            }

            const leftIndexTip = new THREE.Vector3();
            const rightIndexTip = new THREE.Vector3();
            const hasLeft = this.getIndexData('left', leftIndexTip);
            const hasRight = this.getIndexData('right', rightIndexTip);

            let activeTip: THREE.Vector3 | null = null;
            if (hasLeft && hasRight) {
                const boardWorldPos = new THREE.Vector3();
                this.compassBackingBoard.getWorldPosition(boardWorldPos);
                activeTip = leftIndexTip.distanceTo(boardWorldPos) < rightIndexTip.distanceTo(boardWorldPos) ? leftIndexTip : rightIndexTip;
            } else if (hasLeft) {
                activeTip = leftIndexTip;
            } else if (hasRight) {
                activeTip = rightIndexTip;
            }

            let currentHoverIdx = -1;

            if (activeTip) {
                const localTip = activeTip.clone().applyMatrix4(this.compassGroup.matrixWorld.clone().invert());
                const isWithinHoverZ = Math.abs(localTip.z) < 0.025;
                const isWithinBoundsX = localTip.x > -0.075 && localTip.x < 0.075;
                const isWithinBoundsY = localTip.y > -0.0564 && localTip.y < 0.0564;

                if (isWithinHoverZ && isWithinBoundsX && isWithinBoundsY) {
                    let col = 1;
                    if (localTip.x < -0.025) col = 0;
                    else if (localTip.x > 0.025) col = 2;

                    let row = 1;
                    if (localTip.y > 0.0188) row = 0;
                    else if (localTip.y < -0.0188) row = 2;

                    currentHoverIdx = row * 3 + col;
                    const isPressed = Math.abs(localTip.z) < 0.014;

                    if (isPressed && currentHoverIdx !== 4 && this.buttonCooldown <= 0.0) {
                        this.buttonCooldown = 0.8;
                        const activeHand = activeTip === leftIndexTip ? 'left' : 'right';
                        const source = this.input.getPrimaryInputSource(activeHand);
                        if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                            source.gamepad.hapticActuators[0].pulse(0.8, 50);
                        }
                        this.activeCompassTileIndex = currentHoverIdx;
                        this.handleCompassTileClick(currentHoverIdx);
                    }
                }
            }

            if (currentHoverIdx !== this.hoveredCellIndex) {
                this.hoveredCellIndex = currentHoverIdx;
                this.redrawCompassGrid(currentHoverIdx);
            }
        }
    }
  }

  private getIndexData(handedness: 'left' | 'right', tipPosOut: THREE.Vector3): boolean {
      const source = this.input.getPrimaryInputSource(handedness);
      const frame = this.xrFrame;
      if (!source || !source.hand || !frame) return false;

      const indexTip = source.hand.get('index-finger-tip');
      if (!indexTip) return false;

      const refSpace = this.renderer.xr.getReferenceSpace();
      if (!refSpace || typeof frame.getJointPose !== 'function') return false;

      const indexPose = frame.getJointPose(indexTip, refSpace);

      if (indexPose) {
          const ix = indexPose.transform.position.x;
          const iy = indexPose.transform.position.y;
          const iz = indexPose.transform.position.z;
          tipPosOut.set(ix, iy, iz);
          tipPosOut.applyMatrix4(this.player.matrixWorld);
          return true;
      }
      return false;
  }

  private redrawCompassGrid(hoveredIdx: number) {
      const ctx = this.compassBackingCtx;
      const w = 256;
      const h = 192;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#05050f';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 12);
      ctx.fill();

      const cellW = w / 3;
      const cellH = h / 3;

      if (hoveredIdx >= 0 && hoveredIdx <= 8 && hoveredIdx !== 4) {
          const col = hoveredIdx % 3;
          const row = Math.floor(hoveredIdx / 3);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
          ctx.beginPath();
          ctx.roundRect(col * cellW + 4, row * cellH + 4, cellW - 8, cellH - 8, 8);
          ctx.fill();
      }

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cellW, 6); ctx.lineTo(cellW, h - 6);
      ctx.moveTo(cellW * 2, 6); ctx.lineTo(cellW * 2, h - 6);
      ctx.moveTo(6, cellH); ctx.lineTo(w - 6, cellH);
      ctx.moveTo(6, cellH * 2); ctx.lineTo(w - 6, cellH * 2);
      ctx.stroke();

      const icons = [
          { label: this.isChatOpen ? "CLOSE CHAT" : "CHAT", type: "CHAT" },
          { label: "STADIUM",  type: "STADIUM" },
          { label: this.isTutorialOpen ? "CLOSE TUTORIAL" : "TUTORIAL", type: "TUTORIAL" },
          { label: "VOICE",    type: "VOICE" },
          { label: "COMPASS",  type: "COMPASS" },
          { label: this.isDebugOpen ? "CLOSE DEBUG" : "DEBUG", type: "DEBUG" },
          { label: "EFFECTS",  type: "PARTICLES" },
          { label: "RESET",    type: "RESET" },
          { label: this.isGridLocked ? "UNLOCK" : "LOCK GRID", type: "LOCK" }
      ];

      icons.forEach((icon, idx) => {
          if (idx === 4) {
              const cx = cellW * 1.5;
              const cy = cellH * 1.5;
              ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.fillStyle = '#f97316';
              ctx.font = 'bold 11px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('N', cx, cy - 12);
              ctx.fillText('S', cx, cy + 12);
              ctx.fillText('E', cx + 12, cy);
              ctx.fillText('W', cx - 12, cy);
              return;
          }

          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;
          const iconY = cy - 8;
          
          if (icon.type === 'LOCK') {
              const isLocked = this.isGridLocked;
              ctx.strokeStyle = isLocked ? '#22c55e' : '#f97316';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(cx, iconY - 4, 6, Math.PI, 0);
              ctx.lineTo(cx + 6, iconY + 2);
              ctx.moveTo(cx - 6, iconY - 4);
              ctx.lineTo(cx - 6, iconY + 2);
              ctx.stroke();
              ctx.fillStyle = ctx.strokeStyle;
              ctx.beginPath();
              ctx.roundRect(cx - 9, iconY, 18, 12, 3);
              ctx.fill();
              ctx.fillStyle = '#05050f';
              ctx.beginPath();
              ctx.arc(cx, iconY + 5, 2, 0, 2 * Math.PI);
              ctx.fill();
          } else {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              if (icon.type === 'CHAT') {
                  ctx.fillStyle = this.isChatOpen ? '#22d3ee' : '#ffffff';
                  ctx.strokeStyle = ctx.fillStyle;
                  ctx.lineWidth = 3;
                  ctx.beginPath();
                  ctx.roundRect(cx - 12, iconY - 8, 24, 16, 4);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 4, iconY + 8);
                  ctx.lineTo(cx - 8, iconY + 13);
                  ctx.lineTo(cx - 8, iconY + 8);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                  
                  ctx.fillStyle = this.isChatOpen ? '#05050f' : '#ffffff';
                  ctx.beginPath();
                  ctx.arc(cx - 5, iconY, 1.5, 0, 2 * Math.PI);
                  ctx.arc(cx, iconY, 1.5, 0, 2 * Math.PI);
                  ctx.arc(cx + 5, iconY, 1.5, 0, 2 * Math.PI);
                  ctx.fill();
              } else if (icon.type === 'STADIUM') {
                  ctx.beginPath();
                  ctx.ellipse(cx, iconY, 14, 7, 0, 0, 2 * Math.PI);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 14, iconY); ctx.lineTo(cx - 14, iconY + 8);
                  ctx.moveTo(cx + 14, iconY); ctx.lineTo(cx + 14, iconY + 8);
                  ctx.stroke();
              } else if (icon.type === 'TUTORIAL') {
                  ctx.fillStyle = this.isTutorialOpen ? '#22d3ee' : '#ffffff';
                  ctx.strokeStyle = ctx.fillStyle;
                  ctx.lineWidth = 3;
                  // Draw book pages / outline
                  ctx.beginPath();
                  ctx.roundRect(cx - 12, iconY - 8, 24, 16, 2);
                  ctx.stroke();
                  // Center book binding line
                  ctx.beginPath();
                  ctx.moveTo(cx, iconY - 8);
                  ctx.lineTo(cx, iconY + 8);
                  ctx.stroke();
              } else if (icon.type === 'VOICE') {
                  ctx.beginPath();
                  ctx.roundRect(cx - 4, iconY - 10, 8, 16, 4);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(cx, iconY - 2, 8, 0, Math.PI);
                  ctx.moveTo(cx, iconY + 6); ctx.lineTo(cx, iconY + 10);
                  ctx.stroke();
              } else if (icon.type === 'DEBUG') {
                  ctx.fillStyle = this.isDebugOpen ? '#22d3ee' : '#ffffff';
                  ctx.strokeStyle = ctx.fillStyle;
                  ctx.lineWidth = 3;
                  // Screen outline
                  ctx.beginPath();
                  ctx.roundRect(cx - 13, iconY - 9, 26, 18, 4);
                  ctx.stroke();
                  // Draw ">" prompt
                  ctx.beginPath();
                  ctx.moveTo(cx - 8, iconY - 4);
                  ctx.lineTo(cx - 4, iconY);
                  ctx.lineTo(cx - 8, iconY + 4);
                  ctx.stroke();
                  // Draw "_" cursor
                  ctx.fillStyle = ctx.strokeStyle;
                  ctx.fillRect(cx - 1, iconY + 2, 6, 3);
              } else if (icon.type === 'PARTICLES') {
                  ctx.beginPath();
                  ctx.arc(cx - 6, iconY - 6, 2, 0, 2 * Math.PI);
                  ctx.arc(cx + 6, iconY + 6, 2, 0, 2 * Math.PI);
                  ctx.arc(cx + 4, iconY - 4, 1.5, 0, 2 * Math.PI);
                  ctx.arc(cx - 4, iconY + 4, 3, 0, 2 * Math.PI);
                  ctx.fill();
              } else if (icon.type === 'RESET') {
                  ctx.beginPath();
                  ctx.arc(cx, iconY, 10, 0.15 * Math.PI, 1.85 * Math.PI);
                  ctx.stroke();
                  ctx.fillStyle = ctx.strokeStyle;
                  ctx.beginPath();
                  ctx.moveTo(cx + 14, iconY + 3);
                  ctx.lineTo(cx + 8, iconY - 3);
                  ctx.lineTo(cx + 20, iconY - 3);
                  ctx.closePath();
                  ctx.fill();
              }
          }

          ctx.fillStyle = icon.type === 'LOCK' ? (this.isGridLocked ? '#22c55e' : '#f97316') : '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(icon.label, cx, cy + 18);
      });

      this.compassBackingTexture.needsUpdate = true;
  }

  private initCompassUI() {
      this.compassGroup = new THREE.Group();
      this.compassGroup.position.set(0, 0.07, 0); 
      this.compassGroup.scale.setScalar(0.001);
      this.compassGroup.visible = false;

      const backingGeom = new THREE.PlaneGeometry(0.15, 0.1128); 

      this.compassBackingCanvas = document.createElement('canvas');
      this.compassBackingCanvas.width = 256;
      this.compassBackingCanvas.height = 192;
      this.compassBackingCtx = this.compassBackingCanvas.getContext('2d')!;
      
      this.compassBackingTexture = new THREE.CanvasTexture(this.compassBackingCanvas);
      this.compassBackingTexture.colorSpace = THREE.SRGBColorSpace;

      const backingMat = new THREE.MeshBasicMaterial({
          map: this.compassBackingTexture,
          transparent: true,
          opacity: 1.0,
          depthWrite: false
      });
      this.compassBackingBoard = new THREE.Mesh(backingGeom, backingMat);
      this.compassGroup.add(this.compassBackingBoard);

      this.compassNeedle = new THREE.Mesh();
      this.compassNeedle.position.set(0, 0, 0.002);
      this.compassGroup.add(this.compassNeedle);

      // Create a 3D ring at an angle that clips through the UI to look 3D
      const ringGeom = new THREE.TorusGeometry(0.024, 0.002, 16, 100);
      const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide
      });
      this.compassRing = new THREE.Mesh(ringGeom, ringMat);
      // Tilt it so it clips beautifully through the UI plane (45° X-tilt, 15° Y-tilt)
      this.compassRing.rotation.set(Math.PI / 4, Math.PI / 12, 0);
      this.compassRing.position.set(0, 0, 0.0);
      this.compassGroup.add(this.compassRing);

      const northCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.003, 0.012, 4),
          new THREE.MeshBasicMaterial({ color: 0xff1e1e })
      );
      northCone.rotation.x = Math.PI / 2;
      northCone.rotation.z = Math.PI;
      northCone.position.y = 0.006;
      this.compassNeedle.add(northCone);

      const southCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.003, 0.012, 4),
          new THREE.MeshBasicMaterial({ color: 0xcccccc })
      );
      southCone.rotation.x = Math.PI / 2;
      southCone.position.y = -0.006;
      this.compassNeedle.add(southCone);

      const pivot = new THREE.Mesh(
          new THREE.SphereGeometry(0.0016, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
      );
      pivot.position.z = 0.0015;
      this.compassNeedle.add(pivot);

      this.compassInfoCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, 0.0744), 
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
      );
      this.compassInfoCard.position.set(0, 0, -0.005);
      this.compassGroup.add(this.compassInfoCard);

      this.compassInfoTextCanvas = document.createElement('canvas');
      this.compassInfoTextCanvas.width = 256;
      this.compassInfoTextCanvas.height = 128;
      this.compassInfoTextCtx = this.compassInfoTextCanvas.getContext('2d')!;
      this.compassInfoTextTexture = new THREE.CanvasTexture(this.compassInfoTextCanvas);
      this.compassInfoTextTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassInfoMat = new THREE.MeshBasicMaterial({
          map: this.compassInfoTextTexture,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
      });
      this.compassInfoCard.material = this.compassInfoMat;

      // Initialize Chat Tab UI
      this.compassChatCanvas = document.createElement('canvas');
      this.compassChatCanvas.width = 512;
      this.compassChatCanvas.height = 384;
      this.compassChatCtx = this.compassChatCanvas.getContext('2d')!;

      this.compassChatTexture = new THREE.CanvasTexture(this.compassChatCanvas);
      this.compassChatTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassChatMat = new THREE.MeshBasicMaterial({
          map: this.compassChatTexture,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
      });

      this.compassChatCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.18),
          this.compassChatMat
      );
      // Sits behind Jugnu and the compass layer on a medium sized screen
      this.compassChatCard.position.set(0, -0.02, 0.0); // Z slides to -0.04 when open
      this.compassChatCard.scale.setScalar(0.001); // Shrink initially
      this.compassGroup.add(this.compassChatCard);

      // Draw initial chat screen
      this.redrawCompassChat();

      // Initialize Debug Console UI
      this.compassDebugCanvas = document.createElement('canvas');
      this.compassDebugCanvas.width = 512;
      this.compassDebugCanvas.height = 384;
      this.compassDebugCtx = this.compassDebugCanvas.getContext('2d')!;

      this.compassDebugTexture = new THREE.CanvasTexture(this.compassDebugCanvas);
      this.compassDebugTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassDebugMat = new THREE.MeshBasicMaterial({
          map: this.compassDebugTexture,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
      });

      this.compassDebugCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.18),
          this.compassDebugMat
      );
      this.compassDebugCard.position.set(0, -0.02, 0.0); // Z slides to -0.04 when open
      this.compassDebugCard.scale.setScalar(0.001); // Shrink initially
      this.compassGroup.add(this.compassDebugCard);

      // Draw initial debug screen
      this.redrawCompassDebug();

      // Initialize Tutorial Tab UI
      this.compassTutorialCanvas = document.createElement('canvas');
      this.compassTutorialCanvas.width = 512;
      this.compassTutorialCanvas.height = 384;
      this.compassTutorialCtx = this.compassTutorialCanvas.getContext('2d')!;

      this.compassTutorialTexture = new THREE.CanvasTexture(this.compassTutorialCanvas);
      this.compassTutorialTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassTutorialMat = new THREE.MeshBasicMaterial({
          map: this.compassTutorialTexture,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
      });

      this.compassTutorialCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.18),
          this.compassTutorialMat
      );
      this.compassTutorialCard.position.set(0, -0.02, -0.01);
      this.compassTutorialCard.scale.setScalar(0.001); // Shrink initially
      this.compassGroup.add(this.compassTutorialCard);

      // Draw initial grid
      this.redrawCompassGrid(-1);

      this.world.createTransformEntity(this.compassGroup);
  }

  private redrawCompassInfoCard(title: string, detailText: string) {
      const ctx = this.compassInfoTextCtx;
      const w = 256;
      const h = 128;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#05050f';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 8);
      ctx.fill();

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 8);
      ctx.stroke();

      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title.toUpperCase(), w / 2, 20);

      ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, 28); ctx.lineTo(w - 16, 28);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      
      const lines = detailText.split('\n');
      let y = 42;
      lines.forEach((line) => {
          ctx.fillText(line, 12, y);
          y += 12;
      });

      this.compassInfoTextTexture.needsUpdate = true;
  }

  private handleCompassTileClick(tileIndex: number) {
      console.log(`[Compass] Clicked cell index: ${tileIndex}`);

      const icons = [
          { label: "CHAT",     type: "CHAT" },
          { label: "STADIUM",  type: "STADIUM" },
          { label: "TUTORIAL", type: "TUTORIAL" },
          { label: "VOICE",    type: "VOICE" },
          { label: "COMPASS",  type: "COMPASS" },
          { label: "DEBUG",    type: "DEBUG" },
          { label: "EFFECTS",  type: "PARTICLES" },
          { label: "RESET",    type: "RESET" },
          { label: "LOCK",     type: "LOCK" }
      ];

      const tileType = icons[tileIndex]?.type || "";
      let title = "";
      let detail = "";

      if (tileType === 'CHAT') {
          this.isChatOpen = !this.isChatOpen;
          title = this.isChatOpen ? "Transcript & Chat" : "Transcript & Chat";
          if (this.isChatOpen) {
              this.redrawCompassChat();
              detail = "Dynamic Chat Panel slides behind Jugnu.\n\nStatus: ACTIVE VIEW.\nDisplays recent conversational transcripts and active debug telemetry log lines.";
          } else {
              detail = "Dynamic Chat Panel retracted.\n\nStatus: STANDBY.\nRedraw compass board grid.";
          }
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'STADIUM') {
          title = "Tactical Minimap";
          (window as any).triggerMinimapToggle = true;
          detail = "Minimap Stadium Table toggled.\n\nStatus: Toggled successfully!\nCheck for the 3D desk in front of you.";
      } else if (tileType === 'TUTORIAL') {
          this.isTutorialOpen = !this.isTutorialOpen;
          title = this.isTutorialOpen ? "Holographic Tutorial" : "Holographic Tutorial";
          if (this.isTutorialOpen) {
              let currentStep = 0;
              for (const entity of this.queries.jugnu.entities) {
                  currentStep = entity.getValue(Jugnu, "instructionStep") as number;
                  break;
              }
              this.redrawCompassTutorial(currentStep);
              detail = "Holographic Manual active above Jugnu.\n\nStatus: ACTIVE VIEW.\nDisplays custom gesture/pinch illustrations and live step progression.";
          } else {
              detail = "Tutorial Screen retracted.\n\nStatus: STANDBY.\nGrid view updated.";
          }
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'VOICE') {
          title = "Gemini AI Voice";
          detail = "Voice pipeline: ACTIVE.\n\nMicrophone bounds: Calibrating...\nSay any prompt after poking Jugnu's head.";
      } else if (tileType === 'DEBUG') {
          this.isDebugOpen = !this.isDebugOpen;
          title = this.isDebugOpen ? "Debug Console" : "Debug Console";
          if (this.isDebugOpen) {
              this.redrawCompassDebug();
              detail = "Blue Cyberpunk Debug Console active behind Jugnu.\n\nStatus: ACTIVE VIEW.\nHooks to console log streams and shows realtime engine diagnostics.";
          } else {
              detail = "Debug Console retracted.\n\nStatus: STANDBY.\nGrid view updated.";
          }
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'PARTICLES') {
          title = "Ambient FX Engine";
          if (this.particleMesh) {
              this.particleMesh.visible = !this.particleMesh.visible;
          }
          const particleStatus = this.particleMesh && this.particleMesh.visible ? "ENABLED" : "DISABLED";
          detail = `Concentric Spline FX Status: ${particleStatus}\n\nRunning 2000 instanced micro-spheres.`;
      } else if (tileType === 'RESET') {
          title = "Reset Position";
          this.activateJugnu();
          detail = "Companion Avatar Reset.\n\nPosition recalibrated to 80cm in front of headset view vector.";
      } else if (tileType === 'LOCK') {
          this.isGridLocked = !this.isGridLocked;
          title = this.isGridLocked ? "Grid Locked" : "Grid Unlocked";
          
          if (this.isGridLocked) {
              this.interactionState = 'Anchored';
              this.queries.jugnu.entities.forEach(entity => {
                  if (entity.object3D) {
                      this.centerPos.copy(entity.object3D.position);
                      entity.object3D.position.copy(this.centerPos);
                      this.velocity.set(0, 0, 0);
                      this.setExpression(6); // Play winking look
                  }
              });
              this.chatHistory.push({ sender: 'System', text: 'Rigid Spatial Anchor: LOCKED.' });
              this.redrawCompassChat();
              detail = "Compass Grid & Companion locked.\n\nStatus: RIGIDLY ANCHORED.\nJugnu will stay at this exact point.\nRelease pinch to let companion stay here.";
          } else {
              this.interactionState = 'Following';
              this.lockedCompassPos = null;
              this.lockedCompassQuat = null;
              this.chatHistory.push({ sender: 'System', text: 'Rigid Spatial Anchor: RELEASED.' });
              this.redrawCompassChat();
              detail = "Compass Grid Unlocked.\n\nStatus: FREE FLOATING.\nClosing delay of 2.0s restored upon pinch release.";
          }
          
          this.redrawCompassGrid(this.hoveredCellIndex);
      }

      this.redrawCompassInfoCard(title, detail);
  }

  private redrawCompassTutorial(step: number) {
      const ctx = this.compassTutorialCtx;
      const w = 512;
      const h = 384;
      ctx.clearRect(0, 0, w, h);

      // Dark glassmorphic background
      ctx.fillStyle = 'rgba(5, 5, 26, 0.95)';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.fill();

      // Cyberpunk style neon border (Yellow tutorial accent border)
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(10, 10, w - 20, h - 20, 12);
      ctx.stroke();

      // Console Header text
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("HOLOGRAPHIC TUTORIAL", w / 2, 36);

      // Divider line
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 48); ctx.lineTo(w - 24, 48);
      ctx.stroke();

      // Current Active Instruction
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`STEP ${step + 1} OF 3`, w / 2, 85);

      // Draw tutorial illustration/diagram representing the steps
      let title = "";
      let desc = "";
      if (step === 0) {
          title = "Pinch & Summon";
          desc = "Pinch Jugnu with your index finger and thumb to grab or interact. Hold index pinch near Jugnu for 2 seconds to summon/dismiss the compass UI.";
          
          // Draw a stylized grab/hand illustration
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(w / 2, 170, 25, 0, 2 * Math.PI); // Jugnu body
          ctx.stroke();
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(w / 2, 170, 10, 0, 2 * Math.PI); // Jugnu core
          ctx.fill();
          
          // Pinching fingers lines
          ctx.strokeStyle = '#00ffff';
          ctx.beginPath();
          ctx.moveTo(w / 2 - 45, 170); ctx.lineTo(w / 2 - 25, 170); // Pinching left
          ctx.moveTo(w / 2 + 45, 170); ctx.lineTo(w / 2 + 25, 170); // Pinching right
          ctx.stroke();
      } else if (step === 1) {
          title = "Two-Handed Pinch";
          desc = "Touch your two index fingers together to perform two-handed scaling gestures on the tactical minimap, or rotate using the middle finger pinch.";
          
          // Draw fingers touching illustration
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(w / 2 - 50, 170); ctx.lineTo(w / 2 - 10, 170); // Finger 1
          ctx.moveTo(w / 2 + 50, 170); ctx.lineTo(w / 2 + 10, 170); // Finger 2
          ctx.stroke();
          ctx.fillStyle = '#ff007f';
          ctx.beginPath();
          ctx.arc(w / 2 - 10, 170, 5, 0, 2 * Math.PI); // Tip 1
          ctx.arc(w / 2 + 10, 170, 5, 0, 2 * Math.PI); // Tip 2
          ctx.fill();
      } else if (step === 2) {
          title = "Wrist Control Button";
          desc = "Look at your left wrist joint to reveal a glowing holographic minimap button. Tap it with your right index finger to spawn/dismiss the tactical stadium.";
          
          // Draw wrist button illustration
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(w / 2 - 40, 155, 80, 30, 6); // Button
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px monospace';
          ctx.fillText("MAP TOGGLE", w / 2, 174);
      } else {
          title = "Tutorial Complete";
          desc = "All core gestures learned successfully! You are fully configured to operate Jugnu XR Core features. Use the Compass UI for stadium controls at any time.";
          
          // Draw checkmark
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(w / 2 - 20, 170);
          ctx.lineTo(w / 2 - 5, 185);
          ctx.lineTo(w / 2 + 20, 150);
          ctx.stroke();
      }

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(title, w / 2, 230);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '13px monospace';
      this.wrapText(desc, w / 2, 260, 440, 18);

      this.compassTutorialTexture.needsUpdate = true;
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      this.compassTutorialCtx.textAlign = 'center';

      for(let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = this.compassTutorialCtx.measureText(testLine);
          const testWidth = metrics.width;
          
          if (testWidth > maxWidth && n > 0) {
              this.compassTutorialCtx.fillText(line, x, currentY);
              line = words[n] + ' ';
              currentY += lineHeight;
          }
          else {
              line = testLine;
          }
      }
      this.compassTutorialCtx.fillText(line, x, currentY);
      return currentY;
  }

  private redrawCompassChat() {
      const ctx = this.compassChatCtx;
      const w = 512;
      const h = 384;
      ctx.clearRect(0, 0, w, h);

      // Backing board
      ctx.fillStyle = '#05050f';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.stroke();

      // Header Text
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('JUGNU TRANSCRIPT & DEBUG CHAT', w / 2, 34);

      // Header Divider
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 48); ctx.lineTo(w - 24, 48);
      ctx.stroke();

      // Chat text rendering
      ctx.textAlign = 'left';
      ctx.font = '13px monospace';
      
      let y = 78;
      const startIdx = Math.max(0, this.chatHistory.length - 12);
      const visibleLines = this.chatHistory.slice(startIdx);

      visibleLines.forEach((line) => {
          if (line.sender === 'You') {
              ctx.fillStyle = '#38bdf8'; // Sky blue
              ctx.fillText('YOU: ', 24, y);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(line.text, 64, y);
          } else if (line.sender === 'Jugnu') {
              ctx.fillStyle = '#f97316'; // Orange
              ctx.fillText('JUGNU: ', 24, y);
              ctx.fillStyle = '#e2e8f0';
              ctx.fillText(line.text, 78, y);
          } else {
              ctx.fillStyle = '#22c55e'; // Green for system
              ctx.fillText('SYS: ', 24, y);
              ctx.fillStyle = '#a7f3d0';
              ctx.fillText(line.text, 64, y);
          }
          y += 24;
      });

      this.compassChatTexture.needsUpdate = true;
  }

  private hookConsole() {
      const self = this;
      console.log = function(...args: any[]) {
          self.originalLog.apply(console, args);
          const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
          self.addDebugLog('info', msg);
      };

      console.warn = function(...args: any[]) {
          self.originalWarn.apply(console, args);
          const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
          self.addDebugLog('warn', msg);
      };

      console.error = function(...args: any[]) {
          self.originalError.apply(console, args);
          const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
          self.addDebugLog('error', msg);
      };
  }

  private addDebugLog(type: 'info' | 'warn' | 'error', text: string) {
      if (text.includes('[IWER]') || text.includes('requestAnimationFrame') || text.includes('Render frame')) {
          return;
      }

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      
      const maxCharPerLine = 48;
      if (text.length > maxCharPerLine) {
          const lines = [];
          for (let i = 0; i < text.length; i += maxCharPerLine) {
              lines.push(text.substring(i, i + maxCharPerLine));
          }
          lines.forEach((line, idx) => {
              this.debugHistory.push({
                  type,
                  text: idx === 0 ? line : `  ${line}`,
                  timestamp: idx === 0 ? timeStr : '        '
              });
          });
      } else {
          this.debugHistory.push({ type, text, timestamp: timeStr });
      }

      while (this.debugHistory.length > this.maxDebugLogs) {
          this.debugHistory.shift();
      }

      if (this.compassDebugCard) {
          this.redrawCompassDebug();
      }
  }

  private redrawCompassDebug() {
      const ctx = this.compassDebugCtx;
      const w = 512;
      const h = 384;
      ctx.clearRect(0, 0, w, h);

      // Dark blue backing
      ctx.fillStyle = 'rgba(5, 5, 20, 0.95)';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.fill();

      // Cyberpunk style neon border (Electric Cyan)
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 16);
      ctx.stroke();

      // Secondary border (Magenta)
      ctx.strokeStyle = 'rgba(255, 0, 128, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(10, 10, w - 20, h - 20, 12);
      ctx.stroke();

      // Corner accents
      ctx.fillStyle = '#00ffff';
      const accentSize = 16;
      // Top Left
      ctx.fillRect(0, 0, accentSize, 4);
      ctx.fillRect(0, 0, 4, accentSize);
      // Top Right
      ctx.fillRect(w - accentSize, 0, accentSize, 4);
      ctx.fillRect(w - 4, 0, 4, accentSize);
      // Bottom Left
      ctx.fillRect(0, h - 4, accentSize, 4);
      ctx.fillRect(0, h - accentSize, 4, accentSize);
      // Bottom Right
      ctx.fillRect(w - accentSize, h - 4, accentSize, 4);
      ctx.fillRect(w - 4, h - accentSize, 4, accentSize);

      // Console Header text
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("SYSTEM DEBUG CONSOLE", w / 2, 34);

      // Header Divider
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 48); ctx.lineTo(w - 24, 48);
      ctx.stroke();

      // Print logs
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';

      let y = 78;
      this.debugHistory.forEach((log) => {
          // Time tag
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillText(`[${log.timestamp}]`, 24, y);

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

          ctx.fillText(prefix, 100, y);

          // Log body
          ctx.fillStyle = log.type === 'error' ? '#ff8a80' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(log.text, 150, y);

          y += 24;
      });

      // Blinking Caret
      const now = Date.now();
      if (Math.floor(now / 500) % 2 === 0) {
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(24, y - 10, 8, 12);
      }

      this.compassDebugTexture.needsUpdate = true;
  }
}

