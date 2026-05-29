import { createComponent, createSystem, Pressed, Vector3, PhysicsBody, PhysicsState, PhysicsManipulation, PhysicsShape, PhysicsShapeType, Interactable, AudioSource, AudioUtils, PlaybackMode } from "@iwsdk/core";
import { MoodColors } from "./JugnuV3Model.js";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
const BACKEND_URL = ((import.meta as any).env.VITE_BACKEND_URL as string) || "/api/gemini";

import { JugnuInstructionBoard } from "./JugnuInstructionBoard.js";

export const Jugnu = createComponent("Jugnu", { 
  instructionStep: { type: "Int8", default: 0 },
  onboardingPhase: { type: "Int8", default: 0 }
});
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
  private yawnAudioPlayed = false;
  private introSpeech1Played = false;
  private introSpeech2Played = false;
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
  private interactionState: 'WaitingForRoom' | 'OnboardingWakeUp' | 'OnboardingIntro' | 'OnboardingTutorial' | 'OnboardingNavigation' | 'Idle' | 'Following' | 'LerpingToHand' | 'Attached' | 'Anchored' = 'WaitingForRoom';
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

  // Onboarding specific state variables
  private onboardingPhase: number = 0; // 0: Wake-Up, 1: Intro UI, 2: Tutorial, 3: Navigation, 4: Complete
  private dimOverlayMat!: THREE.ShaderMaterial;
  private dimOverlayMesh!: THREE.Mesh;
  private dimIntensity: number = 0.8;
  private isSpawning: boolean = false;
  private spawnTimer: number = 0.0;
  private desktopWristTapTriggered: boolean = false;
  private wakeUpTimer: number = 0.0;
  private uiPanelBg!: THREE.Mesh;
  private btnPlay!: THREE.Mesh;
  private btnSkip!: THREE.Mesh;
  private uiPanelGroup!: THREE.Group;
  private panelBgEntity!: any;
  private btnPlayEntity!: any;
  private btnSkipEntity!: any;
  private wicketGroup!: THREE.Group;
  private gazeTimer: number = 0.0;
  private celebrationActive: boolean = false;
  private celebrationTimer: number = 0.0;
  private spinTimer: number = 0.0;
  private splineMesh!: THREE.Mesh;
  private wristTapTimer: number = 0.0;
  private lastRelativePos = new THREE.Vector3();
  private hasLastRelativePos = false;
  private rubDuration = 0.0;
  private forceStartFromOnboarding: boolean = false;

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
  private particleData: { active: boolean, pos: THREE.Vector3, vel: THREE.Vector3, life: number, maxLife: number }[] = [];
  private nextParticleIdx = 0;
  private lastJugnuPos = new THREE.Vector3();

  // Expression UI
  private expressionList: Mood[] = ['bored', 'calm', 'happy', 'sad', 'bright', 'blushing', 'winking'];
  private currentExpressionIndex = 2; // Default to happy

  private instructionBoard!: JugnuInstructionBoard;

  init() {
    this.instructionBoard = new JugnuInstructionBoard();
    this.instructionBoard.visible = false;
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
        this.particleData.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1.0 });
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.world.createTransformEntity(this.particleMesh);

    // Initialize Pass-Through Dimming Overlay Shader Mesh
    this.dimOverlayMat = new THREE.ShaderMaterial({
      uniforms: {
        u_dimIntensity: { value: 0.8 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.999, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_dimIntensity;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(0.0, 0.0, 0.0, u_dimIntensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });
    this.dimOverlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dimOverlayMat);
    this.dimOverlayMesh.frustumCulled = false; // Prevent culling in both flat and XR modes
    this.dimOverlayMesh.renderOrder = 10000; // Draw at the very end to overlay background only
    this.dimOverlayMesh.visible = false;
    this.player.head.add(this.dimOverlayMesh);
    this.dimOverlayMesh.position.set(0, 0, -0.1);

    // Check for developer/tester reset in URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const forceReset = urlParams.has('reset') || urlParams.get('onboarding') === '0';
    if (forceReset) {
        console.log("[JugnuSystem] URL Reset: Resetting onboarding to Phase 0");
        this.forceStartFromOnboarding = true;
    }

    // Initialize UI and Keys
    this.createExpressionUI();
    window.addEventListener('keydown', (e) => {
        this.handleKeyDown(e);
        if (e.key.toLowerCase() === 'w') {
            this.desktopWristTapTriggered = true;
        }
        if (e.key.toLowerCase() === 'r') {
            console.log("[JugnuSystem] Keyboard Reset: Resetting onboarding to Phase 0");
            this.queries.jugnu.entities.forEach(entity => {
                entity.setValue(Jugnu, "onboardingPhase", 0);
                entity.setValue(Jugnu, "instructionStep", 0);
                if (entity.object3D) {
                    entity.object3D.visible = false;
                    entity.object3D.scale.setScalar(0);
                }
            });
            this.onboardingPhase = 0;
            this.interactionState = 'OnboardingWakeUp';
            this.spawnTimer = 0.0;
            this.isSpawning = false;
            this.wakeUpTimer = 0.0;
            this.yawnAudioPlayed = false;
            this.introSpeech1Played = false;
            this.introSpeech2Played = false;
            this.gazeTimer = 0.0;
            this.celebrationActive = false;
            this.celebrationTimer = 0.0;
            this.spinTimer = 0.0;
            this.wristTapTimer = 0.0;
            this.desktopWristTapTriggered = false;

            if (this.dimOverlayMesh) {
                this.dimOverlayMesh.visible = true;
            }
            if (this.dimOverlayMat) {
                this.dimOverlayMat.uniforms.u_dimIntensity.value = 0.8;
            }
            
            this.hideOnboardingUI();
            if (this.wicketGroup) this.wicketGroup.visible = false;
            if (this.splineMesh) this.splineMesh.visible = false;
            if (this.instructionBoard) this.instructionBoard.visible = false;

            // Re-assert Kinematic physics
            this.queries.jugnu.entities.forEach(e => {
                this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
            });
        }
    });
    window.addEventListener('click', () => {
        if (this.onboardingPhase === 0 && this.interactionState === 'OnboardingWakeUp') {
            this.desktopWristTapTriggered = true;
        }
    });

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
      this.queries.jugnu.entities.forEach(entity => {
          this.onboardingPhase = entity.getValue(Jugnu, "onboardingPhase") as number;
      });
      this.hideOnboardingUI();

      if (this.onboardingPhase === 0) {
          this.interactionState = 'OnboardingWakeUp';
          this.yawnAudioPlayed = false;
          this.introSpeech1Played = false;
          this.introSpeech2Played = false;
          this.queries.jugnu.entities.forEach(e => {
              if (e.object3D) {
                  e.object3D.visible = false; // Hide until wrist tap
              }
              const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
              }
          });
          if (this.dimOverlayMesh) {
              this.dimOverlayMesh.visible = true;
          }
          if (this.dimOverlayMat) {
              this.dimOverlayMat.uniforms.u_dimIntensity.value = 0.8;
          }
      } else if (this.onboardingPhase === 1) {
          this.interactionState = 'OnboardingIntro';
          this.wakeUpTimer = 0.0; // Play the yawn and morning stretch animation sequence on reload
          this.yawnAudioPlayed = false;
          this.introSpeech1Played = false;
          this.introSpeech2Played = false;
          this.player.head.getWorldPosition(this.headPos);
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
          forward.y = 0; 
          forward.normalize();
          const spawnPos = this.headPos.clone().add(forward.multiplyScalar(0.5));
          spawnPos.y = this.headPos.y - 0.15; 
          this.centerPos.copy(spawnPos); 

          this.queries.jugnu.entities.forEach(e => { 
              if (e.object3D) {
                  e.object3D.position.copy(spawnPos);
                  e.object3D.visible = true; 
              }
              const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
              }
          });
          this.hideOnboardingUI();
      } else if (this.onboardingPhase === 2) {
          this.interactionState = 'OnboardingTutorial';
          this.player.head.getWorldPosition(this.headPos);
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
          forward.y = 0; 
          forward.normalize();
          const spawnPos = this.headPos.clone().add(forward.multiplyScalar(0.5));
          spawnPos.y = this.headPos.y - 0.15; 
          this.centerPos.copy(spawnPos); 

          this.queries.jugnu.entities.forEach(e => { 
              if (e.object3D) {
                  e.object3D.position.copy(spawnPos);
                  e.object3D.visible = true; 
              }
              const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
              }
          });
      } else if (this.onboardingPhase === 3) {
          this.interactionState = 'OnboardingNavigation';
          this.spinTimer = 0.0;
          this.player.head.getWorldPosition(this.headPos);
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
          forward.y = 0; 
          forward.normalize();
          const spawnPos = this.headPos.clone().add(forward.multiplyScalar(0.5));
          spawnPos.y = this.headPos.y - 0.15; 
          this.centerPos.copy(spawnPos); 

          this.queries.jugnu.entities.forEach(e => { 
              if (e.object3D) {
                  e.object3D.position.copy(spawnPos);
                  e.object3D.visible = true; 
              }
              const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
              }
          });
      } else {
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
  }

  private setPhysicsState(entity: any, state: any, gravityFactor = 1.0) {
      if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
      if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
      
      entity.addComponent(PhysicsShape, {
          shape: PhysicsShapeType.Sphere,
          dimensions: [0.15, 0.15, 0.15],
          restitution: 0.95,
          friction: 0.05,
          density: 1.0
      });
      entity.addComponent(PhysicsBody, {
          state: state,
          gravityFactor: gravityFactor,
          linearDamping: 0.1,
          angularDamping: 0.1
      });
  }

  private updateOnboardingHover(entity: any, obj: THREE.Object3D, safeDt: number, followCamera = true, lerpSpeed = 2.0) {
      if (followCamera) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
          forward.y = 0;
          forward.normalize();
          const targetCenter = this.headPos.clone().add(forward.multiplyScalar(0.5));
          targetCenter.y -= 0.15;
          
          this.centerPos.lerp(targetCenter, lerpSpeed * safeDt);
      }

      // Add gentle floating noise offset
      const floatX = this.noise(this.floatTime * 0.18, 0) * this.floatRadius;
      const floatY = this.noise(this.floatTime * 0.18, 1) * this.floatRadius * 0.5;
      const floatZ = this.noise(this.floatTime * 0.18, 2) * this.floatRadius;
      const hoverTarget = this.centerPos.clone().add(new THREE.Vector3(floatX, floatY, floatZ));

      // Direct smooth lerp to hoverTarget instead of spring-damper physics
      const oldPos = obj.position.clone();
      obj.position.lerp(hoverTarget, 5.0 * safeDt);

      if (safeDt > 0.0001) {
          this.velocity.subVectors(obj.position, oldPos).divideScalar(safeDt);
      } else {
          this.velocity.set(0, 0, 0);
      }

      // Apply linearVelocity manipulation to sync physics collider
      entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
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

  private checkWristRub(frame: XRFrame, refSpace: XRReferenceSpace, dt: number): boolean {
    const leftHand = this.input.getPrimaryInputSource('left');
    const rightHand = this.input.getPrimaryInputSource('right');
    if (!leftHand || !leftHand.hand || !rightHand || !rightHand.hand || typeof frame.getJointPose !== 'function') {
      this.hasLastRelativePos = false;
      this.rubDuration = Math.max(0.0, this.rubDuration - dt);
      return false;
    }

    const rightWristJoint = rightHand.hand.get('wrist');
    const leftIndexTipJoint = leftHand.hand.get('index-finger-tip');
    if (!rightWristJoint || !leftIndexTipJoint) {
      this.hasLastRelativePos = false;
      this.rubDuration = Math.max(0.0, this.rubDuration - dt);
      return false;
    }

    const rightWristPose = frame.getJointPose(rightWristJoint, refSpace);
    const leftIndexPose = frame.getJointPose(leftIndexTipJoint, refSpace);
    if (!rightWristPose || !leftIndexPose) {
      this.hasLastRelativePos = false;
      this.rubDuration = Math.max(0.0, this.rubDuration - dt);
      return false;
    }

    const wx = rightWristPose.transform.position.x;
    const wy = rightWristPose.transform.position.y;
    const wz = rightWristPose.transform.position.z;
    const ix = leftIndexPose.transform.position.x;
    const iy = leftIndexPose.transform.position.y;
    const iz = leftIndexPose.transform.position.z;

    const distSq = (wx - ix) ** 2 + (wy - iy) ** 2 + (wz - iz) ** 2;
    if (distSq < 0.04 * 0.04) { // Touch/proximity threshold of 4cm
      if (this.hasLastRelativePos) {
        const dx = (ix - wx) - this.lastRelativePos.x;
        const dy = (iy - wy) - this.lastRelativePos.y;
        const dz = (iz - wz) - this.lastRelativePos.z;
        const moveDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Relative velocity in meters per second
        const relSpeed = dt > 0 ? moveDist / dt : 0;
        
        // If rubbing speed is > 8 cm/s, accumulate rubbing time
        if (relSpeed > 0.08) {
          this.rubDuration += dt;
        } else {
          this.rubDuration = Math.max(0.0, this.rubDuration - dt * 0.5);
        }
      } else {
        this.hasLastRelativePos = true;
      }
      this.lastRelativePos.set(ix - wx, iy - wy, iz - wz);
    } else {
      this.hasLastRelativePos = false;
      this.rubDuration = Math.max(0.0, this.rubDuration - dt * 2.0); // fast decay when not touching
    }

    if (this.rubDuration >= 0.4) {
      this.rubDuration = 0.0;
      this.hasLastRelativePos = false;
      return true;
    }

    return false;
  }

  private createCricketWicket(): THREE.Group {
      const group = new THREE.Group();
      const stumpMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 }); // Wooden brown
      const bailMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });
      
      // 3 stumps
      for (let i = 0; i < 3; i++) {
          const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8), stumpMat);
          stump.position.set((i - 1) * 0.15, 0.35, 0);
          group.add(stump);
      }
      
      // 2 bails
      const bail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), bailMat);
      bail1.rotation.z = Math.PI / 2;
      bail1.position.set(-0.075, 0.705, 0);
      group.add(bail1);

      const bail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), bailMat);
      bail2.rotation.z = Math.PI / 2;
      bail2.position.set(0.075, 0.705, 0);
      group.add(bail2);

      return group;
  }

  private spawnWicketAndHide() {
      if (!this.wicketGroup) {
          this.wicketGroup = this.createCricketWicket();
          this.world.scene.add(this.wicketGroup);
      }

      const playerPos = new THREE.Vector3();
      this.player.head.getWorldPosition(playerPos);
      const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
      playerForward.y = 0;
      playerForward.normalize();

      const side = new THREE.Vector3(-playerForward.z, 0, playerForward.x);
      const wicketPos = playerPos.clone().add(playerForward.multiplyScalar(2.0)).add(side.multiplyScalar(0.4));
      wicketPos.y = -0.002; // Position on floor

      this.wicketGroup.position.copy(wicketPos);
      this.wicketGroup.visible = true;

      const toWicket = new THREE.Vector3().subVectors(wicketPos, playerPos).normalize();
      const hidePos = wicketPos.clone().add(toWicket.multiplyScalar(0.35));
      hidePos.y = 0.45; // float height

      this.interactionState = 'OnboardingTutorial';
      this.attachedHand = null;

      this.queries.jugnu.entities.forEach(e => {
          if (e.object3D) {
              e.object3D.position.copy(hidePos);
              const model = e.object3D as JugnuV3Model;
              if (model && typeof model.setMood === 'function') {
                  model.setMood('winking');
              }
              const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
              if (currentState !== PhysicsState.Kinematic) {
                  this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
              }
          }
      });
  }

  private createSplinePathway() {
      let jugnuPos = new THREE.Vector3();
      this.queries.jugnu.entities.forEach(e => { if (e.object3D) jugnuPos.copy(e.object3D.position); });

      const points = [
          new THREE.Vector3(jugnuPos.x, 0.01, jugnuPos.z),
          new THREE.Vector3(jugnuPos.x, 0.01, jugnuPos.z - 1.0),
          new THREE.Vector3(jugnuPos.x + 0.5, 0.01, jugnuPos.z - 2.5),
          new THREE.Vector3(jugnuPos.x, 0.01, jugnuPos.z - 5.0)
      ];
      
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, 64, 0.015, 8, false);
      const splineMat = new THREE.ShaderMaterial({
          uniforms: {
              u_time: { value: 0.0 },
              u_color: { value: new THREE.Color(0x00ffff) }
          },
          vertexShader: `
              varying vec2 vUv;
              void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
          `,
          fragmentShader: `
              uniform float u_time;
              uniform vec3 u_color;
              varying vec2 vUv;
              void main() {
                  float flow = sin(vUv.x * 20.0 - u_time * 10.0) * 0.5 + 0.5;
                  float alpha = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
                  gl_FragColor = vec4(u_color * (0.3 + flow * 0.7), alpha * 0.85);
              }
          `,
          transparent: true,
          depthWrite: false
      });
      
      this.splineMesh = new THREE.Mesh(tubeGeom, splineMat);
      this.world.scene.add(this.splineMesh);
  }

  private triggerOnboardingCelebration() {
      let jugnuPos = new THREE.Vector3();
      this.queries.jugnu.entities.forEach(e => { if (e.object3D) jugnuPos.copy(e.object3D.position); });

      const colors = [new THREE.Color(0xffd700), new THREE.Color(0x00ffff), new THREE.Color(0xff66cc)];
      
      const numToSpawn = 120;
      for (let j = 0; j < numToSpawn; j++) {
          const pIdx = this.nextParticleIdx;
          const p = this.particleData[pIdx];
          p.active = true;
          p.pos.copy(jugnuPos);
          
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          const speed = 1.0 + Math.random() * 2.0;
          (p as any).vel = new THREE.Vector3(
              Math.sin(phi) * Math.cos(theta) * speed,
              Math.sin(phi) * Math.sin(theta) * speed,
              Math.cos(phi) * speed
          );
          
          p.life = p.maxLife = 1.0 + Math.random() * 0.5;
          
          const col = colors[Math.floor(Math.random() * colors.length)];
          this.particleMesh.setColorAt(pIdx, col);
          
          this.nextParticleIdx = (this.nextParticleIdx + 1) % this.maxParticles;
      }
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private createOnboardingUI() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark slate background
      ctx.strokeStyle = '#00ffff'; // Cyan border
      ctx.lineWidth = 4;
      
      // Draw rounded rect manually or using roundRect if available
      if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(10, 10, 492, 236, 15);
          ctx.fill();
          ctx.stroke();
      } else {
          ctx.fillRect(10, 10, 492, 236);
          ctx.strokeRect(10, 10, 492, 236);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("Hey, I am Jugnu.", 256, 80);
      ctx.fillText("Your spatial companion.", 256, 120);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      const geom = new THREE.PlaneGeometry(0.8, 0.4);
      this.uiPanelBg = new THREE.Mesh(geom, material);

      const btn1Canvas = document.createElement('canvas');
      btn1Canvas.width = 256;
      btn1Canvas.height = 64;
      const btn1Ctx = btn1Canvas.getContext('2d')!;
      btn1Ctx.fillStyle = '#10b981'; // Green
      if (typeof btn1Ctx.roundRect === 'function') {
          btn1Ctx.beginPath();
          btn1Ctx.roundRect(5, 5, 246, 54, 8);
          btn1Ctx.fill();
      } else {
          btn1Ctx.fillRect(5, 5, 246, 54);
      }
      btn1Ctx.fillStyle = '#ffffff';
      btn1Ctx.font = 'bold 18px sans-serif';
      btn1Ctx.textAlign = 'center';
      btn1Ctx.fillText("Play Tutorial", 128, 36);

      const btn1Tex = new THREE.CanvasTexture(btn1Canvas);
      btn1Tex.colorSpace = THREE.SRGBColorSpace;
      const btn1Mat = new THREE.MeshBasicMaterial({ map: btn1Tex });
      const btn1Geom = new THREE.PlaneGeometry(0.35, 0.1);
      this.btnPlay = new THREE.Mesh(btn1Geom, btn1Mat);
      this.btnPlay.position.set(-0.2, -0.1, 0.01);
      this.uiPanelBg.add(this.btnPlay);

      const btn2Canvas = document.createElement('canvas');
      btn2Canvas.width = 256;
      btn2Canvas.height = 64;
      const btn2Ctx = btn2Canvas.getContext('2d')!;
      btn2Ctx.fillStyle = '#ef4444'; // Red
      if (typeof btn2Ctx.roundRect === 'function') {
          btn2Ctx.beginPath();
          btn2Ctx.roundRect(5, 5, 246, 54, 8);
          btn2Ctx.fill();
      } else {
          btn2Ctx.fillRect(5, 5, 246, 54);
      }
      btn2Ctx.fillStyle = '#ffffff';
      btn2Ctx.font = 'bold 18px sans-serif';
      btn2Ctx.textAlign = 'center';
      btn2Ctx.fillText("Skip", 128, 36);

      const btn2Tex = new THREE.CanvasTexture(btn2Canvas);
      btn2Tex.colorSpace = THREE.SRGBColorSpace;
      const btn2Mat = new THREE.MeshBasicMaterial({ map: btn2Tex });
      const btn2Geom = new THREE.PlaneGeometry(0.35, 0.1);
      this.btnSkip = new THREE.Mesh(btn2Geom, btn2Mat);
      this.btnSkip.position.set(0.2, -0.1, 0.01);
      this.uiPanelBg.add(this.btnSkip);

      this.uiPanelBg.visible = false;
      this.world.scene.add(this.uiPanelBg);

      // Create entities
      this.panelBgEntity = this.world.createTransformEntity(this.uiPanelBg);
      this.btnPlayEntity = this.world.createTransformEntity(this.btnPlay, { parent: this.panelBgEntity });
      this.btnSkipEntity = this.world.createTransformEntity(this.btnSkip, { parent: this.panelBgEntity });
  }

  private showOnboardingUI() {
      if (!this.uiPanelBg) {
          this.createOnboardingUI();
      }
      this.uiPanelBg.visible = true;
      this.btnPlay.visible = true;
      this.btnSkip.visible = true;

      if (this.btnPlayEntity && !this.btnPlayEntity.hasComponent(Interactable)) {
          this.btnPlayEntity.addComponent(Interactable);
      }
      if (this.btnSkipEntity && !this.btnSkipEntity.hasComponent(Interactable)) {
          this.btnSkipEntity.addComponent(Interactable);
      }
  }

  private hideOnboardingUI() {
      if (this.uiPanelBg) {
          this.uiPanelBg.visible = false;
      }
      if (this.btnPlay) {
          this.btnPlay.visible = false;
      }
      if (this.btnSkip) {
          this.btnSkip.visible = false;
      }

      if (this.btnPlayEntity && this.btnPlayEntity.hasComponent(Interactable)) {
          this.btnPlayEntity.removeComponent(Interactable);
      }
      if (this.btnSkipEntity && this.btnSkipEntity.hasComponent(Interactable)) {
          this.btnSkipEntity.removeComponent(Interactable);
      }
  }

  update(dt: number) {
    this.floatTime += dt;

    // Sync player head to camera in flat mode to ensure proper spatial UI and companion spawning
    const isXR = this.renderer.xr.isPresenting;
    if (!isXR && this.world && this.world.camera) {
        this.player.head.position.copy(this.world.camera.position);
        this.player.head.quaternion.copy(this.world.camera.quaternion);
        this.player.head.scale.copy(this.world.camera.scale);
        this.player.head.updateMatrixWorld(true);
    }

    // Handle force reset from URL parameters on first frame
    if (this.forceStartFromOnboarding) {
        this.forceStartFromOnboarding = false;
        this.queries.jugnu.entities.forEach(entity => {
            entity.setValue(Jugnu, "onboardingPhase", 0);
            entity.setValue(Jugnu, "instructionStep", 0);
        });
        this.onboardingPhase = 0;
        this.interactionState = 'WaitingForRoom'; // Let room loading block re-initialize
    }
    
    // Room Loading Block
    if (this.interactionState === 'WaitingForRoom') {
        if (this.queries.jugnu.entities.size === 0) {
            return;
        }
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

    if (this.interactionState === 'Idle' || this.interactionState === 'Following' || this.interactionState === 'Anchored') {
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
                    this.setPhysicsState(e, PhysicsState.Kinematic, 0.0);
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
                    this.setPhysicsState(entity, PhysicsState.Dynamic, 1.0);
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        this.setPhysicsState(entity, PhysicsState.Kinematic, 0.0);
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
                    this.setPhysicsState(entity, PhysicsState.Dynamic, 1.0);
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        this.setPhysicsState(entity, PhysicsState.Kinematic, 0.0);
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
      this.onboardingPhase = entity.getValue(Jugnu, "onboardingPhase") as number;

      // Detect index fingers touching together for step 1 -> step 2 transition
      if (this.onboardingPhase === 4 && instructionStep === 1) {
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
      
      // Baseline scale is 0.2 during onboarding, and shrinks dynamically only post-onboarding
      let targetScale = 0.2;
      if (this.onboardingPhase === 4) {
          targetScale = 0.03;
          if (this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand') {
              targetScale = 0.03;
          } else {
              if (distToPlayer > 1.0) {
                  targetScale = THREE.MathUtils.clamp(0.03 + (distToPlayer - 1.0) * 0.11, 0.03, 0.25);
              }
          }
      }
      
      this.tempScale.setScalar(targetScale);
      baseScale.lerp(this.tempScale, 4.0 * safeDt);
      
      const isPinched = this.interactionState === 'Attached' || this.interactionState === 'LerpingToHand';
      const targetPinchProgress = isPinched ? 1.0 : 0.0;
      jugModel.pinchProgress = THREE.MathUtils.lerp(jugModel.pinchProgress || 0, targetPinchProgress, 5.0 * safeDt);
      
      const isOnboardingActive = this.onboardingPhase < 4;
      
      if (isOnboardingActive) {
          if (this.interactionState === 'OnboardingWakeUp') {
              let wristTapped = false;
              if (this.xrFrame && this.renderer.xr.isPresenting) {
                  const refSpace = this.renderer.xr.getReferenceSpace();
                  if (refSpace) {
                      wristTapped = this.checkWristRub(this.xrFrame, refSpace, safeDt);
                  }
              }
              if (this.desktopWristTapTriggered) {
                  wristTapped = true;
                  this.desktopWristTapTriggered = false;
              }

              if (wristTapped && !this.isSpawning && this.spawnTimer === 0.0) {
                  this.isSpawning = true;
                  this.spawnTimer = 0.0;

                  // Spawning starts at the right wrist position (or simulated desktop coordinates)
                  const startPos = new THREE.Vector3();
                  let gotWrist = false;
                  const frame = this.xrFrame;
                  if (frame && this.renderer.xr.isPresenting) {
                      const rightHand = this.input.getPrimaryInputSource('right');
                      const refSpace = this.renderer.xr.getReferenceSpace();
                      if (rightHand && rightHand.hand && refSpace && typeof frame.getJointPose === 'function') {
                          const rightWristJoint = rightHand.hand.get('wrist');
                          if (rightWristJoint) {
                              const pose = frame.getJointPose(rightWristJoint, refSpace);
                              if (pose) {
                                  startPos.set(
                                      pose.transform.position.x,
                                      pose.transform.position.y,
                                      pose.transform.position.z
                                  );
                                  startPos.applyMatrix4(this.player.matrixWorld);
                                  gotWrist = true;
                              }
                          }
                      }
                  }

                  if (!gotWrist) {
                      // Desktop mode: Spawn exactly at the user head/camera position
                      this.player.head.getWorldPosition(startPos);
                  }

                  // Target floating position in front of camera
                  const camPos = new THREE.Vector3();
                  this.player.head.getWorldPosition(camPos);
                  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                  forward.y = 0;
                  forward.normalize();
                  const targetPos = camPos.clone().add(forward.multiplyScalar(0.5));
                  targetPos.y = camPos.y - 0.15;

                  this.startPos.copy(startPos);
                  this.targetPos.copy(targetPos);

                  obj.position.copy(startPos);
                  obj.scale.setScalar(0);
                  obj.visible = true;
              }

              if (this.isSpawning) {
                  this.spawnTimer += safeDt;
                  const progress = Math.min(this.spawnTimer / 3.0, 1.0);
                  
                  // Translate smoothly from wrist (startPos) to floating target (targetPos)
                  const smoothProgress = THREE.MathUtils.smoothstep(progress, 0.0, 1.0);
                  obj.position.lerpVectors(this.startPos, this.targetPos, smoothProgress);

                  // Bouncy elastic scaling
                  const p = 0.4;
                  const ease = Math.pow(2, -10 * progress) * Math.sin((progress - p / 4) * (2 * Math.PI) / p) + 1;
                  obj.scale.setScalar(ease * 0.2);

                  this.dimIntensity = 0.8 * (1.0 - progress);
                  if (this.dimOverlayMat) {
                      this.dimOverlayMat.uniforms.u_dimIntensity.value = this.dimIntensity;
                  }

                  if (progress >= 1.0) {
                      this.isSpawning = false;
                      if (this.dimOverlayMesh) this.dimOverlayMesh.visible = false;
                      
                      this.interactionState = 'OnboardingIntro';
                      this.onboardingPhase = 1;
                      entity.setValue(Jugnu, "onboardingPhase", 1);
                      this.wakeUpTimer = 0.0;
                      this.hideOnboardingUI(); // Hide UI initially during the 5s wake-up show
                  }
              }
          } 
          else if (this.interactionState === 'OnboardingIntro') {
              this.wakeUpTimer += safeDt;

              // Hover and follow camera to keep kinematic physics synced and lively
              this.updateOnboardingHover(entity, obj, safeDt, true);

              // Play yawn audio once at start
              if (!this.yawnAudioPlayed) {
                  this.yawnAudioPlayed = true;
                  AudioUtils.play(entity);
              }

              const t = this.wakeUpTimer;

              if (t < 5.0) {
                  // Phase 2a: Yawning and morning stretch sequence (~5s duration)
                  let scaleX = 0.2;
                  let scaleY = 0.2;
                  let scaleZ = 0.2;

                  if (t < 1.5) {
                      jugModel.setMood('bored');
                      const yawnProgress = t / 1.5;
                      const squeeze = Math.sin(yawnProgress * Math.PI);
                      scaleY = 0.2 - squeeze * 0.04 + Math.pow(yawnProgress, 2) * 0.06;
                      scaleX = 0.2 + squeeze * 0.03 - Math.pow(yawnProgress, 2) * 0.04;
                  } else if (t < 3.5) {
                      jugModel.setMood('bright');
                      const stretchProgress = (t - 1.5) / 2.0;
                      const stretchAmt = Math.sin(stretchProgress * Math.PI);
                      scaleY = 0.2 + stretchAmt * 0.09;
                      scaleX = 0.2 - stretchAmt * 0.05;
                  } else {
                      jugModel.setMood('happy');
                      const relaxProgress = (t - 3.5) / 1.5;
                      const settleAmt = Math.exp(-3.0 * relaxProgress) * Math.cos(relaxProgress * Math.PI * 4.0);
                      scaleY = 0.2 + settleAmt * 0.03;
                      scaleX = 0.2 - settleAmt * 0.02;
                  }

                  obj.scale.set(scaleX, scaleY, scaleZ);
                  this.hideOnboardingUI();
              } else if (t < 10.5) {
                  // Phase 2b: Speak introduction (5.0s to 10.5s)
                  obj.scale.setScalar(0.2);
                  this.hideOnboardingUI();

                  if (t >= 5.0 && !this.introSpeech1Played) {
                      this.introSpeech1Played = true;
                      this.speak("Hi, I am Jugnu. Your spatial  companion");
                      jugModel.setMood('happy');
                  }

                  if (t >= 8.0 && !this.introSpeech2Played) {
                      this.introSpeech2Played = true;
                      this.speak("Welcome to the onboarding session");
                      jugModel.setMood('winking');
                  }
              } else {
                  // Phase 2b completion: show Play/Skip buttons
                  obj.scale.setScalar(0.2);
                  jugModel.setMood('happy');
                  this.showOnboardingUI();
              }

              // Position panel to the right of Jugnu and make it look at user
              const rightOffset = new THREE.Vector3(0.5, 0.15, -0.1).applyQuaternion(this.player.head.quaternion);
              const targetPanelPos = obj.position.clone().add(rightOffset);
              
              if (this.uiPanelBg) {
                  this.uiPanelBg.position.lerp(targetPanelPos, 5.0 * safeDt);
                  this.uiPanelBg.lookAt(this.headPos);
              }

              // Check buttons only if the intro sequence (10.5s) completes
              if (t >= 10.5) {
                  if (this.btnPlayEntity && this.btnPlayEntity.hasComponent(Pressed)) {
                      this.btnPlayEntity.removeComponent(Pressed);
                      this.hideOnboardingUI();
                      
                      this.interactionState = 'OnboardingTutorial';
                      this.onboardingPhase = 2;
                      entity.setValue(Jugnu, "onboardingPhase", 2);
                      entity.setValue(Jugnu, "instructionStep", 0); // Start tutorial step 0 (pinch)
                      this.gazeTimer = 0.0;
                      this.celebrationActive = false;
                  } else if (this.btnSkipEntity && this.btnSkipEntity.hasComponent(Pressed)) {
                      this.btnSkipEntity.removeComponent(Pressed);
                      this.hideOnboardingUI();
                      
                      this.interactionState = 'OnboardingNavigation';
                      this.onboardingPhase = 3;
                      entity.setValue(Jugnu, "onboardingPhase", 3);
                      this.spinTimer = 0.0;
                  }
              }
          } 
          else if (this.onboardingPhase === 2) {
              if (instructionStep === 0) {
                  // Hover and follow camera only if not currently pinched/lerping
                  if (this.interactionState === 'OnboardingTutorial') {
                      this.updateOnboardingHover(entity, obj, safeDt, true);
                  }

                  const isPinchedNow = (this.interactionState as string) === 'Attached' || (this.interactionState as string) === 'LerpingToHand';
                  if (isPinchedNow) {
                      jugModel.setMood('gold');
                      
                      this.wristTapTimer += safeDt;
                      if (this.wristTapTimer >= 1.5) {
                          this.wristTapTimer = 0.0;
                          this.spawnWicketAndHide();
                          entity.setValue(Jugnu, "instructionStep", 1);
                      }
                  } else {
                      this.wristTapTimer = 0.0;
                  }
              } 
              else if (instructionStep === 1) {
                  // Hover in place behind wicket (do not follow camera!)
                  if (this.interactionState === 'OnboardingTutorial') {
                      this.updateOnboardingHover(entity, obj, safeDt, false);
                  }

                  if (this.celebrationActive) {
                      this.celebrationTimer += safeDt;
                      if (this.celebrationTimer >= 2.0) {
                          this.celebrationActive = false;
                          
                          this.interactionState = 'OnboardingNavigation';
                          this.onboardingPhase = 3;
                          entity.setValue(Jugnu, "onboardingPhase", 3);
                          this.spinTimer = 0.0;
                          if (this.wicketGroup) this.wicketGroup.visible = false;
                      }
                  } else {
                      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                      const toJugnu = new THREE.Vector3().subVectors(obj.position, this.headPos).normalize();
                      const dot = camDir.dot(toJugnu);
                      const gazeCone = Math.cos(THREE.MathUtils.degToRad(8.0)); // 8 degree cone
                      
                      if (dot > gazeCone) {
                          this.gazeTimer += safeDt;
                          jugModel.setMood('blushing');
                          if (this.gazeTimer >= 2.0) {
                              this.celebrationActive = true;
                              this.celebrationTimer = 0.0;
                              this.triggerOnboardingCelebration();
                          }
                      } else {
                          this.gazeTimer = 0.0;
                          jugModel.setMood('winking');
                      }
                  }
              }
          } 
          else if (this.interactionState === 'OnboardingNavigation') {
              this.spinTimer += safeDt;
              if (this.spinTimer < 1.5) {
                  obj.rotation.y += safeDt * 25.0; // Fast spin
                  const pulse = 1.0 + Math.sin(this.spinTimer * 20.0) * 0.15;
                  obj.scale.setScalar(0.2 * pulse);
              } else {
                  if (!this.splineMesh) {
                      this.createSplinePathway();
                  }
                  
                  if (this.splineMesh && this.splineMesh.material instanceof THREE.ShaderMaterial) {
                      this.splineMesh.material.uniforms.u_time.value += safeDt;
                  }

                  if (this.spinTimer >= 4.5) {
                      this.onboardingPhase = 4;
                      this.interactionState = 'Following';
                      entity.setValue(Jugnu, "onboardingPhase", 4);
                      entity.setValue(Jugnu, "instructionStep", 3);
                      
                      this.setPhysicsState(entity, PhysicsState.Dynamic, 1.0);
                  }
              }
          }
      } else {
          if (this.interactionState === 'Idle') {
              if (this.throwTimer > 0) {
                  this.throwTimer -= safeDt;
              } else {
                  this.interactionState = 'Anchored';
                  this.centerPos.copy(obj.position);
                  const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                  if (currentState !== PhysicsState.Kinematic) {
                      this.setPhysicsState(entity, PhysicsState.Kinematic, 0.0);
                  }
              }
          } else if (this.interactionState === 'Following' || this.interactionState === 'Anchored') {
              if (this.interactionState === 'Following') {
                  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                  forward.y = 0; 
                  forward.normalize();
                  
                  const targetCenter = this.headPos.clone().add(forward.multiplyScalar(1.25)); 
                  targetCenter.y -= 0.22; 
                  
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
              
              entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
          }
      }

      // Pinch following and lerp physics when user is holding Jugnu (even during onboarding!)
      if (this.interactionState === 'LerpingToHand') {
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
    if (this.instructionBoard) {
        if (this.onboardingPhase === 0) {
            if (this.interactionState === 'OnboardingWakeUp' && !this.isSpawning) {
                this.instructionBoard.visible = true;
                this.instructionBoard.setStep(99);
                
                // Position it 0.6m in front of the camera, slightly down
                this.player.head.getWorldPosition(this.headPos);
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                forward.normalize();
                this.instructionBoard.position.copy(this.headPos).addScaledVector(forward, 0.6);
                this.instructionBoard.position.y -= 0.1;
                this.instructionBoard.lookAt(this.headPos);
            } else {
                this.instructionBoard.visible = false;
            }
        } else if (this.onboardingPhase === 2 && instructionStep < 3) {
            if (activeJugnuModel) {
                this.instructionBoard.visible = true;
                this.instructionBoard.setStep(instructionStep);
                
                // Position it nicely 22cm above Jugnu and face the player
                this.instructionBoard.position.copy(activeJugnuPos);
                this.instructionBoard.position.y += 0.22;
                
                this.player.head.getWorldPosition(this.headPos);
                this.instructionBoard.lookAt(this.headPos);
            } else {
                this.instructionBoard.visible = false;
            }
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
                if ((p as any).vel) {
                    p.pos.addScaledVector((p as any).vel, safeDt);
                }
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

