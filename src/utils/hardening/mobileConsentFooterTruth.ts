// ==============================================================================
// HERMES JARVIS — MOBILE CONSENT FOOTER TRUTH (backlog item 13)
//
// `MobilePersonalStatusModal` printed a fixed line in its footer on every
// render:
//
//   "Zero Unsolicited Data Access • Human Consent Active"
//
// Nothing in that sentence was measured. The gates it claims
// (`humanApprovalForExternal`, `maskSensitiveData`,
// `credentialLeakProtection`) are operator-flippable through
// `/api/security/update`, so a router that disabled the Level-4 approval gate
// or the stored-secret masking would still be shown, under a green shield, as
// enforcing both — and the "Zero Unsolicited Data Access" clause asserted a
// posture no reading confirmed.
//
// The footer must be built from the Security Matrix state actually read. An
// unobserved flag is named UNKNOWN, never upgraded to a claim.
// ==============================================================================

export interface MobileConsentSnapshot {
  humanApprovalForExternal?: boolean | null;
  maskSensitiveData?: boolean | null;
  credentialLeakProtection?: boolean | null;
}

/** Shown when the consent posture has not been observed (no `/api/security` reply). */
export const MOBILE_CONSENT_UNKNOWN_LABEL =
  'Consent posture UNKNOWN — /api/security did not respond';

/** One measured gate flag → a claim, a plain "DISABLED", or UNKNOWN. */
function gate(
  value: boolean | null | undefined,
  whenTrue: string,
  whenFalse: string,
): string {
  if (value === true) return whenTrue;
  if (value === false) return whenFalse;
  return 'UNKNOWN';
}

/**
 * Builds the Mobile Personal Status footer's consent line from the Security
 * Matrix state that was actually read. Every clause reflects an observed value
 * or says UNKNOWN; nothing is asserted from a literal.
 */
export function mobileConsentFooterLine(
  snapshot: MobileConsentSnapshot | null | undefined,
): string {
  if (!snapshot) return MOBILE_CONSENT_UNKNOWN_LABEL;

  const approval = gate(
    snapshot.humanApprovalForExternal,
    'human approval required for Level-4 actions',
    'Level-4 approval gate DISABLED',
  );
  const masking = gate(
    snapshot.maskSensitiveData,
    'stored secrets masked',
    'stored-secret masking DISABLED',
  );
  const redaction = gate(
    snapshot.credentialLeakProtection,
    'outbound credential redaction on',
    'outbound credential redaction DISABLED',
  );

  return `${approval} · ${masking} · ${redaction}`;
}

/**
 * The footer shield is green only when every gate was observed and enforcing.
 * An unknown or disabled posture is not a healthy posture.
 */
export function mobileConsentFooterHealthy(
  snapshot: MobileConsentSnapshot | null | undefined,
): boolean {
  return (
    snapshot != null &&
    snapshot.humanApprovalForExternal === true &&
    snapshot.maskSensitiveData === true &&
    snapshot.credentialLeakProtection === true
  );
}
