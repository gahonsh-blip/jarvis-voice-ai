// The call HUD labelled a toggle "3G Filter" / "300-3400Hz ON" and told the
// user it applied a "Telephone Acoustic Bandpass Filter (300-3400Hz)", but the
// bandpass `BiquadFilterNode` created by `enableTelephoneBandpass()` was never
// connected into any audio graph — `telephonyAudio` only synthesises tones and
// has no microphone/call-station input to filter. The label therefore claimed
// an effect that never reached the audio path.
//
// These strings describe the filter only as configured on the synthesizer, not
// as applied to call audio. Until a real call audio graph is wired, both the
// UI and the server surface must use these, and must never read "ON".

/** What the toggle actually controls: a bandpass node that is not on the call audio path. */
export const ACOUSTIC_FILTER_STATUS = 'BANDPASS_NOT_APPLIED';

/** Honest description of the filter state for tooltips and labels. */
export const ACOUSTIC_FILTER_LABEL = 'Acoustic filter: not applied to call audio';

/** Describes the bandpass a synthesizer is configured to emit, independent of any call path. */
export const ACOUSTIC_FILTER_SPEC = 'Telephone bandpass profile 300-3400Hz (configured, not applied)';

/**
 * Label for the call HUD's acoustic-filter toggle button. The toggle flips only
 * whether the synthesizer creates a bandpass node — a node that is never wired
 * into any call audio path — so the visible label must not read as a filter
 * that is "applied" or "ON". `configured` is the button's own state; the honest
 * qualifier is present in both branches.
 */
export function acousticFilterToggleLabel(configured: boolean): string {
  return configured
    ? 'Bandpass configured (not on call audio)'
    : 'Bandpass off (not on call audio)';
}
