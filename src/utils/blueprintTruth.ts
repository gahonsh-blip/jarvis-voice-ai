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

/**
 * Spoken reply for the offline `check_project` branch. The branch opens the
 * Master Blueprint view but never reads `/api/blueprint`, so it cannot know how
 * many phases exist or whether they are active. The old reply asserted
 * "Phase 0 to 9" / "all phases active" / "फेज 0 से 9 सक्रिय हैं" — a readiness
 * claim nobody measured. This says the view is opening and that the phase list
 * is unread.
 */
export function blueprintRoadmapReply(lang: 'hindi' | 'hinglish' | 'english'): string {
  if (lang === 'hindi') {
    return 'मास्टर ब्लूप्रिंट दृश्य खोला जा रहा है। इस ऑफ़लाइन पथ पर /api/blueprint नहीं पढ़ा गया, इसलिए फेज सूची या सक्रियता की पुष्टि नहीं हुई।';
  }
  if (lang === 'hinglish') {
    return 'Master Blueprint view khol raha hoon, Sir. Is offline path par /api/blueprint nahi padha gaya, isliye phase list ya active status confirm nahi hua.';
  }
  return 'Opening the Master Blueprint view. This offline path did not read /api/blueprint, so the phase list and its active status are unconfirmed.';
}
