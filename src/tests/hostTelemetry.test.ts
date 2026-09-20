import { describe, it, expect } from 'vitest';
import os from 'os';
import {
  getHostCpuUsagePercent,
  getHostRam,
  getDiskUsagePercent,
  sampleHostTelemetry,
} from '../utils/hardening/hostTelemetry';

describe('hostTelemetry — real daemon-host metrics (no invented values)', () => {
  it('reports RAM derived from the real os totals', () => {
    const ram = getHostRam();
    const expectedTotalGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100;

    expect(ram.totalGb).toBeCloseTo(expectedTotalGb, 2);
    expect(ram.usedGb).toBeGreaterThanOrEqual(0);
    expect(ram.usedGb).toBeLessThanOrEqual(ram.totalGb + 0.01);
    expect(ram.percent).toBeGreaterThanOrEqual(0);
    expect(ram.percent).toBeLessThanOrEqual(100);
  });

  it('reports a CPU percentage in range, or null when the runtime cannot measure it', () => {
    const cpu = getHostCpuUsagePercent();
    if (cpu !== null) {
      expect(cpu).toBeGreaterThanOrEqual(0);
      expect(cpu).toBeLessThanOrEqual(100);
    } else {
      expect(cpu).toBeNull();
    }
  });

  it('never reports a fractional 0-1 CPU value as if it were a percentage', () => {
    // Regression guard: a raw 0-1 utilisation must be scaled to 0-100 so the UI
    // and the spoken response cannot understate load by 100x.
    const cpu = getHostCpuUsagePercent();
    if (cpu !== null && cpu > 0) {
      expect(cpu).toBeGreaterThanOrEqual(1);
    }
  });

  it('reports a disk percentage in range, or null when statfs is unavailable', () => {
    const disk = getDiskUsagePercent();
    if (disk !== null) {
      expect(disk).toBeGreaterThanOrEqual(0);
      expect(disk).toBeLessThanOrEqual(100);
    } else {
      expect(disk).toBeNull();
    }
  });

  it('sampleHostTelemetry surfaces live_host provenance, not a fabricated constant', () => {
    const sample = sampleHostTelemetry();
    expect(sample.source).toBe('live_host');
    expect(sample.metricsSource).toBe('node-os');
    expect(Number.isNaN(Date.parse(sample.sampledAt))).toBe(false);
    expect(sample.ramTotalGb).toBeGreaterThan(0);
    expect(sample.ramUsage).toBe(getHostRam().percent);
  });

  it('derives RAM used from the host instead of the old hardcoded constants', () => {
    // The previous /api/oracle-cloud reported RAM/CPU from fixed constants
    // regardless of the real machine. The used figure must now equal the real
    // totalminus-free read, and the total must not be the literal 24 GB unless
    // that is genuinely what the host has.
    const ram = getHostRam();
    const expectedUsedGb =
      Math.round((Math.max(0, os.totalmem() - os.freemem()) / 1024 / 1024 / 1024) * 100) / 100;

    expect(ram.usedGb).toBeCloseTo(expectedUsedGb, 2);
    const realTotalGb = os.totalmem() / 1024 / 1024 / 1024;
    if (Math.abs(realTotalGb - 24) > 0.5) {
      expect(ram.totalGb).not.toBe(24);
    }
  });
});