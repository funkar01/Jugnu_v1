import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  opacity: number;
  scale: number;
}

export default function JugnuParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate 150 glowing particles distributed across the page
    const newParticles: Particle[] = Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 95}%`, // distribute vertically
      size: Math.random() * 24 + 14, // sizes between 14px and 38px
      delay: `${Math.random() * -30}s`, // start immediately with random offset
      duration: `${Math.random() * 30 + 20}s`, // slow floating (20s to 50s)
      opacity: Math.random() * 0.35 + 0.15, // opacity range: 0.15 to 0.50
      scale: Math.random() * 0.4 + 0.6,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `float-gentle ${p.duration} linear infinite, glow-pulse-svg ${Math.random() * 4 + 3}s ease-in-out infinite`,
            animationDelay: `${p.delay}, ${Math.random() * -10}s`,
            opacity: p.opacity,
            filter: 'drop-shadow(0 0 6px rgba(255, 160, 58, 0.7))',
          }}
        >
          {/* Jugnu-like soft rounded 8-point star with a glowing radial gradient fill */}
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <defs>
              <radialGradient id={`jugnuParticleGrad-${p.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff" stopOpacity={0.9} />
                <stop offset="30%" stopColor="#ffa03a" stopOpacity={0.8} />
                <stop offset="70%" stopColor="#ff522c" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ff522c" stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* Rounded 8-point star */}
            <g transform={`scale(${p.scale}) translate(${(100 - 100 * p.scale) / 2}, ${(100 - 100 * p.scale) / 2})`}>
              <path
                d="M 50 10 C 53 38 62 47 90 50 C 62 53 53 62 50 90 C 47 62 38 53 10 50 C 38 47 47 38 50 10 Z"
                fill={`url(#jugnuParticleGrad-${p.id})`}
              />
              <path
                d="M 50 10 C 53 38 62 47 90 50 C 62 53 53 62 50 90 C 47 62 38 53 10 50 C 38 47 47 38 50 10 Z"
                transform="rotate(45 50 50)"
                fill={`url(#jugnuParticleGrad-${p.id})`}
              />
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}
