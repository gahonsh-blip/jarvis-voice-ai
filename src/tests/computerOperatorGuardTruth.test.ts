import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  operatorGuardBadge,
  OPERATOR_GUARD_UNKNOWN_LABEL,
} from '../utils/hardening/computerOperatorGuardTruth';

// Backlog item 13 (Zero-fake-success). The Computer Operator footer printed a
// fixed line — "Level 1-4 Guard Active: Financial exclusions hard-locked |
// Secrets & tokens redacted" — on every render, asserting three operator-
// flippable Security Matrix gates it never read. These tests pin the honest
// builder and the wiring that feeds it only an observed /api/security reading.
describe('computer operator guard posture truth', () => {
  it('states the posture is unknown when no /api/security reading exists', () => {
    for (const state of [null, undefined]) {
      expect(operatorGuardBadge(state)).toBe(OPERATOR_GUARD_UNKNOWN_LABEL);
    }
  });

  it('reports a gate that is off as disabled instead of enforcing it', () => {
    const line = operatorGuardBadge({
      currentLevel: 2,
      humanApprovalForExternal: false,
      maskSensitiveData: false,
      credentialLeakProtection: false,
    });
    expect(line).toContain('Level 2 Active');
    expect(line).toContain('DISABLED');
    expect(line).not.toContain('Financial exclusions hard-locked');
    expect(line).not.toContain('strictly isolated');
  });

  it('names an unobserved gate as UNKNOWN, never as active', () => {
    const line = operatorGuardBadge({ currentLevel: 2 });
    expect(line).toContain('UNKNOWN');
    expect(line).not.toContain('require human approval');
    expect(line).not.toContain('masked');
  });

  it('states every clause as a measurement when the gates are on', () => {
    const line = operatorGuardBadge({
      currentLevel: 4,
      humanApprovalForExternal: true,
      maskSensitiveData: true,
      credentialLeakProtection: true,
    });
    expect(line).toContain('Level 4 Active');
    expect(line).toContain('external actions require human approval');
    expect(line).toContain('stored secrets masked');
    expect(line).toContain('outbound model context redacted');
  });
});

describe('ComputerOperatorModal footer derives its guard line from an observed reading', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/ComputerOperatorModal.tsx'),
    'utf8',
  );

  it('no longer prints the hard-coded guard sentence', () => {
    expect(src).not.toContain('Level 1-4 Guard Active: Financial exclusions hard-locked');
    expect(src).not.toContain('Secrets & tokens redacted');
  });

  it('renders the footer from the helper and reads /api/security', () => {
    expect(src).toContain('operatorGuardBadge(guardPosture)');
    expect(src).toContain("fetch('/api/security')");
    expect(src).toContain('useState<OperatorGuardSnapshot | null>(null)');
  });

  it('only shows the green shield when every gate was observed and enforcing', () => {
    expect(src).toContain('const guardHealthy =');
    expect(src).toContain('guardPosture.humanApprovalForExternal === true');
    expect(src).toContain('guardPosture.maskSensitiveData === true');
    expect(src).toContain('guardPosture.credentialLeakProtection === true');
  });
});
