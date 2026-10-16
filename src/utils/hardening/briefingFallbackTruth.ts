// Truth for the mobile morning-briefing fallback (item 13).
//
// The fallback used to decide between two fixed scripts on a single boolean:
// whether any recognised telemetry field was present. When a device *did* post
// a snapshot but carried none of the fields this server reads (battery, weather,
// notifications, calendar, email) — a device model whose payload uses different
// keys, or a partially-populated snapshot — `anyTelemetry` was false and the
// script told the user "No mobile device is currently connected". That is a
// connectivity claim nobody observed: the request carried a device snapshot.
// The two cases must not collapse into the same sentence.
//
// The fallback renders only what it can observe: readings from the fields it
// recognises, and, when there are none, an explicit "unavailable" note that
// names the reason without asserting a connection state.

export interface BriefingTelemetry {
  batteryLevelPercent?: number | null;
  temperatureC?: number | null;
  unreadNotifications?: number | null;
  todayEvents?: number | null;
  unreadEmails?: number | null;
}

export type BriefingTelemetryKey = keyof BriefingTelemetry;

export const BRIEFING_TELEMETRY_KEYS: readonly BriefingTelemetryKey[] = [
  'batteryLevelPercent',
  'temperatureC',
  'unreadNotifications',
  'todayEvents',
  'unreadEmails',
];

/** True when at least one recognised telemetry field carries a real value. */
export function hasBriefingTelemetry(t: BriefingTelemetry): boolean {
  return BRIEFING_TELEMETRY_KEYS.some((k) => t[k] != null);
}

/** The recognised fields that are present, in report order. */
export function briefingTelemetryKeys(t: BriefingTelemetry): BriefingTelemetryKey[] {
  return BRIEFING_TELEMETRY_KEYS.filter((k) => t[k] != null);
}

/** Localised note for a snapshot that carried no recognised telemetry field. */
export function noTelemetryNote(language: string): string {
  return language === 'hindi'
    ? `इस स्नैपशॉट में बैटरी, मौसम, notifications, कैलेंडर या ईमेल का कोई मान नहीं आया, इसलिए ये आंकड़े उपलब्ध नहीं हैं।`
    : `This snapshot carried no battery, weather, notification, calendar or email reading, so those figures are unavailable.`;
}

/**
 * Renders the bilingual fallback briefing from the observed telemetry only.
 * It never asserts whether a device is connected — that fact is not available
 * on this path.
 */
export function briefingFallbackText(t: BriefingTelemetry, language: string): string {
  const battery = t.batteryLevelPercent;
  const temp = t.temperatureC;
  const notifs = t.unreadNotifications;
  const cal = t.todayEvents;
  const mail = t.unreadEmails;

  if (!hasBriefingTelemetry(t)) {
    const body = noTelemetryNote(language);
    return language === 'hindi' ? `सुप्रभात सर। ${body}` : `Good morning, Sir. ${body}`;
  }

  if (language === 'hindi') {
    return `सुप्रभात सर। ${
      battery != null ? `आपके मोबाइल की बैटरी ${battery} प्रतिशत है। ` : 'बैटरी डेटा उपलब्ध नहीं है। '
    }${temp != null ? `तापमान ${temp} डिग्री है। ` : 'मौसम डेटा उपलब्ध नहीं है। '}${
      notifs != null ? `${notifs} notifications, ` : ''
    }${cal != null ? `${cal} शेड्यूल्ड मीटिंग्स, ` : ''}${
      mail != null ? `और ${mail} नए ईमेल्स पेंडिंग हैं।` : ''
    }`;
  }

  return `Good morning, Sir. ${
    battery != null ? `Your device battery is at ${battery} percent. ` : 'Battery data is unavailable. '
  }${temp != null ? `The temperature is ${temp} degrees. ` : 'Weather data is unavailable. '}${
    notifs != null ? `${notifs} notifications, ` : ''
  }${cal != null ? `${cal} calendar events, ` : ''}${
    mail != null ? `and ${mail} emails are waiting.` : ''
  }`;
}
