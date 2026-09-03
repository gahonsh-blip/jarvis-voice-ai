import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Sparkles,
  Shield,
  ShieldAlert,
  Bot,
  User,
  Hash,
  CheckCircle2,
  Radio,
  FileText,
  AlertTriangle,
  Music,
} from 'lucide-react';
import {
  CallRecord,
  CallTurn,
  TelephonySettings,
  ContactItem,
  DEFAULT_CONTACTS,
  isNumberInContacts,
  getDisplayCallerName,
} from '../types/telephony';
import { telephonyAudio } from '../utils/telephonyAudio';

interface ActiveCallHUDProps {
  activeCall: CallRecord | null;
  settings: TelephonySettings;
  contacts?: ContactItem[];
  isMuted: boolean;
  isOnHold: boolean;
  audioFilterActive: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleAudioFilter: () => void;
  onEndCall: () => void;
  onAnswerCall: (mode?: 'ai_autonomous' | 'ai_copilot' | 'direct_user') => void;
  onDeclineCall: () => void;
  onSendDtmf: (key: string) => void;
  onCloseSummary: () => void;
}

export const ActiveCallHUD: React.FC<ActiveCallHUDProps> = ({
  activeCall,
  settings,
  contacts,
  isMuted,
  isOnHold,
  audioFilterActive,
  onToggleMute,
  onToggleHold,
  onToggleAudioFilter,
  onEndCall,
  onAnswerCall,
  onDeclineCall,
  onSendDtmf,
  onCloseSummary,
}) => {
  const [duration, setDuration] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Call duration counter
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'in_call' || isOnHold) return;
    const interval = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.status, isOnHold]);

  // Reset duration when call changes
  useEffect(() => {
    if (activeCall?.status === 'dialing' || activeCall?.status === 'ringing') {
      setDuration(0);
    }
  }, [activeCall?.id, activeCall?.status]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeCall?.transcript?.length]);

  if (!activeCall) return null;

  const isRingingInbound = activeCall.direction === 'inbound' && activeCall.status === 'ringing';
  const isDialingOutbound = activeCall.direction === 'outbound' && (activeCall.status === 'dialing' || activeCall.status === 'ringing');
  const isConnected = activeCall.status === 'in_call' || activeCall.status === 'on_hold';
  const isEnded = activeCall.status === 'ended' || activeCall.status === 'declined';

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const dtmfKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  // 1. INCOMING CALL RINGING SCREEN
  const effectiveContacts = contacts && contacts.length > 0 ? contacts : DEFAULT_CONTACTS;
  const isMaskActive = settings.maskUnknownCallerId !== false;
  const isCallerInContacts = isNumberInContacts(activeCall.callerNumber, effectiveContacts);
  const isUnknownInbound = activeCall.direction === 'inbound' && !isCallerInContacts;
  const effectiveInboundCallerName = activeCall.direction === 'inbound'
    ? getDisplayCallerName(activeCall.callerName, activeCall.callerNumber, effectiveContacts, isMaskActive)
    : activeCall.callerName;

  if (isRingingInbound) {
    const isSpam = (activeCall.spamScore || 0) >= (settings.spamThresholdScore || 70);

    return (
      <div id="incoming-call-hud" className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-emerald-500/40 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950/80 border border-emerald-500/50 shadow-lg shadow-emerald-900/30">
              <Phone className="h-7 w-7 text-emerald-400 animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Incoming Call</span>
                {isSpam && (
                  <span className="flex items-center gap-1 rounded bg-rose-950/80 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                    <ShieldAlert className="h-3 w-3" /> Spam Risk ({activeCall.spamScore}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <h3 className="text-lg font-bold text-white leading-tight">{effectiveInboundCallerName}</h3>
                {isMaskActive && isUnknownInbound && (
                  <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 border border-cyan-800 flex items-center gap-1">
                    <Shield className="h-2.5 w-2.5 text-cyan-400" /> MASKED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">{activeCall.callerNumber}</p>
            </div>
          </div>
        </div>

        {activeCall.transcript && activeCall.transcript.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-900/80 border border-slate-800 p-2.5 text-xs text-slate-300 italic">
            "{activeCall.transcript[0].text}"
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            id="hud-let-ai-answer"
            onClick={() => onAnswerCall('ai_autonomous')}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-900/40 hover:from-cyan-500 hover:to-blue-500 active:scale-95 transition-all"
          >
            <Bot className="h-4 w-4" />
            Let JARVIS AI Answer Autonomously
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="hud-answer-user"
              onClick={() => onAnswerCall('direct_user')}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 active:scale-95 transition-all"
            >
              <Phone className="h-3.5 w-3.5" />
              Answer (Voice)
            </button>
            <button
              id="hud-decline-call"
              onClick={onDeclineCall}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600/90 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500 active:scale-95 transition-all"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. OUTBOUND DIALING SCREEN
  if (isDialingOutbound) {
    return (
      <div id="outbound-call-hud" className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-cyan-500/40 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-950/80 border border-cyan-500/50 shadow-lg shadow-cyan-900/30">
              <Radio className="h-7 w-7 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
                {activeCall.status === 'dialing' ? 'Dialing Route...' : 'Ringing Callee...'}
              </span>
              <h3 className="text-lg font-bold text-white leading-tight mt-0.5">{activeCall.recipientName}</h3>
              <p className="text-xs text-slate-400 font-mono">{activeCall.recipientNumber}</p>
            </div>
          </div>
          <button
            onClick={onEndCall}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-500 active:scale-95 transition-all shadow-lg shadow-rose-900/30"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        {activeCall.objective && (
          <div className="mt-3 rounded-lg bg-cyan-950/40 border border-cyan-800/40 p-2.5 text-xs text-cyan-200">
            <span className="font-semibold text-cyan-400">Objective:</span> {activeCall.objective}
          </div>
        )}
      </div>
    );
  }

  // 3. POST-CALL SUMMARY SCREEN
  if (isEnded) {
    return (
      <div id="call-summary-hud" className="fixed bottom-6 right-6 z-50 w-[420px] rounded-2xl border border-slate-700 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Call Terminated • Executive Summary</h3>
              <p className="text-xs text-slate-400 font-mono">
                Duration: {formatTime(activeCall.durationSeconds || duration)} •{' '}
                {activeCall.direction === 'outbound' ? activeCall.recipientName : effectiveInboundCallerName}
              </p>
            </div>
          </div>
          <button
            onClick={onCloseSummary}
            className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
          >
            Dismiss
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3">
            <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider mb-1">AI Briefing Summary</div>
            <p className="text-xs text-slate-200 leading-relaxed">{activeCall.summary || 'Call concluded normally.'}</p>
          </div>

          {activeCall.followUpActions && activeCall.followUpActions.length > 0 && (
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/40 p-3">
              <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider mb-1.5">Action Items & Next Steps</div>
              <ul className="space-y-1">
                {activeCall.followUpActions.map((act, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {act}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. LIVE IN-CALL HUD
  const counterpart = activeCall.direction === 'outbound' ? activeCall.recipientName : effectiveInboundCallerName;
  const counterpartNumber = activeCall.direction === 'outbound' ? activeCall.recipientNumber : activeCall.callerNumber;

  return (
    <div id="live-call-hud" className="fixed bottom-6 right-6 z-50 w-[440px] rounded-2xl border border-cyan-500/50 bg-slate-950/95 shadow-2xl backdrop-blur-2xl overflow-hidden animate-in slide-in-from-bottom-5">
      {/* HUD Header */}
      <div className="flex items-center justify-between border-b border-cyan-900/40 bg-slate-900/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl border ${isOnHeldColor(isOnHold)}`}>
            <Phone className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnHold ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-ping'}`} />
              <span className={`relative inline-flex h-3 w-3 rounded-full ${isOnHold ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-400">{formatTime(duration)}</span>
              <span className="text-[10px] rounded bg-cyan-950 px-1.5 py-0.5 font-mono text-cyan-300 border border-cyan-800">
                {activeCall.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND'}
              </span>
              {isOnHold && (
                <span className="flex items-center gap-1 rounded bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-800">
                  <Music className="h-3 w-3" /> ON HOLD
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <h4 className="text-sm font-bold text-white truncate max-w-[200px]">{counterpart}</h4>
              {isMaskActive && isUnknownInbound && (
                <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950 border border-cyan-800/60 px-1 py-0.2 rounded">
                  MASKED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Audio Waveform Bars Simulation */}
        <div className="flex items-center gap-1 h-5 px-2 py-1 rounded-md bg-slate-950 border border-slate-800">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full bg-cyan-400 transition-all duration-150 ${
                isOnHold ? 'h-1 opacity-40' : 'animate-pulse'
              }`}
              style={{
                height: isOnHold ? '4px' : `${Math.floor(Math.random() * 16 + 4)}px`,
                animationDelay: `${i * 120}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Live Transcript Stream */}
      {showTranscript && (
        <div className="max-h-60 min-h-[160px] overflow-y-auto p-3 space-y-2.5 bg-slate-950/90 text-xs">
          {activeCall.transcript.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-slate-500">
              <Bot className="h-6 w-6 mb-1 text-cyan-500/50 animate-pulse" />
              <span>Voice audio channel connected...</span>
            </div>
          ) : (
            activeCall.transcript.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col ${
                  t.speaker === 'agent'
                    ? 'items-start'
                    : t.speaker === 'system' || t.speaker === 'whisper'
                    ? 'items-center'
                    : 'items-end'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5 text-[10px] font-mono text-slate-400">
                  {t.speaker === 'agent' ? (
                    <>
                      <Bot className="h-3 w-3 text-cyan-400" />
                      <span className="text-cyan-400 font-bold">JARVIS AI</span>
                    </>
                  ) : t.speaker === 'whisper' ? (
                    <>
                      <Sparkles className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400 font-bold">AI Whisper Tip</span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-400 font-bold">{counterpart}</span>
                      <User className="h-3 w-3 text-emerald-400" />
                    </>
                  )}
                  <span>{t.timestamp}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    t.speaker === 'agent'
                      ? 'bg-cyan-950/70 border border-cyan-800/60 text-cyan-100 rounded-tl-none'
                      : t.speaker === 'whisper'
                      ? 'bg-amber-950/60 border border-amber-700/50 text-amber-200 text-center italic'
                      : 'bg-slate-800 border border-slate-700 text-white rounded-tr-none'
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* DTMF Keypad Popover */}
      {showKeypad && (
        <div className="grid grid-cols-3 gap-2 bg-slate-900 border-t border-slate-800 p-3">
          {dtmfKeys.map((key) => (
            <button
              key={key}
              onClick={() => {
                telephonyAudio.playDtmf(key);
                onSendDtmf(key);
              }}
              className="flex flex-col items-center justify-center rounded-xl bg-slate-800 py-2 hover:bg-cyan-950 hover:border-cyan-500 border border-slate-700 active:scale-95 transition-all text-white font-bold"
            >
              <span className="text-base">{key}</span>
            </button>
          ))}
        </div>
      )}

      {/* Active Call Controls Bar */}
      <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-900/95 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Mute Button */}
          <button
            id="hud-mute-btn"
            onClick={onToggleMute}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isMuted
                ? 'bg-rose-950 border-rose-500 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Hold Button */}
          <button
            id="hud-hold-btn"
            onClick={onToggleHold}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isOnHold
                ? 'bg-amber-950 border-amber-500 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            title={isOnHold ? 'Resume Call' : 'Place on Hold with Music'}
          >
            {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>

          {/* DTMF Keypad Button */}
          <button
            id="hud-keypad-btn"
            onClick={() => setShowKeypad((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              showKeypad
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Toggle DTMF Dialpad"
          >
            <Hash className="h-4 w-4" />
          </button>

          {/* Acoustic Cellular Filter Toggle */}
          <button
            id="hud-filter-btn"
            onClick={onToggleAudioFilter}
            className={`flex items-center gap-1 h-10 px-2.5 rounded-xl border text-xs font-mono transition-all active:scale-95 ${
              audioFilterActive
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title="Toggle Telephone Acoustic Bandpass Filter (300-3400Hz)"
          >
            <Radio className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{audioFilterActive ? '3G Filter' : 'HD Voice'}</span>
          </button>
        </div>

        {/* End Call Button */}
        <button
          id="hud-end-call-btn"
          onClick={onEndCall}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 active:scale-95 shadow-lg shadow-rose-900/30 transition-all"
        >
          <PhoneOff className="h-4 w-4" />
          <span>Hang Up</span>
        </button>
      </div>
    </div>
  );
};

function isOnHeldColor(isOnHold: boolean): string {
  return isOnHold
    ? 'bg-amber-950/80 border-amber-500/50 shadow-amber-900/30'
    : 'bg-emerald-950/80 border-emerald-500/50 shadow-emerald-900/30';
}
