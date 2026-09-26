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
//
// `/api/daemon/status` carried the same two fabrications on the scheduler block
// this module's mobile route had: a literal `activeJobsCount: 4` (there are
// five routines) and per-job `nextRun` strings such as "09:00 AM Tomorrow"
// presented as observations when they are only the configured plan. The daemon
// block is now built by `daemonSchedulerTruth()` from the routine table below,
// so the count and the labels cannot drift from the scheduler that runs.
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

/** A recurring routine with the last date it was actually observed to run. */
export interface RoutineSpec {
  id: string;
  name: string;
  cronOrTime: string;
  lastRunDate?: string;
}

export interface DaemonSchedulerTruth {
  active: boolean;
  activeJobsCount: number;
  jobs: {
    id: string;
    name: string;
    cronOrTime: string;
    lastRun: string;
    nextRun: string;
  }[];
  note: string;
}

/**
 * Honest scheduler block for `/api/daemon/status`. The old block hardcoded
 * `activeJobsCount: 4` and labelled each job `nextRun: '09:00 AM Tomorrow'` etc.,
 * a count and set of run labels that disagreed with the five routines the
 * process actually schedules. The count is derived from the routines passed in,
 * and every `nextRun` is labelled a configured plan rather than an observed run.
 */
export function daemonSchedulerTruth(
  routines: RoutineSpec[],
  scheduledGoalCount: number
): DaemonSchedulerTruth {
  return {
    active: true,
    activeJobsCount: routines.length + scheduledGoalCount,
    jobs: routines.map((r) => ({
      id: r.id,
      name: r.name,
      cronOrTime: r.cronOrTime,
      lastRun: r.lastRunDate || 'not recorded',
      nextRun: `${r.cronOrTime} (configured plan; not observed)`,
    })),
    note: 'Count and times reflect the routines this process schedules; nextRun is a configured plan, not a run observation.',
  };
}
