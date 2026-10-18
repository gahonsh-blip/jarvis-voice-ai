// ==============================================================================
// HERMES JARVIS — COMPUTER OPERATOR GUARD POSTURE TRUTH (backlog item 13)
//
// `ComputerOperatorModal`'s footer printed a fixed string on every render:
//
//   "Level 1-4 Guard Active: Financial exclusions hard-locked | Secrets &
//    tokens redacted"
//
// Nothing in that sentence was measured. The approval and masking gates it
// claims (`humanApprovalForExternal`, `maskSensitiveData`,
// `credentialLeakProtection`) are all operator-flippable through
// `/api/security/update`, so a router that disabled the external-action
// approval gate or the credential masking would still be shown as enforcing
// both. The "Level 1-4" claim likewise asserted coverage no reading confirmed.
//
// The footer must be built from the Security Matrix state actually read. An
// unobserved flag is named as UNKNOWN, never upgraded to a claim.
// ==============================================================================

import { securityMatrixLevelBadge } from './securityMatrixTruth';

export interface OperatorGuardSnapshot {
  currentLevel?: number | null;
  humanApprovalForExternal?: boolean | null;
  maskSensitiveData?: boolean | null;
  credentialLeakProtection?: boolean | null;
}

/** Shown when the guard posture has not been observed (no `/api/security` reply). */
export const OPERATOR_GUARD_UNKNOWN_LABEL =
  'Guard posture UNKNOWN — /api/security did not respond';

/**
 * The refusal reason recorded for a Level-4 action the Computer Operator cannot
 * execute. Kept beside the guard badge so the footer and the execution path
 * describe the same rule, and so a test can pin the wording.
 */
export const COMPUTER_OPERATOR_LEVEL4_REFUSAL =
  'Level-4 actions (payments, credential changes, external publish) cannot be executed by the Computer Operator; route them through the Permission Gateway with named human approval.';

/** One measured gate flag → a claim, a plain "disabled", or UNKNOWN. */
function guardFlag(
  value: boolean | null | undefined,
  whenTrue: string,
  whenFalse: string,
): string {
  if (value === true) return whenTrue;
  if (value === false) return whenFalse;
  return 'UNKNOWN';
}

/**
 * Builds the Computer Operator footer's guard line from the Security Matrix
 * state that was actually read. Every clause reflects an observed value or says
 * UNKNOWN; nothing is asserted from a literal.
 */
export function operatorGuardBadge(snapshot: OperatorGuardSnapshot | null | undefined): string {
  if (!snapshot) return OPERATOR_GUARD_UNKNOWN_LABEL;

  const level = securityMatrixLevelBadge(snapshot.currentLevel);
  const approval = guardFlag(
    snapshot.humanApprovalForExternal,
    'external actions require human approval',
    'external-action approval DISABLED',
  );
  const masking = guardFlag(
    snapshot.maskSensitiveData,
    'stored secrets masked',
    'stored-secret masking DISABLED',
  );
  const redaction = guardFlag(
    snapshot.credentialLeakProtection,
    'outbound model context redacted',
    'outbound credential redaction DISABLED',
  );

  return `${level} · ${approval} · ${masking} · ${redaction}`;
}
