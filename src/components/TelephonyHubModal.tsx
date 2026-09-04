import React, { useState } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  Bot,
  User,
  Shield,
  ShieldAlert,
  Clock,
  Sparkles,
  FileText,
  Download,
  Trash2,
  Settings,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Hash,
  Volume2,
  Users,
  Search,
  ArrowRight,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import {
  CallRecord,
  TelephonySettings,
  ContactItem,
  CallScenarioPreset,
  SimulatedCallerPersona,
  DEFAULT_CONTACTS,
  CALL_SCENARIO_PRESETS,
  SIMULATED_INCOMING_CALLERS,
  isNumberInContacts,
  getDisplayCallerName,
} from '../types/telephony';
import { telephonyAudio } from '../utils/telephonyAudio';
import { runTelephonyTestSuite, TestSuiteSummary } from '../utils/telephonyTestRunner';
import { downloadCallHistoryCsv } from '../utils/telephonyEngine';
import {
  PHONE_PERMISSION_DEFINITIONS,
  DEFAULT_PHONE_PERMISSIONS,
  DEFAULT_CLINIC_CONFIG,
  PhonePermissionKey,
} from '../utils/telephonyPermissions';

interface TelephonyHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCall: CallRecord | null;
  callHistory: CallRecord[];
  contacts: ContactItem[];
  settings: TelephonySettings;
  onUpdateSettings: (newSettings: TelephonySettings) => void;
  onStartOutboundCall: (params: {
    recipientNumber: string;
    recipientName: string;
    objective: string;
    aiPersona?: string;
  }) => void;
  onTriggerIncomingCall: (persona: SimulatedCallerPersona) => void;
  onClearHistory: () => void;
}

