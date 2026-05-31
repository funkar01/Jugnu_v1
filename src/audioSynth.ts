import { IS_DEV } from "./index.js";

export interface SynthParams {
  type?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  startFreq: number;
  endFreq: number;
  duration: number;
  volume: number;
  filterType?: BiquadFilterType;
  startFilterFreq?: number;
  endFilterFreq?: number;
  filterQ?: number;
  modFreq?: number;      // FM modulator frequency
  modDepth?: number;     // FM modulator depth
  noiseType?: 'white' | 'none'; // Noise synthesis
}

export const SYNTH_PRESETS = {
  pinch: {
    startFreq: 360,
    endFreq: 780,
    duration: 0.1,
    volume: 0.16,
    type: 'sine' as const,
    modFreq: 12,
    modDepth: 25
  },
  release: {
    startFreq: 580,
    endFreq: 320,
    duration: 0.15,
    volume: 0.14,
    type: 'sine' as const
  },
  throw: {
    startFreq: 400,
    endFreq: 1350,
    duration: 0.32,
    volume: 0.18,
    type: 'triangle' as const,
    startFilterFreq: 1600,
    endFilterFreq: 600,
    filterType: 'lowpass' as const
  },
  hover: {
    startFreq: 1800,
    endFreq: 1950,
    duration: 0.012,
    volume: 0.04,
    type: 'sine' as const
  },
  click: {
    startFreq: 920,
    endFreq: 1440,
    duration: 0.08,
    volume: 0.12,
    type: 'sine' as const
  },
  compassOpen: {
    startFreq: 261.63, // C4
    endFreq: 1046.50, // C6
    duration: 0.42,
    volume: 0.18,
    type: 'sine' as const,
    startFilterFreq: 250,
    endFilterFreq: 2200,
    filterType: 'bandpass' as const
  },
  compassClose: {
    startFreq: 987.77, // B5
    endFreq: 220.00, // A3
    duration: 0.35,
    volume: 0.15,
    type: 'sine' as const,
    startFilterFreq: 1800,
    endFilterFreq: 300,
    filterType: 'lowpass' as const
  },
  listeningStart: {
    startFreq: 523.25, // C5
    endFreq: 659.25,  // E5
    duration: 0.28,
    volume: 0.18,
    type: 'sine' as const
  },
  listeningProcessing: {
    startFreq: 320,
    endFreq: 440,
    duration: 0.16,
    volume: 0.12,
    type: 'sine' as const,
    modFreq: 35,
    modDepth: 80
  },
  domeExpand: {
    startFreq: 80,
    endFreq: 500,
    duration: 1.4,
    volume: 0.22,
    type: 'triangle' as const,
    startFilterFreq: 100,
    endFilterFreq: 1500,
    filterType: 'bandpass' as const,
    noiseType: 'white' as const
  },
  domeCollapse: {
    startFreq: 450,
    endFreq: 70,
    duration: 0.95,
    volume: 0.2,
    type: 'triangle' as const,
    startFilterFreq: 1500,
    endFilterFreq: 120,
    filterType: 'lowpass' as const,
    noiseType: 'white' as const
  },
  stadiumBounce: {
    startFreq: 95,
    endFreq: 45,
    duration: 0.07,
    volume: 0.28,
    type: 'triangle' as const,
    startFilterFreq: 1000,
    endFilterFreq: 180,
    filterType: 'lowpass' as const
  },
  netSwish: {
    startFreq: 380,
    endFreq: 280,
    duration: 0.18,
    volume: 0.24,
    noiseType: 'white' as const,
    startFilterFreq: 750,
    endFilterFreq: 350,
    filterType: 'bandpass' as const
  },
  fireworkLaunch: {
    startFreq: 120,
    endFreq: 1600,
    duration: 0.55,
    volume: 0.12,
    type: 'sine' as const,
    startFilterFreq: 800,
    endFilterFreq: 3200,
    filterType: 'bandpass' as const
  },
  fireworkBurst: {
    startFreq: 55,
    endFreq: 25,
    duration: 0.85,
    volume: 0.32,
    noiseType: 'white' as const,
    startFilterFreq: 300,
    endFilterFreq: 60,
    filterType: 'lowpass' as const
  },
  morph: {
    startFreq: 250,
    endFreq: 880,
    duration: 0.48,
    volume: 0.16,
    type: 'triangle' as const,
    modFreq: 24,
    modDepth: 75,
    startFilterFreq: 600,
    endFilterFreq: 2200,
    filterType: 'peaking' as const
  },
  scannerSweep: {
    startFreq: 180,
    endFreq: 1350,
    duration: 0.75,
    volume: 0.15,
    type: 'sine' as const,
    startFilterFreq: 250,
    endFilterFreq: 1900,
    filterType: 'bandpass' as const
  }
};

export class JugnuAudioSynth {
  private static ctx: AudioContext | null = null;
  private static masterGain: GainNode | null = null;
  private static noiseBuffer: AudioBuffer | null = null;

  // Active configurations which can be tweaked at runtime
  public static config = { ...SYNTH_PRESETS };

