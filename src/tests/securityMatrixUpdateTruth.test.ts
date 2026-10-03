// HERMES JARVIS — security-matrix update honesty (backlog item 13).
//
// `POST /api/security/update` copied whichever fields the body carried over the
// running matrix and answered `success: true` unconditionally: an empty body
// read as a save, an out-of-range level was stored as-is, and an unknown field
// was written and reported as applied. This test covers the classifier and the
// route guard that replaced the raw spread.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifySecurityMatrixUpdate } from '../utils/hardening/securityMatrixUpdateTruth';

describe('classifySecurityMatrixUpdate applies only real, valid matrix fields', () => {
  it('applies a valid level', () => {
    const v = classifySecurityMatrixUpdate({ currentLevel: 3 });
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied.currentLevel).toBe(3);
    expect(v.rejected).toEqual([]);
  });

  it('applies a boolean approval gate', () => {
    const v = classifySecurityMatrixUpdate({ humanApprovalForExternal: false });
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied.humanApprovalForExternal).toBe(false);
  });

  it('applies a boolean masking gate', () => {
    const v = classifySecurityMatrixUpdate({ maskSensitiveData: false });
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied.maskSensitiveData).toBe(false);
  });

  it('rejects an empty body instead of reporting a save', () => {
    const v = classifySecurityMatrixUpdate({});
    expect(v.accepted).toBe(false);
    if (v.accepted) return;
    expect(v.reason).toBe('NO_KEYS');
  });

  it('rejects a non-object body instead of coercing it', () => {
    for (const body of [null, undefined, 'Level 4', [4], 4]) {
      const v = classifySecurityMatrixUpdate(body);
      expect(v.accepted).toBe(false);
    }
  });

  it('rejects a level outside the real 1..4 range', () => {
    for (const level of [0, 5, 99, -1]) {
      const v = classifySecurityMatrixUpdate({ currentLevel: level });
      expect(v.accepted, `level ${level}`).toBe(false);
      if (!v.accepted) expect(v.reason).toBe('ALL_INVALID');
    }
  });

  it('rejects a string level rather than coercing it', () => {
    const v = classifySecurityMatrixUpdate({ currentLevel: '3' });
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.rejected).toContain('currentLevel');
  });

  it('rejects a non-boolean approval value instead of storing a truthy string', () => {
    // "false" is truthy in every `if (humanApprovalForExternal)` gate while a
    // tri-state renderer reads it as neither true nor false. It must be refused.
    const v = classifySecurityMatrixUpdate({ humanApprovalForExternal: 'false' });
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.rejected).toContain('humanApprovalForExternal');
  });

  it('rejects a number masking value', () => {
    const v = classifySecurityMatrixUpdate({ maskSensitiveData: 1 });
    expect(v.accepted).toBe(false);
  });

  it('rejects an unknown field instead of writing it into the matrix', () => {
    const v = classifySecurityMatrixUpdate({ humanApprovlForExternal: true });
    expect(v.accepted).toBe(false);
    if (v.accepted) return;
    expect(v.reason).toBe('ALL_INVALID');
    expect(v.rejected).toContain('humanApprovlForExternal');
  });

  it('applies the real field and names the unknown one when both are sent', () => {
    const v = classifySecurityMatrixUpdate({ currentLevel: 1, bogusField: true });
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied).toEqual({ currentLevel: 1 });
    expect(v.rejected).toEqual(['bogusField']);
    expect(v.message).toMatch(/bogusField/);
  });

  it('does not apply an invalid field while a sibling field is valid', () => {
    const v = classifySecurityMatrixUpdate({ currentLevel: 9, maskSensitiveData: true });
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied).toEqual({ maskSensitiveData: true });
    expect(v.rejected).toEqual(['currentLevel']);
  });
});

describe('the security/update route only reports a change it actually applied', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/security/update'"));
  const body = route.slice(0, route.indexOf('// Audit Trail API'));

  it('classifies the update against the real matrix fields', () => {
    expect(body).toContain('classifySecurityMatrixUpdate(req.body)');
  });

  it('returns success:false and applied:false when nothing valid was supplied', () => {
    expect(body).toContain('if (!verdict.accepted)');
    expect(body).toContain('success: false');
    expect(body).toContain('applied: false');
  });

  it('does not spread the raw request body into the matrix', () => {
    expect(body).not.toContain('...req.body');
  });

  it('assigns only the classified fields', () => {
    expect(body).toContain('verdict.applied.currentLevel');
    expect(body).toContain('verdict.applied.humanApprovalForExternal');
    expect(body).toContain('verdict.applied.maskSensitiveData');
  });
});

describe('the Security Matrix modal surfaces a rejected update', () => {
  const modal = fs
    .readFileSync(path.resolve(__dirname, '../components/SecurityMatrixModal.tsx'), 'utf8')
    .replace(/\s+/g, ' ');

  it('sets a notice when the update is rejected and resyncs the server state', () => {
    expect(modal).toContain('setNotice(data.message');
    expect(modal).toContain('await fetchSecurity()');
  });

  it('no longer silently ignores a rejected update', () => {
    expect(modal).not.toContain('if (data.success) { setSecurityState(data.securityState); } }');
  });
});
