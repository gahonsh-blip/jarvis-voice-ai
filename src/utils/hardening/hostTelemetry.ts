import fs from 'fs';
import os from 'os';

export interface HostTelemetryMetrics {
  cpuUsage: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  ramUsage: number;
  diskUsage: number | null;
}

export interface HostTelemetry extends HostTelemetryMetrics {
  source: 'live_host';
  metricsSource: string;
  sampledAt: string;
}

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toGb = (bytes: number): number => round(bytes / 1024 / 1024 / 1024, 2);

/**
 * Coerce a measured utilisation into the only range a CPU percentage can occupy.
 * Every caller already produces a 0-100 percentage, so a value above 100 means
 * the host is oversubscribed (load average exceeds the core count) and must be
 * reported as fully saturated rather than as an impossible 107%.
 */
export function clampCpuPercent(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return round(Math.min(value, 100));
}

/**
 * Read the real CPU utilisation of the daemon host. Node exposes host CPU time
 * counters via `os.cpus()`, so the 1-minute load average divided by the core
 * count is used as the utilisation proxy. A host whose load average exceeds its
 * core count is saturated and is reported as 100%, never as a value above 100.
 * If the counters are unavailable we return null rather than inventing a number.
 */
export function getHostCpuUsagePercent(): number | null {
  const load = os.loadavg()[0];
  const cores = os.cpus()?.length ?? 0;
  if (cores > 0 && Number.isFinite(load) && load >= 0) {
    return clampCpuPercent((load / cores) * 100);
  }
  return null;
}

export function getHostRam(): { usedGb: number; totalGb: number; percent: number } {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const totalGb = toGb(totalBytes);
  const usedGb = toGb(usedBytes);
  const percent = totalBytes > 0 ? round((usedBytes / totalBytes) * 100) : 0;
  return { usedGb, totalGb, percent };
}

/**
 * Percentage of disk used for the partition backing the given path, or null when
 * it cannot be determined. `fs.statfs` is available on Node 18.15+/19.6+.
 */
export function getDiskUsagePercent(targetPath: string = process.cwd()): number | null {
  const statfs = (fs as { statfsSync?: (p: string) => { blocks: number; bfree: number } }).statfsSync;
  if (typeof statfs !== 'function') return null;
  try {
    const stats = statfs(targetPath);
    if (!stats || stats.blocks <= 0) return null;
    return round(((stats.blocks - stats.bfree) / stats.blocks) * 100);
  } catch {
    return null;
  }
}

/**
 * Sample the daemon host once. Values that cannot be measured are reported as
 * null rather than as a plausible-looking constant, because every field of this
 * object is surfaced to the UI and read aloud as live fact.
 */
export function sampleHostTelemetry(): HostTelemetry {
  const ram = getHostRam();
  return {
    source: 'live_host',
    metricsSource: 'node-os',
    sampledAt: new Date().toISOString(),
    cpuUsage: getHostCpuUsagePercent(),
    ramUsedGb: ram.usedGb,
    ramTotalGb: ram.totalGb,
    ramUsage: ram.percent,
    diskUsage: getDiskUsagePercent(),
  };
}