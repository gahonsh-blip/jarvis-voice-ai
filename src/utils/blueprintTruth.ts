// ==============================================================================
// HERMES JARVIS — Blueprint progress truth
//
// The Master Blueprint modal renders a "Readiness Progress" bar, a percentage,
// and a footer line, all built from `/api/blueprint`. When that request failed
// the component kept its initial `completionPercentage: 0` and rendered a filled
// state that read as a measured "0% complete": a measurement nobody took. It
// also printed the constant `TOTAL PHASES: 10 (Phase 0 to 9)` regardless of what
// the server returned.
//
// A percentage is only a measurement when it was actually read. This module
// makes that distinction explicit so the UI can say UNKNOWN instead of 0%.
// ==============================================================================

export type BlueprintReadState = 'UNMEASURED' | 'MEASURED';

export interface BlueprintProgress {
  readState: BlueprintReadState;
  /** The measured integer 0-100, or null when nothing was read. */
  percentage: number | null;
}

/** True only for a finite number in the 0-100 range. */
function asPercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

/**
 * Build progress from a read flag and a server-reported value. A known read with
 * an out-of-range or non-numeric value is not silently coerced to 0 — it stays
 * UNMEASURED so the caller renders UNKNOWN rather than a fabricated figure.
 */
export function blueprintProgress(statusKnown: boolean, percentage: unknown): BlueprintProgress {
  const measured = statusKnown ? asPercentage(percentage) : null;
  if (measured === null) return { readState: 'UNMEASURED', percentage: null };
  return { readState: 'MEASURED', percentage: measured };
}

/** Bar width as a CSS percentage. An unmeasured bar has no width to fill. */
export function blueprintBarWidth(progress: BlueprintProgress): string {
  return progress.percentage === null ? '0%' : `${progress.percentage}%`;
}

/** The percentage readout beside the bar. */
export function blueprintPercentageLabel(progress: BlueprintProgress): string {
  return progress.percentage === null ? 'UNKNOWN' : `${progress.percentage}%`;
}

/**
 * Header "Readiness Progress" caption. The value is only called a progress
 * figure once it was measured.
 */
export function blueprintProgressLabel(progress: BlueprintProgress): string {
  return progress.percentage === null ? 'Readiness Progress: UNKNOWN' : 'Readiness Progress';
}

/**
 * Footer caption. It names the missing read instead of asserting a ticked
 * checklist count.
 */
export function blueprintFooterLabel(progress: BlueprintProgress): string {
  if (progress.percentage === null) {
    return 'HERMES JARVIS • Archived design blueprint (checklist progress UNKNOWN — /api/blueprint not read)';
  }
  return `HERMES JARVIS • Archived design blueprint (${progress.percentage}% checklist items ticked)`;
}

/**
 * Phase-count readout. The count comes from the server, so an unread blueprint
 * states UNKNOWN rather than the hardcoded "10 (Phase 0 to 9)".
 */
export function blueprintPhaseCountLabel(statusKnown: boolean, total: unknown): string {
  if (!statusKnown || typeof total !== 'number' || !Number.isFinite(total) || total <= 0) {
    return 'TOTAL PHASES: UNKNOWN';
  }
  return `TOTAL PHASES: ${total}`;
}
