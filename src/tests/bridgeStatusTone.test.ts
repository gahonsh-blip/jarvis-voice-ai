import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bridgeStatusTone } from '../utils/mobileBridgeEngine';
import type { AndroidBridgeStatus } from '../types/mobileBridge';

// Regression guard for item 13 (zero fake success) on the mobile-bridge surface.
//
// MobileBridgeModal rendered its header badge green whenever the status was
// CONNECTED *or* PERMISSION_REQUIRED *or* LIMITED_CAPABILITY — so a device that
// had been downgraded (no permissions / limited capability) still showed a green
// "connected" badge. Green now means CONNECTED and nothing else.

describe('bridgeStatusTone never promotes a non-connected bridge to "live"', () => {
  it('reports CONNECTED as live', () => {
    expect(bridgeStatusTone('CONNECTED')).toBe('live');
  });

  it.each(['PARTIALLY_CONNECTED', 'LIMITED_CAPABILITY', 'PERMISSION_REQUIRED'] as const)(
    'reports the degraded status %s as degraded, never live',
    (status) => {
      expect(bridgeStatusTone(status)).toBe('degraded');
    }
  );

  it.each(['MOBILE_NOT_CONNECTED', 'ERROR'] as const)(
    'reports the inactive status %s as inactive',
    (status) => {
      expect(bridgeStatusTone(status)).toBe('inactive');
    }
  );

  it('treats an unrecognised status as inactive rather than live', () => {
    expect(bridgeStatusTone('SOMETHING_NEW')).toBe('inactive');
    expect(bridgeStatusTone('')).toBe('inactive');
  });

  it('is live for exactly one status out of the whole union', () => {
    const all: AndroidBridgeStatus[] = [
      'MOBILE_NOT_CONNECTED',
      'PERMISSION_REQUIRED',
      'PARTIALLY_CONNECTED',
      'CONNECTED',
      'LIMITED_CAPABILITY',
      'ERROR',
    ];
    const live = all.filter((s) => bridgeStatusTone(s) === 'live');
    expect(live).toEqual(['CONNECTED']);
  });
});

describe('MobileBridgeModal renders green only for a live bridge', () => {
  const src = fs
    .readFileSync(path.resolve(process.cwd(), 'src/components/MobileBridgeModal.tsx'), 'utf8')
    .replace(/\s+/g, ' ');

  it('delegates the badge tone to the shared helper', () => {
    expect(src).toContain('bridgeStatusTone(bridgeState)');
  });

  it('no longer treats PERMISSION_REQUIRED or LIMITED_CAPABILITY as connected', () => {
    // The old `bridgeConnected` expression is gone.
    expect(src).not.toContain('bridgeConnected');
    expect(src).not.toMatch(/bridgeState === 'PERMISSION_REQUIRED'/);
    expect(src).not.toMatch(/bridgeState === 'LIMITED_CAPABILITY'/);
  });

  it('gates the green badge class on the live tone only', () => {
    // The bridge header badge is the only element that uses the three-tone
    // ternary; green there requires the live tone.
    expect(src).toContain("bridgeTone === 'live' ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/40'");
    expect(src).toContain("bridgeTone === 'degraded' ? 'bg-amber-900/60");
  });
});
