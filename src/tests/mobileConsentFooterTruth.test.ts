import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mobileConsentFooterLine,
  mobileConsentFooterHealthy,
  MOBILE_CONSENT_UNKNOWN_LABEL,
} from '../utils/hardening/mobileConsentFooterTruth';

// Backlog item 13 (Zero-fake-success). The Mobile Personal Status modal footer
// printed a fixed line — "Zero Unsolicited Data Access • Human Consent Active"
// — on every render, asserting operator-flippable Security Matrix gates it
// never read. These tests pin the honest builder and the wiring that feeds it
// only an observed /api/security reading.
describe('mobile consent footer truth', () => {
  it('states the posture is unknown when no /api/security reading exists', () => {
    for (const state of [null, undefined]) {
      expect(mobileConsentFooterLine(state)).toBe(MOBILE_CONSENT_UNKNOWN_LABEL);
    }
  });

  it('reports a gate that is off as DISABLED instead of enforcing it', () => {
    const line = mobileConsentFooterLine({
      humanApprovalForExternal: false,
      maskSensitiveData: false,
      credentialLeakProtection: false,
    });
    expect(line).toContain('DISABLED');
    expect(line).not.toContain('Human Consent Active');
    expect(line).not.toContain('Zero Unsolicited Data Access');
  });

  it('names an unobserved gate as UNKNOWN, never as active', () => {
    const line = mobileConsentFooterLine({ humanApprovalForExternal: true });
    expect(line).toContain('UNKNOWN');
    expect(line).not.toContain('stored secrets masked');
    expect(line).not.toContain('outbound credential redaction on');
  });

  it('states every clause as a measurement when the gates are on', () => {
    const line = mobileConsentFooterLine({
      humanApprovalForExternal: true,
      maskSensitiveData: true,
      credentialLeakProtection: true,
    });
    expect(line).toContain('human approval required for Level-4 actions');
    expect(line).toContain('stored secrets masked');
    expect(line).toContain('outbound credential redaction on');
  });

  it('treats an unknown or disabled posture as unhealthy', () => {
    expect(mobileConsentFooterHealthy(null)).toBe(false);
    expect(mobileConsentFooterHealthy({ humanApprovalForExternal: true })).toBe(false);
    expect(
      mobileConsentFooterHealthy({
        humanApprovalForExternal: false,
        maskSensitiveData: true,
        credentialLeakProtection: true,
      }),
    ).toBe(false);
    expect(
      mobileConsentFooterHealthy({
        humanApprovalForExternal: true,
        maskSensitiveData: true,
        credentialLeakProtection: true,
      }),
    ).toBe(true);
  });
});

describe('MobilePersonalStatusModal footer derives its consent line from an observed reading', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/MobilePersonalStatusModal.tsx'),
    'utf8',
  );

  it('no longer prints the hard-coded consent sentence', () => {
    expect(src).not.toContain('Zero Unsolicited Data Access');
    expect(src).not.toContain('Human Consent Active');
  });

  it('renders the footer from the helper and reads /api/security', () => {
    expect(src).toContain('mobileConsentFooterLine(consentPosture)');
    expect(src).toContain("fetch('/api/security')");
    expect(src).toContain('useState<MobileConsentSnapshot | null>(null)');
  });

  it('only shows the green shield when every gate was observed and enforcing', () => {
    expect(src).toContain('mobileConsentFooterHealthy(consentPosture)');
    expect(src).toContain('consentHealthy ? (');
  });
});
