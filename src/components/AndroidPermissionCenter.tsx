import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Phone,
  MessageSquare,
  Users,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Volume2,
  Lock,
  EyeOff,
  Radio,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  AndroidPermissionState,
  MobilePermissionMatrix,
  NotificationCategory,
  AndroidBridgeStatus,
} from '../types/mobileBridge';
import {
  androidBridgeEngine,
  DEFAULT_PERMISSIONS_MATRIX,
  DEFAULT_CATEGORY_PERMISSIONS,
  DEFAULT_APP_RULES,
} from '../utils/androidBridgeEngine';
import { simulatedAndroidAdapter } from '../utils/androidBridgeAdapter';

interface AndroidPermissionCenterProps {
  onSpeak?: (text: string) => void;
  onNotificationTriggered?: () => void;
}

interface PermissionItemDef {
  key: keyof MobilePermissionMatrix;
  nameEn: string;
  nameHi: string;
  descriptionEn: string;
  descriptionHi: string;
  requiredRole?: string;
  icon: any;
}

const PERMISSION_DEFINITIONS: PermissionItemDef[] = [
  {
    key: 'notification_access',
    nameEn: 'Notification Access',
    nameHi: 'अधिसूचना पहुंच',
    descriptionEn: 'Enables NotificationListenerService to receive incoming message and app alerts.',
    descriptionHi: 'JARVIS को आपके notifications पढ़ने की अनुमति चाहिए ताकि वह आपको incoming notifications के बारे में बता सके।',
    icon: MessageSquare,
  },
  {
    key: 'call_detection',
    nameEn: 'Call Detection',
    nameHi: 'इनकमिंग कॉल पहचान',
    descriptionEn: 'Monitors incoming telephony state via TelephonyManager / PhoneStateListener.',
    descriptionHi: 'कॉल आने पर JARVIS कॉलर की जानकारी सुनकर आपको बता सके।',
    icon: Phone,
  },
  {
    key: 'call_answer',
    nameEn: 'Call Answer Gate',
    nameHi: 'कॉल उठाने की अनुमति',
    descriptionEn: 'Answers active phone calls only when you explicitly say "हाँ" or "उठा लो".',
    descriptionHi: 'आपकी स्पष्ट अनुमति के बाद TelecomManager के माध्यम से कॉल उठा सके (Default Phone App / Telecom Role required)।',
    requiredRole: 'ROLE_DIALER / TelecomManager.acceptRingingCall',
    icon: Radio,
  },
  {
    key: 'message_reading',
    nameEn: 'Message Reading',
    nameHi: 'संदेश पठन',
    descriptionEn: 'Reads aloud non-sensitive incoming text messages from authorized applications.',
    descriptionHi: 'व्हाट्सएप, टेलीग्राम एवं एसएमएस के संदेश सुरक्षित रूप से पढ़कर सुनाने की अनुमति।',
    icon: Volume2,
  },
  {
    key: 'message_reply',
    nameEn: 'Message Reply Gate',
    nameHi: 'संदेश उत्तर प्रेषण',
    descriptionEn: 'Sends inline replies via RemoteInput or opens messaging app after your approval ("जवाब दो").',
    descriptionHi: 'आपके अनुमोदन के बाद इनलाइन रिप्लाई या ऐप खोलकर उत्तर भेजने की अनुमति।',
    icon: ShieldCheck,
  },
  {
    key: 'contacts_lookup',
    nameEn: 'Contacts Lookup',
    nameHi: 'संपर्क सूची मिलान',
    descriptionEn: 'Resolves phone numbers against your contact address book so JARVIS speaks real names.',
    descriptionHi: 'अज्ञात नंबरों को आपकी एड्रेस बुक से मिलाकर कॉलर का असली नाम बताने की अनुमति।',
    icon: Users,
  },
  {
    key: 'notification_history',
    nameEn: 'Notification History & Audit',
    nameHi: 'अधिसूचना इतिहास व ऑडिट',
    descriptionEn: 'Maintains local privacy-redacted history of notifications and security audit events.',
    descriptionHi: 'हालिया सूचनाओं का संक्षिप्त सारांश और सुरक्षा ऑडिट लॉग रखने की अनुमति।',
    icon: History,
  },
];

