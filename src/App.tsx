/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SportType } from './types';
import ActionCompass from './components/ActionCompass';
import Hero from './components/Hero';
import SportShowcase from './components/SportShowcase';
import JugnuCompanion from './components/JugnuCompanion';
import TelemetryHub from './components/TelemetryHub';
import WebAdvantages from './components/WebAdvantages';
import { 
  Cpu, Radio, Shield, Terminal, ArrowUpRight, Github, ExternalLink, 
  HelpCircle, ChevronLeft, ChevronRight, Presentation, Globe, Layers, Eye
} from 'lucide-react';
import { playBeep } from './utils/audio';

export default function App() {
  const [activeSport, setActiveSport] = useState<SportType>('cricket');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [timeUtc, setTimeUtc] = useState<string>('');
  const [showConsole, setShowConsole] = useState(false);
  
  // Presentation state
  const [viewMode, setViewMode] = useState<'deck' | 'scroll'>('scroll');
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 6;

  // UTC Live clock ticks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeUtc(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard navigation for slide deck
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'deck') return;
      if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
        playBeep(600, 'sine', 0.08);
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
        playBeep(500, 'sine', 0.08);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // Holographic Scanning sweep loop sequence
  const triggerScanningSequence = () => {
    setIsScanning(true);
    setShowConsole(true);
    
    const steps = [
      'INITIATING STADIUM SYNC...',
      'ACQUIRING DEPTH CAMERA COORDINATES...',
      'CALIBRATING TABLETOP FLAT PLANE...',
      'PRE-COMPILING WEBGL SHADER MATERIALS...',
      'PRE-ALLOCATING STATIC POOLS (ZERO-GC)...',
      'SPATIAL WEBAUDIO NODES ACQUIRED (100Hz)...',
      'DOMAIN EXPANSION SUCCESSFUL. ENJOY THE FEED!'
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setScanStep(step);
        playBeep(400 + index * 120, 'triangle', 0.1, 0);
        
        if (index === steps.length - 1) {
          // Finished scanning sequence
          setTimeout(() => {
            setIsScanning(false);
            setShowConsole(false);
            setScanStep('');
            
            // Auto transition to live sports showcase slide
            if (viewMode === 'deck') {
              setCurrentSlide(2); // Stadiums slide
            } else {
              const el = document.getElementById('showcase-section');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              }
            }
          }, 1000);
        }
      }, index * 450);
    });
  };

  const getSportName = () => {
    switch (activeSport) {
      case 'cricket': return 'Cricket (Wankhede)';
      case 'basketball': return 'Basketball (Crypto.com)';
      case 'football': return 'Football (Olympiastadion)';
      case 'f1': return 'Formula 1 (Monaco GP)';
    }
  };

  // Dynamically obtain Tailwind class combinations representing the sports active theme
  const getThemeStyles = () => {
    switch (activeSport) {
      case 'cricket':
        return {
          glowColor: 'rgba(240, 125, 0, 0.15)',
          borderGlow: 'border-cyber-gold/25 shadow-cyber-gold/5',
          textAccent: 'text-cyber-gold',
          buttonClass: 'border-cyber-gold hover:bg-cyber-gold/10 text-cyber-gold',
          bgGradient: 'from-orange-950/15 via-[#050818] to-[#050818]',
        };
      case 'basketball':
        return {
          glowColor: 'rgba(139, 92, 246, 0.15)',
          borderGlow: 'border-cyber-purple/25 shadow-cyber-purple/5',
          textAccent: 'text-cyber-purple',
          buttonClass: 'border-cyber-purple hover:bg-cyber-purple/10 text-cyber-purple',
          bgGradient: 'from-violet-950/15 via-[#050818] to-[#050818]',
        };
      case 'football':
        return {
          glowColor: 'rgba(16, 185, 129, 0.15)',
          borderGlow: 'border-emerald-500/25 shadow-emerald-500/5',
          textAccent: 'text-emerald-400',
          buttonClass: 'border-emerald-500 hover:bg-emerald-500/10 text-emerald-400',
          bgGradient: 'from-emerald-950/15 via-[#050818] to-[#050818]',
        };
      case 'f1':
        return {
          glowColor: 'rgba(255, 122, 0, 0.15)',
          borderGlow: 'border-red-500/25 shadow-red-500/5',
          textAccent: 'text-red-500',
          buttonClass: 'border-red-500 hover:bg-red-500/10 text-red-500',
          bgGradient: 'from-red-950/15 via-[#050818] to-[#050818]',
        };
    }
  };

  const theme = getThemeStyles();

  // Slide titles for bullet indicators
  const slideTitles = [
    '01. EXECUTIVE BRIEF',
    '02. CORE SPATIAL TECH',
    '03. LIVE BROADCASTS',
    '04. JUGNU COMPANION',
    '05. CALIBRATION METRICS',
    '06. PLATFORM ADVANTAGES'
  ];

  const handleSlideChange = (idx: number) => {
    playBeep(450 + idx * 50, 'sine', 0.05);
    setCurrentSlide(idx);
  };

  return (
    <div className={`min-h-screen bg-[#050818] text-[#e2e8f0] font-sans relative overflow-x-hidden selection:bg-orange-500/30 selection:text-white transition-colors duration-1000 bg-gradient-to-b ${theme.bgGradient}`}>
      
      {/* Background Scanlines & Grid from Immersive UI */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,122,0,0.06),rgba(0,255,0,0.01),rgba(59,130,246,0.06))] bg-[length:100%_2px,3px_100%] z-0" />
      <div className="absolute inset-0 pointer-events-none opacity-5 z-0" style={{ backgroundImage: 'linear-gradient(rgba(59,130,246,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.08) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Full-Screen Holographic Scanner Sweep line */}
      {isScanning && (
        <div className="fixed inset-x-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_20px_#ff7a00] z-50 animate-scanline" />
      )}

      {/* Scanning Live Console Overlay */}
      {showConsole && (
        <div className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-32px)] p-4 bg-slate-950/95 border border-orange-500/35 rounded-xl font-mono text-xs shadow-2xl flex flex-col gap-2 animate-pulse backdrop-blur-md">
          <div className="flex items-center gap-2 text-orange-500 border-b border-orange-500/10 pb-2">
            <Terminal className="w-4 h-4" />
            <span>MR_STAGE_CALIBRATION.LOG</span>
          </div>
          <div className="text-slate-300">
            &gt; {scanStep || 'PROCESSING_SIGNAL...'}
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex justify-between">
            <span>PACKETS: 100% OK</span>
            <span>FPS: 90.0 HZ</span>
          </div>
        </div>
      )}

      {/* Top Telemetry & Switcher Bar */}
      <header className="h-14 border-b border-orange-500/20 flex items-center justify-between px-6 bg-slate-950/90 backdrop-blur-md relative z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-white font-extrabold tracking-widest text-lg font-sans">
              JUGNU <span className="text-orange-500 font-light">XR</span>
            </span>
          </div>
          <div className="h-5 w-px bg-slate-800"></div>
          <span className="font-mono text-xs text-orange-500/70 uppercase tracking-tighter hidden md:inline-block">
            JUGNU CORE ACTIVE // team jugnu pitch deck
          </span>
        </div>

        {/* Switcher buttons removed as website loads by default */}

        <div className="hidden lg:flex gap-6 font-mono text-[10px] text-orange-400/60 items-center">
          <span>{timeUtc || 'SYNCING UTC...'}</span>
          <span>90.0 FPS</span>
          <span className="text-orange-500 font-bold">WEB_XR: READY</span>
        </div>
      </header>

      {/* VIEW MODE: DECK MODE (SLIDESHOW) */}
      {viewMode === 'deck' ? (
        <div className="max-w-7xl mx-auto px-4 py-8 relative z-10 flex flex-col min-h-[calc(100vh-140px)] justify-between">
          
          {/* Top Progress Bar & Slider Indicator */}
          <div className="w-full flex flex-col gap-2 mb-6">
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Presentation className="w-3.5 h-3.5 text-orange-500" />
                <span>JUGNU XR PRODUCT DISCOVERY DECK</span>
              </span>
              <span>SLIDE {currentSlide + 1} OF {totalSlides}</span>
            </div>
            
            {/* Timeline Progress Bar */}
            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden flex">
              {[...Array(totalSlides)].map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 h-full border-r border-slate-950 transition-all duration-500 ${
                    i <= currentSlide ? 'bg-orange-500' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>

            {/* Quick Slide Navigation Links */}
            <div className="hidden md:flex justify-between gap-2 mt-1">
              {slideTitles.map((title, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSlideChange(idx)}
                  className={`text-[10px] font-mono py-1 px-2 border-b-2 transition-all cursor-pointer ${
                    currentSlide === idx 
                      ? 'border-orange-500 text-orange-500 font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>

          {/* Slide Window Content Panel */}
          <div className="flex-1 w-full bg-slate-950/40 border border-orange-500/10 rounded-2xl p-6 md:p-8 backdrop-blur-md relative overflow-hidden flex flex-col justify-center min-h-[500px]">
            
            {/* Background Glows for visual depth */}
            <div className="absolute -left-32 -bottom-32 w-80 h-80 bg-orange-500/5 rounded-full filter blur-[80px] pointer-events-none" />
            <div className="absolute -right-32 -top-32 w-80 h-80 bg-blue-500/5 rounded-full filter blur-[80px] pointer-events-none" />

            {/* Slide 0: Title Slide */}
            {currentSlide === 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                    <span>THE FUTURE OF LIVE SPORTS</span>
                  </div>
                  <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-orange-100 to-blue-400 uppercase">
                    THE STADIUM ON <br className="hidden md:inline" />
                    YOUR TABLETOP
                  </h1>
                  <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                    Why settle for flat, passive streaming? <strong>Jugnu XR</strong> — by Rush XR Studios — is redefining the spatial broadcast medium. We capture volumetric coordinates of athletic action, transforming live stadiums into interactive 3D dioramas delivered over light-weight web frameworks.
                  </p>
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10 flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-orange-500" />
                    <div className="text-xs font-mono text-slate-400">
                      SYS_LOG: Tabletop coordinates syncing @ 90Hz directly to your web browser frames. No headset downloads required.
                    </div>
                  </div>
                  <div className="pt-2">
                    <button 
                      onClick={triggerScanningSequence}
                      className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-mono text-xs font-bold tracking-widest uppercase rounded-lg hover:brightness-110 transition shadow-lg shadow-orange-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <Cpu className="w-4 h-4 animate-spin" />
                      RUN SPATIAL SIMULATION
                    </button>
                  </div>
                </div>
                <div className="lg:col-span-5 flex justify-center">
                  <div className="relative w-full max-w-[340px] aspect-square rounded-full border border-dashed border-orange-500/20 flex items-center justify-center animate-spin" style={{ animationDuration: '40s' }}>
                    <div className="absolute inset-8 rounded-full border border-blue-500/20 flex items-center justify-center animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }}>
                      <div className="absolute inset-12 rounded-full bg-slate-950 border border-orange-500/20 flex flex-col items-center justify-center text-center p-4">
                        <span className="text-[10px] font-mono text-orange-500 font-bold tracking-widest uppercase">Jugnu Volumetrics</span>
                        <span className="text-2xl font-sans font-black text-white mt-1">90 FPS</span>
                        <span className="text-[9px] font-mono text-slate-500 mt-1">ZERO LATENCY DECODING</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 1: Technology Stack */}
            {currentSlide === 1 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>UNDER THE HOOD // PATENTED WEB STACK</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  IMPOSSIBLE PERFORMANCE ON LIGHTWEIGHT WEB BROWSERS
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  Most spatial headsets suffer from slow initial setups and high native storage requirements. We engineered our entire spatial client in pure JavaScript, enabling immediate loading times with no store downloads.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                        <Cpu className="w-5 h-5 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Zero-GC Rendering</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Pre-allocated memory pooling patterns prevent Garbage Collection runs in the browser, guaranteeing zero frame-drops during peak trajectories.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">STABILIZED THREADS</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-blue-500/15 flex flex-col justify-between hover:border-blue-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:bg-blue-500/20 transition-all">
                        <Layers className="w-5 h-5 text-blue-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Dynamic Voxel Splines</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Compresses multi-camera stadium footage into procedural voxel splines on-the-fly, reducing server-to-client payloads from gigabytes to mere megabytes.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-blue-400/70 mt-4 uppercase">COMPRESSION RATIO: 120:1</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                        <Radio className="w-5 h-5 text-orange-405 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Synchronized Spatial Audio</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Procedural WebAudio oscillators generate synthesized contact noises (ball-on-bat, motor engines, hardwood bounces) map-located relative to head poses.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">WEBAUDIO APIS</span>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 2: Interactive Broadcasts (Compass & Showcase) */}
            {currentSlide === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-500/10 pb-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                      <span>LIVE TELEMETRY FEEDS // TRY INTERACTING</span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
                      PROCEDURAL STADIUM DIORAMAS
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-slate-500 block uppercase">Currently active venue</span>
                    <span className="text-xs font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/25">
                      {getSportName()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-4 flex justify-center">
                    <ActionCompass 
                      activeSport={activeSport} 
                      onChangeSport={(sport) => setActiveSport(sport)} 
                    />
                  </div>
                  
                  <div className="lg:col-span-8">
                    <SportShowcase 
                      activeSport={activeSport} 
                      onChangeSport={(sport) => setActiveSport(sport)} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Slide 3: Jugnu AI Companion */}
            {currentSlide === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                    <span>COGNITIVE SPATIAL ORB // JUGNU CORE</span>
                  </div>
                  <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight uppercase leading-none">
                    MEET JUGNU: <br />
                    YOUR SPATIAL CO-PILOT
                  </h2>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    <strong>Jugnu</strong> is our spatial AI system that sits right inside your volumetric diorama. It calculates real-time pitch parameters, analyzes team coordinates, and translates raw coordinates into engaging spoken insights.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <h4 className="font-sans font-bold text-slate-200 text-xs">Acoustics Synthesis</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Synthesizes ball friction angles, bounce velocities, and telemetry sounds.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <h4 className="font-sans font-bold text-slate-200 text-xs">Adaptive Expressions</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Reacts instantly to broadcast incidents and spectator gesture inputs.</p>
                    </div>
                  </div>

                  <p className="text-xs font-mono text-orange-400/80">
                    💡 <strong>TEST COMPANION:</strong> Click the expression presets or hover over the orb on the right to interact with Jugnu's live AI state!
                  </p>
                </div>
                
                <div className="lg:col-span-5 flex justify-center">
                  <JugnuCompanion compact={true} />
                </div>
              </div>
            )}

            {/* Slide 4: Telemetry Hub & Benchmarking */}
            {currentSlide === 4 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>REAL-TIME ENGINE TELEMETRY // ADJUST LOAD CAPACITY</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  TELEMETRY TUNER & CALIBRATION HUB
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  We give broadcasters total control over active rendering priorities. Adjust thread capabilities, track CPU loads, and observe garbage-collection metrics dynamically below.
                </p>

                <div className="pt-2">
                  <TelemetryHub />
                </div>
              </div>
            )}

            {/* Slide 5: Web advantages bento grid */}
            {currentSlide === 5 && (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>MARKET FIT // WHY BROWSER-BASED MR WINS</span>
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">
                  THE SPATIAL WEB DISRUPTION
                </h2>
                
                <div className="pt-2">
                  <WebAdvantages />
                </div>
              </div>
            )}

          </div>

          {/* Slide Deck Controller Bar */}
          <div className="w-full mt-6 p-4 bg-slate-950/90 border border-orange-500/20 rounded-xl flex items-center justify-between">
            <button
              onClick={() => {
                setCurrentSlide((prev) => Math.max(prev - 1, 0));
                playBeep(500, 'sine', 0.08);
              }}
              disabled={currentSlide === 0}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>PREVIOUS</span>
            </button>

            {/* Slide bullet progress indicators */}
            <div className="hidden sm:flex items-center gap-3">
              {[...Array(totalSlides)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleSlideChange(i)}
                  className={`w-3 h-3 rounded-full border transition-all cursor-pointer ${
                    currentSlide === i 
                      ? 'bg-orange-500 border-orange-500 scale-125 shadow-[0_0_8px_#ff7a00]' 
                      : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                  }`}
                  title={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => {
                setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
                playBeep(600, 'sine', 0.08);
              }}
              disabled={currentSlide === totalSlides - 1}
              className="px-4 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-slate-950 rounded-lg font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>NEXT</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      ) : (
        /* VIEW MODE: STANDARD SCROLLABLE LANDING PAGE */
        <>
          {/* Hero Section */}
          <Hero 
            onTriggerScan={triggerScanningSequence} 
            isScanning={isScanning} 
            activeSportName={getSportName()}
          />

          {/* Action Compass Special Component + Quick Pitch Summary Grid */}
          <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Side Pitch Summary Box (7 columns) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
                  THE TABLETOP DOMAIN EXPANSION
                </span>
                <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
                  SPATIAL BROADCAST HUD
                </h2>
                <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                  Why settle for flat screens? Tapping the Action Compass dials shifts the broadcast feed to any stadium. Instantly spawn Wankhede’s ball flight arcs or Monaco’s Monaco silver racing chicane. Customize your live workspace by locking onto stadiums and let Jugnu calculate instant voxel angles for your headsets.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
                
                <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/20 backdrop-blur-md">
                  <div className="text-2xl font-mono font-bold text-orange-400">90 HZ</div>
                  <div className="text-[10px] font-mono text-orange-500/80 uppercase mt-1">REFRESH GUARANTEE</div>
                  <p className="text-[11px] text-slate-400 mt-1">Zero latency browser synchronization for fluid physical head-tracking updates.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/45 border border-blue-500/20 backdrop-blur-md">
                  <div className="text-2xl font-mono font-bold text-blue-400">Zero-GC</div>
                  <div className="text-[10px] font-mono text-blue-500/80 uppercase mt-1">MEMORY RECYCLING</div>
                  <p className="text-[11px] text-slate-400 mt-1">Pre-allocated memory vectors eliminate garbage-collection frame drops.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/45 border border-purple-500/20 backdrop-blur-md">
                  <div className="text-2xl font-mono font-bold text-purple-400">WebXR</div>
                  <div className="text-[10px] font-mono text-purple-500/80 uppercase mt-1">OPEN PROTOCOLS</div>
                  <p className="text-[11px] text-slate-400 mt-1">One codebase runs across Quest 3, Apple Vision Pro, mobile browser frames.</p>
                </div>

              </div>

              {/* Quick interactive call to action targeting the compass below */}
              <div className="p-3 bg-slate-950/40 border border-orange-500/20 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-orange-400 animate-spin" style={{ animationDuration: '5s' }} />
                <span>
                  <strong>INTERACTIVE ACTION MENU:</strong> Use the right compass dial buttons to rotate coordinates and shift the primary theme color dynamically!
                </span>
              </div>

            </div>

            {/* Right Side Action Compass Module (5 columns) */}
            <div className="lg:col-span-5 flex justify-center">
              <ActionCompass 
                activeSport={activeSport} 
                onChangeSport={(sport) => setActiveSport(sport)} 
              />
            </div>

          </main>

          {/* Live Interactive Sport Showcase Canvas Simulators */}
          <SportShowcase 
            activeSport={activeSport} 
            onChangeSport={(sport) => setActiveSport(sport)} 
          />

          {/* Floating Spatial Companion: Jugnu Core */}
          <JugnuCompanion />

          {/* Software Development Cycle (SDC) & Telemetry Hub tuner */}
          <TelemetryHub />

          {/* Web-based Advantages Bento grid */}
          <WebAdvantages />
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-orange-500/20 bg-slate-950 py-12 text-slate-500 relative z-10 text-xs">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="space-y-3">
            <span className="font-sans font-bold text-orange-500 uppercase tracking-widest text-sm flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
              JUGNU XR
            </span>
            <p className="text-slate-400 leading-relaxed">
              Jugnu XR — Volumetric Mixed Reality Sports Broadcasting. Built by Team Jugnu at Rush XR Studios. Redefining sports entertainment under premium open web standards.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-mono text-orange-500 uppercase font-bold text-[10px] tracking-wider">ENGINEERING COMPLIANCE</h4>
            <ul className="space-y-1.5 font-mono text-[10px] text-slate-400">
              <li>IWSDK v2.4 COMPLIANT</li>
              <li>THREE.JS R158 MODULE</li>
              <li>ZERO-GC MEMORY CYCLES</li>
              <li>WEB AUDIO OSCILLATORS</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-mono text-orange-500 uppercase font-bold text-[10px] tracking-wider">SPATIAL SECTORS</h4>
            <ul className="space-y-1.5 font-mono text-[10px] text-slate-400">
              <li>WANKHEDE STADIUM [CRICKET]</li>
              <li>CRYPTO.COM ARENA [BASKETBALL]</li>
              <li>OLYMPIASTADION [FOOTBALL]</li>
              <li>MONACO CHICANE [FORMULA 1]</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-mono text-orange-500 uppercase font-bold text-[10px] tracking-wider">DISTRIBUTION CHANNELS</h4>
            <p className="text-slate-400 font-sans text-xs">Instant URL loading runs across Oculus Browser, Apple Vision OS Safari, Chrome, and high-performance headsets.</p>
            <div className="flex gap-4 pt-1">
              <button 
                onClick={() => playBeep(550, 'sine', 0.05)}
                className="hover:text-white text-orange-400 transition flex items-center gap-1 cursor-pointer font-mono text-[10px]"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                SYSTEM STATUS
              </button>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto px-4 mt-8 pt-8 border-t border-orange-500/10 flex flex-wrap justify-between items-center gap-4 text-slate-500 font-mono text-[10px]">
          <span>© 2026 JUGNU XR // Rush XR Studios. All Rights Reserved.</span>
          <span>LAT: 18.926N, LON: 72.822E // PORT: 3000</span>
        </div>

        {/* Design-inspired Micro Telemetry Status Bar */}
        <div className="max-w-7xl mx-auto px-4 mt-6 pt-6 border-t border-orange-500/10 flex flex-wrap justify-between items-center gap-4 text-slate-500 font-mono text-[9px]">
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-emerald-500 uppercase tracking-wider font-semibold">Spatial Tracking Active</span>
            </div>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500 uppercase">Build: 0xF72A9C0 - Alpha Dev Channel</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 border border-orange-500/30 rounded text-orange-400">A-FRAME</div>
            <div className="px-2 py-0.5 border border-orange-500/30 rounded text-orange-400">THREE.JS</div>
            <div className="px-2 py-0.5 border border-orange-500/30 rounded text-orange-400">WEB_XR_API</div>
          </div>
        </div>
      </footer>

    </div>
  );
}
