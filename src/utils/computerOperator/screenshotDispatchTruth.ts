// ==============================================================================
// HERMES JARVIS — SCREENSHOT DISPATCH TRUTH
//
// The `/api/chat` `take_screenshot` intent spoke "Capturing screen display right
// now." and set `actionExecuted = true` without reaching a capture backend, and
// `src/utils/localJarvisEngine.ts` — the offline fallback this app exists for —
// claimed "Capturing screen display." on a path that captures nothing at all.
// On a headless host neither path produced a file, yet the transcript and the
// Security Matrix recorded a screen capture as performed work.
//
// The verdict is derived from the real `captureScreenshot()` result: the
// `VERIFIED` outcome is reachable only when a non-empty image file exists on
// disk with its hash recorded (`verifyScreenshotFile`). Anything else is stated
// as not captured.
// ==============================================================================

import type { ScreenshotFile, ScreenshotResult } from './screenshotStore';

export type ScreenshotOutcome =
  | 'CAPTURED'
  | 'NOT_AVAILABLE'
  | 'FAILED'
  | 'UNVERIFIED';

export interface ScreenshotVerdict {
  /** True only when a verified image file exists on disk. */
  actionExecuted: boolean;
  outcome: ScreenshotOutcome;
  title: string;
  detailEn: string;
  detailHi: string;
  file: ScreenshotFile | null;
}

/**
 * Builds the honest verdict for a screen capture.
 *
 * @param result the real `captureScreenshot()` result, or `null` when the
 *               capture backend was never reached
 */
export function screenshotVerdict(result: ScreenshotResult | null): ScreenshotVerdict {
  const receipt = result?.receipt ?? null;
  const file = result?.file ?? null;
  const detailEn = receipt?.detailEn || 'No screen capture result was observed.';
  const detailHi = receipt?.detailHi || 'स्क्रीन कैप्चर का कोई परिणाम दर्ज नहीं हुआ।';

  // The file is the proof, not the receipt outcome.
  if (receipt?.outcome === 'VERIFIED' && file) {
    return {
      actionExecuted: true,
      outcome: 'CAPTURED',
      title: `Screen Captured (${file.sizeBytes} bytes)`,
      detailEn,
      detailHi,
      file,
    };
  }

  if (receipt?.outcome === 'NOT_AVAILABLE') {
    return {
      actionExecuted: false,
      outcome: 'NOT_AVAILABLE',
      title: 'Screen Capture Not Available',
      detailEn,
      detailHi,
      file: null,
    };
  }

  if (receipt?.outcome === 'FAILED') {
    return {
      actionExecuted: false,
      outcome: 'FAILED',
      title: 'Screen Capture Failed',
      detailEn,
      detailHi,
      file: null,
    };
  }

  return {
    actionExecuted: false,
    outcome: 'UNVERIFIED',
    title: 'Screen Capture Unverified',
    detailEn,
    detailHi,
    file: null,
  };
}

/** Honest spoken reply for a capture verdict, in the operator's language. */
export function screenshotReply(verdict: ScreenshotVerdict, language: string): string {
  const hi = language.startsWith('hi');
  if (verdict.actionExecuted && verdict.file) {
    return hi
      ? `स्क्रीनशॉट सहेजा गया: ${verdict.file.filename}।`
      : `Screen captured and saved as ${verdict.file.filename}.`;
  }
  return hi ? verdict.detailHi : verdict.detailEn;
}
