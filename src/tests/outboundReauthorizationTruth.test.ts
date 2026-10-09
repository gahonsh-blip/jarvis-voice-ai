import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TelephonySessionManager } from '../utils/telephonySessionManager';

// Zero-fake-success guard for outbound-call authorization (backlog item 13).
//
// `TelephonySessionManager.authorizeOutboundRequest` looked the request up by id
// but never checked its current status, so a request that a human had already
// AUTHORIZED or REJECTED could be decided again. The second call reported
// `success: true`, and the route then dialed the carrier — placing a call that a
// human had explicitly rejected, or placing a duplicate of an approved one.
// A request that is no longer PENDING_AUTHORIZATION must be refused.

const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const stage = (purpose: string) =>
  TelephonySessionManager.stageOutboundRequest({
    destinationNumber: '+919876543210',
    purpose,
  });

describe('a decided outbound request cannot be decided again', () => {
  it('refuses a second APPROVE and leaves the record AUTHORIZED', () => {
    const req = stage('reauthorize-approve');
    const first = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(first.success).toBe(true);
    expect(first.request?.status).toBe('AUTHORIZED');

    const second = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already/i);
    expect(second.request?.status).toBe('AUTHORIZED');
  });

  it('cannot authorize a request a human already rejected', () => {
    const req = stage('reauthorize-after-reject');
    const rejected = TelephonySessionManager.authorizeOutboundRequest(req.id, 'REJECT', 'HUMAN_OPERATOR');
    expect(rejected.success).toBe(true);
    expect(rejected.request?.status).toBe('REJECTED');

    const reapprove = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(reapprove.success).toBe(false);
    expect(reapprove.error).toMatch(/already/i);
    expect(reapprove.request?.status).toBe('REJECTED');
  });

  it('still records the first decision for a fresh pending request', () => {
    const req = stage('first-decision');
    const approved = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(approved.success).toBe(true);
    expect(approved.request?.status).toBe('AUTHORIZED');
    expect(approved.request?.authorizedBy).toBe('HUMAN_OPERATOR');
  });
});

describe('the authorize route cannot dial from a re-decision', () => {
  it('reports an already-decided request as NOT_FOUND, never approved', () => {
    const req = stage('route-redecision');
    TelephonySessionManager.authorizeOutboundRequest(req.id, 'REJECT', 'HUMAN_OPERATOR');
    const recorded = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(recorded.success).toBe(false);
    // The route's existing `if (!verdict.success)` guard then answers 404 and
    // never reaches the carrier-dispatch branch.
    expect(serverFlat).toContain('if (!verdict.success)');
  });
});
