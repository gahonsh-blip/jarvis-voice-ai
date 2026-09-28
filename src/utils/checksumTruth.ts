// ==============================================================================
// HERMES JARVIS — PAYLOAD CHECKSUM (REAL, NOT A SHA DIGEST)
//
// The permission card used to print "Payload Checksum: Verified SHA-Safe" for
// every pending request. Nothing in this process hashed the payload, and no
// SHA-2 value existed anywhere: the string was a fabricated integrity claim on
// the one screen a human reads before approving an external action.
//
// This module computes a real, cheap, non-cryptographic FNV-1a 32-bit hash of
// the payload text so the card can show a reproducible marker, and labels it
// truthfully. It is deliberately NOT described as SHA-safe or a security
// control: a local integrity marker is not tamper protection and must not be
// presented as one.
// ==============================================================================

/** FNV-1a 32-bit hash of a string, rendered as 8 lowercase hex chars. */
export function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Honest checksum line for the approval card. With no payload text there is
 * nothing to hash, so it says so instead of printing a green tick.
 */
export function payloadChecksumLine(payloadText: string | null | undefined): string {
  const text = (payloadText ?? '').trim();
  if (!text) return 'Payload Checksum: NONE (no payload text to hash)';
  return `Payload Checksum: FNV-1a32 ${fnv1a32Hex(text)} (local integrity marker, not SHA-2)`;
}

/**
 * Footer label for the cron scheduler. The scheduler's liveness is only known
 * when the status request actually answered; an absent answer is UNKNOWN, never
 * "Active".
 */
export function cronSchedulerLabel(statusKnown: boolean, running: boolean | undefined): string {
  if (!statusKnown) return 'Cron Scheduler: UNKNOWN (status not queried)';
  return running ? 'Cron Scheduler: running' : 'Cron Scheduler: not running';
}

/**
 * Delivery readiness label for the Telegram mobile push. A missing bot token or
 * an unqueried status can never read as "Ready".
 */
export function telegramPushLabel(statusKnown: boolean, live: boolean | undefined): string {
  if (!statusKnown) return 'Telegram Push: UNKNOWN (status not queried)';
  return live ? 'Telegram Push: live-connected' : 'Telegram Push: NOT CONNECTED';
}