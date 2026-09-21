// ==============================================================================
// HERMES JARVIS — MESSAGE-REPLY DISPATCH, STATED HONESTLY
//
// The pending-approval queue's REPLY button never asked for a distinct human
// approval, never called the server, and marked the event AUTHORIZED with a
// fixed note because both branches of its ternary were the same string. The
// server route (/api/mobile/bridge/message/reply) refuses any reply without
// `approved: true`, so every one of those "dispatches" was a claim about an
// HTTP call that was never made.
//
// This module holds the pure decision + outcome mapping so the component cannot
// claim authorization or dispatch it did not observe. A reply is only ever
// "DISPATCHED" after the server answers, and never "CONFIRMED" without an
// explicit verified flag from the response.
// ==============================================================================

/** Why a reply could not be composed into a dispatch request. */
export type ReplyDispatchRefusal =
  | 'NOT_REPLY_EVENT'
  | 'NO_REPLY_TEXT'
  | 'SENSITIVE_CONTENT'
  | 'NO_DISTINCT_APPROVAL';

export type ReplyDispatchDecision =
  | { ok: true; replyText: string; notificationId: string }
  | { ok: false; refusal: ReplyDispatchRefusal };

export interface ReplyEventShape {
  kind: string;
  notificationId?: string;
  /** The human-composed reply body, if one exists. Never the notification preview. */
  replyText?: string | null;
  sensitive?: boolean;
}

/**
 * Decide whether a reply may be sent. Approval must be a distinct human act
 * (`distinctApproval` true), not the click that opened the queue. Sensitive
 * events are refused rather than silently replying with a redacted body.
 */
export function replyDispatchDecision(
  ev: ReplyEventShape,
  distinctApproval: boolean
): ReplyDispatchDecision {
  if (ev.kind !== 'MESSAGE_REPLY') return { ok: false, refusal: 'NOT_REPLY_EVENT' };
  if (ev.sensitive) return { ok: false, refusal: 'SENSITIVE_CONTENT' };
  if (!distinctApproval) return { ok: false, refusal: 'NO_DISTINCT_APPROVAL' };
  const text = typeof ev.replyText === 'string' ? ev.replyText.trim() : '';
  if (!text) return { ok: false, refusal: 'NO_REPLY_TEXT' };
  return { ok: true, replyText: text, notificationId: ev.notificationId || '' };
}

/** The subset of the reply response this helper reads. */
export interface ReplyResponseShape {
  success?: boolean;
  outcome?: string;
  verified?: boolean;
  dispatchId?: string;
  message?: string;
  error?: string;
}

export type ReplyDispatchOutcome =
  | 'DISPATCHED'
  | 'BLOCKED'
  | 'NOT_CONFIGURED'
  | 'FAILED'
  | 'UNVERIFIED';

/**
 * Map a real HTTP response to an honest outcome. A failed request never maps to
 * a dispatching outcome, and DISPATCHED always means "the device has not
 * confirmed it yet" — the server only reports VERIFIED through the separate
 * action/confirm route.
 */
export function replyDispatchOutcome(
  httpStatus: number,
  body: ReplyResponseShape | null | undefined
): ReplyDispatchOutcome {
  if (httpStatus === 0) return 'NOT_CONFIGURED';
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 423 || httpStatus === 409) {
    return 'BLOCKED';
  }
  if (httpStatus < 200 || httpStatus >= 300 || !body) return 'FAILED';
  if (body.outcome === 'DISPATCHED') {
    return body.verified === true ? 'UNVERIFIED' : 'DISPATCHED';
  }
  if (body.success === true) return 'UNVERIFIED';
  return 'FAILED';
}

