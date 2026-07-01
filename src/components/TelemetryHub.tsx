import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Radio, Sliders, Layers, RefreshCw, Gauge, Waves, Server, Laptop, Code, Share2, Globe2, Shield, Wifi, Smartphone } from 'lucide-react';
import { playBeep } from '../utils/audio';

export default function TelemetryHub() {
  const [activeTab, setActiveTab] = useState<'frontend' | 'backend'>('frontend');
  const [fps, setFps] = useState(90);
  const [cpuLoad, setCpuLoad] = useState(14.8);
  const [targetFps, setTargetFps] = useState(90);
  const [complexity, setComplexity] = useState(30); // 0 to 100 slider
  const [particlePool, setParticlePool] = useState(2500); // 100 to 10000

  // Calculate dynamic outputs based on sliders
  useEffect(() => {
    const timer = setInterval(() => {
      // Add slight organic noise to calculations
      const noise = (Math.random() - 0.5) * 0.5;
      const computedCpu = parseFloat((12.5 + (complexity * 0.45) + (particlePool * 0.0015) + noise).toFixed(1));
      setCpuLoad(computedCpu);

      // FPS degrades if complexity is too high
      let computedFps = targetFps;
      if (complexity > 75 || particlePool > 8000) {
        const drop = (complexity - 75) * 0.3 + (particlePool - 8000) * 0.002;
        computedFps = Math.max(45, Math.floor(targetFps - drop));
      } else {
        computedFps = Math.floor(targetFps + (Math.random() > 0.8 ? (Math.random() - 0.5) * 2 : 0));
      }
      setFps(computedFps);
    }, 300);

    return () => clearInterval(timer);
  }, [targetFps, complexity, particlePool]);

  const handleSliderChange = (type: string, val: number) => {
    playBeep(300 + val * 2, 'sine', 0.05, 0);
    if (type === 'targetFps') setTargetFps(val);
    if (type === 'complexity') setComplexity(val);
    if (type === 'particlePool') setParticlePool(val);
  };

  return (
    <section className="py-20 px-4 max-w-7xl mx-auto border-t border-orange-500/20">
      
      {/* Title */}
      <div className="text-center mb-16">
        <span className="px-3 py-1 text-[10px] font-mono tracking-widest bg-slate-950/85 border border-orange-500/30 text-orange-400 rounded-md">
          ENGINEERING ARCHITECTURE
        </span>
        <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase mt-3 tracking-tight text-white">
          FULLSTACK ARCHITECTURE HUB: "How It Works"
        </h2>
        <p className="mt-2 text-slate-400 max-w-xl mx-auto text-sm">
          A deep dive into the frontend rendering loops and globally distributed Edge serverless endpoints powering Jugnu XR.
        </p>
      </div>

      {/* Centered single column architecture layout */}
      <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Sub-tabs Selector */}
          <div className="flex gap-2 border-b border-orange-500/10 pb-2">
            <button
              onClick={() => {
                playBeep(440, 'sine', 0.05);
                setActiveTab('frontend');
              }}
              className={`flex-1 py-3 px-4 rounded-xl font-mono text-[11px] md:text-xs uppercase tracking-wider transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'frontend'
                  ? 'bg-orange-500/10 border-orange-500 text-orange-400 font-bold shadow-[0_0_15px_rgba(240,125,0,0.1)]'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              <Laptop className="w-4 h-4 shrink-0" />
              FRONTEND ENGINE (The Client)
            </button>
            <button
              onClick={() => {
                playBeep(480, 'sine', 0.05);
                setActiveTab('backend');
              }}
              className={`flex-1 py-3 px-4 rounded-xl font-mono text-[11px] md:text-xs uppercase tracking-wider transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'backend'
                  ? 'bg-orange-500/10 border-orange-500 text-orange-400 font-bold shadow-[0_0_15px_rgba(240,125,0,0.1)]'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              <Server className="w-4 h-4 shrink-0" />
              SERVERLESS EDGE (The Backend)
            </button>
          </div>

          {/* Active Tab Content */}
          <div className="min-h-[340px]">
            {activeTab === 'frontend' ? (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-950/40 border border-orange-500/10 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-orange-500/10 rounded-xl shrink-0">
                      <Code className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-mono text-orange-400 uppercase tracking-wider">Runtime Environment</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Built on <strong className="text-white font-semibold">IWSDK</strong> (Immersive Web SDK) which wraps <strong className="text-white font-semibold">Three.js</strong> and manages standard WebXR integrations (hand tracking, spatial inputs, physical boundaries, and Edge visibility transitions).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-purple-500/10 rounded-xl shrink-0">
                      <Layers className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-mono text-purple-400 uppercase tracking-wider">Pattern Architecture</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Strict <strong className="text-white font-semibold">Entity-Component-System (ECS)</strong> pattern for a highly modular, clean render loop and deterministic lifecycle management.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-400">
                    WebGL Render Pipeline Optimizations
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-orange-400 font-mono text-xs font-bold">
                        <Cpu className="w-4 h-4 shrink-0" />
                        <span>ZERO-GC LOOPS</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Eliminates frame drops (maintaining 72-90 FPS in VR) by pre-allocating memory pools (scratch vectors, matrices, instanced mesh sparks) instead of making allocations inside the runtime update loops.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold">
                        <RefreshCw className="w-4 h-4 shrink-0" />
                        <span>PRE-COMPILATION</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Polls and compiles shaders during the landing page phase so entering XR has zero micro-stutters.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
                        <Waves className="w-4 h-4 shrink-0" />
                        <span>SPATIAL FX ENGINE</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Real-time spatial audio oscillators and panning nodes (hover/vibration feedback) coupled with instanced particle systems.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-950/40 border border-orange-500/10 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-orange-500/10 rounded-xl shrink-0">
                      <Globe2 className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-mono text-orange-400 uppercase tracking-wider">Runtime Serverless Engine</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Built on <strong className="text-white font-semibold">Vercel Edge Functions</strong> written in vanilla JavaScript, running globally at the edge with near-zero latency.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-400">
                    Core Edge API Endpoints
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-orange-400 font-mono text-[10px] font-bold">
                        <span className="bg-orange-500/10 px-1.5 py-0.5 rounded">PROXY</span>
                        <span className="text-slate-400">/api/gemini</span>
                      </div>
                      <div className="font-sans font-bold text-xs text-slate-200 mt-1">Gemini Edge Proxy</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        A secure serverless proxy that forwards client requests directly to the <strong className="text-white">Gemini 2.5 Flash API</strong> using Edge functions. This handles voice transcription, conversational responses, and stadium telemetry instructions without exposing API keys to the client.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-purple-400 font-mono text-[10px] font-bold">
                        <span className="bg-purple-500/10 px-1.5 py-0.5 rounded">CACHE</span>
                        <span className="text-slate-400">/api/sv/session</span>
                      </div>
                      <div className="font-sans font-bold text-xs text-slate-200 mt-1">Street View Session Cache</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Fetches and caches Google Maps Street View session credentials on the Edge serverless layer, rotating keys on expiry.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px] font-bold">
                        <span className="bg-emerald-500/10 px-1.5 py-0.5 rounded">RESOLVE</span>
                        <span className="text-slate-400">/api/sv/panoid</span>
                      </div>
                      <div className="font-sans font-bold text-xs text-slate-200 mt-1">Panorama Resolution Endpoint</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Translates coordinate points (<code className="text-slate-300 font-mono">lat, lng</code>) to specific Google Maps Panorama IDs (<code className="text-slate-300 font-mono">panoId</code>).
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-blue-400 font-mono text-[10px] font-bold">
                        <span className="bg-blue-500/10 px-1.5 py-0.5 rounded">STREAM</span>
                        <span className="text-slate-400">/api/sv/tile/...</span>
                      </div>
                      <div className="font-sans font-bold text-xs text-slate-200 mt-1">Tile Proxy</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Streams 512x512 JPEG street view panorama tiles directly to the client canvas in parallel, utilizing Edge caching (<code className="text-slate-300 font-mono">public, max-age=86400</code>) to accelerate loading and optimize API costs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Web-Based Testing & Scalability Advantages Section */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-orange-500/10 to-blue-500/5 border border-orange-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-400 font-bold">
                Web-Based Testing & Scalability Advantages
              </h4>
              <span className="px-2 py-0.5 text-[9px] font-mono bg-orange-500/10 text-orange-400 rounded-md border border-orange-500/20 font-bold">
                THE ITERATION SECRET
              </span>
            </div>
            
            <p className="text-xs text-slate-300 italic font-medium leading-relaxed border-l-2 border-orange-500 pl-3">
              "We test instantly because it's web-based."
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-200 font-bold">
                  <Wifi className="w-3.5 h-3.5 text-orange-400 shrink-0 animate-pulse" />
                  WIRELESS INSTANT TESTING
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  No cables, side-loading, or developer certificates. Standard secure local channels hot-reload code builds wirelessly to all headsets (Vision Pro, Quest 3, Pico 4) and mobiles simultaneously.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-200 font-bold">
                  <Smartphone className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  UNIFIED CROSS-HARDWARE
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  A single unified TypeScript and WebGL codebase runs natively on mobile WebAR pipelines, high-end desktop web browser engines, and stand-alone spatial hardware.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-200 font-bold">
                  <Share2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  URL-BASED MASS SCALABILITY
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Distribute live sports streams instantly via simple web links. Scale to millions of concurrent spectators without App Store approvals or gigabyte installation barriers.
                </p>
              </div>
            </div>
          </div>

        </div>



    </section>
  );
}
