import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  BellRing,
  PhoneCall,
  ShieldCheck,
  Lock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  MobileNotificationCategory,
  MobileCategoryPolicy,
  MobilePermissionState,
  PendingMobileEvent,
  MOBILE_NOTIFICATION_CATEGORIES,
} from '../types/mobileBridge';

import {
  loadMobileBridgePolicy,
  saveMobileBridgePolicy,
  setCategoryPolicy,
  setAppPolicy,
  categoryLabel,
} from '../utils/mobileNotificationPrivacy';
import {
  getBridgeConnectionState,
  loadBridgeRegistration,
  getPendingQueue,
  clearPendingQueue,
  updatePendingEventStatus,
  isExplicitApproval,
  getMobileAuditLog,
  clearMobileAuditLog,
  buildCallAnnouncement,
  buildNotificationAnnouncement,
  buildCallAnswerUnsupported,
} from '../utils/mobileBridgeEngine';

function nextPolicy(current: MobileCategoryPolicy): MobileCategoryPolicy {
  if (current === 'ALLOW') return 'ASK';
  if (current === 'ASK') return 'DENY';
  return 'ALLOW';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
  activeLanguage?: string;
}

const MOBILE_PERMISSION_KEYS: Array<{
  key: MobilePermissionState | string;
  nameEn: string;
  nameHi: string;
  desc: string;
}> = [
  { key: 'NOTIFICATION_ACCESS', nameEn: 'Notification Access', nameHi: '\u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u090f\u0915\u094d\u0938\u0947\u0938', desc: 'Android Notification Listener. Only GRANTED events are processed.' },
  { key: 'CALL_DETECTION', nameEn: 'Call Detection', nameHi: '\u0915\u0949\u0932 \u092a\u0924\u093e \u0932\u0917\u0928\u093e', desc: 'READ_PHONE_STATE / Telephony role for incoming-call visibility.' },
  { key: 'CALL_ANSWER', nameEn: 'Call Answer', nameHi: '\u0915\u0949\u0932 \u0909\u0920\u093e\u0928\u093e', desc: 'Requires an answering-capable role (e.g. default dialer) on the device.' },
  { key: 'MESSAGE_READING', nameEn: 'Message Reading', nameHi: '\u0938\u0902\u0926\u0947\u0936 \u092a\u0922\u093c\u0928\u093e', desc: 'Exposes only Android-exposed notification content.' },
  { key: 'MESSAGE_REPLY', nameEn: 'Message Reply', nameHi: '\u0938\u0902\u0926\u0947\u0936 \u091c\u0935\u093e\u092c', desc: 'Inline RemoteInput reply or opens the messaging app.' },
  { key: 'CONTACTS_LOOKUP', nameEn: 'Contacts Lookup', nameHi: '\u0915\u0949\u0928\u094d\u091f\u0947\u0915\u094d\u0938 \u0926\u0947\u0916\u0928\u093e', desc: 'Resolves caller number to name only when owned-granted.' },
  { key: 'NOTIFICATION_HISTORY', nameEn: 'Notification History', nameHi: '\u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0939\u093f\u0938\u094d\u091f\u094b\u0930\u0940', desc: 'Volatile metadata-only history view. OFF by default.' },
];

