/**
 * HERMES JARVIS — Speech Synthesis & TTS Voice Engine
 * Dedicated pipeline for robust browser/device voice discovery,
 * Hindi/Hinglish/Multilingual TTS locale resolution, Android Mobile Web Speech API reliability,
 * and zero-compromise diagnostic transparency.
 */

export interface VoiceResolutionResult {
  targetLocale: string;
  isHindiTarget: boolean;
  selectedVoice: SpeechSynthesisVoice | null;
  availableHindiVoiceCount: number;
  isExactMatch: boolean;
  reason: string;
}

export interface SpeechDiagnostics {
  activeLanguage: string;
  requestedTtsLocale: string;
  selectedVoiceName: string;
  selectedVoiceLang: string;
  availableHindiVoiceCount: number;
  speechSynthesisAvailable: boolean;
  ttsErrorState: string | null;
  statusMessage: string;
  timestamp: string;
}

/**
 * Normalizes language codes to valid standard BCP-47 tags
 */
export function normalizeLanguageCode(code?: string): string {
  if (!code || code === 'auto') return 'en-US';
  if (code === 'hinglish') return 'hi-IN';
  if (code.toLowerCase() === 'hi' || code.toLowerCase() === 'hi-in' || code.toLowerCase() === 'hi_in') return 'hi-IN';
  if (code.toLowerCase() === 'en' || code.toLowerCase() === 'en-us') return 'en-US';
  if (code.toLowerCase() === 'en-in') return 'en-IN';
  if (code.toLowerCase() === 'en-gb') return 'en-GB';
  return code;
}

/**
 * Determines whether a text string contains Devanagari script
 */
export function containsDevanagari(text: string): boolean {
  if (!text) return false;
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Checks whether a given SpeechSynthesisVoice supports Hindi
 */
export function isHindiVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return false;
  const langLower = (voice.lang || '').toLowerCase().replace(/_/g, '-');
  const nameLower = (voice.name || '').toLowerCase();
  const uriLower = (voice.voiceURI || '').toLowerCase();

  // Voice must not be English (e.g. en-IN is Indian English, not Hindi TTS)
  if (langLower.startsWith('en')) {
    return false;
  }

  // 1. Language tag check
  if (langLower === 'hi-in' || langLower === 'hi' || langLower.startsWith('hi-')) {
    return true;
  }

  // 2. Name / URI keywords for Hindi voices
  if (nameLower.includes('hindi') || voice.name.includes('हिन्दी') || uriLower.includes('hindi')) {
    return true;
  }

  return false;
}

/**
 * Audited TTS Locale Resolver
 * Maps input text, active language, and optional explicit switch to the correct BCP-47 TTS locale.
 */
export function determineTtsLocale(
  text: string,
  currentLanguage: string,
  forcedLanguage?: string
): { targetLocale: string; isHindiTarget: boolean; reason: string } {
  // 1. Explicit forced language switch (e.g. from conversational switch command)
  if (forcedLanguage) {
    const norm = forcedLanguage.toLowerCase();
    if (norm === 'hi-in' || norm === 'hinglish' || norm === 'hi' || norm.startsWith('hi')) {
      return {
        targetLocale: 'hi-IN',
        isHindiTarget: true,
        reason: `Explicit voice command switched language to ${forcedLanguage}`,
      };
    }
    return {
      targetLocale: normalizeLanguageCode(forcedLanguage),
      isHindiTarget: false,
      reason: `Explicit voice command switched language to ${forcedLanguage}`,
    };
  }

  // 2. Devanagari script in the response text MUST use Hindi TTS (hi-IN)
  // An English TTS voice cannot pronounce Devanagari script.
  if (containsDevanagari(text)) {
    return {
      targetLocale: 'hi-IN',
      isHindiTarget: true,
      reason: 'Output response contains authentic Hindi Devanagari text',
    };
  }

  // 3. Active language mode is Hindi
  if (currentLanguage === 'hi-IN' || currentLanguage.toLowerCase().startsWith('hi')) {
    return {
      targetLocale: 'hi-IN',
      isHindiTarget: true,
      reason: 'System active language configuration is Hindi (hi-IN)',
    };
  }

  // 4. Active language mode is Hinglish
  if (currentLanguage === 'hinglish') {
    return {
      targetLocale: 'hi-IN',
      isHindiTarget: true,
      reason: 'System active language configuration is Hinglish (requires hi-IN TTS)',
    };
  }

  // 5. Active language mode is Auto-Detect
  if (currentLanguage === 'auto') {
    // If text has Hindi keywords even if in Latin script
    const lower = text.toLowerCase();
    const hinglishMarkers = ['kya', 'hai', 'batao', 'karo', 'namaste', 'shukriya', 'ruko', 'chup', 'aaj', 'samajh'];
    const hits = hinglishMarkers.filter((m) => lower.includes(m)).length;
    if (hits >= 2) {
      return {
        targetLocale: 'hi-IN',
        isHindiTarget: true,
        reason: 'Auto-detected Hinglish conversational tokens in text',
      };
    }
    return {
      targetLocale: 'en-US',
      isHindiTarget: false,
      reason: 'Auto-detect defaulted to English for non-Hindi response',
    };
  }

  // 6. Standard configured locale
  return {
    targetLocale: normalizeLanguageCode(currentLanguage),
    isHindiTarget: false,
    reason: `Configured system locale (${currentLanguage})`,
  };
}

