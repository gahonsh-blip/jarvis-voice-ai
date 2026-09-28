import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  syncLiveness,
  syncStatusLabel,
  reconnectStatusText,
} from '../utils/syncTruth';

// Regression guard for zero-fake-success on the HUD sync pill. The pill used to
// key off `navigator.onLine` alone (defaulted to true when unknown) and printed
// green "SYNCED" whenever the browser thought it had a network path — even with
// the JARVIS backend unreachable. SYNCED is a claim about the backend, so it may
// only appear when the backend was actually observed to answer.

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const read = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');

describe('syncLiveness never claims SYNCED without an observed backend', () => {
  it('is SYNCED only when the browser is online and the backend answered', () => {
    expect(syncLiveness({ browserOnline: true, serverReachable: true })).toBe('SYNCED');
  });

  it('is LOCAL_ONLY when online but the backend never answered', () => {
    expect(syncLiveness({ browserOnline: true, serverReachable: false })).toBe('LOCAL_ONLY');
    expect(syncLiveness({ browserOnline: true, serverReachable: null })).toBe('LOCAL_ONLY');
    expect(syncLiveness({ browserOnline: true, serverReachable: undefined })).toBe('LOCAL_ONLY');
  });

  it('is OFFLINE_READY whenever the browser is offline, regardless of backend state', () => {
    expect(syncLiveness({ browserOnline: false, serverReachable: true })).toBe('OFFLINE_READY');
    expect(syncLiveness({ browserOnline: false, serverReachable: false })).toBe('OFFLINE_READY');
    expect(syncLiveness({ browserOnline: null, serverReachable: null })).toBe('OFFLINE_READY');
  });

  it('never prints the word SYNCED outside the SYNCED state', () => {
    for (const liveness of ['OFFLINE_READY', 'LOCAL_ONLY'] as const) {
      expect(syncStatusLabel(liveness)).not.toContain('SYNCED');
    }
    expect(syncStatusLabel('SYNCED')).toBe('SYNCED');
  });

  it('only claims a backend reconnect once a probe succeeded', () => {
    expect(reconnectStatusText(true)).toBe('BACKEND RECONNECTED');
    expect(reconnectStatusText(false)).not.toContain('RECONNECTED');
    expect(reconnectStatusText(false)).toContain('NOT REACHABLE');
  });
});

describe('HUDHeader sync pill is driven by observed liveness, not navigator.onLine', () => {
  const src = read('HUDHeader.tsx');

  it('has no isOnline prop or navigator-derived default', () => {
    expect(src).not.toContain('isOnline');
    expect(src).not.toContain('navigator.onLine');
  });

  it('renders the pill from syncLiveness', () => {
    expect(src).toContain('syncLiveness');
    expect(src).toContain('syncStatusLabel');
  });

  it('defaults to a non-SYNCED liveness when the caller supplies none', () => {
    expect(src).toMatch(/syncLiveness\s*=\s*'OFFLINE_READY'/);
  });
});

describe('App passes observed liveness to HUDHeader', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../App.tsx'),
    'utf8',
  );

  it('passes syncLiveness derived from browser + server observations', () => {
    const idx = src.indexOf('<HUDHeader');
    const header = src.slice(idx, src.indexOf('/>', idx));
    expect(header).toContain(
      'syncLiveness={syncLiveness({ browserOnline: isOnline, serverReachable })}',
    );
    expect(header).not.toContain('isOnline={isOnline}');
  });
});
