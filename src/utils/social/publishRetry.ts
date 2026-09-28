// ==============================================================================
// HERMES JARVIS — SOCIAL PUBLISH RETRY AND VERIFICATION (backlog items 27-29)
//
// Platform publishing is classified so a retry is never attempted where it could
// double-post, and a post is never marked published without the platform's own
// identifier.
//
// The retry helper retries only failures that are known to be safe to repeat.
// An ambiguous outcome (a timeout after the request was sent) is deliberately
// NOT retried automatically, because the post may already exist.
// ==============================================================================

import { ExecutionReceipt, buildReceipt, makeEvidence } from '../executionTruth';

export type PublishFailureKind =
  /** Safe to retry: the request never reached the platform. */
  | 'TRANSIENT_NETWORK'
  /** Safe to retry: the platform returned an explicit server-side error. */
  | 'PROVIDER_5XX'
  /** Safe to retry after a pause: the platform asked us to slow down. */
  | 'RATE_LIMITED'
  /** Not retryable: credentials are wrong or missing. */
  | 'AUTH'
  /** Not retryable without human action: permissions or account setup. */
  | 'PERMISSION'
  /** Not retryable: the request itself is invalid. */
  | 'BAD_REQUEST'
  /** NOT safe to retry: the request may have succeeded. Needs human check. */
  | 'AMBIGUOUS'
  | 'UNKNOWN';

export interface PublishAttempt {
  attempt: number;
  startedAt: string;
  failureKind?: PublishFailureKind;
  status?: number;
  message: string;
}

/**
 * Classifies a failed publish attempt.
 *
 * A network exception during `fetch` is ambiguous for a POST: the request may
 * have been delivered before the connection dropped. It is labelled AMBIGUOUS
 * rather than TRANSIENT so the caller does not retry and double-post.
 */
export function classifyPublishFailure(err: unknown): PublishFailureKind {
  if (err && typeof err === 'object') {
    const anyErr = err as {
      status?: number;
      code?: string;
      name?: string;
      message?: string;
      cause?: unknown;
    };
    const status = anyErr.status;

    if (status === 401) return 'AUTH';
    // 403 is a permission problem even when the token itself is valid.
    if (status === 403) return 'PERMISSION';
    if (status === 429) return 'RATE_LIMITED';
    if (status && status >= 500) return 'PROVIDER_5XX';
    if (status && status >= 400) return 'BAD_REQUEST';

    const code = (anyErr.code || '').toUpperCase();
    const message = (anyErr.message || '').toLowerCase();

    if (
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('dns')
    ) {
      return 'TRANSIENT_NETWORK';
    }

    // A request that was sent and then timed out may have been applied.
    if (
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'UND_ERR_SOCKET' ||
      message.includes('timeout') ||
      message.includes('socket hang up') ||
      message.includes('aborted')
    ) {
      return 'AMBIGUOUS';
    }

    // Node's fetch reports a bare "fetch failed" TypeError and hides the real
    // cause on `cause`. Without unwrapping it, a dropped connection after send
    // would look like an unknown error and be retried, risking a duplicate post.
    if (anyErr.cause && anyErr.cause !== err) {
      const nested = classifyPublishFailure(anyErr.cause);
      if (nested !== 'UNKNOWN') return nested;
    }

    // A generic fetch failure with no clearer cause is ambiguous for a POST:
    // the request may already have been delivered.
    if (message.includes('fetch failed')) return 'AMBIGUOUS';
  }

  return 'UNKNOWN';
}

/**
 * Whether a failure kind may be retried automatically.
 *
 * `UNKNOWN` is deliberately excluded. An unrecognised failure cannot be shown to
 * have happened before the request was sent, and a duplicate social post is a
 * visible, unrecoverable outcome. Unknown failures stop and are reported as
 * unverified so a human can check the platform first.
 */
