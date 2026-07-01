import React from 'react';
import { Smartphone, RefreshCw, Radio, Share2, Shield, Flame, Globe2, Chrome } from 'lucide-react';
import { playBeep } from '../utils/audio';

export default function WebAdvantages() {
  const triggerBeep = () => {
    playBeep(480, 'sine', 0.08, 0);
  };

  return (
    <section className="py-20 px-4 max-w-7xl mx-auto border-t border-orange-500/20 bg-slate-950/10">
      
      {/* Headings */}
      <div className="text-center mb-16">
        <span className="px-3 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
          DISTRIBUTION & TESTING
        </span>
        <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase mt-3 tracking-tight text-white">
          WEB-BASED DEPLOYMENT ADVANTAGES
        </h2>
        <p className="mt-2 text-slate-400 max-w-xl mx-auto text-sm">
          Why delivering spatial sports broadcasts over standard browser protocols beats native app store pipelines every single time.
        </p>
      </div>

      {/* Bento Grid layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Box 1: Zero-Install Hot Testing (8 Cols on md) */}
        <div 
          onClick={triggerBeep}
          className="md:col-span-8 p-8 bg-slate-900/60 border border-orange-500/20 hover:border-orange-400/50 rounded-3xl transition-all duration-300 relative group cursor-pointer overflow-hidden backdrop-blur-md shadow-xl"
        >
          <div className="absolute top-0 right-0 w-44 h-44 bg-orange-500/5 rounded-full filter blur-[50px] transition-all group-hover:bg-orange-500/10" />
          
          <div className="flex flex-col h-full justify-between gap-6">
            <div className="space-y-3">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl w-fit">
                <RefreshCw className="w-6 h-6 text-orange-400 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <h3 className="text-xl font-sans font-bold text-slate-100">
                Zero-Install Live Testing Cycle
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                Debug directly in the browser and hot-reload changes wirelessly to Quest 3, Vision Pro, and mobiles in seconds.
              </p>
            </div>

            <div className="pt-4 border-t border-orange-500/10 flex flex-wrap items-center gap-6 text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-orange-400" />
                BYPASSES APP STORE LINES
              </span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
                INSTANT HOT-RELOADS
              </span>
            </div>
          </div>
        </div>

        {/* Box 2: Immediate Distribution (4 Cols on md) */}
        <div 
          onClick={triggerBeep}
          className="md:col-span-4 p-8 bg-slate-900/60 border border-orange-500/20 hover:border-orange-400/50 rounded-3xl transition-all duration-300 relative group cursor-pointer backdrop-blur-md shadow-xl"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400/5 rounded-full filter blur-[40px]" />

          <div className="flex flex-col h-full justify-between gap-6">
            <div className="space-y-3">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl w-fit">
                <Share2 className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-sans font-bold text-slate-100">
                Immediate Link Sharing
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Launch live streams instantly via web links without App Store installs or setup barriers.
              </p>
            </div>

            <div className="pt-2 text-xs font-mono text-orange-400 flex items-center gap-1">
              <span>https://jugnuxr.in/broadcast/wankhede-live</span>
            </div>
          </div>
        </div>

        {/* Box 3: Cross-Platform Range (4 Cols on md) */}
        <div 
          onClick={triggerBeep}
          className="md:col-span-4 p-8 bg-slate-950/60 border border-orange-500/20 hover:border-orange-400/50 rounded-3xl transition-all duration-300 relative group cursor-pointer backdrop-blur-md shadow-xl"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400/5 rounded-full filter blur-[40px]" />

          <div className="flex flex-col h-full justify-between gap-6">
            <div className="space-y-3">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl w-fit">
                <Smartphone className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-sans font-bold text-slate-100">
                Multi-Platform Range
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                One codebase runs natively on mobile WebAR, high-end desktop browsers, standalone Quest headsets, and Vision Pro.
              </p>
            </div>

            <div className="pt-4 border-t border-orange-500/10 flex items-center gap-2 text-[10px] font-mono text-slate-500">
              <Globe2 className="w-3.5 h-3.5 text-orange-400" />
              <span>STANDARDIZED WEBXR LAYERS</span>
            </div>
          </div>
        </div>

        {/* Box 4: Browser Core Execution (8 Cols on md) */}
        <div 
          onClick={triggerBeep}
          className="md:col-span-8 p-8 bg-slate-900/60 border border-emerald-500/20 hover:border-emerald-400/50 rounded-3xl transition-all duration-300 relative group cursor-pointer overflow-hidden backdrop-blur-md shadow-xl"
        >
          <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/5 rounded-full filter blur-[50px] transition-all group-hover:bg-emerald-500/10" />

          <div className="flex flex-col h-full justify-between gap-6">
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl w-fit">
                <Chrome className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-sans font-bold text-slate-100">
                True Architectural Independence
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                Built on open standards to guarantee compatibility and longevity across Chrome, Safari, and VR browsers.
              </p>
            </div>

            <div className="pt-4 border-t border-emerald-500/10 flex items-center justify-between text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                SECURE & OPEN WEB PROTOCOLS
              </span>
              <span>COMPATIBLE WITH CHROME, SAFARI & OCULUS BROWSER</span>
            </div>
          </div>
        </div>

      </div>

    </section>
  );
}