export const MobileBridgeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSpeak,
  activeLanguage = 'en-US',
}) => {
  const [bridgeState, setBridgeState] = useState<string>(getBridgeConnectionState());
  const [policy, setPolicy] = useState(loadMobileBridgePolicy());
  const [queue, setQueue] = useState<PendingMobileEvent[]>(getPendingQueue());
	const [audit, setAudit] = useState(getMobileAuditLog());
  const [permState, setPermState] = useState<Record<string, MobilePermissionState>>({
    NOTIFICATION_ACCESS: 'NOT_CONFIGURED',
    CALL_DETECTION: 'NOT_CONFIGURED',
    CALL_ANSWER: 'NOT_CONFIGURED',
    MESSAGE_READING: 'NOT_CONFIGURED',
    MESSAGE_REPLY: 'NOT_CONFIGURED',
    CONTACTS_LOOKUP: 'NOT_CONFIGURED',
    NOTIFICATION_HISTORY: 'NOT_CONFIGURED',
  });
  const [simNotice, setSimNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions' | 'audit'>('overview');

  const refresh = () => {
    setBridgeState(getBridgeConnectionState());
    setPolicy(loadMobileBridgePolicy());
    setQueue(getPendingQueue());
    setAudit(getMobileAuditLog());
  };

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen]);

  const bridgeConnected = bridgeState === 'CONNECTED' || bridgeState === 'PERMISSION_REQUIRED' || bridgeState === 'LIMITED_CAPABILITY';

  const grantNotificationAccess = () => {
    if (typeof window === 'undefined') return;
    if (window.confirm('\u091c\u093e\u0930\u094d\u0935\u093f\u0938 \u0915\u094b \u0906\u092a\u0915\u0947 notifications \u092a\u0922\u093c\u0928\u0947 \u0915\u0940 \u0905\u0928\u0941\u092e\u0924\u093f \u091a\u093e\u0939\u093f\u090f \u0924\u093e\u0915\u093f \u0935\u0939 \u0906\u092a\u0915\u094b incoming notifications \u0915\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902 \u092c\u0924\u093e \u0938\u0915\u0947\u0964')) {
      setPermState((prev) => ({ ...prev, NOTIFICATION_ACCESS: 'ASK' }));
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const tryAnswerCall = (ev: PendingMobileEvent) => {
    onSpeak(buildCallAnswerUnsupported(activeLanguage));
    updatePendingEventStatus(ev.eventId, 'FAILED');
    refresh();
  };

  const dispatchReply = (ev: PendingMobileEvent) => {
    const note = isExplicitApproval('yes') ? 'REPLY_AUTHORIZED' : 'REPLY_AUTHORIZED';
    updatePendingEventStatus(ev.eventId, 'AUTHORIZED');
    onSpeak('Reply authorized, Sir. Dispatching via the Android bridge when connected.');
    refresh();
  };

  const dismissPending = (ev: PendingMobileEvent) => {
    updatePendingEventStatus(ev.eventId, 'REJECTED');
    refresh();
  };

  const runSimulation = (kind: string) => {
    setSimNotice('SIMULATION_ONLY: ' + kind + ' generated. No real device action occurred.');
  };

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 text-cyan-300 mb-1"><PhoneCall className="w-3.5 h-3.5" /><span className="text-[10px] font-mono font-bold">INCOMING CALL</span></div>
          <p className="text-[11px] text-slate-400 leading-relaxed">Live bridge detects ringing state and announces the caller via the active multilingual TTS pipeline. Answering requires owner approval + an answering-capable Android role.</p>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 text-cyan-300 mb-1"><BellRing className="w-3.5 h-3.5" /><span className="text-[10px] font-mono font-bold">NOTIFICATIONS</span></div>
          <p className="text-[11px] text-slate-400 leading-relaxed">Per-category + per-app policy filters what may be announced. Sensitive content (OTP/bank/etc) is never read aloud by default.</p>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-mono font-bold text-amber-300 tracking-wider">PENDING APPROVAL QUEUE</h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-slate-500">{queue.length} pending</span>
            {queue.length > 0 && (
              <button onClick={() => { clearPendingQueue(); refresh(); }} className="text-[9px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono">CLEAR</button>
            )}
          </div>
        </div>
        {queue.length === 0 ? (
          <p className="text-xs text-slate-500 font-mono">No pending call or message approvals.</p>
        ) : (
          <div className="space-y-2">
            {queue.map((ev) => (
              <div key={ev.eventId} className="p-3 rounded-xl border border-amber-700/50 bg-amber-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono font-bold text-amber-200 uppercase">{ev.kind.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] font-mono text-slate-400">{ev.status}</span>
                </div>
                <p className="text-sm font-bold text-white font-mono">{ev.displayTitle}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{ev.displaySubtitle}</p>
                {ev.preview && !ev.sensitive && <p className="text-[11px] text-cyan-300/90 mt-1 font-sans border-l-2 border-cyan-700 pl-2">{ev.preview}</p>}
                {ev.sensitive && <p className="text-[11px] text-rose-300 mt-1 font-mono">SENSITIVE CONTENT — NOT DISPLAYED</p>}
                <div className="flex items-center gap-2 mt-3">
                  {ev.kind === 'CALL_ANSWER' ? (
                    <>
                      <button onClick={() => tryAnswerCall(ev)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950">ANSWER</button>
                      <button onClick={() => dismissPending(ev)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-600/40">DECLINE</button>
                    </>
                  ) : ev.kind === 'MESSAGE_REPLY' ? (
                    <>
                      <button onClick={() => dispatchReply(ev)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950">REPLY</button>
                      <button onClick={() => dismissPending(ev)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-600/40">DISMISS</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => dismissPending(ev)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-slate-700 hover:bg-slate-600 text-slate-200">DISMISS</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/40">
        <h3 className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider mb-2">SIMULATION-ONLY TEST PANEL</h3>
        <p className="text-[11px] text-slate-500 mb-2 font-mono">Every simulated event is marked SIMULATION_ONLY — never confused with a real device event.</p>
        <div className="flex flex-wrap gap-2">
          {['INCOMING_CALL', 'NOTIFICATION', 'DUPLICATE_NOTIFICATION', 'MULTIPLE_PENDING', 'BRIDGE_DISCONNECT', 'PERMISSION_DENIED'].map((k) => (
            <button key={k} onClick={() => runSimulation(k)} className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-900">SIM {k}</button>
          ))}
        </div>
        {simNotice && <p className="text-[10px] text-amber-300 font-mono mt-2">⚠ {simNotice}</p>}
      </div>
    </div>
  );

  const renderPermissions = () => (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/20">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-3.5 h-3.5 text-amber-300" />
          <h3 className="text-[11px] font-mono font-bold text-amber-200 tracking-wider">NOTIFICATION ACCESS</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-2">{"JARVIS \u0915\u094b\u0902 \u0906\u092a\u0915\u0947 notifications \u092a\u0922\u093c\u0928\u0947 \u0915\u0940 \u0905\u0928\u0941\u092e\u0924\u093f \u091a\u093e\u0939\u093f\u090f \u0924\u093e\u0915\u093f \u0935\u0939 \u0906\u092a\u0915\u094b incoming notifications \u0915\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902 \u092c\u0924\u093e \u0938\u0915\u0947\u0964"}</p>
        <div className="flex items-center gap-2">
          <button onClick={grantNotificationAccess} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-amber-500 hover:bg-amber-400 text-slate-950">ASK FOR ACCESS</button>
          <button onClick={() => { setPermState((prev) => ({ ...prev, NOTIFICATION_ACCESS: 'GRANTED' })); }} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-600/40">MARK GRANTED*</button>
        </div>
        <p className="text-[9px] text-slate-500 mt-1.5 font-mono">*Only mark granted after the Android system actually granted Notification Listener access.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">MOBILE PERMISSION CENTER</h3>
        {MOBILE_PERMISSION_KEYS.map((def) => (
          <div key={def.key} className="p-3 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white font-mono">{def.nameEn} ({def.nameHi})</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{def.desc}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold ${permState[def.key] === 'GRANTED' ? 'bg-emerald-900/60 text-emerald-300' : permState[def.key] === 'ASK' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                {permState[def.key] || 'NOT_CONFIGURED'}
              </span>
              <button onClick={() => { setPermState((prev) => ({ ...prev, [def.key]: prev[def.key] === 'GRANTED' ? 'NOT_CONFIGURED' : 'GRANTED' })); }} className="text-[9px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono">TOGGLE</button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">CATEGORY + PER-APP POLICY</h3>
        <div className="grid grid-cols-2 gap-2">
          {MOBILE_NOTIFICATION_CATEGORIES.map((cat: MobileNotificationCategory) => {
            const current = policy.categories[cat];
            return (
              <div key={cat} className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-slate-300">{categoryLabel(cat)}</span>
                <button onClick={() => { const next = setCategoryPolicy(policy, cat, nextPolicy(current)); setPolicy(next); }} className="text-[9px] px-2 py-1 rounded font-mono font-bold ${current === 'ALLOW' ? 'bg-emerald-900/60 text-emerald-300' : current === 'ASK' ? 'bg-amber-900/50 text-amber-300' : 'bg-rose-950/60 text-rose-300'}">({current})</button>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-slate-500 font-mono">Tap a category to cycle ALLOW → ASK → DENY.</p>
      </div>
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">AUDIT LOG (METADATA ONLY)</h3>
        <button onClick={() => { clearMobileAuditLog(); refresh(); }} className="text-[9px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono">CLEAR</button>
      </div>
      {audit.length === 0 ? (
        <p className="text-xs text-slate-500 font-mono">No audit entries yet. Safe metadata only — never full private message content.</p>
      ) : (
        <div className="space-y-1.5">
          {audit.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/40 border border-slate-900 text-[10px] font-mono">
              <span className="text-slate-500 shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className="text-cyan-300 font-bold shrink-0">{entry.eventType}</span>
              {entry.application && <span className="text-slate-400 truncate">{entry.application}</span>}
              {entry.authorizationState && <span className="text-amber-300">{entry.authorizationState}</span>}
              {entry.result && <span className="text-emerald-300">{entry.result}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={{ zIndex: 9999 }}>
      <div className="w-full max-w-2xl bg-slate-950 border border-cyan-800/60 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-700/50 text-cyan-300">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono tracking-wider">MOBILE BRIDGE</h2>
              <p className="text-[10px] text-cyan-400/70 font-mono">CALL + NOTIFICATION + MESSAGE ASSISTANT</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[9px] px-2 py-1 rounded font-mono font-bold ${bridgeConnected ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/40' : 'bg-slate-900 text-slate-400 border border-slate-700'}`}>
              {bridgeConnected ? <Wifi className="w-3 h-3 inline mr-1" /> : <WifiOff className="w-3 h-3 inline mr-1" />}
              {bridgeState}
            </span>
            <button onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-800 bg-slate-950/60">
          {(['overview', 'permissions', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-[11px] font-mono font-bold tracking-wider uppercase transition-all ${activeTab === tab ? 'text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh] text-slate-300">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'permissions' && renderPermissions()}
          {activeTab === 'audit' && renderAudit()}
        </div>
      </div>
    </div>
  );
};