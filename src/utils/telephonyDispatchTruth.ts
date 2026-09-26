// ==============================================================================
// HERMES JARVIS — TELEPHONY DISPATCH TRUTH
//
// The server voice-command switch answered every telephony call command with an
// unqualified success: `answer_call` spoke "कॉल कनेक्ट हो गया है" / "JARVIS AI
// voice agent is active" and titled the action "Call Connected"; `hangup_call`
// spoke "फोन कॉल समाप्त कर दिया गया है" (the call has ended) and titled it
// "Call Ended"; `make_call` claimed an audio channel was being established and
// set `actionExecuted = true`. None of those claims was measured. With the
// simulation adapter active — or with no carrier configured at all — nothing
// answered, nothing ended, and no channel existed, yet the transcript and the
// Security Matrix recorded performed external work.
//
// This module derives the outcome from two facts the process can actually
// observe: the engine mode of the active telephony provider (see
// telephonyGatewayTruth) and the live session state held by
// TelephonySessionManager. A simulator is never a carrier, and an unpolled
// session is never an answer.
// ==============================================================================

import { TelephonyCallState } from '../types/telephonyProvider';
import { TelephonyEngineMode } from './telephonyGatewayTruth';

export type TelephonyDispatchPhase = 'dial' | 'answer' | 'hangup' | 'reject';

export type TelephonyDispatchOutcome =
  | 'GATEWAY_CONFIRMED'
  | 'DISPATCHED_AWAITING_GATEWAY'
  | 'SIMULATION_ONLY'
  | 'NO_GATEWAY_CONFIGURED'
  | 'NO_ACTIVE_SESSION'
  | 'CALL_FAILED';

export interface TelephonyDispatchVerdict {
  /** True only when the gateway itself moved the session to the confirming state. */
  actionExecuted: boolean;
  outcome: TelephonyDispatchOutcome;
  /** Honest action title; never "Call Connected"/"Call Ended" unless confirmed. */
  title: string;
}

/** Session states that prove the carrier answered the call. */
const ANSWERED_STATES: readonly TelephonyCallState[] = ['ANSWERING', 'LISTENING', 'SPEAKING', 'WAITING_FOR_CALLER'];

/** Session states that prove a dial reached the carrier. */
const DIALED_STATES: readonly TelephonyCallState[] = ['RINGING', ...ANSWERED_STATES, 'TRANSFERRING', 'ENDING'];

function terminalOutcome(
  phase: TelephonyDispatchPhase,
  engineMode: TelephonyEngineMode,
  callState: TelephonyCallState | null | undefined,
): TelephonyDispatchOutcome | null {
  if (engineMode === 'SIMULATION_ONLY') return 'SIMULATION_ONLY';
  if (engineMode !== 'LIVE_GATEWAY') return 'NO_GATEWAY_CONFIGURED';
  if (!callState) return 'NO_ACTIVE_SESSION';
  if (callState === 'FAILED') return 'CALL_FAILED';

  if (phase === 'answer') {
    return ANSWERED_STATES.includes(callState)
      ? 'GATEWAY_CONFIRMED'
      : 'DISPATCHED_AWAITING_GATEWAY';
  }
  if (phase === 'hangup' || phase === 'reject') {
    return callState === 'ENDED' ? 'GATEWAY_CONFIRMED' : 'DISPATCHED_AWAITING_GATEWAY';
  }
  // dial
  return DIALED_STATES.includes(callState)
    ? 'GATEWAY_CONFIRMED'
    : 'DISPATCHED_AWAITING_GATEWAY';
}

const TITLES: Record<TelephonyDispatchOutcome, string> = {
  GATEWAY_CONFIRMED: 'gateway-confirmed',
  DISPATCHED_AWAITING_GATEWAY: 'Call Action Dispatched (unconfirmed)',
  SIMULATION_ONLY: 'Call Action Not Executed (simulation only)',
  NO_GATEWAY_CONFIGURED: 'Call Action Not Executed (no carrier)',
  NO_ACTIVE_SESSION: 'Call Action Not Executed (no active call)',
  CALL_FAILED: 'Call Failed',
};

export function telephonyDispatchVerdict(
  phase: TelephonyDispatchPhase,
  engineMode: TelephonyEngineMode,
  callState: TelephonyCallState | null | undefined,
): TelephonyDispatchVerdict {
  const outcome = terminalOutcome(phase, engineMode, callState) ?? 'NO_ACTIVE_SESSION';
  let title: string;
  if (outcome === 'GATEWAY_CONFIRMED') {
    title =
      phase === 'hangup' || phase === 'reject'
        ? 'Call Ended (gateway confirmed)'
        : phase === 'answer'
        ? 'Call Answered (gateway confirmed)'
        : 'Call Dialed (gateway confirmed)';
  } else {
    title = TITLES[outcome];
  }
  return { actionExecuted: outcome === 'GATEWAY_CONFIRMED', outcome, title };
}

/** Honest reply for a dispatch outcome. Hindi/Hinglish + English variants. */
export function telephonyDispatchReply(
  outcome: TelephonyDispatchOutcome,
  language: string,
): string {
  const hi = language.startsWith('hi');
  switch (outcome) {
    case 'GATEWAY_CONFIRMED':
      return hi ? 'कॉल कनेक्ट हो गया है। JARVIS AI बातचीत संभाल रहा है।' : 'The call is connected. JARVIS AI is handling the conversation.';
    case 'DISPATCHED_AWAITING_GATEWAY':
      return hi
        ? 'कॉल निर्देश गेटवे को भेज दिया गया है; कैरियर की पुष्टि मिलते ही बताऊँगा। अभी कॉल कनेक्ट होने की पुष्टि नहीं हुई है।'
        : 'The call instruction has been sent to the gateway; I will report once the carrier confirms. The call is not yet confirmed as connected.';
    case 'SIMULATION_ONLY':
      return hi
        ? 'अभी केवल सिमुलेशन प्रोवाइडर सक्रिय है — कोई कैरियर (PSTN) कॉल नहीं हुई। वास्तविक कॉल के लिए Twilio क्रेडेंशियल चाहिए।'
        : 'Only the simulation provider is active right now — no carrier (PSTN) call was placed. Real calling requires Twilio credentials.';
    case 'NO_GATEWAY_CONFIGURED':
      return hi
        ? 'कोई टेलीफोनी कैरियर कॉन्फ़िगर नहीं है, इसलिए कोई कॉल कनेक्ट नहीं हुई।'
        : 'No telephony carrier is configured, so no call was connected.';
    case 'CALL_FAILED':
      return hi ? 'कॉल विफल रही।' : 'The call failed.';
    default:
      return hi
        ? 'कोई सक्रिय कॉल नहीं मिली, इसलिए यह क्रिया नहीं हुई।'
        : 'No active call was found, so the action did not occur.';
  }
}
