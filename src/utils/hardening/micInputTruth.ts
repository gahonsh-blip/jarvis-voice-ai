// The orb's outer ring scales from `volumeLevel`, which the voice path filled
// from a `Math.random()` interval. That made the ring a pulsing graphic that
// reads like an audio-level meter while measuring nothing. Until a real input
// analyser is wired, the ring is decoration only and its input must stay at a
// value that neither claims silence nor claims a measured level.

/**
 * The audio level the visualiser is allowed to render.
 *
 * Only a real measurement (a finite number in `0..100`) is returned. Anything
 * else — `null`, `undefined`, `NaN`, an out-of-range number — yields `0`, which
 * `JarvisOrb` treats as a neutral ring with no measured amplitude.
 */
export const micInputLevel = (measured: unknown): number => {
  if (typeof measured !== 'number' || !Number.isFinite(measured)) return 0;
  return Math.min(100, Math.max(0, measured));
};
