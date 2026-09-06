import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Monitor,
  Cpu,
  Terminal,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Code2,
  Globe,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  ComputerOperatorTask,
  ScreenObservation,
  ComputerOperatorMode,
  CommandStreamEvent,
} from '../types/computerOperator';
import {
  ComputerOperatorEngine,
  ScreenObserver,
  ScreenInterpreter,
  TaskTracker,
} from '../utils/computerOperator';

interface ComputerOperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToChat?: (text: string) => void;
  activeLanguage?: string;
  isEmergencyStopped?: boolean;
}

export const ComputerOperatorModal: React.FC<ComputerOperatorModalProps> = ({
  isOpen,
  onClose,
  onSendToChat,
  activeLanguage = 'en-US',
  isEmergencyStopped = false,
}) => {
  const [activeTask, setActiveTask] = useState<ComputerOperatorTask | null>(null);
  const [currentObservation, setCurrentObservation] = useState<ScreenObservation | null>(null);
  const [operatorMode, setOperatorMode] = useState<ComputerOperatorMode>('hybrid');
  const [isRunning, setIsRunning] = useState(false);
  const [targetApp, setTargetApp] = useState<'vscode' | 'terminal' | 'browser' | 'desktop'>('vscode');
  const [customDirective, setCustomDirective] = useState('');
  const [streamEvents, setStreamEvents] = useState<CommandStreamEvent[]>([]);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const isHindi = activeLanguage.startsWith('hi') || activeLanguage === 'hinglish';

  // Load initial screen observation and listen to task updates
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    ScreenObserver.observeScreen({ mockWindow: targetApp, includeScreenshot: true }).then((obs) => {
      if (mounted) {
        setCurrentObservation(obs);
      }
    });

    const unsubscribe = TaskTracker.subscribe((task, event) => {
      if (mounted) {
        setActiveTask({ ...task });
        setStreamEvents([...task.streamEvents]);
        if (task.currentObservation) {
          setCurrentObservation(task.currentObservation);
        }
        if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED' || task.status === 'BLOCKED') {
          setIsRunning(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [isOpen, targetApp]);

  // Auto scroll stream
  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamEvents]);

  if (!isOpen) return null;

  const handleRunDirective = async (directive: string) => {
    if (!directive.trim() || isRunning) return;
    setIsRunning(true);
    setStreamEvents([]);

    try {
      const task = await ComputerOperatorEngine.executeTask(directive, operatorMode, isEmergencyStopped);
      setActiveTask(task);
      setStreamEvents([...task.streamEvents]);
      if (task.currentObservation) {
        setCurrentObservation(task.currentObservation);
      }
    } catch (err: any) {
      console.error('Execution error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    TaskTracker.cancelActiveTask('User cancelled from HUD');
    setIsRunning(false);
  };

  const handleRefreshScreen = async () => {
    const obs = await ScreenObserver.observeScreen({ mockWindow: targetApp, includeScreenshot: true });
    setCurrentObservation(obs);
  };

  const handleSwitchTarget = async (app: 'vscode' | 'terminal' | 'browser' | 'desktop') => {
    setTargetApp(app);
    const obs = await ScreenObserver.observeScreen({ mockWindow: app, includeScreenshot: true });
    setCurrentObservation(obs);
  };

  const interpretation = currentObservation ? ScreenInterpreter.interpret(currentObservation) : null;

  return (
    <div
      id="computer-operator-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        id="computer-operator-window"
        className="flex flex-col w-full max-w-6xl h-[90vh] bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/50 overflow-hidden font-sans text-slate-100"
      >
        {/* HEADER */}
        <div
          id="computer-operator-header"
          className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-cyan-500/20"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-wide text-cyan-300">
                  HERMES JARVIS
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  COMPUTER OPERATOR & SCREEN RESEARCHER
                </span>
                {isEmergencyStopped && (
                  <span className="text-xs px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 flex items-center gap-1 font-mono">
                    <ShieldAlert className="w-3 h-3" /> EMERGENCY PAUSED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'स्वायत्त कंप्यूटर नियंत्रण और स्क्रीन रिसर्च इंजन (लोकल / क्लाउड / हाइब्रिड)'
                  : 'Autonomous screen inspection, discrete actions, and verified state transition loop'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode selector */}
            <div className="hidden sm:flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
              <button
                id="mode-btn-local"
                onClick={() => setOperatorMode('local')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  operatorMode === 'local'
                    ? 'bg-cyan-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Local
              </button>
              <button
                id="mode-btn-cloud"
                onClick={() => setOperatorMode('cloud')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  operatorMode === 'cloud'
                    ? 'bg-cyan-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cloud
              </button>
              <button
                id="mode-btn-hybrid"
                onClick={() => setOperatorMode('hybrid')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  operatorMode === 'hybrid'
                    ? 'bg-cyan-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hybrid
              </button>
            </div>

            <button
              id="computer-operator-close-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE CONTENT SPLIT */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
          {/* LEFT: SCREEN OBSERVER & VISUAL INSPECTOR (7 cols) */}
          <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/40 p-4 overflow-y-auto">
            {/* Top Bar: Target App Controls */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400">TARGET APP:</span>
                <div className="flex gap-1">
                  <button
                    id="target-app-vscode-btn"
                    onClick={() => handleSwitchTarget('vscode')}
                    className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 border transition-colors ${
                      targetApp === 'vscode'
                        ? 'bg-blue-950/80 border-blue-500 text-blue-300 font-medium'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> VS Code
                  </button>
                  <button
                    id="target-app-terminal-btn"
                    onClick={() => handleSwitchTarget('terminal')}
                    className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 border transition-colors ${
                      targetApp === 'terminal'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-medium'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" /> Terminal
                  </button>
                  <button
                    id="target-app-browser-btn"
                    onClick={() => handleSwitchTarget('browser')}
                    className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 border transition-colors ${
                      targetApp === 'browser'
                        ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-medium'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Browser
                  </button>
                  <button
                    id="target-app-desktop-btn"
                    onClick={() => handleSwitchTarget('desktop')}
                    className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 border transition-colors ${
                      targetApp === 'desktop'
                        ? 'bg-purple-950/80 border-purple-500 text-purple-300 font-medium'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                </div>
              </div>

              <button
                id="refresh-screen-btn"
                onClick={handleRefreshScreen}
                className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Capture Screen
              </button>
            </div>

            {/* Simulated Desktop / Screen Canvas */}
            <div
              id="screen-canvas-container"
              className="relative w-full aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-inner flex flex-col"
            >
              {/* Fake Window Title Bar */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px] truncate">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="truncate">{currentObservation?.windowTitle || 'Desktop Observation'}</span>
                </div>
                <div className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-900">
                  {currentObservation?.screenResolution.width}x{currentObservation?.screenResolution.height}
                </div>
              </div>

              {/* Display Canvas View */}
              <div className="relative flex-1 p-3 flex flex-col justify-between font-mono text-xs overflow-hidden">
                {/* Background grid lines */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

                {/* Visible Elements Overlay */}
                <div className="z-10 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
                    <span className="text-cyan-400 font-semibold">
                      ACTIVE APP: {currentObservation?.activeApplication || 'None'}
                    </span>
                    <span>
                      {currentObservation?.visibleElements.length || 0} UI Elements Parsed
                    </span>
                  </div>

                  {/* UI Elements Grid Display */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {currentObservation?.visibleElements.map((el) => (
                      <div
                        key={el.id}
                        className={`p-2 rounded border text-[11px] flex flex-col justify-between ${
                          el.type === 'button'
                            ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                            : el.type === 'tab'
                            ? 'bg-blue-950/30 border-blue-500/40 text-blue-300'
                            : el.type === 'input'
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                            : el.type === 'dialog'
                            ? 'bg-purple-950/30 border-purple-500/40 text-purple-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                            {el.type}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            ({el.coordinates.x},{el.coordinates.y})
                          </span>
                        </div>
                        <div className="truncate font-semibold mt-1">{el.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Terminal output if any */}
                  {currentObservation?.terminalOutput && (
                    <div className="mt-2 p-2 rounded bg-black/70 border border-slate-800 font-mono text-[11px] text-emerald-400 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {currentObservation.terminalOutput}
                    </div>
                  )}

                  {/* Error Alert Box */}
                  {currentObservation && currentObservation.detectedErrors.length > 0 && (
                    <div className="mt-2 p-2.5 rounded bg-red-950/40 border border-red-500/50 text-red-300 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Detected Error on Screen:</div>
                        {currentObservation.detectedErrors.map((err, idx) => (
                          <div key={idx} className="font-mono text-[11px] mt-0.5">
                            {err}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* State Indicator */}
                <div className="z-10 flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                      }`}
                    />
                    <span>
                      {isRunning ? 'OPERATOR ACTIVE: OBSERVING SCREEN' : 'STANDBY: SCREEN SYNCHRONIZED'}
                    </span>
                  </div>
                  <div className="text-slate-500">
                    Resolution: {currentObservation?.platform || 'linux-arm64'}
                  </div>
                </div>
              </div>
            </div>

            {/* Semantic Interpretation Summary Card */}
            <div className="mt-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs">
              <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>SEMANTIC SCREEN INTERPRETATION:</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                {isHindi ? interpretation?.summaryHi : interpretation?.summary}
              </p>
            </div>
          </div>

          {/* RIGHT: COMMAND STREAM & EXECUTION CONTROLS (5 cols) */}
          <div className="lg:col-span-5 flex flex-col bg-slate-950/80 p-4 overflow-hidden">
            {/* Stream Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>LIVE COMMAND STREAM & TELEMETRY</span>
              </div>
              {isRunning && (
                <button
                  id="cancel-task-btn"
                  onClick={handleCancel}
                  className="px-2 py-0.5 text-xs rounded bg-red-950 text-red-300 border border-red-800 hover:bg-red-900 transition-colors flex items-center gap-1"
                >
                  <Square className="w-3 h-3 fill-current" /> Stop Task
                </button>
              )}
            </div>

            {/* Live Command Stream Box */}
            <div
              id="live-command-stream"
              className="flex-1 p-3 bg-slate-900/80 border border-slate-800 rounded-lg overflow-y-auto flex flex-col gap-2.5 font-mono text-xs shadow-inner"
            >
              {streamEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                  <Monitor className="w-8 h-8 mb-2 opacity-30 text-cyan-400" />
                  <p className="font-sans font-medium text-slate-400">
                    {isHindi ? 'कोई सक्रिय टास्क नहीं' : 'No Active Task Running'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                    {isHindi
                      ? 'नीचे दिए गए निर्देशों में से चुनें या अपना कार्य टाइप करें।'
                      : 'Choose one of the quick operational directives below or submit your own request.'}
                  </p>
                </div>
              ) : (
                streamEvents.map((evt) => {
                  let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
                  if (evt.stage === 'COMMAND_RECEIVED') badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-800';
                  else if (evt.stage === 'ANALYZING_SCREEN') badgeColor = 'bg-blue-950 text-blue-300 border-blue-800';
                  else if (evt.stage === 'PLAN_CREATED') badgeColor = 'bg-indigo-950 text-indigo-300 border-indigo-800';
                  else if (evt.stage === 'ACTION') badgeColor = 'bg-amber-950 text-amber-300 border-amber-800';
                  else if (evt.stage === 'VERIFYING') badgeColor = 'bg-purple-950 text-purple-300 border-purple-800';
                  else if (evt.stage === 'RESULT') badgeColor = 'bg-teal-950 text-teal-300 border-teal-800';
                  else if (evt.stage === 'COMPLETED') badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-800';
                  else if (evt.stage === 'NEEDS_APPROVAL') badgeColor = 'bg-red-950 text-red-300 border-red-800 animate-pulse';
                  else if (evt.stage === 'BLOCKED') badgeColor = 'bg-rose-950 text-rose-300 border-rose-800';
                  else if (evt.stage === 'CANCELLED') badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';

                  return (
                    <div
                      key={evt.id}
                      className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded border font-semibold tracking-wide ${badgeColor}`}>
                          {evt.stage}
                        </span>
                        <span className="text-slate-500">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-slate-200 text-[11px] leading-relaxed break-words font-sans">
                        {isHindi && evt.messageHi ? evt.messageHi : evt.message}
                      </div>
                      {evt.error && (
                        <div className="text-red-400 text-[10px] font-mono mt-0.5">
                          Error: {evt.error}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={streamEndRef} />
            </div>

            {/* Quick Operational Directives */}
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>QUICK DIRECTIVES:</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  id="directive-fix-error-btn"
                  onClick={() => handleRunDirective('Open VS Code and fix the project error')}
                  disabled={isRunning}
                  className="w-full text-left px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300 flex items-center justify-between transition-colors disabled:opacity-50"
                >
                  <span className="truncate">Open VS Code and fix the project error</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                </button>
                <button
                  id="directive-inspect-screen-btn"
                  onClick={() => handleRunDirective('स्क्रीन देखकर बताओ क्या समस्या है')}
                  disabled={isRunning}
                  className="w-full text-left px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center justify-between transition-colors disabled:opacity-50"
                >
                  <span className="truncate">स्क्रीन देखकर बताओ क्या समस्या है</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                </button>
                <button
                  id="directive-open-terminal-btn"
                  onClick={() => handleRunDirective('Open Windows Terminal and run git status')}
                  disabled={isRunning}
                  className="w-full text-left px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center justify-between transition-colors disabled:opacity-50"
                >
                  <span className="truncate">Open Terminal and run git status</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Directive Input Form */}
            <div className="mt-3 flex gap-2">
              <input
                id="computer-operator-input"
                type="text"
                value={customDirective}
                onChange={(e) => setCustomDirective(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRunDirective(customDirective);
                    setCustomDirective('');
                  }
                }}
                placeholder={
                  isHindi
                    ? 'आदेश लिखें (उदा. VS Code खोलो, error ठीक करो)...'
                    : 'Enter directive (e.g., Open VS Code, check error)...'
                }
                disabled={isRunning}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <button
                id="computer-operator-execute-btn"
                onClick={() => {
                  handleRunDirective(customDirective);
                  setCustomDirective('');
                }}
                disabled={!customDirective.trim() || isRunning}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:text-slate-500 shadow-md shadow-cyan-900/30"
              >
                {isRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Run</span>
              </button>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div
          id="computer-operator-footer"
          className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-t border-slate-800/80 text-[11px] text-slate-400"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Level 1-4 Guard Active: Financial exclusions hard-locked | Secrets & tokens redacted
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-slate-500">
              Task ID: {activeTask?.taskId || 'STANDBY'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
