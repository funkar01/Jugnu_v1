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
  const totalSlides = 8;

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
    '02. APPS FRICTION',
    '03. ZERO-INSTALL SOLUTIONS',
    '04. LIVE BROADCASTS',
    '05. JUGNU COMPANION',
    '06. CALIBRATION METRICS',
    '07. PLATFORM ADVANTAGES',
    '08. DEVELOPMENT ROADMAP'
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

        {/* Mode Selector Switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('deck')}
            className={`px-3 py-1.5 rounded-l border-y border-l transition-all font-mono text-[10px] cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'deck'
                ? 'bg-orange-500 border-orange-500 text-slate-950 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>PITCH DECK</span>
          </button>
          <button
            onClick={() => setViewMode('scroll')}
            className={`px-3 py-1.5 rounded-r border-y border-r transition-all font-mono text-[10px] cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'scroll'
                ? 'bg-orange-500 border-orange-500 text-slate-950 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>FULL WEBSITE</span>
          </button>
        </div>

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
            {/* Slide 0: Title Slide */}
            {currentSlide === 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                    <span>THE FUTURE OF LIVE SPORTS</span>
                  </div>
                  <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-orange-100 to-blue-400 uppercase">
                    JUGNU XR: <br className="hidden md:inline" />
                    LIVE SPORTS IN LIVING ROOMS
                  </h1>
                  <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                    Redefining live sports. We transform raw athletic coordinates into interactive 3D dioramas delivered instantly to lightweight web browsers.
                  </p>
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10 flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-orange-500" />
                    <div className="text-xs font-mono text-slate-400">
                      SYS_LOG: Tabletop coordinates syncing @ 90Hz directly to your browser.
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

            {/* Slide 1: The Problem */}
            {currentSlide === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                    <span>THE FRICTION // NATIVE APP BARRIER</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                    THE NATIVE APP STORE FRICTION
                  </h2>
                  <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                    Most spatial headsets suffer from slow loading times, high storage overhead, and complex sideloading setups. Forcing users to download gigabytes of app data before viewing a match creates a major barrier for live, real-time sports broadcasting.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <div className="flex items-center gap-2 text-orange-400 font-mono text-xs font-bold mb-1">
                        <Terminal className="w-4 h-4 shrink-0" />
                        <span>SLOW ITERATIONS</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">App Store reviews delay critical live event updates.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <div className="flex items-center gap-2 text-orange-400 font-mono text-xs font-bold mb-1">
                        <Layers className="w-4 h-4 shrink-0" />
                        <span>STORAGE LIMITS</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Headset memory limits restrict active user libraries.</p>
                    </div>
                  </div>
                </div>
                
                <div className="lg:col-span-5 flex justify-center">
                  <div className="max-w-[360px] w-full rounded-xl overflow-hidden border border-orange-500/25 shadow-[0_0_20px_rgba(240,125,0,0.1)] relative group">
                    <img 
                      src="./app-store-friction.png" 
                      alt="App Store Friction Visual" 
                      className="w-full h-auto object-cover transform group-hover:scale-102 transition-transform duration-75"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Slide 2: Technology Stack (The Solution) */}
            {currentSlide === 2 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>THE SOLUTION // ZERO-INSTALL WEBXR</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  ZERO-INSTALL HEADSET WEBXR BROWSERS
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  Skip heavy store downloads. Our pure WebGL client runs directly inside Quest 3, Apple Vision Pro, and spatial computing browsers with near-zero setup latency.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                        <Cpu className="w-5 h-5 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Zero-GC Rendering</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Pre-allocated vectors ensure zero frame drops during fast sports action.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">STABILIZED THREADS</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                        <Layers className="w-5 h-5 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Dynamic Voxel Splines</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Procedural compression for fast real-time headset streaming.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-orange-400/70 mt-4 uppercase">120:1 COMPRESSION</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                        <Radio className="w-5 h-5 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-sans font-bold text-slate-100">Spatial Audio</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Procedural oscillators localized by head movement in XR.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">WEBAUDIO APIS</span>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 3: Interactive Broadcasts (Compass & Showcase) */}
            {currentSlide === 3 && (
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

            {/* Slide 4: Jugnu AI Companion */}
            {currentSlide === 4 && (
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
                    A spatial AI system inside your diorama that calculates game parameters and translates raw data into real-time spoken insights.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <h4 className="font-sans font-bold text-slate-200 text-xs">Acoustics Synthesis</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Real-time velocity and sound mapping.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/10">
                      <h4 className="font-sans font-bold text-slate-200 text-xs">Adaptive Expressions</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Dynamic reaction to events and gestures.</p>
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

            {/* Slide 5: Telemetry Hub & Benchmarking */}
            {currentSlide === 5 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>REAL-TIME ENGINE TELEMETRY // ADJUST LOAD CAPACITY</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  TELEMETRY TUNER & CALIBRATION HUB
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  Real-time rendering priority dashboard. Adjust thread loads and inspect live performance metrics.
                </p>

                <div className="pt-2">
                  <TelemetryHub />
                </div>
              </div>
            )}

            {/* Slide 6: Web advantages & Monetization */}
            {currentSlide === 6 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>MARKET FIT // SCALABILITY & MONETIZATION</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  THE SPATIAL WEB DISRUPTION & MONETIZATION
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  Delivering live volumetric broadcasts via URL links eliminates friction. We monetize through simple spatial subscriptions, interactive merchandise, and volumetric ticketing.
                </p>
                
                {/* Monetization Plan Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">PLAN 01</span>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-1">STANDARD ACCESS</h3>
                      <span className="text-[11px] font-mono text-orange-400 block mt-1">Basic Spectator Plan</span>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                        Features standard diorama streams and ad-supported spectator views. Designed to introduce new viewers to tabletop sports broadcasts.
                      </p>
                    </div>
                    <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] font-mono text-slate-500">
                      FUTURE SCOPE: WebGL public streaming chat rooms.
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/80 border border-orange-500/30 flex flex-col justify-between hover:border-orange-500/60 transition-all duration-300 relative shadow-[0_0_20px_rgba(240,125,0,0.05)]">
                    <div className="absolute -top-3 right-4 px-2 py-0.5 bg-orange-500 text-slate-950 font-mono text-[8px] font-bold rounded-full uppercase tracking-wider">
                      RECOMMENDED
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest font-semibold">PLAN 02</span>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-1">HOLOGRAPHIC PRO</h3>
                      <span className="text-[11px] font-mono text-orange-450 text-orange-400 block mt-1">Advanced Volumetric Suite</span>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                        Provides Ultra-HD streaming, 5 diorama angles, and real-time player telemetry overlays. Best for sports fans wanting complete view control.
                      </p>
                    </div>
                    <div className="border-t border-orange-500/10 pt-3 mt-4 text-[10px] font-mono text-slate-500">
                      FUTURE SCOPE: Volumetric replays & customizable camera tracks.
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">PLAN 03</span>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-1">ALL-ACCESS PASS</h3>
                      <span className="text-[11px] font-mono text-orange-400 block mt-1">Social Spectator Tier</span>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                        Includes entry to virtual VIP lounges, custom spectator avatar accessories, and priorities for volumetric merchandise store launches.
                      </p>
                    </div>
                    <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] font-mono text-slate-500">
                      FUTURE SCOPE: Multi-spectator social lobbies & shared diorama spaces.
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-orange-500/10">
                  <span className="text-[10px] font-mono text-slate-500 block uppercase mb-3">DEPLOYMENT ADVANTAGES MATRIX</span>
                  <WebAdvantages />
                </div>
              </div>
            )}

            {/* Slide 7: Roadmap & Vision */}
            {currentSlide === 7 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full">
                  <span>FUTURE OUTLOOK // ROADMAP</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  SHAPING THE VOLUMETRIC SPORTS ERA
                </h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
                  We are building the future of immersive sports viewing. Our pipeline extends from real-time stadium tracking to multi-user fan rooms and premium sponsorship layers.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="text-orange-400 font-mono text-sm font-bold">PHASE 1 (Q3 2026)</div>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Diorama Live Streaming</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Integrating live multi-camera diorama streaming nodes from stadium broadcasts.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="text-orange-400 font-mono text-sm font-bold">PHASE 2 (Q4 2026)</div>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Social Lobbies</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Shared spectator social lobbies and avatar interaction spaces directly in the diorama room.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                    <div>
                      <div className="text-orange-400 font-mono text-sm font-bold">PHASE 3 (Q1 2027)</div>
                      <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Spatial Ticketing</h3>
                      <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                        Launching spatial ticket passes, volumetric ads campaigns, and interactive brand sponsors.
                      </p>
                    </div>
                  </div>
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
          {/* Section 0: Hero Section */}
          <Hero 
            onTriggerScan={triggerScanningSequence} 
            isScanning={isScanning} 
            activeSportName={getSportName()}
          />

          {/* Section 1: The Problem (App Store Friction) */}
          <section className="relative z-10 max-w-7xl mx-auto px-4 py-12 border-t border-orange-500/10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-6">
                <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
                  THE FRICTION // NATIVE APP BARRIER
                </span>
                <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
                  THE NATIVE APP STORE FRICTION
                </h2>
                <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                  Most spatial headsets suffer from slow loading times, high storage overhead, and complex sideloading setups. Forcing users to download gigabytes of app data before viewing a match creates a major barrier for live, real-time sports broadcasting.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/15 backdrop-blur-md">
                    <div className="flex items-center gap-2 text-orange-400 font-mono text-xs font-bold mb-1">
                      <Terminal className="w-4 h-4 shrink-0" />
                      <span>SLOW ITERATIONS</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">App Store reviews delay critical live event updates.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/15 backdrop-blur-md">
                    <div className="flex items-center gap-2 text-orange-400 font-mono text-xs font-bold mb-1">
                      <Layers className="w-4 h-4 shrink-0" />
                      <span>STORAGE LIMITS</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Headset memory limits restrict active user libraries.</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 flex justify-center">
                <div className="max-w-[400px] w-full rounded-xl overflow-hidden border border-orange-500/25 shadow-[0_0_20px_rgba(240,125,0,0.1)] relative group">
                  <img 
                    src="./app-store-friction.png" 
                    alt="App Store Friction Visual" 
                    className="w-full h-auto object-cover transform group-hover:scale-102 transition-transform duration-75"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Zero-Install Volumetric Architecture */}
          <section className="relative z-10 max-w-7xl mx-auto px-4 py-12 border-t border-orange-500/10">
            <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
              THE SOLUTION // ZERO-INSTALL WEBXR
            </span>
            <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
              ZERO-INSTALL HEADSET WEBXR BROWSERS
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mt-2 max-w-3xl">
              Skip heavy store downloads. Our pure WebGL client runs directly inside Quest 3, Apple Vision Pro, and spatial computing browsers with near-zero setup latency.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                    <Cpu className="w-5 h-5 text-orange-400" />
                  </div>
                  <h3 className="text-base font-sans font-bold text-slate-100">Zero-GC Rendering</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Pre-allocated vectors ensure zero frame drops during fast sports action.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">STABILIZED THREADS</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                    <Layers className="w-5 h-5 text-orange-400" />
                  </div>
                  <h3 className="text-base font-sans font-bold text-slate-100">Dynamic Voxel Splines</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Procedural compression for fast real-time headset streaming.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-orange-400/70 mt-4 uppercase">120:1 COMPRESSION</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-all">
                    <Radio className="w-5 h-5 text-orange-400" />
                  </div>
                  <h3 className="text-base font-sans font-bold text-slate-100">Spatial Audio</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Procedural oscillators localized by head movement in XR.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-orange-500/70 mt-4 uppercase">WEBAUDIO APIS</span>
              </div>
            </div>
          </section>

          {/* Section 3: Interactive Sandbox (Action Compass & Stadium Dioramas) */}
          <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border-t border-orange-500/10">
            
            {/* Left Side Pitch Summary Box (7 columns) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
                  LIVE TELEMETRY FEEDS // TRY INTERACTING
                </span>
                <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
                  PROCEDURAL STADIUM DIORAMAS
                </h2>
                <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                  Shift live feeds instantly between stadiums. Lock onto venues, view ball flight arcs, and calculate real-time diorama angles on your desk.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
                
                <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/20 backdrop-blur-md">
                  <div className="text-xl font-mono font-bold text-orange-400">Jugnu</div>
                  <div className="text-[10px] font-mono text-orange-500/80 uppercase mt-1">VISUAL COMPANION</div>
                  <p className="text-[11px] text-slate-400 mt-1">Interactive floating 3D companion rendering emotional telemetry and voice updates.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/20 backdrop-blur-md">
                  <div className="text-xl font-mono font-bold text-orange-400">Minimaps</div>
                  <div className="text-[10px] font-mono text-orange-500/80 uppercase mt-1">LIVE SPORTS VIEW</div>
                  <p className="text-[11px] text-slate-400 mt-1">Procedural overlays, stadium coordinate maps, and real-time play trajectories.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/45 border border-orange-500/20 backdrop-blur-md">
                  <div className="text-2xl font-mono font-bold text-orange-400">WebXR</div>
                  <div className="text-[10px] font-mono text-orange-500/80 uppercase mt-1">OPEN PROTOCOLS</div>
                  <p className="text-[11px] text-slate-400 mt-1">A single unified codebase running across Quest 3, Apple Vision Pro, and mobiles.</p>
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

          {/* Section 4: Floating Spatial Companion: Jugnu Core */}
          <JugnuCompanion />

          {/* Section 5: Software Development Cycle (SDC) & Telemetry Hub tuner */}
          <TelemetryHub />

          {/* Section 6: Web-based Advantages Bento grid & Monetization Plans */}
          <section className="relative z-10 max-w-7xl mx-auto px-4 py-12 border-t border-orange-500/10">
            <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
              MARKET FIT // SCALABILITY & MONETIZATION
            </span>
            <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
              THE SPATIAL WEB DISRUPTION & MONETIZATION
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mt-2 max-w-3xl">
              Delivering live volumetric broadcasts via URL links eliminates friction. We monetize through simple spatial subscriptions, premium interactive virtual merchandise, and digital ticket access.
            </p>

            {/* Monetization Plan Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="p-6 rounded-2xl bg-slate-950/45 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/30 transition-all duration-300 backdrop-blur-md">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">PLAN 01</span>
                  <h3 className="text-xl font-sans font-bold text-slate-100 mt-1">STANDARD ACCESS</h3>
                  <span className="text-xs font-mono text-orange-400 block mt-1">Basic Spectator Plan</span>
                  <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Features standard diorama streams and ad-supported spectator views. Designed to introduce new viewers to tabletop sports broadcasts.
                  </p>
                </div>
                <div className="border-t border-slate-800/60 pt-4 mt-6 text-xs font-mono text-slate-500">
                  FUTURE SCOPE: WebGL public streaming chat rooms.
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/85 border border-orange-500/30 flex flex-col justify-between hover:border-orange-500/50 transition-all duration-300 relative shadow-[0_0_25px_rgba(240,125,0,0.08)] backdrop-blur-md">
                <div className="absolute -top-3.5 right-6 px-3 py-1 bg-orange-500 text-slate-950 font-mono text-[9px] font-bold rounded-full uppercase tracking-wider">
                  RECOMMENDED
                </div>
                <div>
                  <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest font-semibold">PLAN 02</span>
                  <h3 className="text-xl font-sans font-bold text-slate-100 mt-1">HOLOGRAPHIC PRO</h3>
                  <span className="text-xs font-mono text-orange-400 block mt-1">Advanced Volumetric Suite</span>
                  <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Provides Ultra-HD streaming, 5 diorama angles, and real-time player telemetry overlays. Best for sports fans wanting complete view control.
                  </p>
                </div>
                <div className="border-t border-orange-500/10 pt-4 mt-6 text-xs font-mono text-slate-500">
                  FUTURE SCOPE: Volumetric replays & customizable camera tracks.
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/45 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/30 transition-all duration-300 backdrop-blur-md">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">PLAN 03</span>
                  <h3 className="text-xl font-sans font-bold text-slate-100 mt-1">ALL-ACCESS PASS</h3>
                  <span className="text-xs font-mono text-orange-400 block mt-1">Social Spectator Tier</span>
                  <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Includes entry to virtual VIP lounges, custom spectator avatar accessories, and priorities for volumetric merchandise store launches.
                  </p>
                </div>
                <div className="border-t border-slate-800/60 pt-4 mt-6 text-xs font-mono text-slate-500">
                  FUTURE SCOPE: Multi-spectator social lobbies & shared diorama spaces.
                </div>
              </div>
            </div>

            <div className="mt-12 pt-12 border-t border-orange-500/10">
              <span className="text-xs font-mono text-slate-500 block uppercase mb-6">DEPLOYMENT ADVANTAGES MATRIX</span>
              <WebAdvantages />
            </div>
          </section>

          {/* Section 7: Volumetric Roadmap */}
          <section className="relative z-10 max-w-7xl mx-auto px-4 py-12 border-t border-orange-500/10">
            <span className="px-2 py-1 text-[10px] font-mono tracking-widest bg-slate-950/80 border border-orange-500/30 text-orange-400 rounded-md">
              FUTURE OUTLOOK // ROADMAP
            </span>
            <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight text-white mt-1">
              SHAPING THE VOLUMETRIC SPORTS ERA
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mt-2 max-w-3xl">
              We are building the future of immersive sports viewing. Our pipeline extends from real-time stadium tracking to multi-user fan rooms and premium sponsorship layers.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="text-orange-400 font-mono text-sm font-bold">PHASE 1 (Q3 2026)</div>
                  <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Diorama Live Streaming</h3>
                  <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                    Integrating live multi-camera diorama streaming nodes from stadium broadcasts.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="text-orange-400 font-mono text-sm font-bold">PHASE 2 (Q4 2026)</div>
                  <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Social Lobbies</h3>
                  <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                    Shared spectator social lobbies and avatar interaction spaces directly in the diorama room.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/60 border border-orange-500/15 flex flex-col justify-between hover:border-orange-500/40 transition-all duration-300 group">
                <div>
                  <div className="text-orange-400 font-mono text-sm font-bold">PHASE 3 (Q1 2027)</div>
                  <h3 className="text-base font-sans font-bold text-slate-100 mt-2">Spatial Ticketing</h3>
                  <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
                    Launching spatial ticket passes, volumetric ads campaigns, and interactive brand sponsors.
                  </p>
                </div>
              </div>
            </div>
          </section>
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
