// ==============================================================================
// HERMES JARVIS — Blueprint deliverable-toggle client honesty (backlog item 13)
//
// `handleToggleDeliverable` in `BlueprintRoadmapModal.tsx` fired
// `POST /api/blueprint/toggle-item` and branched only on `data.success`:
//
//     const data = await res.json();
//     if (data.success) {
//       fetchBlueprint();
//     }
//
// The route is deliberately honest and refuses two shapes of a toggle that did
// not happen: a malformed body (unknown `phaseId`, out-of-range `itemIndex`)
// answers HTTP 400 `{ success: false, applied: false, error }`, and a tick whose
// write could not reach durable storage is rolled back and answers HTTP 500
// `{ success: false, applied: false, persisted: false, error }`. The handler
// discarded both: a refused tick showed no notice at all, so the operator's
// click either silently did nothing (checklist desynced from the server) or, on
// a non-durable write, looked saved for the moment and vanished on the next
// load. There was also no `res.ok` check, so a non-JSON error page would throw
// inside `res.json()` and be swallowed by the `catch`.
//
// This module classifies the reply. Only the server's own `success: true`
// (with `applied` not explicitly false) counts as a recorded tick; anything else
// surfaces the server's reason instead of a silent no-op.
// ==============================================================================

export type BlueprintToggleTone = 'success' | 'error';

export interface BlueprintToggleOutcome {
  /** True only for the server's own confirmation of an applied, durable toggle. */
  recorded: boolean;
  /** The line the modal should display. */
  message: string;
  tone: BlueprintToggleTone;
  /** True when the checklist should be re-read from the server to resync. */
  refresh: boolean;
}

/** A non-empty server string reason, or null. */
function asReason(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Classify the `/api/blueprint/toggle-item` reply. A reply is a recorded tick
 * only when it carries a real `success: true`; `applied: false` is a definite
 * refusal even if `success` was somehow truthy. Every other shape (a refusal,
 * a malformed body, a non-boolean truthy `success`) yields `recorded: false`
 * with an honest message.
 */
export function blueprintToggleOutcome(body: unknown): BlueprintToggleOutcome {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  if (b.success === true && b.applied !== false) {
    return {
      recorded: true,
      message: 'Blueprint checklist tick saved.',
      tone: 'success',
      refresh: true,
    };
  }

  const reason =
    asReason(b.error) ||
    asReason(b.message) ||
    asReason(b.reason) ||
    'The blueprint tick was not saved on the server; the checklist is unchanged.';

  return { recorded: false, message: reason, tone: 'error', refresh: false };
}
