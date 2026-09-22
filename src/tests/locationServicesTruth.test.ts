import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  locationSourceLabel,
  accuracyDisplay,
  locationBriefing,
  type CoordsSource,
} from '../utils/locationService';

// Regression guard for zero-fake-success on the geolocation surface. On a GPS
// failure the modal used to seed TACTICAL_PRESETS[0] as the device position,
// persist it, and render it as an "Active Orbital Fix" with ±25m precision.
// None of that was measured — the device had not produced a fix.

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const read = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');

describe('location provenance helpers never present a simulated point as a fix', () => {
  it('labels only a live reading as LIVE GPS', () => {
    expect(locationSourceLabel('live')).toBe('LIVE GPS');
    expect(locationSourceLabel('preset')).toContain('SIMULATED');
    expect(locationSourceLabel('manual')).toContain('MANUAL');
    expect(locationSourceLabel('cache')).toContain('CACHED');
    expect(locationSourceLabel(null)).toBe('NO FIX');
  });

  it('does not print a fabricated accuracy for anything but a live fix', () => {
    expect(accuracyDisplay('live', 12.6)).toBe('±13m');
    expect(accuracyDisplay('preset', 15)).not.toMatch(/±\d/);
    expect(accuracyDisplay('manual', 10)).not.toMatch(/±\d/);
    expect(accuracyDisplay('cache', 25)).not.toMatch(/±\d/);
    expect(accuracyDisplay(null, 25)).not.toMatch(/±\d/);
    for (const source of ['preset', 'manual', 'cache', null] as (CoordsSource | null)[]) {
      expect(accuracyDisplay(source, 25)).toBe('N/A — no GPS fix');
    }
  });

  it('briefs a live fix as a device reading', () => {
    const speech = locationBriefing('live', {
      latitude: 51.5074,
      longitude: -0.1278,
      accuracy: 8,
      placeLabel: 'London, GB',
    });
    expect(speech).toContain('geospatial fix');
    expect(speech).toContain('plus or minus 8 meters');
    expect(speech).not.toContain('no live GPS fix');
  });

  it('briefs a preset/manual/cached point as not a device location reading', () => {
    for (const source of ['preset', 'manual', 'cache', null] as (CoordsSource | null)[]) {
      const speech = locationBriefing(source, {
        latitude: 51.5074,
        longitude: -0.1278,
        accuracy: 25,
        placeLabel: 'London, GB',
      });
      expect(speech).toContain('no live GPS fix');
      expect(speech).toContain('not a device location reading');
      expect(speech).not.toContain('geospatial fix');
      expect(speech).not.toContain('plus or minus');
    }
  });
});

describe('LocationServicesModal does not fabricate a GPS fix', () => {
  const src = read('LocationServicesModal.tsx');

  it('does not seed a tactical preset when geolocation fails', () => {
    expect(src).not.toMatch(/fallbackPreset/);
    expect(src).not.toContain('saveCachedLocation(fallbackCoords');
    // The getCurrentPosition error handler must not set coordinates at all.
    const errStart = src.indexOf('setPermissionError(msg)');
    const errBody = src.slice(errStart, src.indexOf('enableHighAccuracy', errStart));
    expect(errBody).not.toContain('setCoords(');
    expect(errBody).not.toContain('TACTICAL_PRESETS');
  });

  it('does not persist a preset as though it were a real fix', () => {
    const presetFn = src.slice(src.indexOf('handleApplyPreset'));
    const body = presetFn.slice(0, presetFn.indexOf('handleApplyCustomCoords'));
    expect(body).not.toContain('saveCachedLocation');
  });

  it('renders provenance from the shared helpers rather than inline claims', () => {
    expect(src).toContain('locationSourceLabel');
    expect(src).toContain('accuracyDisplay');
    expect(src).toContain('locationBriefing');
  });
});

describe('DashboardMapSnippet does not assert an active fix or measured accuracy', () => {
  const src = read('DashboardMapSnippet.tsx');

  it('never renders a hardcoded ACTIVE POSITION FIX banner', () => {
    expect(src).not.toContain('ACTIVE POSITION FIX');
    // Provenance must come from the shared helper, keyed on the real source.
    expect(src).toContain('locationSourceLabel(source)');
  });

  it('never renders a fabricated ±Nm precision independent of provenance', () => {
    expect(src).not.toMatch(/±\{Math\.round\(coords\.accuracy\)\}m/);
    expect(src).toContain('accuracyDisplay(source, coords.accuracy)');
  });

  it('accepts a source prop and forwards it to every location helper', () => {
    expect(src).toMatch(/source\??:\s*CoordsSource\s*\|\s*null/);
    expect(src).toContain('type CoordsSource');
  });
});

describe('App surfaces the real coordinate provenance to the dashboard snippet', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

  it('tracks userCoordsSource state and updates it only from live GPS', () => {
    expect(src).toContain('userCoordsSource');
    expect(src).toContain('setUserCoordsSource(');
    // The initial state must be cache (or null), never a fabricated 'live'.
    expect(src).toMatch(/loadCachedLocation\(\)\?\.coords\s*\?\s*'cache'\s*:\s*null/);
  });

  it('passes the provenance down to DashboardMapSnippet', () => {
    const idx = src.indexOf('<DashboardMapSnippet');
    const snippet = src.slice(idx, src.indexOf('/>', idx));
    expect(snippet).toContain('source={userCoordsSource}');
  });
});