  /**
   * Initializes the synthesizer's AudioContext and structures.
   * Safe to call repeatedly, it is self-guarding.
   */
  public static init(): boolean {
    if (this.ctx) return true;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        if (IS_DEV) console.warn("[AudioSynth] Browser does not support Web Audio API.");
        return false;
      }

      this.ctx = new AudioContextClass();
      
      // Setup master gain node for volume ceiling safety
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Pre-compile 2 seconds of white noise for zero-latency playback
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      if (IS_DEV) console.log("[AudioSynth] Audio context initialized successfully.");
      return true;
    } catch (e) {
      if (IS_DEV) console.error("[AudioSynth] Error initializing context:", e);
      return false;
    }
  }

  /**
   * Resumes the context if suspended (browser security policy).
   */
  public static async resume(): Promise<void> {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        if (IS_DEV) console.warn("[AudioSynth] Context resume failed:", e);
      }
    }
  }

  /**
   * Generic synthesis engine executing pitch sweeps, modulators, and filter sweeps.
   */
  public static play(params: SynthParams) {
    if (!this.ctx) {
      const ok = this.init();
      if (!ok || !this.ctx) return;
    }

    // Auto-resume if needed (in case context was suspended after creation)
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    const t = this.ctx.currentTime;
    const dur = Math.max(0.005, params.duration);

    // 1. Setup envelope gain node
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0, t);
    gainNode.gain.linearRampToValueAtTime(params.volume, t + Math.min(0.015, dur * 0.1));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // 2. Setup audio sources
    let lastNode: AudioNode = gainNode;

    // Filter Node (optional)
    if (params.filterType && params.startFilterFreq !== undefined) {
      const filterNode = this.ctx.createBiquadFilter();
      filterNode.type = params.filterType;
      filterNode.frequency.setValueAtTime(params.startFilterFreq, t);
      if (params.endFilterFreq !== undefined) {
        filterNode.frequency.exponentialRampToValueAtTime(params.endFilterFreq, t + dur);
      }
      filterNode.Q.setValueAtTime(params.filterQ ?? 1.0, t);
      
      gainNode.connect(filterNode);
      lastNode = filterNode;
    }

    // Connect to master output
    if (this.masterGain) {
      lastNode.connect(this.masterGain);
    } else {
      lastNode.connect(this.ctx.destination);
    }

    // Handle noise source
    if (params.noiseType === 'white' && this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      // Loop noise to cover longer sweeps
      noiseSource.loop = true;
      noiseSource.connect(gainNode);
      noiseSource.start(t);
      noiseSource.stop(t + dur);
    }

    // Handle tone source
    const useTone = !params.noiseType || params.noiseType === 'none' || params.startFreq !== params.endFreq;
    if (useTone) {
      const osc = this.ctx.createOscillator();
      osc.type = params.type ?? 'sine';
      osc.frequency.setValueAtTime(params.startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(params.endFreq, t + dur);

      // Setup FM Modulator if parameters are specified (cute Sci-Fi vibratos)
      if (params.modFreq && params.modDepth) {
        const modOsc = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();

        modOsc.frequency.setValueAtTime(params.modFreq, t);
        modGain.gain.setValueAtTime(params.modDepth, t);

        modOsc.connect(modGain);
        modGain.connect(osc.frequency);

        modOsc.start(t);
        modOsc.stop(t + dur);
      }

      osc.connect(gainNode);
      osc.start(t);
      osc.stop(t + dur);
    }
  }

  // --- Convenience Synth Triggers ---

  public static playPinch() {
    this.play(this.config.pinch);
  }

  public static playRelease() {
    this.play(this.config.release);
  }

  public static playThrow() {
    this.play(this.config.throw);
  }

  public static playUIHover() {
    this.play(this.config.hover);
  }

  public static playUIClick() {
    this.play(this.config.click);
  }

  public static playCompassOpen() {
    this.play(this.config.compassOpen);
  }

  public static playCompassClose() {
    this.play(this.config.compassClose);
  }

  public static playListeningStart() {
    // Play dual cute awake sound
    this.play(this.config.listeningStart);
    setTimeout(() => {
      this.play({
        ...this.config.listeningStart,
        startFreq: this.config.listeningStart.endFreq,
        endFreq: this.config.listeningStart.endFreq * 1.2,
        duration: this.config.listeningStart.duration * 0.8
      });
    }, 120);
  }

  public static playListeningProcessing() {
    this.play(this.config.listeningProcessing);
  }

  public static playDomeExpand() {
    this.play(this.config.domeExpand);
  }

  public static playDomeCollapse() {
    this.play(this.config.domeCollapse);
  }

  public static playStadiumBounce() {
    this.play(this.config.stadiumBounce);
  }

  public static playNetSwish() {
    this.play(this.config.netSwish);
  }

  public static playFireworkLaunch() {
    this.play(this.config.fireworkLaunch);
  }

  public static playFireworkBurst() {
    this.play(this.config.fireworkBurst);
  }

  public static playMorph() {
    this.play(this.config.morph);
  }

  public static playScannerSweep() {
    this.play(this.config.scannerSweep);
  }
}
