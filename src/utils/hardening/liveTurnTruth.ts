// ==============================================================================
// HERMES JARVIS — LIVE CALL TURN, STATED FROM WHAT WAS OBSERVED
//
// `POST /api/telephony/handle-turn` (server.ts) answers an in-call dialogue turn
// with a body of `{ success, turn: { replyText, whisperTip, ... }, source }`.
// `processTelephonyTurn` (src/utils/telephonyEngine.ts) read `replyText` and
// `whisperTip` straight off the top level, so against the live server both were
// `undefined`:
//
//   - `replyText` is appended to the transcript as a spoken agent turn
//     (`App.tsx`), so a live call showed an empty line where JARVIS's reply
//     belongs.
//   - `whisperTip` was falsy, so the "AI Whisper Tip" surface silently dropped a
//     suggestion the server had produced.
//
// The server already marks the follow-ups and the tip as unperformed/unobserved
// (`formatLiveActionItem`, `whisperTipForDisplay`). This helper lifts the turn
// out of the envelope so the truth the server sent is the truth the caller uses.
// ==============================================================================

export type LiveTurnSentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface NormalizedLiveTurn {
  replyText: string;
  whisperTip?: string;
  sentiment: LiveTurnSentiment;
  intent: string;
  shouldEndCall: boolean;
  followUpActions: string[];
}

const SENTIMENTS: readonly LiveTurnSentiment[] = ['positive', 'neutral', 'negative', 'urgent'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Lifts the turn out of the server envelope. The nested `turn` object is
 * authoritative; a flat body (the shape the old client assumed) is accepted as a
 * fallback so both wire shapes normalise. An absent reply is the empty string —
 * never an invented sentence — so a surface renders the absence rather than a
 * fabricated line.
 */
export function normalizeLiveTurn(payload: unknown): NormalizedLiveTurn {
  const body = isRecord(payload) ? payload : {};
  const turn = isRecord(body.turn) ? body.turn : body;

  const replyText = typeof turn.replyText === 'string' ? turn.replyText : '';

  const whisperRaw = typeof turn.whisperTip === 'string' ? turn.whisperTip.trim() : '';
  const whisperTip = whisperRaw || undefined;

  const sentiment = SENTIMENTS.includes(turn.sentiment as LiveTurnSentiment)
    ? (turn.sentiment as LiveTurnSentiment)
    : 'neutral';

  const intent = typeof turn.intent === 'string' && turn.intent.trim() ? turn.intent : 'conversation';

  const shouldEndCall = turn.shouldEndCall === true;

  const followUpActions = Array.isArray(turn.followUpActions)
    ? turn.followUpActions.filter((a): a is string => typeof a === 'string')
    : [];

  return { replyText, whisperTip, sentiment, intent, shouldEndCall, followUpActions };
}
