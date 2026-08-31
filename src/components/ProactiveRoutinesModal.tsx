import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Volume2,
  Play,
  CheckCircle2,
  ShieldCheck,
  Activity,
  Clock,
  Send,
} from 'lucide-react';
import { ProactiveReportItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}

const SLOT_ICONS: Record<string, any> = {
  morning: Sunrise,
  midday: Sun,
  evening: Sunset,
  night: Moon,
};

export const ProactiveRoutinesModal: React.FC<Props> = ({ isOpen, onClose, onSpeak }) => {
  const [routines, setRoutines] = useState<ProactiveReportItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<'morning' | 'midday' | 'evening' | 'night'>('morning');
  const [language, setLanguage] = useState<'bilingual' | 'english' | 'hindi'>('bilingual');

  useEffect(() => {
    if (isOpen) {
      fetchRoutines();
    }
  }, [isOpen]);

  const fetchRoutines = async () => {
    try {
      const res = await fetch('/api/routines');
      const data = await res.json();
      if (data.routines) {
        setRoutines(data.routines);
      }
    } catch (err) {
      console.warn('Failed to fetch routines:', err);
    }
  };

  const currentRoutine = routines.find((r) => r.timeSlot === selectedSlot) || routines[0];

  const handlePlayVoiceBriefing = () => {
    if (!currentRoutine) return;
    const textToSpeak = language === 'hindi' ? currentRoutine.contentHi : currentRoutine.contentEn;
    onSpeak(textToSpeak);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-cyan-800/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Proactive JARVIS Automation (Phase 9)</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Daily Briefing Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Self-initiating 4-times daily intelligence briefings delivered directly to your Android phone via Telegram
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Routine Slots Tabs */}
        <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex gap-2">
            {[
              { slot: 'morning', label: '🌅 09:00 AM Morning' },
              { slot: 'midday', label: '☀️ 02:00 PM Midday Audit' },
              { slot: 'evening', label: '🌇 06:30 PM Evening Social' },
              { slot: 'night', label: '🌙 10:30 PM Nightly Work Summary' },
            ].map((tab) => (
              <button
                key={tab.slot}
                onClick={() => setSelectedSlot(tab.slot as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${
                  selectedSlot === tab.slot
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-slate-500">Language:</span>
            <button
              onClick={() => setLanguage('bilingual')}
              className={`px-2 py-0.5 rounded text-[11px] ${
                language === 'bilingual' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setLanguage('english')}
              className={`px-2 py-0.5 rounded text-[11px] ${
                language === 'english' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('hindi')}
              className={`px-2 py-0.5 rounded text-[11px] ${
                language === 'hindi' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>

        {/* Selected Routine Details */}
        {currentRoutine && (
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-5 bg-slate-950/40">
            {/* Title & Play Button */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-100">{currentRoutine.titleEn}</h3>
                <p className="text-xs text-cyan-300 font-medium">{currentRoutine.titleHi}</p>
              </div>

              <button
                onClick={handlePlayVoiceBriefing}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs font-mono flex items-center gap-2 transition-colors shadow-lg shadow-cyan-950"
              >
                <Volume2 className="w-4 h-4" />
                Play Voice Briefing
              </button>
            </div>

            {/* Briefing Speech Script Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(language === 'bilingual' || language === 'english') && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
                  <span className="text-xs font-mono text-cyan-400 font-bold">ENGLISH SPOKEN BRIEFING</span>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">{currentRoutine.contentEn}</p>
                </div>
              )}

              {(language === 'bilingual' || language === 'hindi') && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
                  <span className="text-xs font-mono text-emerald-400 font-bold">हिन्दी ब्रीफिंग वक्तव्य</span>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">{currentRoutine.contentHi}</p>
                </div>
              )}
            </div>

            {/* Key Actionable Insights Checklist */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2.5">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Telemetry & Action Points Analyzed by JARVIS
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                {currentRoutine.keyInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-slate-300 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Simulated Telegram Mobile Delivery status */}
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-xs font-mono text-blue-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Next automated cron broadcast: Scheduled at time slot
              </span>
              <span className="text-emerald-400">Telegram Push Ready</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Cron Scheduler: Active on Oracle ARM Node</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
