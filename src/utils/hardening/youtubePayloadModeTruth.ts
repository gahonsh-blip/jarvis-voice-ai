// =============================================================================
// HERMES JARVIS — YouTube staged payload mode, stated honestly (backlog item 13)
//
// The Social Hub's YouTube studio (`SocialMediaModal.tsx`) paints its payload
// mode from React state `ytIsTestPayload` and stages `isTestUpload: ytIsTestPayload`.
// `handleVideoFileSelect()` clears that flag synchronously — *before* the
// `FileReader` that produces `ytVideoBase64` has finished, and with no `onerror`
// handler at all — while `handleStageYouTubeVideo()` sends
// `videoPayloadBase64: ytVideoBase64 || undefined`.
//
// `POST /api/social/youtube/upload-draft` (server.ts) derives the mode from what
// actually arrived: `isTestUpload: !videoPayloadBase64 || Boolean(isTestUpload)`.
// So a file whose bytes never loaded (read error, empty result, or a stage
// clicked in the window before the read resolved) staged a **synthetic test
// payload** while the operator's screen read "Binary File Mode" and the staged
// post carried the real file's name — a fake success the operator would trust.
//
// A second, quieter mismatch: selecting a second file left the *previous*
// file's base64 in state until the new read resolved, so staging in that window
// sent file A's bytes under file B's name.
//
// A staged payload's mode must be derived from the bytes that actually exist,
// not from a flag set before they were read. This module owns that decision so
// the panel and the request body cannot disagree.
// =============================================================================

export type YouTubePayloadMode = 'binary' | 'synthetic';

export interface YouTubePayloadFacts {
  /** A `File` object is held in state (`ytVideoFile !== null`). */
  fileSelected: boolean;
  /** A non-empty base64 payload has been read back (`ytVideoBase64`). */
  base64Ready: boolean;
  /** The operator explicitly chose the synthetic test generator. */
  requestedSynthetic: boolean;
}

export interface YouTubePayloadDecision {
  /** The payload the server will actually stage for these facts. */
  mode: YouTubePayloadMode;
  /** Value the request must carry so the server stages that same payload. */
  isTestUpload: boolean;
  /** `false` when staging now would not upload what the panel is showing. */
  ready: boolean;
  /** Label the mode indicator must render. */
  label: string;
  /** The synthetic generator is the live, ready source. */
  syntheticActive: boolean;
  /** Why staging is held, or a caveat to show; `null` when there is nothing to say. */
  notice: string | null;
}

export const SYNTHETIC_MODE_LABEL = 'Synthetic Test Mode';
export const BINARY_MODE_LABEL = 'Binary File Mode';
export const BINARY_PENDING_LABEL = 'Binary File Mode — payload not read yet';
export const NO_PAYLOAD_LABEL = 'No Payload Selected';

export const PAYLOAD_NOT_READY_NOTICE =
  'The selected video file has not been read yet, so its bytes are not available. Staging now would upload a synthetic test payload instead of the file. Wait for the file to finish loading, or enable the synthetic test generator deliberately.';

export const NO_PAYLOAD_NOTICE =
  'No video file is selected and the synthetic test generator is off. Select a file, or enable the synthetic test generator deliberately.';

export const SYNTHETIC_FALLBACK_NOTICE =
  'No video file is selected, so the synthetic test payload would be staged. Enable the synthetic test generator to confirm that is intended.';

/**
 * Decide the staged payload mode from what is actually available. The server
 * falls back to a synthetic payload whenever `videoPayloadBase64` is absent, so
 * a decision that is not `ready` must not be staged: it would upload something
 * other than what the panel displays.
 */
export function resolveYouTubePayloadMode(facts: YouTubePayloadFacts): YouTubePayloadDecision {
  if (facts.requestedSynthetic) {
    return {
      mode: 'synthetic',
      isTestUpload: true,
      ready: true,
      label: SYNTHETIC_MODE_LABEL,
      syntheticActive: true,
      notice: null,
    };
  }

  if (!facts.fileSelected) {
    return {
      mode: 'synthetic',
      isTestUpload: true,
      ready: false,
      label: NO_PAYLOAD_LABEL,
      syntheticActive: false,
      notice: NO_PAYLOAD_NOTICE,
    };
  }

  if (!facts.base64Ready) {
    return {
      mode: 'binary',
      isTestUpload: false,
      ready: false,
      label: BINARY_PENDING_LABEL,
      syntheticActive: false,
      notice: PAYLOAD_NOT_READY_NOTICE,
    };
  }

  return {
    mode: 'binary',
    isTestUpload: false,
    ready: true,
    label: BINARY_MODE_LABEL,
    syntheticActive: false,
    notice: null,
  };
}

/**
 * File name the staged post must carry. A synthetic payload must not be labelled
 * with the selected file's name — that is what made the mismatch invisible.
 */
export function youTubeStagedFileName(decision: YouTubePayloadDecision, fileName?: string | null): string {
  if (decision.mode === 'synthetic') return 'synthetic_jarvis_test.mp4';
  const trimmed = typeof fileName === 'string' ? fileName.trim() : '';
  return trimmed || 'uploaded_video.mp4';
}