/**
 * Robust Voice Selector
 * Finds the optimal native voice matching the target locale with Android & Mobile browser hardening.
 */
export function findBestVoiceForLocale(
  availableVoices: SpeechSynthesisVoice[],
  targetLocale: string,
  preferredVoiceURI?: string
): VoiceResolutionResult {
  const normTarget = targetLocale.toLowerCase().replace(/_/g, '-');
  const isHindi = normTarget.startsWith('hi');

  // Count available Hindi voices on the platform
  const hindiVoices = availableVoices.filter(isHindiVoice);
  const availableHindiVoiceCount = hindiVoices.length;

  // CASE A: Hindi TTS Output
  if (isHindi) {
    if (hindiVoices.length > 0) {
      // 1. Check if user's preferred voiceURI points to one of the genuine Hindi voices
      if (preferredVoiceURI) {
        const preferredMatch = hindiVoices.find((v) => v.voiceURI === preferredVoiceURI);
        if (preferredMatch) {
          return {
            targetLocale: 'hi-IN',
            isHindiTarget: true,
            selectedVoice: preferredMatch,
            availableHindiVoiceCount,
            isExactMatch: true,
            reason: `Preferred Hindi voice configured by user (${preferredMatch.name})`,
          };
        }
      }

      // 2. Sort Hindi candidates by quality:
      // Prefer exact 'hi-IN' tag, then known Android/Google/Microsoft high-quality voices
      const sorted = [...hindiVoices].sort((a, b) => {
        const aLang = (a.lang || '').toLowerCase().replace(/_/g, '-');
        const bLang = (b.lang || '').toLowerCase().replace(/_/g, '-');
        const aExact = aLang === 'hi-in' ? 2 : 1;
        const bExact = bLang === 'hi-in' ? 2 : 1;
        if (aExact !== bExact) return bExact - aExact;

        const aGoogle = a.name.includes('Google') || a.name.includes('हिन्दी') ? 2 : 1;
        const bGoogle = b.name.includes('Google') || b.name.includes('हिन्दी') ? 2 : 1;
        return bGoogle - aGoogle;
      });

      const best = sorted[0];
      return {
        targetLocale: 'hi-IN',
        isHindiTarget: true,
        selectedVoice: best,
        availableHindiVoiceCount,
        isExactMatch: (best.lang || '').toLowerCase().replace(/_/g, '-') === 'hi-in',
        reason: `Selected native Hindi voice (${best.name} [${best.lang}])`,
      };
    }

    // CRITICAL REQUIREMENT:
    // If no Hindi TTS voice exists on the device/browser:
    // DO NOT falsely claim Hindi voice is active and NEVER intentionally assign an English voice!
    // Returning null allows the browser/OS speech subsystem to attempt locale-based synthesis
    // without forcing English phoneme engines onto Devanagari text.
    return {
      targetLocale: 'hi-IN',
      isHindiTarget: true,
      selectedVoice: null,
      availableHindiVoiceCount: 0,
      isExactMatch: false,
      reason: 'Hindi TTS voice unavailable on this device/browser.',
    };
  }

  // CASE B: Non-Hindi Locale
  // 1. If preferred voice matches the target language family, use it
  if (preferredVoiceURI) {
    const prefVoice = availableVoices.find((v) => v.voiceURI === preferredVoiceURI);
    if (prefVoice) {
      const prefLang = (prefVoice.lang || '').toLowerCase().replace(/_/g, '-');
      if (prefLang === normTarget || prefLang.split('-')[0] === normTarget.split('-')[0]) {
        return {
          targetLocale,
          isHindiTarget: false,
          selectedVoice: prefVoice,
          availableHindiVoiceCount,
          isExactMatch: prefLang === normTarget,
          reason: `User preferred voice selected (${prefVoice.name})`,
        };
      }
    }
  }

  // 2. Exact match on targetLocale
  const exact = availableVoices.find((v) => (v.lang || '').toLowerCase().replace(/_/g, '-') === normTarget);
  if (exact) {
    return {
      targetLocale,
      isHindiTarget: false,
      selectedVoice: exact,
      availableHindiVoiceCount,
      isExactMatch: true,
      reason: `Exact language match found (${exact.name})`,
    };
  }

  // 3. Prefix match (e.g. 'en-US' matching any 'en' voice)
  const prefix = normTarget.split('-')[0];
  const prefixMatch = availableVoices.find((v) => (v.lang || '').toLowerCase().startsWith(prefix));
  if (prefixMatch) {
    return {
      targetLocale,
      isHindiTarget: false,
      selectedVoice: prefixMatch,
      availableHindiVoiceCount,
      isExactMatch: false,
      reason: `Language family match found (${prefixMatch.name})`,
    };
  }

  // 4. Default voice or first available
  const defaultVoice = availableVoices.find((v) => v.default) || availableVoices[0] || null;
  return {
    targetLocale,
    isHindiTarget: false,
    selectedVoice: defaultVoice,
    availableHindiVoiceCount,
    isExactMatch: false,
    reason: defaultVoice ? `Fallback to system default voice (${defaultVoice.name})` : 'No voices available in browser',
  };
}

