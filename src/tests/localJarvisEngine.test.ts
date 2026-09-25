import { describe, it, expect, beforeEach } from 'vitest';
import { processOfflineCommand, LocalProcessingResult } from '../utils/localJarvisEngine';
import { MemoryStore, MobileStatusData } from '../types';
import { DEFAULT_MOBILE_PERMISSIONS } from '../utils/mobileStatusEngine';

describe('Local Jarvis Offline Engine - Core Command Processing', () => {
  let initialMemory: MemoryStore;

  beforeEach(() => {
    initialMemory = {
      name: '',
      notes: [],
      customKeyValues: {},
      stats: {
        totalCommands: 0,
        actionsExecuted: 0,
        lastActive: '2026-09-01T00:00:00.000Z',
      },
    };
  });

  describe('1. Identity & Name Management', () => {
    it('should extract and save user name in English', () => {
      const result: LocalProcessingResult = processOfflineCommand('My name is Tony Stark', initialMemory, 'en-US');
      expect(result.intent).toBe('set_name');
      expect(result.actionExecuted).toBe(true);
      expect(result.updatedMemory?.name).toBe('Tony Stark');
      expect(result.updatedMemory?.stats.actionsExecuted).toBe(1);
      expect(result.updatedMemory?.stats.totalCommands).toBe(1);
      expect(result.reply).toContain('Tony Stark');
      expect(result.offline).toBe(true);
    });

    it('should extract and save user name using "Call me"', () => {
      const result = processOfflineCommand('Call me Bruce Wayne', initialMemory, 'en-US');
      expect(result.intent).toBe('set_name');
      expect(result.updatedMemory?.name).toBe('Bruce Wayne');
    });

    it('should extract and save user name in Hindi', () => {
      const result = processOfflineCommand('मेरा नाम रोहन है', initialMemory, 'hi-IN');
      expect(result.intent).toBe('set_name');
      expect(result.actionExecuted).toBe(true);
      expect(result.updatedMemory?.name).toBe('रोहन');
      expect(result.reply).toContain('रोहन');
    });

    it('should report the saved name when asked "who am i"', () => {
      const memoryWithName: MemoryStore = { ...initialMemory, name: 'Vikram' };
      const result = processOfflineCommand('Who am I?', memoryWithName, 'en-US');
      expect(result.intent).toBe('get_name');
      expect(result.reply).toContain('Vikram');
    });

    it('should prompt to set name if no name is currently stored', () => {
      const result = processOfflineCommand('What is my name?', initialMemory, 'en-US');
      expect(result.intent).toBe('get_name');
      expect(result.reply).toContain("You haven't informed me of your name yet");
    });
  });

  describe('2. Calculator & Math Expression Processing', () => {
    it('should open the calculator tool when requested', () => {
      const result = processOfflineCommand('open calculator', initialMemory, 'en-US');
      expect(result.intent).toBe('open_calculator');
      expect(result.actionExecuted).toBe(true);
      expect(result.actionDetail?.type).toBe('open_calculator');
    });

    it('should accurately compute direct mathematical expressions', () => {
      const result = processOfflineCommand('what is 25 + 75', initialMemory, 'en-US');
      expect(result.intent).toBe('open_calculator');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('100');
    });

    it('should accurately compute multiplication and division queries', () => {
      const multResult = processOfflineCommand('calculate 40 * 12', initialMemory, 'en-US');
      expect(multResult.reply).toContain('480');

      const divResult = processOfflineCommand('compute 100 / 4', initialMemory, 'en-US');
      expect(divResult.reply).toContain('25');
    });

    it('should support Hindi calculator commands', () => {
      const result = processOfflineCommand('कैलकुलेटर खोलो', initialMemory, 'hi-IN');
      expect(result.intent).toBe('open_calculator');
      expect(result.reply).toContain('इन-ऐप कैलकुलेटर दृश्य खोला जा रहा है');
      expect(result.reply).toContain('ऑफ़लाइन मोड में कोई वास्तविक डेस्कटॉप कैलकुलेटर ऐप नहीं खुलता');
    });
  });

  describe('3. Workspace Productivity Tools', () => {
    it('should trigger Notepad on "open notepad" or "write note"', () => {
      const result = processOfflineCommand('open notepad', initialMemory, 'en-US');
      expect(result.intent).toBe('open_notepad');
      expect(result.actionExecuted).toBe(true);
      expect(result.actionDetail?.type).toBe('open_notepad');
    });

    it('should trigger Paint Canvas on "open paint"', () => {
      const result = processOfflineCommand('open paint', initialMemory, 'en-US');
      expect(result.intent).toBe('open_paint');
      expect(result.actionExecuted).toBe(true);
      expect(result.actionDetail?.type).toBe('open_paint');
    });

    it('should trigger Screenshot tool on "take screenshot"', () => {
      const result = processOfflineCommand('take screenshot', initialMemory, 'en-US');
      expect(result.intent).toBe('take_screenshot');
      expect(result.actionExecuted).toBe(true);
      expect(result.actionDetail?.type).toBe('take_screenshot');
    });
  });

  describe('4. Blueprint, Freelance, and Social Media Consoles', () => {
    it('should open Master Blueprint on "blueprint" or "roadmap"', () => {
      const result = processOfflineCommand('show roadmap blueprint', initialMemory, 'en-US');
      expect(result.intent).toBe('check_project');
      expect(result.actionExecuted).toBe(true);
    });

    it('should open Freelance Pipeline on "freelance proposal quotation"', () => {
      const result = processOfflineCommand('generate freelance quotation', initialMemory, 'en-US');
      expect(result.intent).toBe('generate_quotation');
      expect(result.actionExecuted).toBe(true);
    });

    it('should open Social Media Console on "create social post"', () => {
      const result = processOfflineCommand('draft a linkedin social post', initialMemory, 'en-US');
      expect(result.intent).toBe('create_social_post');
      expect(result.actionExecuted).toBe(true);
    });
  });

  describe('5. Morning Briefing & Mobile Personal Status', () => {
    it('should trigger mobile personal status briefing in English for "Good morning JARVIS"', () => {
      const result = processOfflineCommand('Good morning JARVIS', initialMemory, 'en-US');
      expect(result.intent).toBe('mobile_personal_status');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('Good morning');
      expect(result.reply).toContain('battery');
    });

    it('should trigger authentic Hindi briefing for "सुप्रभात जार्विस"', () => {
      const result = processOfflineCommand('सुप्रभात जार्विस', initialMemory, 'hi-IN');
      expect(result.intent).toBe('mobile_personal_status');
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).toContain('सुप्रभात');
      expect(result.reply).toContain('बैटरी');
      expect(result.reply).toContain('मौसम');
    });

    it('should recognize shortcut commands like "gm" and "mobile status"', () => {
      const resultGm = processOfflineCommand('gm', initialMemory, 'en-US');
      expect(resultGm.intent).toBe('mobile_personal_status');

      const resultStatus = processOfflineCommand('mobile status', initialMemory, 'en-US');
      expect(resultStatus.intent).toBe('mobile_personal_status');
    });

    it('should not speak sample fixture telemetry as measured readings', () => {
      const sampleStatus = {
        lastUpdated: new Date().toISOString(),
        battery: { level: 91, charging: false, temperatureC: 33, powerMode: 'Normal', statusText: 'SAMPLE', available: true, isSample: true },
        weather: { location: 'New Delhi', temperatureC: 27, condition: 'SAMPLE', conditionHi: 'नमूना', humidity: 48, windKmh: 9, feelsLikeC: 28, available: true, isSample: true },
        notifications: { totalCount: 7, criticalCount: 2, items: [], available: true, isSample: true },
        calendar: { todayEventsCount: 4, events: [], available: true, isSample: true },
        email: { unreadCount: 9, importantCount: 3, summaries: [], available: true, isSample: true },
        deviceHealth: { ramUsageMb: 0, ramTotalMb: 8192, storageFreeGb: 0, storageTotalGb: 128, deviceModel: 'SAMPLE', osVersion: 'SAMPLE', networkType: 'Offline', available: false, isSample: true },
        permissions: { ...DEFAULT_MOBILE_PERMISSIONS },
      } as MobileStatusData;

      const result = processOfflineCommand('mobile status', initialMemory, 'en-US', sampleStatus);
      expect(result.actionExecuted).toBe(true);
      expect(result.reply).not.toMatch(/91%|27°C|7 priority|4 events|9 unread/);
      expect(result.reply).toMatch(/No battery reading is available/);
      expect(result.reply).toMatch(/no weather source is connected/i);
      expect(result.reply).toMatch(/Notifications could not be read/);
    });
  });

  describe('6. Infrastructure, Security, Routines, and System Diagnostics', () => {
    it('should handle daily routines commands', () => {
      const result = processOfflineCommand('check my daily routine schedule', initialMemory, 'en-US');
      expect(result.intent).toBe('schedule_morning_report');
      expect(result.actionExecuted).toBe(true);
    });

    it('should open Oracle Cloud telemetry on "oracle cloud vm"', () => {
      const result = processOfflineCommand('show oracle cloud server status', initialMemory, 'en-US');
      expect(result.intent).toBe('cloud_telemetry');
      expect(result.actionExecuted).toBe(true);
    });

    it('should open Security Matrix on "security level policy"', () => {
      const result = processOfflineCommand('check security matrix', initialMemory, 'en-US');
      expect(result.intent).toBe('security_audit');
      expect(result.actionExecuted).toBe(true);
    });

    it('should report system time and date accurately', () => {
      const result = processOfflineCommand('what is the current time and date', initialMemory, 'en-US');
      expect(result.intent).toBe('system_diagnostic');
      expect(result.reply).toContain('current system time');
    });

    it('should not claim systems are healthy when only a clock value was produced', () => {
      const diagnostic = processOfflineCommand('what is the current time and date', initialMemory, 'en-US');
      const timeOnly = processOfflineCommand('what time is it', initialMemory, 'en-US');

      for (const result of [diagnostic, timeOnly]) {
        expect(result.reply ?? '').not.toMatch(/operational/i);
        expect(result.reply ?? '').not.toMatch(/nominal/i);
        expect(result.reply ?? '').not.toMatch(/सामान्य हैं/);
        expect(result.spokenText ?? '').not.toMatch(/operational/i);
      }

      expect(diagnostic.reply).toMatch(/not run any system diagnostics/i);
      expect(timeOnly.reply).toMatch(/^The current system time is/);
      expect(timeOnly.actionDetail?.title).not.toMatch(/Diag/i);
    });

    it('should handle volume up and volume down controls', () => {
      const up = processOfflineCommand('volume up', initialMemory, 'en-US');
      expect(up.intent).toBe('volume_up');
      expect(up.actionExecuted).toBe(true);

      const down = processOfflineCommand('volume down', initialMemory, 'en-US');
      expect(down.intent).toBe('volume_down');
      expect(down.actionExecuted).toBe(true);
    });
  });

  describe('7. Web Search and Browser Queries', () => {
    it('should extract search query string for Google search requests', () => {
      const result = processOfflineCommand('search for latest TypeScript releases', initialMemory, 'en-US');
      expect(result.intent).toBe('google_search');
      expect(result.actionExecuted).toBe(true);
      expect(result.actionDetail?.payload?.query).toBe('latest TypeScript releases');
      expect(result.reply).toContain('latest TypeScript releases');
    });

    it('should handle Hindi search requests', () => {
      const result = processOfflineCommand('सर्च करो रिएक्ट हुक्स', initialMemory, 'hi-IN');
      expect(result.intent).toBe('google_search');
      expect(result.actionDetail?.payload?.query).toBe('रिएक्ट हुक्स');
    });
  });

  describe('8. Conversational Greetings, Inquiries, and Offline Fallbacks', () => {
    it('should respond appropriately to greetings like "hello"', () => {
      const result = processOfflineCommand('hello', initialMemory, 'en-US');
      expect(result.intent).toBe('chat');
      expect(result.reply).toContain('Hermes Jarvis is standing by');
    });

    it('should respond to identity questions "who are you"', () => {
      const result = processOfflineCommand('who are you', initialMemory, 'en-US');
      expect(result.intent).toBe('chat');
      expect(result.reply).toContain('HERMES JARVIS');
    });

    it('should respond to system status question "how are you" without claiming unmeasured health', () => {
      const result = processOfflineCommand('how are you', initialMemory, 'en-US');
      expect(result.intent).toBe('chat');
      // This handler used to answer "All systems nominal." It performs no
      // health check, so it must say so instead of asserting health.
      expect(result.reply).not.toContain('All systems nominal');
      expect(result.reply).toContain('cannot health-check');
    });

    it('should handle unmapped queries gracefully using offline fallback response', () => {
      const result = processOfflineCommand('random unknown phrase xyz123', initialMemory, 'en-US');
      expect(result.intent).toBe('chat');
      expect(result.offline).toBe(true);
      expect(result.reply).toContain('Operating via local offline neural matrix');
    });

    it('should continuously increment totalCommands counter in memory stats', () => {
      let mem = initialMemory;
      const res1 = processOfflineCommand('hello', mem, 'en-US');
      mem = res1.updatedMemory!;
      expect(mem.stats.totalCommands).toBe(1);

      const res2 = processOfflineCommand('open calculator', mem, 'en-US');
      mem = res2.updatedMemory!;
      expect(mem.stats.totalCommands).toBe(2);
      expect(mem.stats.actionsExecuted).toBe(1);
    });
  });
});
