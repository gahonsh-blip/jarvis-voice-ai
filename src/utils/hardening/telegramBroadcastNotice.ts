// The morning-briefing "Send to Telegram" action reported completion on paths
// where nothing had been confirmed.
//
//  1. A network failure fell into the catch block, which printed
//     "Telegram broadcast completed (Simulated/Live): <message>". The request
//     never reached the server, so the only honest statement is that delivery
//     was not confirmed.
//  2. A 200 response whose `success` was false was reported as
//     "Telegram simulator broadcast complete." when the server omitted a
//     message. `success` is false precisely when Telegram did not return a
//     message id, i.e. the send is unconfirmed — not a completed broadcast.
//
// The server route is already honest: it derives `success` and `verified` from
// the message id Telegram returns. This module makes the client stop
// contradicting that and stop inventing a completed broadcast on transport
// failure.

export type TelegramBroadcastNoticeTone = 'success' | 'unconfirmed';

export interface TelegramBroadcastNotice {
  tone: TelegramBroadcastNoticeTone;
  text: string;
}

interface TelegramBroadcastResponseLike {
  success?: unknown;
  verified?: unknown;
  message?: unknown;
  messageId?: unknown;
}

/**
 * Read the broadcast response and say only what it proves.
 *
 * A confirmed delivery requires both `success` and `verified` to be `true`,
 * which the server sets only when Telegram returned a message id. Everything
 * else is reported as unconfirmed with the server's own reason.
 */
export function telegramBroadcastNotice(response: unknown): TelegramBroadcastNotice {
  const data = (response ?? {}) as TelegramBroadcastResponseLike;
  const messageId =
    typeof data.messageId === 'number' || typeof data.messageId === 'string'
      ? String(data.messageId)
      : null;

  if (data.success === true && data.verified === true) {
    return {
      tone: 'success',
      text: messageId
        ? `✅ Telegram confirmed delivery of the briefing (message ${messageId}).`
        : '✅ Telegram confirmed delivery of the briefing.',
    };
  }

  const detail =
    typeof data.message === 'string' && data.message.trim().length > 0
      ? data.message.trim()
      : 'Telegram did not confirm delivery.';
  return { tone: 'unconfirmed', text: `Not delivered — ${detail}` };
}

/** A thrown request is not a delivery. Report the failure, claim nothing. */
export function telegramBroadcastTransportFailure(error: unknown): TelegramBroadcastNotice {
  const detail = error instanceof Error ? error.message : String(error ?? 'unknown error');
  return {
    tone: 'unconfirmed',
    text: `Not delivered — the broadcast request failed: ${detail}. No confirmation was received.`,
  };
}
