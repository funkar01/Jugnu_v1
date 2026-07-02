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
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/8 rounded-full filter blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/8 rounded-full filter blur-[100px] animate-pulse" />
      
      {/* HUD Corners */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-orange-500/20" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-blue-500/20" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-blue-500/20" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-orange-500/20" />

      {/* Main headings */}
      <div className="text-center max-w-4xl z-10">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-r from-white via-orange-100 to-blue-400">
          JUGNU XR: <br />
          LIVE SPORTS IN LIVING ROOMS
        </h1>
        
        <p className="mt-6 text-sm md:text-base text-blue-100/80 tracking-wide max-w-2xl mx-auto leading-relaxed">
          Volumetric Mixed Reality sports broadcasting. Experience live sports as interactive 3D holographic dioramas directly on your desk. Built by <span className="text-orange-400 font-bold">Team Jugnu</span>.
        </p>
      </div>

      {/* First Slide Presentation Image */}
      <div className="mt-8 max-w-4xl w-full z-10 rounded-xl overflow-hidden border border-orange-500/25 shadow-[0_0_30px_rgba(240,125,0,0.1)] relative group">
        <img 
          src="./first-slide.jpg" 
          alt="Jugnu XR Spatial Presentation" 
          className="w-full h-auto object-cover transform group-hover:scale-[1.01] transition-transform duration-700"
        />
      </div>

      {/* Matsuda Inspiration Block */}
      <div className="mt-12 max-w-4xl w-full z-10 bg-slate-950/40 border border-orange-500/20 p-6 rounded-xl relative overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="absolute -right-20 -bottom-20 w-44 h-44 bg-blue-500/8 rounded-full filter blur-[40px]" />
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Left Text details (7 columns) */}
          <div className="md:col-span-7 flex gap-4 items-start">
            <div className="p-3 bg-orange-500/10 rounded-xl border border-orange-400/20 flex-shrink-0">
              <Radio className="w-6 h-6 text-orange-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-400">
                DESIGN PHILOSOPHY & INSPIRATION
              </span>
              <h3 className="text-base font-sans font-bold text-slate-100 mt-0.5">
                Reclaiming "Hyper-Reality" for Spatial Telemetry
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed italic font-sans font-light">
                "Harnessing chaotic augmented vision to build a clean, premium spatial telemetry HUD."
              </p>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                <span>HIGH-FIDELITY SPATIAL TELEMETRY UTILITY</span>
              </div>
            </div>
          </div>
          
          {/* Right Image (5 columns) */}
          <div className="md:col-span-5 relative group overflow-hidden rounded-lg border border-orange-500/30 shadow-md">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent z-10 pointer-events-none" />
            <img 
              src="./hyper-reality.jpg" 
              alt="Keiichi Matsuda Hyper-Reality Inspiration" 
              className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute bottom-2 left-2 z-20 text-[9px] font-mono text-orange-400 bg-slate-950/80 px-2 py-0.5 rounded border border-orange-500/20 uppercase">
              MATSUDA'S HYPER-REALITY
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
