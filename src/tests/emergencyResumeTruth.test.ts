// HERMES JARVIS — resume-transition honesty.
//
// `POST /api/system/resume` used to answer `success: true` and write a
// "SYSTEM RESUMED … VERIFIED" audit row unconditionally, so a resume while
// nothing was frozen — or while a latched hard kill switch still held autonomy
// frozen — still read as released autonomy. A false success in the unsafe
// direction: the operator believes autonomy resumed when it did not.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { emergencyResumeVerdict } from '../utils/emergencyTruth';

describe('emergencyResumeVerdict only claims a release the pre-state supports', () => {
  it('releases only when the pre-state shows an engaged pause', () => {
    const v = emergencyResumeVerdict({ emergencyPaused: true });
    expect(v.actionExecuted).toBe(true);
    expect(v.outcome).toBe('RESUMED');
  });

  it('does not claim a release when nothing was paused', () => {
    const v = emergencyResumeVerdict({ emergencyPaused: false });
    expect(v.actionExecuted).toBe(false);
    expect(v.outcome).toBe('ALREADY_ACTIVE');
    expect(v.message).not.toMatch(/resumed successfully/i);
  });

  it('does not claim a release while the hard kill switch is latched', () => {
    const v = emergencyResumeVerdict({ emergencyPaused: true, hardKillSwitchTriggered: true });
    expect(v.actionExecuted).toBe(false);
    expect(v.outcome).toBe('LATCHED');
    expect(v.message).toMatch(/latched/i);
  });

  it('treats an unobserved state as UNKNOWN, never a release', () => {
    for (const pre of [null, undefined, {}]) {
      const v = emergencyResumeVerdict(pre);
      expect(v.actionExecuted).toBe(false);
      expect(v.outcome).toBe('UNKNOWN');
    }
  });
});

describe('the resume route only reports/audits a real release', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');

  it('derives the verdict from the pre-transition state', () => {
    expect(src).toContain('emergencyResumeVerdict(getEmergencyState())');
  });

  it('returns success:false without the resumed audit row when nothing was released', () => {
    const route = src.slice(src.indexOf("app.post('/api/system/resume'"));
    const body = route.slice(0, route.indexOf('// Approvals & Action Requests Registry'));
    expect(body).toContain('if (!verdict.actionExecuted)');
    expect(body).toContain('success: false');
    // The resumed audit row must sit after the early return, not before it.
    expect(body.indexOf('if (!verdict.actionExecuted)')).toBeLessThan(
      body.indexOf('SYSTEM RESUMED by'),
    );
  });

  it('only calls resumeSystemOperation once the release is confirmed', () => {
    const route = src.slice(src.indexOf("app.post('/api/system/resume'"));
    const body = route.slice(0, route.indexOf('// Approvals & Action Requests Registry'));
    expect(body.indexOf('emergencyResumeVerdict')).toBeLessThan(
      body.indexOf('resumeSystemOperation(requestedBy)'),
    );
  });
});
