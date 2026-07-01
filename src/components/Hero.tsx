import React from 'react';
import { Eye, Sparkles, Cpu, Radio, ShieldCheck } from 'lucide-react';
import { playScanSweep } from '../utils/audio';

interface HeroProps {
  onTriggerScan: () => void;
  isScanning: boolean;
  activeSportName: string;
}

export default function Hero({ onTriggerScan, isScanning, activeSportName }: HeroProps) {
  const handleEnterClick = () => {
    playScanSweep();
    onTriggerScan();
  };

  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center items-center px-4 py-16 overflow-hidden">
      
      {/* Background glowing telemetry orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full filter blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full filter blur-[100px] animate-pulse" />
      
      {/* HUD Corners */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-red-500/20" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-red-500/20" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-red-500/20" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-red-500/20" />

      {/* Futuristic status badges */}
      <div className="flex flex-wrap justify-center gap-3 mb-6 z-10">
        <span className="px-3 py-1 text-[11px] font-mono tracking-widest bg-slate-950/85 border border-red-500/20 text-slate-300 rounded-full flex items-center gap-1.5 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
          LIVE SECURE BROADCAST FEED
        </span>
        <span className="px-3 py-1 text-[11px] font-mono tracking-widest bg-slate-950/85 border border-red-500/20 text-slate-300 rounded-full flex items-center gap-1.5 shadow-lg">
          <Eye className="w-3.5 h-3.5 text-orange-400" />
          WEBXR COMPLIANT // NO APP NEEDED
        </span>
      </div>

      {/* Main headings */}
      <div className="text-center max-w-4xl z-10">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-rose-500">
          THE IMMERSIVE FIELD <br />
          ON YOUR TABLE
        </h1>
        
        <p className="mt-6 text-sm md:text-base text-red-100/80 tracking-wide max-w-2xl mx-auto leading-relaxed">
          Volumetric Mixed Reality Sports Broadcasting powered by the Immersive Web. Experience live games as 3D holographic dioramas in your living room, directly on your desk. Built by <span className="text-red-400 font-bold">Team Jugnu</span>, Rush XR Studios.
        </p>
      </div>

      {/* Matsuda Inspiration Block */}
      <div className="mt-12 max-w-3xl w-full z-10 bg-slate-950/40 border border-red-500/20 p-6 rounded-xl relative overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="absolute -right-20 -bottom-20 w-44 h-44 bg-red-500/5 rounded-full filter blur-[40px]" />
        
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-500/10 rounded-xl border border-red-400/20 flex-shrink-0">
            <Radio className="w-6 h-6 text-red-400 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400">
              DESIGN PHILOSOPHY & INSPIRATION
            </span>
            <h3 className="text-base font-sans font-bold text-slate-100 mt-0.5">
              Reclaiming "Hyper-Reality" for Spatial Telemetry
            </h3>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed italic font-sans">
              "We saw Keiichi Matsuda's chaotic Hyper-Reality vision and asked: <strong className="text-white font-medium">What if we harnessed that visual density for something spectacular?</strong> We extracted the pure telemetry and built a premium spatial HUD."
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-slate-500">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
              <span>CONTRASTING OVERWHELMING ADVERTISING WITH HIGH-FIDELITY UTILITY</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Button and simulator status */}
      <div className="mt-10 flex flex-col items-center gap-4 z-10">
        <div className="flex flex-wrap justify-center gap-4">
          <button
            id="btn-volumetric-stadium"
            onClick={handleEnterClick}
            disabled={isScanning}
            className={`relative group px-8 py-4 bg-red-500/10 border border-red-400/50 hover:bg-red-500/20 transition-all overflow-hidden text-red-300 hover:text-white font-mono text-xs uppercase tracking-[0.2em] rounded-lg cursor-pointer transform active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.15)] ${
              isScanning ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className="absolute inset-0 bg-red-400/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></span>
            <span className="relative flex items-center justify-center gap-3">
              <Cpu className="w-4 h-4 animate-spin" style={{ animationDuration: '4s' }} />
              {isScanning ? 'STADIUM SYNC IN PROGRESS...' : 'ENTER VOLUMETRIC STADIUM'}
            </span>
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-red-300"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-red-300"></div>
          </button>

          <button
            id="btn-launch-xr"
            onClick={() => {
              if ((window as any).launchWebXR) {
                (window as any).launchWebXR();
              } else {
                alert("Immersive WebXR engine is initializing or not supported on this device. Use a VR/AR headset (like Quest/Pico) to enter volumetric mode.");
              }
            }}
            className="relative group px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border border-red-500 hover:border-red-400 text-white font-mono text-xs uppercase tracking-[0.2em] rounded-lg cursor-pointer transform active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          >
            <span className="relative flex items-center justify-center gap-3">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>LAUNCH IMMERSIVE WEBXR</span>
            </span>
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-red-300"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-red-300"></div>
          </button>
        </div>

        <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Currently showing: <span className="text-red-400 uppercase font-bold">{activeSportName}</span>
        </p>
      </div>

      {/* Live volumetric specs ticker overlay */}
      <div className="w-full max-w-5xl mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border border-red-500/20 bg-slate-950/40 rounded-xl z-10 backdrop-blur-md">
        <div className="text-center p-2">
          <div className="text-xs font-mono text-slate-500">SPATIAL REFRESH</div>
          <div className="text-lg font-mono font-bold text-red-400">90.0 FPS</div>
        </div>
        <div className="text-center p-2 border-l border-red-500/20">
          <div className="text-xs font-mono text-slate-500">RENDER ENGINE</div>
          <div className="text-lg font-mono font-bold text-slate-200">WEBGL2 / WXR</div>
        </div>
        <div className="text-center p-2 border-l border-red-500/20">
          <div className="text-xs font-mono text-slate-500">MAX BUFFER POOL</div>
          <div className="text-lg font-mono font-bold text-purple-400">1024 MB</div>
        </div>
        <div className="text-center p-2 border-l border-red-500/20">
          <div className="text-xs font-mono text-slate-500">VOLUMETRIC CODES</div>
          <div className="text-lg font-mono font-bold text-slate-200">ECS_V2.1</div>
        </div>
      </div>

    </section>
  );
}
