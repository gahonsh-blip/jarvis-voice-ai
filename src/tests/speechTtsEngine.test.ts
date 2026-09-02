import { describe, it, expect } from 'vitest';
import {
  determineTtsLocale,
  findBestVoiceForLocale,
  buildSpeechDiagnostics,
  isHindiVoice,
  containsDevanagari,
  normalizeLanguageCode,
} from '../utils/speechTtsEngine';
import { isSpeechInterruptionCommand } from '../utils/languages';

// Mock SpeechSynthesisVoice factory helper
function createMockVoice(name: string, lang: string, uri?: string, isDefault = false): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: uri || `${name}-${lang}`,
    default: isDefault,
    localService: true,
  } as SpeechSynthesisVoice;
}

describe('HERMES JARVIS — Speech Synthesis & Hindi TTS Engine Audit', () => {
  const mockHindiGoogle = createMockVoice('Google हिन्दी', 'hi-IN', 'google-hi-in');
  const mockHindiMicrosoft = createMockVoice('Microsoft Kalpana - Hindi (India)', 'hi-IN', 'ms-kalpana-hi');
  const mockIndianEnglish = createMockVoice('Google Indian English', 'en-IN', 'google-en-in');
  const mockUSEnglish = createMockVoice('Google US English', 'en-US', 'google-en-us', true);
  const mockUKEnglish = createMockVoice('Microsoft George - English (United Kingdom)', 'en-GB', 'ms-george-en-gb');
  const mockFrench = createMockVoice('Google Français', 'fr-FR', 'google-fr-fr');

  const allVoices = [
    mockUSEnglish,
    mockUKEnglish,
    mockIndianEnglish,
    mockHindiGoogle,
    mockHindiMicrosoft,
    mockFrench,
  ];

  describe('1. Hindi Voice Identification & Rejection of Stale English', () => {
    it('should correctly identify authentic Hindi voices', () => {
      expect(isHindiVoice(mockHindiGoogle)).toBe(true);
      expect(isHindiVoice(mockHindiMicrosoft)).toBe(true);
      expect(isHindiVoice(createMockVoice('hi-in-x-hie-local', 'hi-IN'))).toBe(true);
      expect(isHindiVoice(createMockVoice('Hindi Voice', 'hi_IN'))).toBe(true);
    });

    it('should NEVER falsely categorize Indian English (en-IN) as a Hindi voice', () => {
      // CRITICAL: Indian English speaks English with an accent, it cannot pronounce Devanagari
      expect(isHindiVoice(mockIndianEnglish)).toBe(false);
      expect(isHindiVoice(createMockVoice('Microsoft Ravi - English (India)', 'en-IN'))).toBe(false);
    });

    it('should reject standard English and foreign voices', () => {
      expect(isHindiVoice(mockUSEnglish)).toBe(false);
      expect(isHindiVoice(mockUKEnglish)).toBe(false);
      expect(isHindiVoice(mockFrench)).toBe(false);
    });
  });

  describe('2. Devanagari Detection & Text Analysis', () => {
    it('should detect Devanagari script in text accurately', () => {
      expect(containsDevanagari('नमस्ते जार्विस')).toBe(true);
      expect(containsDevanagari('सभी प्रणालियां सुचारू रूप से कार्यरत हैं।')).toBe(true);
      expect(containsDevanagari('YouTube API Level-4 Authorization द्वारा सुरक्षित है।')).toBe(true);
    });

    it('should return false for pure Latin script text', () => {
      expect(containsDevanagari('Hello Jarvis, how are you?')).toBe(false);
      expect(containsDevanagari('YouTube API is functioning normally.')).toBe(false);
      expect(containsDevanagari('')).toBe(false);
    });
  });

  describe('3. Audited TTS Locale Determination', () => {
    it('should select "hi-IN" when active language is Hindi (hi-IN)', () => {
      const res = determineTtsLocale('System is ready', 'hi-IN');
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.isHindiTarget).toBe(true);
    });

    it('should select "hi-IN" when active language is Hinglish', () => {
      const res = determineTtsLocale('Aapka task complete ho gaya hai', 'hinglish');
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.isHindiTarget).toBe(true);
    });

    it('should select "hi-IN" if output text contains Devanagari even if system language is set to English', () => {
      // Safety guarantee: If JARVIS generated Hindi text, it MUST be spoken using Hindi TTS
      const res = determineTtsLocale('नमस्ते सर, आज का दिन शुभ हो।', 'en-US');
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.isHindiTarget).toBe(true);
    });

    it('should handle mixed Hindi-English technical terms without falling back to English TTS', () => {
      const res = determineTtsLocale('सर, आपका YouTube API Level-4 Authorization सुरक्षित है।', 'hi-IN');
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.isHindiTarget).toBe(true);
    });

    it('should switch dynamically to Hindi upon voice command override', () => {
      const res = determineTtsLocale('अब मैं हिंदी में बात करूँगा।', 'en-US', 'hi-IN');
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.isHindiTarget).toBe(true);
    });

    it('should switch back to English upon voice command override', () => {
      const res = determineTtsLocale('Understood Sir, switching back to English.', 'hi-IN', 'en-US');
      expect(res.targetLocale).toBe('en-US');
      expect(res.isHindiTarget).toBe(false);
    });

    it('should correctly handle other multilingual locales', () => {
      expect(determineTtsLocale('Bonjour', 'fr-FR').targetLocale).toBe('fr-FR');
      expect(determineTtsLocale('Hola', 'es-ES').targetLocale).toBe('es-ES');
      expect(determineTtsLocale('Hello', 'en-GB').targetLocale).toBe('en-GB');
    });
  });

  describe('4. Dynamic Voice Selection Pipeline', () => {
    it('should pick the best native Hindi voice when voices are present', () => {
      const res = findBestVoiceForLocale(allVoices, 'hi-IN');
      expect(res.isHindiTarget).toBe(true);
      expect(res.selectedVoice).not.toBeNull();
      expect(res.selectedVoice?.name).toBe('Google हिन्दी');
      expect(res.availableHindiVoiceCount).toBe(2);
      expect(res.isExactMatch).toBe(true);
    });

    it('should respect user preferred voiceURI if it matches a valid Hindi voice', () => {
      const res = findBestVoiceForLocale(allVoices, 'hi-IN', 'ms-kalpana-hi');
      expect(res.selectedVoice?.name).toBe('Microsoft Kalpana - Hindi (India)');
      expect(res.reason).toContain('Preferred Hindi voice');
    });

    it('CRITICAL ERROR TRANSPARENCY: should return null voice when no Hindi voice exists on device/browser', () => {
      const englishOnlyVoices = [mockUSEnglish, mockUKEnglish, mockIndianEnglish];
      const res = findBestVoiceForLocale(englishOnlyVoices, 'hi-IN');

      // MUST NOT return an English voice!
      expect(res.selectedVoice).toBeNull();
      expect(res.availableHindiVoiceCount).toBe(0);
      expect(res.targetLocale).toBe('hi-IN');
      expect(res.reason).toBe('Hindi TTS voice unavailable on this device/browser.');
    });

    it('should pick appropriate English voice for en-US target', () => {
      const res = findBestVoiceForLocale(allVoices, 'en-US');
      expect(res.isHindiTarget).toBe(false);
      expect(res.selectedVoice?.lang).toBe('en-US');
    });

    it('should pick appropriate UK voice for en-GB target', () => {
      const res = findBestVoiceForLocale(allVoices, 'en-GB');
      expect(res.selectedVoice?.lang).toBe('en-GB');
    });
  });

  describe('5. Non-Sensitive Diagnostics Generation', () => {
    it('should build accurate diagnostics when native Hindi voice is active', () => {
      const resolution = findBestVoiceForLocale(allVoices, 'hi-IN');
      const diag = buildSpeechDiagnostics('hi-IN', resolution);

      expect(diag.activeLanguage).toBe('hi-IN');
      expect(diag.requestedTtsLocale).toBe('hi-IN');
      expect(diag.selectedVoiceName).toBe('Google हिन्दी');
      expect(diag.selectedVoiceLang).toBe('hi-IN');
      expect(diag.availableHindiVoiceCount).toBe(2);
      expect(diag.statusMessage).toContain('Hindi TTS Active');
      expect(diag.ttsErrorState).toBeNull();

      // Zero-secrets assurance: ensure no secret keys or tokens are in diagnostics
      const json = JSON.stringify(diag);
      expect(json).not.toContain('token');
      expect(json).not.toContain('secret');
      expect(json).not.toContain('key');
    });

    it('should build transparent warning diagnostic when Hindi TTS voice is missing on device', () => {
      const resolution = findBestVoiceForLocale([mockUSEnglish], 'hi-IN');
      const diag = buildSpeechDiagnostics('hi-IN', resolution);

      expect(diag.selectedVoiceName).toBe('None / Platform Default');
      expect(diag.availableHindiVoiceCount).toBe(0);
      expect(diag.statusMessage).toBe('Hindi TTS voice unavailable on this device/browser.');
    });
  });

  describe('6. Real-time Interruption & Speech Lifecycle', () => {
    it('should detect Hindi stop commands for immediate TTS cancellation', () => {
      expect(isSpeechInterruptionCommand('चुप रहो')).toBe(true);
      expect(isSpeechInterruptionCommand('रुक जाओ')).toBe(true);
      expect(isSpeechInterruptionCommand('बस करो')).toBe(true);
      expect(isSpeechInterruptionCommand('ruk jao')).toBe(true);
      expect(isSpeechInterruptionCommand('stop')).toBe(true);
    });

    it('should not interrupt normal conversational commands', () => {
      expect(isSpeechInterruptionCommand('JARVIS, YouTube status kya hai')).toBe(false);
      expect(isSpeechInterruptionCommand('aaj ka mausam batao')).toBe(false);
    });
  });

  describe('7. Language Code Normalization Helper', () => {
    it('should normalize hinglish to hi-IN', () => {
      expect(normalizeLanguageCode('hinglish')).toBe('hi-IN');
    });

    it('should normalize hi to hi-IN', () => {
      expect(normalizeLanguageCode('hi')).toBe('hi-IN');
    });

    it('should normalize auto to en-US', () => {
      expect(normalizeLanguageCode('auto')).toBe('en-US');
    });

    it('should preserve standard locales', () => {
      expect(normalizeLanguageCode('en-GB')).toBe('en-GB');
      expect(normalizeLanguageCode('es-ES')).toBe('es-ES');
      expect(normalizeLanguageCode('fr-FR')).toBe('fr-FR');
    });
  });
});
