import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The HUD header is the always-visible strip at the top of the app, and it
// carries the only global Kill Switch control. It seeded `isKillSwitchActive`
// to `false` and swallowed a failed /api/emergency/status fetch, so a header
// that could not reach the backend rendered a normal, non-emergency control
// surface and a "KILL SWITCH" button — an unqueried state presented as a safe
// one. Same defect class already fixed on the Permission Gateway and the
// Autonomous Tools Hub. These guards pin the tri-state wiring.

const HUD_SRC = fs.readFileSync(
  path.resolve(__dirname, '../components/HUDHeader.tsx'),
  'utf8',
);

describe('HUDHeader renders an unknown kill-switch state honestly', () => {
  it('seeds the emergency state as null, not as a fabricated released state', () => {
    expect(HUD_SRC).toContain('useState<EmergencyStatusShape | null>(null)');
    expect(HUD_SRC).not.toContain('isKillSwitchActive, setIsKillSwitchActive');
  });

  it('derives the switch position from the shared tri-state helper', () => {
    expect(HUD_SRC).toContain('emergencyLiveness(emergency)');
    expect(HUD_SRC).toContain('emergencyStatusKnown(emergency)');
    expect(HUD_SRC).toContain('emergencyLivenessLabel(liveness)');
    // No render path may flip a local boolean straight to "released".
    expect(HUD_SRC).not.toContain('setIsKillSwitchActive(false)');
    expect(HUD_SRC).not.toContain('setIsKillSwitchActive(true)');
  });

  it('fails the status fetch closed rather than leaving the last-known state', () => {
    expect(HUD_SRC).toContain("if (!res.ok) throw new Error(`HTTP ${res.status}`)");
    expect(HUD_SRC).toContain('setEmergency(null)');
  });

  it('adopts a post-toggle position only when the response confirmed it', () => {
    expect(HUD_SRC).toContain(
      'setEmergency(emergencyStatusKnown(data.emergencyState) ? data.emergencyState : null)',
    );
  });

  it('renders an explicit unknown banner and no armed action while unknown', () => {
    expect(HUD_SRC).toContain('killSwitchUnknown');
    expect(HUD_SRC).toContain('EMERGENCY STOP STATUS UNKNOWN');
  });
});
