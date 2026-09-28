// ==============================================================================
// HERMES JARVIS — SECURITY MATRIX POSTURE TRUTH (backlog item 13)
//
// The Telegram `security_audit` reply (and the Telegram `/security` line) told
// the operator, in fixed text, that human approval was "Enforced for all
// external actions" and that "Passwords & API tokens strictly isolated" — for
// every process, regardless of what the Security Matrix actually held. Both
// claims are operator-flippable: `/api/security/matrix` accepts
// `humanApprovalForExternal` and `maskSensitiveData`, and
// `credentialLeakProtection` gates the LLM-context redactor. A router that
// turned the approval gate off would still be reported as enforcing it.
//
// This module builds the posture line from the state that was actually read,
// and never upgrades an unknown state to a claim.
// ==============================================================================

export interface SecurityMatrixSnapshot {
  currentLevel?: number | null;
  humanApprovalForExternal?: boolean | null;
  maskSensitiveData?: boolean | null;
  credentialLeakProtection?: boolean | null;
}

export interface SecurityMatrixPosture {
  levelLabel: string;
  /** Observed tri-state line for the external-action approval gate. */
  humanApproval: string;
  /** Observed tri-state line for the stored-secret protection flag. */
  secretMasking: string;
  /** Observed tri-state line for the LLM-context credential redactor. */
  credentialLeakProtection: string;
}

/** An explicit boolean is a measurement; anything else is UNKNOWN. */
export function triState(value: boolean | null | undefined, whenTrue: string, whenFalse: string): string {
  if (value === true) return whenTrue;
  if (value === false) return whenFalse;
  return 'UNKNOWN — not observed';
}

export function securityMatrixPosture(state: SecurityMatrixSnapshot | null | undefined): SecurityMatrixPosture {
  const level = state?.currentLevel;
  return {
    levelLabel:
      typeof level === 'number' && Number.isFinite(level) ? `Level ${level}` : 'UNKNOWN',
    humanApproval: triState(
      state?.humanApprovalForExternal,
      'Enforced for all external actions',
      'DISABLED — external actions are not gated by human approval',
    ),
    secretMasking: triState(
      state?.maskSensitiveData,
      'Passwords & API tokens strictly isolated',
      'DISABLED — stored credentials are not masked',
    ),
    credentialLeakProtection: triState(
      state?.credentialLeakProtection,
      'Enabled — outbound model context is redacted',
      'DISABLED — outbound model context is not redacted',
    ),
  };
}
