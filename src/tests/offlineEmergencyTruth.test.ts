// HERMES JARVIS — offline emergency-stop honesty.
//
// The offline fallback engine cannot reach the server kill switch, so a voice
// "emergency stop"/"resume" issued while the backend is unreachable must never
// report the freeze as executed. A false success here is unsafe: the operator
// believes autonomy is frozen when it is not.

import { describe, it, expect } from 'vitest';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { offlineEmergencyVerdict, offlineEmergencyReply } from '../utils/computerOperator/offlineEmergencyTruth';
import { MemoryStore } from '../types';

const memory = (): MemoryStore => ({
  name: 'Tester',
  notes: [],
  customKeyValues: {},
  stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-27T00:00:00.000Z' },
});

describe('offlineEmergencyTruth', () => {
  it('never reports the stop or resume as executed', () => {
    expect(offlineEmergencyVerdict('stop', 'en').actionExecuted).toBe(false);
    expect(offlineEmergencyVerdict('resume', 'en').actionExecuted).toBe(false);
  });

  it('titles say the kill switch was not engaged/released', () => {
    expect(offlineEmergencyVerdict('stop', 'en').title).toContain('NOT Engaged');
    expect(offlineEmergencyVerdict('resume', 'en').title).toContain('NOT Released');
  });

  it('replies name the missing connection and never claim a freeze', () => {
    const stop = offlineEmergencyVerdict('stop', 'en');
    expect(offlineEmergencyReply(stop, 'en')).toContain('NOT engaged');
    expect(offlineEmergencyReply(stop, 'hi')).toContain('सक्रिय नहीं हुआ');
    expect(offlineEmergencyReply(stop, 'hinglish')).toContain('engage nahi hua');
  });

  it('offline engine routes emergency stop/resume without incrementing executed actions', () => {
    const m = memory();
    const stop = processOfflineCommand('emergency stop jarvis', m, 'en-US');
    expect(stop.intent).toBe('emergency_stop');
    expect(stop.actionExecuted).toBe(false);
    expect(stop.updatedMemory?.stats.actionsExecuted).toBe(0);

    const resume = processOfflineCommand('emergency resume actions', m, 'en-US');
    expect(resume.intent).toBe('emergency_resume');
    expect(resume.actionExecuted).toBe(false);
    expect(resume.updatedMemory?.stats.actionsExecuted).toBe(0);
  });
});
