import React from 'react';
import {
  FileText,
  Calculator,
  Palette,
  Globe,
  Camera,
  Database,
  Sparkles,
  Smartphone,
  Cloud,
  Briefcase,
  Share2,
  Sunrise,
  Lock,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { ActiveAppWindow } from '../types';

interface AppDockProps {
  activeApp: ActiveAppWindow;
  onSelectApp: (app: ActiveAppWindow) => void;
  onQuickCommand: (cmd: string) => void;
}

export const AppDock: React.FC<AppDockProps> = ({
  activeApp,
  onSelectApp,
  onQuickCommand,
}) => {
  const tools = [
    {
      id: 'blueprint' as const,
      label: 'Master Plan',
      voiceCmd: 'show master plan',
      icon: Sparkles,
      color: 'text-cyan-400',
    },
    {
      id: 'telegram' as const,
      label: 'Telegram Mobile',
      voiceCmd: 'open telegram',
      icon: Smartphone,
      color: 'text-blue-400',
    },
    {
      id: 'oracle' as const,
      label: 'Oracle Cloud VM',
      voiceCmd: 'cloud server status',
      icon: Cloud,
      color: 'text-emerald-400',
    },
    {
      id: 'freelance' as const,
      label: 'Freelance CRM',
      voiceCmd: 'create quotation',
      icon: Briefcase,
      color: 'text-amber-400',
    },
    {
      id: 'social' as const,
      label: 'Social Media',
      voiceCmd: 'create social post',
      icon: Share2,
      color: 'text-purple-400',
    },
    {
      id: 'routines' as const,
      label: 'Daily Routines',
      voiceCmd: 'morning briefing',
      icon: Sunrise,
      color: 'text-pink-400',
    },
    {
      id: 'permission_gateway' as const,
      label: 'Permission Gateway',
      voiceCmd: 'open permission gateway',
      icon: ShieldAlert,
      color: 'text-amber-400',
    },
    {
      id: 'autonomous_tools' as const,
      label: 'Autonomous Tools',
      voiceCmd: 'open autonomous tools',
      icon: Wrench,
      color: 'text-cyan-400',
    },
    {
      id: 'security' as const,
      label: 'Security Matrix',
      voiceCmd: 'security audit',
      icon: Lock,
      color: 'text-cyan-300',
    },
    {
      id: 'notepad' as const,
      label: 'Notepad',
      voiceCmd: 'open notepad',
      icon: FileText,
      color: 'text-amber-300',
    },
    {
      id: 'calculator' as const,
      label: 'Calculator',
      voiceCmd: 'open calculator',
      icon: Calculator,
      color: 'text-cyan-300',
    },
    {
      id: 'paint' as const,
      label: 'Paint',
      voiceCmd: 'open paint',
      icon: Palette,
      color: 'text-rose-400',
    },
    {
      id: 'browser' as const,
      label: 'Browser',
      voiceCmd: 'open google',
      icon: Globe,
      color: 'text-blue-300',
    },
    {
      id: 'screenshots' as const,
      label: 'Screen Capture',
      voiceCmd: 'take screenshot',
      icon: Camera,
      color: 'text-emerald-300',
    },
    {
      id: 'memory' as const,
      label: 'Memory Vault',
      voiceCmd: 'what is my name',
      icon: Database,
      color: 'text-purple-300',
    },
  ];

  return (
    <div className="w-full bg-slate-950/80 border-t border-cyan-900/40 backdrop-blur-md px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {tools.map((t) => {
            const Icon = t.icon;
            const isActive = activeApp === t.id;
            return (
              <button
                key={t.id}
                id={`dock-tool-${t.id}`}
                onClick={() => onSelectApp(isActive ? null : t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs transition-all shrink-0 ${
                  isActive
                    ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-100 shadow-md shadow-cyan-950 font-semibold'
                    : 'bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 text-slate-300'
                }`}
                title={`Click to launch ${t.label} or say "${t.voiceCmd}"`}
              >
                <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Voice Prompt Shortcuts */}
        <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-slate-800 shrink-0">
          <span className="text-[11px] font-mono text-slate-500 uppercase">Quick:</span>
          <button
            onClick={() => onQuickCommand('JARVIS, project check करो')}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-cyan-300 border border-slate-800"
          >
            "Project check"
          </button>
          <button
            onClick={() => onQuickCommand('JARVIS, आज की LinkedIn post बनाओ')}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-blue-300 border border-slate-800"
          >
            "LinkedIn post"
          </button>
        </div>
      </div>
    </div>
  );
};
