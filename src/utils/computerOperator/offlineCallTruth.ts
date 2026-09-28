// ==============================================================================
// HERMES JARVIS — OFFLINE CALL TRUTH
//
// The offline (no-backend) fallback engine narrated telephony work the browser
// tab never performed. `make_call` spoke "Placing outbound call to <number>
// through carrier gateway", `hangup_call` spoke "Terminating active phone call"
// and titled the action "Call Ended", and `answer_call` spoke "Connecting call
// with caller" and titled it "Call Connected" — none of which the page can do.
// All three set `actionExecuted = true` and incremented the user-visible
// "Autonomous Actions Executed" counter, and the `human_handoff` branch told
// the caller "Attempting to transfer your call to our human clinic staff" even
// on a headless host with no telephony provider at all.
//
// The server voice-command path already derives these verdicts from the engine
// mode and the live session (telephonyDispatchTruth.ts). The offline path has
// no gateway session to consult, so it can never confirm a carrier action: the
// only honest verdicts are "not executed" with the observed reason. This module
// states that plainly and never reports external telephony work as executed.
// ==============================================================================

import { TelephonyEngineMode } from '../telephonyGatewayTruth';

export type OfflineCallPhase = 'dial' | 'schedule' | 'answer' | 'hangup' | 'reject';

export interface OfflineCallVerdict {
  /** Always false: the offline tab holds no carrier gateway session. */
  actionExecuted: boolean;
  title: string;
  replyEn: string;
  replyHi: string;
  replyHinglish: string;
}

type Lang = 'en' | 'hi' | 'hinglish';

type ReasonClass = 'simulation' | 'noCarrier' | 'liveGateway';

const PHASE_TITLE: Record<OfflineCallPhase, Record<ReasonClass, string>> = {
  dial: {
    simulation: 'Outbound Call Not Placed (simulation only)',
    noCarrier: 'Outbound Call Not Placed (no carrier)',
    liveGateway: 'Outbound Call Authorization Requested (offline; not placed)',
  },
  schedule: {
    simulation: 'Scheduled Call Recorded (simulation only; not placed)',
    noCarrier: 'Scheduled Call Recorded (no carrier; not placed)',
    liveGateway: 'Scheduled Call Recorded (offline; not placed)',
  },
  answer: {
    simulation: 'Call Not Answered (simulation only)',
    noCarrier: 'Call Not Answered (no carrier)',
    liveGateway: 'Answer Dispatched (offline; unconfirmed)',
  },
  hangup: {
    simulation: 'Call Not Ended (simulation only)',
    noCarrier: 'Call Not Ended (no carrier)',
    liveGateway: 'Hangup Dispatched (offline; unconfirmed)',
  },
  reject: {
    simulation: 'Call Not Declined (simulation only)',
    noCarrier: 'Call Not Declined (no carrier)',
    liveGateway: 'Reject Dispatched (offline; unconfirmed)',
  },
};

const PHASE_LINE: Record<OfflineCallPhase, Record<Lang, string>> = {
  dial: {
    en: 'The outbound call request was recorded, not dialed.',
    hi: 'आउटबाउंड कॉल अनुरोध दर्ज हुआ, डायल नहीं किया गया।',
    hinglish: 'Outbound call request record hui, dial nahi hui.',
  },
  schedule: {
    en: 'The scheduled call request was recorded, not placed.',
    hi: 'शेड्यूल कॉल अनुरोध दर्ज हुआ, कॉल नहीं की गई।',
    hinglish: 'Scheduled call request record hui, call nahi ki gayi.',
  },
  answer: {
    en: 'No incoming call was answered.',
    hi: 'कोई इनकमिंग कॉल उठाई नहीं गई।',
    hinglish: 'Koi incoming call answer nahi hui.',
  },
  hangup: {
    en: 'No active call was ended.',
    hi: 'कोई सक्रिय कॉल समाप्त नहीं की गई।',
    hinglish: 'Koi active call end nahi hui.',
  },
  reject: {
    en: 'No incoming call was declined.',
    hi: 'कोई इनकमिंग कॉल अस्वीकार नहीं की गई।',
    hinglish: 'Koi incoming call decline nahi hui.',
  },
};

