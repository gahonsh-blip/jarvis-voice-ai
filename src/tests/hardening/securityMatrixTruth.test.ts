import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  securityMatrixPosture,
  triState,
} from '../../utils/hardening/securityMatrixTruth';

// server.ts binds a port on import, so the reply assertions read the source
// text, matching the convention in auditTrailTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('the Security Matrix posture line reports what was observed', () => {
  it('never claims approval is enforced when the flag is false', () => {
    const posture = securityMatrixPosture({ humanApprovalForExternal: false });
    expect(posture.humanApproval).toContain('DISABLED');
    expect(posture.humanApproval).not.toContain('Enforced');
  });

  it('never claims secret masking when the flag is false', () => {
    const posture = securityMatrixPosture({ maskSensitiveData: false });
    expect(posture.secretMasking).toContain('DISABLED');
    expect(posture.secretMasking).not.toContain('strictly isolated');
  });

  it('reports credential leak protection from the real redactor gate', () => {
    expect(securityMatrixPosture({ credentialLeakProtection: false }).credentialLeakProtection).toContain(
      'DISABLED',
    );
    expect(securityMatrixPosture({ credentialLeakProtection: true }).credentialLeakProtection).toContain(
      'Enabled',
    );
  });

  it('holds UNKNOWN when a flag was never observed', () => {
    const posture = securityMatrixPosture({});
    expect(posture.humanApproval).toContain('UNKNOWN');
    expect(posture.secretMasking).toContain('UNKNOWN');
    expect(posture.credentialLeakProtection).toContain('UNKNOWN');
    expect(posture.levelLabel).toBe('UNKNOWN');
  });

  it('never upgrades a missing snapshot to a claim', () => {
    const posture = securityMatrixPosture(null);
    expect(posture.humanApproval).toContain('UNKNOWN');
    expect(posture.levelLabel).toBe('UNKNOWN');
  });

  it('tri-state treats only an explicit boolean as a measurement', () => {
    expect(triState(true, 'ON', 'OFF')).toBe('ON');
    expect(triState(false, 'ON', 'OFF')).toBe('OFF');
    expect(triState(undefined, 'ON', 'OFF')).toContain('UNKNOWN');
    expect(triState(null, 'ON', 'OFF')).toContain('UNKNOWN');
  });
});

describe('the Telegram security audit reply derives its posture', () => {
  it('no longer hardcodes the approval enforcement claim', () => {
    expect(serverFlat).not.toContain('Enforced for all external actions');
  });

  it('no longer hardcodes the credential isolation claim', () => {
    expect(serverFlat).not.toContain('Passwords & API tokens strictly isolated');
  });

  it('builds the audit reply from the posture helper', () => {
    expect(serverFlat).toContain('securityMatrixPosture(securityMatrixState)');
    expect(serverFlat).toContain('posture.humanApproval');
    expect(serverFlat).toContain('posture.credentialLeakProtection');
  });
});

describe('the proactive briefing insights derive the approval posture', () => {
  it('no longer hardcodes the approval enforcement claim in a briefing', () => {
    expect(serverFlat).not.toContain('Human Approval Enforced');
  });

  it('no longer asserts a human-in-the-loop gate that may be off', () => {
    expect(serverFlat).not.toContain('Human-in-the-loop gate active');
  });

  it('reports the observed approval posture in the briefing insights', () => {
    expect(
      serverFlat.includes('External-action approval: ${posture.humanApproval}'),
    ).toBe(true);
  });
});