export function isRetryable(kind: PublishFailureKind): boolean {
  return kind === 'TRANSIENT_NETWORK' || kind === 'PROVIDER_5XX' || kind === 'RATE_LIMITED';
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  /** Multiplier applied to the delay after each attempt. */
  backoffFactor: number;
  /** Delay ceiling, also used for RATE_LIMITED. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 8_000,
};

/** Delay before the given attempt, respecting the backoff policy. */
export function delayForAttempt(attempt: number, policy: RetryPolicy): number {
  const raw = policy.baseDelayMs * Math.pow(policy.backoffFactor, Math.max(0, attempt - 1));
  return Math.min(raw, policy.maxDelayMs);
}

export interface PublishResult {
  /** True only when the platform returned a post identifier. */
  published: boolean;
  providerId?: string;
  failureKind?: PublishFailureKind;
  errorReason?: string;
  attempts: PublishAttempt[];
}

export interface PublishWithRetryOptions<T> {
  /** Performs one publish attempt. Must return the platform's identifier. */
  attempt: (attemptNumber: number) => Promise<
    | { ok: true; providerId: string }
    | { ok: false; status?: number; message: string; error?: unknown }
  >;
  policy?: RetryPolicy;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Label used in the receipt. */
  label: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Publishes with bounded retries and honest reporting.
 *
 * Retries happen only for failure kinds that are safe to repeat. An ambiguous
 * failure stops immediately: the post may exist, so a human must check before
 * anything is sent again.
 */
export async function publishWithRetry<T>(options: PublishWithRetryOptions<T>): Promise<{
  result: PublishResult;
  receipt: ExecutionReceipt;
}> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const attempts: PublishAttempt[] = [];

  for (let n = 1; n <= policy.maxAttempts; n++) {
    const attempt: PublishAttempt = {
      attempt: n,
      startedAt: now().toISOString(),
      message: 'attempt started',
    };
    attempts.push(attempt);

    try {
      const outcome = await options.attempt(n);

      if (outcome.ok && outcome.providerId && outcome.providerId.trim()) {
        attempt.message = `Platform confirmed the post with id ${outcome.providerId}.`;
        return {
          result: { published: true, providerId: outcome.providerId.trim(), attempts },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: 'VERIFIED',
            detailEn: `Published on attempt ${n}; platform returned id ${outcome.providerId.trim()}.`,
            detailHi: `प्रकाशन सफल: प्लेटफ़ॉर्म ने आईडी ${outcome.providerId.trim()} दी।`,
            evidence: makeEvidence('remote_http_response', `provider id ${outcome.providerId.trim()}`, {
              ref: outcome.providerId.trim(),
            }),
          }),
        };
      }

      if (outcome.ok && (!outcome.providerId || !outcome.providerId.trim())) {
        // A 2xx with no identifier is not proof of a post.
        attempt.failureKind = 'AMBIGUOUS';
        attempt.message =
          'The platform accepted the request but returned no post identifier, so the post cannot be confirmed.';
        return {
          result: {
            published: false,
            failureKind: 'AMBIGUOUS',
            errorReason: attempt.message,
            attempts,
          },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: 'UNVERIFIED',
            detailEn: attempt.message,
            detailHi: 'प्लेटफ़ॉर्म ने पुष्टि आईडी नहीं दी, इसलिए प्रकाशन असत्यापित है।',
            failureReason: 'NO_PROVIDER_IDENTIFIER',
          }),
        };
      }

      const failed = outcome as { ok: false; status?: number; message: string; error?: unknown };
      const kind = failed.error !== undefined
        ? classifyPublishFailure(failed.error)
        : classifyPublishFailure({ status: failed.status, message: failed.message });

      attempt.failureKind = kind;
      attempt.status = failed.status;
      attempt.message = failed.message;

      if (kind === 'AMBIGUOUS') {
        return {
          result: {
            published: false,
            failureKind: kind,
            errorReason: `Attempt ${n} ended ambiguously: ${failed.message}. The post may already exist, so it was not retried automatically.`,
            attempts,
          },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: 'UNVERIFIED',
            detailEn: `Attempt ${n} ended ambiguously (${failed.message}). The request may have been delivered, so a retry could double-post. Manual verification is required.`,
            detailHi: 'प्रकाशन की स्थिति अस्पष्ट है; दोहराव से बचने के लिए मानवीय जाँच आवश्यक है।',
            failureReason: 'AMBIGUOUS_PUBLISH_OUTCOME',
          }),
        };
      }

      if (!isRetryable(kind)) {
        // UNKNOWN is not retried but is also not proof of failure: the request
        // may have been delivered. Report it as unverified so a human checks
        // before anything is sent again.
        const unverified = kind === 'UNKNOWN';
        return {
          result: {
            published: false,
            failureKind: kind,
            errorReason: unverified
              ? `Attempt ${n} failed in an unrecognised way (${failed.message}). The post may already exist, so it was not retried automatically.`
              : failed.message,
            attempts,
          },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: unverified
              ? 'UNVERIFIED'
              : kind === 'AUTH' || kind === 'PERMISSION'
                ? 'PERMISSION_REQUIRED'
                : 'FAILED',
            detailEn: unverified
              ? `Publishing failed unrecognisably (${failed.message}); it was not retried because the post may already exist. Manual verification is required.`
              : `Publishing failed and will not be retried (${kind}): ${failed.message}`,
            detailHi: unverified
              ? 'अस्पष्ट विफलता: दोहराव से बचने के लिए मानवीय जाँच आवश्यक है।'
              : `प्रकाशन विफल (${kind}) और दोहराया नहीं जाएगा।`,
            failureReason: unverified ? 'AMBIGUOUS_PUBLISH_OUTCOME' : kind,
          }),
        };
      }

      if (n === policy.maxAttempts) {
        return {
          result: {
            published: false,
            failureKind: kind,
            errorReason: `Gave up after ${n} attempts. Last error: ${failed.message}`,
            attempts,
          },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: 'FAILED',
            detailEn: `Publishing failed after ${n} attempts (last kind ${kind}): ${failed.message}`,
            detailHi: `${n} प्रयासों के बाद भी प्रकाशन विफल रहा।`,
            failureReason: 'RETRIES_EXHAUSTED',
          }),
        };
      }

      const delay = kind === 'RATE_LIMITED' ? policy.maxDelayMs : delayForAttempt(n, policy);
      attempt.message = `${failed.message} (retrying in ${delay}ms)`;
      await sleep(delay);
    } catch (err) {
      const kind = classifyPublishFailure(err);
      attempt.failureKind = kind;
      attempt.message = err instanceof Error ? err.message : 'unknown error';

      if (kind === 'AMBIGUOUS') {
        return {
          result: {
            published: false,
            failureKind: kind,
            errorReason: `Attempt ${n} threw ambiguously: ${attempt.message}. Manual verification required.`,
            attempts,
          },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: 'UNVERIFIED',
            detailEn: `Attempt ${n} raised an ambiguous error (${attempt.message}). The request may have been delivered, so it was not retried.`,
            detailHi: 'अस्पष्ट त्रुटि: मानवीय जाँच आवश्यक है।',
            failureReason: 'AMBIGUOUS_PUBLISH_OUTCOME',
          }),
        };
      }

      if (!isRetryable(kind) || n === policy.maxAttempts) {
        return {
          result: { published: false, failureKind: kind, errorReason: attempt.message, attempts },
          receipt: buildReceipt({
            action: 'social.publishWithRetry',
            target: options.label,
            outcome: kind === 'AUTH' || kind === 'PERMISSION' ? 'PERMISSION_REQUIRED' : 'FAILED',
            detailEn: `Publishing failed after ${n} attempt(s) (${kind}): ${attempt.message}`,
            detailHi: `प्रकाशन विफल (${kind})।`,
            failureReason: kind,
          }),
        };
      }

      const delay = delayForAttempt(n, policy);
      attempt.message = `${attempt.message} (retrying in ${delay}ms)`;
      await sleep(delay);
    }
  }

  // Unreachable in normal flow: the loop always returns on its last iteration.
  return {
    result: { published: false, failureKind: 'UNKNOWN', errorReason: 'No attempt was made.', attempts },
    receipt: buildReceipt({
      action: 'social.publishWithRetry',
      target: options.label,
      outcome: 'FAILED',
      detailEn: 'No publish attempt was made.',
      detailHi: 'कोई प्रकाशन प्रयास नहीं किया गया।',
      failureReason: 'NO_ATTEMPT',
    }),
  };
}

