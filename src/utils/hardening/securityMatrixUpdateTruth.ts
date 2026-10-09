// ==============================================================================
// HERMES JARVIS — SECURITY MATRIX UPDATE HONESTY (backlog item 13)
//
// `POST /api/security/update` copied whichever fields were present in the
// request body over the running matrix and answered `{ success: true }`
// unconditionally. Three false-success shapes followed from that:
//
//   • an empty body was reported as a successful save;
//   • a `currentLevel` outside the real 1..4 range was stored as-is, so the
//     gateway compared against a level the matrix never defines;
//   • an unknown field (a typo, or a key from a stale client) was written into
//     the matrix and reported as applied — and for `humanApprovalForExternal` /
//     `maskSensitiveData` a non-boolean string read as truthy in every `if`
//     gate downstream while displaying as "not true" in tri-state renderers.
//
// The matrix is the surface that gates external actions and credential
// masking, so an update that changed nothing must not read as a change. This
// module classifies the body against the real fields and returns an explicit
// verdict the route can answer with.
// ==============================================================================

export type RiskLevel = 1 | 2 | 3 | 4;

/** The mutable subset of the Security Matrix. */
export interface SecurityMatrixValues {
  currentLevel?: RiskLevel;
  humanApprovalForExternal?: boolean;
  maskSensitiveData?: boolean;
}

export type SecurityMatrixUpdateVerdict =
  | {
      accepted: true;
      applied: SecurityMatrixValues;
      rejected: string[];
      message: string;
    }
  | {
      accepted: false;
      reason: 'NO_KEYS' | 'ALL_INVALID';
      rejected: string[];
      message: string;
    };

const KNOWN_FIELDS = ['currentLevel', 'humanApprovalForExternal', 'maskSensitiveData'] as const;
const VALID_LEVELS: readonly number[] = [1, 2, 3, 4];

/**
 * The full set of gate values the route echoes back to the client. The route
 * must answer with the matrix state *after* the classified fields are applied,
 * not a snapshot taken before. Returning the pre-apply values alongside
 * `success: true` told the client a toggle had changed while handing back the
 * old value, so a UI that trusts the response rendered the un-applied state.
 */
export interface SecurityMatrixGateValues extends SecurityMatrixValues {
  credentialLeakProtection?: boolean;
}

/**
 * Project a matrix state with the accepted update applied. This is what the
 * route must return so the echoed gates match what was really stored.
 */
export function applySecurityMatrixUpdate<T extends SecurityMatrixGateValues>(
  current: T,
  applied: SecurityMatrixValues
): T {
  const next: T = { ...current };
  if (applied.currentLevel !== undefined) next.currentLevel = applied.currentLevel;
  if (applied.humanApprovalForExternal !== undefined) {
    next.humanApprovalForExternal = applied.humanApprovalForExternal;
  }
  if (applied.maskSensitiveData !== undefined) next.maskSensitiveData = applied.maskSensitiveData;
  return next;
}

/**
 * Classify a security-matrix update body.
 *
 * Only known fields with a valid value are applied. An unknown field or an
 * out-of-range / wrong-typed value is rejected rather than silently coerced.
 * The caller gets a distinct verdict for "nothing was asked" and "nothing
 * asked was real" so it can answer honestly instead of claiming a save.
 */
export function classifySecurityMatrixUpdate(body: unknown): SecurityMatrixUpdateVerdict {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      accepted: false,
      reason: 'NO_KEYS',
      rejected: [],
      message: 'No security-matrix field was present in the request body; nothing was changed.',
    };
  }

  const entries = Object.entries(body as Record<string, unknown>);
  const applied: SecurityMatrixValues = {};
  const rejected: string[] = [];

  for (const [key, value] of entries) {
    if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
      rejected.push(key);
      continue;
    }

    if (key === 'currentLevel') {
      if (typeof value !== 'number' || !VALID_LEVELS.includes(value)) {
        rejected.push(key);
        continue;
      }
      applied.currentLevel = value as RiskLevel;
      continue;
    }

    // humanApprovalForExternal / maskSensitiveData are booleans. A string such
    // as "false" must not be accepted: it is truthy in the server's gates.
    if (typeof value !== 'boolean') {
      rejected.push(key);
      continue;
    }
    if (key === 'humanApprovalForExternal') applied.humanApprovalForExternal = value;
    else applied.maskSensitiveData = value;
  }

  const appliedCount = Object.keys(applied).length;
  if (appliedCount === 0) {
    return {
      accepted: false,
      reason: entries.length === 0 ? 'NO_KEYS' : 'ALL_INVALID',
      rejected,
      message:
        entries.length === 0
          ? 'No security-matrix field was present in the request body; nothing was changed.'
          : `None of the supplied security-matrix fields were valid (${rejected.join(', ')}); nothing was changed.`,
    };
  }

  return {
    accepted: true,
    applied,
    rejected,
    message:
      rejected.length > 0
        ? `Applied ${appliedCount} security-matrix field(s); ignored unknown/invalid field(s): ${rejected.join(', ')}.`
        : `Applied ${appliedCount} security-matrix field(s).`,
  };
}
