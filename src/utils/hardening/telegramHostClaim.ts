// =============================================================================
// HERMES JARVIS — Telegram gateway hosting + history truth (backlog item 13)
//
// Two operator-facing Telegram surfaces asserted things nothing observed.
//
//  1. The `/start` welcome (and the plain-language fallbacks) told the operator
//     `Connected to your Oracle Always Free ARM VM (24/7 Daemon Active)`. This
//     process never contacts an OCI control plane; the only hosting fact it can
//     derive is a hostname match (see `ociInstanceTruth.ts`), and the daemon may
//     well not be running on that instance at all.
//
//  2. `telegramMessages` seeded a three-message "transcript" — a bot greeting
//     plus a `PROJECT AUDIT REPORT` naming two repositories, a clean `main`
//     branch, `0 open issues` and a completed "Oracle VM deployment sync" — on a
//     cold start, before any message was received. `/api/telegram/messages`
//     returns that array, so the gateway and web panel rendered a fabricated
//     audit as a recorded exchange.
//
// These helpers build the copy from the one hosting fact that was measured and
// seed a non-transcript startup notice instead of a pretend conversation.
// =============================================================================

export interface LocalHostIdentity {
  hostname: string;
  /** True only when a real hostname check matched an Oracle/OCI signature. */
  isOracleLike: boolean;
}

/** The hosting claim, derived from the measured host identity. Never assumes. */
export function telegramHostClaim(identity: LocalHostIdentity): string {
  if (identity.isOracleLike) {
    return (
      `this daemon process is running on host "${identity.hostname}", whose ` +
      'hostname identifies it as an Oracle/OCI instance (hostname match only — ' +
      'the OCI control plane is not queried)'
    );
  }
  return (
    `this daemon process is running on host "${identity.hostname}", which does ` +
    'not identify as an Oracle instance; any Oracle hosting claim is NOT verified'
  );
}

/**
 * The single startup entry the gateway may seed. It is explicitly not a
 * transcript: no message was exchanged and no work was performed.
 */
export function telegramGatewayWelcome(identity: LocalHostIdentity): string {
  return (
    '🤖 *HERMES JARVIS MOBILE GATEWAY READY*\n\n' +
    'No Telegram message has been exchanged in this session — this is a startup ' +
    'notice, not a transcript.\n' +
    `• *Hosting*: ${telegramHostClaim(identity)}.\n` +
    '• *Work performed*: none. No project audit, repository check or cloud sync ' +
    'has run.\n\n' +
    'Send a command to run real work; results are reported only from what this ' +
    'daemon actually reads.'
  );
}

export interface SeededTelegramMessage {
  id: string;
  sender: 'user' | 'jarvis_bot';
  text: string;
  timestamp: string;
  type: 'text' | 'voice_command' | 'action_card' | 'report';
}

/** A cold-start history: one honest notice, never a fabricated exchange. */
export function telegramSeedMessages(
  identity: LocalHostIdentity,
  now: string = new Date().toISOString(),
): SeededTelegramMessage[] {
  return [
    {
      id: 'tg-1',
      sender: 'jarvis_bot',
      text: telegramGatewayWelcome(identity),
      timestamp: now,
      type: 'text',
    },
  ];
}
