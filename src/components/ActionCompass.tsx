import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SportType } from '../types';
import { playBeep } from '../utils/audio';

interface ActionCompassProps {
  activeSport: SportType;
  onChangeSport: (sport: SportType) => void;
}

const SPOKES = [
  { label: 'CHAT',       type: 'CHAT',        angle: -Math.PI / 2,     icon: '/ui/Icons/chat (1).png',     detail: 'Conversational transcript & debug diagnostics pipeline.' },
  { label: 'TUTORIAL',   type: 'TUTORIAL',    angle: -Math.PI / 4,     icon: '/ui/Icons/tutorial (1).png', detail: 'Holographic manual showing gesture control steps.' },
  { label: 'MINIMAP',    type: 'STADIUM',     angle: 0,                icon: '/ui/Icons/MINIMAP.png',      detail: 'Toggles the 3D tactical minimap table in front of you.' },
  { label: 'VENUE',      type: 'STADIUM_SEL', angle: Math.PI / 4,      icon: '/ui/Icons/venue (1).png',    detail: 'Select from Wankhede, Monaco GP, or other stadiums.' },
  { label: 'LOCK',       type: 'LOCK',        angle: Math.PI / 2,      icon: null,                         detail: 'Locks/unlocks companion rigid spatial anchor point.' },
  { label: 'VOICE',      type: 'VOICE',       angle: 3 * Math.PI / 4,  icon: '/ui/Icons/microphone.png',   detail: 'Speech synthesis and AI query voice detection pipeline.' },
  { label: 'DONT TOUCH', type: 'DEBUG',       angle: Math.PI,          icon: '/ui/Icons/debug.png',        detail: 'Cyberpunk system developer log console.' },
  { label: 'WALLS',      type: 'WALLS',       angle: -3 * Math.PI / 4, icon: '/ui/Icons/walls.png',        detail: 'Visualizes detected physical room planes and meshes.' },
] as const;

const MOOD_COLORS: Record<string, { primary: string; comp: string; glow: string }> = {
  cricket:    { primary: '#ffb347', comp: '#4793ff', glow: 'rgba(255,179,71,0.35)' },
  basketball: { primary: '#a855f7', comp: '#f97316', glow: 'rgba(168,85,247,0.35)' },
  football:   { primary: '#34d399', comp: '#f43f5e', glow: 'rgba(52,211,153,0.35)' },
  f1:         { primary: '#ef4444', comp: '#22d3ee', glow: 'rgba(239,68,68,0.35)' },
};

