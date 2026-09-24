// ==============================================================================
// Tests for social publish retry and the draft -> approval -> publish workflow
// (backlog items 27-29).
//
// The properties that matter most: an ambiguous outcome must never be retried
// automatically (it may double-post), and nothing reaches PUBLISHED without the
// platform's own identifier.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  classifyPublishFailure,
  isRetryable,
  delayForAttempt,
  publishWithRetry,
  canTransition,
  transitionPost,
  DEFAULT_RETRY_POLICY,
  type PublishAttempt,
  type SocialPostRecord,
} from '../utils/social/publishRetry';

/** A sleep that records the delays instead of waiting. */
function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => { delays.push(ms); } };
}

function draft(): SocialPostRecord {
  return {
    id: 'post-1',
    platform: 'linkedin',
    content: 'hello',
    state: 'DRAFT',
    updatedAt: new Date('2026-09-19T00:00:00Z').toISOString(),
  };
}

describe('classifyPublishFailure', () => {
  it('maps HTTP status codes to the right kind', () => {
    expect(classifyPublishFailure({ status: 401 })).toBe('AUTH');
    expect(classifyPublishFailure({ status: 403 })).toBe('PERMISSION');
    expect(classifyPublishFailure({ status: 429 })).toBe('RATE_LIMITED');
    expect(classifyPublishFailure({ status: 500 })).toBe('PROVIDER_5XX');
    expect(classifyPublishFailure({ status: 503 })).toBe('PROVIDER_5XX');
    expect(classifyPublishFailure({ status: 400 })).toBe('BAD_REQUEST');
  });

  it('treats a refused connection as safely retryable', () => {
    expect(classifyPublishFailure({ code: 'ECONNREFUSED', message: 'refused' })).toBe('TRANSIENT_NETWORK');
    expect(classifyPublishFailure({ code: 'ENOTFOUND', message: 'dns' })).toBe('TRANSIENT_NETWORK');
  });

  it('treats a timeout after send as ambiguous, not retryable', () => {
    // This is the critical distinction: the POST may have been applied.
    expect(classifyPublishFailure({ code: 'ETIMEDOUT', message: 'timeout' })).toBe('AMBIGUOUS');
    expect(classifyPublishFailure({ code: 'ECONNRESET', message: 'reset' })).toBe('AMBIGUOUS');
    expect(classifyPublishFailure({ message: 'socket hang up' })).toBe('AMBIGUOUS');
  });

  it('unwraps a nested cause, as Node fetch reports socket errors', () => {
    // Node's fetch throws TypeError('fetch failed') with the real code on cause.
    const wrapped = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    });
    expect(classifyPublishFailure(wrapped)).toBe('AMBIGUOUS');

    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    expect(classifyPublishFailure(refused)).toBe('TRANSIENT_NETWORK');
  });

  it('treats a bare fetch failure as ambiguous, not retryable', () => {
    // Without a clearer cause, a POST may already have been delivered.
    expect(classifyPublishFailure(new TypeError('fetch failed'))).toBe('AMBIGUOUS');
  });

  it('falls back to UNKNOWN for an unrecognised error', () => {
    expect(classifyPublishFailure(new Error('something odd'))).toBe('UNKNOWN');
    expect(classifyPublishFailure(null)).toBe('UNKNOWN');
  });

  it('marks only safe kinds as retryable', () => {
    expect(isRetryable('TRANSIENT_NETWORK')).toBe(true);
    expect(isRetryable('PROVIDER_5XX')).toBe(true);
    expect(isRetryable('RATE_LIMITED')).toBe(true);
    expect(isRetryable('AMBIGUOUS')).toBe(false);
    expect(isRetryable('AUTH')).toBe(false);
    expect(isRetryable('PERMISSION')).toBe(false);
    expect(isRetryable('BAD_REQUEST')).toBe(false);
    // An unrecognised failure might have been delivered; do not repeat it.
    expect(isRetryable('UNKNOWN')).toBe(false);
  });
});

describe('delayForAttempt', () => {
  it('grows the delay with the backoff factor', () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, backoffFactor: 2, maxDelayMs: 10_000 };
    expect(delayForAttempt(1, policy)).toBe(100);
    expect(delayForAttempt(2, policy)).toBe(200);
    expect(delayForAttempt(3, policy)).toBe(400);
  });

  it('caps the delay at the ceiling', () => {
    const policy = { maxAttempts: 10, baseDelayMs: 1000, backoffFactor: 10, maxDelayMs: 5000 };
    expect(delayForAttempt(3, policy)).toBe(5000);
  });
});

