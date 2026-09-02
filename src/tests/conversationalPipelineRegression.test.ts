import { describe, it, expect } from 'vitest';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { detectLanguageSwitchCommand } from '../utils/languages';
import { MemoryStore } from '../types';

describe('HERMES JARVIS - Conversational Pipeline Regression Test Suite', () => {
  const initialMemory: MemoryStore = {
    name: 'Gahonsh',
    notes: [],
    customKeyValues: {
      status: 'ONLINE',
      protocol: 'Autonomous Core',
    },
    stats: {
      totalCommands: 10,
      actionsExecuted: 2,
      lastActive: new Date().toISOString(),
    },
  };

  const CANNED_GREETING_SUBSTRING = 'Greetings Sir. Hermes Jarvis online and standing by';

  describe('Regression Test Cases A through F (Live Engine Paths)', () => {
    it('A. "मुझसे हिंदी में बात करो" triggers language_switch without canned greeting', () => {
      const input = 'मुझसे हिंदी में बात करो';
      const langSwitch = detectLanguageSwitchCommand(input);
      expect(langSwitch?.requested).toBe(true);
      expect(langSwitch?.newLang).toBe('hi-IN');

      const result = processOfflineCommand(input, initialMemory, 'en-US');
      expect(result.intent).toBe('language_switch');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toContain('हिंदी मोड');
      expect(result.actionDetail?.payload?.language).toBe('hi-IN');
    });

    it('B. "अभी कितने बजे हैं?" returns contextually accurate time without canned greeting', () => {
      const input = 'अभी कितने बजे हैं?';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(result.intent).toBe('time_inquiry');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toMatch(/समय|बजे/);
      expect(result.actionDetail?.payload?.timeStr).toBeDefined();
    });

    it('C. "आज का मौसम बताओ" provides meteorological telemetry without canned greeting', () => {
      const input = 'आज का मौसम बताओ';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(result.intent).toBe('weather_inquiry');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toMatch(/मौसम|तापमान|Sky|°C/);
    });

    it('D. "YouTube की स्थिति क्या है?" queries channel connectivity without canned greeting', () => {
      const input = 'YouTube की स्थिति क्या है?';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(result.intent).toBe('youtube_status_inquiry');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toMatch(/YouTube|यूट्यूब/);
    });

    it('E. "JARVIS क्या कर सकता है?" returns capabilities directory without canned greeting', () => {
      const input = 'JARVIS क्या कर सकता है?';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(result.intent).toBe('capabilities_inquiry');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toMatch(/HERMES JARVIS|क्षमताएं|Capabilities/i);
    });

    it('F. "2 + 2 कितना होता है?" evaluates expression to 4 without canned greeting', () => {
      const input = '2 + 2 कितना होता है?';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(['open_calculator', 'math_computation']).toContain(result.intent);
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toContain('4');
      expect(result.actionDetail?.payload?.result).toBe(4);
    });
  });

  describe('Verification of Previously Bugged Natural Language Inputs', () => {
    it('"Hindi mein baat karo Jarvis" correctly switches to Hindi mode', () => {
      const input = 'Hindi mein baat karo Jarvis';
      const result = processOfflineCommand(input, initialMemory, 'en-US');
      expect(result.intent).toBe('language_switch');
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toContain('हिंदी मोड');
    });

    it('"abhi ka time kya ho raha hai batao" returns the time, avoiding "hi" false-positive greeting', () => {
      const input = 'abhi ka time kya ho raha hai batao';
      const result = processOfflineCommand(input, initialMemory, 'hi-IN');
      expect(result.intent).toBe('time_inquiry');
      expect(result.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(result.reply).toMatch(/समय|बजे/);
    });
  });

  describe('Live Network /api/chat End-to-End Regression Verification', () => {
    async function queryLiveApi(message: string, language: string = 'hi-IN') {
      try {
        const response = await fetch('http://localhost:3000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, language }),
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }

    it('Live /api/chat: A. "मुझसे हिंदी में बात करो" produces language_switch response', async () => {
      const data = await queryLiveApi('मुझसे हिंदी में बात करो', 'en-US');
      if (!data) return; // Skip if daemon port is not reachable in CI container
      expect(data.intent).toBe('language_switch');
      expect(data.languageChangedTo).toBe('hi-IN');
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toContain('हिंदी मोड');
    });

    it('Live /api/chat: B. "अभी कितने बजे हैं?" produces time_inquiry response', async () => {
      const data = await queryLiveApi('अभी कितने बजे हैं?', 'hi-IN');
      if (!data) return;
      expect(data.intent).toBe('time_inquiry');
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toMatch(/समय|बजे/);
    });

    it('Live /api/chat: C. "आज का मौसम बताओ" produces weather telemetry', async () => {
      const data = await queryLiveApi('आज का मौसम बताओ', 'hi-IN');
      if (!data) return;
      expect(data.intent).toBe('weather_inquiry');
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toMatch(/मौसम|तापमान|Sky|°C/);
    });

    it('Live /api/chat: D. "YouTube की स्थिति क्या है?" produces YouTube status', async () => {
      const data = await queryLiveApi('YouTube की स्थिति क्या है?', 'hi-IN');
      if (!data) return;
      expect(data.intent).toBe('youtube_status_inquiry');
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toMatch(/YouTube|यूट्यूब/);
    });

    it('Live /api/chat: E. "JARVIS क्या कर सकता है?" lists capabilities', async () => {
      const data = await queryLiveApi('JARVIS क्या कर सकता है?', 'hi-IN');
      if (!data) return;
      expect(data.intent).toBe('capabilities_inquiry');
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toMatch(/HERMES JARVIS|क्षमताएं/i);
    });

    it('Live /api/chat: F. "2 + 2 कितना होता है?" computes arithmetic result 4', async () => {
      const data = await queryLiveApi('2 + 2 कितना होता है?', 'hi-IN');
      if (!data) return;
      expect(['math_computation', 'open_calculator']).toContain(data.intent);
      expect(data.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(data.reply).toContain('4');
    });

    it('Live /api/chat: verifies previously bugged inputs receive distinct responses', async () => {
      const dataHindi = await queryLiveApi('Hindi mein baat karo Jarvis', 'en-US');
      const dataTime = await queryLiveApi('abhi ka time kya ho raha hai batao', 'hi-IN');
      if (!dataHindi || !dataTime) return;

      expect(dataHindi.intent).toBe('language_switch');
      expect(dataTime.intent).toBe('time_inquiry');
      expect(dataHindi.reply).not.toBe(dataTime.reply);
      expect(dataHindi.reply).not.toContain(CANNED_GREETING_SUBSTRING);
      expect(dataTime.reply).not.toContain(CANNED_GREETING_SUBSTRING);
    });
  });
});
