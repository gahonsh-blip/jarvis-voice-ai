// HERMES JARVIS — emergency-toggle route honesty.
//
// `POST /api/emergency/toggle` drove the flag-*flipping* `toggleEmergencyStop`,
// then unconditionally answered `{ success: true }` and wrote a
// "EMERGENCY STOP ACTIVATED/DEACTIVATED … VERIFIED" audit row plus a Telegram
// notice. So a second "stop" RELEASED the freeze while the audit row claimed it
// had just been activated — a false success in the unsafe direction. The route
// now derives the transition from the pre-transition state via
// `emergencyTogglePreAction`; an unsupported transition is a reported no-op.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { emergencyTogglePreAction } from '../utils/emergencyTruth';

describe('emergencyTogglePreAction only flips when the pre-state supports it', () => {
  it('a first stop flips the flag to engage the freeze', () => {
    const gate = emergencyTogglePreAction('stop', { emergencyPaused: false });
    expect(gate.flip).toBe(true);
  });

  it('a repeated stop does NOT flip (a flip would release the freeze)', () => {
    const gate = emergencyTogglePreAction('stop', { emergencyPaused: true });
    expect(gate.flip).toBe(false);
  });

  it('a real resume flips the flag to release the freeze', () => {
    const gate = emergencyTogglePreAction('resume', { emergencyPaused: true });
    expect(gate.flip).toBe(true);
  });

  it('a resume while nothing is paused does NOT flip (a flip would engage it)', () => {
    const gate = emergencyTogglePreAction('resume', { emergencyPaused: false });
    expect(gate.flip).toBe(false);
  });

  it('a latched hard kill switch blocks both directions from flipping', () => {
    expect(emergencyTogglePreAction('stop', { emergencyPaused: false, hardKillSwitchTriggered: true }).flip).toBe(false);
    expect(emergencyTogglePreAction('resume', { emergencyPaused: true, hardKillSwitchTriggered: true }).flip).toBe(false);
  });

  it('an unobserved state never flips', () => {
    for (const pre of [null, undefined, {}]) {
      expect(emergencyTogglePreAction('stop', pre).flip).toBe(false);
      expect(emergencyTogglePreAction('resume', pre).flip).toBe(false);
    }
  });
});

describe('the toggle route reports and audits only a real transition', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/emergency/toggle'"));
  const body = route.slice(0, route.indexOf('// Global Kill Switch API'));

  it('derives the verdict and the flip gate from the pre-transition state', () => {
    expect(body).toContain('emergencyTogglePreAction(');
    expect(body).toContain('emergencyToggleVerdict(');
    expect(body).toContain('const pre = getEmergencyState()');
  });

  it('returns success:false without logging or notifying when nothing changed', () => {
    expect(body).toContain('if (!verdict.actionExecuted)');
    expect(body).toContain('success: false');
    expect(body).toContain('actionExecuted: false');
    // The early return must sit before any audit row, telegram notice, or flip.
    const guard = body.indexOf('if (!verdict.actionExecuted)');
    expect(guard).toBeLessThan(body.indexOf('EMERGENCY STOP ACTIVATED by'));
    expect(guard).toBeLessThan(body.indexOf('sendRealTelegramMessage('));
    expect(guard).toBeLessThan(body.indexOf('toggleEmergencyStop(requestedBy'));
  });

  it('no longer answers an unconditional bare success containing only the flipped state', () => {
    expect(body).not.toContain("res.json({ success: true, ...updated })");
  });
});
