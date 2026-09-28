// ==============================================================================
// HERMES JARVIS — TELEGRAM DELIVERY VERIFICATION (backlog items 30-34)
//
// Telegram's sendMessage API returns the message it created, including a
// `message_id`. That identifier is the only proof of delivery this layer
// accepts. A response without one is treated as unconfirmed, never as sent.
// ==============================================================================

import type { ExecutionOutcome } from '../executionTruth';
import { buildReceipt, makeEvidence, type ExecutionReceipt } from '../executionTruth';

export interface DeliveryInterpretation {
  outcome: Extract<
    ExecutionOutcome,
    'VERIFIED' | 'UNVERIFIED' | 'NOT_CONFIGURED' | 'FAILED' | 'PERMISSION_REQUIRED'
  >;
  delivered: boolean;
  messageId?: number;
  errorReason?: string;
}

/**
 * Read a Telegram API result and decide what can honestly be claimed.
 *
 * `result` is whatever came back from the API call, or `null` when no call was
 * made because the bot is not configured.
 */
export function interpretTelegramSend(result: unknown): DeliveryInterpretation {
  if (result === null || result === undefined) {
    return {
      outcome: 'NOT_CONFIGURED',
      delivered: false,
      errorReason:
        'Telegram is not configured (bot token or chat id missing), so no message was sent.',
    };
  }

  if (typeof result !== 'object') {
    return {
      outcome: 'UNVERIFIED',
      delivered: false,
      errorReason: 'Telegram returned an unexpected result, so delivery could not be confirmed.',
    };
  }

  const rawId = (result as { message_id?: unknown }).message_id;
  const messageId =
    typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId ?? ''), 10);

  // Telegram assigns positive, monotonically increasing ids. Anything else is
  // not an identifier this layer is willing to treat as proof.
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return {
      outcome: 'UNVERIFIED',
      delivered: false,
      errorReason:
        'Telegram did not return a message id, so delivery could not be confirmed.',
    };
  }

  return { outcome: 'VERIFIED', delivered: true, messageId };
}

/** Classify a thrown Telegram API error into an honest outcome. */
export function classifyTelegramError(err: unknown): DeliveryInterpretation {
  const anyErr = err as
    | { message?: string; statusCode?: number; errorCode?: number }
    | undefined;
  const code = anyErr?.errorCode ?? anyErr?.statusCode;
  const message = anyErr?.message || 'Telegram send failed';

  // 403 means the user blocked the bot or never started it, and 401 means a bad
  // token. Both need a human to fix access, not a retry.
  if (code === 401 || code === 403 || code === 400) {
    return { outcome: 'PERMISSION_REQUIRED', delivered: false, errorReason: message };
  }

  return { outcome: 'FAILED', delivered: false, errorReason: message };
}

export function buildDeliveryReceipt(
  interpretation: DeliveryInterpretation,
  target: string,
): ExecutionReceipt {
  const verified = interpretation.outcome === 'VERIFIED';

  return buildReceipt({
    action: 'telegram.sendMessage',
    target,
    outcome: interpretation.outcome,
    detailEn: verified
      ? `Telegram confirmed delivery to ${target} as message ${interpretation.messageId}.`
      : `Telegram delivery to ${target} was not confirmed: ${
          interpretation.errorReason ?? interpretation.outcome
        }`,
    detailHi: verified
      ? `टेलीग्राम संदेश ${interpretation.messageId} के रूप में पहुँचा।`
      : 'टेलीग्राम संदेश की पुष्टि नहीं हुई।',
    // The API's returned message id is the evidence. buildReceipt downgrades a
    // VERIFIED claim to DISPATCHED if this is ever omitted.
    evidence: verified
      ? makeEvidence('remote_http_response', `Telegram message_id ${interpretation.messageId}`, {
          ref: String(interpretation.messageId),
        })
      : null,
    failureReason: verified ? undefined : interpretation.outcome,
  });
}