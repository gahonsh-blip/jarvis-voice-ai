// HERMES JARVIS — Live GPS watch badge honesty (backlog item 13).
//
// Regression guard for zero-fake-success on the geolocation watch surface.
// `LocationServicesModal.tsx` used to render its green `STREAMING` badge from
// the click intent alone: `toggleLiveWatch()` set `isWatching = true` before
// `watchPosition` reported anything, so an unanswered permission prompt or a
// device with no fix read as a live, streaming position. The badge is now
// derived from the observed watch lifecycle (`watchState`), and `STREAMING` is
// emitted only from inside the success callback.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  liveWatchBadge,
  liveWatchToggleLabel,
  type GeoWatchState,
} from '../utils/hardening/liveGpsWatchTruth';

const SOURCE_PATH = path.resolve(__dirname, '../components/LocationServicesModal.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

describe('liveWatchBadge reports the observed watch lifecycle, never the request', () => {
  it('marks only a streamed device fix as live', () => {
    const streaming = liveWatchBadge('STREAMING');
    expect(streaming.visible).toBe(true);
    expect(streaming.live).toBe(true);
    expect(streaming.label).toBe('STREAMING');
  });

  it('shows an acquiring watch as not yet fixed, never as a live stream', () => {
    const acquiring = liveWatchBadge('ACQUIRING');
    expect(acquiring.visible).toBe(true);
    expect(acquiring.live).toBe(false);
    expect(acquiring.label).not.toBe('STREAMING');
    expect(acquiring.label).toContain('NO FIX');
  });

  it('shows an errored watch as interrupted, not as a live stream', () => {
    const interrupted = liveWatchBadge('INTERRUPTED');
    expect(interrupted.visible).toBe(true);
    expect(interrupted.live).toBe(false);
    expect(interrupted.label).toContain('INTERRUPTED');
  });

  it('renders nothing for an idle or unsupported client', () => {
    for (const state of ['IDLE', 'UNSUPPORTED'] as GeoWatchState[]) {
      const badge = liveWatchBadge(state);
      expect(badge.visible).toBe(false);
      expect(badge.live).toBe(false);
      expect(badge.label).toBe('');
    }
  });

  it('only STREAMING is ever live', () => {
    for (const state of ['IDLE', 'ACQUIRING', 'INTERRUPTED', 'UNSUPPORTED'] as GeoWatchState[]) {
      expect(liveWatchBadge(state).live).toBe(false);
    }
    expect(liveWatchBadge('STREAMING').live).toBe(true);
  });
});

describe('liveWatchToggleLabel', () => {
  it('offers to stop a held watch and start an idle one', () => {
    expect(liveWatchToggleLabel(true)).toBe('Stop Live Tracking');
    expect(liveWatchToggleLabel(false)).toBe('Start Live GPS Watch');
  });
});

describe('LocationServicesModal gates its streaming badge on the observed watch state', () => {
  it('no longer tracks the watch with a bare click-intent boolean', () => {
    expect(source).not.toMatch(/isWatching/);
    expect(source).not.toMatch(/setIsWatching/);
  });

  it('starts the watch in ACQUIRING, not STREAMING', () => {
    const startIdx = source.indexOf("setWatchState('ACQUIRING')");
    const streamIdx = source.indexOf("setWatchState('STREAMING')");
    expect(startIdx).toBeGreaterThan(-1);
    expect(streamIdx).toBeGreaterThan(-1);
    // The ACQUIRING transition happens before the watch is requested; the
    // STREAMING transition happens later, inside the success callback.
    expect(startIdx).toBeLessThan(streamIdx);
  });

  it('renders the badge from liveWatchBadge(watchState)', () => {
    expect(source).toContain('liveWatchBadge(watchState)');
  });

  it('does not initialise the watch as a live/streaming state', () => {
    expect(source).toContain("useState<GeoWatchState>('IDLE')");
    expect(source).not.toMatch(/useState<GeoWatchState>\('STREAMING'\)/);
  });

  it('keeps the badge visible (as interrupted) when the watch errors', () => {
    const errIdx = source.indexOf('Live tracking interrupted:');
    const body = source.slice(errIdx, errIdx + 120);
    expect(body).toContain("setWatchState('INTERRUPTED')");
  });
});
