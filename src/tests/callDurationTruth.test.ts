// HERMES JARVIS — telephony call-duration honesty.
//
// `App.tsx` finalised calls with `Math.max(activeCall.durationSeconds || 14, 14)`.
// Because the record's counter is never advanced (the only live counter lives in
// ActiveCallHUD's local state), that expression was a constant 14: every call —
// even one hung up immediately — was persisted and displayed as lasting at least
// 14 seconds. The call history, the post-call summary, and the CSV export all
// read that invented number.
//
// These tests pin the replacement: a duration is the measured start/end gap, or
// the stored measured count, or it is reported as not recorded. They also read
// App.tsx's source to prove the fabricated floor is gone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  elapsedSecondsSince,
  recordedCallDurationSeconds,
  formatDurationClock,
  formatDurationWords,
  DURATION_NOT_RECORDED,
} from '../utils/hardening/callDurationTruth';

const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const appFlat = appSource.replace(/\s+/g, ' ');

describe('elapsedSecondsSince measures the real gap', () => {
  it('measures a whole-second gap between two timestamps', () => {
    expect(elapsedSecondsSince('2026-10-05T10:00:00.000Z', '2026-10-05T10:00:25.000Z')).toBe(25);
  });

  it('reports a zero-length call as 0, not as a floor', () => {
    expect(elapsedSecondsSince('2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00.400Z')).toBe(0);
  });

  it('returns null when a timestamp is missing or unparseable', () => {
    expect(elapsedSecondsSince(undefined, '2026-10-05T10:00:25.000Z')).toBeNull();
    expect(elapsedSecondsSince('not-a-date', '2026-10-05T10:00:25.000Z')).toBeNull();
  });

  it('returns null when the end precedes the start', () => {
    expect(elapsedSecondsSince('2026-10-05T10:00:25.000Z', '2026-10-05T10:00:00.000Z')).toBeNull();
  });
});

describe('recordedCallDurationSeconds never invents a value', () => {
  it('prefers a stored measured count', () => {
    expect(recordedCallDurationSeconds({ durationSeconds: 42, startTime: '2026-10-05T10:00:00Z', endTime: '2026-10-05T10:00:99Z' })).toBe(42);
  });

  it('falls back to the timestamp gap when no count is stored', () => {
    expect(recordedCallDurationSeconds({ startTime: '2026-10-05T10:00:00.000Z', endTime: '2026-10-05T10:01:30.000Z' })).toBe(90);
  });

  it('reports null (not 0, not 14) when nothing was measured', () => {
    expect(recordedCallDurationSeconds({})).toBeNull();
    expect(recordedCallDurationSeconds({ durationSeconds: null })).toBeNull();
  });
});

describe('formatters name an unmeasured duration honestly', () => {
  it('renders --:-- and "not recorded" rather than a fabricated zero', () => {
    expect(formatDurationClock(null)).toBe('--:--');
    expect(formatDurationWords(null)).toBe(DURATION_NOT_RECORDED);
  });

  it('renders a measured duration normally', () => {
    expect(formatDurationClock(65)).toBe('01:05');
    expect(formatDurationWords(145)).toBe('2m 25s');
    expect(formatDurationClock(0)).toBe('00:00');
  });
});

describe('App.tsx no longer fabricates a call-duration floor', () => {
  it('does not contain the constant 14-second duration floor', () => {
    expect(appFlat).not.toMatch(/Math\.max\(\s*activeCall\.durationSeconds\s*\|\|\s*14\s*,\s*14\s*\)/);
  });

  it('measures the ended call from its start timestamp and records an end time', () => {
    expect(appFlat).toMatch(/durationSeconds:\s*measuredDuration/);
    expect(appFlat).toMatch(/elapsedSecondsSince\(activeCall\.startTime,\s*endedAt\)/);
    expect(appFlat).toMatch(/endTime:\s*endedAt/);
  });
});