export const AndroidPermissionCenter: React.FC<AndroidPermissionCenterProps> = ({
  onSpeak,
  onNotificationTriggered,
}) => {
  const [permissions, setPermissions] = useState<MobilePermissionMatrix>(androidBridgeEngine.getPermissions());
  const [bridgeStatus, setBridgeStatus] = useState<AndroidBridgeStatus>(androidBridgeEngine.getStatus());
  const [categories, setCategories] = useState(androidBridgeEngine.getSettings().categoryPermissions);
  const [appRules, setAppRules] = useState(androidBridgeEngine.getSettings().privacyRules);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setPermissions(androidBridgeEngine.getPermissions());
    setBridgeStatus(androidBridgeEngine.getStatus());
  }, []);

  const handleTogglePermState = (key: keyof MobilePermissionMatrix) => {
    const states: AndroidPermissionState[] = ['NOT_CONFIGURED', 'DENIED', 'ASK', 'GRANTED', 'LIMITED'];
    const current = permissions[key];
    const nextIdx = (states.indexOf(current) + 1) % states.length;
    const nextState = states[nextIdx];

    androidBridgeEngine.updatePermission(key, nextState);
    setPermissions(androidBridgeEngine.getPermissions());
    setBridgeStatus(androidBridgeEngine.getStatus());

    setStatusMessage(`Updated ${key} to ${nextState}`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleGrantAll = () => {
    const granted: MobilePermissionMatrix = {
      notification_access: 'GRANTED',
      call_detection: 'GRANTED',
      call_answer: 'GRANTED',
      message_reading: 'GRANTED',
      message_reply: 'GRANTED',
      contacts_lookup: 'GRANTED',
      notification_history: 'GRANTED',
    };
    for (const [k, v] of Object.entries(granted)) {
      androidBridgeEngine.updatePermission(k as keyof MobilePermissionMatrix, v);
    }
    setPermissions(androidBridgeEngine.getPermissions());
    simulatedAndroidAdapter.connect();
    setBridgeStatus(androidBridgeEngine.getStatus());
    setStatusMessage('All Android permissions set to GRANTED & Testbed paired');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleToggleCategory = (cat: NotificationCategory) => {
    const next = { ...categories, [cat]: !categories[cat] };
    setCategories(next);
    androidBridgeEngine.updateSettings({ categoryPermissions: next });
  };

  const handleToggleAppRule = (pkg: string) => {
    const rule = appRules[pkg];
    if (!rule) return;
    const next = {
      ...appRules,
      [pkg]: { ...rule, allowed: !rule.allowed },
    };
    setAppRules(next);
    androidBridgeEngine.updateSettings({ privacyRules: next });
  };

  // Test Simulation Actions
  const handleTestCall = (callerName: string, number: string) => {
    simulatedAndroidAdapter.connect();
    const result = simulatedAndroidAdapter.simulateIncomingCall(callerName, number);
    if (result.announced && result.spokenText && onSpeak) {
      onSpeak(result.spokenText);
    }
    if (onNotificationTriggered) onNotificationTriggered();
    setStatusMessage(`Simulated incoming call from ${callerName}`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleTestNotification = (appName: string, pkg: string, title: string, text: string) => {
    simulatedAndroidAdapter.connect();
    const result = simulatedAndroidAdapter.simulateIncomingNotification({
      appName,
      packageName: pkg,
      title,
      text,
      sender: title,
    });
    if (result.announced && result.spokenText && onSpeak) {
      onSpeak(result.spokenText);
    }
    if (onNotificationTriggered) onNotificationTriggered();
    setStatusMessage(`Simulated notification from ${appName}`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const getBadgeClass = (state: AndroidPermissionState) => {
    switch (state) {
      case 'GRANTED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'DENIED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'LIMITED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'ASK':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'NOT_CONFIGURED':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Bridge Status */}
      <div className="rounded-xl border border-cyan-500/30 bg-slate-950/80 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Android Mobile Bridge &amp; Privacy Permission Center
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Privacy-first local processing: Incoming calls &amp; notifications are filtered locally on the device before reaching JARVIS.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-mono font-bold border uppercase ${
                bridgeStatus === 'CONNECTED'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                  : bridgeStatus === 'LIMITED_CAPABILITY'
                  ? 'bg-amber-950 text-amber-300 border-amber-500'
                  : bridgeStatus === 'PERMISSION_REQUIRED'
                  ? 'bg-purple-950 text-purple-300 border-purple-500'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              Status: {bridgeStatus}
            </span>
            <button
              onClick={handleGrantAll}
              className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
            >
              Grant All &amp; Pair
            </button>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg bg-cyan-950/80 border border-cyan-500/50 p-2.5 text-xs text-cyan-200 font-mono flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 1. SEVEN ANDROID PERMISSIONS LIST */}
      <div>
        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Core Android Capabilities &amp; Permission Gates (7 Subsystems)
        </h4>

        <div className="space-y-2.5">
          {PERMISSION_DEFINITIONS.map((def) => {
            const state = permissions[def.key];
            const Icon = def.icon;

            return (
              <div
                key={def.key}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-cyan-400 shrink-0 mt-0.5">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">{def.nameEn}</span>
                      <span className="text-[11px] text-cyan-400 font-hindi">({def.nameHi})</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{def.descriptionEn}</p>
                    <p className="text-xs text-slate-300/90 mt-0.5 font-hindi">{def.descriptionHi}</p>
                    {def.requiredRole && (
                      <span className="inline-block mt-1 text-[10px] font-mono text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-900">
                        Required: {def.requiredRole}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
                  <button
                    onClick={() => handleTogglePermState(def.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono font-bold border transition-all ${getBadgeClass(
                      state
                    )}`}
                  >
                    {state} ↻
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. CATEGORY PERMISSIONS */}
      <div>
        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Per-Category Notification Privacy Controls
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(Object.keys(categories) as NotificationCategory[]).map((cat) => {
            const isAllowed = categories[cat];
            return (
              <button
                key={cat}
                onClick={() => handleToggleCategory(cat)}
                className={`p-3 rounded-xl border text-left font-mono transition-all ${
                  isAllowed
                    ? 'bg-emerald-950/30 border-emerald-600/50 text-slate-100'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold">{cat}</span>
                  {isAllowed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-slate-600" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 block">
                  {isAllowed ? 'ALLOWED' : 'BLOCKED'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. PER-APPLICATION WHITELIST / BLACKLIST */}
      <div>
        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
          <EyeOff className="h-4 w-4" />
          Per-Application Rules (Allow Messaging / Block Banking by Default)
        </h4>

        <div className="space-y-2">
          {Object.values(appRules).map((rule) => {
            const isBlocked = !rule.allowed;
            return (
              <div
                key={rule.packageName}
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-slate-200">{rule.appName}</span>
                  <span className="text-[11px] text-slate-400 block font-sans">{rule.packageName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleAppRule(rule.packageName)}
                    className={`px-3 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                      rule.allowed
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {rule.allowed ? 'ALLOWED ✅' : 'BLOCKED ⛔'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. SANDBOX / SIMULATION TEST HARNESS */}
      <div className="rounded-xl border border-amber-500/30 bg-slate-950/70 p-4">
        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono mb-2 flex items-center gap-2">
          <Play className="h-4 w-4" />
          Live Assistant Verification &amp; Simulation Harness
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Trigger simulated events below to test voice announcements, HUD approval cards, and approval safety:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => handleTestCall('Rahul Verma', '+91 9876543210')}
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-left text-xs font-mono text-slate-200 flex items-center justify-between group transition-colors"
          >
            <span>📞 Call: "Rahul Verma"</span>
            <span className="text-[10px] text-cyan-400 group-hover:translate-x-0.5 transition-transform">Run →</span>
          </button>

          <button
            onClick={() => handleTestCall('', '+91 9988776655')}
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-left text-xs font-mono text-slate-200 flex items-center justify-between group transition-colors"
          >
            <span>📞 Call: Unknown Number</span>
            <span className="text-[10px] text-cyan-400 group-hover:translate-x-0.5 transition-transform">Run →</span>
          </button>

          <button
            onClick={() =>
              handleTestNotification(
                'WhatsApp',
                'com.whatsapp',
                'Rahul',
                'Can you please send the updated project quote?'
              )
            }
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-left text-xs font-mono text-slate-200 flex items-center justify-between group transition-colors"
          >
            <span>💬 WhatsApp: "Rahul"</span>
            <span className="text-[10px] text-emerald-400 group-hover:translate-x-0.5 transition-transform">Run →</span>
          </button>

          <button
            onClick={() =>
              handleTestNotification(
                'Messages',
                'com.google.android.apps.messaging',
                'Bank Alert',
                'Your OTP is 482910 for account debit of INR 5000'
              )
            }
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-left text-xs font-mono text-slate-200 flex items-center justify-between group transition-colors"
          >
            <span>🛡️ Sensitive OTP (Redaction Test)</span>
            <span className="text-[10px] text-amber-400 group-hover:translate-x-0.5 transition-transform">Run →</span>
          </button>
        </div>
      </div>
    </div>
  );
};
