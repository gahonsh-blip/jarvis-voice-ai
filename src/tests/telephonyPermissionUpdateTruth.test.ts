// HERMES JARVIS — telephony permission-update honesty.
//
// `POST /api/telephony/permissions` used to merge any caller-supplied object
// over the stored matrix and answer `success: true` regardless of whether a
// single real permission key was present. A body of unknown keys, or an empty
// body, still read as an applied save on the surface that gates outbound
// calling, private-data access and call recording.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyPhonePermissionUpdate } from '../utils/hardening/phonePermissionUpdateTruth';
import { PHONE_PERMISSION_DEFINITIONS } from '../utils/telephonyPermissions';

const KNOWN = 'PHONE_RECORDING';
const OTHER_KNOWN = 'PHONE_OUTBOUND_CALL';

describe('classifyPhonePermissionUpdate applies only real permission keys', () => {
  it('applies a known key carrying a valid state', () => {
    const v = classifyPhonePermissionUpdate({ [KNOWN]: { state: 'GRANTED' } }, PHONE_PERMISSION_DEFINITIONS);
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied).toEqual({ [KNOWN]: 'GRANTED' });
    expect(v.rejected).toEqual([]);
  });

  it('accepts every documented permission state', () => {
    for (const state of ['NOT_CONFIGURED', 'DENIED', 'ASK', 'GRANTED'] as const) {
      const v = classifyPhonePermissionUpdate({ [KNOWN]: { state } }, PHONE_PERMISSION_DEFINITIONS);
      expect(v.accepted).toBe(true);
      if (v.accepted) expect(v.applied[KNOWN]).toBe(state);
    }
  });

  it('does not accept an unknown key as an applied change', () => {
    const v = classifyPhonePermissionUpdate({ PHONE_NOT_A_REAL_PERMISSION: { state: 'GRANTED' } }, PHONE_PERMISSION_DEFINITIONS);
    expect(v.accepted).toBe(false);
    if (v.accepted) return;
    expect(v.reason).toBe('ALL_UNKNOWN');
    expect(v.rejected).toContain('PHONE_NOT_A_REAL_PERMISSION');
  });

  it('does not accept an empty body as an applied change', () => {
    const v = classifyPhonePermissionUpdate({}, PHONE_PERMISSION_DEFINITIONS);
    expect(v.accepted).toBe(false);
    if (v.accepted) return;
    expect(v.reason).toBe('NO_KEYS');
  });

  it('rejects a non-object body instead of coercing it', () => {
    for (const body of [null, undefined, 'GRANTED', ['PHONE_RECORDING'], 42]) {
      const v = classifyPhonePermissionUpdate(body, PHONE_PERMISSION_DEFINITIONS);
      expect(v.accepted).toBe(false);
    }
  });

  it('rejects a known key carrying an invalid state value', () => {
    const v = classifyPhonePermissionUpdate({ [KNOWN]: { state: 'YES_PLEASE' } }, PHONE_PERMISSION_DEFINITIONS);
    expect(v.accepted).toBe(false);
    if (v.accepted) return;
    expect(v.rejected).toContain(KNOWN);
  });

  it('applies the real key and reports the unknown one when both are sent', () => {
    const v = classifyPhonePermissionUpdate(
      { [KNOWN]: { state: 'DENIED' }, PHONE_TYPO: { state: 'GRANTED' } },
      PHONE_PERMISSION_DEFINITIONS,
    );
    expect(v.accepted).toBe(true);
    if (!v.accepted) return;
    expect(v.applied).toEqual({ [KNOWN]: 'DENIED' });
    expect(v.rejected).toEqual(['PHONE_TYPO']);
    expect(v.message).toMatch(/PHONE_TYPO/);
  });

  it('accepts the real permission definitions as the known-key set', () => {
    expect(PHONE_PERMISSION_DEFINITIONS.map((d) => d.key)).toContain(OTHER_KNOWN);
  });
});

describe('the permissions route only reports a change it actually applied', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/telephony/permissions'"));
  const body = route.slice(0, route.indexOf('// 6.9 Run Automated Telephony Test Suite'));

  it('classifies the update against the real definitions', () => {
    expect(body).toContain('classifyPhonePermissionUpdate(req.body, PHONE_PERMISSION_DEFINITIONS)');
  });

  it('returns success:false when nothing real was supplied', () => {
    expect(body).toContain('if (!verdict.accepted)');
    expect(body).toContain('success: false');
    expect(body).toContain('applied: false');
  });

  it('saves only the classified keys, not the raw body', () => {
    expect(body).toContain('applyPhonePermissionUpdate(store, current, verdict.applied)');
    expect(body).not.toContain('...req.body');
  });

  it('reports a change only when a durable store accepted it', () => {
    expect(body).toContain('resolvePhonePermissionStore');
    expect(body).toContain('success: result.applied');
    expect(body).toContain('applied: result.applied');
  });
});