describe('publishWithRetry', () => {
  it('publishes when the platform returns an identifier', async () => {
    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      attempt: async () => ({ ok: true as const, providerId: 'urn:li:share:123' }),
    });

    expect(result.published).toBe(true);
    expect(result.providerId).toBe('urn:li:share:123');
    expect(receipt.outcome).toBe('VERIFIED');
    expect(receipt.evidence?.ref).toBe('urn:li:share:123');
    expect(result.attempts).toHaveLength(1);
  });

  it('does not retry an unclassified failure and reports it as unverified', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      policy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3 },
      attempt: async () => {
        calls++;
        return { ok: false as const, message: 'unclassified failure' };
      },
    });

    // An unrecognised failure cannot be shown to be safe to repeat, so it stops
    // after one attempt and is reported as unverified rather than failed.
    expect(calls).toBe(1);
    expect(delays).toHaveLength(0);
    expect(result.published).toBe(false);
    expect(result.failureKind).toBe('UNKNOWN');
    expect(receipt.outcome).toBe('UNVERIFIED');
    expect(receipt.failureReason).toBe('AMBIGUOUS_PUBLISH_OUTCOME');
    expect(result.errorReason).toContain('may already exist');
  });

  it('stops immediately when the attempt reports an ambiguous socket error', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      attempt: async () => {
        calls++;
        const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
        return { ok: false as const, message: 'socket hang up', error: err };
      },
    });

    expect(calls).toBe(1);
    expect(delays).toHaveLength(0);
    expect(result.published).toBe(false);
    expect(result.failureKind).toBe('AMBIGUOUS');
    expect(receipt.outcome).toBe('UNVERIFIED');
    expect(receipt.failureReason).toBe('AMBIGUOUS_PUBLISH_OUTCOME');
    expect(result.errorReason).toContain('may already exist');
  });

  it('treats a 2xx without an identifier as unverified, not published', async () => {
    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      attempt: async () => ({ ok: true as const, providerId: '' }),
    });

    expect(result.published).toBe(false);
    expect(result.providerId).toBeUndefined();
    expect(receipt.outcome).toBe('UNVERIFIED');
    expect(receipt.failureReason).toBe('NO_PROVIDER_IDENTIFIER');
  });

  it('retries a server error and succeeds on a later attempt', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      attempt: async () => {
        calls++;
        if (calls < 3) return { ok: false as const, status: 503, message: 'service unavailable' };
        return { ok: true as const, providerId: 'urn:li:share:999' };
      },
    });

    expect(calls).toBe(3);
    expect(result.published).toBe(true);
    expect(receipt.outcome).toBe('VERIFIED');
    // Two waits, growing.
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(result.attempts.filter((a: PublishAttempt) => a.failureKind).length).toBe(2);
  });

  it('gives up after the configured attempts and reports FAILED', async () => {
    const { sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      policy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3 },
      attempt: async () => {
        calls++;
        return { ok: false as const, status: 500, message: 'boom' };
      },
    });

    expect(calls).toBe(3);
    expect(result.published).toBe(false);
    expect(result.failureKind).toBe('PROVIDER_5XX');
    expect(receipt.outcome).toBe('FAILED');
    expect(receipt.failureReason).toBe('RETRIES_EXHAUSTED');
  });

  it('does not retry an authentication failure', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      attempt: async () => {
        calls++;
        return { ok: false as const, status: 401, message: 'bad token' };
      },
    });

    expect(calls).toBe(1);
    expect(delays).toHaveLength(0);
    expect(result.failureKind).toBe('AUTH');
    expect(receipt.outcome).toBe('PERMISSION_REQUIRED');
  });

  it('waits the maximum delay for a rate-limited response', async () => {
    const { delays, sleep } = recordingSleep();

    await publishWithRetry({
      label: 'linkedin',
      sleep,
      policy: { maxAttempts: 2, baseDelayMs: 10, backoffFactor: 2, maxDelayMs: 7000 },
      attempt: async () => ({ ok: false as const, status: 429, message: 'slow down' }),
    });

    expect(delays).toEqual([7000]);
  });

  it('classifies a thrown connection error as retryable and eventually fails', async () => {
    const { sleep } = recordingSleep();
    let calls = 0;

    const { result, receipt } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      policy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 2 },
      attempt: async () => {
        calls++;
        const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
        throw err;
      },
    });

    expect(calls).toBe(2);
    expect(result.published).toBe(false);
    expect(result.failureKind).toBe('TRANSIENT_NETWORK');
    expect(receipt.outcome).toBe('FAILED');
  });

  it('records every attempt in the trail', async () => {
    const { sleep } = recordingSleep();

    const { result } = await publishWithRetry({
      label: 'linkedin',
      sleep,
      attempt: async () => ({ ok: true as const, providerId: 'urn:li:share:1' }),
    });

    expect(result.attempts[0].attempt).toBe(1);
    expect(result.attempts[0].startedAt).toBeTruthy();
  });
});

