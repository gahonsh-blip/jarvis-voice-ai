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

export interface BrowserCaptureVerdict {
  /** True only when a decoded frame of known dimensions was drawn to the canvas. */
  captured: boolean;
  width: number | null;
  height: number | null;
  detailEn: string;
  detailHi: string;
}

/**
 * Builds the honest verdict for a browser `getDisplayMedia` capture.
 *
 * The display stream can resolve without ever decoding a frame — the source is
 * muted, protected, or not yet rendered — in which case `videoWidth`/
 * `videoHeight` stay `0`. The previous code fell back to `1280`/`720`, drew the
 * frameless video onto a black canvas and reported a verified live capture. A
 * capture is credited only when the video reports non-zero dimensions.
 */
export function browserCaptureVerdict(
  videoWidth: number,
  videoHeight: number,
  trackLabel?: string | null
): BrowserCaptureVerdict {
  const valid = Number.isFinite(videoWidth) && Number.isFinite(videoHeight) && videoWidth > 0 && videoHeight > 0;
  if (!valid) {
    return {
      captured: false,
      width: null,
      height: null,
      detailEn:
        'The display stream provided no decoded frame (the source reported no dimensions). Nothing was captured.',
      detailHi:
        'डिस्प्ले स्ट्रीम से कोई डिकोडेड फ्रेम नहीं मिला, इसलिए कुछ भी कैप्चर नहीं हुआ।',
    };
  }
  const label = trackLabel ? ` (${trackLabel})` : '';
  return {
    captured: true,
    width: videoWidth,
    height: videoHeight,
    detailEn: `Live display captured at ${videoWidth}x${videoHeight}${label}.`,
    detailHi: `लाइव डिस्प्ले ${videoWidth}x${videoHeight} पर कैप्चर किया गया${label}।`,
  };
}
