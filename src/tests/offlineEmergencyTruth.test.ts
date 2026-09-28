// HERMES JARVIS — offline emergency-stop honesty.
//
// The offline fallback engine cannot reach the server kill switch, so a voice
// "emergency stop"/"resume" issued while the backend is unreachable must never
// report the freeze as executed. A false success here is unsafe: the operator
// believes autonomy is frozen when it is not.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import {
  offlineEmergencyVerdict,
  offlineEmergencyReply,
  emergencyToggleVerdict,
} from '../utils/computerOperator/offlineEmergencyTruth';
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

describe('emergencyToggleVerdict never credits a toggle that changed nothing', () => {
  it('a first stop engages the freeze and is credited once', () => {
    const v = emergencyToggleVerdict('stop', { emergencyPaused: false });
    expect(v.actionExecuted).toBe(true);
    expect(v.title).toBe('Emergency Stop Activated');
    expect(v.replyEn).toMatch(/now active/i);
  });

  it('a repeated stop credits nothing (it would otherwise RELEASE the freeze)', () => {
    const v = emergencyToggleVerdict('stop', { emergencyPaused: true });
    expect(v.actionExecuted).toBe(false);
    expect(v.title).toMatch(/Already Active/);
    expect(v.replyEn).toMatch(/already active/i);
    expect(v.replyEn).not.toMatch(/now active/i);
  });

  it('a resume while the hard kill switch is latched is never spoken as released', () => {
    const v = emergencyToggleVerdict('resume', {
      emergencyPaused: false,
      hardKillSwitchTriggered: true,
    });
    expect(v.actionExecuted).toBe(false);
    expect(v.title).toMatch(/NOT Released/);
    expect(v.replyEn).toMatch(/NOT released/i);
  });

  it('a resume while nothing is paused credits nothing', () => {
    const v = emergencyToggleVerdict('resume', { emergencyPaused: false });
    expect(v.actionExecuted).toBe(false);
    expect(v.title).toMatch(/Not Active/);
  });

  it('a real resume releases an engaged freeze and is credited once', () => {
    const v = emergencyToggleVerdict('resume', { emergencyPaused: true });
    expect(v.actionExecuted).toBe(true);
    expect(v.title).toBe('Emergency Stop Released');
  });

  it('pins the server cases to the verdict and drops the hardcoded success literals', () => {
    const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const flat = serverSource.replace(/\s+/g, ' ');
    expect(flat).toContain('emergencyToggleVerdict(');
    expect(flat).not.toContain("title: 'Emergency Stop Activated', payload: getEmergencyState()");
    expect(flat).not.toContain(
      "spokenResponse = 'Emergency Stop is now active. All autonomous modifications, drafts, and external publishing are frozen.';"
    );
  });
});
