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

function normaliseCpuPercent(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value <= 1) return round(value * 100);
  return round(value);
}

/**
 * Read the real CPU utilisation of the daemon host. Node exposes an instantaneous
 * system-wide percentage (since Node 19.6 / 18.15). On runtimes that do not, we
 * fall back to the 1-minute load average divided by the core count. If neither is
 * available we return null rather than inventing a number.
 */
export function getHostCpuUsagePercent(): number | null {
  const direct = (os as { cpuUsage?: () => { idle: number; total: number } }).cpuUsage;
  if (typeof direct === 'function') {
    try {
      const sample = direct();
      if (sample && sample.total > 0) {
        const used = ((sample.total - sample.idle) / sample.total) * 100;
        const normalised = normaliseCpuPercent(used);
        if (normalised !== null) return normalised;
      }
    } catch {
      // fall through to load average
    }
  }

  const load = os.loadavg()[0];
  const cores = os.cpus()?.length ?? 0;
  if (cores > 0 && Number.isFinite(load) && load >= 0) {
    return normaliseCpuPercent((load / cores) * 100);
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