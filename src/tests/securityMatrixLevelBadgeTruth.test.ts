import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { securityMatrixLevelBadge } from '../utils/hardening/securityMatrixTruth';

// Backlog item 13 (Zero-fake-success). The Security Matrix modal header carried
// `Level {activeLevel} Active`, where `activeLevel` was seeded to the literal
// `2`. On a load where `/api/security` never answered, the badge still drew
// "Level 2 Active" — directly contradicting the footer, which already stated
// the security state was unavailable. These tests pin the honest helper and the
// wiring that feeds it only an observed / durably-confirmed level.
describe('security matrix level badge truth', () => {
  it('reports only a level the probe actually returned', () => {
    expect(securityMatrixLevelBadge(1)).toBe('Level 1 Active');
    expect(securityMatrixLevelBadge(4)).toBe('Level 4 Active');
  });

  it('states unknown instead of asserting a level that was never observed', () => {
    for (const state of [null, undefined]) {
      expect(securityMatrixLevelBadge(state)).toContain('UNKNOWN');
      expect(securityMatrixLevelBadge(state)).not.toContain('Active');
    }
  });
});

describe('SecurityMatrixModal derives its level badge from an observed reading', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/SecurityMatrixModal.tsx'),
    'utf8',
  );

  it('no longer seeds the active level with a literal', () => {
    expect(src).not.toMatch(/useState<1 \| 2 \| 3 \| 4>\(2\)/);
    expect(src).not.toMatch(/Level \{activeLevel\} Active/);
  });

  it('renders the badge from the helper keyed on the observed level', () => {
    expect(src).toContain('securityMatrixLevelBadge(activeLevel)');
    expect(src).toContain('useState<SecurityLevel | null>(null)');
  });

  it('checks res.ok and adopts only the confirmed echoed level on update', () => {
    expect(src).toContain('if (!res.ok) throw new Error(`HTTP ${res.status}`)');
    expect(src).toContain('typeof data.securityState?.currentLevel === \'number\'');
  });

  it('resyncs to the server on a rejected or failed update instead of keeping the request', () => {
    // Both update handlers must fall back to a fresh read, and the catch blocks
    // must not leave a rejected level asserted on screen.
    const catchResyncs = src.match(/await fetchSecurity\(\);/g) ?? [];
    expect(catchResyncs.length).toBeGreaterThanOrEqual(4);
  });
});
