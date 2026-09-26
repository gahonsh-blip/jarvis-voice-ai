import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  operatorTaskExecuted,
  operatorTaskSummary,
  fixProjectErrorReply,
  screenInspectionExecuted,
  screenInspectionReply,
} from '../utils/computerOperator/operatorReplyTruth';
import type {
  ComputerOperatorTask,
  ScreenObservation,
} from '../types/computerOperator';

// Regression guard for the two `/api/chat` operator intents that used to speak
// unqualified success regardless of what the engine returned:
//  - `fix_project_error` answered "applied surgical fix, and verified test
//    suite" and set `actionExecuted = true` even for a SIMULATION_ONLY or FAILED
//    run;
//  - `inspect_screen` narrated a confident "Screen showing ..." summary against
//    a host desktop that was never observed.
// The helpers below derive both the reply and the executed flag from the task
// status and the observation provenance that were actually returned.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

function task(overrides: Partial<ComputerOperatorTask>): ComputerOperatorTask {
  return {
    taskId: 't1',
    objective: 'fix the error',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    intentClass: 'COMPUTER_OPERATION',
    mode: 'hybrid',
    status: 'COMPLETED',
    streamEvents: [],
    ...overrides,
  };
}

function observation(overrides: Partial<ScreenObservation>): ScreenObservation {
  return {
    id: 'obs1',
    timestamp: new Date(0).toISOString(),
    activeWindow: 'VS Code',
    activeApplication: 'VS Code',
    windowTitle: 'server.ts',
    visibleElements: [],
    detectedErrors: [],
    screenResolution: { width: 1920, height: 1080 },
    isAmbiguous: false,
    platform: 'linux',
    ...overrides,
  };
}

describe('operatorTaskExecuted only reports real host work', () => {
  it('is true only for a COMPLETED task', () => {
    expect(operatorTaskExecuted(task({ status: 'COMPLETED' }))).toBe(true);
    expect(operatorTaskExecuted(task({ status: 'FAILED' }))).toBe(false);
    expect(operatorTaskExecuted(task({ status: 'BLOCKED' }))).toBe(false);
    expect(operatorTaskExecuted(task({ status: 'NEEDS_APPROVAL' }))).toBe(false);
    expect(operatorTaskExecuted(task({ status: 'CANCELLED' }))).toBe(false);
    expect(operatorTaskExecuted(null)).toBe(false);
  });
});

describe('fixProjectErrorReply never invents a verified fix', () => {
  it('speaks the engine summary only for a completed task', () => {
    const summary = 'Task completed: "fix the error". All 3 step(s) executed and verified against the host desktop.';
    const reply = fixProjectErrorReply(task({ status: 'COMPLETED', resultSummary: summary }), false);
    expect(reply).toBe(summary);
  });

  it('does not speak a SIMULATION_ONLY run as a successful fix', () => {
    const simulation =
      'SIMULATION_ONLY: task "fix the error" ran through all 3 step(s) against the illustrative screen view. No host desktop was observed, so execution was not visually verified.';
    const reply = fixProjectErrorReply(task({ status: 'COMPLETED', resultSummary: simulation }), false);
    // A COMPLETED task with a summary is reported verbatim — and that summary
    // itself states no host verification happened.
    expect(reply).toContain('SIMULATION_ONLY');
  });

  it('reports a failed task as not completed instead of claiming a fix', () => {
    const reply = fixProjectErrorReply(
      task({ status: 'FAILED', error: 'host action executor unavailable' }),
      false
    );
    expect(reply).toContain('did not complete');
    expect(reply).toContain('host action executor unavailable');
    expect(reply).not.toMatch(/verified test suite/i);
  });

  it('reports a held task as awaiting approval rather than executed', () => {
    const reply = fixProjectErrorReply(task({ status: 'NEEDS_APPROVAL' }), false);
    expect(reply).toContain('held for your approval');
  });

  it('handles a null task without asserting a fix', () => {
    const reply = fixProjectErrorReply(null, false);
    expect(reply).toContain('did not complete');
  });

  it('the server no longer hardcodes the surgical-fix success line', () => {
    expect(flat).not.toContain('applied surgical fix, and verified test suite');
    expect(flat).not.toContain('स्क्रीन का विश्लेषण करके समस्या का समाधान कर दिया गया है');
  });
});

describe('screenInspectionExecuted requires a real, non-ambiguous observation', () => {
  it('is true only for a host-backed, non-ambiguous observation', () => {
    expect(screenInspectionExecuted(observation({}), true)).toBe(true);
  });

  it('is false when the host is not backed', () => {
    expect(screenInspectionExecuted(observation({}), false)).toBe(false);
  });

  it('is false for an ambiguous observation', () => {
    expect(
      screenInspectionExecuted(observation({ isAmbiguous: true, ambiguityReason: 'no desktop' }), true)
    ).toBe(false);
  });

  it('is false for a missing observation', () => {
    expect(screenInspectionExecuted(null, true)).toBe(false);
  });
});

describe('screenInspectionReply withholds an unobserved screen claim', () => {
  const interpretation = {
    summary: 'Screen showing "VS Code" (server.ts). 4 interactive UI elements detected. No visible errors.',
    summaryHi: 'स्क्रीन पर "VS Code" खुला हुआ है (server.ts)।',
  };

  it('speaks the interpretation when the host was observed', () => {
    const reply = screenInspectionReply(observation({}), interpretation, false, true);
    expect(reply).toBe(interpretation.summary);
  });

  it('does not speak a screen summary when the host was not backed', () => {
    const reply = screenInspectionReply(observation({}), interpretation, false, false);
    expect(reply).not.toContain('Screen showing');
    expect(reply).toContain('could not be observed');
  });

  it('does not speak a screen summary for an ambiguous observation', () => {
    const reply = screenInspectionReply(
      observation({ isAmbiguous: true, ambiguityReason: 'no desktop' }),
      interpretation,
      false,
      true
    );
    expect(reply).not.toContain('Screen showing');
    expect(reply).toContain('could not be observed');
  });
});

describe('operatorTaskSummary is redaction-safe passthrough', () => {
  it('prefers the Hindi summary when asked for Hindi', () => {
    const t = task({ resultSummary: 'EN', resultSummaryHi: 'HI' });
    expect(operatorTaskSummary(t, true)).toBe('HI');
    expect(operatorTaskSummary(t, false)).toBe('EN');
  });

  it('falls back to English when no Hindi summary exists', () => {
    const t = task({ resultSummary: 'EN' });
    expect(operatorTaskSummary(t, true)).toBe('EN');
  });
});