/**
 * The draft → approval → publish workflow states.
 *
 * A draft can only reach PUBLISHED through an explicit approval, and a published
 * post always carries a provider identifier. No path marks a post published
 * without one.
 */
export type SocialPostState =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'UNVERIFIED'
  | 'FAILED'
  | 'REJECTED';

export interface SocialPostRecord {
  id: string;
  platform: string;
  content: string;
  state: SocialPostState;
  providerId?: string;
  errorReason?: string;
  approvedBy?: string;
  updatedAt: string;
}

/** Allowed transitions in the publishing workflow. */
const ALLOWED_TRANSITIONS: Record<SocialPostState, SocialPostState[]> = {
  DRAFT: ['PENDING_APPROVAL', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHING', 'REJECTED'],
  PUBLISHING: ['PUBLISHED', 'UNVERIFIED', 'FAILED'],
  // A failed post may be retried from the approved state only.
  FAILED: ['APPROVED'],
  // An unverified post must be resolved by a human, not by an automatic retry.
  UNVERIFIED: ['PUBLISHED', 'FAILED'],
  PUBLISHED: [],
  REJECTED: [],
};

export function canTransition(from: SocialPostState, to: SocialPostState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface TransitionResult {
  ok: boolean;
  post: SocialPostRecord;
  reason?: string;
}

/**
 * Applies a workflow transition.
 *
 * Refuses a move to PUBLISHED without a provider identifier, so the in-memory
 * state can never claim a post is live without the platform's own evidence.
 */
export function transitionPost(
  post: SocialPostRecord,
  to: SocialPostState,
  context: { providerId?: string; approvedBy?: string; errorReason?: string; now?: Date } = {}
): TransitionResult {
  if (!canTransition(post.state, to)) {
    return {
      ok: false,
      post,
      reason: `Cannot move a post from ${post.state} to ${to}.`,
    };
  }

  if (to === 'APPROVED' && !context.approvedBy) {
    return {
      ok: false,
      post,
      reason: 'Approving a post requires the name of the human who approved it.',
    };
  }

  if (to === 'PUBLISHED') {
    const providerId = (context.providerId ?? '').trim();
    if (!providerId) {
      return {
        ok: false,
        post,
        reason:
          'A post cannot be marked PUBLISHED without a provider identifier from the platform. Use UNVERIFIED when the platform did not confirm.',
      };
    }
  }

  const updated: SocialPostRecord = {
    ...post,
    state: to,
    providerId: to === 'PUBLISHED' ? (context.providerId ?? '').trim() : post.providerId,
    approvedBy: context.approvedBy ?? post.approvedBy,
    errorReason: to === 'FAILED' || to === 'UNVERIFIED' ? context.errorReason : undefined,
    updatedAt: (context.now ?? new Date()).toISOString(),
  };

  return { ok: true, post: updated };
}