const REASON_LINE: Record<ReasonClass, Record<Lang, string>> = {
  simulation: {
    en: 'Only the simulation provider is active — no carrier (PSTN) call was placed or answered.',
    hi: 'अभी केवल सिमुलेशन प्रोवाइडर सक्रिय है — कोई असली कैरियर कॉल नहीं हुई।',
    hinglish: 'Abhi sirf simulation provider active hai, Sir — koi asli carrier call nahi hui.',
  },
  noCarrier: {
    en: 'No telephony carrier is configured, so no call was placed or answered.',
    hi: 'कोई टेलीफोनी कैरियर कॉन्फ़िगर नहीं है, इसलिए कोई कॉल नहीं हुई।',
    hinglish: 'Koi telephony carrier configured nahi hai, Sir — koi call nahi hui.',
  },
  liveGateway: {
    en: 'Offline mode cannot reach the carrier gateway from this tab, so the call was not placed.',
    hi: 'ऑफ़लाइन मोड इस टैब से कैरियर गेटवे तक नहीं पहुँच सकता, इसलिए कॉल नहीं हुई।',
    hinglish: 'Offline mode is tab se carrier gateway tak nahi pahunch sakta, Sir — call nahi hui.',
  },
};

function reasonClass(engineMode: TelephonyEngineMode): ReasonClass {
  if (engineMode === 'SIMULATION_ONLY') return 'simulation';
  if (engineMode === 'LIVE_GATEWAY') return 'liveGateway';
  // NOT_CONFIGURED and UNSUPPORTED_ENGINE both mean no usable carrier.
  return 'noCarrier';
}

export function offlineCallVerdict(
  phase: OfflineCallPhase,
  engineMode: TelephonyEngineMode,
): OfflineCallVerdict {
  const reason = reasonClass(engineMode);
  const reply = (lang: Lang) => `${PHASE_LINE[phase][lang]} ${REASON_LINE[reason][lang]}`;
  return {
    // The offline tab never holds a gateway session, so it never confirms.
    actionExecuted: false,
    title: PHASE_TITLE[phase][reason],
    replyEn: reply('en'),
    replyHi: reply('hi'),
    replyHinglish: reply('hinglish'),
  };
}

/** Reply in the caller's language; unknown languages fall back to English. */
export function offlineCallReply(
  phase: OfflineCallPhase,
  engineMode: TelephonyEngineMode,
  lang: 'hindi' | 'hinglish' | 'english',
): string {
  const verdict = offlineCallVerdict(phase, engineMode);
  if (lang === 'hindi') return verdict.replyHi;
  if (lang === 'hinglish') return verdict.replyHinglish;
  return verdict.replyEn;
}

// ---------------------------------------------------------------------------
// Outbound-call cancellation truth
//
// The offline cancel branch ("रहने दो", "cancel call", "don't call") cleared any
// staged outbound call and always reported `actionExecuted: true` with the
// reply "Outbound call has been cancelled." and title "Outbound Call Cancelled",
// incrementing the user-visible "Autonomous Actions Executed" counter. But the
// branch fires whenever the phrase appears — there need not be anything staged.
// With no staged call, nothing was cancelled: a carrier call can only be
// "cancelled" if one was first requested, and a merely staged request is never
// placed ("The outbound call request was recorded, not dialed."). Cancelling
// nothing is not executed work. Only a request that this process actually
// staged and then dropped may be spoken as cancelled — and even that is a local
// queue action, not carrier work performed.
// ---------------------------------------------------------------------------

export interface OfflineOutboundCancelVerdict {
  actionExecuted: boolean;
  title: string;
  replyEn: string;
  replyHi: string;
  replyHinglish: string;
}

export function offlineOutboundCancelVerdict(stagedByThisCommand: boolean): OfflineOutboundCancelVerdict {
  if (stagedByThisCommand) {
    return {
      actionExecuted: true,
      title: 'Outbound Call Cancelled (device was never dialed)',
      replyEn: 'Cancelled the outbound call request that was staged — it had not been dialed.',
      replyHi: 'स्टेज किया गया आउटबाउंड कॉल अनुरोध रद्द कर दिया गया — वह डायल नहीं हुआ था।',
      replyHinglish: 'Staged outbound call request cancel kar diya, Sir — wo dial nahi hui thi.',
    };
  }
  return {
    actionExecuted: false,
    title: 'Nothing Cancelled (no staged call)',
    replyEn: 'There was no staged outbound call to cancel, so nothing was cancelled.',
    replyHi: 'रद्द करने के लिए कोई स्टेज किया गया आउटबाउंड कॉल नहीं था, इसलिए कुछ रद्द नहीं हुआ।',
    replyHinglish: 'Cancel karne ke liye koi staged outbound call nahi thi, Sir — kuch cancel nahi hua.',
  };
}

