// =============================================================================
// HERMES JARVIS — Telephony suite run truth (backlog item 13)
//
// `GET /api/telephony/test-suite` (`server.ts`) answered `success: true` for
// every run that returned a summary. A request that completed is not a suite
// that passed: a run with failing cases was reported to the caller as a
// success, so a UI reading only `success` would show a green telephony suite
// over red cases.
//
// The route now derives `success` from the run itself. This module owns that
// decision so the mapping from a `TestSuiteSummary` to an honest verdict can be
// exercised directly, including the two cases the route can never produce on
// its own here: a failing run and an empty one.
// =============================================================================

export interface TelephonySuiteSummaryLike {
  total: number;
  passed: number;
  failed: number;
}

export type TelephonySuiteOutcome = 'PASSED' | 'FAILED' | 'EMPTY';

export interface TelephonySuiteVerdict {
  /** True only when the run reported at least one case and none of them failed. */
  success: boolean;
  outcome: TelephonySuiteOutcome;
  message: string;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Classify a telephony test-suite run.
 *
 * A missing or malformed summary, or one that ran no cases, is `EMPTY`: nothing
 * passed, so `success` stays false. Any failing case is `FAILED`. Only a run
 * with a positive case count and zero failures is `PASSED`.
 */
export function classifyTelephonySuiteRun(
  summary: TelephonySuiteSummaryLike | null | undefined
): TelephonySuiteVerdict {
  const total = summary?.total;
  const failed = summary?.failed;

  if (!isCount(total) || !isCount(failed) || total === 0) {
    return {
      success: false,
      outcome: 'EMPTY',
      message:
        'The telephony suite reported no executed cases, so no pass can be claimed.',
    };
  }

  if (failed > 0) {
    return {
      success: false,
      outcome: 'FAILED',
      message: `The telephony suite ran ${total} case(s) and ${failed} failed.`,
    };
  }

  return {
    success: true,
    outcome: 'PASSED',
    message: `All ${total} telephony case(s) passed.`,
  };
}
