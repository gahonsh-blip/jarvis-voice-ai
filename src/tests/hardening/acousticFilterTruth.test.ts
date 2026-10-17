import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACOUSTIC_FILTER_STATUS,
  ACOUSTIC_FILTER_LABEL,
  ACOUSTIC_FILTER_SPEC,
  acousticFilterToggleLabel,
} from '../../utils/hardening/acousticFilterTruth';

// The call HUD labelled the toggle "3G Filter" and "300-3400Hz ON" while the
// bandpass node it configured was never connected to any audio path.
const hudSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/ActiveCallHUD.tsx'),
  'utf8',
);
const hubSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/TelephonyHubModal.tsx'),
  'utf8',
);

describe('acoustic filter truth strings never claim an applied filter', () => {
  it('reports the bandpass as not applied', () => {
    expect(ACOUSTIC_FILTER_STATUS).toBe('BANDPASS_NOT_APPLIED');
    expect(ACOUSTIC_FILTER_LABEL).toMatch(/not applied/i);
    expect(ACOUSTIC_FILTER_SPEC).toMatch(/not applied/i);
  });

  it('does not use an "ON" state or a cellular-generation label', () => {
    for (const s of [ACOUSTIC_FILTER_STATUS, ACOUSTIC_FILTER_LABEL, ACOUSTIC_FILTER_SPEC]) {
      expect(s).not.toMatch(/\bON\b/);
      expect(s).not.toMatch(/3G/);
    }
  });
});

describe('the call HUD no longer labels the filter as an active effect', () => {
  it('does not render the "3G Filter" / "HD Voice" generation labels', () => {
    expect(hudSource).not.toContain("'3G Filter'");
    expect(hudSource).not.toContain("'HD Voice'");
  });

  it('does not title the button as a filter it is applying', () => {
    expect(hudSource).not.toContain('Toggle Telephone Acoustic Bandpass Filter (300-3400Hz)');
    expect(hudSource).toContain('ACOUSTIC_FILTER_LABEL');
  });

  it('does not render a bare "Bandpass profile" / "Full band" effect label', () => {
    // The toggle flips only a disconnected synthesizer node; a bare "Bandpass
    // profile" (or "Full band") reads as an applied/effect state. Both branches
    // must carry the not-on-call-audio qualifier via acousticFilterToggleLabel.
    expect(hudSource).not.toContain("'Bandpass profile'");
    expect(hudSource).not.toContain("'Full band'");
    expect(hudSource).toContain('acousticFilterToggleLabel(audioFilterActive)');
  });
});

describe('acousticFilterToggleLabel never claims an applied filter', () => {
  it('qualifies both toggle states as not on call audio', () => {
    for (const state of [true, false]) {
      const label = acousticFilterToggleLabel(state);
      expect(label).toMatch(/not on call audio/i);
      expect(label).not.toMatch(/\bON\b/);
      expect(label).not.toMatch(/3G/);
    }
  });

  it('still distinguishes configured from off', () => {
    expect(acousticFilterToggleLabel(true)).toMatch(/configured/i);
    expect(acousticFilterToggleLabel(false)).toMatch(/off/i);
  });
});

describe('the telephony hub no longer shows the filter as ON', () => {
  it('does not render a "300-3400Hz ON" status', () => {
    expect(hubSource).not.toContain('300-3400Hz ON');
  });

  it('renders the honest not-applied status', () => {
    expect(hubSource).toContain('ACOUSTIC_FILTER_STATUS');
  });
});
