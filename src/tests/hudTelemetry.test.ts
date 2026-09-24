import { describe, it, expect, vi } from 'vitest';
import {
  UNAVAILABLE_HUD_TELEMETRY,
  parseHudTelemetry,
  fetchHudTelemetry,
  formatHudPercent,
} from '../utils/hudTelemetry';

const okResponse = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe('HUD telemetry — never fabricates a reading', () => {
  it('reads real cpu/ram from the oracle-cloud payload', () => {
    const snap = parseHudTelemetry({
      metrics: { cpuUsage: 27.4, ramUsage: 61.2, ramUsedGb: 14.7, ramTotalGb: 24 },
      metricsSource: 'live_host',
      metricsSampledAt: '2026-09-20T15:30:00.000Z',
    });
    expect(snap.cpuUsage).toBe(27.4);
    expect(snap.ramUsage).toBe(61.2);
    expect(snap.metricsSource).toBe('live_host');
    expect(snap.sampledAt).toBe('2026-09-20T15:30:00.000Z');
  });

  it('keeps null readings as null instead of substituting a plausible number', () => {
    const snap = parseHudTelemetry({
      metrics: { cpuUsage: null, ramUsage: null },
      metricsSource: 'unavailable',
      metricsSampledAt: null,
    });
    expect(snap.cpuUsage).toBeNull();
    expect(snap.ramUsage).toBeNull();
    expect(snap.sampledAt).toBeNull();
  });

  it('rejects non-finite, negative and non-numeric metrics', () => {
    const snap = parseHudTelemetry({
      metrics: { cpuUsage: Number.NaN, ramUsage: -3 },
      metricsSource: 'live_host',
    });
    expect(snap.cpuUsage).toBeNull();
    expect(snap.ramUsage).toBeNull();

    const strings = parseHudTelemetry({ metrics: { cpuUsage: '42' as unknown, ramUsage: '8' as unknown } });
    expect(strings.cpuUsage).toBeNull();
    expect(strings.ramUsage).toBeNull();
  });

  it('falls back to the unavailable snapshot for malformed payloads', () => {
    expect(parseHudTelemetry(null)).toEqual(UNAVAILABLE_HUD_TELEMETRY);
    expect(parseHudTelemetry(undefined)).toEqual(UNAVAILABLE_HUD_TELEMETRY);
    expect(parseHudTelemetry('not-json')).toEqual(UNAVAILABLE_HUD_TELEMETRY);
    expect(parseHudTelemetry({})).toEqual(UNAVAILABLE_HUD_TELEMETRY);
  });

  it('carries the billing entitlement observation only when explicitly reported', () => {
    expect(parseHudTelemetry({ billingEntitlement: 'FREE' }).billingEntitlement).toBe('FREE');
    expect(parseHudTelemetry({ billingEntitlement: 'BILLED' }).billingEntitlement).toBe('BILLED');
    // A payload with no billing field is unobserved, not free.
    expect(parseHudTelemetry({ metrics: {} }).billingEntitlement).toBeNull();
    expect(parseHudTelemetry({ billingEntitlement: 'always free' }).billingEntitlement).toBeNull();
  });

  it('returns the unavailable snapshot when the fetch fails or is not ok', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await fetchHudTelemetry(failing)).toEqual(UNAVAILABLE_HUD_TELEMETRY);

    const notOk = vi.fn(async () => ({ ok: false }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchHudTelemetry(notOk)).toEqual(UNAVAILABLE_HUD_TELEMETRY);

    const badJson = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchHudTelemetry(badJson)).toEqual(UNAVAILABLE_HUD_TELEMETRY);
  });

  it('fetches and parses a healthy payload', async () => {
    const fetcher = vi.fn(async () =>
      okResponse({ metrics: { cpuUsage: 12, ramUsage: 40 }, metricsSource: 'live_host' })
    ) as unknown as typeof fetch;
    const snap = await fetchHudTelemetry(fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/oracle-cloud');
    expect(snap.cpuUsage).toBe(12);
    expect(snap.ramUsage).toBe(40);
  });

  it('formats a missing reading as an em dash, never as a number', () => {
    expect(formatHudPercent(null)).toBe('—');
    expect(formatHudPercent(0)).toBe('0%');
    expect(formatHudPercent(14.8)).toBe('14.8%');
  });
});