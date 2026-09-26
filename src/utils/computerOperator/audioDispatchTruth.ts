// ==============================================================================
// HERMES JARVIS — AUDIO DISPATCH TRUTH
//
// The `/api/chat` `volume_up` / `volume_down` intents spoke "Increasing master
// audio output level." and set `actionExecuted = true`, and
// `src/utils/localJarvisEngine.ts` claimed "Increasing master audio volume." —
// neither of them touching a mixer. The real effect of the intent is the in-app
// voice-output slider in `App.tsx`, which is local state; the *host* output
// level is never read or written from the server, and the app must not speak as
// though the machine's volume moved.
//
// The verdict is a pure function of two observable facts: whether this host has
// a mixer backend, and the in-app level before and after the step.
// ==============================================================================

export type VolumeOutcome = 'IN_APP_ADJUSTED' | 'LIMIT_REACHED' | 'NO_MIXER_BACKEND';

export interface VolumeVerdict {
  /**
   * True only when a mixer backend actually moved the host output level. The
   * in-app slider is not an executed system action.
   */
  actionExecuted: boolean;
  outcome: VolumeOutcome;
  /** New in-app voice-output level, clamped to [0.1, 1.0]. */
  level: number;
  title: string;
  detailEn: string;
  detailHi: string;
}

const MIN_LEVEL = 0.1;
const MAX_LEVEL = 1.0;

/** A mixer backend exists only on a desktop session with a known control tool. */
function hasMixerBackend(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

/**
 * Builds the honest verdict for a volume intent.
 *
 * @param direction 'up' or 'down'
 * @param currentLevel the in-app voice-output level before the step
 * @param platform the host platform, injectable for tests
 */
export function volumeVerdict(
  direction: 'up' | 'down',
  currentLevel: number,
  platform: NodeJS.Platform = process.platform,
): VolumeVerdict {
  const start = Number.isFinite(currentLevel) ? currentLevel : MAX_LEVEL;
  const raw = direction === 'up' ? start + 0.2 : start - 0.2;
  const level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Number(raw.toFixed(2))));
  const moved = level !== start;
  const atLimit = !moved;

  if (!hasMixerBackend(platform)) {
    return {
      actionExecuted: false,
      outcome: 'NO_MIXER_BACKEND',
      level,
      title: atLimit
        ? `In-App Volume Limit (host output not changed)`
        : `In-App Volume Only (+/-), host output not changed`,
      detailEn: atLimit
        ? `The in-app voice-output slider is already at its ${direction === 'up' ? 'maximum' : 'minimum'}; this host has no audio mixer backend, so the system output level was not changed.`
        : `The in-app voice-output slider was set to ${Math.round(level * 100)}%. This host has no audio mixer backend, so the system output level was not changed.`,
      detailHi: atLimit
        ? `इन-ऐप वॉल्यूम सीमा पर है; इस होस्ट पर ऑडियो मिक्सर बैकएंड नहीं है, इसलिए सिस्टम आवाज़ नहीं बदली गई।`
        : `इन-ऐप वॉइस स्लाइडर ${Math.round(level * 100)}% पर सेट किया गया। इस होस्ट पर ऑडियो मिक्सर बैकएंड नहीं है, इसलिए सिस्टम आवाज़ नहीं बदली गई।`,
    };
  }

  return {
    actionExecuted: false,
    outcome: atLimit ? 'LIMIT_REACHED' : 'IN_APP_ADJUSTED',
    level,
    title: atLimit ? `In-App Volume Limit` : `In-App Volume ${direction === 'up' ? '+' : '-'}`,
    detailEn: atLimit
      ? `The in-app voice-output slider is already at its ${direction === 'up' ? 'maximum' : 'minimum'}.`
      : `The in-app voice-output slider was set to ${Math.round(level * 100)}%. The system output level was not changed.`,
    detailHi: atLimit
      ? `इन-ऐप वॉल्यूम स्लाइडर पहले से ${direction === 'up' ? 'अधिकतम' : 'न्यूनतम'} पर है।`
      : `इन-ऐप वॉइस स्लाइडर ${Math.round(level * 100)}% पर सेट किया गया। सिस्टम आवाज़ नहीं बदली गई।`,
  };
}

/** Honest spoken reply for a volume verdict, in the operator's language. */
export function volumeReply(verdict: VolumeVerdict, language: string): string {
  return language.startsWith('hi') ? verdict.detailHi : verdict.detailEn;
}