/** Operator-facing speech for each outcome. Never asserts confirmation. */
export function replyDispatchSpeech(outcome: ReplyDispatchOutcome, language?: string): string {
  const hi = (language || '').toLowerCase().startsWith('hi');
  switch (outcome) {
    case 'DISPATCHED':
      return hi
        ? '\u091c\u0935\u093e\u092c \u0921\u093f\u0935\u093e\u0907\u0938 \u0915\u094b \u092d\u0947\u091c\u093e \u0917\u092f\u093e, \u0932\u0947\u0915\u093f\u0928 \u0921\u093f\u0932\u0940\u0935\u0930\u0940 \u0905\u092d\u0940 \u092a\u0941\u0937\u094d\u091f \u0928\u0939\u0940\u0902 \u0939\u0941\u0908, \u0938\u0930\u0964'
        : 'Reply dispatched to the device. Delivery is not confirmed yet, Sir.';
    case 'BLOCKED':
      return hi
        ? '\u091c\u0935\u093e\u092c \u0905\u0938\u094d\u0935\u0940\u0915\u093e\u0930 \u0939\u0941\u0906 \u2014 \u0905\u0928\u0941\u092e\u0924\u093f \u092f\u093e \u0938\u0941\u0930\u0915\u094d\u0937\u093e \u0917\u0947\u091f \u0928\u0947 \u0930\u094b\u0915\u093e, \u0938\u0930\u0964'
        : 'Reply refused — approval or the security gate blocked it, Sir.';
    case 'NOT_CONFIGURED':
      return hi
        ? '\u0915\u094b\u0908 \u0932\u093e\u0907\u0935 Android \u092c\u094d\u0930\u093f\u091c \u092a\u0902\u091c\u0940\u0915\u0943\u0924 \u0928\u0939\u0940\u0902 \u0939\u0948, \u0938\u0930\u0964'
        : 'No live Android bridge is registered, so no reply was sent, Sir.';
    case 'UNVERIFIED':
      return hi
        ? '\u0938\u0930\u094d\u0935\u0930 \u0928\u0947 \u092a\u0941\u0937\u094d\u091f\u093f \u0928\u0939\u0940\u0902 \u0926\u0940 \u2014 \u091c\u0935\u093e\u092c \u092d\u0947\u091c\u093e \u0917\u092f\u093e \u0925\u093e \u092f\u093e \u0928\u0939\u0940\u0902, \u092f\u0939 \u0938\u094d\u092a\u0937\u094d\u091f \u0928\u0939\u0940\u0902, \u0938\u0930\u0964'
        : 'The server did not confirm the reply, Sir.';
    default:
      return hi
        ? '\u091c\u0935\u093e\u092c \u092d\u0947\u091c\u0928\u093e \u0935\u093f\u092b\u0932 \u0930\u0939\u093e, \u0938\u0930\u0964'
        : 'Reply dispatch failed, Sir.';
  }
}

/** Speech for a refusal decided before any request is sent. */
export function replyRefusalSpeech(refusal: ReplyDispatchRefusal, language?: string): string {
  const hi = (language || '').toLowerCase().startsWith('hi');
  switch (refusal) {
    case 'SENSITIVE_CONTENT':
      return hi
        ? '\u0938\u0902\u0935\u0947\u0926\u0928\u0936\u0940\u0932 \u0938\u0902\u0926\u0947\u0936 \u092a\u0930 \u0938\u094d\u0935\u091a\u093e\u0932\u093f\u0924 \u091c\u0935\u093e\u092c \u0928\u0939\u0940\u0902 \u092d\u0947\u091c\u093e \u091c\u093e\u0924\u093e, \u0938\u0930\u0964'
        : 'Sensitive messages are not auto-replied to, Sir.';
    case 'NO_DISTINCT_APPROVAL':
      return hi
        ? '\u091c\u0935\u093e\u092c \u092d\u0947\u091c\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0906\u092a\u0915\u0940 \u0905\u0932\u0917 \u0938\u094d\u0935\u0940\u0915\u0943\u0924\u093f \u091a\u093e\u0939\u093f\u090f, \u0938\u0930\u0964'
        : 'I need your explicit approval before sending that reply, Sir.';
    case 'NO_REPLY_TEXT':
      return hi
        ? '\u0915\u094b\u0908 \u091c\u0935\u093e\u092c \u092a\u093e\u0920 \u0928\u0939\u0940\u0902 \u0925\u093e, \u0938\u0930\u0964'
        : 'There was no reply text to send, Sir.';
    default:
      return hi
        ? '\u092f\u0939 \u091c\u0935\u093e\u092c \u092a\u094d\u0930\u0936\u094d\u0928 \u0928\u0939\u0940\u0902 \u0939\u0948, \u0938\u0930\u0964'
        : 'That item is not a reply request, Sir.';
  }
}
