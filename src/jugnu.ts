import { createComponent, createSystem, Pressed, Vector3, PhysicsBody, PhysicsState, PhysicsManipulation, PhysicsShape, PhysicsShapeType, Interactable } from "@iwsdk/core";
import { MoodColors, MoodCompColors } from "./JugnuV3Model.js";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
const BACKEND_URL = ((import.meta as any).env.VITE_BACKEND_URL as string) || "/api/gemini";

import { JugnuInstructionBoard } from "./JugnuInstructionBoard.js";

export const Jugnu = createComponent("Jugnu", { instructionStep: { type: "Int8", default: 0 } });
export const TranscriptUI = createComponent("TranscriptUI", {});
export const TutorialTabRef = createComponent("TutorialTabRef", { index: { type: "Int8", default: 0 } });

export class JugnuSystem extends createSystem({
  jugnu: { required: [Jugnu] },
  jugnuClicked: { required: [Jugnu, Pressed] },
  transcriptBoard: { required: [TranscriptUI] },
  physicsShapes: { required: [PhysicsShape] },
  tutorialTabPressed: { required: [TutorialTabRef, Pressed] },
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
  private lockIconGroup!: THREE.Group;
  private lockLeftMesh!: THREE.Mesh;
  private lockRightMesh!: THREE.Mesh;
  private lockLeftMat!: THREE.ShaderMaterial;
  private lockRightMat!: THREE.ShaderMaterial;
  private isLockBreaking = false;
  private lockBreakAnimationTime = 0.0;
  private compassGroup!: THREE.Group;
  private compassNeedle?: THREE.Mesh;
  private compassRing?: THREE.Mesh;
  private compassBackingBoard!: THREE.Mesh;
  private compassBackingCanvas!: HTMLCanvasElement;
  private compassBackingCtx!: CanvasRenderingContext2D;
  private compassBackingTexture!: THREE.CanvasTexture;
  private outerBgCanvas?: HTMLCanvasElement;
  private innerBgCanvas?: HTMLCanvasElement;
  private outerTintCanvas!: HTMLCanvasElement;
  private outerTintCtx!: CanvasRenderingContext2D;
  private innerTintCanvas!: HTMLCanvasElement;
  private innerTintCtx!: CanvasRenderingContext2D;
  private centerTitle = "JUGNU CORE";
  private centerDetail = "Hover or tap an icon to interact.";
  private lastMoodColorHex = "";
  private animatedMoodColor = new THREE.Color(0xffb347);
  private animatedCompColor = new THREE.Color(0x4793ff);
  private lockPinchAllowed = false;
  private indexPinchTimer = 0.0;
  private pinchReleasedTimer = 0.0;
  private hoveredCellIndex = -1;
  private lastHoveredStadiumOption = -1;
   private activeCompassTileIndex = -1; // -1 for none
  private holographicMaterials: THREE.ShaderMaterial[] = [];
  private glitchFrameCount = 0;

  // Action Compass Subsystem
  private actionCompassGroup!: THREE.Group;
  private actionBackingBoard!: THREE.Mesh;
  private actionBackingCanvas!: HTMLCanvasElement;
  private actionBackingCtx!: CanvasRenderingContext2D;
  private actionBackingTexture!: THREE.CanvasTexture;
  private actionOuterTintCanvas!: HTMLCanvasElement;
  private actionOuterTintCtx!: CanvasRenderingContext2D;
  private actionInnerTintCanvas!: HTMLCanvasElement;
  private actionInnerTintCtx!: CanvasRenderingContext2D;
  private actionHoveredSpokeIndex = -1;
  private actionFloatTime = 0.0;
  private actionHolographicMat!: THREE.ShaderMaterial;

  private buttonCooldown = 0.0;
  private isChatOpen = false;
  private compassChatCard!: THREE.Mesh;
  private compassChatMat!: THREE.ShaderMaterial;
  private compassChatCanvas!: HTMLCanvasElement;
  private compassChatCtx!: CanvasRenderingContext2D;
  private compassChatTexture!: THREE.CanvasTexture;
  private chatHistory: { sender: string, text: string }[] = [];
  private isDebugOpen = false;
  private compassDebugCard!: THREE.Mesh;
  private compassDebugMat!: THREE.ShaderMaterial;
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
  private wasCompassOpen = false;
  private wasStadiumMenuOpen = false;
  private wasChatOpen = false;
  private wasTutorialOpen = false;
  private wasDebugOpen = false;
  private wasScaledMax = false;
  private wasMinimapSpawned = false;
  private isTutorialOpen = false;
  private compassTutorialCard!: THREE.Mesh;
  private compassTutorialMat!: THREE.ShaderMaterial;
  private compassTutorialCanvas!: HTMLCanvasElement;
  private compassTutorialCtx!: CanvasRenderingContext2D;
  private compassTutorialTexture!: THREE.CanvasTexture;
  private chatFrameCanvas: HTMLCanvasElement | null = null;
  private debugFrameCanvas: HTMLCanvasElement | null = null;
  private tutorialFrameCanvas: HTMLCanvasElement | null = null;
  private iconImages: Record<string, HTMLImageElement> = {};
  private iconTintCanvas!: HTMLCanvasElement;
  private iconTintCtx!: CanvasRenderingContext2D;

  private tutorialVideo?: HTMLVideoElement;
  private tutorialTabs = [
      { label: "SUMMON COMPASS", step: 0, x: -0.35, y: 0.12, canvas: null as any, texture: null as any, mesh: null as any },
      { label: "ROTATE MAP",     step: 1, x: -0.35, y: 0.00, canvas: null as any, texture: null as any, mesh: null as any },
      { label: "ZOOM MAP",       step: 2, x: -0.35, y: -0.12, canvas: null as any, texture: null as any, mesh: null as any },
      { label: "DOMAINS",        step: 3, x: 0.35,  y: 0.12, canvas: null as any, texture: null as any, mesh: null as any },
      { label: "REPLAY EVENT",   step: 4, x: 0.35,  y: 0.00, canvas: null as any, texture: null as any, mesh: null as any },
      { label: "WEATHER STYLES", step: 5, x: 0.35,  y: -0.12, canvas: null as any, texture: null as any, mesh: null as any }
  ];

  private isStadiumMenuOpen = false;
  private compassStadiumCanvas!: HTMLCanvasElement;
  private compassStadiumCtx!: CanvasRenderingContext2D;
  private compassStadiumTexture!: THREE.CanvasTexture;
  private compassStadiumMat!: THREE.ShaderMaterial;
  private compassStadiumCard!: THREE.Mesh;
  private selectedStadium: 'default' | 'berlin' | 'inuit' | 'butterflies' | 'nurburgring' = 'default';
  private stadiumImages: (HTMLImageElement | null)[] = [null, null, null, null, null];

  // Swipe & Scroll State
  private lastOpenedTab: string | null = null;


  // Left Hand Pinch Tutorial Thread UI
  private tutorialThreadMesh!: THREE.Mesh;
  private tutorialThreadTextCard!: THREE.Mesh;
  private hasLeftPinchCompleted = false;
  private leftIndexTipWorld = new THREE.Vector3();
  private leftThumbTipWorld = new THREE.Vector3();
  private threadCooldownTimer = 0.0;
  private lockEscapeTimer = 0.0;

  // Optimized Fireflies instanced particle system
  private firefliesMesh!: THREE.InstancedMesh;
  private fireflyData: {
      pos: THREE.Vector3;
      vel: THREE.Vector3;
      baseScale: number;
      flickerSpeed: number;
      flickerOffset: number;
      wanderTime: number;
  }[] = [];
  private readonly maxFireflies = 120;

  // Pre-allocated scratch variables for zero-GC high-performance render loop
  private scratchV3_1 = new THREE.Vector3();
  private scratchV3_2 = new THREE.Vector3();
  private scratchV3_3 = new THREE.Vector3();
  private scratchMatrix = new THREE.Matrix4();
  private scratchQuat = new THREE.Quaternion();

  init() {
    (window as any).jugnuSystem = this;
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
    this.initLockIcon();
    this.initTutorialThread();
    this.initFireflies();
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Handle raycast click on Tutorial Tabs
    this.queries.tutorialTabPressed.subscribe("qualify", (entity) => {
        const tabIdx = entity.getValue(TutorialTabRef, "index") as number;
        
        // Update instructionStep on all Jugnu entities
        this.queries.jugnu.entities.forEach(jugnuEnt => {
            jugnuEnt.setValue(Jugnu, "instructionStep", tabIdx);
        });

        console.log(`[TutorialTab Raycast] Selected step: ${tabIdx}`);

        const spatialFX = (window as any).spatialFX;
        if (spatialFX && entity.object3D) {
            const tabWorldPos = new THREE.Vector3();
            entity.object3D.getWorldPosition(tabWorldPos);
            spatialFX.playPositionalSound('click', tabWorldPos);
            spatialFX.triggerSpark(tabWorldPos, new THREE.Color(0x00ffcc), 10);
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

  public openCompass() {
    if (this.isCompassOpen) return;
    this.isCompassOpen = true;
    this.indexPinchTimer = 0.0;
    this.buttonCooldown = 0.5;

    this.queries.jugnu.entities.forEach(e => {
        if (e.getValue(Jugnu, "instructionStep") === 0) {
            e.setValue(Jugnu, "instructionStep", 1);
        }
    });

    console.log(`[Compass] Compass toggled! Open: ${this.isCompassOpen}`);
    
    this.compassGroup.visible = true;
    this.activeCompassTileIndex = -1;
    this.hoveredCellIndex = -1;

    this.redrawCompassGrid(-1);
    
    let activeJugModel: any = null;
    for (const e of this.queries.jugnu.entities) {
        if (e.object3D) {
            activeJugModel = e.object3D;
            break;
        }
    }
    if (activeJugModel && typeof activeJugModel.setMood === 'function') {
        activeJugModel.setMood('happy');
    }
    if (activeJugModel && typeof activeJugModel.triggerPinchAnimation === 'function') {
        activeJugModel.triggerPinchAnimation();
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

  private updateCompassUI(safeDt: number, instructionStep: number, activeJugnuPos: THREE.Vector3, activeJugnuModel: any) {
    const isMapScaledMax = !!((window as any).minimapTableVisible && (window as any).minimapTableScale >= 2.0);
    const isMinimapSpawned = !!(window as any).isMinimapSpawned;

    if (this.compassGroup) {
        if (this.isCompassOpen) {
            this.compassGroup.scale.lerp(new THREE.Vector3(1.3, 1.3, 1.3), safeDt * 30.0);
        } else {
            this.compassGroup.scale.lerp(new THREE.Vector3(0, 0, 0), safeDt * 30.0);
            if (this.compassGroup.scale.x < 0.01 && this.compassGroup.visible) {
                this.compassGroup.visible = false;
            }
            this.isChatOpen = false;
            this.isTutorialOpen = false;
            this.isStadiumMenuOpen = false;
            this.isDebugOpen = false;
            this.lastOpenedTab = null;
        }

        if (this.compassGroup.visible && activeJugnuPos.lengthSq() > 0) {
            // Check if active expression / mood color shifted, and animate transition
            const currentMood = this.expressionList[this.currentExpressionIndex];
            const targetColor = MoodColors[currentMood] || new THREE.Color(0xffffff);
            const targetCompColor = MoodCompColors[currentMood] || new THREE.Color(0xffffff);

            const dist1 = Math.pow(this.animatedMoodColor.r - targetColor.r, 2) +
                          Math.pow(this.animatedMoodColor.g - targetColor.g, 2) +
                          Math.pow(this.animatedMoodColor.b - targetColor.b, 2);
            const dist2 = Math.pow(this.animatedCompColor.r - targetCompColor.r, 2) +
                          Math.pow(this.animatedCompColor.g - targetCompColor.g, 2) +
                          Math.pow(this.animatedCompColor.b - targetCompColor.b, 2);

            let needsRedraw = (dist1 > 0.00001 || dist2 > 0.00001);
            if (needsRedraw) {
                this.animatedMoodColor.lerp(targetColor, safeDt * 5.0);
                this.animatedCompColor.lerp(targetCompColor, safeDt * 5.0);
            }

            if (this.hoveredCellIndex !== -1) {
                needsRedraw = true;
            }

            if (needsRedraw) {
                this.redrawCompassGrid(this.hoveredCellIndex);
            }

            // Calculate dynamic 'userRight' vector based on player head perspective
            this.player.head.getWorldPosition(this.headPos);
            const forward = this.scratchV3_1.subVectors(activeJugnuPos, this.headPos);
            forward.y = 0;
            forward.normalize();
            const userRight = this.scratchV3_2.crossVectors(forward, this.scratchV3_3.set(0, 1, 0)).normalize();

            if (this.isGridLocked) {
                if (!this.lockedCompassPos) {
                    this.lockedCompassPos = new THREE.Vector3().copy(activeJugnuPos);
                    this.lockedCompassPos.addScaledVector(userRight, 0.12);
                    this.lockedCompassPos.y += 0.5 * activeJugnuModel!.scale.y; // Vertically center with Jugnu's body
                }
                this.compassGroup.position.copy(this.lockedCompassPos);
            } else {
                this.lockedCompassPos = null;
                this.lockedCompassQuat = null;
                this.compassGroup.position.copy(activeJugnuPos);
                this.compassGroup.position.addScaledVector(userRight, 0.12);
                this.compassGroup.position.y += 0.5 * activeJugnuModel!.scale.y; // Vertically center with Jugnu's body
            }
            this.compassGroup.lookAt(this.headPos);

            if (this.compassNeedle) {
                const worldNorth = this.scratchV3_1.set(0, 0, -1);
                const localNorth = worldNorth.applyQuaternion(this.scratchQuat.copy(this.compassGroup.quaternion).invert());
                const angle = Math.atan2(localNorth.x, localNorth.y);
                this.compassNeedle.rotation.z = -angle;
            }

            if (this.compassRing) {
                this.compassRing.rotation.z += safeDt * 0.5; // Slow diagnostic spin
            }


            // Query index finger positions at the top of the interaction block
            const leftIndexTip = new THREE.Vector3();
            const rightIndexTip = new THREE.Vector3();
            const hasLeft = this.getIndexData('left', leftIndexTip);
            const hasRight = this.getIndexData('right', rightIndexTip);

            // Position targets for open tabs (shifted 50cm to the right: X = 0.71, centered vertically: Y = 0.0)
            let targetTranscriptX = 0.0;
            let targetTranscriptY = -0.02;
            let targetTutorialX = 0.0;
            let targetTutorialY = -0.02;
            let targetStadiumMenuX = 0.0;
            let targetStadiumMenuY = -0.02;
            let targetDebugX = 0.0;
            let targetDebugY = -0.02;

            if (this.isChatOpen) {
                targetTranscriptX = 0.0;
                targetTranscriptY = 0.23;
            }
            if (this.isTutorialOpen) {
                targetTutorialX = 0.0;
                targetTutorialY = 0.23;
            }
            if (this.isDebugOpen) {
                targetDebugX = 0.0;
                targetDebugY = 0.23;
            }
            if (this.isStadiumMenuOpen) {
                targetStadiumMenuX = 0.0;
                targetStadiumMenuY = 0.0; // Curved Venue selector concentric with compass at center
            }

            // Smooth scaling & sliding transition for the Transcript card (slides vertically on the right side of the board)
            if (this.compassChatCard) {
                if (this.isChatOpen) {
                    this.compassChatMat.opacity = THREE.MathUtils.lerp(this.compassChatMat.opacity, 0.95, safeDt * 30.0);
                    this.compassChatCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 30.0);
                    this.compassChatCard.position.x = THREE.MathUtils.lerp(this.compassChatCard.position.x, targetTranscriptX, safeDt * 30.0);
                    this.compassChatCard.position.y = THREE.MathUtils.lerp(this.compassChatCard.position.y, targetTranscriptY, safeDt * 30.0);
                    this.compassChatCard.position.z = THREE.MathUtils.lerp(this.compassChatCard.position.z, -0.01, safeDt * 30.0);
                    this.compassChatCard.rotation.x = THREE.MathUtils.lerp(this.compassChatCard.rotation.x, 0.3, safeDt * 30.0);
                } else {
                    this.compassChatMat.opacity = THREE.MathUtils.lerp(this.compassChatMat.opacity, 0.0, safeDt * 30.0);
                    this.compassChatCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 30.0);
                    this.compassChatCard.position.x = THREE.MathUtils.lerp(this.compassChatCard.position.x, 0.0, safeDt * 30.0);
                    this.compassChatCard.position.y = THREE.MathUtils.lerp(this.compassChatCard.position.y, -0.02, safeDt * 30.0);
                    this.compassChatCard.position.z = THREE.MathUtils.lerp(this.compassChatCard.position.z, -0.01, safeDt * 30.0);
                    this.compassChatCard.rotation.x = THREE.MathUtils.lerp(this.compassChatCard.rotation.x, 0.0, safeDt * 30.0);
                }
            }

            // Smooth scaling & sliding transition for the Tutorial card (slides vertically on the right side of the board)
            if (this.compassTutorialCard) {
                if (this.isTutorialOpen) {
                    this.compassTutorialMat.opacity = THREE.MathUtils.lerp(this.compassTutorialMat.opacity, 0.95, safeDt * 30.0);
                    this.compassTutorialCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 30.0);
                    this.compassTutorialCard.position.x = THREE.MathUtils.lerp(this.compassTutorialCard.position.x, targetTutorialX, safeDt * 30.0);
                    this.compassTutorialCard.position.y = THREE.MathUtils.lerp(this.compassTutorialCard.position.y, targetTutorialY, safeDt * 30.0);
                    this.compassTutorialCard.position.z = THREE.MathUtils.lerp(this.compassTutorialCard.position.z, -0.01, safeDt * 30.0);
                    this.compassTutorialCard.rotation.x = THREE.MathUtils.lerp(this.compassTutorialCard.rotation.x, 0.3, safeDt * 30.0);
                    
                    // Reactive dynamic update matching user instructionStep
                    this.redrawCompassTutorial(instructionStep);
                } else {
                    this.compassTutorialMat.opacity = THREE.MathUtils.lerp(this.compassTutorialMat.opacity, 0.0, safeDt * 30.0);
                    this.compassTutorialCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 30.0);
                    this.compassTutorialCard.position.x = THREE.MathUtils.lerp(this.compassTutorialCard.position.x, 0.0, safeDt * 30.0);
                    this.compassTutorialCard.position.y = THREE.MathUtils.lerp(this.compassTutorialCard.position.y, -0.02, safeDt * 30.0);
                    this.compassTutorialCard.position.z = THREE.MathUtils.lerp(this.compassTutorialCard.position.z, -0.01, safeDt * 30.0);
                    this.compassTutorialCard.rotation.x = THREE.MathUtils.lerp(this.compassTutorialCard.rotation.x, 0.0, safeDt * 30.0);
                }
            }

            // Smooth scaling & sliding transition for the Debug Console card (slides vertically on the right side of the board)
            if (this.compassDebugCard) {
                if (this.isDebugOpen) {
                    this.compassDebugMat.opacity = THREE.MathUtils.lerp(this.compassDebugMat.opacity, 0.95, safeDt * 30.0);
                    this.compassDebugCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 30.0);
                    this.compassDebugCard.position.x = THREE.MathUtils.lerp(this.compassDebugCard.position.x, targetDebugX, safeDt * 30.0);
                    this.compassDebugCard.position.y = THREE.MathUtils.lerp(this.compassDebugCard.position.y, targetDebugY, safeDt * 30.0);
                    this.compassDebugCard.position.z = THREE.MathUtils.lerp(this.compassDebugCard.position.z, -0.01, safeDt * 30.0);
                    this.compassDebugCard.rotation.x = THREE.MathUtils.lerp(this.compassDebugCard.rotation.x, 0.3, safeDt * 30.0);
                } else {
                    this.compassDebugMat.opacity = THREE.MathUtils.lerp(this.compassDebugMat.opacity, 0.0, safeDt * 30.0);
                    this.compassDebugCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 30.0);
                    this.compassDebugCard.position.x = THREE.MathUtils.lerp(this.compassDebugCard.position.x, 0.0, safeDt * 30.0);
                    this.compassDebugCard.position.y = THREE.MathUtils.lerp(this.compassDebugCard.position.y, -0.02, safeDt * 30.0);
                    this.compassDebugCard.position.z = THREE.MathUtils.lerp(this.compassDebugCard.position.z, -0.01, safeDt * 30.0);
                    this.compassDebugCard.rotation.x = THREE.MathUtils.lerp(this.compassDebugCard.rotation.x, 0.0, safeDt * 30.0);
                }
            }

            // Smooth scaling & sliding transition for the Stadium Selector card — sits at a distinct Z depth to prevent mistouch
            if (this.compassStadiumCard) {
                if (this.isStadiumMenuOpen) {
                    this.compassStadiumMat.opacity = THREE.MathUtils.lerp(this.compassStadiumMat.opacity, 0.95, safeDt * 30.0);
                    this.compassStadiumCard.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 30.0);
                    this.compassStadiumCard.position.x = THREE.MathUtils.lerp(this.compassStadiumCard.position.x, targetStadiumMenuX, safeDt * 30.0);
                    this.compassStadiumCard.position.y = THREE.MathUtils.lerp(this.compassStadiumCard.position.y, targetStadiumMenuY, safeDt * 30.0);
                    this.compassStadiumCard.position.z = THREE.MathUtils.lerp(this.compassStadiumCard.position.z, 0.03, safeDt * 30.0);
                } else {
                    this.compassStadiumMat.opacity = THREE.MathUtils.lerp(this.compassStadiumMat.opacity, 0.0, safeDt * 30.0);
                    this.compassStadiumCard.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 30.0);
                    this.compassStadiumCard.position.x = THREE.MathUtils.lerp(this.compassStadiumCard.position.x, 0.0, safeDt * 30.0);
                    this.compassStadiumCard.position.y = THREE.MathUtils.lerp(this.compassStadiumCard.position.y, 0.0, safeDt * 30.0);
                    this.compassStadiumCard.position.z = THREE.MathUtils.lerp(this.compassStadiumCard.position.z, -0.01, safeDt * 30.0);
                }
            }

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
                const localTip = this.scratchV3_1.copy(activeTip).applyMatrix4(this.scratchMatrix.copy(this.compassGroup.matrixWorld).invert());
                const isWithinHoverZ = Math.abs(localTip.z) < 0.025;
                const isWithinBoundsX = localTip.x > -0.075 && localTip.x < 0.075;
                const isWithinBoundsY = localTip.y > -0.075 && localTip.y < 0.075;

                if (isWithinHoverZ && isWithinBoundsX && isWithinBoundsY) {
                    const d = Math.sqrt(localTip.x * localTip.x + localTip.y * localTip.y);
                    if (d >= 0.032 && d <= 0.078) {
                        // We are in the active spoke ring range
                        // Align local coordinate system angle: local Y is UP, local X is RIGHT.
                        // Canvas coordinates Y goes DOWN, so reflect Y: -localTip.y
                        const angle = Math.atan2(-localTip.y, localTip.x);
                        
                        let bestIdx = -1;
                        let minDiff = Infinity;
                        for (let i = 0; i < JugnuSystem.SPOKES.length; i++) {
                            let diff = Math.abs(angle - JugnuSystem.SPOKES[i].angle);
                            if (diff > Math.PI) {
                                diff = 2 * Math.PI - diff;
                            }
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestIdx = i;
                            }
                        }
                        
                        currentHoverIdx = bestIdx;
                    }
                    
                    const isPressed = Math.abs(localTip.z) < 0.014;

                    if (isPressed && currentHoverIdx !== -1 && this.buttonCooldown <= 0.0) {
                        this.buttonCooldown = 0.8;
                        const activeHand = activeTip === leftIndexTip ? 'left' : 'right';
                        const source = this.input.getPrimaryInputSource(activeHand);
                        if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                            source.gamepad.hapticActuators[0].pulse(0.8, 50);
                        }
                        this.activeCompassTileIndex = currentHoverIdx;
                        this.handleCompassTileClick(currentHoverIdx);

                        // Trigger click audio & sparks
                        const spatialFX = (window as any).spatialFX;
                        if (spatialFX) {
                            spatialFX.playPositionalSound('click', activeTip);
                            spatialFX.triggerSpark(activeTip, new THREE.Color(0x00ffcc), 10);
                        }
                    }
                }
            }

            let hoveredStadiumOption = -1;
            if (this.isStadiumMenuOpen && activeTip && this.compassStadiumCard) {
                const cardLocalTip = this.scratchV3_1.copy(activeTip).applyMatrix4(this.scratchMatrix.copy(this.compassStadiumCard.matrixWorld).invert());
                
                // Concentric PlaneGeometry(0.30, 0.30): x±0.15, y±0.15
                const isWithinCardHoverZ = cardLocalTip.z > -0.04 && cardLocalTip.z < 0.025;
                const d = Math.sqrt(cardLocalTip.x * cardLocalTip.x + cardLocalTip.y * cardLocalTip.y);
                const angle = Math.atan2(cardLocalTip.y, cardLocalTip.x); // Cartesian: top semi-circle has y > 0 -> angle in [0, Math.PI]

                // Hover check: radial distance [0.08, 0.13] and top semi-circle
                if (isWithinCardHoverZ && d >= 0.08 && d <= 0.13 && cardLocalTip.y > 0.0) {
                    // Match closest venue angle (160°, 125°, 90°, 55°, 20°)
                    const targetAngles = [
                        160 * Math.PI / 180,
                        125 * Math.PI / 180,
                        Math.PI / 2,
                        55 * Math.PI / 180,
                        20 * Math.PI / 180
                    ];
                    let bestIdx = -1;
                    let minDiff = Infinity;
                    for (let i = 0; i < 5; i++) {
                        const diff = Math.abs(angle - targetAngles[i]);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestIdx = i;
                        }
                    }
                    if (minDiff < 0.26) { // ~15 degrees tolerance
                        hoveredStadiumOption = bestIdx;
                    }

                    const isPressed = cardLocalTip.z > -0.04 && cardLocalTip.z < 0.014;
                    if (isPressed && hoveredStadiumOption !== -1 && this.buttonCooldown <= 0.0) {
                        this.buttonCooldown = 0.8;
                        const activeHand = activeTip === leftIndexTip ? 'left' : 'right';
                        const source = this.input.getPrimaryInputSource(activeHand);
                        if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                            source.gamepad.hapticActuators[0].pulse(0.85, 50);
                        }

                        const choices: ('default' | 'berlin' | 'inuit' | 'butterflies' | 'nurburgring')[] = ['default', 'berlin', 'inuit', 'butterflies', 'nurburgring'];
                        this.selectedStadium = choices[hoveredStadiumOption];
                        (window as any).selectedStadiumType = this.selectedStadium;
                        console.log(`[StadiumSelector] Selected: ${this.selectedStadium}`);

                        // Advance tutorial step 3 -> 4 when a stadium domain is selected/loaded
                        this.queries.jugnu.entities.forEach(e => {
                            if (e.getValue(Jugnu, "instructionStep") === 3) {
                                e.setValue(Jugnu, "instructionStep", 4);
                            }
                        });

                        // Trigger click audio & sparks
                        const spatialFX = (window as any).spatialFX;
                        if (spatialFX) {
                            spatialFX.playPositionalSound('click', activeTip);
                            spatialFX.triggerSpark(activeTip, new THREE.Color(0x00ffcc), 10);
                        }
                    }
                }
            }

            if (this.isStadiumMenuOpen) {
                this.redrawCompassStadiumMenu(hoveredStadiumOption);
            }

            let hoveredTutorialTab = -1;
            if (this.isTutorialOpen && activeTip && this.compassTutorialCard) {
                const cardLocalTip = this.scratchV3_1.copy(activeTip).applyMatrix4(this.scratchMatrix.copy(this.compassTutorialCard.matrixWorld).invert());
                const isWithinCardHoverZ = Math.abs(cardLocalTip.z) < 0.025;
                if (isWithinCardHoverZ) {
                    for (let i = 0; i < this.tutorialTabs.length; i++) {
                        const tab = this.tutorialTabs[i];
                        const dx = Math.abs(cardLocalTip.x - tab.x);
                        const dy = Math.abs(cardLocalTip.y - tab.y);
                        if (dx < 0.07 && dy < 0.025) { // Tab size is 0.14 x 0.05
                            hoveredTutorialTab = i;
                            break;
                        }
                    }
                }

                // Query hand pinch for pointing & pinch selection gesture support
                const leftTipTemp = new THREE.Vector3();
                const rightTipTemp = new THREE.Vector3();
                const isLeftPinching = this.getPinchData('left', leftTipTemp);
                const isRightPinching = this.getPinchData('right', rightTipTemp);
                const isPinching = (activeTip === leftIndexTip) ? isLeftPinching : isRightPinching;
                const isPressed = (Math.abs(cardLocalTip.z) < 0.014) || (isPinching && Math.abs(cardLocalTip.z) < 0.035);

                if (isPressed && hoveredTutorialTab !== -1 && this.buttonCooldown <= 0.0) {
                    this.buttonCooldown = 0.8;
                    const activeHand = activeTip === leftIndexTip ? 'left' : 'right';
                    const source = this.input.getPrimaryInputSource(activeHand);
                    if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                        source.gamepad.hapticActuators[0].pulse(0.85, 50);
                    }

                    this.queries.jugnu.entities.forEach(entity => {
                        entity.setValue(Jugnu, "instructionStep", hoveredTutorialTab);
                    });
                    instructionStep = hoveredTutorialTab;

                    console.log(`[TutorialTab] Selected step: ${hoveredTutorialTab}`);

                    const spatialFX = (window as any).spatialFX;
                    if (spatialFX) {
                        spatialFX.playPositionalSound('click', activeTip);
                        spatialFX.triggerSpark(activeTip, new THREE.Color(0x00ffcc), 10);
                    }
                }
            }

            // Always update tab hover & selected visual states when tutorial is open
            if (this.isTutorialOpen) {
                this.tutorialTabs.forEach((tab, i) => {
                    const isSelected = (instructionStep === i);
                    const isHovered = (hoveredTutorialTab === i);
                    this.redrawTutorialTabMesh(i, isHovered, isSelected);
                });
            }

            // Play sparkle sound & micro sparks on hover change
            if (currentHoverIdx !== this.hoveredCellIndex) {
                this.hoveredCellIndex = currentHoverIdx;
                this.redrawCompassGrid(currentHoverIdx);
                if (currentHoverIdx !== -1) {
                    const spatialFX = (window as any).spatialFX;
                    if (spatialFX && activeTip) {
                        spatialFX.playPositionalSound('sparkle', activeTip);
                        spatialFX.triggerSpark(activeTip, new THREE.Color(0x00ffcc), 2);
                    }
                }
            }

            if (hoveredStadiumOption !== this.lastHoveredStadiumOption) {
                this.lastHoveredStadiumOption = hoveredStadiumOption;
                if (hoveredStadiumOption !== -1) {
                    const spatialFX = (window as any).spatialFX;
                    if (spatialFX && activeTip) {
                        spatialFX.playPositionalSound('sparkle', activeTip);
                        spatialFX.triggerSpark(activeTip, new THREE.Color(0x00ffcc), 2);
                    }
                }
            }

            // ─── Action Compass Update Subsystem ───
            if (this.actionCompassGroup) {
                const isMinimapSpawned = !!(window as any).isMinimapSpawned;
                const isSportSeqActive = !!(window as any).isSportSequenceActive;
                const showActionCompass = this.isCompassOpen && isMinimapSpawned && !isSportSeqActive;

                if (showActionCompass) {
                    if (!this.actionCompassGroup.visible) {
                        this.actionCompassGroup.visible = true;
                        this.actionCompassGroup.scale.setScalar(0.001);
                    }
                    this.actionCompassGroup.scale.lerp(new THREE.Vector3(1, 1, 1), safeDt * 10.0);
                    
                    const targetActionX = 0.11;
                    const targetActionY = this.isStadiumMenuOpen ? -0.16 : -0.06;
                    this.actionCompassGroup.position.x = THREE.MathUtils.lerp(this.actionCompassGroup.position.x, targetActionX, safeDt * 15.0);
                    this.actionCompassGroup.position.y = THREE.MathUtils.lerp(this.actionCompassGroup.position.y, targetActionY, safeDt * 15.0);
                    
                    let activeActionTip: THREE.Vector3 | null = null;
                    if (hasLeft && hasRight) {
                        const boardWorldPos = new THREE.Vector3();
                        this.actionBackingBoard.getWorldPosition(boardWorldPos);
                        activeActionTip = leftIndexTip.distanceTo(boardWorldPos) < rightIndexTip.distanceTo(boardWorldPos) ? leftIndexTip : rightIndexTip;
                    } else if (hasLeft) {
                        activeActionTip = leftIndexTip;
                    } else if (hasRight) {
                        activeActionTip = rightIndexTip;
                    }

                    let currentActionHoverIdx = -1;
                    if (activeActionTip) {
                        const localTip = this.scratchV3_1.copy(activeActionTip).applyMatrix4(this.scratchMatrix.copy(this.actionCompassGroup.matrixWorld).invert());
                        const isWithinHoverZ = Math.abs(localTip.z) < 0.025;
                        const isWithinBoundsX = localTip.x > -0.05 && localTip.x < 0.05;
                        const isWithinBoundsY = localTip.y > -0.05 && localTip.y < 0.05;

                        if (isWithinHoverZ && isWithinBoundsX && isWithinBoundsY) {
                            const d = Math.sqrt(localTip.x * localTip.x + localTip.y * localTip.y);
                            if (d >= 0.020 && d <= 0.052) {
                                const angle = Math.atan2(-localTip.y, localTip.x);
                                let bestIdx = -1;
                                let minDiff = Infinity;
                                for (let i = 0; i < JugnuSystem.ACTION_SPOKES.length; i++) {
                                    let diff = Math.abs(angle - JugnuSystem.ACTION_SPOKES[i].angle);
                                    if (diff > Math.PI) {
                                        diff = 2 * Math.PI - diff;
                                    }
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        bestIdx = i;
                                    }
                                }
                                currentActionHoverIdx = bestIdx;
                            }

                            const isPressed = Math.abs(localTip.z) < 0.012;
                            if (isPressed && currentActionHoverIdx !== -1 && this.buttonCooldown <= 0.0) {
                                this.buttonCooldown = 0.8;
                                const spokeType = JugnuSystem.ACTION_SPOKES[currentActionHoverIdx].type;
                                this.executeActionSpoke(spokeType, activeActionTip);
                            }
                        }
                    }

                    this.actionFloatTime += safeDt;
                    if (currentActionHoverIdx !== this.actionHoveredSpokeIndex) {
                        this.actionHoveredSpokeIndex = currentActionHoverIdx;
                        this.redrawActionCompass(currentActionHoverIdx);
                        if (currentActionHoverIdx !== -1 && activeActionTip) {
                            const spatialFX = (window as any).spatialFX;
                            if (spatialFX) {
                                spatialFX.playPositionalSound('sparkle', activeActionTip);
                                spatialFX.triggerSpark(activeActionTip, new THREE.Color(0x00ffff), 2);
                            }
                        }
                    } else if (currentActionHoverIdx !== -1) {
                        this.redrawActionCompass(currentActionHoverIdx);
                    }
                } else {
                    this.actionCompassGroup.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), safeDt * 10.0);
                    if (this.actionCompassGroup.scale.x < 0.01 && this.actionCompassGroup.visible) {
                        this.actionCompassGroup.visible = false;
                    }
                    this.actionHoveredSpokeIndex = -1;
                }
            }
        }
    }
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
    const safeDt = Math.min(dt, 0.03);
    
    // Room Loading Block
    const isOnboardingActive = (window as any).onboardingActive === true;
    if (this.interactionState === 'WaitingForRoom' || isOnboardingActive) {
        const isXR = (this.renderer.xr as any).isPresenting;
        
        if (!isXR && !isOnboardingActive) {
            this.activateJugnu();
        } else {
            let roomFound = false;
            for (const entity of this.queries.physicsShapes.entities) {
                if (entity.getValue(PhysicsShape, 'shape') === PhysicsShapeType.TriMesh) {
                    roomFound = true;
                    break;
                }
            }
            
            if (roomFound && !isOnboardingActive) {
                this.activateJugnu();
            } else {
                this.roomWaitTimer -= dt;
                
                if (this.roomWaitTimer <= 0 && !isOnboardingActive) {
                    if (!this.sceneCaptureRequested) {
                        this.sceneCaptureRequested = true;
                        const session = (this.renderer.xr as any).getSession ? (this.renderer.xr as any).getSession() : (this.renderer.xr as any).session;
                        if (session && typeof session.requestSceneCapture === 'function') {
                            session.requestSceneCapture().then(() => {
                                setTimeout(() => {
                                    if (this.interactionState === 'WaitingForRoom' && !(window as any).onboardingActive) {
                                        this.activateJugnu();
                                    }
                                }, 2000);
                            }).catch((err: any) => {
                                console.warn("Scene capture failed or denied:", err);
                                if (this.interactionState === 'WaitingForRoom' && !(window as any).onboardingActive) {
                                    this.activateJugnu();
                                }
                            });
                        } else {
                            this.activateJugnu();
                        }
                    } else {
                        // Wait for fallback timer to force spawn Jugnu
                        this.fallbackSpawnTimer -= dt;
                        if (this.fallbackSpawnTimer <= 0 && !isOnboardingActive) {
                            if (this.interactionState === 'WaitingForRoom') {
                                this.activateJugnu();
                            }
                        }
                    }
                }
                const onboardingState = (window as any).onboardingSystem?.state;
                const isFormedPhase = onboardingState !== 'phase1' && onboardingState !== 'phase2';
                if (!isFormedPhase) {
                    this.queries.jugnu.entities.forEach(e => {
                        if (e.object3D) {
                            e.object3D.visible = true;
                            e.object3D.scale.setScalar(0.0001); // Pre-warm: keep visible but microscopic
                        }
                    });
                } else {
                    let activeJugModel: any = null;
                    let activeJugPos = new THREE.Vector3();
                    let step = 0;
                    this.queries.jugnu.entities.forEach(e => {
                        step = e.getValue(Jugnu, "instructionStep") as number;
                        const jugModel = e.object3D as JugnuV3Model;
                        if (jugModel) {
                            activeJugModel = jugModel;
                            activeJugPos.copy(jugModel.position);
                            if (typeof jugModel.update === 'function') {
                                jugModel.update(dt);
                            }
                        }
                    });
                    
                    // Run compass UI update loop even during onboarding
                    if (this.compassGroup && activeJugModel) {
                        this.updateCompassUI(safeDt, step, activeJugPos, activeJugModel);
                    }
                }
                return; 
            }
        }
    }

    if (this.interactDecay > 0) {
      this.interactDecay -= dt;
    }

    // safeDt declared at top of update loop

    // --- Pinch State Machine ---
    let isPinchingLeft = this.getPinchData('left', this.leftPinchTip);
    let isPinchingRight = this.getPinchData('right', this.rightPinchTip);



    // ── LOCK ESCAPE: hold pinch for 1.5 seconds while locked → unlock + come to fingertips ──
    if (this.isGridLocked) {
        const pinchActive = isPinchingLeft; // Right pinch is completely ignored
        
        if (!pinchActive) {
            this.lockPinchAllowed = true; // Once they release the pinch, they are allowed to breakout on next pinch
        }

        if (pinchActive && this.lockPinchAllowed) {
            this.lockEscapeTimer += safeDt;

            // Start/Update lock breakout grinding hum
            let jugnuPos = new THREE.Vector3();
            for (const entity of this.queries.jugnu.entities) {
                if (entity.object3D) {
                    jugnuPos.copy(entity.object3D.position);
                    break;
                }
            }
            const spatialFX = (window as any).spatialFX;
            if (spatialFX) {
                spatialFX.startLockVibrationSound(jugnuPos);
                spatialFX.updateLockVibrationSound(jugnuPos, this.lockEscapeTimer / 1.5);
            }

            if (this.lockEscapeTimer >= 1.5) {
                this.lockEscapeTimer = 0.0;
                console.log('[Jugnu] Held lock escape pinch for 1.5s — unlocking and lerping to hand.');

                // 1. Trigger Lock Breaking animation
                this.isLockBreaking = true;
                this.lockBreakAnimationTime = 0.0;

                // Play lock break sound & sparks
                if (spatialFX) {
                    spatialFX.stopLockVibrationSound();
                    spatialFX.playPositionalSound('lockBreak', jugnuPos);
                    spatialFX.triggerSpark(jugnuPos, new THREE.Color(0x00ffcc), 30);
                }

                // Trigger 3-frame chromatic aberration glitch
                this.glitchFrameCount = 3;

                // 2. Unlock & reset mood to happy orange
                this.isGridLocked = false;
                this.lockedCompassPos = null;
                this.lockedCompassQuat = null;
                this.setExpression(2); // Happy orange expression!

                // 3. Close compass UI so it respawns cleanly on next open
                this.isCompassOpen = false;
                this.isStadiumMenuOpen = false;
                this.isChatOpen = false;
                this.isTutorialOpen = false;
                this.isDebugOpen = false;
                this.indexPinchTimer = 0.0;
                this.pinchReleasedTimer = 0.0;

                // Determine which hand was pinching (always left here)
                const targetHand = 'left';
                const targetTip = this.leftPinchTip;

                // 4. Pull Jugnu to fingertip
                let lockedJugnuPos = this.scratchV3_1;
                lockedJugnuPos.set(0, 0, 0);
                for (const entity of this.queries.jugnu.entities) {
                    if (!entity.object3D) continue;
                    lockedJugnuPos.copy(entity.object3D.position);
                    break;
                }

                this.interactionState = 'LerpingToHand';
                this.attachedHand = targetHand;
                this.startPos.copy(lockedJugnuPos);
                this.targetPos.copy(targetTip);
                this.previousHandPos.copy(targetTip);
                this.handVelocity.set(0, 0, 0);
                this.lerpTime = 0;
                this.velocity.set(0, 0, 0);

                this.queries.jugnu.entities.forEach(e => {
                    const currentState = e.hasComponent(PhysicsBody) ? e.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (e.hasComponent(PhysicsShape)) e.removeComponent(PhysicsShape);
                        if (e.hasComponent(PhysicsBody)) e.removeComponent(PhysicsBody);
                        e.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                        e.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
                    }
                });
            }
        } else {
            this.lockEscapeTimer = 0.0;
            const spatialFX = (window as any).spatialFX;
            if (spatialFX) {
                spatialFX.stopLockVibrationSound();
            }
        }
    } else {
        this.lockEscapeTimer = 0.0;
        const spatialFX = (window as any).spatialFX;
        if (spatialFX) {
            spatialFX.stopLockVibrationSound();
        }
    }

    if ((this.interactionState === 'Idle' || this.interactionState === 'Following' || this.interactionState === 'Anchored') && !this.isGridLocked) {
        let activeHand: 'left' | 'right' | null = null;
        let activeTip = this.leftPinchTip;

        if (isPinchingLeft && !this.wasPinchingLeft) {
            activeHand = 'left';
            activeTip = this.leftPinchTip;
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
                        if (e.hasComponent(PhysicsShape)) e.removeComponent(PhysicsShape);
                        if (e.hasComponent(PhysicsBody)) e.removeComponent(PhysicsBody);
                        e.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
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
            this.threadCooldownTimer = 5.0;
            if (this.handVelocity.lengthSq() > 1.0) {
                this.interactionState = 'Idle';
                this.throwTimer = 3.0; 
                this.queries.jugnu.entities.forEach(entity => {
                    if (!entity.object3D) return;
                    this.basePositions.set(entity, entity.object3D.position.clone());
                    if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
                    if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                    entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
                        if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                        entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
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
            this.threadCooldownTimer = 5.0;
            if (this.handVelocity.lengthSq() > 1.0) {
                this.interactionState = 'Idle';
                this.throwTimer = 3.0; 
                this.queries.jugnu.entities.forEach(entity => {
                    if (!entity.object3D) return;
                    this.basePositions.set(entity, entity.object3D.position.clone());
                    if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
                    if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                    entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                    entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, gravityFactor: 1.0, linearDamping: 0.1, angularDamping: 0.1 });
                    entity.addComponent(PhysicsManipulation, { linearVelocity: [this.handVelocity.x * 1.5, this.handVelocity.y * 1.5, this.handVelocity.z * 1.5] });
                });
            } else {
                this.interactionState = 'Anchored';
                this.centerPos.copy(currentTip);
                this.queries.jugnu.entities.forEach(entity => {
                    const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
                    if (currentState !== PhysicsState.Kinematic) {
                        if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
                        if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                        entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
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

    const isMapScaledMax = !!((window as any).minimapTableVisible && (window as any).minimapTableScale >= 2.0);

    let activeJugnuModel: any = null;
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
      
      obj.visible = !isMapScaledMax;
      
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
                  if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
                  if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
                  entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
                  entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
              }
          }
      } else if (this.interactionState === 'Following' || this.interactionState === 'Anchored') {
          const currentState = entity.hasComponent(PhysicsBody) ? entity.getValue(PhysicsBody, 'state') : null;
          if (currentState !== PhysicsState.Kinematic) {
              if (entity.hasComponent(PhysicsShape)) entity.removeComponent(PhysicsShape);
              if (entity.hasComponent(PhysicsBody)) entity.removeComponent(PhysicsBody);
              entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [0.15, 0.15, 0.15] });
              entity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic, gravityFactor: 0.0 });
          }

          if (this.isGridLocked) {
              // Rigid Lock: perfectly frozen with zero floating/noise/drift
              obj.position.copy(this.centerPos);
              if (this.lockEscapeTimer > 0.0) {
                  // High-frequency vibration breakout effect
                  const vibrationIntensity = 0.015 * (this.lockEscapeTimer / 1.5);
                  obj.position.x += (Math.random() - 0.5) * vibrationIntensity;
                  obj.position.y += (Math.random() - 0.5) * vibrationIntensity;
                  obj.position.z += (Math.random() - 0.5) * vibrationIntensity;
              }
              this.velocity.set(0, 0, 0);
          } else {
              if (this.interactionState === 'Following') {
                  const forward = this.scratchV3_1.set(0, 0, -1).applyQuaternion(this.player.head.quaternion);
                  forward.y = 0; 
                  forward.normalize();
                  
                  // Calmed down: float farther away (1.25m instead of 0.95m) and lower to stay out of directly blocking user face
                  const targetCenter = this.scratchV3_2.copy(this.headPos).addScaledVector(forward, 1.25);
                  targetCenter.y -= 0.22; 
                  
                  // Calmed down: slower following transition (0.7x instead of 1.0x) so it floats lazily
                  this.centerPos.lerp(targetCenter, 0.7 * safeDt);
              }

              const floatX = this.noise(this.floatTime * 0.18, 0) * this.floatRadius;
              const floatY = this.noise(this.floatTime * 0.18, 1) * this.floatRadius * 0.5;
              const floatZ = this.noise(this.floatTime * 0.18, 2) * this.floatRadius;
              const hoverTarget = this.scratchV3_2.copy(this.centerPos);
              hoverTarget.x += floatX;
              hoverTarget.y += floatY;
              hoverTarget.z += floatZ;

              const displacement = this.scratchV3_3.subVectors(obj.position, hoverTarget);
              const force = displacement.multiplyScalar(-this.springStiffness * 0.5); 
              force.addScaledVector(this.velocity, -this.springDamping);

              this.velocity.addScaledVector(force, safeDt);
              obj.position.addScaledVector(this.velocity, safeDt);
          }
          
          entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });

      } else if (this.interactionState === 'LerpingToHand') {
          const t = Math.min(this.lerpTime / this.lerpDuration, 1.0);
          const smoothT = t * t * (3 - 2 * t);
          const oldPos = this.scratchV3_1.copy(obj.position);
          obj.position.lerpVectors(this.startPos, this.targetPos, smoothT);
          
          if (safeDt > 0.0001) {
              this.velocity.subVectors(obj.position, oldPos).divideScalar(safeDt);
              entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
          }
      } else if (this.interactionState === 'Attached') {
          const hoverTarget = this.scratchV3_2.copy(this.targetPos);

          const displacement = this.scratchV3_3.subVectors(obj.position, hoverTarget);
          const force = displacement.multiplyScalar(-this.springStiffness);
          force.addScaledVector(this.velocity, -this.springDamping);

          this.velocity.addScaledVector(force, safeDt);
          obj.position.addScaledVector(this.velocity, safeDt);
          
          entity.addComponent(PhysicsManipulation, { linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z] });
      }

      obj.lookAt(this.headPos);

      if (this.interactionState !== 'Idle') {
          const tiltFactor = 0.5;
          const tiltAxis = this.scratchV3_1.crossVectors(this.scratchV3_2.set(0, 1, 0), this.velocity);
          const tiltAngle = Math.min(tiltAxis.length() * tiltFactor, Math.PI / 4);
          if (tiltAngle > 0.001) {
              tiltAxis.normalize();
              const tiltQuat = this.scratchQuat.setFromAxisAngle(tiltAxis, tiltAngle);
              obj.quaternion.multiply(tiltQuat);
          }
      }

      if (this.isGridLocked) {
        this.pulseTime = 0;
        baseScale.setScalar(0.03);
        obj.scale.setScalar(0.03);
        jugModel.pulseIntensity = 0;
      } else if (this.isListening || this.isProcessingAudio) {
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
      
      const isXR = (this.renderer.xr as any).isPresenting;
      if (!isXR) {
          obj.position.set(0.12, 1.45 + Math.sin(this.floatTime * 2.5) * 0.015, -0.22);
          obj.scale.setScalar(0.12);
          obj.rotation.set(0, Math.sin(this.floatTime * 0.4) * 0.15 + Math.PI, 0);
      }
      activeJugnuPos.copy(obj.position);

      // Start/Update continuous hover hum when visible
      const spatialFX = (window as any).spatialFX;
      if (spatialFX) {
          if (obj.visible) {
              spatialFX.startJugnuHoverSound(obj.position);
              spatialFX.updateJugnuHoverSound(obj.position, this.velocity);
          } else {
              spatialFX.stopJugnuHoverSound();
          }
      }
    });

    // Lock Icon Floating UI Update & Breakout Animation
    if (this.lockIconGroup && activeJugnuModel) {
        if (this.isGridLocked || this.isLockBreaking) {
            // Anchor to the active Jugnu model's local Y axis to ensure it sits directly on top of Jugnu's head even when tilted
            const localY = this.scratchV3_2.set(0, 1, 0).applyQuaternion(activeJugnuModel.quaternion);
            const lockYOffset = 1.15 * activeJugnuModel.scale.y + 0.02;
            this.lockIconGroup.position.copy(activeJugnuPos).addScaledVector(localY, lockYOffset);
            
            // Face the player/camera (billboard)
            this.player.head.getWorldPosition(this.scratchV3_1);
            this.lockIconGroup.lookAt(this.scratchV3_1);

            if (this.isLockBreaking) {
                this.lockBreakAnimationTime += safeDt;
                const t = this.lockBreakAnimationTime / 0.8;
                if (t >= 1.0) {
                    this.isLockBreaking = false;
                    this.lockIconGroup.visible = false;
                } else {
                    // Left half flies left, falls slightly, and rotates counter-clockwise
                    this.lockLeftMesh.position.x = -0.009 - t * 0.06;
                    this.lockLeftMesh.position.y = -t * 0.03;
                    this.lockLeftMesh.rotation.z = -t * Math.PI / 2.5;
                    this.lockLeftMat.opacity = 1.0 - t;

                    // Right half flies right, falls slightly, and rotates clockwise
                    this.lockRightMesh.position.x = 0.009 + t * 0.06;
                    this.lockRightMesh.position.y = -t * 0.03;
                    this.lockRightMesh.rotation.z = t * Math.PI / 2.5;
                    this.lockRightMat.opacity = 1.0 - t;
                }
            } else {
                // Locked but not breaking: reset to default
                this.lockIconGroup.visible = true;
                this.lockLeftMesh.position.set(-0.009, 0, 0);
                this.lockLeftMesh.rotation.set(0, 0, 0);
                this.lockLeftMat.opacity = 1.0;

                this.lockRightMesh.position.set(0.009, 0, 0);
                this.lockRightMesh.rotation.set(0, 0, 0);
                this.lockRightMat.opacity = 1.0;
            }
        } else {
            this.lockIconGroup.visible = false;
        }
    }

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
            if (p.life <= 0 || isMapScaledMax) {
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

    // Wrist-button close-stack: peel back the last opened layer each tap.
    if ((window as any).wristCloseRequest) {
        (window as any).wristCloseRequest = false;
        if (this.isDebugOpen) {
            this.isDebugOpen = false;
            this.redrawCompassGrid(this.hoveredCellIndex);
        } else if (this.isTutorialOpen) {
            this.isTutorialOpen = false;
            this.redrawCompassGrid(this.hoveredCellIndex);
        } else if (this.isChatOpen) {
            this.isChatOpen = false;
            this.redrawCompassGrid(this.hoveredCellIndex);
        } else if (this.isStadiumMenuOpen) {
            this.isStadiumMenuOpen = false;
            this.redrawCompassGrid(this.hoveredCellIndex);
        } else if (this.isCompassOpen) {
            this.isCompassOpen = false;
        }
    }

    if (activeJugnuModel) {
        const isSportSeqActive = !!(window as any).isSportSequenceActive;
        const isMinimapSpawned = !!(window as any).isMinimapSpawned;
        const shouldHideUI = isMapScaledMax || isSportSeqActive;

        if (shouldHideUI) {
            if (!this.wasScaledMax) {
                // Just transitioned into scaled max or sport sequence active: save states
                this.wasCompassOpen = this.isCompassOpen;
                this.wasStadiumMenuOpen = this.isStadiumMenuOpen;
                this.wasChatOpen = this.isChatOpen;
                this.wasTutorialOpen = this.isTutorialOpen;
                this.wasDebugOpen = this.isDebugOpen;
                this.wasScaledMax = true;
            }
            
            // Force close them visually
            this.isCompassOpen = false;
            this.indexPinchTimer = 0.0;
            this.pinchReleasedTimer = 0.0;
            this.isStadiumMenuOpen = false;
            this.isChatOpen = false;
            this.isTutorialOpen = false;
            this.isDebugOpen = false;
        } else {
            if (this.wasScaledMax) {
                // Just transitioned back: restore states
                this.isCompassOpen = this.wasCompassOpen;
                if (this.isGridLocked || isMinimapSpawned) {
                    this.isCompassOpen = true;
                }
                if (this.isCompassOpen) {
                    this.compassGroup.visible = true;
                }
                this.isStadiumMenuOpen = this.wasStadiumMenuOpen;
                this.isChatOpen = this.wasChatOpen;
                this.isTutorialOpen = this.wasTutorialOpen;
                this.isDebugOpen = this.wasDebugOpen;
                this.wasScaledMax = false;
                
                // Trigger redraw of the compass grid and active panels to ensure they render properly
                this.redrawCompassGrid(this.hoveredCellIndex);
                if (this.isChatOpen) this.redrawCompassChat();
                if (this.isDebugOpen) this.redrawCompassDebug();
                if (this.isStadiumMenuOpen) this.redrawCompassStadiumMenu();
                if (this.isTutorialOpen) {
                    let currentStep = 0;
                    for (const entity of this.queries.jugnu.entities) {
                        currentStep = entity.getValue(Jugnu, "instructionStep") as number;
                        break;
                    }
                    this.redrawCompassTutorial(currentStep);
                }
            }
            const leftTip = new THREE.Vector3();
            const rightTip = new THREE.Vector3();
            const isLeftPinching = this.getPinchData('left', leftTip);
            const isRightPinching = this.getPinchData('right', rightTip);

            // Activation pinch must be close to Jugnu (within 0.25m) - RESTRICTED TO LEFT PINCH ONLY
            let isPinchingNearJugnu = false;
            if (isLeftPinching && leftTip.distanceTo(activeJugnuPos) < 0.25) {
                isPinchingNearJugnu = true;
            }

            // Active hold check: only left hand index pinch held anywhere keeps it open
            const isAnyPinchHeld = isLeftPinching;

            if (!this.isCompassOpen) {
                if (isPinchingNearJugnu) {
                    this.indexPinchTimer += safeDt;
                    if (this.indexPinchTimer >= 2.0) {
                        this.isCompassOpen = true;
                        this.indexPinchTimer = 0.0;
                        this.buttonCooldown = 0.5;

                        // Advance Step 0 to Step 1 on compass summon
                        this.queries.jugnu.entities.forEach(e => {
                            if (e.getValue(Jugnu, "instructionStep") === 0) {
                                e.setValue(Jugnu, "instructionStep", 1);
                            }
                        });

                        console.log(`[Compass] Compass toggled! Open: ${this.isCompassOpen}`);
                        
                        this.compassGroup.visible = true;
                        this.activeCompassTileIndex = -1;
                        this.hoveredCellIndex = -1;

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
                    if (!this.isGridLocked && !isMinimapSpawned) {
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
    }

    if (this.compassGroup && activeJugnuModel) {
        this.updateCompassUI(safeDt, instructionStep, activeJugnuPos, activeJugnuModel);
    }
    
    this.updateLeftHandTutorialThread(safeDt);
    this.updateFireflies(safeDt);

    // Update holographic shader uniforms (time, opacity, and glitch frame tracking)
    const timeVal = Date.now() * 0.001;
    let activeGlitch = 0.0;
    if (this.glitchFrameCount > 0) {
        this.glitchFrameCount--;
        activeGlitch = 1.0;
    }
    this.holographicMaterials.forEach(mat => {
        mat.uniforms.time.value = timeVal;
        mat.uniforms.opacity.value = mat.opacity; // Sync native material opacity
        mat.uniforms.glitchIntensity.value = activeGlitch;
    });
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

  private getJointWorldData(handedness: 'left' | 'right', jointName: string, posOut: THREE.Vector3): boolean {
      const source = this.input.getPrimaryInputSource(handedness);
      const frame = this.xrFrame;
      if (!source || !source.hand || !frame) return false;

      const joint = source.hand.get(jointName as any);
      if (!joint) return false;

      const refSpace = this.renderer.xr.getReferenceSpace();
      if (!refSpace || typeof frame.getJointPose !== 'function') return false;

      const pose = frame.getJointPose(joint, refSpace);

      if (pose) {
          const x = pose.transform.position.x;
          const y = pose.transform.position.y;
          const z = pose.transform.position.z;
          posOut.set(x, y, z);
          posOut.applyMatrix4(this.player.matrixWorld);
          return true;
      }
      return false;
  }

  private initFireflies() {
      const geo = new THREE.SphereGeometry(0.006, 4, 4); // Tiny 6mm low-poly sphere
      const mat = new THREE.MeshBasicMaterial({
          color: 0xdfff4f, // Soft glowing yellow-green
          transparent: true,
          opacity: 0.9,
          depthWrite: false
      });
      
      this.firefliesMesh = new THREE.InstancedMesh(geo, mat, this.maxFireflies);
      this.firefliesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      
      const dummy = new THREE.Object3D();
      
      for (let i = 0; i < this.maxFireflies; i++) {
          // Random positions within a 5m box centered around player
          const pos = new THREE.Vector3(
              (Math.random() - 0.5) * 5.0,
              0.3 + Math.random() * 2.0,
              (Math.random() - 0.5) * 5.0
          );
          
          // Random drift velocities (very slow and gentle)
          const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.15,
              (Math.random() - 0.5) * 0.1,
              (Math.random() - 0.5) * 0.15
          );
          
          const baseScale = 0.6 + Math.random() * 0.8;
          const flickerSpeed = 2.0 + Math.random() * 5.0;
          const flickerOffset = Math.random() * Math.PI * 2.0;
          
          this.fireflyData.push({
              pos,
              vel,
              baseScale,
              flickerSpeed,
              flickerOffset,
              wanderTime: Math.random() * 2.0
          });
          
          dummy.position.copy(pos);
          dummy.scale.setScalar(baseScale);
          dummy.updateMatrix();
          this.firefliesMesh.setMatrixAt(i, dummy.matrix);
      }
      
      this.world.createTransformEntity(this.firefliesMesh);
      this.firefliesMesh.visible = false; // Hide on init during onboarding
  }

  private updateFireflies(dt: number) {
      const isDomainActive = !!(window as any).minimapTableVisible;
      
      if (isDomainActive) {
          if (this.firefliesMesh.visible) {
              this.firefliesMesh.visible = false;
          }
          return;
      }
      
      if (!this.firefliesMesh.visible) {
          this.firefliesMesh.visible = true;
      }
      
      const dummy = new THREE.Object3D();
      const playerPos = this.scratchV3_1;
      this.player.head.getWorldPosition(playerPos);
      playerPos.y = 1.0; // Center vertical anchor
      
      for (let i = 0; i < this.maxFireflies; i++) {
          const f = this.fireflyData[i];
          
          // Gentle wander logic
          f.wanderTime -= dt;
          if (f.wanderTime <= 0) {
              f.wanderTime = 1.0 + Math.random() * 3.0;
              f.vel.x += (Math.random() - 0.5) * 0.05;
              f.vel.y += (Math.random() - 0.5) * 0.03;
              f.vel.z += (Math.random() - 0.5) * 0.05;
              f.vel.clampLength(0.02, 0.12); // Keep them slow
          }
          
          // Drift position
          f.pos.addScaledVector(f.vel, dt);
          
          // Keep fireflies within a 3.5m radius from the player
          const distToPlayer = f.pos.distanceTo(playerPos);
          if (distToPlayer > 3.5) {
              // Steer gently back
              const steer = this.scratchV3_2.subVectors(playerPos, f.pos).normalize().multiplyScalar(0.04);
              f.vel.add(steer);
          }
          
          // Height constraints to prevent them clipping into floor
          if (f.pos.y < 0.15) {
              f.pos.y = 0.15;
              f.vel.y *= -1;
          } else if (f.pos.y > 2.5) {
              f.pos.y = 2.5;
              f.vel.y *= -1;
          }
          
          // Organic breathing glow/flicker
          const sinFactor = Math.sin(this.floatTime * f.flickerSpeed + f.flickerOffset);
          const flickerScale = f.baseScale * (0.2 + 0.8 * Math.abs(sinFactor));
          
          dummy.position.copy(f.pos);
          dummy.scale.setScalar(flickerScale);
          dummy.updateMatrix();
          this.firefliesMesh.setMatrixAt(i, dummy.matrix);
      }
      
      this.firefliesMesh.instanceMatrix.needsUpdate = true;
  }

  private initTutorialThread() {
      // Cylinder with 1.5mm radius
      const cylGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 1.0, 8);
      // Cyberpunk cyan glow material
      const cylMat = new THREE.MeshBasicMaterial({
          color: 0x00f3ff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false
      });
      this.tutorialThreadMesh = new THREE.Mesh(cylGeo, cylMat);
      this.tutorialThreadMesh.visible = false;
      this.world.createTransformEntity(this.tutorialThreadMesh);

      this.tutorialThreadTextCard = this.createTutorialTextCard();
      this.tutorialThreadTextCard.visible = false;
      this.world.createTransformEntity(this.tutorialThreadTextCard);
  }

  private createTutorialTextCard(): THREE.Mesh {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;

      // Glassmorphic capsule background
      ctx.fillStyle = 'rgba(10, 25, 40, 0.75)';
      
      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
      };
      
      // Cyberpunk glowing neon border
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 3;
      roundRect(4, 4, 248, 56, 12);
      ctx.fill();
      ctx.stroke();

      // Text with drop shadow
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
      ctx.fillText('JUGNU', 128, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide
      });

      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), mat);
      return card;
  }

  private updateLeftHandTutorialThread(dt: number) {
      if (this.threadCooldownTimer > 0) {
          this.threadCooldownTimer -= dt;
          if (this.tutorialThreadMesh) this.tutorialThreadMesh.visible = false;
          if (this.tutorialThreadTextCard) this.tutorialThreadTextCard.visible = false;
          return;
      }

      const hasIndex = this.getJointWorldData('left', 'index-finger-tip', this.leftIndexTipWorld);
      const hasThumb = this.getJointWorldData('left', 'thumb-tip', this.leftThumbTipWorld);

      if (hasIndex && hasThumb) {
          const distance = this.leftIndexTipWorld.distanceTo(this.leftThumbTipWorld);

          if (distance >= 0.025) {
              if (this.tutorialThreadMesh) this.tutorialThreadMesh.visible = true;
              if (this.tutorialThreadTextCard) this.tutorialThreadTextCard.visible = true;

              const center = this.scratchV3_1.addVectors(this.leftIndexTipWorld, this.leftThumbTipWorld).multiplyScalar(0.5);
              
              if (this.tutorialThreadMesh) {
                  this.tutorialThreadMesh.position.copy(center);
                  this.tutorialThreadMesh.scale.set(1, distance, 1);
                  
                  const direction = this.scratchV3_2.subVectors(this.leftThumbTipWorld, this.leftIndexTipWorld).normalize();
                  this.tutorialThreadMesh.quaternion.setFromUnitVectors(this.scratchV3_3.set(0, 1, 0), direction);
              }

              if (this.tutorialThreadTextCard) {
                  this.tutorialThreadTextCard.position.copy(center);
                  
                  const pulse = 1.0 + Math.sin(this.floatTime * 4.0) * 0.08;
                  this.tutorialThreadTextCard.scale.set(pulse, pulse, pulse);

                  // Calculate orientation: Lock normal to camera, Lock horizontal along thread
                  const playerPos = this.scratchV3_2;
                  this.player.head.getWorldPosition(playerPos);
                  
                  const normal = this.scratchV3_3.subVectors(playerPos, center).normalize();
                  const dirX = this.scratchV3_2.subVectors(this.leftThumbTipWorld, this.leftIndexTipWorld).normalize();
                  
                  const dirY = new THREE.Vector3().crossVectors(normal, dirX).normalize();
                  const orthoX = new THREE.Vector3().crossVectors(dirY, normal).normalize();
                  
                  const m = this.scratchMatrix;
                  m.makeBasis(orthoX, dirY, normal);
                  this.tutorialThreadTextCard.quaternion.setFromRotationMatrix(m);
              }
          } else {
              if (this.tutorialThreadMesh) this.tutorialThreadMesh.visible = false;
              if (this.tutorialThreadTextCard) this.tutorialThreadTextCard.visible = false;

              if (!this.hasLeftPinchCompleted) {
                  this.hasLeftPinchCompleted = true;
                  console.log("[Tutorial] Left hand index & thumb pinch tutorial completed!");
                  const source = this.input.getPrimaryInputSource('left');
                  if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                      source.gamepad.hapticActuators[0].pulse(1.0, 100);
                  }
              }
          }
      } else {
          if (this.tutorialThreadMesh) this.tutorialThreadMesh.visible = false;
          if (this.tutorialThreadTextCard) this.tutorialThreadTextCard.visible = false;
      }
  }

  private static readonly SPOKES = [
      { label: "CHAT",       type: "CHAT",        angle: -Math.PI / 2 },     // 12:00
      { label: "TUTORIAL",   type: "TUTORIAL",    angle: -Math.PI / 4 },     // 1:30
      { label: "MINIMAP",    type: "STADIUM",     angle: 0 },                // 3:00
      { label: "VENUE",      type: "STADIUM_SEL", angle: Math.PI / 4 },      // 4:30
      { label: "LOCK",       type: "LOCK",        angle: Math.PI / 2 },      // 6:00
      { label: "VOICE",      type: "VOICE",       angle: 3 * Math.PI / 4 },  // 7:30
      { label: "DONT TOUCH", type: "DEBUG",       angle: Math.PI },          // 9:00
      { label: "WALLS",      type: "WALLS",       angle: -3 * Math.PI / 4 }  // 10:30
  ];

  private static readonly SPOKE_DETAILS: Record<string, { title: string, detail: string }> = {
      "CHAT": {
          title: "CHAT LOGS",
          detail: "Conversational transcript & debug diagnostics pipeline."
      },
      "TUTORIAL": {
          title: "TUTORIAL",
          detail: "Holographic manual showing gesture control steps."
      },
      "STADIUM": {
          title: "MINIMAP",
          detail: "Toggles the 3D tactical minimap table in front of you."
      },
      "STADIUM_SEL": {
          title: "VENUE",
          detail: "Select from Wankhede, Nürburgring, or other stadiums."
      },
      "LOCK": {
          title: "GRID LOCK",
          detail: "Locks/unlocks companion's rigid spatial anchor point."
      },
      "VOICE": {
          title: "VOICE INPUT",
          detail: "Speech synthesis and AI query voice detection pipeline."
      },
      "DEBUG": {
          title: "DONT TOUCH",
          detail: "Cyberpunk system developer log console."
      },
      "WALLS": {
          title: "ROOM WALLS",
          detail: "Visualizes detected physical room planes and meshes."
      }
  };

  private static readonly ACTION_SPOKES = [
      { label: "PLAY SEQ", type: "PLAY",  angle: -Math.PI / 2 },     // 12:00
      { label: "STORM",    type: "STORM", angle: 0 },                // 3:00
      { label: "NAVIG",    type: "NAVIG", angle: Math.PI / 2 },      // 6:00
      { label: "CLEAR",    type: "CLEAR", angle: Math.PI }           // 9:00
  ];

  private static readonly ACTION_SPOKE_DETAILS: Record<string, { title: string, detail: string }> = {
      "PLAY": {
          title: "PLAY SEQUENCE",
          detail: "Trigger the stadium's spatial replay event simulation."
      },
      "STORM": {
          title: "WEATHER MODE",
          detail: "Cycle atmospheric effects (Rain, Neon Dust, Clear)."
      },
      "NAVIG": {
          title: "NAVIGATION",
          detail: "Toggle highlighting of stadium landmarks and paths."
      },
      "CLEAR": {
          title: "CLEAR SYSTEMS",
          detail: "Reset all active sequences, weather effects, and physics."
      }
  };

  private wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
              ctx.fillText(line, x, currentY);
              line = words[n] + ' ';
              currentY += lineHeight;
          } else {
              line = testLine;
          }
      }
      ctx.fillText(line, x, currentY);
  }

  private drawIconImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number, color: string) {
      if (!this.iconTintCtx) return;
      const tc = this.iconTintCanvas;
      const tCtx = this.iconTintCtx;
      
      tCtx.clearRect(0, 0, tc.width, tc.height);
      tCtx.drawImage(img, 0, 0, size, size);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = color;
      tCtx.fillRect(0, 0, size, size);
      tCtx.globalCompositeOperation = 'source-over';
      
      ctx.drawImage(tc, 0, 0, size, size, cx - size / 2, cy - size / 2, size, size);
  }

  private redrawCompassGrid(hoveredIdx: number) {
      const ctx = this.compassBackingCtx;
      const w = 512;
      const h = 512;

      const moodColorHex = '#' + this.animatedMoodColor.getHexString();

      // 1. Clear offscreen canvases and tint backgrounds
      if (this.outerBgCanvas) {
          const oCtx = this.outerTintCtx;
          oCtx.clearRect(0, 0, 512, 512);
          oCtx.drawImage(this.outerBgCanvas, 0, 0, 512, 512);
          
          oCtx.globalCompositeOperation = 'source-in';
          oCtx.fillStyle = moodColorHex;
          oCtx.fillRect(0, 0, 512, 512);
          
          oCtx.globalCompositeOperation = 'multiply';
          oCtx.drawImage(this.outerBgCanvas, 0, 0, 512, 512);
          
          oCtx.globalCompositeOperation = 'source-over';
      }

      if (this.innerBgCanvas) {
          const iCtx = this.innerTintCtx;
          const size = 240;
          const x = 256 - size / 2;
          const y = 256 - size / 2;
          iCtx.clearRect(0, 0, 512, 512);
          iCtx.drawImage(this.innerBgCanvas, x, y, size, size);
          
          iCtx.globalCompositeOperation = 'source-in';
          iCtx.fillStyle = moodColorHex;
          iCtx.fillRect(x, y, size, size);
          
          iCtx.globalCompositeOperation = 'multiply';
          iCtx.drawImage(this.innerBgCanvas, x, y, size, size);
          
          iCtx.globalCompositeOperation = 'source-over';
      }

      // 2. Clear main canvas and render backgrounds
      ctx.clearRect(0, 0, w, h);
      if (this.outerBgCanvas) {
          ctx.globalAlpha = 0.40; // 40% opacity for outer template
          ctx.drawImage(this.outerTintCanvas, 0, 0);
          ctx.globalAlpha = 1.0;
      } else {
          // Fallback dark circular shape
          ctx.fillStyle = 'rgba(5, 5, 20, 0.40)';
          ctx.beginPath();
          ctx.arc(256, 256, 240, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = moodColorHex;
          ctx.lineWidth = 4;
          ctx.stroke();
      }

      if (this.innerBgCanvas) {
          ctx.globalAlpha = 0.80; // Inner template at 80% opacity
          ctx.drawImage(this.innerTintCanvas, 0, 0);
          ctx.globalAlpha = 1.0;
      } else {
          // Fallback inner dark circular screen
          ctx.fillStyle = 'rgba(10, 10, 30, 0.80)';
          ctx.beginPath();
          ctx.arc(256, 256, 110, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = moodColorHex;
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      // 3. Draw radial spokes (complementary circles, bold white vector icons, labels)
      const R = 180;
      const compColorHex = '#' + this.animatedCompColor.getHexString();
      
      JugnuSystem.SPOKES.forEach((spoke, idx) => {
          const cx = 256 + R * Math.cos(spoke.angle);
          const cy = 256 + R * Math.sin(spoke.angle);

          // 3a. Draw complementary color background circle (static position)
          ctx.fillStyle = compColorHex;
          ctx.beginPath();
          ctx.arc(cx, cy - 8, 40, 0, 2 * Math.PI);
          ctx.fill();

          // 3b. Determine active and border states
          let activeBorder = false;
          let borderColor = moodColorHex;
          
          if (spoke.type === 'CHAT' && this.isChatOpen) activeBorder = true;
          else if (spoke.type === 'TUTORIAL' && this.isTutorialOpen) activeBorder = true;
          else if (spoke.type === 'STADIUM_SEL' && this.isStadiumMenuOpen) activeBorder = true;
          else if (spoke.type === 'DEBUG' && this.isDebugOpen) activeBorder = true;
          else if (spoke.type === 'WALLS' && (window as any).showRoomWalls) activeBorder = true;
          else if (spoke.type === 'LOCK' && this.isGridLocked) {
              activeBorder = true;
              borderColor = '#22c55e'; // Green for locked
          }

          // 3c. Draw outer primary mood color border (ring) if active or hovered (static position)
          if (activeBorder || hoveredIdx === idx) {
              ctx.strokeStyle = borderColor;
              ctx.lineWidth = hoveredIdx === idx ? 5 : 3;
              ctx.beginPath();
              ctx.arc(cx, cy - 8, hoveredIdx === idx ? 45 : 43, 0, 2 * Math.PI);
              ctx.stroke();
          }

          // Compute dynamic hover float offset for the vector icons inside the circles
          let hoverOffset = 0;
          if (hoveredIdx === idx) {
              hoverOffset = Math.sin(this.floatTime * 6.0) * 4.0;
          }
          const iconY = cy - 8 + hoverOffset;

          // 3d. Render vector icons in bold white
          ctx.lineWidth = 4;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const iconImg = this.iconImages[spoke.type];
          if (iconImg) {
              const iconColor = activeBorder || hoveredIdx === idx ? (spoke.type === 'LOCK' && this.isGridLocked ? '#22c55e' : moodColorHex) : '#ffffff';
              this.drawIconImage(ctx, iconImg, cx, iconY, 32, iconColor);
          } else {
              if (spoke.type === 'LOCK') {
                  ctx.strokeStyle = '#ffffff';
                  ctx.beginPath();
                  ctx.arc(cx, iconY - 6, 9, Math.PI, 0);
                  ctx.lineTo(cx + 9, iconY + 3);
                  ctx.moveTo(cx - 9, iconY - 6);
                  ctx.lineTo(cx - 9, iconY + 3);
                  ctx.stroke();
                  ctx.fillStyle = '#ffffff';
                  ctx.beginPath();
                  ctx.roundRect(cx - 13.5, iconY, 27, 18, 4.5);
                  ctx.fill();
                  ctx.fillStyle = compColorHex;
                  ctx.beginPath();
                  ctx.arc(cx, iconY + 7.5, 3, 0, 2 * Math.PI);
                  ctx.fill();
              } else if (spoke.type === 'DEBUG') {
                  ctx.fillStyle = '#ffffff';
                  ctx.strokeStyle = '#ffffff';
                  ctx.beginPath();
                  ctx.roundRect(cx - 19.5, iconY - 13.5, 39, 27, 6);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 12, iconY - 6);
                  ctx.lineTo(cx - 6, iconY);
                  ctx.lineTo(cx - 12, iconY + 6);
                  ctx.stroke();
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(cx - 1.5, iconY + 3, 9, 4.5);
              } else if (spoke.type === 'CHAT') {
                  ctx.beginPath();
                  ctx.roundRect(cx - 18, iconY - 12, 36, 24, 6);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 6, iconY + 12);
                  ctx.lineTo(cx - 12, iconY + 20);
                  ctx.lineTo(cx - 12, iconY + 12);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                  
                  ctx.fillStyle = compColorHex;
                  ctx.beginPath();
                  ctx.arc(cx - 7.5, iconY, 2.25, 0, 2 * Math.PI);
                  ctx.arc(cx, iconY, 2.25, 0, 2 * Math.PI);
                  ctx.arc(cx + 7.5, iconY, 2.25, 0, 2 * Math.PI);
                  ctx.fill();
              } else if (spoke.type === 'STADIUM') {
                  ctx.beginPath();
                  ctx.ellipse(cx, iconY, 21, 10.5, 0, 0, 2 * Math.PI);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 21, iconY); ctx.lineTo(cx - 21, iconY + 12);
                  ctx.moveTo(cx + 21, iconY); ctx.lineTo(cx + 21, iconY + 12);
                  ctx.stroke();
              } else if (spoke.type === 'TUTORIAL') {
                  ctx.beginPath();
                  ctx.roundRect(cx - 18, iconY - 12, 36, 24, 3);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx, iconY - 12);
                  ctx.lineTo(cx, iconY + 12);
                  ctx.stroke();
              } else if (spoke.type === 'VOICE') {
                  ctx.beginPath();
                  ctx.roundRect(cx - 6, iconY - 15, 12, 24, 6);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(cx, iconY - 3, 12, 0, Math.PI);
                  ctx.moveTo(cx, iconY + 9); ctx.lineTo(cx, iconY + 15);
                  ctx.stroke();
              } else if (spoke.type === 'STADIUM_SEL') {
                  ctx.beginPath();
                  ctx.arc(cx, iconY + 6, 18, Math.PI, 0);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx - 18, iconY + 6); ctx.lineTo(cx - 18, iconY + 15);
                  ctx.moveTo(cx + 18, iconY + 6); ctx.lineTo(cx + 18, iconY + 15);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(cx, iconY + 1.5, 4.5, 0, 2 * Math.PI);
                  ctx.fill();
              } else if (spoke.type === 'WALLS') {
                  ctx.beginPath();
                  ctx.arc(cx, iconY, 15, 0.15 * Math.PI, 1.85 * Math.PI);
                  ctx.stroke();
                  ctx.fillStyle = ctx.strokeStyle;
                  ctx.beginPath();
                  ctx.moveTo(cx + 21, iconY + 4.5);
                  ctx.lineTo(cx + 12, iconY - 4.5);
                  ctx.lineTo(cx + 30, iconY - 4.5);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                  ctx.fillStyle = '#ffffff';
              }
          }

          // 3e. Draw spoke label text in primary mood color if active/hovered, else white
          ctx.fillStyle = activeBorder || hoveredIdx === idx ? (spoke.type === 'LOCK' && this.isGridLocked ? '#22c55e' : moodColorHex) : '#ffffff';
          ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(spoke.label, cx, cy + 52);
      });

      // 4. Draw Center Display screen details
      let activeSpokeType = "";
      if (hoveredIdx >= 0 && hoveredIdx < JugnuSystem.SPOKES.length) {
          activeSpokeType = JugnuSystem.SPOKES[hoveredIdx].type;
      } else if (this.activeCompassTileIndex >= 0 && this.activeCompassTileIndex < JugnuSystem.SPOKES.length) {
          activeSpokeType = JugnuSystem.SPOKES[this.activeCompassTileIndex].type;
      }

      const activeDetails = activeSpokeType ? JugnuSystem.SPOKE_DETAILS[activeSpokeType] : null;
      const displayTitle = activeDetails ? activeDetails.title : this.centerTitle;
      const displayDetail = activeDetails ? activeDetails.detail : this.centerDetail;

      ctx.fillStyle = moodColorHex;
      ctx.font = 'bold 20px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayTitle, 256, 215);

      ctx.fillStyle = '#ffffff'; // Change to pure white for ultra-readability
      ctx.font = 'bold 12px "Segoe UI", system-ui, -apple-system, sans-serif';
      this.wrapCanvasText(ctx, displayDetail, 256, 242, 180, 16);

      this.compassBackingTexture.needsUpdate = true;
  }

  private makeBlackTransparentCanvas(image: HTMLImageElement): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const luma = Math.max(r, g, b);
          if (luma < 15) {
              data[i+3] = 0;
          } else if (luma < 40) {
              data[i+3] = (luma - 15) * 10;
          }
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas;
  }

  private initCompassUI() {
      // Pre-allocate scratch canvas for zero-GC icon tinting
      this.iconTintCanvas = document.createElement('canvas');
      this.iconTintCanvas.width = 64;
      this.iconTintCanvas.height = 64;
      this.iconTintCtx = this.iconTintCanvas.getContext('2d')!;

      // Preload high-fidelity PNG icons from public/ui/Icons/
      const iconsToLoad = {
          CHAT: './ui/Icons/chat (1).png',
          TUTORIAL: './ui/Icons/tutorial (1).png',
          STADIUM: './ui/Icons/MINIMAP.png',
          STADIUM_SEL: './ui/Icons/venue (1).png',
          VOICE: './ui/Icons/voice (1).png',
          WALLS: './ui/Icons/walls.png',
          PLAY: './ui/Icons/play seq (1).png',
          STORM: './ui/Icons/storm (1).png',
          NAVIG: './ui/Icons/navigation (1).png',
          CLEAR: './ui/Icons/clear (1).png'
      };

      for (const [key, path] of Object.entries(iconsToLoad)) {
          const img = new Image();
          img.src = path;
          img.onload = () => {
              this.iconImages[key] = img;
              // Redraw the active compass UI components once loaded
              this.redrawCompassGrid(this.hoveredCellIndex);
              if (this.actionCompassGroup) {
                  this.redrawActionCompass(this.actionHoveredSpokeIndex);
              }
          };
      }

      this.compassGroup = new THREE.Group();
      this.compassGroup.position.set(0, 0.07, 0); 
      this.compassGroup.scale.setScalar(0.001);
      this.compassGroup.visible = false;

      const compassGroupEntity = this.world.createTransformEntity(this.compassGroup);

      const backingGeom = new THREE.PlaneGeometry(0.15, 0.15); 

      this.compassBackingCanvas = document.createElement('canvas');
      this.compassBackingCanvas.width = 512;
      this.compassBackingCanvas.height = 512;
      this.compassBackingCtx = this.compassBackingCanvas.getContext('2d')!;
      
      this.compassBackingTexture = new THREE.CanvasTexture(this.compassBackingCanvas);
      this.compassBackingTexture.colorSpace = THREE.SRGBColorSpace;

      const backingMat = this.createHolographicMaterial(this.compassBackingTexture, 1.0);
      this.compassBackingBoard = new THREE.Mesh(backingGeom, backingMat);
      this.compassGroup.add(this.compassBackingBoard);

      // Initialize Tint Offscreen Canvases for zero-allocation composite tinting
      this.outerTintCanvas = document.createElement('canvas');
      this.outerTintCanvas.width = 512;
      this.outerTintCanvas.height = 512;
      this.outerTintCtx = this.outerTintCanvas.getContext('2d')!;

      this.innerTintCanvas = document.createElement('canvas');
      this.innerTintCanvas.width = 512;
      this.innerTintCanvas.height = 512;
      this.innerTintCtx = this.innerTintCanvas.getContext('2d')!;

      // Load Background Images
      const outerImg = new Image();
      outerImg.src = './textures/CompassUiOuter.png';
      outerImg.onload = () => {
          this.outerBgCanvas = this.makeBlackTransparentCanvas(outerImg);
          this.redrawCompassGrid(this.hoveredCellIndex);
          if (this.actionCompassGroup) {
              this.redrawActionCompass(this.actionHoveredSpokeIndex);
          }
      };

      const innerImg = new Image();
      innerImg.src = './textures/CompassUiInner.png';
      innerImg.onload = () => {
          this.innerBgCanvas = this.makeBlackTransparentCanvas(innerImg);
          this.redrawCompassGrid(this.hoveredCellIndex);
          if (this.actionCompassGroup) {
              this.redrawActionCompass(this.actionHoveredSpokeIndex);
          }
      };

      // Initialize Chat Tab UI
      this.compassChatCanvas = document.createElement('canvas');
      this.compassChatCanvas.width = 768;
      this.compassChatCanvas.height = 576;
      this.compassChatCtx = this.compassChatCanvas.getContext('2d')!;

      this.compassChatTexture = new THREE.CanvasTexture(this.compassChatCanvas);
      this.compassChatTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassChatMat = this.createHolographicMaterial(this.compassChatTexture, 0.0);

      this.compassChatCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.54, 0.405),
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
      this.compassDebugCanvas.width = 768;
      this.compassDebugCanvas.height = 576;
      this.compassDebugCtx = this.compassDebugCanvas.getContext('2d')!;

      this.compassDebugTexture = new THREE.CanvasTexture(this.compassDebugCanvas);
      this.compassDebugTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassDebugMat = this.createHolographicMaterial(this.compassDebugTexture, 0.0);

      this.compassDebugCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.54, 0.405),
          this.compassDebugMat
      );
      this.compassDebugCard.position.set(0, -0.02, 0.0); // Z slides to -0.04 when open
      this.compassDebugCard.scale.setScalar(0.001); // Shrink initially
      this.compassGroup.add(this.compassDebugCard);

      // Draw initial debug screen
      this.redrawCompassDebug();

      // Initialize Tutorial Tab UI
      this.compassTutorialCanvas = document.createElement('canvas');
      this.compassTutorialCanvas.width = 768;
      this.compassTutorialCanvas.height = 576;
      this.compassTutorialCtx = this.compassTutorialCanvas.getContext('2d')!;

      this.compassTutorialTexture = new THREE.CanvasTexture(this.compassTutorialCanvas);
      this.compassTutorialTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassTutorialMat = this.createHolographicMaterial(this.compassTutorialTexture, 0.0);

      this.compassTutorialCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.54, 0.405),
          this.compassTutorialMat
      );
      this.compassTutorialCard.position.set(0, -0.02, -0.01);
      this.compassTutorialCard.scale.setScalar(0.001); // Shrink initially
      this.compassGroup.add(this.compassTutorialCard);

      const tutorialCardEntity = this.world.createTransformEntity(this.compassTutorialCard, compassGroupEntity);

      // Initialize Tutorial Tabs
      this.tutorialTabs.forEach((tab, i) => {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 96;
          
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          
          const mat = this.createHolographicMaterial(texture, 1.0);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05), mat);
          
          // Position relative to parent compassTutorialCard
          mesh.position.set(tab.x, tab.y, 0.002);
          
          this.compassTutorialCard.add(mesh);
          
          tab.canvas = canvas;
          tab.texture = texture;
          tab.mesh = mesh;

          // Register tab mesh as an interactable entity for raycast selection from afar with parent entity linkage
          this.world.createTransformEntity(mesh, tutorialCardEntity)
              .addComponent(Interactable)
              .addComponent(TutorialTabRef, { index: i })
              .addComponent(PhysicsShape, {
                  shape: PhysicsShapeType.Box,
                  dimensions: [0.14, 0.05, 0.01],
                  restitution: 0.0,
                  friction: 0.0,
                  density: 1.0
              })
              .addComponent(PhysicsBody, {
                  state: PhysicsState.Kinematic,
                  gravityFactor: 0.0
              });
          
          // Initial draw
          this.redrawTutorialTabMesh(i, false, false);
      });

      // Initialize Stadium Selector Tab UI — curved venue selector concentric with compass
      this.compassStadiumCanvas = document.createElement('canvas');
      this.compassStadiumCanvas.width = 600;
      this.compassStadiumCanvas.height = 600;
      this.compassStadiumCtx = this.compassStadiumCanvas.getContext('2d')!;

      this.compassStadiumTexture = new THREE.CanvasTexture(this.compassStadiumCanvas);
      this.compassStadiumTexture.colorSpace = THREE.SRGBColorSpace;

      this.compassStadiumMat = this.createHolographicMaterial(this.compassStadiumTexture, 0.0);
      this.compassStadiumMat.blending = THREE.NormalBlending;

      // Concentric PlaneGeometry(0.30, 0.30)
      this.compassStadiumCard = new THREE.Mesh(
          new THREE.PlaneGeometry(0.30, 0.30),
          this.compassStadiumMat
      );
      this.compassStadiumCard.position.set(0, 0.0, -0.01);
      this.compassStadiumCard.scale.setScalar(0.001);
      this.compassGroup.add(this.compassStadiumCard);

      // Preload venue images — canvas redraws once each arrives
      const imageSrcs = [
          '/textures/wankde.jpg',
          '/textures/olympia.jpg',
          '/textures/crytpo.jpg',
          '/textures/butterfly park.avif',
          '/textures/nuburning 24h.jpg',
      ];
      imageSrcs.forEach((src, i) => {
          const img = new Image();
          img.onload = () => {
              this.stadiumImages[i] = img;
              if (this.isStadiumMenuOpen) this.redrawCompassStadiumMenu();
          };
          img.src = src;
      });

      this.redrawCompassStadiumMenu();

      // Preload tab frame images
      const chatImg = new Image();
      chatImg.onload = () => {
          this.chatFrameCanvas = this.preprocessFrameImage(chatImg);
          this.redrawCompassChat();
      };
      chatImg.src = '/textures/ChatTab.png';

      const debugImg = new Image();
      debugImg.onload = () => {
          this.debugFrameCanvas = this.preprocessFrameImage(debugImg);
          this.redrawCompassDebug();
      };
      debugImg.src = '/textures/DebugTab.png';

      const tutorialImg = new Image();
      tutorialImg.onload = () => {
          this.tutorialFrameCanvas = this.preprocessFrameImage(tutorialImg);
          let currentStep = 0;
          this.queries.jugnu.entities.forEach(entity => {
              currentStep = entity.getValue(Jugnu, "instructionStep") as number;
          });
          this.redrawCompassTutorial(currentStep);
      };
      tutorialImg.src = '/textures/TutorialTab.png';

      // Draw initial grid
      this.redrawCompassGrid(-1);

      // Initialize Action Compass UI subsystem
      this.initActionCompassUI();

      this.initLockIcon();
  }

  private initLockIcon() {
      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = 128;
      mainCanvas.height = 128;
      const ctx = mainCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 128);
      
      ctx.strokeStyle = '#22c55e'; // Green lock
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(64, 48, 20, Math.PI, 0);
      ctx.lineTo(84, 68);
      ctx.moveTo(44, 48);
      ctx.lineTo(44, 68);
      ctx.stroke();
      
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.roundRect(34, 68, 60, 40, 8);
      ctx.fill();
      
      ctx.fillStyle = '#05050f';
      ctx.beginPath();
      ctx.arc(64, 84, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillRect(61, 84, 6, 14);

      const leftCanvas = document.createElement('canvas');
      leftCanvas.width = 64;
      leftCanvas.height = 128;
      const ctxLeft = leftCanvas.getContext('2d')!;
      ctxLeft.drawImage(mainCanvas, 0, 0, 64, 128, 0, 0, 64, 128);

      const rightCanvas = document.createElement('canvas');
      rightCanvas.width = 64;
      rightCanvas.height = 128;
      const ctxRight = rightCanvas.getContext('2d')!;
      ctxRight.drawImage(mainCanvas, 64, 0, 64, 128, 0, 0, 64, 128);

      const leftTex = new THREE.CanvasTexture(leftCanvas);
      leftTex.colorSpace = THREE.SRGBColorSpace;
      const rightTex = new THREE.CanvasTexture(rightCanvas);
      rightTex.colorSpace = THREE.SRGBColorSpace;

      this.lockLeftMat = this.createHolographicMaterial(leftTex, 1.0);
      this.lockRightMat = this.createHolographicMaterial(rightTex, 1.0);

      this.lockLeftMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.036), this.lockLeftMat);
      this.lockLeftMesh.position.set(-0.009, 0, 0);

      this.lockRightMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.036), this.lockRightMat);
      this.lockRightMesh.position.set(0.009, 0, 0);

      this.lockIconGroup = new THREE.Group();
      this.lockIconGroup.add(this.lockLeftMesh);
      this.lockIconGroup.add(this.lockRightMesh);
      this.lockIconGroup.visible = false;

      this.world.createTransformEntity(this.lockIconGroup);

  }

  private initActionCompassUI() {
      this.actionCompassGroup = new THREE.Group();
      this.actionCompassGroup.position.set(0.11, -0.06, 0.0);
      this.actionCompassGroup.scale.setScalar(0.001); // starts shrunk
      this.actionCompassGroup.visible = false;
      this.compassGroup.add(this.actionCompassGroup);

      const backingGeom = new THREE.PlaneGeometry(0.10, 0.10);

      this.actionBackingCanvas = document.createElement('canvas');
      this.actionBackingCanvas.width = 512;
      this.actionBackingCanvas.height = 512;
      this.actionBackingCtx = this.actionBackingCanvas.getContext('2d')!;

      this.actionBackingTexture = new THREE.CanvasTexture(this.actionBackingCanvas);
      this.actionBackingTexture.colorSpace = THREE.SRGBColorSpace;

      this.actionHolographicMat = this.createHolographicMaterial(this.actionBackingTexture, 1.0);
      this.actionBackingBoard = new THREE.Mesh(backingGeom, this.actionHolographicMat);
      this.actionCompassGroup.add(this.actionBackingBoard);

      this.actionOuterTintCanvas = document.createElement('canvas');
      this.actionOuterTintCanvas.width = 512;
      this.actionOuterTintCanvas.height = 512;
      this.actionOuterTintCtx = this.actionOuterTintCanvas.getContext('2d')!;

      this.actionInnerTintCanvas = document.createElement('canvas');
      this.actionInnerTintCanvas.width = 512;
      this.actionInnerTintCanvas.height = 512;
      this.actionInnerTintCtx = this.actionInnerTintCanvas.getContext('2d')!;

      this.redrawActionCompass(-1);
  }

  private redrawActionCompass(hoveredIdx: number) {
      const ctx = this.actionBackingCtx;
      if (!ctx) return;
      const w = 512;
      const h = 512;
      const moodColorHex = '#' + this.animatedMoodColor.getHexString();
      const compColorHex = '#' + this.animatedCompColor.getHexString();

      if (this.outerBgCanvas) {
          const oCtx = this.actionOuterTintCtx;
          oCtx.clearRect(0, 0, 512, 512);
          oCtx.drawImage(this.outerBgCanvas, 0, 0, 512, 512);
          oCtx.globalCompositeOperation = 'source-in';
          oCtx.fillStyle = moodColorHex;
          oCtx.fillRect(0, 0, 512, 512);
          oCtx.globalCompositeOperation = 'multiply';
          oCtx.drawImage(this.outerBgCanvas, 0, 0, 512, 512);
          oCtx.globalCompositeOperation = 'source-over';
      }

      if (this.innerBgCanvas) {
          const iCtx = this.actionInnerTintCtx;
          const size = 240;
          const x = 256 - size / 2;
          const y = 256 - size / 2;
          iCtx.clearRect(0, 0, 512, 512);
          iCtx.drawImage(this.innerBgCanvas, x, y, size, size);
          iCtx.globalCompositeOperation = 'source-in';
          iCtx.fillStyle = moodColorHex;
          iCtx.fillRect(x, y, size, size);
          iCtx.globalCompositeOperation = 'multiply';
          iCtx.drawImage(this.innerBgCanvas, x, y, size, size);
          iCtx.globalCompositeOperation = 'source-over';
      }

      ctx.clearRect(0, 0, w, h);
      if (this.outerBgCanvas) {
          ctx.globalAlpha = 0.40;
          ctx.drawImage(this.actionOuterTintCanvas, 0, 0);
          ctx.globalAlpha = 1.0;
      } else {
          ctx.fillStyle = 'rgba(5, 5, 20, 0.40)';
          ctx.beginPath();
          ctx.arc(256, 256, 240, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = moodColorHex;
          ctx.lineWidth = 4;
          ctx.stroke();
      }

      if (this.innerBgCanvas) {
          ctx.globalAlpha = 0.80;
          ctx.drawImage(this.actionInnerTintCanvas, 0, 0);
          ctx.globalAlpha = 1.0;
      } else {
          ctx.fillStyle = 'rgba(10, 10, 30, 0.80)';
          ctx.beginPath();
          ctx.arc(256, 256, 110, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = moodColorHex;
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      const R = 180;
      JugnuSystem.ACTION_SPOKES.forEach((spoke, idx) => {
          const cx = 256 + R * Math.cos(spoke.angle);
          const cy = 256 + R * Math.sin(spoke.angle);

          let themeColor = '#ffffff';
          if (spoke.type === 'PLAY') themeColor = '#ff00ff';
          else if (spoke.type === 'STORM') themeColor = '#6366f1';
          else if (spoke.type === 'NAVIG') themeColor = '#ff5500';
          else if (spoke.type === 'CLEAR') themeColor = '#ff3333';

          ctx.fillStyle = compColorHex;
          ctx.beginPath();
          ctx.arc(cx, cy - 8, 40, 0, 2 * Math.PI);
          ctx.fill();

          ctx.strokeStyle = themeColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy - 8, 40, 0, 2 * Math.PI);
          ctx.stroke();

          let isActive = false;
          if (spoke.type === 'PLAY') {
              isActive = !!(window as any).isMinimapSportSequenceActive?.();
          } else if (spoke.type === 'STORM') {
              const weatherMode = (window as any).getMinimapWeatherMode?.();
              isActive = (weatherMode && weatherMode !== 'off');
          } else if (spoke.type === 'NAVIG') {
              isActive = !!(window as any).isMinimapNavigationActive?.();
          }

          if (hoveredIdx === idx || isActive) {
              ctx.strokeStyle = themeColor;
              ctx.lineWidth = hoveredIdx === idx ? 5 : 3;
              ctx.beginPath();
              ctx.arc(cx, cy - 8, hoveredIdx === idx ? 45 : 43, 0, 2 * Math.PI);
              ctx.stroke();
          }

          let hoverOffset = 0;
          if (hoveredIdx === idx) {
              hoverOffset = Math.sin(this.actionFloatTime * 6.0) * 4.0;
          }
          const iconY = cy - 8 + hoverOffset;

          ctx.lineWidth = 4;
          ctx.strokeStyle = '#ffffff';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const iconImg = this.iconImages[spoke.type];
          if (iconImg) {
              const iconColor = hoveredIdx === idx || isActive ? themeColor : '#ffffff';
              this.drawIconImage(ctx, iconImg, cx, iconY, 32, iconColor);
          } else {
              if (spoke.type === 'PLAY') {
                  ctx.beginPath();
                  ctx.moveTo(cx - 8, iconY - 12);
                  ctx.lineTo(cx + 12, iconY);
                  ctx.lineTo(cx - 8, iconY + 12);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
              } else if (spoke.type === 'STORM') {
                  ctx.beginPath();
                  ctx.arc(cx - 6, iconY + 2, 7, 0.5 * Math.PI, 1.5 * Math.PI);
                  ctx.arc(cx, iconY - 4, 9, 1.0 * Math.PI, 2.0 * Math.PI);
                  ctx.arc(cx + 6, iconY + 2, 7, 1.5 * Math.PI, 0.5 * Math.PI);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
              } else if (spoke.type === 'NAVIG') {
                  ctx.beginPath();
                  ctx.moveTo(cx, iconY - 14);
                  ctx.lineTo(cx + 11, iconY + 11);
                  ctx.lineTo(cx, iconY + 5);
                  ctx.lineTo(cx - 11, iconY + 11);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
              } else if (spoke.type === 'CLEAR') {
                  ctx.beginPath();
                  ctx.moveTo(cx - 10, iconY - 10);
                  ctx.lineTo(cx + 10, iconY + 10);
                  ctx.moveTo(cx + 10, iconY - 10);
                  ctx.lineTo(cx - 10, iconY + 10);
                  ctx.stroke();
              }
          }

          ctx.fillStyle = hoveredIdx === idx || isActive ? themeColor : '#ffffff';
          ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(spoke.label, cx, cy + 55);
      });

      let activeSpokeType = "";
      if (hoveredIdx >= 0 && hoveredIdx < JugnuSystem.ACTION_SPOKES.length) {
          activeSpokeType = JugnuSystem.ACTION_SPOKES[hoveredIdx].type;
      }

      const activeDetails = activeSpokeType ? JugnuSystem.ACTION_SPOKE_DETAILS[activeSpokeType] : null;
      const displayTitle = activeDetails ? activeDetails.title : "ACTION DECK";
      const displayDetail = activeDetails ? activeDetails.detail : "Stadium control compass UI. Dwell focus to trigger.";

      ctx.fillStyle = hoveredIdx >= 0 && activeSpokeType ? (
          activeSpokeType === 'PLAY' ? '#ff00ff' :
          activeSpokeType === 'STORM' ? '#6366f1' :
          activeSpokeType === 'NAVIG' ? '#ff5500' : '#ff3333'
      ) : '#00ffff';
      ctx.font = 'bold 28px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayTitle, 256, 210);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Segoe UI", system-ui, -apple-system, sans-serif';
      this.wrapCanvasText(ctx, displayDetail, 256, 248, 180, 20);

      this.actionBackingTexture.needsUpdate = true;
  }

  private executeActionSpoke(type: string, activeTip: THREE.Vector3) {
      const spatialFX = (window as any).spatialFX;
      if (spatialFX) {
          spatialFX.playPositionalSound('click', activeTip);
          let sparkColor = 0x00ffff;
          if (type === 'PLAY') sparkColor = 0xff00ff;
          else if (type === 'STORM') sparkColor = 0x6366f1;
          else if (type === 'NAVIG') sparkColor = 0xff5500;
          else if (type === 'CLEAR') sparkColor = 0xff3333;
          spatialFX.triggerSpark(activeTip, new THREE.Color(sparkColor), 15);
      }

      if (type === 'PLAY') {
          (window as any).triggerMinimapSportSequence?.();
          this.queries.jugnu.entities.forEach(e => {
              if (e.getValue(Jugnu, "instructionStep") === 4) {
                  e.setValue(Jugnu, "instructionStep", 5);
              }
          });
      } else if (type === 'STORM') {
          (window as any).cycleMinimapWeather?.();
          this.queries.jugnu.entities.forEach(e => {
              if (e.getValue(Jugnu, "instructionStep") === 5) {
                  e.setValue(Jugnu, "instructionStep", 6);
              }
          });
      } else if (type === 'NAVIG') {
          (window as any).toggleMinimapNavigation?.();
      } else if (type === 'CLEAR') {
          (window as any).clearMinimapSystems?.();
      }
  }


  private handleCompassTileClick(tileIndex: number) {
      console.log(`[Compass] Clicked spoke index: ${tileIndex}`);

      const tileType = JugnuSystem.SPOKES[tileIndex]?.type || "";
      let title = "";
      let detail = "";

      if (tileType === 'CHAT') {
          this.isChatOpen = !this.isChatOpen;
          title = this.isChatOpen ? "Transcript & Chat" : "Transcript & Chat";
          if (this.isChatOpen) {
              this.isTutorialOpen = false;
              this.isDebugOpen = false;
              this.isStadiumMenuOpen = false;
              this.lastOpenedTab = 'CHAT';
              this.redrawCompassChat();
              detail = "Dynamic Chat Panel slides behind Jugnu.\n\nStatus: ACTIVE VIEW.\nDisplays recent conversational transcripts and active debug telemetry log lines.";
          } else {
              detail = "Dynamic Chat Panel retracted.\n\nStatus: STANDBY.\nRedraw compass board grid.";
          }
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'STADIUM') {
          title = "Tactical Minimap";
          (window as any).triggerMinimapToggle = true;
          detail = "Minimap Stadium Table toggled.\n\nStatus: Toggled successfully!\nCheck for the 3D desk in front of you.";
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'TUTORIAL') {
          this.isTutorialOpen = !this.isTutorialOpen;
          title = this.isTutorialOpen ? "Holographic Tutorial" : "Holographic Tutorial";
          if (this.isTutorialOpen) {
              this.isChatOpen = false;
              this.isDebugOpen = false;
              this.isStadiumMenuOpen = false;
              this.lastOpenedTab = 'TUTORIAL';
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
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'VOICE') {
          title = "Gemini AI Voice";
          detail = this.isListening ? "Voice pipeline: STANDBY.\n\nMicrophone bounds: CLOSED.\nSpeak request completed." : "Voice pipeline: ACTIVE.\n\nMicrophone bounds: LISTENING...\nSpeak your prompt now.";
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);

          // Activate/toggle recording pipeline
          if (this.isListening) {
             if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                 this.mediaRecorder.stop();
             }
          } else if (!this.isProcessingAudio) {
             if (this.synth && this.synth.speaking) {
                this.synth.cancel();
             }
             this.startRecording().catch(err => console.error("Voice recording start failed:", err));
          }
      } else if (tileType === 'DEBUG') {
          this.isDebugOpen = !this.isDebugOpen;
          title = this.isDebugOpen ? "Debug Console" : "Debug Console";
          if (this.isDebugOpen) {
              this.isChatOpen = false;
              this.isTutorialOpen = false;
              this.isStadiumMenuOpen = false;
              this.lastOpenedTab = 'DEBUG';
              this.redrawCompassDebug();
              detail = "Blue Cyberpunk Debug Console active behind Jugnu.\n\nStatus: ACTIVE VIEW.\nHooks to console log streams and shows realtime engine diagnostics.";
          } else {
              detail = "Debug Console retracted.\n\nStatus: STANDBY.\nGrid view updated.";
          }
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'STADIUM_SEL') {
          this.isStadiumMenuOpen = !this.isStadiumMenuOpen;
          title = this.isStadiumMenuOpen ? "Stadium Selector" : "Stadium Selector";
          if (this.isStadiumMenuOpen) {
              this.isChatOpen = false;
              this.isTutorialOpen = false;
              this.isDebugOpen = false;
              this.lastOpenedTab = 'STADIUM_SEL';
              this.redrawCompassStadiumMenu();
              detail = "Stadium Geometry Selector active.\n\nStatus: ACTIVE VIEW.\nSelect between Default, Berlin (Hollow Cylinder), and Inuit (Oval) geometries.";
          } else {
              detail = "Stadium Selector retracted.\n\nStatus: STANDBY.\nGrid view updated.";
          }
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'WALLS') {
          // Toggle room wall visualizer
          (window as any).showRoomWalls = !((window as any).showRoomWalls ?? false);
          const wallsVisible = (window as any).showRoomWalls as boolean;
          title = wallsVisible ? "Room Walls ON" : "Room Walls OFF";
          detail = wallsVisible
              ? "Room Wall Visualization: ENABLED.\n\nWhite edge lines are now visible on all detected surfaces and planes."
              : "Room Wall Visualization: DISABLED.\n\nSurface edge lines hidden. Clean AR mode active.";
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      } else if (tileType === 'LOCK') {
          this.isGridLocked = !this.isGridLocked;
          title = this.isGridLocked ? "Grid Locked" : "Grid Unlocked";
          
          if (this.isGridLocked) {
              this.interactionState = 'Anchored';
              const isPinchingLeft = this.getPinchData('left', this.leftPinchTip);
              this.lockPinchAllowed = !isPinchingLeft; // lock permission check
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
              this.setExpression(2); // Happy orange expression!
              detail = "Compass Grid Unlocked.\n\nStatus: FREE FLOATING.\nClosing delay of 2.0s restored upon pinch release.";
          }

          // Trigger spatial audio and sparks for lock toggles
          const spatialFX = (window as any).spatialFX;
          if (spatialFX) {
              spatialFX.playPositionalSound(this.isGridLocked ? 'lockBreak' : 'click', this.centerPos);
              spatialFX.triggerSpark(this.centerPos, this.isGridLocked ? new THREE.Color(0x22c55e) : new THREE.Color(0x00ffcc), 15);
          }
          
          this.centerTitle = title;
          this.centerDetail = detail;
          this.redrawCompassGrid(this.hoveredCellIndex);
      }
  }

  private preprocessFrameImage(img: HTMLImageElement): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 384;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 512, 384);
      
      const imgData = ctx.getImageData(0, 0, 512, 384);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const maxVal = Math.max(r, g, b);
          if (maxVal < 45) {
              data[i+3] = Math.round(data[i+3] * (maxVal / 45.0));
          }
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas;
  }

  private redrawCompassStadiumMenu(hoveredIdx: number = -1) {
      const ctx = this.compassStadiumCtx;
      const w = 600, h = 600;
      ctx.clearRect(0, 0, w, h);

      const startAngle = -165 * Math.PI / 180;
      const endAngle = -15 * Math.PI / 180;

      // 1. Dark glass ribbon/arc background
      ctx.strokeStyle = 'rgba(5, 5, 26, 0.40)';
      ctx.lineWidth = 90;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(300, 300, 210, startAngle, endAngle);
      ctx.stroke();

      // 2. Cyan neon borders
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 8;
      
      // Outer neon border at R=255
      ctx.beginPath();
      ctx.arc(300, 300, 255, startAngle, endAngle);
      ctx.stroke();

      // Inner neon border at R=165
      ctx.beginPath();
      ctx.arc(300, 300, 165, startAngle, endAngle);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset glow

      // 3. Inner subtle border
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(300, 300, 251, startAngle, endAngle);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(300, 300, 169, startAngle, endAngle);
      ctx.stroke();

      const venues: { key: string; name: string; sub: string; img: HTMLImageElement | null }[] = [
          { key: 'default',     name: 'WANKHEDE',   sub: 'Mumbai, India',        img: this.stadiumImages[0] },
          { key: 'berlin',      name: 'OLYMPIA',    sub: 'Berlin, Germany',      img: this.stadiumImages[1] },
          { key: 'inuit',       name: 'CRYPTO',     sub: 'Los Angeles, USA',     img: this.stadiumImages[2] },
          { key: 'butterflies', name: 'BUTTERFLY',  sub: 'Immersive 360°',       img: this.stadiumImages[3] },
          { key: 'nurburgring', name: 'NÜRBURGRING',sub: 'Nürburg, Germany',     img: this.stadiumImages[4] },
      ];

      const targetAngles = [
          -160 * Math.PI / 180,
          -125 * Math.PI / 180,
          -90 * Math.PI / 180,
          -55 * Math.PI / 180,
          -20 * Math.PI / 180
      ];

      venues.forEach((venue, i) => {
          const angleRad = targetAngles[i];
          const cx = 300 + 210 * Math.cos(angleRad);
          const cy = 300 + 210 * Math.sin(angleRad);

          const isSelected = this.selectedStadium === venue.key;
          const isHovered  = hoveredIdx === i;
          const iconRadius = 32;

          // Tile background (placeholder color while image loads)
          ctx.fillStyle = 'rgba(34,211,238,0.06)';
          ctx.beginPath();
          ctx.arc(cx, cy, iconRadius, 0, 2 * Math.PI);
          ctx.fill();

          // Draw image — center-cropped to circle
          const img = venue.img;
          if (img && img.naturalWidth > 0) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, iconRadius, 0, 2 * Math.PI);
              ctx.clip();
              const iw = img.naturalWidth, ih = img.naturalHeight;
              let sx = 0, sy = 0, sw = iw, sh = ih;
              if (iw > ih) { sw = ih; sx = (iw - ih) / 2; }
              else         { sh = iw; sy = (ih - iw) / 2; }
              ctx.drawImage(img, sx, sy, sw, sh, cx - iconRadius, cy - iconRadius, iconRadius * 2, iconRadius * 2);
              ctx.restore();
          }

          // Hover / selection tint overlay
          if (isSelected) {
              ctx.fillStyle = 'rgba(34,211,238,0.28)';
              ctx.beginPath();
              ctx.arc(cx, cy, iconRadius, 0, 2 * Math.PI);
              ctx.fill();
          } else if (isHovered) {
              ctx.fillStyle = 'rgba(255,255,255,0.14)';
              ctx.beginPath();
              ctx.arc(cx, cy, iconRadius, 0, 2 * Math.PI);
              ctx.fill();
          }

          // Circle border
          ctx.strokeStyle = isSelected ? '#22d3ee' : (isHovered ? 'rgba(34,211,238,0.75)' : 'rgba(34,211,238,0.25)');
          ctx.lineWidth = isSelected ? 3 : 1.5;
          ctx.shadowColor = isSelected ? '#22d3ee' : 'transparent';
          ctx.shadowBlur  = isSelected ? 10 : 0;
          ctx.beginPath();
          ctx.arc(cx, cy, iconRadius, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Selected checkmark badge (top-right relative to icon center)
          if (isSelected) {
              const bx = cx + iconRadius * 0.7;
              const by = cy - iconRadius * 0.7;
              ctx.fillStyle = '#22d3ee';
              ctx.beginPath();
              ctx.arc(bx, by, 9, 0, 2 * Math.PI);
              ctx.fill();

              ctx.fillStyle = '#05050f';
              ctx.font = 'bold 12px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('✓', bx, by + 4);
          }

          // Render name and sub-label text radially centered and rotated
          ctx.save();
          ctx.translate(300, 300);
          ctx.rotate(angleRad + Math.PI / 2);

          // Venue name
          ctx.fillStyle = isSelected ? '#22d3ee' : (isHovered ? '#a5f3fc' : '#67e8f9');
          ctx.font = isSelected ? 'bold 16px monospace' : '15px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(venue.name, 0, -258);

          // Sub-label (city)
          ctx.fillStyle = isSelected ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.4)';
          ctx.font = '11px monospace';
          ctx.fillText(venue.sub, 0, -276);

          ctx.restore();
      });

      this.compassStadiumTexture.needsUpdate = true;
  }

  private redrawTutorialTabMesh(idx: number, isHovered: boolean, isSelected: boolean) {
      const tab = this.tutorialTabs[idx];
      if (!tab || !tab.canvas) return;
      const canvas = tab.canvas;
      const ctx = canvas.getContext('2d')!;
      const w = 256;
      const h = 96;
      ctx.clearRect(0, 0, w, h);

      // Draw glassmorphic background
      ctx.fillStyle = isSelected ? 'rgba(34, 211, 238, 0.25)' : (isHovered ? 'rgba(255, 255, 255, 0.15)' : 'rgba(5, 5, 25, 0.6)');
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 12);
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#22d3ee' : (isHovered ? 'rgba(34, 211, 238, 0.6)' : 'rgba(255, 255, 255, 0.15)');
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 12);
      ctx.stroke();

      // Label text
      ctx.fillStyle = isSelected ? '#22d3ee' : (isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.7)');
      
      // Split text on spaces to wrap neatly on two lines inside the small tab canvas
      const words = tab.label.split(' ');
      ctx.font = 'bold 20px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (words.length > 1) {
          ctx.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), w / 2, h / 2 - 16);
          ctx.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), w / 2, h / 2 + 16);
      } else {
          ctx.fillText(tab.label, w / 2, h / 2);
      }

      tab.texture.needsUpdate = true;
  }

  private setTutorialVideo(step: number) {
      if (!this.tutorialVideo) {
          this.tutorialVideo = document.createElement('video');
          this.tutorialVideo.crossOrigin = 'anonymous';
          this.tutorialVideo.loop = true;
          this.tutorialVideo.muted = true;
          this.tutorialVideo.playsInline = true;
          this.tutorialVideo.autoplay = true;
          this.tutorialVideo.play().catch(() => {});
      }
      
      let src = "./JugnuV4/JugnuPinched.mp4";
      if (step === 1) src = "./JugnuV4/JugnuRotate.mp4";
      else if (step === 2) src = "./JugnuV4/JugnuPinched.mp4";
      else if (step === 3) src = "./JugnuV4/JugnuRotate.mp4";
      else if (step === 4 || step === 5) src = "./360Videos/view1.mp4";
      
      const absSrc = new URL(src, window.location.href).href;
      if (this.tutorialVideo.src !== absSrc) {
          this.tutorialVideo.src = src;
          this.tutorialVideo.load();
          this.tutorialVideo.play().catch(() => {});
      }
  }

  private redrawCompassTutorial(step: number) {
      const ctx = this.compassTutorialCtx;
      const w = 768;
      const h = 576;
      const dx = 128;
      const dy = 96;
      ctx.clearRect(0, 0, w, h);

      // Draw semi-transparent backing board that fits inside the frame
      ctx.fillStyle = 'rgba(5, 5, 25, 0.75)';
      ctx.beginPath();
      ctx.roundRect(dx + 12, dy + 12, w - 2 * dx - 24, h - 2 * dy - 24, 16);
      ctx.fill();

      // Draw preprocessed frame
      if (this.tutorialFrameCanvas) {
          ctx.drawImage(this.tutorialFrameCanvas, 0, 0, w, h);
      } else {
          // Fallback borders while loading
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
      }

      // Console Header text
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("HOLOGRAPHIC TUTORIAL", w / 2, 36 + dy);

      // Divider line
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24 + dx, 48 + dy); ctx.lineTo(w - 24 - dx, 48 + dy);
      ctx.stroke();

      // Current Active Instruction
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`STEP ${step + 1} OF 6`, w / 2, 72 + dy);

      // Ensure video is set
      this.setTutorialVideo(step);

      // Video Frame Box
      const videoW = 240;
      const videoH = 135;
      const videoX = (w - videoW) / 2;
      const videoY = 90 + dy;

      if (this.tutorialVideo && this.tutorialVideo.readyState >= 2) {
          ctx.drawImage(this.tutorialVideo, videoX, videoY, videoW, videoH);
      } else {
          // Loading fallback
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(videoX, videoY, videoW, videoH);
          ctx.fillStyle = '#00ffff';
          ctx.font = '14px monospace';
          ctx.fillText("LOADING VIDEO...", w / 2, videoY + videoH / 2);
      }

      // Cyan neon border
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(videoX, videoY, videoW, videoH);

      let title = "";
      let desc = "";
      if (step === 0) {
          title = "SUMMON COMPASS";
          desc = "Pinch and hold your left index finger and thumb near Jugnu for 2 seconds to summon or dismiss the main holographic Compass UI.";
      } else if (step === 1) {
          title = "ROTATE MINIMAP";
          desc = "Pinch with your middle finger and thumb, then rotate your hand to orient the tactical 3D stadium minimap table.";
      } else if (step === 2) {
          title = "ZOOM MINIMAP";
          desc = "Pinch with the middle fingers of both hands and spread them apart to zoom in, or bring them together to zoom out.";
      } else if (step === 3) {
          title = "ACCESS STADIUMS";
          desc = "Point and pinch the VENUE spoke on the main Compass UI to open the stadium selector, then select a stadium to load it.";
      } else if (step === 4) {
          title = "REPLAY EVENT";
          desc = "Point and pinch the PLAY SEQ spoke on the Action Deck to run high-fidelity replay animations of the sports events.";
      } else if (step === 5) {
          title = "WEATHER UPDATES";
          desc = "Point and pinch the STORM spoke on the Action Deck to cycle through atmospheric and weather styles for the stadium.";
      } else {
          title = "TUTORIAL COMPLETE";
          desc = "All core gestures learned successfully! You are fully configured to operate Jugnu XR Core features. Use the Compass UI for stadium controls at any time.";
      }

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(title, w / 2, 252 + dy);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '14px monospace';
      this.wrapText(desc, w / 2, 280 + dy, 440, 18);

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
      const w = 768;
      const h = 576;
      const dx = 128;
      const dy = 96;
      ctx.clearRect(0, 0, w, h);

      // Draw semi-transparent backing board that fits inside the frame
      ctx.fillStyle = 'rgba(5, 5, 25, 0.75)';
      ctx.beginPath();
      ctx.roundRect(dx + 12, dy + 12, w - 2 * dx - 24, h - 2 * dy - 24, 16);
      ctx.fill();

      // Draw preprocessed frame
      if (this.chatFrameCanvas) {
          ctx.drawImage(this.chatFrameCanvas, 0, 0, w, h);
      } else {
          // Fallback solid border while loading
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.roundRect(0, 0, w, h, 16);
          ctx.stroke();
      }

      // Header Text
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('JUGNU TRANSCRIPT & DEBUG CHAT', w / 2, 34 + dy);

      // Header Divider
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24 + dx, 48 + dy); ctx.lineTo(w - 24 - dx, 48 + dy);
      ctx.stroke();

      // Chat text rendering
      ctx.textAlign = 'left';
      ctx.font = '13px monospace';
      
      let y = 78 + dy;
      const startIdx = Math.max(0, this.chatHistory.length - 12);
      const visibleLines = this.chatHistory.slice(startIdx);

      visibleLines.forEach((line) => {
          if (line.sender === 'You') {
              ctx.fillStyle = '#38bdf8'; // Sky blue
              ctx.fillText('YOU: ', 24 + dx, y);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(line.text, 64 + dx, y);
          } else if (line.sender === 'Jugnu') {
              ctx.fillStyle = '#f97316'; // Orange
              ctx.fillText('JUGNU: ', 24 + dx, y);
              ctx.fillStyle = '#e2e8f0';
              ctx.fillText(line.text, 78 + dx, y);
          } else {
              ctx.fillStyle = '#22c55e'; // Green for system
              ctx.fillText('SYS: ', 24 + dx, y);
              ctx.fillStyle = '#a7f3d0';
              ctx.fillText(line.text, 64 + dx, y);
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
      const w = 768;
      const h = 576;
      const dx = 128;
      const dy = 96;
      ctx.clearRect(0, 0, w, h);

      // Draw semi-transparent backing board that fits inside the frame
      ctx.fillStyle = 'rgba(5, 5, 25, 0.75)';
      ctx.beginPath();
      ctx.roundRect(dx + 12, dy + 12, w - 2 * dx - 24, h - 2 * dy - 24, 16);
      ctx.fill();

      // Draw preprocessed frame
      if (this.debugFrameCanvas) {
          ctx.drawImage(this.debugFrameCanvas, 0, 0, w, h);
      } else {
          // Fallback borders and corner accents while loading
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
      }

      // Console Header text
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("SYSTEM DEBUG CONSOLE", w / 2, 34 + dy);

      // Header Divider
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24 + dx, 48 + dy); ctx.lineTo(w - 24 - dx, 48 + dy);
      ctx.stroke();

      // Print logs
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';

      let y = 78 + dy;
      this.debugHistory.forEach((log) => {
          // Time tag
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillText(`[${log.timestamp}]`, 24 + dx, y);

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

          ctx.fillText(prefix, 100 + dx, y);

          // Log body
          ctx.fillStyle = log.type === 'error' ? '#ff8a80' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(log.text, 150 + dx, y);

          y += 24;
      });

      // Blinking Caret
      const now = Date.now();
      if (Math.floor(now / 500) % 2 === 0) {
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(24 + dx, y - 10, 8, 12);
      }

      this.compassDebugTexture.needsUpdate = true;
  }

  private createHolographicMaterial(texture: THREE.CanvasTexture, initialOpacity: number): THREE.ShaderMaterial {
      const mat = new THREE.ShaderMaterial({
          uniforms: {
              map: { value: texture },
              time: { value: 0.0 },
              opacity: { value: initialOpacity },
              glitchIntensity: { value: 0.0 }
          },
          vertexShader: `
              varying vec2 vUv;
              void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
          `,
          fragmentShader: `
              uniform sampler2D map;
              uniform float time;
              uniform float opacity;
              uniform float glitchIntensity;
              varying vec2 vUv;

              void main() {
                  vec2 uv = vUv;
                  vec4 color;
                  if (glitchIntensity > 0.0) {
                      float shift = glitchIntensity * 0.025 * sin(time * 80.0);
                      float r = texture2D(map, uv + vec2(shift, 0.0)).r;
                      float g = texture2D(map, uv).g;
                      float b = texture2D(map, uv - vec2(shift, 0.0)).b;
                      float a = texture2D(map, uv).a;
                      color = vec4(r, g, b, a);
                  } else {
                      color = texture2D(map, uv);
                  }

                  // Moving horizontal scanlines
                  float scanline = sin(uv.y * 320.0 - time * 12.0) * 0.06;
                  color.rgb *= (1.0 - abs(scanline));

                  // Faint vignette edge
                  float vignette = uv.x * (1.0 - uv.x) * uv.y * (1.0 - uv.y) * 16.0;
                  vignette = pow(vignette, 0.25);
                  color.rgb *= mix(0.78, 1.0, vignette);

                  gl_FragColor = vec4(color.rgb, color.a * opacity);
              }
          `,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide
      });
      this.holographicMaterials.push(mat);
      return mat;
  }
}

