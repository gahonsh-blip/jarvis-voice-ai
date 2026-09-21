import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  replyDispatchDecision,
  replyDispatchOutcome,
  replyDispatchSpeech,
  replyRefusalSpeech,
} from '../utils/mobileReplyDispatchTruth';

// Regression guard: the pending-approval REPLY button previously marked an event
// AUTHORIZED and spoke "Reply authorized… Dispatching" without an approval and
// without ever calling the server (both branches of its note ternary were the
// same string). The server route refuses any reply lacking `approved: true`.

describe('replyDispatchDecision requires a real, distinct human approval', () => {
  const base = { kind: 'MESSAGE_REPLY', notificationId: '42', replyText: 'On my way' };

  it('refuses without distinct approval even when text is present', () => {
    const d = replyDispatchDecision(base, false);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.refusal).toBe('NO_DISTINCT_APPROVAL');
  });

  it('allows a reply only with text and distinct approval', () => {
    const d = replyDispatchDecision(base, true);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.replyText).toBe('On my way');
      expect(d.notificationId).toBe('42');
    }
  });

  it('refuses empty or whitespace-only reply text', () => {
    expect(replyDispatchDecision({ ...base, replyText: '   ' }, true)).toEqual({
      ok: false,
      refusal: 'NO_REPLY_TEXT',
    });
    expect(replyDispatchDecision({ ...base, replyText: null }, true)).toEqual({
      ok: false,
      refusal: 'NO_REPLY_TEXT',
    });
  });

  it('refuses sensitive events regardless of approval', () => {
    const d = replyDispatchDecision({ ...base, sensitive: true }, true);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.refusal).toBe('SENSITIVE_CONTENT');
  });

  it('refuses non-reply events', () => {
    const d = replyDispatchDecision({ ...base, kind: 'CALL_ANSWER' }, true);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.refusal).toBe('NOT_REPLY_EVENT');
  });
});

describe('replyDispatchOutcome never reports an unobserved success', () => {
  it('a failed or unreachable request is never DISPATCHED', () => {
    expect(replyDispatchOutcome(0, null)).toBe('NOT_CONFIGURED');
    expect(replyDispatchOutcome(500, { error: 'boom' })).toBe('FAILED');
    expect(replyDispatchOutcome(400, { error: 'replyText is required.' })).toBe('FAILED');
  });

  it('maps gateway refusals to BLOCKED', () => {
    expect(replyDispatchOutcome(403, { outcome: 'BLOCKED' })).toBe('BLOCKED');
    expect(replyDispatchOutcome(423, { outcome: 'BLOCKED' })).toBe('BLOCKED');
    expect(replyDispatchOutcome(409, { outcome: 'NOT_CONFIGURED' })).toBe('BLOCKED');
    expect(replyDispatchOutcome(401, { error: 'unauthorized' })).toBe('BLOCKED');
  });

  it('reports DISPATCHED only for the server dispatch outcome, never as confirmed', () => {
    expect(replyDispatchOutcome(200, { success: false, outcome: 'DISPATCHED', verified: false })).toBe(
      'DISPATCHED'
    );
  });

  it('a claimed verified dispatch stays UNVERIFIED (confirmation is a separate route)', () => {
    expect(replyDispatchOutcome(200, { outcome: 'DISPATCHED', verified: true })).toBe('UNVERIFIED');
    expect(replyDispatchOutcome(200, { success: true })).toBe('UNVERIFIED');
  });

  it('a 2xx with a non-dispatch body is FAILED, not a success', () => {
    expect(replyDispatchOutcome(200, { outcome: 'SOMETHING_ELSE' })).toBe('FAILED');
    expect(replyDispatchOutcome(200, null)).toBe('FAILED');
  });
});

describe('reply speech never claims confirmed delivery', () => {
  it('DISPATCHED explicitly denies confirmed delivery', () => {
    const s = replyDispatchSpeech('DISPATCHED', 'en');
    expect(s).toContain('not confirmed');
    expect(s.toLowerCase()).not.toContain('delivered');
  });

  it('has Hindi variants that also avoid a confirmed claim', () => {
    const hi = replyDispatchSpeech('DISPATCHED', 'hi');
    expect(hi).toContain('डिलीवरी');
    expect(hi).toContain('नहीं');
    expect(replyRefusalSpeech('NO_DISTINCT_APPROVAL', 'hi')).toMatch(/स्वीकृति/);
  });

  it('refusals and failures are distinguishable from success', () => {
    expect(replyDispatchSpeech('FAILED', 'en')).toContain('failed');
    expect(replyRefusalSpeech('SENSITIVE_CONTENT', 'en')).toContain('not auto-replied');
  });
});

describe('MobileBridgeModal no longer fabricates an authorized reply', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/MobileBridgeModal.tsx'), 'utf8');

  it('has no identical-branch approval ternary', () => {
    expect(src).not.toContain("isExplicitApproval('yes') ? 'REPLY_AUTHORIZED' : 'REPLY_AUTHORIZED'");
  });

  it('does not flip a reply event to AUTHORIZED without a request', () => {
    expect(src).not.toMatch(/updatePendingEventStatus\(ev\.eventId, 'AUTHORIZED'\)/);
  });

  it('delegates the decision to the truth helper and calls the real route', () => {
    expect(src).toContain('replyDispatchDecision');
    expect(src).toContain("'/api/mobile/bridge/message/reply'");
    expect(src).toContain('approved: true');
  });
});
