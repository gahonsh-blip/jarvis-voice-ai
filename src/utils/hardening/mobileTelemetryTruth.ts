// =============================================================================
// HERMES JARVIS — Mobile telemetry truth (backlog item 13)
//
// `GET /api/mobile/telemetry` published a `privacyMatrix.level4Enforced: true`
// literal and a `systemScheduler.activeJobs: 4` literal. Neither was measured:
//
//   * The Level 4 gate is operator-flippable through `/api/security/matrix`
//     (`humanApprovalForExternal`). A process with the gate turned off still
//     answered `level4Enforced: true`, telling a phone that external actions
//     were gated when they were not.
//   * The scheduler runs five recurring routines (four daily reports plus the
//     03:00 IST nightly repository check), not four.
//
// This module builds both fields from the state that was actually read, and
// reports an unobserved gate as `null` / UNKNOWN rather than `true`.
// =============================================================================

import { triState } from './securityMatrixTruth';

export interface PrivacyMatrixTruth {
  /** tri-state: true enforced, false explicitly disabled, null not observed. */
  level4Enforced: boolean | null;
  level4Label: string;
  /** Static category names the telemetry advertises; not claims about state. */
  categories: string[];
}

/** The recurring routines the scheduler in `server.ts` actually defines. */
export const RECURRING_ROUTINE_IDS = [
  'morning_9am',
  'midday_2pm',
  'evening_630pm',
  'night_1030pm',
  'nightly_repo_check',
] as const;

export interface SchedulerTruth {
  activeJobs: number;
  recurringRoutineIds: string[];
  scheduledGoalCount: number;
  nextBriefing: string;
  morningBriefingLastRun: string;
  note: string;
}

export function privacyMatrixTruth(
  humanApprovalForExternal: boolean | null | undefined,
  categories: string[]
): PrivacyMatrixTruth {
  const enforced = typeof humanApprovalForExternal === 'boolean' ? humanApprovalForExternal : null;
  return {
    level4Enforced: enforced,
    level4Label: triState(
      humanApprovalForExternal,
      'Enabled — external actions require human approval',
      'DISABLED — external actions are not gated by human approval',
    ),
    categories,
  };
}

export function schedulerTruth(
  lastMorningRunDate: string | null | undefined,
  scheduledGoalCount: number
): SchedulerTruth {
  return {
    activeJobs: RECURRING_ROUTINE_IDS.length + scheduledGoalCount,
    recurringRoutineIds: [...RECURRING_ROUTINE_IDS],
    scheduledGoalCount,
    // A scheduled time is a plan, not an observation. Say so.
    nextBriefing: '09:00 AM IST (scheduled; not yet observed as run)',
    morningBriefingLastRun: lastMorningRunDate || 'not recorded',
    note: 'Job count reflects the routines defined in this process; it is not a liveness measurement of each job.',
  };
}
