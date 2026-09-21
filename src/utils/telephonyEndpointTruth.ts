// ==============================================================================
// HERMES JARVIS — TELEPHONY WEBHOOK ENDPOINT TRUTH
//
// The Telephony Hub panel listed its webhook endpoints with unconditional
// green "LIVE & READY" / "TwiML ACTIVE" / "GEMINI BRAIN READY" badges. Two
// problems: the status was never measured, and one advertised route,
// POST /api/telephony/twiml/voice, does not exist — the server only registers
// /api/telephony/incoming, /api/telephony/handle-turn and
// /api/telephony/twiml/turn. The Twilio adapter also used the non-existent
// path as its post-answer callback, so a carrier following it would 404.
//
// These helpers make the labels say only what was observed: the endpoint
// inventory is checked against the routes this server actually registers, and
// the readiness badges stay UNKNOWN until the relevant status request answers.
// ==============================================================================

/** Route every TwiML/Twilio callback must target; must exist on the server. */
export const TELEPHONY_TWIML_TURN_PATH = '/api/telephony/twiml/turn';

/** The exact telephony webhook paths registered in server.ts. */
export const REGISTERED_TELEPHONY_ENDPOINTS = [
  '/api/telephony/incoming',
  '/api/telephony/handle-turn',
  '/api/telephony/twiml/turn',
] as const;

// The path the UI used to advertise and the outbound adapter used as its
// callback. Kept as a named export only so tests can assert it never reappears
// in shipped source.
export const NONEXISTENT_TWIML_VOICE_PATH = '/api/telephony/twiml/voice';

export function telephonyEndpointRegistered(path: string): boolean {
  return (REGISTERED_TELEPHONY_ENDPOINTS as readonly string[]).includes(path);
}

/**
 * Readiness badge for a telephony endpoint. Never "ACTIVE"/"READY": an
 * unmeasured endpoint reads UNKNOWN, an unregistered one reads NONE.
 */
export function telephonyEndpointLabel(path: string, statusKnown: boolean): string {
  if (!telephonyEndpointRegistered(path)) return 'NO SUCH ROUTE';
  if (!statusKnown) return 'UNKNOWN';
  return 'ROUTE REGISTERED';
}

/**
 * Badge for the Gemini reasoning path behind /api/telephony/handle-turn. It is
 * only genuinely ready when the gateway is configured AND the API key is
 * present; otherwise the turn is served by the offline heuristic engine.
 */
export function telephonyBrainLabel(gatewayConfigured: boolean | undefined, geminiConfigured: boolean | undefined): string {
  if (gatewayConfigured === undefined || geminiConfigured === undefined) return 'UNKNOWN (status not queried)';
  if (!geminiConfigured) return 'OFFLINE ENGINE (no API key)';
  return gatewayConfigured ? 'GEMINI BRAIN CONFIGURED' : 'GATEWAY NOT CONFIGURED';
}

/** The telephony status body as `/api/telephony/status` returns it. */
export interface TelephonyStatusSnapshot {
  isConfigured?: boolean;
}

/**
 * Tri-state readiness for the telephony surfaces. `UNKNOWN` until the status
 * request actually answers with a boolean — a `null`/absent snapshot is not
 * evidence that the gateway is up, and not evidence that it is down either.
 */
export type TelephonyReadiness = 'UNKNOWN' | 'NOT_CONFIGURED' | 'CONFIGURED';

export function telephonyReadiness(
  status: TelephonyStatusSnapshot | null | undefined,
): TelephonyReadiness {
  if (!status || typeof status.isConfigured !== 'boolean') return 'UNKNOWN';
  return status.isConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED';
}

/**
 * Header badge for the voice-agent surface. The panel used to print a green
 * pulsing `VOICE AGENT ACTIVE` unconditionally, before (or without) any status
 * measurement. "Configured" is the most this process can observe: a provider
 * is configured, not that an agent is running.
 */
export function voiceAgentLabel(status: TelephonyStatusSnapshot | null | undefined): string {
  const readiness = telephonyReadiness(status);
  if (readiness === 'UNKNOWN') return 'VOICE AGENT UNKNOWN';
  return readiness === 'CONFIGURED' ? 'VOICE GATEWAY CONFIGURED' : 'VOICE AGENT NOT CONFIGURED';
}

/**
 * Badge for the AI Receptionist panel. `READY TO ANSWER` was hardcoded green
 * even with no telephony provider configured, so it asserted an answering
 * capability nothing had established.
 */
export function receptionistLabel(status: TelephonyStatusSnapshot | null | undefined): string {
  const readiness = telephonyReadiness(status);
  if (readiness === 'UNKNOWN') return 'RECEPTIONIST UNKNOWN';
  return readiness === 'CONFIGURED' ? 'RECEPTIONIST GATEWAY CONFIGURED' : 'RECEPTIONIST UNAVAILABLE';
}
