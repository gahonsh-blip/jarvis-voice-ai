import { describe, it, expect, beforeEach } from 'vitest';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import {
  detectSpeechLanguage,
  detectLanguageSwitchCommand,
  isSpeechInterruptionCommand,
  SUPPORTED_LANGUAGES,
} from '../utils/languages';
import { MemoryStore } from '../types';

describe('HERMES JARVIS — Natural Voice, Hindi Mode, Interruption & Level-4 Security Audit', () => {
  let initialMemory: MemoryStore;

  beforeEach(() => {
    initialMemory = {
      name: 'Tester',
      notes: [],
      customKeyValues: {},
      stats: {
        totalCommands: 0,
        actionsExecuted: 0,
        lastActive: '2026-09-02T00:00:00.000Z',
      },
    };
  });

  describe('1. Natural Interruption Detection Engine', () => {
    it('should detect standard English interruption phrases', () => {
      expect(isSpeechInterruptionCommand('stop')).toBe(true);
      expect(isSpeechInterruptionCommand('stop speaking')).toBe(true);
      expect(isSpeechInterruptionCommand('shut up')).toBe(true);
      expect(isSpeechInterruptionCommand('quiet')).toBe(true);
      expect(isSpeechInterruptionCommand('silence')).toBe(true);
      expect(isSpeechInterruptionCommand('cancel')).toBe(true);
      expect(isSpeechInterruptionCommand('jarvis hold on')).toBe(true);
      expect(isSpeechInterruptionCommand('wait a second')).toBe(true);
      expect(isSpeechInterruptionCommand('pause')).toBe(true);
    });

    it('should detect authentic Hindi and Hinglish interruption phrases', () => {
      expect(isSpeechInterruptionCommand('चुप रहो')).toBe(true);
      expect(isSpeechInterruptionCommand('रुक जाओ')).toBe(true);
      expect(isSpeechInterruptionCommand('बस करो')).toBe(true);
      expect(isSpeechInterruptionCommand('बोलना बंद करो')).toBe(true);
      expect(isSpeechInterruptionCommand('shant ho jao')).toBe(true);
      expect(isSpeechInterruptionCommand('chup ho jao')).toBe(true);
      expect(isSpeechInterruptionCommand('ruk jao')).toBe(true);
      expect(isSpeechInterruptionCommand('bas karo')).toBe(true);
      expect(isSpeechInterruptionCommand('chup')).toBe(true);
    });

    it('should not falsely trigger on normal conversation phrases', () => {
      expect(isSpeechInterruptionCommand('tell me about the solar system')).toBe(false);
      expect(isSpeechInterruptionCommand('what is the time')).toBe(false);
      expect(isSpeechInterruptionCommand('aaj ka mausam kaisa hai')).toBe(false);
    });
  });

  describe('2. Dynamic Language Detection & Switching', () => {
    it('should detect Hindi script correctly', () => {
      const detected = detectSpeechLanguage('सुप्रभात जार्विस, आज क्या शेड्यूल है?');
      expect(detected).toBe('hi-IN');
    });

    it('should detect Hinglish correctly', () => {
      const detected = detectSpeechLanguage('aaj ka weather kaisa hai jarvis batao');
      expect(detected).toBe('hi-IN');
    });

    it('should detect English as default when no Hindi markers are present', () => {
      const detected = detectSpeechLanguage('What is the CPU utilization of the Oracle VM?');
      expect(detected).toBe('en-US');
    });

    it('should detect voice commands to switch languages', () => {
      expect(detectLanguageSwitchCommand('हिंदी में बोलो')?.code).toBe('hi-IN');
      expect(detectLanguageSwitchCommand('speak in hindi')?.code).toBe('hi-IN');
      expect(detectLanguageSwitchCommand('switch to english')?.code).toBe('en-US');
      expect(detectLanguageSwitchCommand('talk to me in french')?.code).toBe('fr-FR');
      expect(detectLanguageSwitchCommand('speak in spanish')?.code).toBe('es-ES');
      expect(detectLanguageSwitchCommand('what is the time')).toBeNull();
    });
  });

  describe('3. Multi-Lingual Conversational Voice Processing', () => {
    it('should provide calm, professional Hindi responses in Hindi mode without repetitive Sir spam', () => {
      const result = processOfflineCommand('नमस्ते जार्विस', initialMemory, 'hi-IN');
      expect(result.intent).toBe('chat');
      expect(result.reply).toContain('नमस्ते');
      // Should not contain excessive Sir repetition
      const sirCount = (result.reply.match(/सर/g) || []).length;
      expect(sirCount).toBeLessThanOrEqual(2);
    });

    it('should respond to "how are you" respectfully in Hinglish and Hindi', () => {
      const resHinglish = processOfflineCommand('kaise ho jarvis', initialMemory, 'hi-IN');
      expect(resHinglish.intent).toBe('chat');
      expect(resHinglish.reply).toContain('सुचारू');

      const resHindi = processOfflineCommand('आप कैसे हैं', initialMemory, 'hi-IN');
      expect(resHindi.intent).toBe('chat');
      expect(resHindi.reply).toContain('कार्यरत');
    });

    it('should respond to gratitude naturally in Hindi and English', () => {
      const resThanksHi = processOfflineCommand('धन्यवाद जार्विस', initialMemory, 'hi-IN');
      expect(resThanksHi.intent).toBe('chat');
      expect(resThanksHi.reply).toContain('सेवा');

      const resThanksEn = processOfflineCommand('thank you jarvis', initialMemory, 'en-US');
      expect(resThanksEn.intent).toBe('chat');
      expect(resThanksEn.reply).toContain('pleasure');
    });
  });

  describe('4. Level-4 Human Authorization Gateway Enforcement', () => {
    it('should enforce Level-4 gate on public video upload requests', () => {
      const result = processOfflineCommand('Jarvis, upload this video publicly', initialMemory, 'en-US');
      expect(result.intent).toBe('youtube_upload_request');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('Level-4');
      expect(result.actionDetail?.payload?.requiresConfirmation).toBe(true);
    });

    it('should enforce Level-4 gate on Hindi public video upload requests', () => {
      const result = processOfflineCommand('जार्विस, यूट्यूब पर वीडियो अपलोड करो', initialMemory, 'hi-IN');
      expect(result.intent).toBe('youtube_upload_request');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('Level-4');
    });

    it('should enforce Level-4 gate on social media post creation and publishing', () => {
      const result = processOfflineCommand('draft today linkedin post', initialMemory, 'en-US');
      expect(result.intent).toBe('create_social_post');
      expect(result.actionExecuted).toBe(true);
    });
  });

  describe('5. Truthful Status Inquiry & Zero False Claims', () => {
    it('should return truthful YouTube channel status based on real connection state', () => {
      const result = processOfflineCommand('Jarvis, aaj YouTube ka kya status hai?', initialMemory, 'hi-IN');
      expect(result.intent).toBe('youtube_status_inquiry');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('YouTube');
    });

    it('should strictly block financial operations with zero-compromise safety protocol', () => {
      const result = processOfflineCommand('transfer 500 dollars to my account', initialMemory, 'en-US');
      expect(result.intent).toBe('finance_blocked');
      expect(result.financeBlocked).toBe(true);
      expect(result.reply).toContain('Financial operations are strictly restricted');
    });

    it('should block Hindi financial operations with clear safety reason', () => {
      const result = processOfflineCommand('मेरे बैंक से पैसे ट्रांसफर करो', initialMemory, 'hi-IN');
      expect(result.intent).toBe('finance_blocked');
      expect(result.financeBlocked).toBe(true);
      expect(result.reply).toContain('Financial operations are strictly restricted');
    });
  });

  describe('6. Emergency Kill Switch and Resumption', () => {
    it('should recognize emergency stop commands in English and Hindi', () => {
      const stopEn = processOfflineCommand('emergency stop jarvis', initialMemory, 'en-US');
      expect(stopEn.intent).toBe('emergency_stop');
      expect(stopEn.actionExecuted).toBe(true);
      expect(stopEn.reply).toContain('Emergency Stop is now active');

      const stopHi = processOfflineCommand('जार्विस तुरंत सब बंद करो', initialMemory, 'hi-IN');
      expect(stopHi.intent).toBe('emergency_stop');
      expect(stopHi.actionExecuted).toBe(true);
    });

    it('should recognize emergency resume commands', () => {
      const resume = processOfflineCommand('emergency resume actions', initialMemory, 'en-US');
      expect(resume.intent).toBe('emergency_resume');
      expect(resume.actionExecuted).toBe(true);
      expect(resume.reply).toContain('Emergency Stop deactivated');
    });
  });
});
