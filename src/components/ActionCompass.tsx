import React, { useState, useEffect } from 'react';
import { Trophy, Dribbble, Flame, Gauge, Compass, RotateCw } from 'lucide-react';
import { SportType } from '../types';
import { playBeep } from '../utils/audio';

interface ActionCompassProps {
  activeSport: SportType;
  onChangeSport: (sport: SportType) => void;
}

export default function ActionCompass({ activeSport, onChangeSport }: ActionCompassProps) {
  const [bearing, setBearing] = useState(128.4);
  const [rotationAngle, setRotationAngle] = useState(0);

  // Slowly fluctuate bearing to feel live/active
  useEffect(() => {
    const interval = setInterval(() => {
      setBearing((prev) => {
        const delta = (Math.random() - 0.5) * 0.4;
        return parseFloat((prev + delta).toFixed(1));
      });
      setRotationAngle((prev) => (prev + 0.2) % 360);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const sportsList: { id: SportType; name: string; stadium: string; icon: React.ReactNode; color: string; desc: string; angle: number; city: string }[] = [
    { 
      id: 'cricket', 
      name: 'Cricket', 
      stadium: 'Wankhede Stadium', 
      icon: <Trophy className="w-5 h-5" />, 
      color: 'text-cyber-gold border-cyber-gold shadow-cyber-gold/20', 
      desc: 'Hawk-Eye Volumetric Trajectories & Flashing Stumps',
      angle: 0,
      city: 'MUM'
    },
    { 
      id: 'basketball', 
      name: 'Basketball', 
      stadium: 'Crypto.com Arena', 
      icon: <Dribbble className="w-5 h-5" />, 
      color: 'text-cyber-purple border-cyber-purple shadow-cyber-purple/20', 
      desc: 'High-Gloss Hardwood Reflections & Live Telemetry',
      angle: 90,
      city: 'LAX'
    },
    { 
      id: 'football', 
      name: 'Football', 
      stadium: 'Olympiastadion', 
      icon: <Flame className="w-5 h-5" />, 
      color: 'text-emerald-400 border-emerald-400 shadow-emerald-400/20', 
      desc: 'Transparent Field Bases & Volumetric Tactical Overlays',
      angle: 180,
      city: 'BER'
    },
    { 
      id: 'f1', 
      name: 'Formula 1', 
      stadium: 'Monaco GP Chicane', 
      icon: <Gauge className="w-5 h-5" />, 
      color: 'text-slate-300 border-slate-300 shadow-slate-300/20', 
      desc: 'Volumetric Mini Circuits & Real-time Monaco Telemetry',
      angle: 270,
      city: 'MCO'
    },
  ];

  const handleSelect = (id: SportType, idx: number) => {
    // Spatial panning based on index (left to right)
    const pan = (idx / (sportsList.length - 1)) * 2 - 1;
    playBeep(400 + idx * 100, 'triangle', 0.15, pan);
    onChangeSport(id);
  };

  const getThemeAccentClass = () => {
    switch (activeSport) {
      case 'cricket': return 'text-cyber-gold border-cyber-gold/30';
      case 'basketball': return 'text-cyber-purple border-cyber-purple/30';
      case 'football': return 'text-emerald-400 border-emerald-400/30';
      case 'f1': return 'text-red-400 border-red-400/30';
    }
  };

  const getThemeBgClass = () => {
    switch (activeSport) {
      case 'cricket': return 'bg-cyber-gold/10 text-cyber-gold';
      case 'basketball': return 'bg-cyber-purple/10 text-cyber-purple';
      case 'football': return 'bg-emerald-500/10 text-emerald-400';
      case 'f1': return 'bg-red-500/10 text-red-400';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-950/40 border border-red-500/20 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-2xl">
      
      {/* Absolute futuristic markings */}
      <div className="absolute top-3 left-4 text-[10px] font-mono tracking-widest text-red-500/50">
        COMPASS MODULE v4.2 // SYS_RADAR
      </div>
      <div className="absolute top-3 right-4 text-[10px] font-mono tracking-widest text-red-500/50">
        AZIMUTH: {bearing}° N
      </div>
      
      {/* Title */}
      <div className="text-center mb-6">
        <h3 className="text-xs font-mono uppercase tracking-[0.25em] text-red-500/70">
          Mixed Reality Input Engine
        </h3>
        <h4 className="text-xl font-sans font-bold tracking-tight mt-1 text-slate-100 flex items-center justify-center gap-2">
          <Compass className="w-5 h-5 text-red-400 animate-spin" style={{ animationDuration: '10s' }} />
          ACTION COMPASS
        </h4>
      </div>

      {/* Radial Dial Container */}
      <div className="relative w-72 h-72 flex items-center justify-center my-4">
        
        {/* Outer Concentric Ring 1 (Slow Clockwise Rotation) */}
        <div 
          className="absolute inset-0 rounded-full border border-dashed border-slate-700/60"
          style={{ transform: `rotate(${rotationAngle}deg)` }}
        />

        {/* Concentric Ring 2 (Counter Clockwise Rotation) */}
        <div 
          className="absolute inset-4 rounded-full border border-slate-800/80 flex items-center justify-center"
          style={{ transform: `rotate(${-rotationAngle * 1.5}deg)` }}
        >
          {/* Tick Marks on outer ring */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-3 bg-slate-700/50"
              style={{
                transform: `rotate(${i * 30}deg) translateY(-120px)`,
              }}
            />
          ))}
        </div>

        {/* Concentric Ring 3 (Active Accent Indicator) */}
        <div className={`absolute inset-8 rounded-full border border-double ${getThemeAccentClass()} transition-colors duration-500`} />

        {/* Central Display Panel */}
        <div className="absolute inset-16 rounded-full bg-slate-950/90 border border-slate-800 flex flex-col items-center justify-center text-center p-3 z-10 shadow-2xl">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Stadium Locked</span>
          <span className="text-sm font-sans font-bold text-slate-100 leading-tight truncate max-w-[130px]">
            {sportsList.find(s => s.id === activeSport)?.stadium.split(' ')[0]}
          </span>
          <span className="text-[9px] font-mono text-slate-400 mt-0.5 tracking-wider">
            {sportsList.find(s => s.id === activeSport)?.city} // 44.5° E
          </span>
          
          <div className="mt-2 text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[10px] text-slate-300">BEARING {bearing}°</span>
          </div>
        </div>

        {/* Sports Dial Node Buttons, placed around the circle */}
        {sportsList.map((sport, idx) => {
          const isActive = activeSport === sport.id;
          // Calculate polar coordinates for placement
          const theta = (sport.angle - 90) * (Math.PI / 180);
          const radius = 112; // Radius of button center
          const x = Math.round(radius * Math.cos(theta));
          const y = Math.round(radius * Math.sin(theta));

          return (
            <button
              id={`compass-dial-${sport.id}`}
              key={sport.id}
              onClick={() => handleSelect(sport.id, idx)}
              className={`absolute w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer z-20 group
                ${isActive 
                  ? `${getThemeBgClass()} border-2 scale-110 shadow-[0_0_15px_rgba(255,0,60,0.3)]` 
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-800 hover:border-slate-700 scale-100'
                }`}
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
              title={`Switch Stadium: ${sport.stadium}`}
            >
              <div className="relative flex items-center justify-center">
                {sport.icon}
                {/* Micro LED glowing dot */}
                <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-950 transition-colors duration-300
                  ${isActive ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} 
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Legend description */}
      <div className="w-full mt-4 p-3 rounded-xl bg-slate-950/70 border border-red-500/10 text-center">
        <div className="text-xs font-mono text-red-400">
          ACTIVE SYSTEM: <span className="text-red-400 uppercase font-bold">{activeSport}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
          {sportsList.find(s => s.id === activeSport)?.desc}
        </p>
      </div>

      {/* Manual rotate utility marker */}
      <div className="w-full flex justify-between items-center mt-3 px-2 text-[10px] font-mono text-red-500/50">
        <span className="flex items-center gap-1">
          <RotateCw className="w-3 h-3 animate-spin" style={{ animationDuration: '15s' }} />
          STADIUM DEPTH: OPTIMAL
        </span>
        <span>LAT: 19.076N, LON: 72.825E</span>
      </div>
    </div>
  );
}
