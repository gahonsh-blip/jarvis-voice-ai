// HERMES JARVIS — telephony call-record ingestion honesty.
//
// `POST /api/telephony/calls` (`server.ts`) answered `{ success: true, call }`
// for every request that carried an `id`, and spread the raw body over the
// stored record (`{ ...existing, ...callData }`). A body naming no real call
// field — or one carrying misspelled/stale keys — was reported as a saved call
// record, and the junk keys were persisted into the history the operator reads.
// The route is the write path for the call history, the post-call summary and
// the CSV export, so an invented save there is a false success on a
// user-visible surface.
//
// This classifier accepts only real `CallRecord` fields, requires a real id,
// and reports whether anything actually changed. A body that names no call
// field, or that re-states the stored record unchanged, is refused rather than
// reported as a save.

import type { CallRecord } from '../../types/telephony';

/** The real `CallRecord` keys a client may write. `id` is identity, not a change. */
export const CALL_RECORD_FIELDS = [
  'direction',
  'callerNumber',
  'callerName',
  'recipientNumber',
  'recipientName',
  'startTime',
  'endTime',
  'durationSeconds',
  'status',
  'mode',
  'objective',
  'transcript',
  'summary',
  'sentiment',
  'intent',
  'followUpActions',
  'audioRecordingUrl',
  'notes',
  'spamScore',
  'spamKeywords',
  'aiPersona',
] as const satisfies readonly (keyof CallRecord)[];

const CHANGEABLE = new Set<string>(CALL_RECORD_FIELDS);

export type TelephonyCallRecordVerdict =
  | {
      accepted: true;
      action: 'CREATED' | 'UPDATED';
      id: string;
      changes: Record<string, unknown>;
      rejected: string[];
      message: string;
    }
  | {
      accepted: false;
      reason: 'NOT_OBJECT' | 'MISSING_ID' | 'NO_RECOGNISED_FIELDS' | 'UNCHANGED';
      rejected: string[];
      message: string;
    };

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Classify a call-record write against the real field set and the stored record.
 *
 * `existing` is the record currently stored for this id, or `null` when the id
 * is new. The caller applies `changes` (which never carries an unknown key) and
 * answers from the verdict instead of asserting a save unconditionally.
 */
export function classifyTelephonyCallRecord(
  body: unknown,
  existing: Partial<CallRecord> | null,
): TelephonyCallRecordVerdict {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      accepted: false,
      reason: 'NOT_OBJECT',
      rejected: [],
      message: 'The request body is not a call record object; nothing was stored.',
    };
  }

  const record = body as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== 'string' || id.trim() === '') {
    return {
      accepted: false,
      reason: 'MISSING_ID',
      rejected: [],
      message: 'A call record id is required; nothing was stored.',
    };
  }

  const changes: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    if (!CHANGEABLE.has(key)) {
      rejected.push(key);
      continue;
    }
    changes[key] = value;
  }

  const recognised = Object.keys(changes);
  if (recognised.length === 0) {
    return {
      accepted: false,
      reason: 'NO_RECOGNISED_FIELDS',
      rejected,
      message:
        rejected.length > 0
          ? `None of the supplied keys are real call-record fields (${rejected.join(', ')}); nothing was stored.`
          : 'The request carried no call-record field; nothing was stored.',
    };
  }

  if (existing) {
    const stored = existing as Record<string, unknown>;
    const changed = recognised.some((key) => !valuesEqual(stored[key], changes[key]));
    if (!changed) {
      return {
        accepted: false,
        reason: 'UNCHANGED',
        rejected,
        message: 'The supplied fields already match the stored call record; nothing changed.',
      };
    }
    return {
      accepted: true,
      action: 'UPDATED',
      id,
      changes,
      rejected,
      message:
        rejected.length > 0
          ? `Updated call record ${id}; ignored unknown key(s): ${rejected.join(', ')}.`
          : `Updated call record ${id}.`,
    };
  }

  return {
    accepted: true,
    action: 'CREATED',
    id,
    changes,
    rejected,
    message:
      rejected.length > 0
        ? `Stored new call record ${id}; ignored unknown key(s): ${rejected.join(', ')}.`
        : `Stored new call record ${id}.`,
  };
}
