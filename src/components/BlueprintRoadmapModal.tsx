import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Circle,
  Sparkles,
  Shield,
  Cloud,
  Bot,
  Cpu,
  Smartphone,
  Database,
  Wrench,
  Briefcase,
  Share2,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { BlueprintPhase } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string) => void;
}

const ICON_MAP: Record<string, any> = {
  ShieldCheck: Shield,
  Cloud: Cloud,
  Bot: Bot,
  Cpu: Cpu,
  Smartphone: Smartphone,
  Database: Database,
  Wrench: Wrench,
  Briefcase: Briefcase,
  Share2: Share2,
  Sparkles: Sparkles,
};

export const BlueprintRoadmapModal: React.FC<Props> = ({ isOpen, onClose, onRunCommand }) => {
  const [phases, setPhases] = useState<BlueprintPhase[]>([]);
  const [stats, setStats] = useState<{
    totalPhases: number;
    completedPhases: number;
    inProgressPhases: number;
    completionPercentage: number;
  }>({
    totalPhases: 10,
    completedPhases: 1,
    inProgressPhases: 9,
    completionPercentage: 100,
  });
  const [selectedPhase, setSelectedPhase] = useState<number>(0);
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [showFullReport, setShowFullReport] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      fetchBlueprint();
    }
  }, [isOpen]);

  const fetchBlueprint = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/blueprint');
      const data = await res.json();
      if (data.phases) {
        setPhases(data.phases);
        setStats(data.stats);
      }
    } catch (err) {
      console.warn('Failed to fetch blueprint:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDeliverable = async (phaseId: number, itemIndex: number) => {
    try {
      const res = await fetch('/api/blueprint/toggle-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId, itemIndex }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBlueprint();
      }
    } catch (err) {
      console.warn('Toggle deliverable failed:', err);
    }
  };

  const handleLoadReport = async () => {
    try {
      const res = await fetch('/api/blueprint/report');
      const data = await res.json();
      setReportMarkdown(data.markdown);
      setShowFullReport(true);
    } catch (err) {
      console.warn('Load report failed:', err);
    }
  };

  const handleCopyReport = () => {
    if (reportMarkdown) {
      navigator.clipboard.writeText(reportMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  const currentPhase = phases.find((p) => p.id === selectedPhase) || phases[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-cyan-800/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">HERMES JARVIS Master Blueprint</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  ₹0 Free Strategy
                </span>
              </div>
              <p className="text-xs text-slate-400">
                10-Phase Autonomous Transformation Roadmap • Mobile Controlled (Telegram + Oracle Cloud VM)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadReport}
              className="px-3 py-1.5 rounded-lg bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-700/50 text-cyan-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {showFullReport ? 'View Phases' : 'Master Blueprint Report'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Blueprint Overview Stat Bar */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-500">TOTAL PHASES:</span>{' '}
              <span className="text-cyan-400 font-bold">10 (Phase 0 to 9)</span>
            </div>
            <div>
              <span className="text-slate-500">INFRASTRUCTURE:</span>{' '}
              <span className="text-emerald-400 font-bold">Oracle Always Free ARM VM</span>
            </div>
            <div>
              <span className="text-slate-500">MOBILE GATEWAY:</span>{' '}
              <span className="text-blue-400 font-bold">Telegram Bot (@HermesJarvisBot)</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Readiness Progress:</span>
            <div className="w-32 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${stats.completionPercentage}%` }}
              />
            </div>
            <span className="text-emerald-400 font-bold">{stats.completionPercentage}%</span>
          </div>
        </div>

        {/* Modal Body */}
        {showFullReport ? (
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/60 font-mono text-xs leading-relaxed text-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <span className="text-cyan-400 font-bold">FULL MASTER BLUEPRINT DOCUMENTATION (BILINGUAL)</span>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyReport}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Markdown'}
                </button>
                <button
                  onClick={() => setShowFullReport(false)}
                  className="px-3 py-1 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 rounded border border-cyan-700"
                >
                  Back to Phases
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-slate-300 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              {reportMarkdown || 'Loading Master Blueprint Report...'}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Left: Phase List */}
            <div className="w-full md:w-5/12 border-r border-slate-800 overflow-y-auto p-4 flex flex-col gap-2 bg-slate-950/40">
              {phases.map((phase) => {
                const IconComponent = ICON_MAP[phase.icon] || Sparkles;
                const isSelected = selectedPhase === phase.id;
                const doneCount = phase.deliverables.filter((d) => d.done).length;
                const totalCount = phase.deliverables.length;

                return (
                  <button
                    key={phase.id}
                    onClick={() => setSelectedPhase(phase.id)}
                    className={`p-3.5 rounded-xl text-left border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-500/50 shadow-lg shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950'
                          : phase.status === 'completed'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-mono text-cyan-400 font-bold">{phase.code}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          {doneCount}/{totalCount}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-100 truncate mt-0.5">{phase.titleEn}</h4>
                      <p className="text-[11px] text-slate-400 truncate">{phase.titleHi}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Selected Phase Details & Interactive Checklist */}
            {currentPhase && (
              <div className="w-full md:w-7/12 p-6 overflow-y-auto flex flex-col gap-5 bg-slate-900/30">
                {/* Header */}
                <div className="flex flex-col gap-1 pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold">
                      {currentPhase.code}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      {currentPhase.cost}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 mt-1">{currentPhase.titleEn}</h3>
                  <p className="text-xs text-cyan-300 font-medium">{currentPhase.titleHi}</p>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{currentPhase.description}</p>
                </div>

                {/* Deliverables Checklist */}
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                    <span>Phase Deliverables & Verification Checklist</span>
                    <span className="text-[11px] text-cyan-400">Click to toggle</span>
                  </h4>

                  <div className="flex flex-col gap-2">
                    {currentPhase.deliverables.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleToggleDeliverable(currentPhase.id, idx)}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-cyan-700/50 text-left transition-colors group"
                      >
                        {item.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-xs ${
                            item.done ? 'text-slate-200 line-through text-slate-400' : 'text-slate-200 font-medium'
                          }`}
                        >
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice / Telegram Command Tester */}
                <div className="p-4 rounded-xl bg-slate-950 border border-cyan-900/40 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>SAMPLE JARVIS COMMAND</span>
                    <span className="text-cyan-400">CLICK TO EXECUTE</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-cyan-300">
                    <span>"{currentPhase.commandSample}"</span>
                    <button
                      onClick={() => {
                        onRunCommand(currentPhase.commandSample);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1 transition-colors text-[11px]"
                    >
                      <Zap className="w-3 h-3" />
                      Run
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>HERMES JARVIS • 100% Free Architecture Verified</span>
          <div className="flex items-center gap-4">
            <span>Security Matrix: Active</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
