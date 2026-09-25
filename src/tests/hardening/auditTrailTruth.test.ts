import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  AUDIT_LOG_SOURCE_RECORDED,
  auditTrailCounts,
  describeAuditTrail,
  deriveAuditFinalTruthState,
  deriveAuditVerificationStatus,
  normalizeAuditLog,
} from '../../utils/hardening/auditTrailTruth';
import { claimsVerifiedOutcome } from '../../utils/hardening/socialDraftAuditTruth';

// server.ts binds a port on import, so the "no fabricated seed" assertions read
// the source text, matching the convention in toolSurfaceTruthfulness.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('the security audit trail does not seed fabricated executed work', () => {
  it('does not seed a repository read as EXECUTED', () => {
    expect(serverFlat).not.toContain('Read Git Repository Status (Level 1)');
  });

  it('does not seed a LinkedIn draft as EXECUTED', () => {
    expect(serverFlat).not.toContain('Draft Social Media Post for LinkedIn (Level 2)');
  });

  it('does not seed a client quotation as EXECUTED', () => {
    expect(serverFlat).not.toContain('Generate Client Quotation');
  });

  it('starts a cold process with an empty audit trail', () => {
    expect(serverFlat).toContain('const defaultAuditLogs: AuditLogEntry[] = [];');
  });

  it('writes every audit entry through pushAuditEntry', () => {
    // The only allowed raw write to the trail is inside pushAuditEntry itself.
    const rawWrites = serverFlat.split('memoryState.auditLogs.unshift(').length - 1;
    expect(rawWrites).toBe(1);
    expect(serverFlat).toContain('function pushAuditEntry(entry: AuditLogEntry): AuditLogEntry {');
    expect(serverFlat).toContain('entry.source = AUDIT_LOG_SOURCE_RECORDED;');
  });

  it('no longer reports the raw trail length as verified events', () => {
    expect(serverFlat).not.toContain('verified events');
    expect(serverFlat).toContain('describeAuditTrail(memoryState.auditLogs)');
  });
});

describe('unrecorded audit rows are never presented as verified', () => {
  it('treats an entry without provenance as NOT_RECORDED even if it says VERIFIED', () => {
    // This is the shape of the three removed seeds and of legacy persisted rows.
    const result = normalizeAuditLog({
      status: 'EXECUTED',
      verificationStatus: 'VERIFIED',
      finalTruthState: 'VERIFIED',
    });
    expect(result.recorded).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(result.status).toBe('NOT_RECORDED');
    expect(result.provenanceLabel).toBe('not recorded by this process');
  });

  it('keeps a recorded, provider-confirmed entry as confirmed', () => {
    const result = normalizeAuditLog({
      source: AUDIT_LOG_SOURCE_RECORDED,
      status: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      finalTruthState: 'VERIFIED',
    });
    expect(result.recorded).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(result.status).toBe('VERIFIED');
  });

  it('does not confirm a recorded entry that lacks provider confirmation', () => {
    const result = normalizeAuditLog({
      source: AUDIT_LOG_SOURCE_RECORDED,
      status: 'EXECUTED',
      verificationStatus: 'STANDBY',
      finalTruthState: 'DRAFT',
    });
    expect(result.recorded).toBe(true);
    expect(result.confirmed).toBe(false);
  });

  it('counts only recorded entries and never inflates the verified total', () => {
    const logs = [
      { status: 'EXECUTED', verificationStatus: 'VERIFIED' }, // legacy seed
      { status: 'EXECUTED', verificationStatus: 'VERIFIED' }, // legacy seed
      { source: AUDIT_LOG_SOURCE_RECORDED, status: 'VERIFIED' },
    ];
    const counts = auditTrailCounts(logs);
    expect(counts.total).toBe(3);
    expect(counts.recorded).toBe(1);
    expect(describeAuditTrail(logs)).toBe('1 of 3 events recorded by this process');
  });

  it('describes an empty trail honestly', () => {
    expect(describeAuditTrail([])).toBe('no events recorded');
    expect(describeAuditTrail(undefined)).toBe('no events recorded');
  });
});

describe('the Security Matrix renders unrecorded rows as unrecorded', () => {
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/SecurityMatrixModal.tsx'),
    'utf8',
  );
  const modalFlat = modalSource.replace(/\s+/g, ' ');

  it('does not promise real-time execution logs for rows it did not record', () => {
    expect(modalFlat).not.toContain('Security Audit Trail (Real-Time Execution Logs)');
  });

  it('shows an explicit empty state instead of a blank list', () => {
    expect(modalFlat).toContain('No audit events recorded by this process yet');
  });

  it('labels provenance rather than trusting the stored status string', () => {
    expect(modalFlat).toContain('normalizeAuditLog(log)');
    expect(modalFlat).toContain('provenance.provenanceLabel');
  });
});

describe('addAuditLog derives truth fields from the caller outcome', () => {
  it('derives VERIFIED only for a verified outcome', () => {
    expect(deriveAuditVerificationStatus('VERIFIED')).toBe('VERIFIED');
    expect(deriveAuditFinalTruthState('VERIFIED')).toBe('VERIFIED');
  });

  it('never confirms a failed outcome', () => {
    expect(deriveAuditVerificationStatus('FAILED')).toBe('UNVERIFIED');
    expect(deriveAuditFinalTruthState('FAILED')).toBe('FAILED');
    expect(claimsVerifiedOutcome({ verificationStatus: deriveAuditVerificationStatus('FAILED'), finalTruthState: deriveAuditFinalTruthState('FAILED') })).toBe(false);
  });

  it('never confirms a blocked outcome', () => {
    expect(deriveAuditVerificationStatus('BLOCKED')).toBe('UNVERIFIED');
    expect(deriveAuditFinalTruthState('BLOCKED')).toBe('REJECTED');
    expect(claimsVerifiedOutcome({ verificationStatus: deriveAuditVerificationStatus('BLOCKED'), finalTruthState: deriveAuditFinalTruthState('BLOCKED') })).toBe(false);
  });

  it('never confirms a pending outcome', () => {
    expect(deriveAuditVerificationStatus('PENDING')).toBe('STANDBY');
    expect(deriveAuditFinalTruthState('PENDING')).toBe('DRAFT');
    expect(claimsVerifiedOutcome({ verificationStatus: deriveAuditVerificationStatus('PENDING'), finalTruthState: deriveAuditFinalTruthState('PENDING') })).toBe(false);
  });

  it('does not hardcode the truth fields in addAuditLog', () => {
    expect(serverFlat).toContain('verificationStatus: deriveAuditVerificationStatus(status),');
    expect(serverFlat).toContain('finalTruthState: deriveAuditFinalTruthState(status),');
  });
});
