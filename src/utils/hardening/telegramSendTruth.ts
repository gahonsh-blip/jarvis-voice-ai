// =============================================================================
// HERMES JARVIS — Telegram gateway send truth (backlog item 13)
//
// The web gateway's "send" flow was the last Telegram surface that claimed more
// than it observed.
//
//  * `/api/telegram/send` always answered `success: true`. It relied on
//    `processMobileCommand`, which fired the outbound Telegram send
//    fire-and-forget and returned immediately. A failed or blocked send still
//    rendered in the panel as a sent message, and the bot reply was spoken
//    aloud even when nothing was delivered.
//  * The web client is the surface a human reads. It must not render a message
//    as delivered unless Telegram returned a `message_id`, and it must say
//    plainly when only the local echo advanced.
//
// The local transcript (`telegramMessages`) records what the command processor
// decided, whether or not Telegram accepted it. These helpers keep that
// distinction in the rendered bubble and gate the returned `success`.
// =============================================================================

import type { DeliveryInterpretation } from '../communication/telegramDelivery';

export interface GatewaySendResult {
  /** True only when Telegram confirmed the outbound delivery. */
  delivered: boolean;
  outcome: DeliveryInterpretation['outcome'];
  messageId?: number;
  errorReason?: string;
}

/**
 * Build the delivery view the send route returns.
 *
 * `delivery` is undefined only when the command produced no outbound attempt
 * (no configured bot/target). That is `NOT_CONFIGURED`/undelivered, never a
 * success — the local echo alone is not proof a message left this process.
 */
export function gatewaySendResult(
  delivery: DeliveryInterpretation | undefined | null,
): GatewaySendResult {
  if (!delivery) {
    return {
      delivered: false,
      outcome: 'NOT_CONFIGURED',
      errorReason:
        'No Telegram delivery was attempted (bot token or target chat id missing in this environment). The exchange is recorded locally only.',
    };
  }
  return {
    delivered: delivery.delivered,
    outcome: delivery.outcome,
    messageId: delivery.messageId,
    errorReason: delivery.errorReason,
  };
}

/**
 * The bubble text the panel should render for an outbound reply.
 *
 * A confirmed delivery is annotated with Telegram's message id. An unconfirmed
 * one carries an explicit notice so a human never reads the echoed text as a
 * message their phone received.
 */
export function telegramGatewayBubble(
  botText: string,
  result: GatewaySendResult,
): string {
  if (result.delivered) {
    return `${botText}\n\n_✅ Delivered to Telegram (message id ${result.messageId})._`;
  }
  const reason = result.errorReason ?? result.outcome;
  return `${botText}\n\n_⚠️ NOT DELIVERED to Telegram — ${reason} This reply is recorded in the JARVIS gateway only._`;
}

/** One-line status for the send notice strip, honest about the outcome. */
export function telegramGatewayNotice(result: GatewaySendResult): {
  ok: boolean;
  message: string;
} {
  if (result.delivered) {
    return {
      ok: true,
      message: `Telegram confirmed delivery (message id ${result.messageId}).`,
    };
  }
  return {
    ok: false,
    message: `Reply processed locally but NOT delivered to Telegram — ${
      result.errorReason ?? result.outcome
    }`,
  };
}
