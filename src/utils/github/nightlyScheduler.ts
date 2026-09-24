// ==============================================================================
// HERMES JARVIS — NIGHTLY REPOSITORY CHECK (backlog item 24)
//
// A scheduler for the recurring scan. It computes when the next run is due,
// records what each past run actually did, and never claims a run happened when
// it did not (for example while the process was down).
//
// This module owns no timers of its own: the server ticks it, so tests can drive
// time deterministically.
// ==============================================================================

import type { ExecutionReceipt } from '../executionTruth';
import { buildReceipt, makeEvidence } from '../executionTruth';
import { scanAllRepositories, type GitHubFetchOptions, type MultiRepoScan } from './repoScanner';
import { buildFixPlan, type FixPlan } from './fixPlanner';

export interface NightlyRunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string;
  trigger: 'SCHEDULED' | 'MANUAL' | 'CATCH_UP';
  outcome: 'COMPLETED' | 'FAILED';
  scannedRepositories: number;
  unreachableRepositories: number;
  reposWithFailingCi: string[];
  reposWithOpenPrs: string[];
  plannedSteps: number;
  planRequiresApproval: boolean;
  error?: string;
}

export interface NightlyConfig {
  /** Local hour (0-23) at which the nightly check runs. */
  hour: number;
  /** Local minute (0-59). */
  minute: number;
  timezoneOffsetMinutes?: number;
}

export const DEFAULT_NIGHTLY_CONFIG: NightlyConfig = { hour: 2, minute: 0 };

/** Returns the next due timestamp at or after `from`. */
export function nextRunAt(config: NightlyConfig, from: Date = new Date()): string {
  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  next.setHours(config.hour, config.minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export interface NightlyCheckOptions {
  config?: NightlyConfig;
  github: GitHubFetchOptions;
  /** Injected for tests. */
  now?: () => Date;
  /** Overrides the scan, mainly for tests. */
  scanner?: typeof scanAllRepositories;
  planner?: typeof buildFixPlan;
}

export interface NightlyCheckResult {
  record: NightlyRunRecord;
  scan?: MultiRepoScan;
  plan?: FixPlan;
  receipt: ExecutionReceipt;
}

/**
 * Runs one nightly check: scan every repository, then derive a fix plan.
 *
 * A scan that could not complete is recorded as FAILED with the API's reason;
 * no partial result is presented as a completed check.
 */
export async function runNightlyCheck(
  options: NightlyCheckOptions
): Promise<NightlyCheckResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const scanner = options.scanner ?? scanAllRepositories;
  const planner = options.planner ?? buildFixPlan;

  const scan = await scanner(options.github);

  if (!scan.receipt.verified && scan.scans.length === 0) {
    const finishedAt = now().toISOString();
    const record: NightlyRunRecord = {
      runId: `nightly-${Date.now()}`,
      startedAt,
      finishedAt,
      trigger: 'SCHEDULED',
      outcome: 'FAILED',
      scannedRepositories: 0,
      unreachableRepositories: 0,
      reposWithFailingCi: [],
      reposWithOpenPrs: [],
      plannedSteps: 0,
      planRequiresApproval: false,
      error: scan.receipt.failureReason || scan.receipt.detailEn,
    };
    return {
      record,
      scan,
      receipt: buildReceipt({
        action: 'github.nightlyCheck',
        target: 'all repositories',
        outcome: 'FAILED',
        detailEn: `Nightly check could not scan any repository: ${record.error}`,
        detailHi: 'रात्रिकालीन जाँच रिपॉज़िटरी स्कैन नहीं कर सकी।',
        failureReason: record.error,
      }),
    };
  }

  const plan = planner({ multiRepoScan: scan });
  const finishedAt = now().toISOString();

  const record: NightlyRunRecord = {
    runId: `nightly-${Date.now()}`,
    startedAt,
    finishedAt,
    trigger: 'SCHEDULED',
    outcome: 'COMPLETED',
    scannedRepositories: scan.scans.length,
    unreachableRepositories: scan.unreachableCount,
    reposWithFailingCi: scan.reposWithFailingCi,
    reposWithOpenPrs: scan.reposWithOpenPrs,
    plannedSteps: plan.steps.length,
    planRequiresApproval: plan.steps.some((s) => s.requiresApproval),
  };

  return {
    record,
    scan,
    plan,
    receipt: buildReceipt({
      action: 'github.nightlyCheck',
      target: 'all repositories',
      outcome: scan.unreachableCount > 0 ? 'DISPATCHED' : 'VERIFIED',
      detailEn: `Nightly check scanned ${record.scannedRepositories} repositories (${record.unreachableRepositories} unreachable), found ${record.reposWithFailingCi.length} with failing CI and ${record.reposWithOpenPrs.length} with open PRs, and planned ${record.plannedSteps} step(s).`,
      detailHi: `रात्रिकालीन जाँच पूर्ण: ${record.scannedRepositories} रिपॉज़िटरी स्कैन हुईं।`,
      evidence: makeEvidence(
        'remote_http_response',
        `${record.scannedRepositories} repositories scanned`,
        { ref: scan.scannedAt }
      ),
    }),
  };
}

export interface NightlyHistory {
  lastRunAt: string | null;
  nextRunAt: string;
  runs: NightlyRunRecord[];
  /** True when a scheduled run was missed, e.g. the process was offline. */
  missedRun: boolean;
}

/**
 * Computes what to record between the last run and now.
 *
 * If the process was offline across a scheduled time the caller is told a run
 * was missed so it can catch up, rather than the gap being silently skipped.
 */
export function nightlyHistory(
  runs: NightlyRunRecord[],
  config: NightlyConfig = DEFAULT_NIGHTLY_CONFIG,
  now: Date = new Date()
): NightlyHistory {
  const lastRunAt = runs.length > 0 ? runs[0].finishedAt : null;
  const upcoming = nextRunAt(config, now);

  let missedRun = false;
  if (lastRunAt) {
    // The run that should have happened after the last one, relative to now.
    const previousDue = new Date(upcoming);
    previousDue.setDate(previousDue.getDate() - 1);
    missedRun = new Date(lastRunAt).getTime() < previousDue.getTime();
  }

  return { lastRunAt, nextRunAt: upcoming, runs, missedRun };
}