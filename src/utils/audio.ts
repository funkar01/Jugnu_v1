/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let audioCtx: AudioContext | null = null;

export function playBeep(
  frequency = 440, 
  type: OscillatorType = 'sine', 
  duration = 0.1, 
  pan = 0
) {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    
    if (!audioCtx) {
      if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
        if (!(navigator as any).userActivation.hasBeenActive) return;
      }
      audioCtx = new AudioCtxClass();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    // Implement standard panning if supported
    let pannerNode: StereoPannerNode | null = null;
    if (audioCtx.createStereoPanner) {
      pannerNode = audioCtx.createStereoPanner();
      pannerNode.pan.setValueAtTime(pan, audioCtx.currentTime);
    }
    
    // Set custom sound envelop for high-tech clicks
    gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    
    if (pannerNode) {
      osc.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(audioCtx.destination);
    } else {
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    }
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    console.debug('Web Audio API not supported or blocked by browser policy', err);
  }
}

// Complex sweep sound for holographic scan transitions
export function playScanSweep() {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    
    if (!audioCtx) {
      if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
        if (!(navigator as any).userActivation.hasBeenActive) return;
      }
      audioCtx = new AudioCtxClass();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.8);
    
    // Add low-pass filter for clean futuristic sweep
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2200, audioCtx.currentTime + 0.8);
    
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  } catch (err) {
    console.debug('Failed to play scan sweep sound', err);
  }
}
