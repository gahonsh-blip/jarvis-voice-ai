import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  emergencyLiveness,
  emergencyLivenessLabel,
  emergencyStatusKnown,
  emergencyEngaged,
} from '../utils/emergencyTruth';

// The Permission Gateway header used to render a fixed green "ACTIVE" badge for
// every state that was not paused — including the state where
// /api/emergency/status had never answered. That asserted the Level 4
// interceptor was armed on the strength of a value nobody had fetched. These
// tests pin the tri-state and the fail-closed UI wiring.

describe('emergencyLiveness never reports an unobserved state as ACTIVE', () => {
  it('is UNKNOWN for null, undefined, and a status without the boolean', () => {
    expect(emergencyLiveness(null)).toBe('UNKNOWN');
    expect(emergencyLiveness(undefined)).toBe('UNKNOWN');
    expect(emergencyLiveness({})).toBe('UNKNOWN');
    expect(emergencyLiveness({ hardKillSwitchTriggered: true })).toBe('UNKNOWN');
  });

  it('is ACTIVE only for an observed, released switch', () => {
    expect(emergencyLiveness({ emergencyPaused: false })).toBe('ACTIVE');
    expect(emergencyLiveness({ emergencyPaused: false, hardKillSwitchTriggered: false })).toBe('ACTIVE');
  });

  it('is ENGAGED for a paused gate or an engaged hard kill switch', () => {
    expect(emergencyLiveness({ emergencyPaused: true })).toBe('ENGAGED');
    expect(emergencyLiveness({ emergencyPaused: false, hardKillSwitchTriggered: true })).toBe('ENGAGED');
  });

  it('confirms a status only when a real boolean was observed', () => {
    expect(emergencyStatusKnown(null)).toBe(false);
    expect(emergencyStatusKnown({})).toBe(false);
    expect(emergencyStatusKnown({ emergencyPaused: false })).toBe(true);
  });

  it('treats unobserved status as not-engaged but not as safe', () => {
    expect(emergencyEngaged(null)).toBe(false);
    expect(emergencyLiveness(null)).not.toBe('ACTIVE');
  });

  it('labels every state without ever printing a bare ACTIVE for UNKNOWN', () => {
    expect(emergencyLivenessLabel('ENGAGED')).toBe('EMERGENCY STOP');
    expect(emergencyLivenessLabel('ACTIVE')).toBe('ACTIVE');
    expect(emergencyLivenessLabel('UNKNOWN')).toContain('UNKNOWN');
  });
});

describe('PermissionGateway renders an unknown kill-switch state honestly', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/PermissionGateway.tsx'),
    'utf8',
  );

  it('seeds the emergency state as null, not as a fabricated released state', () => {
    expect(src).toContain('useState<EmergencyControlState | null>(null)');
    expect(src).not.toContain('useState<EmergencyControlState>({ emergencyPaused: false })');
  });

  it('derives its badge and approval guard from the tri-state helper', () => {
    expect(src).toContain('emergencyLiveness(emergency)');
    expect(src).toContain('emergencyStatusKnown(emergency)');
    expect(src).toContain('approvalBlocked');
    // No render path may read the raw paused flag directly.
    expect(src).not.toContain('emergency.emergencyPaused');
  });

  it('fails the approval closed while the status is unknown', () => {
    expect(src).toContain("if (!statusKnown)");
    expect(src).toContain('Approving is blocked until it is confirmed');
  });
});
