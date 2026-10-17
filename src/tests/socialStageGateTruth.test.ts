import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyStagedDraft } from '../utils/hardening/outboundStageTruth';
import {
  createPendingActionRequest,
  toggleEmergencyStop,
  resumeSystemOperation,
} from '../../server_tools';

// Zero-fake-success guard for the two YouTube staging routes.
//
// POST /api/social/youtube/upload-draft and POST /api/social/youtube/draft-test
// discarded the result of `createPendingActionRequest` and answered
// `{ success: true, post }` unconditionally. A finance-guard rejection or an
// active Emergency Stop therefore still reported a staged Level-4 upload, and
// the operator's Social Media Hub showed a pending approval that never entered
// the permission queue. Success must be claimed only when the action genuinely
// reached PENDING_APPROVAL.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in outboundStageTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** Extracts one route handler's source up to the next app.<method> registration. */
function routeBlock(routePath: string): string {
  const start = serverFlat.indexOf(`'${routePath}'`);
  expect(start, `route ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + routePath.length);
  return serverFlat.slice(start, next === -1 ? undefined : next);
}

describe('YouTube staging routes report the real permission-gate outcome', () => {
  beforeEach(() => {
    resumeSystemOperation('test-setup');
  });

  it.each([
    '/api/social/youtube/upload-draft',
    '/api/social/youtube/draft-test',
  ])('%s captures the gate result and classifies it', (route) => {
    const block = routeBlock(route);
    // The gate result must be captured, not discarded.
    expect(block).toMatch(/const \w+Gate = createPendingActionRequest\(/);
    expect(block).toMatch(/const \w+Verdict = classifyStagedDraft\(/);
    // A blocked/rejected staging must return a failure, not a success payload.
    expect(block).toContain('if (!');
    expect(block).toContain('success: false');
    expect(block).toContain('staged: false');
    // The old unconditional success must sit behind the verdict guard.
    const verdictAt = block.indexOf('Verdict');
    const successAt = block.indexOf('success: true');
    expect(verdictAt).toBeGreaterThanOrEqual(0);
    expect(successAt).toBeGreaterThan(verdictAt);
  });

  it('classifies a genuinely pending action as staged', () => {
    const verdict = classifyStagedDraft(
      { request: { status: 'PENDING_APPROVAL' } },
      'YouTube upload'
    );
    expect(verdict.success).toBe(true);
    expect(verdict.staged).toBe(true);
    expect(verdict.outcome).toBe('STAGED');
  });

  it('a finance-guard rejection is a no-op, not a staged upload', () => {
    // The gate returns blockedByFinance for financial intent; the staging
    // verdict must follow it and never claim success.
    const gate = createPendingActionRequest({
      exactAction: 'YouTube Video Upload - pay money to vendor',
      target: 'YouTube Channel: unrecorded',
      contentChanges: 'amount 5000 via UPI',
      level: 4,
    });
    expect(gate.blockedByFinance).toBe(true);
    const verdict = classifyStagedDraft(gate, 'YouTube upload');
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_FINANCE');
  });

  it('an active Emergency Stop refuses the staging instead of reporting success', () => {
    toggleEmergencyStop('test-operator', 'testing emergency freeze');
    try {
      const gate = createPendingActionRequest({
        exactAction: 'YouTube Video Upload (PRIVATE) - "Quarterly overview"',
        target: 'YouTube Channel: unrecorded',
        contentChanges: 'Title: "Quarterly overview" | Privacy: PRIVATE',
        level: 4,
      });
      expect(gate.blockedByEmergency).toBe(true);
      const verdict = classifyStagedDraft(gate, 'YouTube test upload');
      expect(verdict.success).toBe(false);
      expect(verdict.outcome).toBe('BLOCKED_EMERGENCY');
    } finally {
      resumeSystemOperation('test-teardown');
    }
  });

  it('an unknown terminal status is not reported as staged', () => {
    const verdict = classifyStagedDraft({ request: { status: 'REJECTED' } }, 'YouTube upload');
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('NOT_STAGED');
  });
});