/**
 * Creates safe, non-sensitive diagnostic snapshot for telemetry & HUD
 */
export function buildSpeechDiagnostics(
  activeLanguage: string,
  resolution: VoiceResolutionResult,
  ttsErrorState: string | null = null,
  speechSynthesisAvailableOverride?: boolean
): SpeechDiagnostics {
  const isSynthesisSupported =
    speechSynthesisAvailableOverride !== undefined
      ? speechSynthesisAvailableOverride
      : typeof window !== 'undefined' && 'speechSynthesis' in window;

  let statusMessage: string;
  if (ttsErrorState) {
    statusMessage = `Speech error: ${ttsErrorState}`;
  } else if (resolution.isHindiTarget) {
    if (resolution.selectedVoice) {
      statusMessage = `Hindi TTS Active: ${resolution.selectedVoice.name} (${resolution.selectedVoice.lang})`;
    } else {
      statusMessage = 'Hindi TTS voice unavailable on this device/browser.';
    }
  } else if (!isSynthesisSupported) {
    statusMessage = 'SpeechSynthesis API not supported on this browser platform.';
  } else {
    statusMessage = resolution.selectedVoice
      ? `TTS Active: ${resolution.selectedVoice.name} (${resolution.selectedVoice.lang})`
      : 'Default System Voice';
  }

  return {
    activeLanguage,
    requestedTtsLocale: resolution.targetLocale,
    selectedVoiceName: resolution.selectedVoice ? resolution.selectedVoice.name : 'None / Platform Default',
    selectedVoiceLang: resolution.selectedVoice ? resolution.selectedVoice.lang : 'N/A',
    availableHindiVoiceCount: resolution.availableHindiVoiceCount,
    speechSynthesisAvailable: isSynthesisSupported,
    ttsErrorState,
    statusMessage,
    timestamp: new Date().toISOString(),
  };
}
