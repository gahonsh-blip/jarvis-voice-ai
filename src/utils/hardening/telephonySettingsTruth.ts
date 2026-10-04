// HERMES JARVIS — telephony settings-update honesty.
//
// `POST /api/telephony/settings` used to spread any caller-supplied object over
// the stored settings and answer `success: true` unconditionally. A body that
// named no real setting, or only misspelled/stale keys, was reported as an
// applied save while nothing changed, and a malformed value (an object where a
// boolean belongs) was written into the live settings the call engine reads.
// The operator saw "SAVED — engine applied to live gateway" on a request that
// stored nothing. This classifies the update against the real setting keys and
// reports what was actually stored.

export const TELEPHONY_SETTING_KEYS = [
  'provider',
  'twilioAccountSid',
  'twilioAuthToken',
  'twilioPhoneNumber',
  'autoAnswerInbound',
  'autoAnswerDelaySeconds',
  'aiReceptionistGreeting',
  'aiPersona',
  'spamScreeningEnabled',
  'spamThresholdScore',
  'acousticFilterEnabled',
  'dtmfAudioEnabled',
  'recordingEnabled',
  'forwardUrgentToTelegram',
  'voiceLanguage',
  'voicePitch',
  'voiceRate',
  'maskUnknownCallerId',
] as const;

export type TelephonySettingValue = string | number | boolean;

export type TelephonySettingsUpdateVerdict =
  | {
      accepted: true;
      applied: Record<string, TelephonySettingValue>;
      rejected: string[];
      changed: boolean;
      message: string;
    }
  | {
      accepted: false;
      reason: 'NO_KEYS' | 'NO_RECOGNISED_KEYS';
      rejected: string[];
      message: string;
    };

function isSettingValue(value: unknown): value is TelephonySettingValue {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/**
 * Classify a telephony-settings body against the real setting keys.
 *
 * Only keys that exist in `TELEPHONY_SETTING_KEYS` carrying a primitive value
 * are applied; an unknown key or a malformed value is rejected rather than
 * silently written into the settings the live call engine reads. The caller
 * gets a distinct verdict for "nothing was asked" and "nothing asked was real"
 * so it can answer honestly instead of claiming a save.
 */
export function classifyTelephonySettingsUpdate(
  body: unknown,
  current: Record<string, unknown>,
): TelephonySettingsUpdateVerdict {
  const known = new Set<string>(TELEPHONY_SETTING_KEYS);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      accepted: false,
      reason: 'NO_KEYS',
      rejected: [],
      message: 'No settings were present in the request body; nothing was changed.',
    };
  }

  const entries = Object.entries(body as Record<string, unknown>);
  const applied: Record<string, TelephonySettingValue> = {};
  const rejected: string[] = [];

  for (const [key, value] of entries) {
    if (!known.has(key) || !isSettingValue(value)) {
      rejected.push(key);
      continue;
    }
    applied[key] = value;
  }

  const appliedKeys = Object.keys(applied);
  if (appliedKeys.length === 0) {
    return {
      accepted: false,
      reason: entries.length === 0 ? 'NO_KEYS' : 'NO_RECOGNISED_KEYS',
      rejected,
      message:
        entries.length === 0
          ? 'No settings were present in the request body; nothing was changed.'
          : `None of the supplied keys are real telephony settings (${rejected.join(', ')}); nothing was changed.`,
    };
  }

  const changed = appliedKeys.some((key) => current[key] !== applied[key]);

  const parts = [`Stored ${appliedKeys.length} setting(s)`];
  if (!changed) parts.push('but none differed from the stored values');
  if (rejected.length > 0) parts.push(`ignored unknown or malformed key(s): ${rejected.join(', ')}`);

  return {
    accepted: true,
    applied,
    rejected,
    changed,
    message: `${parts.join('; ')}.`,
  };
}