export const TelephonyHubModal: React.FC<TelephonyHubModalProps> = ({
  isOpen,
  onClose,
  activeCall,
  callHistory,
  contacts,
  settings,
  onUpdateSettings,
  onStartOutboundCall,
  onTriggerIncomingCall,
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'dialer' | 'receptionist' | 'logs' | 'gateway' | 'permissions' | 'test_suite'>('dialer');
  const [testResults, setTestResults] = useState<TestSuiteSummary | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [phonePermissions, setPhonePermissions] = useState<Record<string, boolean>>(() => {
    const raw: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(DEFAULT_PHONE_PERMISSIONS)) {
      raw[k] = v === 'GRANTED';
    }
    return raw;
  });
  const [providerStatus, setProviderStatus] = useState<{
    status: string;
    isConfigured: boolean;
    provider?: { id: string; name: string };
  } | null>(null);

  React.useEffect(() => {
    fetch('/api/telephony/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success) {
          setProviderStatus(data);
        }
      })
      .catch(() => {});

    fetch('/api/telephony/permissions')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.permissions) {
          const map: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(data.permissions as Record<string, any>)) {
            map[k] = v.state === 'GRANTED';
          }
          setPhonePermissions(map);
        }
      })
      .catch(() => {});
  }, []);

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const summary = await runTelephonyTestSuite();
      setTestResults(summary);
    } catch (e) {
      console.error('Error running test suite:', e);
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleTogglePermission = (key: string) => {
    const updated = {
      ...phonePermissions,
      [key]: !phonePermissions[key],
    };
    setPhonePermissions(updated);
    fetch('/api/telephony/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [key]: {
          key,
          state: updated[key] ? 'GRANTED' : 'DENIED',
          lastUpdated: new Date().toISOString(),
        },
      }),
    }).catch(() => {});
  };

  // Dialer state
  const [dialNumber, setDialNumber] = useState('');
  const [calleeName, setCalleeName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('reschedule_doctor');
  const [customObjective, setCustomObjective] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<string>(settings.aiPersona);

  // Receptionist state
  const [tempSettings, setTempSettings] = useState<TelephonySettings>(settings);
  const [customIncomingName, setCustomIncomingName] = useState('');
  const [customIncomingNumber, setCustomIncomingNumber] = useState('');
  const [customIncomingLine, setCustomIncomingLine] = useState('');

  // Keep tempSettings in sync with parent settings
  React.useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const effectiveContacts = contacts && contacts.length > 0 ? contacts : DEFAULT_CONTACTS;
  const maskUnknownEnabled = tempSettings.maskUnknownCallerId !== false;

  const handleToggleMaskUnknownCallerId = (checked: boolean) => {
    const updated = { ...tempSettings, maskUnknownCallerId: checked };
    setTempSettings(updated);
    onUpdateSettings(updated);
  };

  const getEffectiveCallerName = (callerName: string, callerNumber: string) => {
    return getDisplayCallerName(callerName, callerNumber, effectiveContacts, maskUnknownEnabled);
  };

  // Logs state
  const [searchLog, setSearchLog] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(callHistory[0]?.id || null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  if (!isOpen) return null;

  const dtmfKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  const handleKeyPress = (k: string) => {
    if (settings.dtmfAudioEnabled) {
      telephonyAudio.playDtmf(k);
    }
    setDialNumber((prev) => prev + k);
  };

  const handleSelectContact = (c: ContactItem) => {
    setDialNumber(c.number);
    setCalleeName(c.name);
  };

  const handleSelectPreset = (preset: CallScenarioPreset) => {
    setSelectedPresetId(preset.id);
    setCalleeName(preset.recipientName);
    setDialNumber(preset.recipientNumber);
    setCustomObjective(preset.objective);
    setSelectedPersona(preset.suggestedPersona);
  };

  const handleLaunchOutbound = () => {
    const finalNumber = dialNumber.trim() || '+1 (415) 890-2134';
    const finalName = calleeName.trim() || 'Direct Contact';
    const currentPreset = CALL_SCENARIO_PRESETS.find((p) => p.id === selectedPresetId);
    const finalObjective = customObjective.trim() || currentPreset?.objective || 'General autonomous assistant coordination';

    onStartOutboundCall({
      recipientNumber: finalNumber,
      recipientName: finalName,
      objective: finalObjective,
      aiPersona: selectedPersona,
    });
  };

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
  };

  const handleTestGreeting = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(tempSettings.aiReceptionistGreeting);
      u.rate = tempSettings.voiceRate || 1.0;
      u.pitch = tempSettings.voicePitch || 1.0;
      window.speechSynthesis.speak(u);
    }
  };

  const filteredLogs = callHistory.filter((c) => {
    if (!searchLog) return true;
    const q = searchLog.toLowerCase();
    const effectiveCaller = c.direction === 'outbound' ? c.recipientName : getEffectiveCallerName(c.callerName, c.callerNumber);
    return (
      effectiveCaller.toLowerCase().includes(q) ||
      c.callerName.toLowerCase().includes(q) ||
      c.recipientName.toLowerCase().includes(q) ||
      c.callerNumber.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q) ||
      c.intent.toLowerCase().includes(q)
    );
  });

  const selectedLog = callHistory.find((c) => c.id === selectedLogId) || callHistory[0];

  const exportCallHistoryCsv = () => {
    downloadCallHistoryCsv(callHistory);
  };

  const exportCallLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(callHistory, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `hermes_jarvis_call_logs_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col h-[90vh] max-h-[820px] w-full max-w-5xl rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-cyan-900/40 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/50 shadow-lg shadow-cyan-900/30">
              <PhoneCall className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide text-white">HERMES JARVIS • Telephony & Call Hub</h2>
                <span className="flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  VOICE AGENT ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Autonomous outbound caller, inbound AI receptionist, spam shield, and voice dialogue coordinator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="export-call-history-header-btn"
              onClick={exportCallHistoryCsv}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-cyan-300 transition-all active:scale-95 shadow-sm"
              title="Export Call History as CSV"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export Call History</span>
            </button>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-mono border flex items-center gap-1.5 ${
                providerStatus?.isConfigured
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${providerStatus?.isConfigured ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
              {providerStatus?.isConfigured ? 'GATEWAY CONFIGURED' : 'TELEPHONY_NOT_CONFIGURED'}
            </span>
            {activeCall && (
              <span className="rounded-lg bg-cyan-950 px-2.5 py-1 text-xs font-mono text-cyan-300 border border-cyan-800">
                Call Active ({activeCall.status})
              </span>
            )}
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('dialer')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'dialer'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PhoneOutgoing className="h-4 w-4" />
            Outbound Dialer
          </button>
          <button
            onClick={() => setActiveTab('receptionist')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'receptionist'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PhoneIncoming className="h-4 w-4" />
            AI Receptionist
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'logs'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            Call Logs ({callHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'permissions'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="h-4 w-4" />
            Phone Permissions
          </button>
          <button
            onClick={() => setActiveTab('gateway')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'gateway'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="h-4 w-4" />
            Carrier Gateway
          </button>
          <button
            onClick={() => setActiveTab('test_suite')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'test_suite'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Automated Tests (20/20)
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: OUTBOUND DIALER */}
          {activeTab === 'dialer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Keypad & Destination (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Target Phone Number</label>
                  <div className="mt-1 flex items-center rounded-xl bg-slate-950 border border-slate-700 px-3 py-2">
                    <input
                      type="text"
                      value={dialNumber}
                      onChange={(e) => setDialNumber(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-transparent text-lg font-mono font-bold text-cyan-400 focus:outline-none"
                    />
                    {dialNumber && (
                      <button
                        onClick={() => setDialNumber('')}
                        className="text-slate-500 hover:text-slate-300 text-xs px-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="mt-3">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Recipient Name / Entity</label>
                    <input
                      type="text"
                      value={calleeName}
                      onChange={(e) => setCalleeName(e.target.value)}
                      placeholder="e.g. Dr. Julian Wayne Clinic"
                      className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* DTMF Keypad */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {dtmfKeys.map((k) => (
                      <button
                        key={k}
                        onClick={() => handleKeyPress(k)}
                        className="flex flex-col items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700/80 py-2.5 text-white hover:bg-cyan-950 hover:border-cyan-500 active:scale-95 transition-all"
                      >
                        <span className="text-base font-bold">{k}</span>
                      </button>
                    ))}
                  </div>

                  {/* Launch Call Button */}
                  <button
                    onClick={handleLaunchOutbound}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-900/40 hover:from-cyan-500 hover:to-blue-500 active:scale-98 transition-all"
                  >
                    <PhoneOutgoing className="h-4 w-4" />
                    Initiate Autonomous Voice Call
                  </button>
                </div>

                {/* Speed Dial Contacts */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Quick-Dial Contacts</span>
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="space-y-1.5">
                    {contacts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectContact(c)}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`h-7 w-7 rounded-lg ${c.avatarColor || 'bg-cyan-600'} flex items-center justify-center text-xs font-bold text-white`}>
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white group-hover:text-cyan-300">{c.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.number}</div>
                          </div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                          {c.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Mission Objective & Presets (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">Call Mission Objective & AI Scripting</h3>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      AUTONOMOUS REASONING
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mb-3">
                    Choose a pre-engineered call objective or type custom instructions. JARVIS will navigate conversational turns, handle questions, negotiate slots, and summarize outcomes.
                  </p>

                  {/* Objective Presets */}
                  <div className="space-y-2 mb-4">
                    {CALL_SCENARIO_PRESETS.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedPresetId === preset.id
                            ? 'bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-950/30'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{preset.title}</span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {preset.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1 line-clamp-2">{preset.objective}</p>
                      </div>
                    ))}
                  </div>

                  {/* Custom Objective Override */}
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Custom Objective Instructions
                    </label>
                    <textarea
                      rows={3}
                      value={customObjective}
                      onChange={(e) => setCustomObjective(e.target.value)}
                      placeholder="e.g. Inquire about pricing for 50 licenses, request an invoice sent to finance@domain.com..."
                      className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* AI Persona Selector */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">AI Voice Persona</label>
                      <select
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value)}
                        className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="executive_assistant">Executive Assistant (Polite, Decisive)</option>
                        <option value="tech_specialist">Tech Specialist (Analytical, Precise)</option>
                        <option value="concierge">Concierge (Warm, Service-Oriented)</option>
                        <option value="friendly_receptionist">Friendly Receptionist (Helpful)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Acoustic Simulation</label>
                      <div className="mt-1 flex items-center justify-between rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-slate-300">
                        <span>PSTN / Cellular Bandpass</span>
                        <span className="text-cyan-400 font-mono text-[10px]">300-3400Hz ON</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INBOUND RECEPTIONIST & SIMULATOR */}
          {activeTab === 'receptionist' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Inbound Rules & Auto-Answer (6 cols) */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">AI Autonomous Receptionist</h3>
                    </div>
                    <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-800">
                      READY TO ANSWER
                    </span>
                  </div>

                  {/* Auto Answer Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 mb-3">
                    <div>
                      <div className="text-xs font-bold text-white">Auto-Answer Incoming Calls</div>
                      <div className="text-[11px] text-slate-400">Picks up line automatically and engages with AI Receptionist</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempSettings.autoAnswerInbound}
                        onChange={(e) => setTempSettings({ ...tempSettings, autoAnswerInbound: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
                    </label>
                  </div>

                  {/* Auto Answer Delay */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 mb-3">
                    <div className="flex justify-between text-xs font-bold text-white mb-1">
                      <span>Rings Before Auto-Pickup</span>
                      <span className="font-mono text-cyan-400">{tempSettings.autoAnswerDelaySeconds} Seconds (~1-2 Rings)</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={tempSettings.autoAnswerDelaySeconds}
                      onChange={(e) => setTempSettings({ ...tempSettings, autoAnswerDelaySeconds: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Receptionist Greeting Text */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                        Receptionist Spoken Greeting
                      </label>
                      <button
                        onClick={handleTestGreeting}
                        className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                      >
                        <Volume2 className="h-3 w-3" /> Test Audio
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={tempSettings.aiReceptionistGreeting}
                      onChange={(e) => setTempSettings({ ...tempSettings, aiReceptionistGreeting: e.target.value })}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Privacy-First Caller ID Masking */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 mb-4 transition-all hover:border-cyan-500/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/90 border border-cyan-500/40">
                          {maskUnknownEnabled ? <EyeOff className="h-4 w-4 text-cyan-400" /> : <Eye className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Privacy-First Caller ID Masking</span>
                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-mono border ${
                              maskUnknownEnabled
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                                : 'bg-slate-900 text-slate-400 border-slate-700'
                            }`}>
                              {maskUnknownEnabled ? 'ENFORCED' : 'DISABLED'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Dynamically masks caller ID names to &apos;Unknown Caller&apos; in UI if phone number is not in contacts
                          </div>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          id="privacy-caller-id-toggle"
                          checked={maskUnknownEnabled}
                          onChange={(e) => handleToggleMaskUnknownCallerId(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
                      </label>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-500">Contact list: {contacts.length} verified numbers</span>
                      <span className={maskUnknownEnabled ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
                        {maskUnknownEnabled ? '✓ Masking unknown numbers in UI' : 'Raw carrier names displayed'}
                      </span>
                    </div>
                  </div>

                  {/* Spam Protection */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Autonomous Spam & Robocall Shield</div>
                        <div className="text-[11px] text-slate-400">Blocks pre-selected solar, utility, debt, and fraud solicitations</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={tempSettings.spamScreeningEnabled}
                      onChange={(e) => setTempSettings({ ...tempSettings, spamScreeningEnabled: e.target.checked })}
                      className="h-4 w-4 accent-cyan-500"
                    />
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 py-2.5 text-xs font-bold text-white hover:bg-cyan-600 transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Save Inbound Receptionist Rules
                  </button>
                </div>
              </div>

              {/* Right: Live Simulated Incoming Callers (6 cols) */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <PhoneIncoming className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">Simulate Inbound Calls</h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">TEST AI RECEPTIONIST</span>
                  </div>

                  <p className="text-xs text-slate-300 mb-3">
                    Click any scenario below to trigger an immediate incoming call. Experience how JARVIS screens the caller, provides gate codes, reschedules meetings, or ejects spam telemarketers.
                  </p>

                  <div className="space-y-2">
                    {SIMULATED_INCOMING_CALLERS.map((persona) => {
                      const inContacts = isNumberInContacts(persona.callerNumber, effectiveContacts);
                      const displayedName = getEffectiveCallerName(persona.callerName, persona.callerNumber);
                      const isMasked = maskUnknownEnabled && !inContacts;

                      return (
                        <div
                          key={persona.id}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/60 transition-all flex items-center justify-between group"
                        >
                          <div className="max-w-[75%]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{displayedName}</span>
                              {isMasked ? (
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                                  <Shield className="h-2.5 w-2.5 text-cyan-400" /> MASKED
                                </span>
                              ) : inContacts ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  CONTACT
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                  UNVERIFIED
                                </span>
                              )}
                              {persona.isSpam && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                                  SPAM TEST
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-cyan-300 font-medium">{persona.scenarioTitle}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1 italic mt-0.5">
                              "{persona.firstLine}"
                            </div>
                            {isMasked && (
                              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                Raw carrier ID: {persona.callerName} (masked by privacy policy)
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => onTriggerIncomingCall(persona)}
                            className="flex items-center gap-1 rounded-xl bg-emerald-600/90 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 active:scale-95 transition-all shadow-md shadow-emerald-900/20"
                          >
                            <PhoneIncoming className="h-3.5 w-3.5" />
                            Ring Now
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom Inbound Caller Test */}
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                      <span>Custom Inbound Caller Test</span>
                      <span className="text-[10px] font-mono text-cyan-400">TEST PRIVACY MASKING</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[10px] font-mono text-slate-400">Raw Carrier Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Apex Freight Dispatch"
                          value={customIncomingName}
                          onChange={(e) => setCustomIncomingName(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-slate-400">Caller Phone Number</label>
                        <input
                          type="text"
                          placeholder="e.g. +1 (555) 392-8811"
                          value={customIncomingNumber}
                          onChange={(e) => setCustomIncomingNumber(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="text-[10px] font-mono text-slate-400">First Spoken Sentence</label>
                      <input
                        type="text"
                        placeholder="e.g. Hi Alex, I have an urgent update regarding your logistics dispatch."
                        value={customIncomingLine}
                        onChange={(e) => setCustomIncomingLine(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">UI Display:</span>
                        <span className="font-bold text-white">
                          {getEffectiveCallerName(
                            customIncomingName || 'Unknown Caller',
                            customIncomingNumber || '+1 (555) 000-0000'
                          )}
                        </span>
                        {maskUnknownEnabled &&
                          !isNumberInContacts(customIncomingNumber || '+1 (555) 000-0000', effectiveContacts) && (
                            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-800">
                              MASKED
                            </span>
                          )}
                      </div>
                      <button
                        onClick={() => {
                          const cName = customIncomingName.trim() || 'Unlisted Carrier Caller';
                          const cNum = customIncomingNumber.trim() || '+1 (555) 992-0199';
                          const cLine =
                            customIncomingLine.trim() || 'Hello, I am calling with an urgent inquiry.';
                          onTriggerIncomingCall({
                            id: `sim_custom_${Date.now()}`,
                            callerName: cName,
                            callerNumber: cNum,
                            callerRole: 'External Inbound Caller',
                            scenarioTitle: 'Custom Simulated Caller',
                            firstLine: cLine,
                            callerPersonality: 'Direct, clear voice caller',
                            goal: 'Screening and privacy verification',
                            isSpam: false,
                          });
                        }}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 active:scale-95 transition-all"
                      >
                        <PhoneIncoming className="h-3 w-3" />
                        Simulate Call
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CALL LOGS & INTELLIGENCE */}
          {activeTab === 'logs' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Call List (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={searchLog}
                      onChange={(e) => setSearchLog(e.target.value)}
                      placeholder="Search transcripts, callers..."
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <button
                    id="export-call-history-logs-btn"
                    onClick={exportCallHistoryCsv}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-3 text-xs font-semibold text-white shadow-md shadow-cyan-950/40 transition-all active:scale-95 whitespace-nowrap"
                    title="Export Call History as CSV"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Call History</span>
                  </button>
                  <button
                    onClick={exportCallLogs}
                    className="flex h-9 items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-2.5 text-xs text-slate-300 hover:text-white transition-all"
                    title="Export JSON"
                  >
                    JSON
                  </button>
                  <button
                    onClick={onClearHistory}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-950"
                    title="Clear history"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
                  {filteredLogs.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                      <FileText className="h-6 w-6 mb-1 opacity-50" />
                      No call records found
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      const isSelected = selectedLog?.id === log.id;
                      const isOutbound = log.direction === 'outbound';
                      return (
                        <div
                          key={log.id}
                          onClick={() => setSelectedLogId(log.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-cyan-950/40 border-cyan-500'
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isOutbound ? (
                                <PhoneOutgoing className="h-3.5 w-3.5 text-cyan-400" />
                              ) : (
                                <PhoneIncoming className="h-3.5 w-3.5 text-emerald-400" />
                              )}
                              <span className="text-xs font-bold text-white">
                                {isOutbound ? log.recipientName : getEffectiveCallerName(log.callerName, log.callerNumber)}
                              </span>
                              {!isOutbound && maskUnknownEnabled && !isNumberInContacts(log.callerNumber, effectiveContacts) && (
                                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                                  MASKED
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {Math.floor(log.durationSeconds / 60)}m {log.durationSeconds % 60}s
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 line-clamp-1">{log.summary}</p>
                          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>{new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                                log.sentiment === 'positive'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : log.sentiment === 'urgent'
                                  ? 'bg-amber-950 text-amber-300'
                                  : log.sentiment === 'negative'
                                  ? 'bg-rose-950 text-rose-300'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {log.sentiment}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Selected Call Intelligence (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {selectedLog ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400 uppercase font-bold">
                            {selectedLog.direction} CALL ARCHIVE
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            ID: {selectedLog.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <h3 className="text-base font-bold text-white">
                            {selectedLog.direction === 'outbound'
                              ? selectedLog.recipientName
                              : getEffectiveCallerName(selectedLog.callerName, selectedLog.callerNumber)}
                          </h3>
                          {selectedLog.direction === 'inbound' &&
                            maskUnknownEnabled &&
                            !isNumberInContacts(selectedLog.callerNumber, effectiveContacts) && (
                              <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 border border-cyan-800 flex items-center gap-1">
                                <Shield className="h-2.5 w-2.5 text-cyan-400" /> PRIVACY MASKED
                              </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono">
                          {selectedLog.direction === 'outbound' ? selectedLog.recipientNumber : selectedLog.callerNumber}
                        </p>
                      </div>

                      {/* Mock Audio Playback */}
                      <button
                        onClick={() => setIsPlayingAudio((p) => !p)}
                        className="flex items-center gap-1.5 rounded-xl bg-cyan-950 border border-cyan-800 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900 transition-all"
                      >
                        {isPlayingAudio ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {isPlayingAudio ? 'Playing Tape...' : 'Play Recording'}
                      </button>
                    </div>

                    {/* AI Executive Summary */}
                    <div className="mt-4 rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                      <div className="text-[11px] font-mono text-cyan-400 uppercase mb-1 font-bold">
                        Executive AI Summary
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{selectedLog.summary}</p>
                    </div>

                    {/* Follow Up Actions */}
                    {selectedLog.followUpActions && selectedLog.followUpActions.length > 0 && (
                      <div className="mt-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 p-3">
                        <div className="text-[11px] font-mono text-emerald-400 uppercase mb-1.5 font-bold">
                          Assigned Action Items & Next Steps
                        </div>
                        <ul className="space-y-1">
                          {selectedLog.followUpActions.map((act, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-emerald-200">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                              <span>{act}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Full Transcript */}
                    <div className="mt-4 flex-1">
                      <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">
                        Complete Verified Transcript ({selectedLog.transcript.length} turns)
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-2 rounded-xl bg-slate-950 p-3 border border-slate-800 text-xs">
                        {selectedLog.transcript.map((t, idx) => {
                          let speakerLabel = 'JARVIS AI';
                          if (t.speaker === 'agent') {
                            speakerLabel = 'JARVIS AI';
                          } else if (t.speaker === 'caller') {
                            speakerLabel =
                              selectedLog.direction === 'inbound'
                                ? getEffectiveCallerName(selectedLog.callerName, selectedLog.callerNumber)
                                : 'CALLER';
                          } else if (t.speaker === 'callee') {
                            speakerLabel = selectedLog.recipientName || 'CALLEE';
                          } else if (t.speaker === 'whisper') {
                            speakerLabel = 'AI WHISPER TIP';
                          } else {
                            speakerLabel = t.speaker.toUpperCase();
                          }

                          return (
                            <div key={idx} className="flex flex-col">
                              <span className="text-[10px] font-mono text-slate-500">
                                {speakerLabel} • {t.timestamp}
                              </span>
                              <span className={t.speaker === 'agent' ? 'text-cyan-200' : 'text-slate-300'}>
                                {t.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500 text-xs">
                    Select a call to review intelligence transcript
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CARRIER & GATEWAY SETTINGS */}
          {activeTab === 'gateway' && (
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Radio className="h-5 w-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Telephony Carrier Gateway Configuration</h3>
                    <p className="text-xs text-slate-400">
                      Configure real-world PSTN dialing via Twilio Voice API or WebRTC duplex browser acoustic simulator.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Active Telephony Engine
                    </label>
                    <div className="mt-1 grid grid-cols-2 gap-3">
                      <div
                        onClick={() => setTempSettings({ ...tempSettings, provider: 'browser_webrtc_simulator' })}
                        className={`p-3 rounded-xl border cursor-pointer ${
                          tempSettings.provider === 'browser_webrtc_simulator'
                            ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="text-xs font-bold text-white">Browser WebRTC Simulator</div>
                        <div className="text-[10px] mt-0.5">Zero API keys required. Full interactive speech calling.</div>
                      </div>

                      <div
                        onClick={() => setTempSettings({ ...tempSettings, provider: 'twilio' })}
                        className={`p-3 rounded-xl border cursor-pointer ${
                          tempSettings.provider === 'twilio'
                            ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="text-xs font-bold text-white">Twilio Telephony Trunk</div>
                        <div className="text-[10px] mt-0.5">Real worldwide PSTN cellular and landline connectivity.</div>
                      </div>
                    </div>
                  </div>

                  {/* Twilio Credentials */}
                  {tempSettings.provider === 'twilio' && (
                    <div className="space-y-3 rounded-xl bg-slate-950 border border-slate-800 p-4">
                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400">Twilio Account SID</label>
                        <input
                          type="text"
                          value={tempSettings.twilioAccountSid}
                          onChange={(e) => setTempSettings({ ...tempSettings, twilioAccountSid: e.target.value })}
                          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400">Twilio Auth Token</label>
                        <input
                          type="password"
                          value={tempSettings.twilioAuthToken}
                          onChange={(e) => setTempSettings({ ...tempSettings, twilioAuthToken: e.target.value })}
                          placeholder="••••••••••••••••••••••••••••••••"
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400">Assigned Twilio Phone Number</label>
                        <input
                          type="text"
                          value={tempSettings.twilioPhoneNumber}
                          onChange={(e) => setTempSettings({ ...tempSettings, twilioPhoneNumber: e.target.value })}
                          placeholder="+1 (555) 728-4827"
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Webhook Endpoints */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                    <div className="text-[11px] font-mono text-cyan-400 uppercase mb-2">Live Webhook Endpoints</div>
                    <div className="space-y-1 text-xs font-mono text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>POST /api/telephony/incoming</span>
                        <span className="text-emerald-400 text-[10px]">LIVE & READY</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>POST /api/telephony/twiml/voice</span>
                        <span className="text-emerald-400 text-[10px]">TwiML ACTIVE</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>POST /api/telephony/handle-turn</span>
                        <span className="text-emerald-400 text-[10px]">GEMINI BRAIN READY</span>
                      </div>
                    </div>
                  </div>

                  {/* Privacy & Caller ID Security Configuration */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/40">
                          <Lock className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Caller ID Privacy Shield</span>
                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-mono border ${
                              maskUnknownEnabled
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                                : 'bg-slate-900 text-slate-400 border-slate-700'
                            }`}>
                              {maskUnknownEnabled ? 'ACTIVE • ENFORCED' : 'OFF'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Mask inbound caller ID names to &apos;Unknown Caller&apos; unless matching a verified contact
                          </div>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={maskUnknownEnabled}
                          onChange={(e) => handleToggleMaskUnknownCallerId(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
                      </label>
                    </div>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSaveSettings}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-xs font-bold text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-950/40"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Save Telephony Gateway Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PHONE PERMISSIONS MATRIX */}
          {activeTab === 'permissions' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/40">
                    <Shield className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Phone Permissions & Access Control Matrix (Section J)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Strict zero-trust security architecture. Untrusted incoming callers cannot access owner-protected data without explicit runtime grants.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PHONE_PERMISSION_DEFINITIONS.map((def) => {
                    const isGranted = phonePermissions[def.key] ?? (def.defaultState === 'GRANTED');
                    const isHighRisk = def.level >= 4;
                    return (
                      <div
                        key={def.key}
                        className={`rounded-xl border p-4 transition-all flex flex-col justify-between ${
                          isGranted
                            ? 'bg-slate-950/80 border-slate-700'
                            : 'bg-slate-950/40 border-slate-800 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-cyan-300">{def.nameEn}</span>
                              {isHighRisk && (
                                <span className="rounded bg-rose-950/80 border border-rose-600/40 px-1.5 py-0.5 text-[9px] font-mono text-rose-300">
                                  HIGH RISK
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{def.descriptionEn}</p>
                            <span className="mt-2 inline-block text-[10px] font-mono text-slate-500">{def.key} (Level {def.level})</span>
                          </div>
                          <button
                            onClick={() => handleTogglePermission(def.key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-mono font-bold transition-all ${
                              isGranted
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            {isGranted ? 'GRANTED' : 'DENIED'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-amber-950/30 border border-amber-500/30 p-3 flex items-start gap-2 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Level-4 Human Authorization Policy:</span> High-risk phone operations like placing outbound calls or exposing financial/private data require continuous confirmation. Outbound dialing cannot be triggered solely by voice without explicit human confirmation.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: AUTOMATED REGRESSION TEST SUITE (20/20) */}
          {activeTab === 'test_suite' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950 border border-emerald-500/40">
                      <Sparkles className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide">
                        Mandatory Telephony Regression Test Suite (20 Tests)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Validates Sections A through V: Inbound Hindi/English/Hinglish NLP, Clinic Q&A, Medical Refusal, 108/112 Protocol, Privacy, Level-4 Outbound Gate, and Adapters.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRunTests}
                    disabled={isRunningTests}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all shadow-lg ${
                      isRunningTests
                        ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-950/50'
                    }`}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRunningTests ? 'animate-spin' : ''}`} />
                    {isRunningTests ? 'Executing 20 Tests...' : 'Run All 20 Tests Now'}
                  </button>
                </div>

                {/* Test Summary Banner */}
                {testResults && (
                  <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-mono font-bold ${
                            testResults.failed === 0
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {testResults.failed === 0
                            ? `ALL ${testResults.passed}/${testResults.total} TESTS PASSED`
                            : `${testResults.failed} TESTS FAILED`}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          Duration: {testResults.durationMs}ms
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Executed at: {new Date(testResults.completedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Test Results Grid */}
                {testResults ? (
                  <div className="mt-4 space-y-2">
                    {testResults.results.map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-xl border p-3.5 transition-all ${
                          r.passed
                            ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            : 'bg-rose-950/30 border-rose-800/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                r.passed ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-rose-950 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {r.passed ? '✓' : '✗'}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">
                                  #{r.id} {r.name}
                                </span>
                                <span className="rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300">
                                  {r.category}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {r.executionTimeMs}ms
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-400">{r.expectedBehavior}</p>
                              {r.actualOutput && (
                                <div className="mt-1.5 rounded-lg bg-slate-900 border border-slate-800/80 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                                  {r.actualOutput}
                                </div>
                              )}
                              {r.error && (
                                <div className="mt-1.5 rounded-lg bg-rose-950/60 border border-rose-800 px-2.5 py-1 text-[11px] font-mono text-rose-300">
                                  Error: {r.error}
                                </div>
                              )}
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
                              r.passed ? 'bg-emerald-950/80 text-emerald-300' : 'bg-rose-950/80 text-rose-300'
                            }`}
                          >
                            {r.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-xl border border-dashed border-slate-800 p-8 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400">Click &quot;Run All 20 Tests Now&quot; to execute the automated verification suite directly in the browser.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
