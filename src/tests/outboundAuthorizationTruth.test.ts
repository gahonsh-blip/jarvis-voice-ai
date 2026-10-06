import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  classifyOutboundAuthorization,
  type OutboundAuthorizationRecord,
} from '../utils/hardening/outboundAuthorizationTruth';
import { TelephonySessionManager } from '../utils/telephonySessionManager';

// Zero-fake-success guard for `POST /api/telephony/outbound/authorize`.
//
// The route answered `success: true, authorized: false,
// message: 'Outbound call cancelled.'` for any decision that was not APPROVE,
// even when `requestId` was never staged — claiming an outbound call had been
// cancelled when nothing existed. The APPROVE branch marked an unknown id
// `authorized: true` for the same reason. A request id that is not on record
// must not be reported as either cancelled or authorized.

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in telephonyOutboundDialTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('classifyOutboundAuthorization refuses an absent request', () => {
  it('reports NOT_FOUND for a missing record regardless of the requested decision', () => {
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      const verdict = classifyOutboundAuthorization(decision, null);
      expect(verdict.success).toBe(false);
      expect(verdict.authorized).toBe(false);
      expect(verdict.outcome).toBe('NOT_FOUND');
      expect(verdict.message.toLowerCase()).toContain('no pending outbound-call request');
    }
  });

  it('treats a manager refusal as NOT_FOUND, not a cancellation', () => {
    const refused: OutboundAuthorizationRecord = { success: false, error: 'Request not found' };
    const verdict = classifyOutboundAuthorization('REJECT', refused);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('NOT_FOUND');
    expect(verdict.message).not.toMatch(/cancelled/i);
  });

  it('never reports success for a record that carries no request object', () => {
    const verdict = classifyOutboundAuthorization('APPROVE', { success: true });
    expect(verdict.success).toBe(false);
    expect(verdict.authorized).toBe(false);
    expect(verdict.outcome).toBe('NOT_FOUND');
  });

  it('reports APPROVED only for a recorded APPROVE on a real request', () => {
    const verdict = classifyOutboundAuthorization('APPROVE', {
      success: true,
      request: { id: 'req_1' },
    });
    expect(verdict.success).toBe(true);
    expect(verdict.authorized).toBe(true);
    expect(verdict.outcome).toBe('APPROVED');
  });

  it('reports REJECTED with authorized:false for a recorded REJECT', () => {
    const verdict = classifyOutboundAuthorization('REJECT', {
      success: true,
      request: { id: 'req_1' },
    });
    expect(verdict.success).toBe(true);
    expect(verdict.authorized).toBe(false);
    expect(verdict.outcome).toBe('REJECTED');
    expect(verdict.message).toContain('cancelled');
  });
});

describe('TelephonySessionManager.authorizeOutboundRequest agrees with the verdict', () => {
  it('records a real APPROVE and a real REJECT as success', () => {
    const approved = TelephonySessionManager.stageOutboundRequest({
      destinationNumber: '+919876543210',
      purpose: 'truth test',
    });
    const approveVerdict = classifyOutboundAuthorization(
      'APPROVE',
      TelephonySessionManager.authorizeOutboundRequest(approved.id, 'APPROVE', 'HUMAN_OPERATOR')
    );
    expect(approveVerdict.outcome).toBe('APPROVED');
    expect(approveVerdict.authorized).toBe(true);

    const rejected = TelephonySessionManager.stageOutboundRequest({
      destinationNumber: '+919876543210',
      purpose: 'truth test',
    });
    const rejectVerdict = classifyOutboundAuthorization(
      'REJECT',
      TelephonySessionManager.authorizeOutboundRequest(rejected.id, 'REJECT', 'HUMAN_OPERATOR')
    );
    expect(rejectVerdict.outcome).toBe('REJECTED');
    expect(rejectVerdict.success).toBe(true);
  });

  it('an unknown id yields NOT_FOUND for both APPROVE and REJECT — the fixed defect', () => {
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      const verdict = classifyOutboundAuthorization(
        decision,
        TelephonySessionManager.authorizeOutboundRequest('req_never_staged', decision, 'HUMAN_OPERATOR')
      );
      expect(verdict.success).toBe(false);
      expect(verdict.authorized).toBe(false);
      expect(verdict.outcome).toBe('NOT_FOUND');
    }
  });
});

describe('the outbound-authorize route no longer fakes a cancellation', () => {
  it('routes the manager result through classifyOutboundAuthorization', () => {
    expect(serverFlat).toContain('classifyOutboundAuthorization(');
    expect(serverFlat).toContain('if (!verdict.success)');
    expect(serverFlat).toContain("outcome: verdict.outcome");
  });

  it('no longer answers success:true for an unrecorded decision', () => {
    expect(serverFlat).not.toContain(
      "{ success: true, authorized: false, message: 'Outbound call cancelled.' }",
    );
  });
});
