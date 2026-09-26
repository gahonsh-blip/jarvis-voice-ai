// ==============================================================================
// HERMES JARVIS — OPERATOR REPLY TRUTH HELPERS
//
// The `/api/chat` operator intents used to speak unqualified success no matter
// what the engine returned. `fix_project_error` answered
// "applied surgical fix, and verified test suite" and set `actionExecuted = true`
// even when the engine reported `SIMULATION_ONLY` or `FAILED`, and
// `inspect_screen` narrated a confident "Screen showing ..." summary against a
// host desktop that was never observed.
//
// These helpers derive the spoken reply and the `actionExecuted` flag from the
// task status and the observation provenance that were actually returned, so a
// run that could not touch the host never claims that it did.
// ==============================================================================

import type { ComputerOperatorTask, ScreenObservation } from '../../types/computerOperator';
import { screenSyncState, type ScreenSyncState } from './observationTruth';

/**
 * Whether a computer-operator task performed real work on the host. Only the
 * terminal `COMPLETED` state represents an action the engine carried through;
 * every other state (FAILED, BLOCKED, NEEDS_APPROVAL, CANCELLED, or a run that
 * never finished) must not be spoken as a success.
 */
export function operatorTaskExecuted(task: ComputerOperatorTask | null | undefined): boolean {
  return task?.status === 'COMPLETED';
}

/** The engine's own summary of what the run did, or null when it never got one. */
export function operatorTaskSummary(
  task: ComputerOperatorTask | null | undefined,
  isHindi: boolean
): string | null {
  if (!task) return null;
  const summary = isHindi ? task.resultSummaryHi || task.resultSummary : task.resultSummary;
  return summary ?? null;
}

/**
 * The spoken reply for a `fix_project_error` request, derived from the task the
 * engine actually returned rather than from an assumed successful fix.
 */
export function fixProjectErrorReply(
  task: ComputerOperatorTask | null | undefined,
  isHindi: boolean
): string {
  const summary = operatorTaskSummary(task, isHindi);
  if (task?.status === 'COMPLETED' && summary) return summary;

  if (task?.status === 'NEEDS_APPROVAL') {
    return isHindi
      ? 'इस कार्य को आपके अनुमोदन की आवश्यकता है। अनुमोदन तक कुछ भी निष्पादित नहीं हुआ।'
      : 'This task is held for your approval. Nothing was executed yet.';
  }

  const reason = task?.error || summary;
  if (isHindi) {
    return `स्क्रीन-रिसर्च कार्य पूर्ण नहीं हुआ (${task?.status || 'UNKNOWN'})${reason ? `: ${reason}` : '।'} होस्ट पर कोई सत्यापित सुधार नहीं हुआ।`;
  }
  return `The Screen-Research task did not complete (${task?.status || 'UNKNOWN'})${reason ? `: ${reason}` : '.'} No host fix was verified.`;
}

/**
 * Whether an `inspect_screen` request observed a real screen. True only when the
 * observation came from a host-backed source and is not ambiguous.
 */
export function screenInspectionExecuted(
  observation: ScreenObservation | null | undefined,
  isHostBacked: boolean
): boolean {
  return screenSyncState(observation ?? null, !isHostBacked) === 'OBSERVED';
}

/**
 * The spoken reply for an `inspect_screen` request. The interpreter always
 * produces a confident "Screen showing ..." summary, so it is only spoken when
 * the observation came from a host-backed source and is not ambiguous.
 */
export function screenInspectionReply(
  observation: ScreenObservation | null | undefined,
  interpretation: { summary: string; summaryHi: string } | null | undefined,
  isHindi: boolean,
  isHostBacked: boolean
): string {
  const state: ScreenSyncState = screenSyncState(observation ?? null, !isHostBacked);
  if (state === 'OBSERVED' && interpretation) {
    return isHindi ? interpretation.summaryHi : interpretation.summary;
  }
  if (isHindi) {
    return 'होस्ट डेस्कटॉप अवलोकित नहीं हो सका, इसलिए स्क्रीन सामग्री का कोई दावा नहीं किया जा सकता।';
  }
  return 'The host desktop could not be observed, so no screen content is claimed.';
}
