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

import type { DeliveryInterpretation } from '../communication/telegramDelivery';

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

// =============================================================================
// DELIVERY TRUTH
//
// `POST /api/routines/trigger` composed the briefing and answered
// `triggered: true` without ever pushing it. On a server with no configured
// Telegram chat — the normal case in this sandbox — the slot still read as a
// triggered briefing, and an operator could not tell a delivered routine from
// one that was only built in memory. Triggering composes; delivery is a
// separate, observable event. This helper attempts the real push and reports
// exactly what the Telegram layer observed.
// =============================================================================

export interface RoutineTriggerDelivery {
  triggered: boolean;
  delivered: boolean;
  outcome: DeliveryInterpretation['outcome'];
  message: string;
}

/**
 * Compose and push a routine's briefing, returning the honest delivery verdict.
 *
 * `deliver` is the real Telegram send (injected so the decision logic is
 * testable without a network). A result is delivered only when Telegram
 * confirmed it with a message id (`outcome === 'VERIFIED'`); every other
 * outcome — no chat, permission refusal, provider error — is reported as
 * triggered-but-not-delivered rather than as a completed briefing.
 */
export async function routineTriggerDelivery(
  chatId: string | number | null | undefined,
  title: string,
  content: string,
  deliver: (
    chatId: string | number | null | undefined,
    text: string,
    replyMarkup?: unknown
  ) => Promise<DeliveryInterpretation | null | undefined>,
): Promise<RoutineTriggerDelivery> {
  const text = `📋 *${title}*\n\n${content}`;
  const result = await deliver(chatId, text);
  const outcome = result?.outcome ?? 'NOT_CONFIGURED';
  const delivered = outcome === 'VERIFIED';
  return {
    triggered: true,
    delivered,
    outcome,
    message: delivered
      ? `Routine triggered and delivered to Telegram as message ${result?.messageId}.`
      : `Routine triggered, but no Telegram message was delivered (${outcome}).`,
  };
}
