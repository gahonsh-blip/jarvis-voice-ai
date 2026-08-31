import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  Key,
  CheckCircle2,
  AlertTriangle,
  History,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { SecurityMatrixState } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityMatrixModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [securityState, setSecurityState] = useState<SecurityMatrixState | null>(null);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(2);

  useEffect(() => {
    if (isOpen) {
      fetchSecurity();
    }
  }, [isOpen]);

  const fetchSecurity = async () => {
    try {
      const res = await fetch('/api/security');
      const data = await res.json();
      setSecurityState(data);
      if (data.currentLevel) setActiveLevel(data.currentLevel);
    } catch (err) {
      console.warn('Failed to fetch security state:', err);
    }
  };

  const handleUpdateLevel = async (level: 1 | 2 | 3 | 4) => {
    try {
      const res = await fetch('/api/security/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentLevel: level }),
      });
      const data = await res.json();
      if (data.success) {
        setSecurityState(data.securityState);
        setActiveLevel(level);
      }
    } catch (err) {
      console.warn('Update security level failed:', err);
    }
  };

  const handleToggleHumanApproval = async () => {
    if (!securityState) return;
    try {
      const res = await fetch('/api/security/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          humanApprovalForExternal: !securityState.humanApprovalForExternal,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSecurityState(data.securityState);
      }
    } catch (err) {
      console.warn('Toggle human approval failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-cyan-800/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">HERMES JARVIS Security Matrix</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Level {activeLevel} Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Phase 0 Security Baseline • Multi-Tier Permissions • Zero Credential Leaks Protocol
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

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 bg-slate-950/40">
          {/* Security Levels Grid (1 to 4) */}
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-3">
              Operational Security Levels (Click level to select active runtime mode)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {securityState?.levels.map((lvl) => {
                const isSelected = activeLevel === lvl.level;
                return (
                  <button
                    key={lvl.level}
                    onClick={() => handleUpdateLevel(lvl.level)}
                    className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-cyan-950/70 border-cyan-400 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-500'
                        : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${
                            lvl.level === 1
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : lvl.level === 2
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : lvl.level === 3
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          Level {lvl.level}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Risk: {lvl.risk}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-100">{lvl.title.split(':')[1]}</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{lvl.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                      {lvl.allowedActions.map((action, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400"
                        >
                          {action}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Critical Security Rules Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Human Approval for External Broadcasts</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Never publish to social feeds or send client proposals without explicit confirmation.
                </p>
              </div>
              <button
                onClick={handleToggleHumanApproval}
                className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {securityState?.humanApprovalForExternal ? (
                  <span className="px-3 py-1 bg-emerald-950 border border-emerald-700 rounded-lg text-xs font-mono font-bold">
                    ENFORCED
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-slate-800 rounded-lg text-xs font-mono text-slate-400">
                    DISABLED
                  </span>
                )}
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Zero Credential Leaks to LLM Memory</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  SSH keys, cloud tokens, and API secrets are never stored in conversation context banks.
                </p>
              </div>
              <span className="px-3 py-1 bg-cyan-950 border border-cyan-700 text-cyan-300 rounded-lg text-xs font-mono font-bold">
                PROTECTED
              </span>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-4 h-4 text-cyan-400" />
              Security Audit Trail (Real-Time Execution Logs)
            </span>

            <div className="flex flex-col gap-1.5 font-mono text-xs">
              {securityState?.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold text-[10px] shrink-0">
                      Level {log.levelRequired}
                    </span>
                    <span className="text-slate-200">{log.action}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-500">By: {log.approvedBy}</span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        log.status === 'VERIFIED' || log.status === 'EXECUTED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : log.status === 'NOT_PUBLISHED'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : log.status === 'BLOCKED' || log.status === 'FAILED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Security Matrix Status: 100% Operational</span>
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