export default function ActionCompass({ activeSport, onChangeSport }: ActionCompassProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const torusAngleRef = useRef(0);
  const floatTimeRef = useRef(0);
  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [bearing, setBearing] = useState(128.4);
  const [lockedIdx, setLockedIdx] = useState<number>(-1);
  const [iconImgs, setIconImgs] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const loaded: Record<string, HTMLImageElement> = {};
    let pending = 0;
    SPOKES.forEach(s => {
      if (!s.icon) return;
      pending++;
      const img = new Image();
      img.onload = () => { loaded[s.type] = img; pending--; if (pending === 0) setIconImgs({ ...loaded }); };
      img.onerror = () => { pending--; };
      img.src = s.icon as string;
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setBearing(prev => parseFloat((prev + (Math.random() - 0.5) * 0.4).toFixed(1)));
    }, 150);
    return () => clearInterval(iv);
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const cx = W / 2;
    const cy = W / 2;
    const t = floatTimeRef.current;
    const colors = MOOD_COLORS[activeSport];
    ctx.clearRect(0, 0, W, W);

    // Outer glow halo
    const halo = ctx.createRadialGradient(cx, cy, W * 0.28, cx, cy, W * 0.5);
    halo.addColorStop(0, colors.glow.replace('0.35', '0.08'));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, W);

    // Main dark circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(5,5,18,0.85)';
    ctx.fill();
    ctx.strokeStyle = colors.primary + '44';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Dashed outer ring rotating
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.12);
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, W * 0.435, 0, Math.PI * 2);
    ctx.strokeStyle = colors.primary + '28';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Inner accent ring counter-rotating
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-t * 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, W * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = colors.comp + '38';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Tick marks
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const isMain = i % 4 === 0;
      const r0 = W * (isMain ? 0.37 : 0.395);
      const r1 = W * (isMain ? 0.43 : 0.415);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -r0);
      ctx.lineTo(0, -r1);
      ctx.strokeStyle = isMain ? colors.primary + 'aa' : colors.primary + '28';
      ctx.lineWidth = isMain ? 1.5 : 0.8;
      ctx.stroke();
      ctx.restore();
    }

    // Spokes
    const R = W * 0.30;
    SPOKES.forEach((spoke, idx) => {
      const sx = cx + R * Math.cos(spoke.angle);
      const sy = cy + R * Math.sin(spoke.angle);
      const isHovered = hoveredIdx === idx;
      const isActive = activeIdx === idx || lockedIdx === idx;
      const lockActive = spoke.type === 'LOCK' && lockedIdx === idx;
      const hoverFloat = isHovered ? Math.sin(t * 6.0) * 3.5 : 0;
      const iconCY = sy - 4 + hoverFloat;

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, iconCY, 22, 0, Math.PI * 2);
      ctx.fillStyle = (isActive || isHovered ? colors.comp : colors.comp) + (isActive || isHovered ? '50' : '22');
      ctx.fill();
      if (isActive || isHovered) {
        ctx.beginPath();
        ctx.arc(sx, iconCY, isHovered ? 26 : 24, 0, Math.PI * 2);
        ctx.strokeStyle = lockActive ? '#22c55e' : colors.primary;
        ctx.lineWidth = isHovered ? 2.5 : 1.8;
        ctx.stroke();
      }

      if (iconImgs[spoke.type]) {
        const img = iconImgs[spoke.type];
        const sz = 20;
        const off = document.createElement('canvas');
        off.width = sz; off.height = sz;
        const oc = off.getContext('2d')!;
        oc.drawImage(img, 0, 0, sz, sz);
        if (isActive || isHovered) {
          oc.globalCompositeOperation = 'source-in';
          oc.fillStyle = lockActive ? '#22c55e' : colors.primary;
          oc.fillRect(0, 0, sz, sz);
        }
        ctx.drawImage(off, sx - sz / 2, iconCY - sz / 2, sz, sz);
      } else if (spoke.type === 'LOCK') {
        const lc = lockActive ? '#22c55e' : '#ffffff';
        ctx.strokeStyle = lc; ctx.fillStyle = lc; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, iconCY - 8, 6, Math.PI, 0);
        ctx.lineTo(sx + 6, iconCY);
        ctx.moveTo(sx - 6, iconCY - 8);
        ctx.lineTo(sx - 6, iconCY);
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(sx - 9, iconCY, 18, 12, 3);
        ctx.fill();
        ctx.fillStyle = colors.comp;
        ctx.beginPath();
        ctx.arc(sx, iconCY + 6, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.font = 'bold ' + (W * 0.028) + 'px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? (lockActive ? '#22c55e' : colors.primary) : isHovered ? colors.primary : '#cccccc';
      ctx.fillText(spoke.label, sx, sy + 30 + hoverFloat);
      ctx.restore();
    });

    // Center dark circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.175, 0, Math.PI * 2);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.175);
    cg.addColorStop(0, 'rgba(14,14,38,0.99)');
    cg.addColorStop(1, 'rgba(6,6,20,0.96)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = colors.primary + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Tilted torus ring at center
    const ta = torusAngleRef.current;
    const trx = W * 0.115;
    const try_ = W * 0.055 * Math.abs(Math.cos(0.8));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.save();
    ctx.rotate(ta * 0.7 + 0.26);
    ctx.beginPath();
    ctx.ellipse(0, 0, trx, try_, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = colors.primary + '35';
    ctx.lineWidth = W * 0.022;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(ta * 0.7 + 0.26);
    ctx.beginPath();
    ctx.ellipse(0, 0, trx, try_, 0, 0, Math.PI);
    const tg = ctx.createLinearGradient(-trx, 0, trx, 0);
    tg.addColorStop(0, colors.primary + '18');
    tg.addColorStop(0.5, colors.primary + 'ee');
    tg.addColorStop(1, colors.primary + '18');
    ctx.strokeStyle = tg;
    ctx.lineWidth = W * 0.022;
    ctx.stroke();
    ctx.restore();
    const da = ta * 2.1;
    const dx = trx * Math.cos(da);
    const dy = try_ * Math.sin(da);
    ctx.save();
    ctx.rotate(ta * 0.7 + 0.26);
    const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, 7);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.4, colors.primary);
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(dx, dy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Center text
    const activeSpoke = hoveredIdx >= 0 ? SPOKES[hoveredIdx] : null;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (W * 0.03) + 'px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = colors.primary;
    ctx.fillText(activeSpoke ? activeSpoke.label : 'JUGNU CORE', cx, cy - 8);
    ctx.font = (W * 0.022) + 'px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(200,200,220,0.7)';
    ctx.fillText(activeSpoke ? 'TAP TO ACTIVATE' : 'HOVER AN ICON', cx, cy + 10);
    ctx.restore();

    torusAngleRef.current += 0.018;
    floatTimeRef.current += 0.016;
    animFrameRef.current = requestAnimationFrame(drawCanvas);
  }, [activeSport, hoveredIdx, activeIdx, lockedIdx, iconImgs]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawCanvas]);

  const getHoveredIdx = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = canvas.width * 0.30;
    for (let i = 0; i < SPOKES.length; i++) {
      const sx = cx + R * Math.cos(SPOKES[i].angle);
      const sy = cy + R * Math.sin(SPOKES[i].angle);
      if (Math.hypot(mx - sx, my - (sy - 4)) < 28) return i;
    }
    return -1;
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => setHoveredIdx(getHoveredIdx(e));
  const handleMouseLeave = () => setHoveredIdx(-1);
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = getHoveredIdx(e);
    if (idx < 0) return;
    playBeep(400 + idx * 80, 'triangle', 0.12, (idx / 7) * 2 - 1);
    if (SPOKES[idx].type === 'LOCK') {
      setLockedIdx(prev => prev === idx ? -1 : idx);
      setActiveIdx(idx);
      return;
    }
    setActiveIdx(prev => prev === idx ? -1 : idx);
  };

  const colors = MOOD_COLORS[activeSport];
  const activeSpoke = activeIdx >= 0 ? SPOKES[activeIdx] : null;
  const sportList = [
    { id: 'cricket' as SportType,    label: 'Cricket',    sub: 'Wankhede',         color: '#ffb347' },
    { id: 'basketball' as SportType, label: 'Basketball', sub: 'Crypto.com Arena', color: '#a855f7' },
    { id: 'football' as SportType,   label: 'Football',   sub: 'Olympiastadion',   color: '#34d399' },
    { id: 'f1' as SportType,         label: 'Formula 1',  sub: 'Monaco GP',        color: '#ef4444' },
  ];

  return (
    <div className="flex flex-col items-center w-full gap-0 select-none">
      <div className="w-full flex flex-col items-center justify-center py-4 border-x border-t rounded-t-2xl"
        style={{ background: 'rgba(5,5,18,0.88)', borderColor: colors.primary + '25', boxShadow: '0 0 18px ' + colors.glow }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: colors.primary + 'aa' }}>Mixed Reality Input Engine</span>
        <div className="flex items-center justify-center gap-2 mt-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: 'xr-spin 10s linear infinite' }}>
            <circle cx="12" cy="12" r="10"/>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span className="font-sans font-bold text-xl tracking-tight text-slate-100">ACTION COMPASS</span>
        </div>
      </div>

      <div className="w-full flex justify-center items-center py-4 border-x"
        style={{ background: 'rgba(5,5,18,0.88)', borderColor: colors.primary + '25' }}>
        <canvas ref={canvasRef} width={340} height={340} className="cursor-crosshair"
          style={{ width: '100%', maxWidth: 340, aspectRatio: '1', filter: 'drop-shadow(0 0 18px ' + colors.glow + ')' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={handleClick} />
      </div>

      <div className="w-full px-4 py-3 border-x border-b rounded-b-2xl flex flex-col gap-2"
        style={{ background: 'rgba(5,5,18,0.92)', borderColor: colors.primary + '35' }}>
        <div className="text-center">
          {activeSpoke ? (
            <>
              <div className="font-mono text-xs uppercase tracking-widest" style={{ color: colors.primary }}>
                ACTIVE: <span className="font-bold">{activeSpoke.label}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{activeSpoke.detail}</p>
            </>
          ) : (
            <>
              <div className="font-mono text-xs" style={{ color: colors.primary + 'cc' }}>
                ACTIVE SYSTEM: <span className="font-bold uppercase">{activeSport}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Hover or click a spoke icon to interact.</p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {sportList.map(s => (
            <button key={s.id}
              onClick={() => { playBeep(420, 'sine', 0.1); onChangeSport(s.id); }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all cursor-pointer text-left"
              style={{
                background: activeSport === s.id ? s.color + '18' : 'rgba(10,10,28,0.6)',
                borderColor: activeSport === s.id ? s.color + '80' : 'rgba(255,255,255,0.08)',
                boxShadow: activeSport === s.id ? '0 0 12px ' + s.color + '30' : 'none',
              }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: activeSport === s.id ? s.color : '#374151' }} />
              <div>
                <div className="font-mono font-bold text-[10px] text-slate-100 leading-none">{s.label}</div>
                <div className="font-mono text-[9px] text-slate-500 leading-none mt-0.5">{s.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mt-1 text-[9px] font-mono" style={{ color: colors.primary + '55' }}>
          <span>STADIUM DEPTH: OPTIMAL</span>
          <span>LAT: 19.076N, LON: 72.825E</span>
        </div>
      </div>

      <style>{`@keyframes xr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}