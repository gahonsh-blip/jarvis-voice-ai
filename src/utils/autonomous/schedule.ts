// ==============================================================================
// HERMES JARVIS — SCHEDULED AUTONOMOUS TASKS (backlog item 43)
//
// Recurring goals that the server's scheduler tick can pick up. The schedule
// maths lives here so it can be tested without waiting for wall-clock time.
//
// Like the nightly repository check, a scheduled goal is planned and recorded
// honestly: a run that was missed while the process was down is surfaced as
// missed rather than silently skipped, and each run keeps its own audit trail.
// ==============================================================================

export interface ScheduledGoal {
  id: string;
  name: string;
  /** Minutes past local midnight when the task should run. */
  atMinuteOfDay: number;
  /** Step descriptors, same shape the goal runner accepts. */
  steps: unknown[];
  /** A human must approve before this task may run unattended. */
  requiresApproval?: boolean;
  enabled: boolean;
}

export interface ScheduledGoalRecord {
  goalId: string;
  ranDate: string;
  outcome: string;
  verified: boolean;
  stepsDone: number;
  stepsTotal: number;
  at: string;
}

export interface ScheduleClock {
  /** Minutes past midnight in the schedule's timezone. */
  minuteOfDay: number;
  /** Calendar date (YYYY-MM-DD) in the schedule's timezone. */
  date: string;
}

/** True when the task's time has arrived and it has not run today yet. */
export function isGoalDue(
  goal: ScheduledGoal,
  lastRanDate: string | undefined,
  clock: ScheduleClock,
  windowMinutes = 15,
): boolean {
  if (!goal.enabled) return false;
  if (lastRanDate === clock.date) return false;

  return (
    clock.minuteOfDay >= goal.atMinuteOfDay &&
    clock.minuteOfDay < goal.atMinuteOfDay + windowMinutes
  );
}

/**
 * The task's next occurrence. When today's window has already closed without a
 * run, the caller is told a run was missed so the gap is visible.
 */
export function nextScheduledOccurrence(
  goal: ScheduledGoal,
  lastRanDate: string | undefined,
  clock: ScheduleClock,
): { nextRunAt: string; missedRun: boolean } {
  const hour = Math.floor(goal.atMinuteOfDay / 60);
  const minute = goal.atMinuteOfDay % 60;
  const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (lastRanDate === clock.date) {
    return { nextRunAt: `${clock.date} ${timeLabel} +1d`, missedRun: false };
  }
  if (clock.minuteOfDay < goal.atMinuteOfDay) {
    return { nextRunAt: `${clock.date} ${timeLabel}`, missedRun: false };
  }
  // The window has passed and there is no record of a run today.
  return { nextRunAt: `${clock.date} ${timeLabel} +1d`, missedRun: true };
}

/** Tasks due right now, given the persisted last-run dates. */
export function dueGoals(
  goals: ScheduledGoal[],
  lastRuns: Record<string, string | undefined>,
  clock: ScheduleClock,
): ScheduledGoal[] {
  return goals.filter((g) => isGoalDue(g, lastRuns[g.id], clock));
}