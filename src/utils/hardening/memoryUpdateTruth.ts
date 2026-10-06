// HERMES JARVIS — memory-update honesty.
//
// `POST /api/memory` used to spread whatever the caller sent over the stored
// memory and answer `success: true` unconditionally. A body carrying no field
// at all (an empty object, or only the inert `statUpdate` counter request) was
// reported as a completed save while nothing was stored, and a malformed value
// (a non-string `name`, a non-array `notes`) was written straight into the
// memory the app reads back. This classifies the update against the three real
// memory fields and reports what was actually stored.

export interface MemorySnapshot {
  name?: unknown;
  notes?: unknown;
  customKeyValues?: unknown;
}

export interface MemoryUpdateApplied {
  name?: string;
  notes?: unknown[];
  customKeyValues?: Record<string, string>;
}

export type MemoryUpdateOutcome =
  | 'APPLIED'
  | 'UNCHANGED'
  | 'COUNTER_REFUSED'
  | 'NOTHING_TO_APPLY'
  | 'INVALID_BODY';

export type MemoryUpdateVerdict = {
  success: boolean;
  stored: boolean;
  outcome: MemoryUpdateOutcome;
  applied: MemoryUpdateApplied;
  inertCounterRequest: boolean;
  rejected: string[];
  message: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Classify a `POST /api/memory` body against the real memory fields.
 *
 * Only `name` (non-empty string), `notes` (array) and `customKeyValues` (an
 * object of string values) are applied. `statUpdate` is never credited as
 * work: it is recognised only so the route can record the request as inert.
 * A body with no real field and no counter request is refused rather than
 * reported as a save.
 */
export function classifyMemoryUpdate(
  body: unknown,
  current: MemorySnapshot = {},
): MemoryUpdateVerdict {
  if (!isPlainObject(body)) {
    return {
      success: false,
      stored: false,
      outcome: 'INVALID_BODY',
      applied: {},
      inertCounterRequest: false,
      rejected: [],
      message: 'No memory fields were present in the request body; nothing was stored.',
    };
  }

  const applied: MemoryUpdateApplied = {};
  const rejected: string[] = [];

  if ('name' in body && body.name !== undefined) {
    if (typeof body.name === 'string' && body.name.length > 0) {
      applied.name = body.name;
    } else {
      rejected.push('name');
    }
  }

  if ('notes' in body && body.notes !== undefined) {
    if (Array.isArray(body.notes)) {
      applied.notes = body.notes;
    } else {
      rejected.push('notes');
    }
  }

  if ('customKeyValues' in body && body.customKeyValues !== undefined) {
    if (isPlainObject(body.customKeyValues)) {
      const entries = Object.entries(body.customKeyValues);
      const malformed = entries.filter(([, value]) => typeof value !== 'string');
      if (malformed.length > 0) {
        rejected.push('customKeyValues');
      } else {
        applied.customKeyValues = Object.fromEntries(entries) as Record<string, string>;
      }
    } else {
      rejected.push('customKeyValues');
    }
  }

  const statUpdate = isPlainObject(body.statUpdate) ? body.statUpdate : undefined;
  const inertCounterRequest = Boolean(
    statUpdate && (statUpdate.incrementCommand || statUpdate.incrementAction),
  );

  const appliedKeys = Object.keys(applied);

  if (appliedKeys.length > 0) {
    const currentKeys = current as Record<string, unknown>;
    const changed = appliedKeys.some((key) => {
      const next = (applied as Record<string, unknown>)[key];
      const prev = currentKeys[key];
      return key === 'name' ? next !== prev : JSON.stringify(next) !== JSON.stringify(prev);
    });

    const parts = [`Stored ${appliedKeys.join(', ')}`];
    if (!changed) parts.push('but the value(s) already matched the stored memory');
    if (rejected.length > 0) parts.push(`ignored unusable field(s): ${rejected.join(', ')}`);

    return {
      success: true,
      stored: true,
      outcome: changed ? 'APPLIED' : 'UNCHANGED',
      applied,
      inertCounterRequest,
      rejected,
      message: `${parts.join('; ')}.`,
    };
  }

  if (inertCounterRequest) {
    return {
      success: true,
      stored: false,
      outcome: 'COUNTER_REFUSED',
      applied: {},
      inertCounterRequest: true,
      rejected,
      message:
        'No memory field was stored; the request only asked to advance a caller-supplied counter, which the server did not observe.',
    };
  }

  const reason =
    rejected.length > 0
      ? `no field carried a usable value (${rejected.join(', ')})`
      : 'the request carried no memory field';
  return {
    success: false,
    stored: false,
    outcome: 'NOTHING_TO_APPLY',
    applied: {},
    inertCounterRequest: false,
    rejected,
    message: `Nothing was stored: ${reason}.`,
  };
}
