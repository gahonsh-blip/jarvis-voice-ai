// ActiveCallHUD's "Audio Waveform Bars" sized each of six bars from
// `Math.floor(Math.random() * 16 + 4)` on every render, so the strip danced as
// if it followed live call audio while measuring nothing — the call path has no
// audio analyser. These heights are a fixed decorative profile: the shape is
// stable and carries no amplitude claim.

/** A fixed, non-measured height (px) for each decorative waveform bar. */
export const callWaveformBars = [14, 8, 18, 6, 16, 10] as const;

/** Height in px for bar `index`, clamped to the profile so an out-of-range
 * index cannot invent a bar that the profile does not contain. */
export const callWaveformBarHeight = (index: number): number => {
  const bars = callWaveformBars;
  if (!Number.isInteger(index) || index < 0 || index >= bars.length) return bars[0];
  return bars[index];
};