// ---------------------------------------------------------------------------
// Android-bridge reject truth
//
// The Android-bridge reject branches in localJarvisEngine run *before* section
// 7.1 and clear the locally mirrored pending call, then reported
// `actionExecuted: true` and titled the action "Call Declined" / "Call Declined
// via Android Bridge". The real bridge exposes no decline/end-call command
// (AndroidBridgeManager's call actions are limited to answer), so clearing the
// local mirror does not stop the device from ringing — the user was told a
// success the device never performed.
//
// We can only confirm a real decline when a *connected* device advertises an
// actual decline capability. Clearing local UI state is not that. Until such a
// capability is wired, the honest result is a local-only dismiss that never
// counts as executed work.
// ---------------------------------------------------------------------------

export interface OfflineAndroidRejectVerdict {
  /** Always false: clearing the local mirror is not a device-confirmed decline. */
  actionExecuted: boolean;
  /** True when only the local UI mirror was cleared. */
  localMirrorCleared: boolean;
  title: string;
  replyEn: string;
  replyHi: string;
  replyHinglish: string;
}

export function offlineAndroidRejectVerdict(connected: boolean): OfflineAndroidRejectVerdict {
  const detail = connected
    ? {
        en: 'the connected Android device exposes no call-decline capability, so it was not told to decline',
        hi: 'कनेक्टेड Android डिवाइस कॉल अस्वीकार करने की सुविधा नहीं देता, इसलिए उसे अस्वीकार करने को नहीं कहा गया',
        hinglish: 'connected Android device call decline capability nahi deta, isliye usse decline karne ko nahi kaha gaya',
      }
    : {
        en: 'no Android device is connected, so the physical phone was not told to decline',
        hi: 'कोई Android डिवाइस कनेक्टेड नहीं है, इसलिए असली फोन को अस्वीकार करने को नहीं कहा गया',
        hinglish: 'koi Android device connected nahi hai, isliye asli phone ko decline nahi bataya gaya',
      };

  return {
    actionExecuted: false,
    localMirrorCleared: true,
    title: 'Incoming Call Dismissed Locally (device not told to decline)',
    replyEn: `Dismissed this call in the app only — ${detail.en}.`,
    replyHi: `यह कॉल केवल ऐप में हटाई गई — ${detail.hi}।`,
    replyHinglish: `Call sirf app mein dismiss hui, Sir — ${detail.hinglish}.`,
  };
}

/**
 * Honest reply for the `human_handoff` intent. Transferring the caller to
 * clinic staff is telephony work; a provider being *configured* does not prove
 * a transfer happened, and offline mode cannot transfer at all.
 */
export function offlineHumanHandoffReply(
  providerConfigured: boolean,
  lang: 'hindi' | 'hinglish' | 'english',
): string {
  const lines: Record<Lang, string> = providerConfigured
    ? {
        en: 'A telephony provider is configured, but offline mode cannot transfer this call to clinic staff — no transfer occurred.',
        hi: 'एक टेलीफोनी प्रोवाइडर कॉन्फ़िगर है, लेकिन ऑफ़लाइन मोड इस कॉल को क्लिनिक स्टाफ को ट्रांसफर नहीं कर सकता — कोई ट्रांसफर नहीं हुआ।',
        hinglish:
          'Telephony provider configured hai, par offline mode is call ko clinic staff ko transfer nahi kar sakta, Sir — transfer nahi hua.',
      }
    : {
        en: 'Our human staff is not reachable on this line, and no message was recorded. Would you like to leave a message?',
        hi: 'इस लाइन पर क्लिनिक स्टाफ उपलब्ध नहीं है, और कोई संदेश दर्ज नहीं हुआ। क्या आप संदेश छोड़ना चाहेंगे?',
        hinglish:
          'Is line par clinic staff available nahi hai, Sir, aur koi message record nahi hua. Message chhodna chahenge?',
      };
  if (lang === 'hindi') return lines.hi;
  if (lang === 'hinglish') return lines.hinglish;
  return lines.en;
}
