import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquareCode, ShieldCheck, Activity, Brain, Volume2 } from 'lucide-react';
import { playBeep } from '../utils/audio';
import * as THREE from 'three';
import { JugnuV3Model, Mood } from '../JugnuV3Model';

type ExpressionState = 'calm' | 'happy' | 'sad' | 'wink';

interface JugnuCompanionProps {
  compact?: boolean;
}

export default function JugnuCompanion({ compact = false }: JugnuCompanionProps) {
  const [expression, setExpression] = useState<ExpressionState>('calm');
  const [isPinchTracking, setIsPinchTracking] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [speechText, setSpeechText] = useState('Welcome to Wankhede. Spatial telemetry is synced.');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Expressions database with specific color tones
  const expressionsData: Record<ExpressionState, { title: string, color: string, glow: string, speak: string, freq: number }> = {
    calm: {
      title: 'CALM / MONITORING',
      color: 'bg-red-500',
      glow: 'shadow-red-500/40',
      speak: 'Stadium telemetry aligned. No packet drops detected.',
      freq: 520,
    },
    happy: {
      title: 'HAPPY / REJOICING',
      color: 'bg-emerald-400',
      glow: 'shadow-emerald-400/40',
      speak: 'Spectacular shot! Ball speed peaked at 144 KM/H.',
      freq: 680,
    },
    sad: {
      title: 'SAD / DISMISSAL WARNING',
      color: 'bg-orange-400',
      glow: 'shadow-orange-400/40',
      speak: 'Dismissal confirmed. Stumps hit by outswing.',
      freq: 340,
    },
    wink: {
      title: 'WINKING / CALIBRATED',
      color: 'bg-purple-500',
      glow: 'shadow-purple-500/40',
      speak: 'Pinch gestures calibrated. Try dragging me around!',
      freq: 600,
    }
  };

  const handleExpressionChange = (exp: ExpressionState) => {
    const data = expressionsData[exp];
    playBeep(data.freq, 'sine', 0.15, 0);
    setExpression(exp);
    setSpeechText(data.speak);
  };

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<JugnuV3Model | null>(null);

  // Follow mouse if hand pinch tracking is active
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPinchTracking || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Relative coordinates
      const x = e.clientX - rect.left - 120; // offset half width of orb
      const y = e.clientY - rect.top - 120; // offset half height of orb
      setCoords({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isPinchTracking]);

  // Mount 3D WebGL renderer for actual animated Jugnu V3 asset
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const width = 144;
    const height = 144;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 2.0;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasContainerRef.current.appendChild(renderer.domElement);

    const jugnuModel = new JugnuV3Model();
    jugnuModel.scale.setScalar(0.42); // Fits 144x144 viewport frustum perfectly without edge clipping
    scene.add(jugnuModel);
    modelRef.current = jugnuModel;

    const mapExpressionToMood = (exp: ExpressionState): Mood => {
      switch (exp) {
        case 'happy': return 'happy';
        case 'sad': return 'sad';
        case 'wink': return 'winking';
        case 'calm':
        default:
          return 'calm';
      }
    };
    jugnuModel.setMood(mapExpressionToMood(expression));

    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const dt = clock.getDelta();
      jugnuModel.update(dt, 1.0);
      // No Y-axis rotation — Jugnu stays front-facing at all times
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && canvasContainerRef.current) {
        canvasContainerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      (jugnuModel as any).videoElements?.forEach((v: HTMLVideoElement) => {
        v.pause();
        v.removeAttribute('src');
        v.load();
      });
    };
  }, []);

  // Update live model mood in sync with button events
  useEffect(() => {
    if (modelRef.current) {
      const mapExpressionToMood = (exp: ExpressionState): Mood => {
        switch (exp) {
          case 'happy': return 'happy';
          case 'sad': return 'sad';
          case 'wink': return 'winking';
          case 'calm':
          default:
            return 'calm';
        }
      };
      modelRef.current.setMood(mapExpressionToMood(expression));
    }
  }, [expression]);

  const togglePinchTracking = () => {
    playBeep(700, 'triangle', 0.1, 0);
    if (!isPinchTracking) {
      setExpression('wink');
      setSpeechText('Gesture pinch acquired. I will follow your coordinates.');
    } else {
      setExpression('calm');
      setSpeechText('Companion parked back at standard floating sector.');
      setCoords({ x: 0, y: 0 });
    }
    setIsPinchTracking(!isPinchTracking);
  };



  const orbComponent = (
    <div 
      ref={containerRef}
      className="w-full h-[400px] bg-slate-950/40 border border-red-500/20 rounded-3xl relative flex flex-col justify-between p-6 overflow-hidden shadow-2xl backdrop-blur-md"
      style={{ cursor: isPinchTracking ? 'none' : 'default' }}
    >
      {/* Top HUD bar */}
      <div className="flex justify-between items-center text-[10px] font-mono text-red-500/60">
        <span>COMPANION STREAM</span>
        <span className="text-red-400 uppercase font-bold">{expressionsData[expression].title}</span>
      </div>

      {/* Interactive Floating Glowing Orb */}
      <div className="relative flex-grow flex items-center justify-center">
        
        {/* Holographic scanner cone/lines if active */}
        {isPinchTracking && (
          <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none border-t border-red-400/40 animate-scanline" />
        )}

        <div 
          className="absolute w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 ease-out"
          style={{
            transform: isPinchTracking 
              ? `translate(${coords.x}px, ${coords.y}px)`
              : 'translateY(-10px)',
            animation: isPinchTracking ? 'none' : 'float 4s ease-in-out infinite',
          }}
        >
          
          {/* Live WebGL canvas — transparent background, front-facing, no circle mask */}
          <div 
            ref={canvasContainerRef} 
            className="relative w-36 h-36 flex items-center justify-center"
            style={{ background: 'transparent' }}
          />

        </div>
      </div>

      {/* Speech dialogue container */}
      <div className="space-y-4">
        
        {/* Waveform text bubble */}
        <div className="p-3 bg-slate-950/90 border border-red-500/10 rounded-xl relative">
          <div className="absolute -top-1.5 left-8 w-3 h-3 bg-slate-950 border-t border-l border-red-500/10 transform rotate-45" />
          <div className="flex items-start gap-2.5">
            <Volume2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <div className="text-[10px] font-mono text-red-500/60">JUGNU SPEAKS:</div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">{speechText}</p>
            </div>
          </div>
        </div>

        {/* Gesture Pinch Simulator Button */}
        <button
          id="btn-gesture-pinch"
          onClick={togglePinchTracking}
          className={`w-full py-3 rounded-xl border font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
            isPinchTracking
              ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold shadow-[0_0_15px_rgba(245,158,11,0.2)]'
              : 'bg-slate-950 border-red-500/20 text-slate-400 hover:text-white hover:border-red-500/40'
          }`}
        >
          {isPinchTracking ? '🔴 ACTIVE PINCH TRACKING // TAP TO PARK' : '👆 SIMULATE HAND PINCH TRACKING'}
        </button>

      </div>

      {/* Add custom CSS keyframes for floating companion if not exists */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
        }
      `}</style>
    </div>
  );

  if (compact) {
    return (
      <div className="w-full flex flex-col gap-4">
        {orbComponent}
        <div className="flex flex-wrap gap-2 justify-center">
          {(['calm', 'happy', 'sad', 'wink'] as ExpressionState[]).map((exp) => (
            <button
              key={exp}
              onClick={() => handleExpressionChange(exp)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-all cursor-pointer ${
                expression === exp 
                  ? 'bg-red-500/20 border-red-500 text-red-400 font-bold' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              {exp.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="py-20 px-4 max-w-7xl mx-auto border-t border-red-500/20 bg-slate-950/20">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Column - Core Pitch & Specs (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <span className="px-3 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-red-500/30 text-red-400 rounded-md">
              AI SPATIAL COMPANION
            </span>
            <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-2">
              JUGNU CORE: YOUR FLOATING HUD
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Meet Jugnu—a responsive, voice-controlled, gesture-enabled spatial assistant. Engineered to follow the player on a virtual table, Jugnu reacts dynamically with physics, shifts facial matrices to display emotional telemetry, and acts as your direct audio-visual HUD anchor.
            </p>
          </div>

          {/* Feature List Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="p-4 rounded-xl bg-slate-950/45 border border-red-500/20 flex gap-3 backdrop-blur-md">
              <div className="p-2.5 bg-red-500/10 rounded-lg h-fit">
                <Brain className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-sm text-slate-100">Intelligent Eye Expressions</h4>
                <p className="text-xs text-slate-400 mt-1">Changes visual facial matrices based on match events, scores, dismissals, or gesture pinch states.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/45 border border-red-500/20 flex gap-3 backdrop-blur-md">
              <div className="p-2.5 bg-purple-500/10 rounded-lg h-fit">
                <MessageSquareCode className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-sm text-slate-100">Voice-Controlled Panning</h4>
                <p className="text-xs text-slate-400 mt-1">Responds to conversational vocal cues with built-in real-time spatial panning audio nodes.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/45 border border-red-500/20 flex gap-3 backdrop-blur-md">
              <div className="p-2.5 bg-orange-500/10 rounded-lg h-fit">
                <Activity className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-sm text-slate-100">Cross-Platform Shader Alignment</h4>
                <p className="text-xs text-slate-400 mt-1">Our mobile AR tracking app runs the exact same 3D fluid video-blend shader pipeline as the immersive headset app, aligning aesthetics perfectly.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/45 border border-red-500/20 flex gap-3 backdrop-blur-md">
              <div className="p-2.5 bg-emerald-500/10 rounded-lg h-fit">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-sm text-slate-100">Autonomous Physics Orbit</h4>
                <p className="text-xs text-slate-400 mt-1">Orbits stadium centers or floats above batting pads without colliding with 3D boundary walls.</p>
              </div>
            </div>

          </div>

          {/* Interactive Controller Buttons to change expression */}
          <div className="pt-4 space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400">
              Trigger Digital Expressions
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                id="btn-companion-calm"
                onClick={() => handleExpressionChange('calm')}
                className={`px-4 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                  expression === 'calm' 
                    ? 'bg-red-500/15 border-red-500/40 text-red-400 font-bold shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                    : 'bg-slate-950 border-red-500/20 text-slate-400 hover:text-slate-300'
                }`}
              >
                CALM MONITORING
              </button>
              <button
                id="btn-companion-happy"
                onClick={() => handleExpressionChange('happy')}
                className={`px-4 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                  expression === 'happy' 
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-bold shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                    : 'bg-slate-950 border-red-500/20 text-slate-400 hover:text-slate-300'
                }`}
              >
                HAPPY REJOICE
              </button>
              <button
                id="btn-companion-sad"
                onClick={() => handleExpressionChange('sad')}
                className={`px-4 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                  expression === 'sad' 
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 font-bold shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                    : 'bg-slate-950 border-red-500/20 text-slate-400 hover:text-slate-300'
                }`}
              >
                DISMISSAL WARNING
              </button>
              <button
                id="btn-companion-wink"
                onClick={() => handleExpressionChange('wink')}
                className={`px-4 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                  expression === 'wink' 
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-400 font-bold shadow-[0_0_10px_rgba(139,92,246,0.1)]' 
                    : 'bg-slate-950 border-red-500/20 text-slate-400 hover:text-slate-300'
                }`}
              >
                CALIBRATED WINK
              </button>
            </div>
          </div>

        </div>

        {/* Right Column - 3D Mockup Box with custom physics tracking simulator (5 Columns) */}
        <div className="lg:col-span-5 flex justify-center">
          {orbComponent}
        </div>

      </div>

    </section>
  );
}
