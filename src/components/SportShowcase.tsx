import React, { useState, useEffect, useRef } from 'react';
import { SportType } from '../types';
import { playBeep } from '../utils/audio';
import { Trophy, Dribbble, Flame, Gauge, Zap, Play, RotateCcw, UserCheck, BarChart2 } from 'lucide-react';

interface SportShowcaseProps {
  activeSport: SportType;
  onChangeSport: (sport: SportType) => void;
}

export default function SportShowcase({ activeSport, onChangeSport }: SportShowcaseProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isSimulating, setIsSimulating] = useState(true);
  const [triggerReset, setTriggerReset] = useState(0);

  // Synchronize state trigger beeps on tab changes
  const handleTabSelect = (sport: SportType) => {
    playBeep(520, 'sine', 0.1, 0);
    onChangeSport(sport);
  };

  // Canvas-based animations for the selected sport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle responsive sizing
    let animationId: number;
    const resizeObserver = new ResizeObserver(() => {
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = Math.min(360, canvas.parentElement.clientHeight || 360);
      }
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Animation state variables
    let frame = 0;
    
    // Cricket specific
    let ballProgress = 0;
    const cricketTrajectoryPoints: {x: number, y: number}[] = [];
    const splineSteps = 100;
    // Cricket stumps coordinates
    const stumpX = 450;
    const stumpY = 200;
    
    // F1 specific
    let f1CarPosition = 0;
    const f1Track: {x: number, y: number}[] = [
      { x: 50, y: 150 },
      { x: 150, y: 90 },
      { x: 300, y: 100 },
      { x: 350, y: 220 },
      { x: 260, y: 260 },
      { x: 160, y: 230 },
      { x: 100, y: 310 },
      { x: 50, y: 150 }
    ];

    // Basketball specific players
    const players = [
      { id: '32', x: 120, y: 160, vx: 0.5, vy: -0.3, name: 'S. Curry', label: 'ACC: 89%' },
      { id: '23', x: 380, y: 220, vx: -0.4, vy: 0.4, name: 'LeBron J.', label: 'ACC: 94%' },
      { id: '07', x: 250, y: 120, vx: 0.6, vy: 0.2, name: 'K. Durant', label: 'ACC: 91%' },
    ];

    // Football players
    const footballTactical = [
      { id: '10', originX: 80, originY: 180, targetX: 280, targetY: 100, label: 'L. Messi' },
      { id: '09', originX: 110, originY: 260, targetX: 310, targetY: 240, label: 'H. Kane' },
      { id: '08', originX: 200, originY: 150, targetX: 420, targetY: 180, label: 'K. De Bruyne' },
    ];

    // Precalculate Cricket trajectory using Bezier or Spline (Catmull-Rom approximation)
    const getCricketPoint = (t: number, w: number, h: number) => {
      // Start of pitch at bottom left, bounce on pitch, hit/miss stump on right
      const startX = w * 0.15;
      const startY = h * 0.75;
      
      const bounceX = w * 0.65;
      const bounceY = h * 0.85; // land grass
      
      const endX = w * 0.82;
      const endY = h * 0.45; // stumps height
      
      if (t < 0.65) {
        // First arc (from bowler release to landing grass bounce)
        const localT = t / 0.65;
        const x = startX + (bounceX - startX) * localT;
        // Parabolic arc
        const height = h * 0.4;
        const y = startY + (bounceY - startY) * localT - Math.sin(localT * Math.PI) * height;
        return { x, y };
      } else {
        // Second arc (from bounce upward to hit stumps)
        const localT = (t - 0.65) / 0.35;
        const x = bounceX + (endX - bounceX) * localT;
        const height = h * 0.12;
        const y = bounceY + (endY - bounceY) * localT - Math.sin(localT * Math.PI) * height;
        return { x, y };
      }
    };

    // Main render loop
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      
      if (w === 0 || h === 0) {
        animationId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, w, h);
      frame++;

      // DRAW TECH GRID OVERLAY IN BACKGROUND
      ctx.strokeStyle = 'rgba(255, 0, 60, 0.08)';
      ctx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // RENDER SPORT-SPECIFIC HOLOGRAMS
      if (activeSport === 'cricket') {
        // --- 1. CRICKET (WANKHEDE STADIUM) ---
        // Render isometric tabletop boundary
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.2)';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(11, 15, 25, 0.65)';
        
        // Stadium Tabletop Oval Frame
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Stadium Outer boundary rings
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.37, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Draw pitch center line
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.15)';
        ctx.beginPath();
        ctx.moveTo(w * 0.12, h * 0.72);
        ctx.lineTo(w * 0.85, h * 0.42);
        ctx.stroke();

        // Draw Stumps
        const stX = w * 0.82;
        const stY = h * 0.48;
        const bailsOn = ballProgress < 0.98;

        // Draw stumps (3 vertical lines)
        ctx.strokeStyle = bailsOn ? 'rgba(255, 255, 255, 0.7)' : 'rgba(239, 68, 68, 0.9)';
        ctx.shadowColor = bailsOn ? 'transparent' : '#ef4444';
        ctx.shadowBlur = bailsOn ? 0 : 12;
        ctx.lineWidth = 3;
        
        for (let i = -6; i <= 6; i += 6) {
          ctx.beginPath();
          ctx.moveTo(stX + i, stY);
          ctx.lineTo(stX + i, stY - 28);
          ctx.stroke();
        }
        // Draw bails
        ctx.beginPath();
        ctx.moveTo(stX - 8, stY - 28);
        ctx.lineTo(stX + 8, stY - 28);
        ctx.stroke();
        
        ctx.shadowBlur = 0; // reset

        // Draw Hawk-Eye Spline path
        if (isSimulating) {
          ballProgress += 0.006;
          if (ballProgress > 1.2) ballProgress = 0; // Loop ball deliver
        }

        const ballPos = getCricketPoint(Math.min(ballProgress, 1), w, h);

        // Draw historical path ribbon
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.85)';
        ctx.shadowColor = '#ff003c';
        ctx.shadowBlur = 6;
        
        for (let t = 0; t <= Math.min(ballProgress, 1); t += 0.02) {
          const pt = getCricketPoint(t, w, h);
          if (t === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // Landing grass bounce radar ripples
        if (ballProgress >= 0.65) {
          const bouncePt = getCricketPoint(0.65, w, h);
          const rippleRadius = (ballProgress - 0.65) * 80;
          const rippleOpacity = Math.max(0, 1 - (ballProgress - 0.65) * 2.5);
          
          ctx.strokeStyle = `rgba(255, 0, 60, ${rippleOpacity})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(bouncePt.x, bouncePt.y, rippleRadius, rippleRadius * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Bowl impact stump alert (Wicket dismissal splash)
        if (ballProgress >= 0.98 && ballProgress < 1.15) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(stX, stY - 15, 35, 20, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Spasm flashing stumps spark particles
          ctx.fillStyle = '#ef4444';
          for (let p = 0; p < 8; p++) {
            const angle = (p / 8) * Math.PI * 2 + frame * 0.1;
            const rx = stX + Math.cos(angle) * 25 * (ballProgress - 0.98 + 0.2);
            const ry = (stY - 15) + Math.sin(angle) * 12 * (ballProgress - 0.98 + 0.2);
            ctx.beginPath();
            ctx.arc(rx, ry, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Wicket text box overlay
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('STUMPS DISMISSED', stX - 45, stY - 45);
        }

        // Active Delivery ball indicator
        if (ballProgress <= 1.0) {
          ctx.fillStyle = '#ffb347';
          ctx.shadowColor = '#ffb347';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(ballPos.x, ballPos.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }

        // Live stats table tag
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(15, 15, 180, 50);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('DELIVERY SPEED: 144.2 KM/H', 25, 30);
        ctx.fillStyle = '#ff003c';
        ctx.fillText('DEVIATION: +1.8° OUTSWING', 25, 42);
        ctx.fillStyle = '#ef4444';
        ctx.fillText('OUTCOME: WICKET (BOWLED)', 25, 54);

      } else if (activeSport === 'basketball') {
        // --- 2. BASKETBALL (CRYPTO.COM ARENA) ---
        // Render high gloss court flooring representation
        ctx.strokeStyle = 'rgba(109, 40, 217, 0.25)';
        ctx.lineWidth = 2;
        
        // Render 3D angled court boundaries
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h * 0.2);
        ctx.lineTo(w * 0.9, h * 0.2);
        ctx.lineTo(w * 0.8, h * 0.85);
        ctx.lineTo(w * 0.2, h * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Semi-circles and central hardwood line reflections
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.3)';
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.2, h * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 3-point lines
        ctx.strokeStyle = 'rgba(109, 40, 217, 0.4)';
        ctx.beginPath();
        ctx.ellipse(w * 0.15, h / 2, w * 0.15, h * 0.2, 0, -Math.PI/2, Math.PI/2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(w * 0.85, h / 2, w * 0.15, h * 0.2, 0, Math.PI/2, -Math.PI/2);
        ctx.stroke();

        // Moving live player markers with telemetry lines
        players.forEach((player, index) => {
          if (isSimulating) {
            // Boundary collision checks & update
            player.x += player.vx;
            player.y += player.vy;
            if (player.x < w * 0.2 || player.x > w * 0.8) player.vx *= -1;
            if (player.y < h * 0.25 || player.y > h * 0.75) player.vy *= -1;
          }

          const hoverPulse = Math.sin(frame * 0.05 + index) * 4;

          // Draw cylinder holographic base
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(player.x, player.y, 14, 6, 0, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw cylinder stem
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.15)';
          ctx.beginPath();
          ctx.moveTo(player.x, player.y);
          ctx.lineTo(player.x, player.y - 15 - hoverPulse);
          ctx.stroke();

          // Player Node Orb
          ctx.fillStyle = index === 0 ? '#ff003c' : '#6d28d9';
          ctx.beginPath();
          ctx.arc(player.x, player.y - 15 - hoverPulse, 6, 0, Math.PI * 2);
          ctx.fill();

          // Label Telemetry card next to player
          ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
          ctx.strokeStyle = 'rgba(109, 40, 217, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.rect(player.x + 10, player.y - 30 - hoverPulse, 85, 26);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(player.name, player.x + 14, player.y - 20 - hoverPulse);
          ctx.fillStyle = '#ffb347';
          ctx.fillText(player.label, player.x + 14, player.y - 11 - hoverPulse);
        });

        // Hoop 3D visual projection
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(w * 0.85, h / 2 - 20, 10, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255, 179, 71, 0.2)';
        ctx.beginPath();
        ctx.moveTo(w * 0.85, h / 2 - 20);
        ctx.lineTo(w * 0.85, h / 2 + 10);
        ctx.stroke();

      } else if (activeSport === 'football') {
        // --- 3. FOOTBALL (OLYMPIASTADION) ---
        // Semi-transparent soccer field grid lines
        ctx.fillStyle = 'rgba(2, 44, 25, 0.5)';
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1.5;
        
        // Drawing isometric grass lawn
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h * 0.2);
        ctx.lineTo(w * 0.85, h * 0.2);
        ctx.lineTo(w * 0.75, h * 0.85);
        ctx.lineTo(w * 0.25, h * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Center line & center circle
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, 45, 25, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.2);
        ctx.lineTo(w / 2, h * 0.85);
        ctx.stroke();

        // Penalty boxes
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h * 0.4);
        ctx.lineTo(w * 0.25, h * 0.4);
        ctx.lineTo(w * 0.25, h * 0.65);
        ctx.lineTo(w * 0.15, h * 0.65);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(w * 0.85, h * 0.4);
        ctx.lineTo(w * 0.75, h * 0.4);
        ctx.lineTo(w * 0.75, h * 0.65);
        ctx.lineTo(w * 0.85, h * 0.65);
        ctx.stroke();

        // Render Tactical Run cycle overlays
        footballTactical.forEach((tactic, idx) => {
          // Progress ratio loops
          const progress = isSimulating ? ((frame * 0.35 + idx * 30) % 100) / 100 : 0.5;
          const currX = tactic.originX + (tactic.targetX - tactic.originX) * progress;
          const currY = tactic.originY + (tactic.targetY - tactic.originY) * progress;

          // Drawing dashed route vectors
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.4)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(tactic.originX, tactic.originY);
          ctx.lineTo(tactic.targetX, tactic.targetY);
          ctx.stroke();
          ctx.setLineDash([]); // Reset line dash

          // Draw vector arrow at target
          ctx.fillStyle = 'rgba(255, 0, 60, 0.6)';
          ctx.beginPath();
          ctx.arc(tactic.targetX, tactic.targetY, 4, 0, Math.PI * 2);
          ctx.fill();

          // Player Node
          ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
          ctx.beginPath();
          ctx.arc(currX, currY, 6, 0, Math.PI * 2);
          ctx.fill();

          // Player Tag Label
          ctx.fillStyle = '#ffffff';
          ctx.font = '7px monospace';
          ctx.fillText(`${tactic.label} (${tactic.id})`, currX - 25, currY - 10);
        });

        // Volumetric visual overlay banner
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(w - 190, 15, 175, 45);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('TACTICAL ALGORITHM ENGAGED', w - 180, 28);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('SYSTEM: PRESSING-FORWARD_A', w - 180, 39);

      } else if (activeSport === 'f1') {
        // --- 4. FORMULA 1 (MONACO GP) ---
        // Render 3D circuit spline
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Monaco Chicane spline representation
        ctx.beginPath();
        f1Track.forEach((pt, index) => {
          if (index === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.stroke();

        // Overlay circuit inner core glow
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.1)';
        ctx.lineWidth = 14;
        ctx.stroke();

        // Calculate car coordinates along circuit
        if (isSimulating) {
          f1CarPosition += 0.003;
          if (f1CarPosition > 1.0) f1CarPosition = 0;
        }

        // Get exact segment position
        const trackLength = f1Track.length - 1;
        const index = Math.floor(f1CarPosition * trackLength);
        const segmentT = (f1CarPosition * trackLength) % 1;
        const p1 = f1Track[index];
        const p2 = f1Track[(index + 1) % f1Track.length];
        
        const carX = p1.x + (p2.x - p1.x) * segmentT;
        const carY = p1.y + (p2.y - p1.y) * segmentT;

        // Draw Car Glowing Beacon
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(carX, carY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Sector markers (S1, S2, Hairpin Chicane)
        ctx.fillStyle = '#ffb347';
        ctx.font = 'bold 8px font-sans';
        ctx.fillText('NOUVELLE CHICANE', 220, 180);
        
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(250, 190);
        ctx.lineTo(320, 215);
        ctx.stroke();

        // Driver live leaderboard in canvas
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(15, 15, 185, 70);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff003c';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('MONACO LEADERBOARD // LAP 54', 25, 28);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText('1. LEC  FERRARI  1:14.325 (ACTIVE)', 25, 42);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('2. VER  RED BULL +0.812s', 25, 54);
        ctx.fillText('3. HAM  MERCEDES +1.443s', 25, 66);

        // Speeds telemetry text block
        const simulatedSpeed = Math.floor(180 + Math.sin(frame * 0.05) * 80);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.rect(w - 150, h - 55, 135, 40);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffb347';
        ctx.fillText(`TELEMETRY: ${simulatedSpeed} KM/H`, w - 140, h - 40);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('GEAR: M5  RPM: 11400', w - 140, h - 25);
      }
    };

    const animationFrameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [activeSport, isSimulating, triggerReset]);

  // Generate dynamic subtitle descriptions based on selected tab
  const getSportDetails = () => {
    switch (activeSport) {
      case 'cricket':
        return {
          title: 'Cricket Volumetric Domain Expansion',
          stadium: 'Wankhede Stadium, Mumbai',
          fact: 'Synchronized with 36-camera array capturing ball flight trajectories at 240Hz, allowing fully immersive tabletop Hawk-Eye reviews in your room.',
        };
      case 'basketball':
        return {
          title: 'Basketball Cyber Floor Overlay',
          stadium: 'Crypto.com Arena, Los Angeles',
          fact: 'Ultra-low latency wearable sensor telemetry tracking dribbles, run speeds, player heat signatures, and high-frequency real-time shooting arcs.',
        };
      case 'football':
        return {
          title: 'Football Volumetric Tactical Projection',
          stadium: 'Olympiastadion, Berlin',
          fact: 'Translates standard wide broadcast frames into live instanced 3D player coordinates, yielding virtual holographic tactical analysis on any tabletop.',
        };
      case 'f1':
        return {
          title: 'Monaco GP Volumetric Mini Circuit',
          stadium: 'Monaco Chicane & Hairpin',
          fact: 'Pipes live 100Hz telemetry directly from cars to spatial nodes, recreating precise spatial coordinates and real-time speedometers on the mini-circuit.',
        };
    }
  };

  const currentDetails = getSportDetails();

  return (
    <section id="showcase-section" className="py-20 px-4 max-w-7xl mx-auto border-t border-red-500/20">
      
      {/* Title */}
      <div className="text-center mb-12">
        <span className="px-3 py-1 text-[10px] font-mono tracking-widest bg-slate-950/85 border border-red-500/30 text-red-400 rounded-md">
          DOMAIN EXPANSION CAPABILITY
        </span>
        <h2 className="text-3xl md:text-4xl font-sans font-extrabold uppercase mt-3 tracking-tight text-white">
          ANY SPORT. WE GOT IT.
        </h2>
        <p className="mt-2 text-slate-400 max-w-xl mx-auto text-sm">
          Select a sport sector below to interact with our real-time simulated spatial tabletop broadcasts.
        </p>
      </div>

      {/* Grid structure: Left side controls & specs, Right side simulator canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Left Column - Sport selection tabs and specs (4 Columns) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          
          <div className="space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-500/70">
              Interactive Sectors
            </span>
            
            {/* The 4 Glassmorphic Interactive Tabs */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              
              <button
                id="btn-sport-cricket"
                onClick={() => handleTabSelect('cricket')}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer backdrop-blur-md ${
                  activeSport === 'cricket'
                    ? 'bg-orange-500/10 border-orange-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-white'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border-red-500/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${activeSport === 'cricket' ? 'bg-orange-500/20' : 'bg-slate-950'}`}>
                  <Trophy className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="font-sans font-bold text-sm">Cricket (Wankhede)</div>
                  <div className="text-[10px] font-mono opacity-80">Hawk-Eye Trajectories</div>
                </div>
              </button>

              <button
                id="btn-sport-basketball"
                onClick={() => handleTabSelect('basketball')}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer backdrop-blur-md ${
                  activeSport === 'basketball'
                    ? 'bg-purple-500/15 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)] text-white'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border-red-500/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${activeSport === 'basketball' ? 'bg-purple-500/20' : 'bg-slate-950'}`}>
                  <Dribbble className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="font-sans font-bold text-sm">Basketball (Arena)</div>
                  <div className="text-[10px] font-mono opacity-80">Live Hardwood Overlay</div>
                </div>
              </button>

              <button
                id="btn-sport-football"
                onClick={() => handleTabSelect('football')}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer backdrop-blur-md ${
                  activeSport === 'football'
                    ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-white'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border-red-500/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${activeSport === 'football' ? 'bg-emerald-500/20' : 'bg-slate-950'}`}>
                  <Flame className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-sans font-bold text-sm">Football (Olympiastadion)</div>
                  <div className="text-[10px] font-mono opacity-80">Tactical Run Cycles</div>
                </div>
              </button>

              <button
                id="btn-sport-f1"
                onClick={() => handleTabSelect('f1')}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer backdrop-blur-md ${
                  activeSport === 'f1'
                    ? 'bg-red-500/15 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] text-white'
                    : 'bg-slate-900/60 hover:bg-slate-900/80 border-red-500/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${activeSport === 'f1' ? 'bg-red-500/20' : 'bg-slate-950'}`}>
                  <Gauge className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="font-sans font-bold text-sm">Formula 1 (Monaco GP)</div>
                  <div className="text-[10px] font-mono opacity-80">Volumetric Chicane Track</div>
                </div>
              </button>

            </div>
          </div>

          {/* Dynamic spec panel detailing technical details */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-red-500/20 space-y-3 mt-4 backdrop-blur-md shadow-2xl">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400">
              Sector Specifications
            </span>
            <h4 className="text-base font-sans font-bold text-slate-100 uppercase">
              {currentDetails.title}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {currentDetails.fact}
            </p>
            <div className="pt-3 border-t border-slate-900 grid grid-cols-2 gap-4 text-left">
              <div>
                <div className="text-[9px] font-mono text-slate-500 uppercase">Stadium lock</div>
                <div className="text-xs font-sans font-semibold text-slate-300 truncate">{currentDetails.stadium}</div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-slate-500 uppercase">Synchronization</div>
                <div className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 animate-pulse" />
                  REAL-TIME 100Hz
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Tablet / Canvas Live HUD (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 bg-slate-900/60 border border-red-500/20 rounded-3xl backdrop-blur-md relative shadow-2xl overflow-hidden min-h-[400px]">
          
          {/* Decorative HUD stats header */}
          <div className="flex justify-between items-center pb-4 border-b border-red-500/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-red-400">
                ACTIVE SIMULATION FEED
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono text-red-500/70">
              <span>VOLUMETRIC STREAM</span>
              <span className="text-red-400/80">LIVE MODE</span>
            </div>
          </div>

          {/* Canvas Rendering Area */}
          <div className="relative flex-grow flex items-center justify-center my-4 overflow-hidden rounded-xl bg-slate-950/80 border border-red-500/20 shadow-inner">
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full block cursor-crosshair"
            />
            
            {/* Subtle Overlay text watermark */}
            <div className="absolute bottom-3 left-3 text-[9px] font-mono text-red-500/40 tracking-wider pointer-events-none uppercase">
              RUSH_XR_SPATIAL_SIMULATOR // TYPE: {activeSport}
            </div>
          </div>

          {/* Canvas Interactive Controls bar */}
          <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-red-500/10">
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSimulating 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-slate-950 border-red-500/20 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
                title={isSimulating ? 'Pause active calculations' : 'Resume live coordinate engine'}
              >
                <Play className={`w-3 h-3 ${isSimulating ? 'text-emerald-400 fill-emerald-400/20' : 'text-slate-400'}`} />
                {isSimulating ? 'PAUSE LIVE CORDS' : 'RESUME SIMULATION'}
              </button>

              <button
                onClick={() => {
                  playBeep(450, 'triangle', 0.1);
                  setTriggerReset(prev => prev + 1);
                }}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-500/20 text-slate-400 hover:text-slate-200 rounded-lg text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                title="Restart spatial loop"
              >
                <RotateCcw className="w-3 h-3" />
                RESET STATE
              </button>
            </div>

            <div className="text-[10px] font-mono text-slate-500 flex items-center gap-3">
              <span className="flex items-center gap-1 text-slate-400">
                <UserCheck className="w-3 h-3 text-red-400" />
                HANDS TRACKING: ON
              </span>
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3 h-3" />
                STABLE: 90 FPS
              </span>
            </div>

          </div>

        </div>

      </div>

    </section>
  );
}
