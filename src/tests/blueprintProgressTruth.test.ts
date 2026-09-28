import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  blueprintProgress,
  blueprintBarWidth,
  blueprintPercentageLabel,
  blueprintProgressLabel,
  blueprintFooterLabel,
  blueprintPhaseCountLabel,
} from '../utils/blueprintTruth';

// Regression guard: the Master Blueprint modal rendered an unmeasured progress
// figure as a measured one. Before the fix, a failed /api/blueprint request left
// `completionPercentage: 0` rendering as "Readiness Progress: 0%" with a filled
// 0%-width bar, and the footer read "0% checklist items ticked" — a measurement
// nobody took. The header also printed a hardcoded "10 (Phase 0 to 9)".

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const read = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');

describe('blueprintProgress never reports an unread figure as measured', () => {
  it('is UNMEASURED with no percentage when the endpoint was not read', () => {
    const p = blueprintProgress(false, 0);
    expect(p.readState).toBe('UNMEASURED');
    expect(p.percentage).toBeNull();
  });

  it('is UNMEASURED even if a plausible value is handed in without a read', () => {
    expect(blueprintProgress(false, 73).percentage).toBeNull();
  });

  it('is MEASURED when a real 0 comes back from a successful read', () => {
    const p = blueprintProgress(true, 0);
    expect(p.readState).toBe('MEASURED');
    expect(p.percentage).toBe(0);
  });

  it('refuses out-of-range or non-numeric values rather than coercing to 0', () => {
    expect(blueprintProgress(true, 140).percentage).toBeNull();
    expect(blueprintProgress(true, -4).percentage).toBeNull();
    expect(blueprintProgress(true, Number.NaN).percentage).toBeNull();
    expect(blueprintProgress(true, undefined).percentage).toBeNull();
    expect(blueprintProgress(true, '80').percentage).toBeNull();
  });
});

describe('blueprint labels say UNKNOWN instead of a fabricated zero', () => {
  const unmeasured = blueprintProgress(false, 0);
  const measuredZero = blueprintProgress(true, 0);
  const measured = blueprintProgress(true, 64);

  it('shows UNKNOWN for the percentage when nothing was read', () => {
    expect(blueprintPercentageLabel(unmeasured)).toBe('UNKNOWN');
    expect(blueprintPercentageLabel(measuredZero)).toBe('0%');
    expect(blueprintPercentageLabel(measured)).toBe('64%');
  });

  it('does not fill the bar or call it a progress figure when unread', () => {
    expect(blueprintBarWidth(unmeasured)).toBe('0%');
    expect(blueprintProgressLabel(unmeasured)).toContain('UNKNOWN');
    expect(blueprintProgressLabel(measured)).toBe('Readiness Progress');
  });

  it('does not assert ticked checklist items when unread', () => {
    expect(blueprintFooterLabel(unmeasured)).toContain('UNKNOWN');
    expect(blueprintFooterLabel(unmeasured)).not.toMatch(/\d+% checklist/);
    expect(blueprintFooterLabel(measured)).toContain('64% checklist items ticked');
  });

  it('phase count is UNKNOWN until read, never the hardcoded 10', () => {
    expect(blueprintPhaseCountLabel(false, 10)).toBe('TOTAL PHASES: UNKNOWN');
    expect(blueprintPhaseCountLabel(true, 10)).toBe('TOTAL PHASES: 10');
    expect(blueprintPhaseCountLabel(true, 0)).toBe('TOTAL PHASES: UNKNOWN');
    expect(blueprintPhaseCountLabel(true, undefined)).toBe('TOTAL PHASES: UNKNOWN');
  });
});

describe('BlueprintRoadmapModal is wired to the truth helpers', () => {
  it('renders via blueprintTruth rather than raw stats percentages', () => {
    const src = read('BlueprintRoadmapModal.tsx');
    expect(src).toContain('blueprintProgress');
    expect(src).toContain('blueprintPercentageLabel');
    expect(src).toContain('blueprintFooterLabel');
    expect(src).toContain('blueprintPhaseCountLabel');
    expect(src).not.toContain('10 (Phase 0 to 9)');
    expect(src).not.toMatch(/stats\.completionPercentage}%/);
  });
});
