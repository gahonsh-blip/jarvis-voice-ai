// ==============================================================================
// HERMES JARVIS — OFFLINE EMERGENCY-STOP TRUTH
//
// The offline (no-backend) fallback engine told the operator "Emergency Stop is
// now active. All autonomous modifications, drafts, and external publishing are
// frozen." and "Emergency Stop deactivated. All subsystems resumed...", set
// `actionExecuted: true` and incremented the user-visible "Autonomous Actions
// Executed" counter — while touching no emergency state at all.
//
// The live kill switch lives on the server (`toggleEmergencyStop` in
// server_tools, read by `isEmergencyStopActive()`). The browser tab has no
// client-side emergency store to flip, so a voice "emergency stop" issued while
// the backend was unreachable was spoken and counted as an engaged safety
// freeze that never happened.
//
// A false success in the unsafe direction is the worst kind: the operator
// believes autonomy is frozen when it is not. This module states the truth
// plainly — the stop was NOT engaged from this path, nothing here can engage
// it, and the request must be re-sent once the server is reachable.
// ==============================================================================

type Lang = 'en' | 'hi' | 'hinglish';

export interface OfflineEmergencyVerdict {
  /** Always false: the offline tab cannot engage or release the live kill switch. */
  actionExecuted: boolean;
  title: string;
  replyEn: string;
  replyHi: string;
  replyHinglish: string;
}

const NOT_ENGAGED: Record<Lang, string> = {
  en: 'Emergency Stop was NOT engaged. This offline path has no connection to the server kill switch, so autonomous actions are NOT frozen. Re-send the emergency stop once the backend is reachable.',
  hi: 'इमरजेंसी स्टॉप सक्रिय नहीं हुआ। ऑफ़लाइन मोड सर्वर के किल स्विच से जुड़ा नहीं है, इसलिए स्वायत्त क्रियाएं रुकी नहीं हैं। बैकएंड उपलब्ध होने पर इमरजेंसी स्टॉप दोबारा भेजें।',
  hinglish: 'Emergency Stop engage nahi hua. Offline mode server ke kill switch se juda nahi hai, isliye autonomous actions freeze nahi hui hain. Backend reachable hone par emergency stop dobara bhejein.',
};

const NOT_RELEASED: Record<Lang, string> = {
  en: 'Emergency Stop was NOT released. This offline path cannot reach the server kill switch, so it changed no emergency state. Re-send the resume once the backend is reachable.',
  hi: 'इमरजेंसी स्टॉप हटाया नहीं गया। ऑफ़लाइन मोड सर्वर के किल स्विच तक नहीं पहुँच सकता, इसलिए कुछ नहीं बदला। बैकएंड उपलब्ध होने पर रिज़्यूम दोबारा भेजें।',
  hinglish: 'Emergency Stop release nahi hua. Offline mode server ke kill switch tak nahi pahunch sakta, isliye kuch nahi badla. Backend reachable hone par resume dobara bhejein.',
};

export function offlineEmergencyVerdict(
  action: 'stop' | 'resume',
  lang: Lang
): OfflineEmergencyVerdict {
  if (action === 'stop') {
    return {
      actionExecuted: false,
      title: 'Emergency Stop NOT Engaged (offline path cannot reach the kill switch)',
      replyEn: NOT_ENGAGED.en,
      replyHi: NOT_ENGAGED.hi,
      replyHinglish: NOT_ENGAGED.hinglish,
    };
  }
  return {
    actionExecuted: false,
    title: 'Emergency Stop NOT Released (offline path cannot reach the kill switch)',
    replyEn: NOT_RELEASED.en,
    replyHi: NOT_RELEASED.hi,
    replyHinglish: NOT_RELEASED.hinglish,
  };
}

/** Pick the reply for the active language from a verdict. */
export function offlineEmergencyReply(verdict: OfflineEmergencyVerdict, lang: Lang): string {
  return lang === 'hi' ? verdict.replyHi : lang === 'hinglish' ? verdict.replyHinglish : verdict.replyEn;
}
