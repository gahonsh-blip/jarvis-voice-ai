// =============================================================================
// HERMES JARVIS — Proactive routine trigger truth (backlog item 13)
//
// `POST /api/routines/trigger` answered `{ success: true, routine }` for every
// request. It matched the requested `timeSlot` against the live report store and
// fell back to `proactiveReports[0]` when nothing matched, so an unknown slot —
// or an empty store, where both the match and the fallback are `undefined` —
// still read as a triggered briefing with a routine attached.
//
// The four slots are fixed (they come from `buildProactiveReports`), so a
// request that names something else, or names nothing, never triggered anything
// and must say so instead of returning a routine picked at random.
// =============================================================================

export const ROUTINE_SLOTS = ['morning', 'midday', 'evening', 'night'] as const;

export type RoutineSlot = (typeof ROUTINE_SLOTS)[number];

export interface RoutineTriggerRequest {
  ok: boolean;
  slot: RoutineSlot | null;
  reason?: string;
}

const isSlot = (value: unknown): value is RoutineSlot =>
  typeof value === 'string' && (ROUTINE_SLOTS as readonly string[]).includes(value);

/**
 * Validate a trigger request. Only one of the four known slots is valid; an
 * absent or unrecognised value is refused rather than defaulted to the first
 * routine, which is what made an unknown slot look like a real trigger.
 */
export function resolveRoutineTrigger(timeSlot: unknown): RoutineTriggerRequest {
  if (timeSlot === undefined || timeSlot === null || timeSlot === '') {
    return {
      ok: false,
      slot: null,
      reason: `A timeSlot is required (${ROUTINE_SLOTS.join(' | ')}).`,
    };
  }
  if (!isSlot(timeSlot)) {
    return {
      ok: false,
      slot: null,
      reason: `Unknown routine slot "${String(timeSlot)}". Valid slots: ${ROUTINE_SLOTS.join(', ')}.`,
    };
  }
  return { ok: true, slot: timeSlot };
}
