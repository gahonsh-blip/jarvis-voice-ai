import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { micInputLevel } from '../../utils/hardening/micInputTruth';

// App.tsx renders through React and reads `window`/`navigator`, so the wiring
// assertion reads the source text, matching the convention in syncTruth.test.ts.
const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('the voice visualiser renders only a measured input level', () => {
  it('returns a real measured level unchanged', () => {
    expect(micInputLevel(0)).toBe(0);
    expect(micInputLevel(37)).toBe(37);
    expect(micInputLevel(100)).toBe(100);
  });

  it('clamps an out-of-range measurement instead of letting it scale the ring', () => {
    expect(micInputLevel(-20)).toBe(0);
    expect(micInputLevel(148)).toBe(100);
  });

  it('renders a neutral level when nothing was measured', () => {
    expect(micInputLevel(null)).toBe(0);
    expect(micInputLevel(undefined)).toBe(0);
    expect(micInputLevel(NaN)).toBe(0);
    expect(micInputLevel(Infinity)).toBe(0);
    expect(micInputLevel('52')).toBe(0);
  });

  it('the voice path does not fabricate an input level from a random number', () => {
    expect(appSource).not.toContain('20 + Math.random() * 60');
    expect(appSource).toContain('setVolumeLevel(micInputLevel(null))');
  });
});
