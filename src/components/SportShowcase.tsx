import React, { useState, useEffect, useRef } from 'react';
import { SportType } from '../types';
import { playBeep } from '../utils/audio';
import { Trophy, Dribbble, Flame, Gauge, Zap, Play, RotateCcw, UserCheck, BarChart2 } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface SportShowcaseProps {
  activeSport: SportType;
  onChangeSport: (sport: SportType) => void;
}

export default function SportShowcase({ activeSport, onChangeSport }: SportShowcaseProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isSimulating, setIsSimulating] = useState(true);
  const [triggerReset, setTriggerReset] = useState(0);

  // Synchronize state trigger beeps on tab changes
  const handleTabSelect = (sport: SportType) => {
    playBeep(520, 'sine', 0.1, 0);
    onChangeSport(sport);
  };

  // Three.js 3D Viewport logic
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Set up Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Set up OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera going below ground

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Load Model based on activeSport
    let currentModel: THREE.Group | null = null;
    const loader = new GLTFLoader();

    let modelPath = '';
    switch (activeSport) {
      case 'cricket':
        modelPath = './gltf/Wankhede Stadium/Wankhede.glb';
        break;
      case 'basketball':
        modelPath = './gltf/Crypto.comStadium/Crypto.comStadium.glb';
        break;
      case 'football':
        modelPath = './gltf/Olympiastadion/Olympiastadion.glb';
        break;
      case 'f1':
        modelPath = './gltf/MonacoRoad.glb';
        break;
    }

    if (modelPath) {
      loader.load(modelPath, (gltf) => {
        currentModel = gltf.scene;
        // Center and scale the model so it fits the view
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        
        currentModel.position.x += (currentModel.position.x - center.x);
        currentModel.position.y += (currentModel.position.y - center.y);
        currentModel.position.z += (currentModel.position.z - center.z);
        
        const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        const scale = 8 / maxDim; // Adjust scale to fit camera view
        currentModel.scale.setScalar(scale);

        scene.add(currentModel);
      });
    }

    // Animation Loop
    let animationId: number;
    const render = () => {
      animationId = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    // Handle Resize
    const resizeObserver = new ResizeObserver(() => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    resizeObserver.observe(mount);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [activeSport, triggerReset]);

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
          <div className="relative flex-grow flex items-center justify-center my-4 overflow-hidden rounded-xl bg-slate-950/80 border border-red-500/20 shadow-inner min-h-[360px]">
            <div 
              ref={mountRef} 
              className="absolute inset-0 w-full h-full block cursor-move"
            />
            
            {/* Subtle Overlay text watermark */}
            <div className="absolute bottom-3 left-3 text-[9px] font-mono text-red-500/40 tracking-wider pointer-events-none uppercase">
              JUGNU_XR_SPATIAL_SIMULATOR // TYPE: {activeSport}
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
