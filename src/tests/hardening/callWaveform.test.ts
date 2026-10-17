import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { callWaveformBars, callWaveformBarHeight } from '../../utils/hardening/callWaveform';

// ActiveCallHUD sized its "Audio Waveform Bars" from Math.random() on every
// render, so the strip moved like live call audio while measuring nothing.
const hudSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/ActiveCallHUD.tsx'),
  'utf8',
);

describe('the call level bars are a fixed profile, not a fake measurement', () => {
  it('returns the profile height for each bar', () => {
    callWaveformBars.forEach((h, i) => {
      expect(callWaveformBarHeight(i)).toBe(h);
    });
  });

  it('is deterministic across calls', () => {
    expect(callWaveformBarHeight(2)).toBe(callWaveformBarHeight(2));
  });

  it('falls back to the first bar for an index outside the profile', () => {
    expect(callWaveformBarHeight(-1)).toBe(callWaveformBars[0]);
    expect(callWaveformBarHeight(99)).toBe(callWaveformBars[0]);
    expect(callWaveformBarHeight(1.5)).toBe(callWaveformBars[0]);
  });

  it('the HUD no longer sizes a bar from a random number', () => {
    expect(hudSource).not.toContain('Math.floor(Math.random() * 16 + 4)');
    expect(hudSource).toContain('callWaveformBarHeight(i)');
  });
});
