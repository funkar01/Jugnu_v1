import { createComponent, createSystem, Pressed, Vector3, PhysicsBody, PhysicsState, PhysicsManipulation } from "@iwsdk/core";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import { JugnuTranscriptBoard } from "./JugnuTranscriptBoard.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
// Example: const BACKEND_URL = "https://jugnu-backend.vercel.app/api/gemini";
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || "/api/gemini";

export const Jugnu = createComponent("Jugnu", {});
export const TranscriptUI = createComponent("TranscriptUI", {});

export class JugnuSystem extends createSystem({
  jugnu: { required: [Jugnu] },
  jugnuClicked: { required: [Jugnu, Pressed] },
  transcriptBoard: { required: [TranscriptUI] },
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

  // For Pinch Interaction
  private interactionState: 'Idle' | 'LerpingToHand' | 'Attached' = 'Idle';
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

  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();
    this.headQuat = new THREE.Quaternion();
    this.headPos = new THREE.Vector3();

    // Initialize Speech Synthesis
    this.synth = window.speechSynthesis;
    
    // Handle Click
    this.queries.jugnuClicked.subscribe("qualify", async (entity) => {
      this.interactDecay = 8.0; // Stay focused on the user for 8 seconds upon click
      
      const jugModel = entity.object3D as JugnuV3Model;
      if (jugModel && typeof jugModel.setMood === 'function') {
         jugModel.setMood('surprised'); // Trigger alert state
      }
      
      // Toggle listening
      if (this.isListening) {
         // Manual stop if clicked while listening
         if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
             console.log("Manual stop triggered.");
             this.mediaRecorder.stop();
         }
      } else if (!this.isProcessingAudio) {
        // Stop currently speaking if we click it
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

  async startRecording() {
     try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.isListening = true;
        this.updateTranscriptUI("Listening...", "");
        
        this.audioChunks = [];
        this.silenceTimer = 0;
        this.listenTimer = 0;

        // Setup MediaRecorder
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
           console.log("Audio recording stopped, processing...");

           // Clean up microphone stream immediately
           stream.getTracks().forEach(track => track.stop());
           if (this.audioContext) {
               await this.audioContext.close();
               this.audioContext = null;
               this.analyser = null;
           }

           const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
           // Convert blob to base64
           const base64Audio = await this.blobToBase64(audioBlob);
           this.audioChunks = [];
           
           if (base64Audio) {
               // Extract base64 without the data URL prefix e.g., "data:audio/webm;base64,..."
               const base64Data = base64Audio.split(',')[1];
               if (base64Data) {
                   await this.handleAudioQuery(base64Data);
               }
           }
           this.isProcessingAudio = false;
        };

        // Setup Analyser for silence detection
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        this.mediaRecorder.start();
        console.log("Jugnu is listening via MediaRecorder...");
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
              { text: `You are Jugnu, a friendly, concise robotic avatar companion in a WebVR environment. Keep your responses short and conversational. The user provided an audio message. Please transcribe and respond appropriately to their intent.\n\nFormat your exact response like this:\nTRANSCRIPT: [what you heard the user say]\nREPLY: [your conversational answer]\n\nAt the very end of your REPLY, please append exactly one mood tag from this list based on the sentiment: [MOOD: happy], [MOOD: sad], [MOOD: angry], [MOOD: surprised], [MOOD: sleepy].` },
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

         // Attempt to parse explicit TRANSCRIPT and REPLY markers
         const tMatch = rawText.match(/TRANSCRIPT:\s*([\s\S]*?)\nREPLY:\s*([\s\S]*)/i);
         if (tMatch) {
             transcript = tMatch[1].trim();
             reply = tMatch[2].trim();
         }

         let mood: Mood = 'happy';
         const moodMatch = reply.match(/\[MOOD:\s*(happy|sad|angry|surprised|sleepy)\]/i);
         if (moodMatch) {
             mood = moodMatch[1].toLowerCase() as Mood;
         }
         // Clean out the tag so it isn't spoken aloud
         reply = reply.replace(/\[MOOD:\s*[a-zA-Z]+\]/gi, '').trim();

         // Broadcast to the UI
         this.updateTranscriptUI(transcript, reply);

         // Broadcast the parsed mood to the active Jugnu model
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
      // Let Jugnu show sad mood if API fails
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
     console.log("Jugnu says:", text);
     if (this.synth && this.synth.speaking) {
         this.synth.cancel();
     }
     if (this.synth) {
         const utterance = new SpeechSynthesisUtterance(text);
         this.synth.speak(utterance);
     } else {
         console.warn("Speech Synthesis is not supported or accessible on this device. Cannot speak:", text);
     }
  }

  // Simple 1D value noise for smooth wandering
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
    if (!source || !source.hand || !this.xrFrame) return false;
    
    const indexTip = source.hand.get('index-finger-tip');
    const thumbTip = source.hand.get('thumb-tip');
    if (!indexTip || !thumbTip) return false;

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return false;

    const indexPose = this.xrFrame.getJointPose(indexTip, refSpace);
    const thumbPose = this.xrFrame.getJointPose(thumbTip, refSpace);
    
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
    
    if (this.interactDecay > 0) {
      this.interactDecay -= dt;
    }
    const shouldFaceUser = this.isListening || (this.synth && this.synth.speaking) || this.interactDecay > 0;

    // --- Pinch State Machine ---
    const isPinchingLeft = this.getPinchData('left', this.leftPinchTip);
    const isPinchingRight = this.getPinchData('right', this.rightPinchTip);

    if (this.interactionState === 'Idle') {
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
            // Grab the first Jugnu entity's position
            for (const entity of this.queries.jugnu.entities) {
                activeJugnuPos.copy(entity.object3D.position);
                break;
            }
            
            const dist = activeJugnuPos.distanceTo(activeTip);
            if (this.alwaysAttractOnPinch || dist < this.attractionRadius) {
                this.interactionState = 'LerpingToHand';
                this.attachedHand = activeHand;
                this.startPos.copy(activeJugnuPos);
                this.targetPos.copy(activeTip);
                this.lerpTime = 0;
                this.velocity.set(0, 0, 0);

                // Make it Kinematic so we can manipulate it with our spring logic
                this.queries.jugnu.entities.forEach(e => {
                    if (e.hasComponent(PhysicsBody)) {
                        e.removeComponent(PhysicsBody);
                    }
                    e.addComponent(PhysicsBody, {
                        state: PhysicsState.Kinematic,
                        gravityFactor: 0.0,
                    });
                });
            }
        }
    } else if (this.interactionState === 'LerpingToHand') {
        const isPinching = this.attachedHand === 'left' ? isPinchingLeft : isPinchingRight;
        const currentTip = this.attachedHand === 'left' ? this.leftPinchTip : this.rightPinchTip;
        
        if (!isPinching) {
            this.interactionState = 'Idle';
            this.attachedHand = null;
            
            this.queries.jugnu.entities.forEach(entity => {
                this.basePositions.set(entity, entity.object3D.position.clone());
                // Make it Dynamic again and throw it
                if (entity.hasComponent(PhysicsBody)) {
                    entity.removeComponent(PhysicsBody);
                }
                entity.addComponent(PhysicsBody, {
                    state: PhysicsState.Dynamic,
                    gravityFactor: 1.0,
                    linearDamping: 0.1,
                    angularDamping: 0.1,
                });
                entity.addComponent(PhysicsManipulation, {
                    linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z]
                });
            });
            this.velocity.set(0, 0, 0);
        } else {
            this.lerpTime += dt;
            this.targetPos.copy(currentTip);
            if (this.lerpTime >= this.lerpDuration) {
                this.interactionState = 'Attached';
            }
        }
    } else if (this.interactionState === 'Attached') {
        const isPinching = this.attachedHand === 'left' ? isPinchingLeft : isPinchingRight;
        const currentTip = this.attachedHand === 'left' ? this.leftPinchTip : this.rightPinchTip;
        
        if (!isPinching) {
            this.interactionState = 'Idle';
            this.attachedHand = null;
            
            this.queries.jugnu.entities.forEach(entity => {
                this.basePositions.set(entity, entity.object3D.position.clone());
                // Make it Dynamic again and throw it
                if (entity.hasComponent(PhysicsBody)) {
                    entity.removeComponent(PhysicsBody);
                }
                entity.addComponent(PhysicsBody, {
                    state: PhysicsState.Dynamic,
                    gravityFactor: 1.0,
                    linearDamping: 0.1,
                    angularDamping: 0.1,
                });
                entity.addComponent(PhysicsManipulation, {
                    linearVelocity: [this.velocity.x, this.velocity.y, this.velocity.z]
                });
            });
            this.velocity.set(0, 0, 0);
        } else {
            this.targetPos.copy(currentTip);
        }
    }

    this.wasPinchingLeft = isPinchingLeft;
    this.wasPinchingRight = isPinchingRight;
    // --- End Pinch State Machine ---

    // Silence detection logic
    if (this.isListening && this.analyser && this.mediaRecorder?.state === "recording") {
        this.listenTimer += dt;
        
        // Hard timeout: stop after 8 seconds of listening no matter what
        if (this.listenTimer > 8.0) {
             console.log("Max listening time reached, stopping recording");
             this.mediaRecorder.stop();
             this.listenTimer = 0;
        } else {
             const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
             this.analyser.getByteFrequencyData(dataArray);
             
             let maxVolume = 0;
             for (let i = 0; i < dataArray.length; i++) {
                 if (dataArray[i] > maxVolume) {
                     maxVolume = dataArray[i];
                 }
             }

             // If very quiet (ambient background noise Peak usually < 40 on noisy mics)
             if (maxVolume < 40) {
                 this.silenceTimer += dt;
                 if (this.silenceTimer > 2.0) { // wait 2 seconds of silence before stopping
                     console.log("Silence detected, stopping recording");
                     this.mediaRecorder.stop();
                     this.silenceTimer = 0;
                 }
             } else {
                 this.silenceTimer = 0; // reset silence timer if speaking
             }
        }
    }

    this.queries.jugnu.entities.forEach((entity) => {
      const obj = entity.object3D;
      const jugModel = obj as JugnuV3Model;
      if (!obj || !jugModel || typeof jugModel.update !== 'function') return;
      
      // Tell the procedural model to update its shaders and timing
      jugModel.update(dt);

      // Floating animation on the entity position
      if (!this.basePositions.has(entity)) {
        this.basePositions.set(entity, obj.position.clone());
        this.baseQuats.set(entity, obj.quaternion.clone());
        // Reduce scale to 25%
        obj.scale.setScalar(0.25);
        this.baseScales.set(entity, obj.scale.clone());
      }
      const basePos = this.basePositions.get(entity)!;
      const baseQuat = this.baseQuats.get(entity)!;
      const baseScale = this.baseScales.get(entity)!;
      
      // Adaptive Screen Size
      const targetScale = this.interactionState === 'Idle' ? 0.35 : 0.12;
      this.tempScale.setScalar(targetScale);
      baseScale.lerp(this.tempScale, 4.0 * dt);
      
      if (this.interactionState === 'Idle') {
          // Dynamic physics body logic. 
          // Do not manually update obj.position so the engine can bounce it around the room.
          
          // Optional: Bounds logic is disabled or should be replaced by physical boundaries 
          // (which we now have via the RoomVisualizer!)
      } else if (this.interactionState === 'LerpingToHand') {
          const t = Math.min(this.lerpTime / this.lerpDuration, 1.0);
          const smoothT = t * t * (3 - 2 * t);
          const oldPos = obj.position.clone();
          obj.position.lerpVectors(this.startPos, this.targetPos, smoothT);
          
          // Estimate velocity for tilt
          if (dt > 0.0001) {
              this.velocity.subVectors(obj.position, oldPos).divideScalar(dt);
          }
      } else if (this.interactionState === 'Attached') {
          const hoverTarget = this.targetPos.clone();
          hoverTarget.y += 0.08; // land slightly above pinch

          // Spring physics: F = -k*x - c*v
          const displacement = new THREE.Vector3().subVectors(obj.position, hoverTarget);
          const force = displacement.multiplyScalar(-this.springStiffness);
          force.sub(this.velocity.clone().multiplyScalar(this.springDamping));

          this.velocity.add(force.multiplyScalar(dt));
          obj.position.add(this.velocity.clone().multiplyScalar(dt));
      }

      // Rotate JugnuModel to look at camera, but restrict to yaw and pitch (no roll)
      // and it should be always looking at the user.
      this.player.head.getWorldPosition(this.headPos);
      obj.lookAt(this.headPos);

      // Optional floatiness: tilt towards velocity direction
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

      // Visual Feedback: pulse if listening or processing audio
      if (this.isListening || this.isProcessingAudio) {
        this.pulseTime += dt;
        // Faster pulse if processing, slower if listening
        const speed = this.isProcessingAudio ? 10 : 5;
        // INCREASED PULSE AMPLITUDE to make it very obvious!
        const pulseAmt = this.isProcessingAudio ? 0.05 : 0.25; 
        const pulse = 1.0 + Math.sin(this.pulseTime * speed) * pulseAmt;
        
        obj.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z * pulse);
        // Intensity for deeper core glowing
        jugModel.pulseIntensity = Math.abs(Math.sin(this.pulseTime * speed));
      } else {
        this.pulseTime = 0;
        // Smooth base scale return
        obj.scale.lerp(baseScale, 0.1);
        jugModel.pulseIntensity = 0;
      }
    });
  }
}
