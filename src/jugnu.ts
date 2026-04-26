import { createComponent, createSystem, Pressed, Vector3, PhysicsBody, PhysicsState, PhysicsManipulation, PhysicsShape, PhysicsShapeType } from "@iwsdk/core";
import { MoodColors } from "./JugnuV3Model.js";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
const BACKEND_URL = ((import.meta as any).env.VITE_BACKEND_URL as string) || "/api/gemini";

export const Jugnu = createComponent("Jugnu", {});
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
  private interactionState: 'WaitingForRoom' | 'Idle' | 'Following' | 'LerpingToHand' | 'Attached' = 'WaitingForRoom';
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
  private floatRadius = 0.6;
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

  init() {
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
      
      const textResponse = await response.text();
      let data;
      try {
          data = JSON.parse(textResponse);
      } catch (err) {
          throw new Error(`Invalid JSON from server (Status: ${response.status}). Response: ${textResponse.substring(0, 50)}...`);
      }
      
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || "Unknown Gemini API Error");
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
      } else {
         this.updateTranscriptUI("Audio received", "I didn't quite catch that. Could you repeat?");
         this.speak("I didn't quite catch that. Could you repeat?");
      }
    } catch (e: any) {
      console.error("Gemini Error:", e);
      this.updateTranscriptUI("Error", `Connection failed: ${e.message || "Unknown error"}`);
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
    const isPinchingLeft = this.getPinchData('left', this.leftPinchTip);
    const isPinchingRight = this.getPinchData('right', this.rightPinchTip);

    if (this.interactionState === 'Idle' || this.interactionState === 'Following') {
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
            this.interactionState = 'Idle';
            this.throwTimer = 3.0; 
            this.attachedHand = null;
            
            this.queries.jugnu.entities.forEach(entity => {
                if (!entity.object3D) return;
                this.basePositions.set(entity, entity.object3D.position.clone());
                if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                if (!entity.hasComponent(PhysicsShape)) {
                     entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, radius: 0.15 });
                }
                entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
            });
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
            this.interactionState = 'Idle';
            this.throwTimer = 3.0; 
            this.attachedHand = null;
            
            this.queries.jugnu.entities.forEach(entity => {
                if (!entity.object3D) return;
                this.basePositions.set(entity, entity.object3D.position.clone());
                const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                if (currentState !== PhysicsState.Dynamic) {
                    if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                }
                if (!entity.hasComponent(PhysicsShape)) {
                     entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, radius: 0.15 });
                }
                entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
            });
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

    this.queries.jugnu.entities.forEach((entity) => {
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
        obj.scale.setScalar(0.25);
        this.baseScales.set(entity, obj.scale.clone());
      }
      const basePos = this.basePositions.get(entity)!;
      const baseScale = this.baseScales.get(entity)!;
      
      this.player.head.getWorldPosition(this.headPos);
      const distToPlayer = obj.position.distanceTo(this.headPos);
      const targetScale = this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand' 
          ? 0.12 : THREE.MathUtils.clamp(distToPlayer * 0.25, 0.15, 0.5);
      
      this.tempScale.setScalar(targetScale);
      baseScale.lerp(this.tempScale, 4.0 * safeDt);
      
      const isPinched = this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand';
      const targetPinchProgress = isPinched ? 1.0 : 0.0;
      jugModel.pinchProgress = THREE.MathUtils.lerp(jugModel.pinchProgress || 0, targetPinchProgress, 5.0 * safeDt);
      
      if (this.interactionState === 'Idle') {
          if (this.throwTimer > 0) {
              this.throwTimer -= safeDt;
          } else {
              this.interactionState = 'Following';
              const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                  entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
              }
          }
      } else if (this.interactionState === 'Following') {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
          forward.y = 0; 
          forward.normalize();
          
          const targetCenter = this.headPos.clone().add(forward.multiplyScalar(0.6)); 
          targetCenter.y -= 0.15; 
          
          this.centerPos.lerp(targetCenter, 2.0 * safeDt);

          const floatX = this.noise(this.floatTime * 0.5, 0) * this.floatRadius;
          const floatY = this.noise(this.floatTime * 0.5, 1) * this.floatRadius * 0.5;
          const floatZ = this.noise(this.floatTime * 0.5, 2) * this.floatRadius;
          const hoverTarget = this.centerPos.clone().add(new THREE.Vector3(floatX, floatY, floatZ));

          const displacement = new THREE.Vector3().subVectors(obj.position, hoverTarget);
          const force = displacement.multiplyScalar(-this.springStiffness * 0.5); 
          force.sub(this.velocity.clone().multiplyScalar(this.springDamping));

          this.velocity.add(force.multiplyScalar(safeDt));
          obj.position.add(this.velocity.clone().multiplyScalar(safeDt));
          
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
          hoverTarget.y += 0.08; 

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
  }
}

