// HERMES JARVIS — telephony permission-update honesty.
//
// `POST /api/telephony/permissions` used to merge any caller-supplied object
// over the stored matrix and answer `success: true` unconditionally. A body
// naming a permission key that does not exist (a typo, or a key from a stale
// client) was reported as an applied change, and a request that carried no
// permission at all was reported as a successful save. Both are false
// successes on the exact surface that gates outbound calling, private-data
// access and call recording: the operator believes a permission changed when
// nothing did.

import type {
  PhonePermissionKey,
  PhonePermissionState,
} from '../../types/telephonyProvider';

export type PhonePermissionUpdateVerdict =
  | { accepted: true; applied: Record<string, PhonePermissionState>; rejected: string[]; message: string }
  | { accepted: false; reason: 'NO_KEYS' | 'ALL_UNKNOWN'; rejected: string[]; message: string };

const VALID_STATES: PhonePermissionState[] = ['NOT_CONFIGURED', 'DENIED', 'ASK', 'GRANTED'];

/**
 * Classify a permission-update body against the real definition keys.
 *
 * Only keys that exist in `definitions` are applied. Each value must be an
 * object carrying a valid `state`; anything else is rejected rather than
 * silently coerced. The caller gets a distinct verdict for "nothing was
 * asked" and "nothing asked was real" so it can answer honestly instead of
 * claiming a save.
 */
export function classifyPhonePermissionUpdate(
  body: unknown,
  definitions: readonly { key: PhonePermissionKey }[],
): PhonePermissionUpdateVerdict {
  const known = new Set<string>(definitions.map((d) => d.key as string));

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      accepted: false,
      reason: 'NO_KEYS',
      rejected: [],
      message: 'No permission key was present in the request body; nothing was changed.',
    };
  }

  const entries = Object.entries(body as Record<string, unknown>);
  const applied: Record<string, PhonePermissionState> = {};
  const rejected: string[] = [];

  for (const [key, value] of entries) {
    if (!known.has(key)) {
      rejected.push(key);
      continue;
    }
    const state = (value as { state?: unknown } | null | undefined)?.state;
    if (typeof state !== 'string' || !VALID_STATES.includes(state as PhonePermissionState)) {
      rejected.push(key);
      continue;
    }
    applied[key] = state as PhonePermissionState;
  }

  const appliedCount = Object.keys(applied).length;
  if (appliedCount === 0) {
    return {
      accepted: false,
      reason: entries.length === 0 ? 'NO_KEYS' : 'ALL_UNKNOWN',
      rejected,
      message:
        entries.length === 0
          ? 'No permission key was present in the request body; nothing was changed.'
          : `None of the supplied keys are real phone permissions (${rejected.join(', ')}); nothing was changed.`,
    };
  }

  return {
    accepted: true,
    applied,
    rejected,
    message:
      rejected.length > 0
        ? `Applied ${appliedCount} permission(s); ignored unknown key(s): ${rejected.join(', ')}.`
        : `Applied ${appliedCount} permission(s).`,
  };
}
