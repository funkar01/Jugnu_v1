import { createComponent, createSystem, Pressed, Vector3 } from "@iwsdk/core";
import type { JugnuV3Model, Mood } from "./JugnuV3Model.js";
import * as THREE from "three";

// Replace this URL when deploying, or use VITE_BACKEND_URL in .env
// Example: const BACKEND_URL = "https://jugnu-backend.vercel.app/api/gemini";
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || "/api/gemini";

export const Jugnu = createComponent("Jugnu", {});

export class JugnuSystem extends createSystem({
  jugnu: { required: [Jugnu] },
  jugnuClicked: { required: [Jugnu, Pressed] },
}) {

  private recognition: any;
  private isListening = false;
  private synth!: SpeechSynthesis;
  private pulseTime = 0;
  private floatTime = 0;
  private basePositions = new Map<any, THREE.Vector3>();
  private baseQuats = new Map<any, THREE.Quaternion>();
  private baseScales = new Map<any, THREE.Vector3>();
  private interactDecay = 0;
  
  // For facing tracking
  private lookAtTarget!: Vector3;
  private vec3!: Vector3;

  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();
    

    // Initialize Speech Synthesis
    this.synth = window.speechSynthesis;
    
    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onstart = () => {
        this.isListening = true;
        console.log("Jugnu is listening...");
      };
      
      this.recognition.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        console.log("User said:", text);
        await this.handleQuery(text);
      };
      
      this.recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        this.isListening = false;
      };
      
      this.recognition.onend = () => {
        this.isListening = false;
      };
    } else {
      console.warn("Speech Recognition API not supported in this browser.");
    }
    
    // Handle Click
    this.queries.jugnuClicked.subscribe("qualify", (entity) => {
      this.interactDecay = 8.0; // Stay focused on the user for 8 seconds upon click
      
      const jugModel = entity.object3D as JugnuV3Model;
      if (jugModel && typeof jugModel.setMood === 'function') {
         jugModel.setMood('surprised'); // Trigger alert state
      }
      
      // Toggle listening
      if (!this.isListening && this.recognition) {
        // Prevent race conditions where button rapid-fires before onstart event
        this.isListening = true;

        // Stop currently speaking if we click it
        if (this.synth && this.synth.speaking) {
           this.synth.cancel();
        }
        try {
          this.recognition.start();
        } catch (e) {
          console.error("Could not start recognition", e);
          this.isListening = false;
        }
      }
    });
  }

  async handleQuery(text: string) {
    if (!text.trim()) return;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = apiKey 
        ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        : BACKEND_URL;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `You are Jugnu, a friendly, concise robotic avatar companion in a WebVR environment. Keep your responses short and conversational. At the very end of your response, please append exactly one mood tag from this list based on the sentiment of your reply: [MOOD: happy], [MOOD: sad], [MOOD: angry], [MOOD: surprised], [MOOD: sleepy]. The user says: "${text}"` }]
          }]
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "Unknown Gemini API Error");
      }
      
      let reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
         let mood: Mood = 'happy';
         const moodMatch = reply.match(/\[MOOD:\s*(happy|sad|angry|surprised|sleepy)\]/i);
         if (moodMatch) {
             mood = moodMatch[1].toLowerCase() as Mood;
         }
         // Clean out the tag so it isn't spoken aloud
         reply = reply.replace(/\[MOOD:\s*[a-zA-Z]+\]/gi, '').trim();

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

  update(dt: number) {
    this.floatTime += dt;
    
    if (this.interactDecay > 0) {
      this.interactDecay -= dt;
    }
    const shouldFaceUser = this.isListening || (this.synth && this.synth.speaking) || this.interactDecay > 0;

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
      
      // Lively 3D floating movement
      obj.position.x = basePos.x + Math.sin(this.floatTime * 1.5) * 0.03;
      obj.position.y = basePos.y + Math.sin(this.floatTime * 2.0) * 0.05;
      obj.position.z = basePos.z + Math.cos(this.floatTime * 1.2) * 0.03;

      // Strict billboarding (always face user)
      this.player.head.getWorldPosition(this.lookAtTarget);
      obj.getWorldPosition(this.vec3);
      
      const dx = this.lookAtTarget.x - this.vec3.x;
      const dz = this.lookAtTarget.z - this.vec3.z;
      const targetYaw = Math.atan2(dx, dz);
      
      const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetYaw, 0));
      obj.quaternion.slerp(targetQ, dt * 10.0);

      // Visual Feedback: pulse if listening
      if (this.isListening) {
        this.pulseTime += dt;
        const pulse = 1.0 + Math.sin(this.pulseTime * 5) * 0.1;
        obj.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z * pulse);
        // Intensity for deeper core glowing
        jugModel.pulseIntensity = Math.abs(Math.sin(this.pulseTime * 5));
      } else {
        this.pulseTime = 0;
        // Smooth base scale return
        obj.scale.lerp(baseScale, 0.1);
        jugModel.pulseIntensity = 0;
      }
    });
  }
}

