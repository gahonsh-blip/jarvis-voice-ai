import React, { useState, useEffect } from 'react';
import {
  Shield,
  Cpu,
  Activity,
  Zap,
  Sparkles,
  Smartphone,
  Cloud,
  Briefcase,
  Share2,
  Lock,
  Sunrise,
  Sliders,
  Wrench,
  AlertOctagon,
} from 'lucide-react';

interface HUDHeaderProps {
  userName?: string;
  geminiConnected: boolean;
  isOnline?: boolean;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  onOpenBlueprint: () => void;
  onOpenTelegram: () => void;
  onOpenOracle: () => void;
  onOpenFreelance: () => void;
  onOpenSocial: () => void;
  onOpenRoutines: () => void;
  onOpenSecurity: () => void;
  onOpenAutonomousTools: () => void;
  onOpenPermissionGateway: () => void;
}

export const HUDHeader: React.FC<HUDHeaderProps> = ({
  userName,
  geminiConnected,
  isOnline = true,
  onOpenSettings,
  onOpenMemory,
  onOpenBlueprint,
  onOpenTelegram,
  onOpenOracle,
  onOpenFreelance,
  onOpenSocial,
  onOpenRoutines,
  onOpenSecurity,
  onOpenAutonomousTools,
  onOpenPermissionGateway,
}) => {
  const [time, setTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [cpuSim, setCpuSim] = useState<number>(14);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
      setDateStr(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);

    const cpuInterval = setInterval(() => {
      setCpuSim(Math.floor(10 + Math.random() * 8));
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(cpuInterval);
    };
  }, []);

  return (
    <header className="w-full border-b border-cyan-900/40 bg-slate-950/80 backdrop-blur-md px-4 py-2.5 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
        {/* Top Tier: Logo, Core Status & Navigation Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Branding & User Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 via-blue-800 to-slate-900 flex items-center justify-center border border-cyan-400/50 shadow-lg shadow-cyan-950">
              <Shield className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-200 to-teal-300">
                  HERMES JARVIS
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                  ₹0 Always Free
                </span>
                {isOnline ? (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    SYNCED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/50 text-amber-300 font-mono font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    OFFLINE READY
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <span>OPERATOR:</span>
                <button
                  onClick={onOpenMemory}
                  className="text-cyan-300 font-medium hover:underline hover:text-cyan-200 flex items-center gap-1"
                  title="View Memory Store"
                >
                  {userName || 'Sir / Guest'}
                </button>
              </p>
            </div>
          </div>

          {/* Middle: Telemetry HUD Indicators */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono">
            <button
              onClick={onOpenOracle}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">ARM VM LOAD:</span>
              <span className="text-cyan-300 font-semibold">{cpuSim}%</span>
            </button>

            <button
              onClick={onOpenTelegram}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">MOBILE:</span>
              <span className="text-emerald-400 font-semibold">TELEGRAM ONLINE</span>
            </button>

            <button
              onClick={onOpenSecurity}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-slate-400">SECURITY:</span>
              <span className="text-purple-300 font-semibold">LEVEL 2 SAFE</span>
            </button>
          </div>

          {/* Right: Real-time Clock & Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto sm:ml-0">
            <div className="text-right hidden sm:block">
              <div className="text-xs sm:text-sm font-mono font-bold tracking-widest text-cyan-300">
                {time || '00:00:00'}
              </div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                {dateStr}
              </div>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 transition-colors"
              title="Voice & System Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Tier: Master Plan Action Nav Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 font-mono text-xs scrollbar-thin">
          <button
            onClick={onOpenBlueprint}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-200 font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Master Blueprint (Phase 0-9)</span>
          </button>

          <button
            onClick={onOpenAutonomousTools}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-200 font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-400" />
            <span>Autonomous Tools</span>
          </button>

          <button
            onClick={onOpenPermissionGateway}
            className="px-3 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-500/60 text-amber-200 font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Permission Gateway (Level 4)</span>
          </button>

          <button
            onClick={onOpenTelegram}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-blue-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span>Telegram Gateway</span>
          </button>

          <button
            onClick={onOpenOracle}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span>Oracle ARM VM</span>
          </button>

          <button
            onClick={onOpenFreelance}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Briefcase className="w-3.5 h-3.5 text-amber-400" />
            <span>Freelance CRM</span>
          </button>

          <button
            onClick={onOpenSocial}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-purple-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Social Approval</span>
          </button>

          <button
            onClick={onOpenRoutines}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-pink-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Sunrise className="w-3.5 h-3.5 text-pink-400" />
            <span>Daily Routines</span>
          </button>

          <button
            onClick={onOpenSecurity}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Security Matrix</span>
          </button>
        </div>
      </div>
    </header>
  );
};
