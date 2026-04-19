import { createComponent, createSystem, Pressed, Vector3 } from "@iwsdk/core";


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
  private basePositions = new Map<any, number>();
  
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
      // Toggle listening
      if (!this.isListening && this.recognition) {
        // Stop currently speaking if we click it
        if (this.synth && this.synth.speaking) {
           this.synth.cancel();
        }
        try {
          this.recognition.start();
        } catch (e) {
          console.error("Could not start recognition", e);
        }
      }
    });
  }

  async handleQuery(text: string) {
    if (!text.trim()) return;
    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `You are Jugnu, a friendly, concise robotic avatar companion in a WebVR environment. Keep your responses short and conversational. The user says: "${text}"` }]
          }]
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "Unknown Gemini API Error");
      }
      
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
         this.speak(reply);
      }
    } catch (e) {
      console.error("Gemini Error:", e);
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
    this.queries.jugnu.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj) return;
      
      // Floating animation
      if (!this.basePositions.has(entity)) {
        this.basePositions.set(entity, obj.position.y);
      }
      const baseY = this.basePositions.get(entity)!;
      obj.position.y = baseY + Math.sin(this.floatTime * 2) * 0.05;

      // Face User
      this.player.head.getWorldPosition(this.lookAtTarget);
      obj.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y; 
      obj.lookAt(this.lookAtTarget);
      
      // Jugu1 model's geometric forward might be offset (e.g. built facing X instead of Z).
      // We apply an offset so the face looks at the user. 
      // If it looks backwards, this can be changed to Math.PI / 2.
      obj.rotateY(-Math.PI / 2);

      // Visual Feedback: pulse if listening
      if (this.isListening) {
        this.pulseTime += dt;
        const scale = 1.0 + Math.sin(this.pulseTime * 5) * 0.1;
        obj.scale.set(scale, scale, scale);
      } else {
        this.pulseTime = 0;
        // Smooth base scale return (assuming base scale is 1.0)
        obj.scale.lerp(new Vector3(1, 1, 1), 0.1);
      }
    });
  }
}