describe('workflow transitions', () => {
  it('allows a draft to be submitted for approval', () => {
    expect(canTransition('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'PUBLISHING')).toBe(true);
    expect(canTransition('PUBLISHING', 'PUBLISHED')).toBe(true);
  });

  it('forbids a draft from jumping straight to published', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    const result = transitionPost(draft(), 'PUBLISHED', { providerId: 'urn:x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Cannot move');
  });

  it('forbids republishing an already-published post', () => {
    expect(canTransition('PUBLISHED', 'PUBLISHING')).toBe(false);
  });

  it('requires a named human to approve', () => {
    let post = draft();
    const submitted = transitionPost(post, 'PENDING_APPROVAL');
    expect(submitted.ok).toBe(true);

    const noName = transitionPost(submitted.post, 'APPROVED');
    expect(noName.ok).toBe(false);
    expect(noName.reason).toContain('name of the human');

    const named = transitionPost(submitted.post, 'APPROVED', { approvedBy: 'Mr. Gahonsh' });
    expect(named.ok).toBe(true);
    expect(named.post.approvedBy).toBe('Mr. Gahonsh');
  });

  it('refuses PUBLISHED without a provider identifier', () => {
    let post = draft();
    post = transitionPost(post, 'PENDING_APPROVAL').post;
    post = transitionPost(post, 'APPROVED', { approvedBy: 'Human' }).post;
    post = transitionPost(post, 'PUBLISHING').post;

    const noId = transitionPost(post, 'PUBLISHED');
    expect(noId.ok).toBe(false);
    expect(noId.reason).toContain('provider identifier');

    const withId = transitionPost(post, 'PUBLISHED', { providerId: 'urn:li:share:5' });
    expect(withId.ok).toBe(true);
    expect(withId.post.providerId).toBe('urn:li:share:5');
  });

  it('never retries an unverified post automatically', () => {
    // An unverified post must be resolved by a human, so it cannot return to
    // the approved state for an automatic retry.
    expect(canTransition('UNVERIFIED', 'APPROVED')).toBe(false);
    expect(canTransition('UNVERIFIED', 'PUBLISHED')).toBe(true);
    expect(canTransition('UNVERIFIED', 'FAILED')).toBe(true);
  });

  it('allows a failed post to be retried from the approved state', () => {
    expect(canTransition('FAILED', 'APPROVED')).toBe(true);
  });

  it('records the error reason on failure', () => {
    let post = draft();
    post = transitionPost(post, 'PENDING_APPROVAL').post;
    post = transitionPost(post, 'APPROVED', { approvedBy: 'Human' }).post;
    post = transitionPost(post, 'PUBLISHING').post;
    const failed = transitionPost(post, 'FAILED', { errorReason: 'provider down' });

    expect(failed.ok).toBe(true);
    expect(failed.post.state).toBe('FAILED');
    expect(failed.post.errorReason).toBe('provider down');
  });

  it('clears a stale error reason when the post is republished', () => {
    let post: SocialPostRecord = { ...draft(), state: 'FAILED', errorReason: 'old error' };
    post = transitionPost(post, 'APPROVED', { approvedBy: 'Human' }).post;
    post = transitionPost(post, 'PUBLISHING').post;
    const done = transitionPost(post, 'PUBLISHED', { providerId: 'urn:x' });

    expect(done.post.errorReason).toBeUndefined();
  });
});