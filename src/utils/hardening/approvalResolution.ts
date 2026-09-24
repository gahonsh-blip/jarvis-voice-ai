// ==============================================================================
// HERMES JARVIS — APPROVAL RESOLUTION TRUTH
//
// /api/approvals/resolve used to mark a request EXECUTED and write an audit log
// with verificationStatus/finalTruthState "VERIFIED" unconditionally, and to
// stamp a synthetic `urn:jarvis:executed:<id>` result id. Nothing checked that
// an external action had actually run: when no execution branch matched (e.g. a
// plain pending request with no platform payload) the handler still told the
// operator the Level 4 action had been executed and verified.
//
// This module decides the honest outcome from whatever the dispatcher actually
// produced. Only a provider confirmation upgrades an approval to VERIFIED.
// ==============================================================================

import type { ExecutionOutcome } from '../executionTruth';

export interface ApprovalResolution {
  outcome: ExecutionOutcome;
  /** True only when a provider confirmation was observed. */
  executed: boolean;
  /** Real provider identifier (post URL, issue URL) when one exists. */
  evidenceRef?: string;
  errorReason?: string;
  /** Human-facing line. Never claims success for an unconfirmed action. */
  message: string;
}

function resultOf(executionResult: unknown): Record<string, any> | null {
  return executionResult && typeof executionResult === 'object'
    ? (executionResult as Record<string, any>)
    : null;
}

function hasProviderConfirmation(post: Record<string, any>): string | null {
  const urn = typeof post.providerUrn === 'string' ? post.providerUrn.trim() : '';
  return post.finalTruthState === 'VERIFIED' && urn ? urn : null;
}

/**
 * Classify the dispatcher's return value. Unknown or missing results are
 * UNVERIFIED, never success — absence of evidence is not evidence of execution.
 */
export function classifyApprovalOutcome(executionResult: unknown): ApprovalResolution {
  const r = resultOf(executionResult);

  if (!r) {
    return {
      outcome: 'UNVERIFIED',
      executed: false,
      errorReason: 'NO_EXECUTION_RESULT',
      message:
        'Approved locally. No execution result was produced, so the action is UNVERIFIED — nothing was confirmed to have run.',
    };
  }

  // Social publish path: executeApprovedAction returns { success, post, ... }.
  const post = resultOf(r.post);
  if (post) {
    const urn = hasProviderConfirmation(post);
    if (r.success === true && urn) {
      return { outcome: 'VERIFIED', executed: true, evidenceRef: urn, message: `Executed and confirmed by the provider (id ${urn}).` };
    }
    if (post.finalTruthState === 'UNVERIFIED') {
      return {
        outcome: 'UNVERIFIED',
        executed: false,
        errorReason: typeof r.errorReason === 'string' ? r.errorReason : post.errorReason,
        message: 'The provider accepted the request but did not confirm an identifier, so the action is UNVERIFIED.',
      };
    }
    return {
      outcome: 'FAILED',
      executed: false,
      errorReason: typeof r.errorReason === 'string' ? r.errorReason : post.errorReason || 'Provider did not confirm the action.',
      message: 'The provider did not confirm the action; it is recorded as FAILED, not executed.',
    };
  }

  // GitHub issue path: { success, issueUrl?, issueNumber?, error? }.
  if (typeof r.issueUrl === 'string' && r.issueUrl.trim()) {
    return { outcome: 'VERIFIED', executed: true, evidenceRef: r.issueUrl.trim(), message: 'Issue created and confirmed by GitHub.' };
  }
  if (r.success === false) {
    return {
      outcome: 'FAILED',
      executed: false,
      errorReason: typeof r.error === 'string' ? r.error : 'Execution failed.',
      message: 'Execution failed; the action is recorded as FAILED.',
    };
  }
  if (r.success === true && r.finalTruthState === 'VERIFIED') {
    return { outcome: 'VERIFIED', executed: true, message: 'Execution confirmed by the provider.' };
  }

  return {
    outcome: 'UNVERIFIED',
    executed: false,
    errorReason: 'NO_PROVIDER_CONFIRMATION',
    message:
      'Approved locally, but no provider confirmation was received. The action is UNVERIFIED and must not be reported as executed.',
  };
}