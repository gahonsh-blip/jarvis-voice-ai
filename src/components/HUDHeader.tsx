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
  Power,
  RotateCcw,
  CheckCircle2,
  FileText,
  Globe,
} from 'lucide-react';
import { getLanguageOption } from '../utils/languages';

interface HUDHeaderProps {
  userName?: string;
  geminiConnected: boolean;
  isOnline?: boolean;
  language?: string;
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
  onOpenMobileStatus?: () => void;
}

export const HUDHeader: React.FC<HUDHeaderProps> = ({
  userName,
  geminiConnected,
  isOnline = true,
  language = 'en-US',
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
  onOpenMobileStatus,
}) => {
  const [time, setTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [cpuSim, setCpuSim] = useState<number>(14);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState<boolean>(false);
  const [killSwitchReason, setKillSwitchReason] = useState<string>('');
  const [showKillModal, setShowKillModal] = useState<boolean>(false);
  const [killNotice, setKillNotice] = useState<string | null>(null);
  const [isOperatingKillSwitch, setIsOperatingKillSwitch] = useState<boolean>(false);

  const fetchEmergencyStatus = async () => {
    try {
      const res = await fetch('/api/emergency/status');
      const data = await res.json();
      if (data && typeof data.emergencyPaused === 'boolean') {
        setIsKillSwitchActive(data.emergencyPaused);
        setKillSwitchReason(data.reason || '');
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchEmergencyStatus();
    const emergencyInterval = setInterval(fetchEmergencyStatus, 5000);
    return () => clearInterval(emergencyInterval);
  }, []);

  const handleTriggerKillSwitch = async () => {
    setIsOperatingKillSwitch(true);
    try {
      const res = await fetch('/api/system/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'HUD_KILL_SWITCH_BUTTON', reason: 'Emergency Stop Triggered from HUD' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsKillSwitchActive(true);
        setKillNotice(`🚨 KILL SWITCH ENGAGED: Terminated all background tasks and cleared ${data.clearedTasksCount || 0} queue item(s).`);
        setShowKillModal(false);
      }
    } catch (err: any) {
      setKillNotice(`Error engaging Kill Switch: ${err.message}`);
    } finally {
      setIsOperatingKillSwitch(false);
      setTimeout(() => setKillNotice(null), 6000);
    }
  };

  const handleResumeSystem = async () => {
    setIsOperatingKillSwitch(true);
    try {
      const res = await fetch('/api/system/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'HUD_RESUME_BUTTON' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsKillSwitchActive(false);
        setKillNotice('🟢 System resumed safely. Normal level 1-4 permission gating active.');
        setShowKillModal(false);
      }
    } catch (err: any) {
      setKillNotice(`Error resuming system: ${err.message}`);
    } finally {
      setIsOperatingKillSwitch(false);
      setTimeout(() => setKillNotice(null), 5000);
    }
  };

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
      {/* Emergency Active Global Banner */}
      {isKillSwitchActive && (
        <div className="mb-2 p-2 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs font-mono flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-bold">🚨 GLOBAL KILL SWITCH ACTIVE: ALL BACKGROUND DAEMONS &amp; QUEUES FROZEN</span>
          </div>
          <button
            onClick={handleResumeSystem}
            disabled={isOperatingKillSwitch}
            className="px-3 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Resume System
          </button>
        </div>
      )}

      {killNotice && (
        <div className="mb-2 p-2 rounded-xl bg-cyan-950 border border-cyan-600 text-cyan-200 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          <span>{killNotice}</span>
        </div>
      )}

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

          {/* Right: Real-time Clock, Kill Switch & Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto sm:ml-0">
            {/* Global Kill Switch Button */}
            {isKillSwitchActive ? (
              <button
                onClick={handleResumeSystem}
                disabled={isOperatingKillSwitch}
                className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all"
                title="Deactivate Kill Switch & Resume Operations"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">RESUME SYSTEM</span>
              </button>
            ) : (
              <button
                onClick={() => setShowKillModal(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-600/70 text-rose-300 hover:text-rose-100 text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/50 transition-all group"
                title="Global Emergency Kill Switch"
              >
                <Power className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">KILL SWITCH</span>
              </button>
            )}

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
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-colors flex items-center gap-1.5 text-xs font-mono"
              title={`Speech Recognition & AI Language: ${getLanguageOption(language).name} (${language})`}
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{getLanguageOption(language).flag}</span>
              <span className="font-bold text-[11px] text-cyan-200 hidden sm:inline">{language.toUpperCase()}</span>
            </button>

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

          {onOpenMobileStatus && (
            <button
              onClick={onOpenMobileStatus}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
            >
              <Sunrise className="w-3.5 h-3.5 text-amber-400" />
              <span>Mobile Status (सुप्रभात)</span>
            </button>
          )}

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

          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 shrink-0 transition-colors"
            title="Open Public Privacy Policy"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Privacy Policy</span>
          </a>

          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-slate-100 flex items-center gap-1.5 shrink-0 transition-colors"
            title="Open Public Terms of Service"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Terms of Service</span>
          </a>
        </div>
      </div>

      {/* Kill Switch Confirmation Modal */}
      {showKillModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-600 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 font-mono">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-950 border border-rose-600 flex items-center justify-center text-rose-400 shrink-0">
                <AlertOctagon className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-200">CONFIRM GLOBAL KILL SWITCH</h3>
                <p className="text-xs text-slate-400 font-sans">Immediate Emergency Protocol</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 space-y-1.5 font-sans">
              <p className="font-bold font-mono">This action will immediately:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>Halt and terminate all active background daemons &amp; scheduler jobs</li>
                <li>Clear &amp; reject all pending task queues in PermissionGateway</li>
                <li>Suspend all active Telegram polling loops</li>
                <li>Write an immutable Level 4 Emergency Audit Log</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowKillModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerKillSwitch}
                disabled={isOperatingKillSwitch}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-rose-950 transition-colors"
              >
                <Power className="w-4 h-4" />
                {isOperatingKillSwitch ? 'Engaging...' : 'ENGAGE KILL SWITCH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

