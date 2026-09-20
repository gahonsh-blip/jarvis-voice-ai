// =============================================================================
// HERMES JARVIS — HUD host telemetry
// Reads the *real* host sample published by GET /api/oracle-cloud (which is
// backed by src/utils/hardening/hostTelemetry.ts) for the header indicators.
//
// The previous header ran `setInterval(() => Math.floor(10 + Math.random() * 8))`
// and rendered the result as "ARM VM LOAD: n%", so the HUD showed an invented
// number that never moved with the machine. Anything that is not a real,
// finite reading is reported as null and rendered as "—"; no default value is
// ever substituted.
// =============================================================================

export interface HudTelemetrySnapshot {
  /** Real host CPU utilisation percentage, or null when unmeasurable/unknown. */
  cpuUsage: number | null;
  /** Real host RAM utilisation percentage, or null when unmeasurable/unknown. */
  ramUsage: number | null;
  /** Where the sample came from. `unavailable` means no real reading is held. */
  metricsSource: string;
  /** ISO timestamp of the sample, or null when unknown. */
  sampledAt: string | null;
}

export const UNAVAILABLE_HUD_TELEMETRY: HudTelemetrySnapshot = {
  cpuUsage: null,
  ramUsage: null,
  metricsSource: 'unavailable',
  sampledAt: null,
};

function toMetric(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Extract the metrics from an /api/oracle-cloud payload. A missing, malformed or
 * nonsensical reading becomes null — never a plausible constant.
 */
export function parseHudTelemetry(payload: unknown): HudTelemetrySnapshot {
  if (!payload || typeof payload !== 'object') return { ...UNAVAILABLE_HUD_TELEMETRY };
  const record = payload as {
    metrics?: { cpuUsage?: unknown; ramUsage?: unknown };
    metricsSource?: unknown;
    metricsSampledAt?: unknown;
  };
  const metrics = record.metrics && typeof record.metrics === 'object' ? record.metrics : {};

  const cpuUsage = toMetric(metrics.cpuUsage);
  const ramUsage = toMetric(metrics.ramUsage);
  const metricsSource =
    typeof record.metricsSource === 'string' && record.metricsSource.length > 0
      ? record.metricsSource
      : 'unavailable';
  const sampledAt = typeof record.metricsSampledAt === 'string' ? record.metricsSampledAt : null;

  return { cpuUsage, ramUsage, metricsSource, sampledAt };
}

/**
 * Fetch and parse the host sample. A network or parse failure yields the
 * unavailable snapshot so the HUD shows "—" rather than a fabricated value.
 */
export async function fetchHudTelemetry(
  fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
  url = '/api/oracle-cloud'
): Promise<HudTelemetrySnapshot> {
  if (!fetcher) return { ...UNAVAILABLE_HUD_TELEMETRY };
  try {
    const res = await fetcher(url);
    if (!res || !res.ok) return { ...UNAVAILABLE_HUD_TELEMETRY };
    const data = await res.json();
    return parseHudTelemetry(data);
  } catch {
    return { ...UNAVAILABLE_HUD_TELEMETRY };
  }
}

/** Render helper: a null reading is always "—", never a stand-in number. */
export function formatHudPercent(value: number | null): string {
  return value == null ? '—' : `${value}%`;
}