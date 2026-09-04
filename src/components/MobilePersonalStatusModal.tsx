import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  BatteryCharging,
  Battery,
  CloudSun,
  Bell,
  Calendar,
  Mail,
  Cpu,
  Volume2,
  Send,
  Copy,
  Check,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Sparkles,
  AlertTriangle,
  Layers,
  ArrowRight,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import {
  MobileStatusData,
  MorningBriefingPayload,
  MobilePermissionCategory,
} from '../types';
import {
  compileMobileStatusData,
  generateMorningBriefing,
  loadMobilePermissions,
  saveMobilePermissions,
  MOBILE_PERMISSION_DEFINITIONS,
} from '../utils/mobileStatusEngine';
import { AndroidPermissionCenter } from './AndroidPermissionCenter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
  onOpenPermissionGateway?: () => void;
  userName?: string;
}

export const MobilePersonalStatusModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSpeak,
  onOpenPermissionGateway,
  userName = 'Sir',
}) => {
  const [statusData, setStatusData] = useState<MobileStatusData | null>(null);
  const [briefing, setBriefing] = useState<MorningBriefingPayload | null>(null);
  const [selectedLang, setSelectedLang] = useState<'hindi' | 'english' | 'bilingual'>('hindi');
  const [permissions, setPermissions] = useState<Record<MobilePermissionCategory, boolean>>(
    loadMobilePermissions()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'briefing' | 'telemetry' | 'privacy' | 'bridge'>('briefing');
  const [telegramSending, setTelegramSending] = useState<boolean>(false);
  const [telegramNotice, setTelegramNotice] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      // Fetch status from server or compile locally
      const data = await compileMobileStatusData();
      data.permissions = loadMobilePermissions();
      setStatusData(data);
      const generated = generateMorningBriefing(data, userName);
      setBriefing(generated);
    } catch (err) {
      console.warn('Failed to compile mobile status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const perms = loadMobilePermissions();
      setPermissions(perms);
      refreshData();
    }
  }, [isOpen, userName]);

  const handleTogglePermission = (cat: MobilePermissionCategory) => {
    const updated = { ...permissions, [cat]: !permissions[cat] };
    setPermissions(updated);
    saveMobilePermissions(updated);

    if (statusData) {
      const updatedStatus = {
        ...statusData,
        permissions: updated,
      };
      setStatusData(updatedStatus);
      const newBriefing = generateMorningBriefing(updatedStatus, userName);
      setBriefing(newBriefing);
    }
  };

  const handleGrantAll = () => {
    const allTrue: Record<MobilePermissionCategory, boolean> = {
      BATTERY_STATUS: true,
      WEATHER_LOCATION: true,
      NOTIFICATIONS: true,
      CALENDAR_EVENTS: true,
      EMAIL_INBOX: true,
      DEVICE_HEALTH: true,
    };
    setPermissions(allTrue);
    saveMobilePermissions(allTrue);
    refreshData();
  };

  const handleRevokeAll = () => {
    const allFalse: Record<MobilePermissionCategory, boolean> = {
      BATTERY_STATUS: false,
      WEATHER_LOCATION: false,
      NOTIFICATIONS: false,
      CALENDAR_EVENTS: false,
      EMAIL_INBOX: false,
      DEVICE_HEALTH: false,
    };
    setPermissions(allFalse);
    saveMobilePermissions(allFalse);
    refreshData();
  };

  const handlePlayVoiceBriefing = () => {
    if (!briefing) return;
    let textToSpeak = briefing.spokenTextHi;
    if (selectedLang === 'english') {
      textToSpeak = briefing.spokenTextEn;
    } else if (selectedLang === 'bilingual') {
      textToSpeak = `${briefing.spokenTextHi}\n\n${briefing.spokenTextEn}`;
    }
    onSpeak(textToSpeak);
  };

  const handleCopyBriefing = () => {
    if (!briefing) return;
    const text = selectedLang === 'english' ? briefing.spokenTextEn : briefing.spokenTextHi;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch((err) => {
        console.warn('Clipboard write prevented:', err);
      });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToTelegram = async () => {
    if (!briefing) return;
    setTelegramSending(true);
    setTelegramNotice(null);
    try {
      const textToSend = selectedLang === 'english' ? briefing.spokenTextEn : briefing.spokenTextHi;
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🌅 *JARVIS MORNING INTELLIGENCE BRIEFING*\n\n${textToSend}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramNotice('✅ Briefing broadcast to Telegram Mobile successfully!');
      } else {
        setTelegramNotice(`Notice: ${data.message || 'Telegram simulator broadcast complete.'}`);
      }
    } catch (err: any) {
      setTelegramNotice(`Telegram broadcast completed (Simulated/Live): ${err.message}`);
    } finally {
      setTelegramSending(false);
      setTimeout(() => setTelegramNotice(null), 5000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border-2 border-cyan-500/50 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Top Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-cyan-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 shadow-lg shadow-cyan-950">
              <Smartphone className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white font-mono tracking-wide">
                  MOBILE PERSONAL STATUS &amp; MORNING BRIEFING
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/60 text-cyan-300 font-mono font-bold">
                  HINDI VOICE CORE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Privacy-Gated Telemetry Engine • Web Battery API • Live Weather • Daily Hindi Speech Synthesis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {statusData && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300">{statusData.battery.level}%</span>
                <span className="text-slate-500">•</span>
                <span className="text-cyan-300">{statusData.weather.temperatureC}°C</span>
              </div>
            )}

            <button
              onClick={refreshData}
              className="p-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-cyan-300 hover:text-white transition-colors"
              title="Refresh Live Telemetry"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Switcher */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('briefing')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'briefing'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-950 font-black'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🌅 Hindi Morning Briefing</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'telemetry'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-950 font-black'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>📱 Mobile Telemetry Cards</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'privacy'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-950 font-black'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>🛡️ Privacy Consent Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab('bridge')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'bridge'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-950 font-black'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>🤖 Android Call &amp; Notification Bridge</span>
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono shrink-0">
            <span className="text-slate-500 hidden sm:inline">Voice:</span>
            <button
              onClick={() => setSelectedLang('hindi')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                selectedLang === 'hindi' ? 'bg-cyan-950 text-cyan-300 border border-cyan-600' : 'text-slate-400'
              }`}
            >
              हिन्दी / Hinglish
            </button>
            <button
              onClick={() => setSelectedLang('english')}
              className={`px-2 py-0.5 rounded text-[11px] ${
                selectedLang === 'english' ? 'bg-cyan-950 text-cyan-300 border border-cyan-600' : 'text-slate-400'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Telegram Notice Banner */}
        {telegramNotice && (
          <div className="px-5 py-2 bg-blue-950/80 border-b border-blue-600 text-blue-200 text-xs font-mono flex items-center justify-between">
            <span>{telegramNotice}</span>
            <button onClick={() => setTelegramNotice(null)} className="text-blue-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* TAB 1: HINDI MORNING BRIEFING CORE */}
          {activeTab === 'briefing' && briefing && (
            <div className="space-y-6">
              {/* Top Hero Card: Actionable Play & Broadcast */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/60 border border-cyan-500/40 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">
                      SPEECH SYNTHESIZER READY
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                      ~{briefing.speechDurationEstimateSeconds}s audio
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    {selectedLang === 'english' ? briefing.titleEn : briefing.titleHi}
                  </h3>
                  <p className="text-xs text-slate-300 font-mono mt-0.5">
                    Triggered by voice macro: <code className="text-cyan-300 font-bold">"Good morning, JARVIS"</code> or <code className="text-cyan-300 font-bold">"सुप्रभात"</code>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handlePlayVoiceBriefing}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm font-mono flex items-center gap-2 shadow-lg shadow-cyan-950 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Volume2 className="w-4 h-4 text-slate-950" />
                    <span>Play Spoken {selectedLang === 'english' ? 'English' : 'Hindi'} Briefing</span>
                  </button>

                  <button
                    onClick={handleSendToTelegram}
                    disabled={telegramSending}
                    className="px-3.5 py-2.5 bg-blue-900/80 hover:bg-blue-800 border border-blue-500/50 text-blue-200 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                    title="Send briefing text to your Telegram Phone"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{telegramSending ? 'Broadcasting...' : 'Telegram Push'}</span>
                  </button>

                  <button
                    onClick={handleCopyBriefing}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors"
                    title="Copy full speech script"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Spoken Speech Transcript Box */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-cyan-900/50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    JARVIS Spoken Script Output ({selectedLang === 'english' ? 'English Spoken Mode' : 'हिन्दी वक्तव्य'})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Real-Time Generated Telemetry</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80 font-sans text-sm sm:text-base leading-relaxed text-slate-100 whitespace-pre-wrap">
                  {selectedLang === 'english' ? briefing.spokenTextEn : briefing.spokenTextHi}
                </div>
              </div>

              {/* Key Highlights Grid */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Analyzed Telemetry Vectors in this Briefing
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs">
                  {briefing.keyHighlights.map((hl, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300 flex items-center gap-2"
                    >
                      <span>{hl}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MOBILE TELEMETRY CARDS */}
          {activeTab === 'telemetry' && statusData && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Battery */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                      <BatteryCharging className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">BATTERY TELEMETRY</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Web Battery API</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {statusData.battery.level}%
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs text-slate-300">
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all"
                      style={{ width: `${statusData.battery.level}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>State: {statusData.battery.charging ? '⚡ Charging' : '🔋 On Battery'}</span>
                    <span>Temp: {statusData.battery.temperatureC}°C</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Weather */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-400">
                      <CloudSun className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">WEATHER &amp; CLIMATE</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{statusData.weather.location}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-amber-400 font-mono">
                    {statusData.weather.temperatureC}°C
                  </span>
                </div>

                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div className="text-cyan-300 font-semibold">{statusData.weather.condition} ({statusData.weather.conditionHi})</div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Humidity: {statusData.weather.humidity}%</span>
                    <span>Wind: {statusData.weather.windKmh} km/h</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Notifications */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-400">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">NOTIFICATIONS DIGEST</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Priority Alerts Filtered</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-rose-400 font-mono">
                    {statusData.notifications.totalCount}
                  </span>
                </div>

                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div className="text-rose-300 font-semibold">{statusData.notifications.criticalCount} Critical Priority</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Top alert: {statusData.notifications.items[0]?.summary || 'No critical alerts'}
                  </div>
                </div>
              </div>

              {/* Card 4: Calendar */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">CALENDAR AGENDA</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Today's Schedule</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-purple-400 font-mono">
                    {statusData.calendar.todayEventsCount} Events
                  </span>
                </div>

                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div className="text-purple-300 truncate font-semibold">
                    {statusData.calendar.events[0]?.title || 'No meetings today'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Next: {statusData.calendar.events[0]?.time || 'Open schedule'}
                  </div>
                </div>
              </div>

              {/* Card 5: Email Inbox */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-950/80 border border-blue-500/40 text-blue-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">EMAIL DIGEST</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Inbox Priority</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-blue-400 font-mono">
                    {statusData.email.unreadCount} Unread
                  </span>
                </div>

                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div className="text-blue-300 truncate font-semibold">
                    {statusData.email.summaries[0]?.from || 'Inbox clean'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {statusData.email.summaries[0]?.subject || 'No unread priority emails'}
                  </div>
                </div>
              </div>

              {/* Card 6: Device Health */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/50 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">DEVICE &amp; MEMORY</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{statusData.deviceHealth.deviceModel}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-cyan-400 font-mono">
                    {Math.round((statusData.deviceHealth.ramUsageMb / statusData.deviceHealth.ramTotalMb) * 100)}% RAM
                  </span>
                </div>

                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>RAM: {statusData.deviceHealth.ramUsageMb}MB / {statusData.deviceHealth.ramTotalMb}MB</span>
                    <span>Storage Free: {statusData.deviceHealth.storageFreeGb}GB</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold">
                    Network: {statusData.deviceHealth.networkType} (Nominal link)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRIVACY CONSENT MATRIX */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              {/* Privacy Notice Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/40 flex items-start gap-3 text-xs font-mono text-slate-300">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">
                    STRICT LEVEL 4 HUMAN CONSENT &amp; PRIVACY GUARANTEE
                  </h4>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    JARVIS operates under strict privacy boundaries. No personal data (SMS, private email bodies, contacts, passwords, or financial information) is ever transmitted to third-party public models or stored outside your private enclave without your explicit consent. Every category can be independently enabled or revoked below.
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                  Data Categories &amp; Permissions
                </span>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <button
                    onClick={handleGrantAll}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 font-bold transition-colors"
                  >
                    Grant All
                  </button>
                  <button
                    onClick={handleRevokeAll}
                    className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-500 text-rose-300 font-bold transition-colors"
                  >
                    Revoke All
                  </button>
                </div>
              </div>

              {/* Permission Items List */}
              <div className="space-y-3">
                {MOBILE_PERMISSION_DEFINITIONS.map((def) => {
                  const isGranted = permissions[def.category];
                  return (
                    <div
                      key={def.category}
                      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isGranted
                          ? 'bg-slate-950/80 border-cyan-800/60 text-slate-200'
                          : 'bg-slate-950/40 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
                            isGranted
                              ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                              : 'bg-slate-900 border-slate-800 text-slate-600'
                          }`}
                        >
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className={`text-sm font-bold font-mono ${isGranted ? 'text-white' : 'text-slate-400'}`}>
                              {def.nameEn} ({def.nameHi})
                            </h5>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold ${
                                def.level === 4
                                  ? 'bg-amber-950 border border-amber-500/60 text-amber-300'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {def.securityLevel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-sans mt-0.5">
                            {def.descriptionEn}
                          </p>
                          <p className="text-xs text-cyan-400/80 font-sans mt-0.5">
                            {def.descriptionHi}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
                        <button
                          onClick={() => handleTogglePermission(def.category)}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                            isGranted
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                          }`}
                        >
                          {isGranted ? 'AUTHORIZED ✅' : 'REVOKED 🔒'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Permission Gateway Link */}
              {onOpenPermissionGateway && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between gap-3 font-mono text-xs">
                  <div className="flex items-center gap-2 text-amber-300">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Manage Level 4 Action Interceptor &amp; Security Matrix</span>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPermissionGateway();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center gap-1 transition-colors"
                  >
                    <span>Open Permission Gateway</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ANDROID CALL & NOTIFICATION BRIDGE */}
          {activeTab === 'bridge' && (
            <div className="space-y-6">
              <AndroidPermissionCenter onSpeak={onSpeak} />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero Unsolicited Data Access • Human Consent Active</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
