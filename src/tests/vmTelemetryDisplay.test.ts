import { describe, it, expect } from 'vitest';
import {
  normalizeUptimeHours,
  normalizePublicIp,
  normalizeVmStatus,
  normalizeMetricPercent,
  buildSshCommand,
} from '../utils/vmTelemetryDisplay';

describe('vmTelemetryDisplay — the Oracle modal never invents a value', () => {
  it('preserves a real uptime, including a measured zero', () => {
    expect(normalizeUptimeHours(342)).toBe(342);
    expect(normalizeUptimeHours(7.9)).toBe(7);
    // A daemon that started this hour reports 0. `|| 342` used to rewrite that
    // measured zero into 342 hours.
    expect(normalizeUptimeHours(0)).toBe(0);
  });

  it('returns null for a missing or malformed uptime', () => {
    expect(normalizeUptimeHours(undefined)).toBeNull();
    expect(normalizeUptimeHours(null)).toBeNull();
    expect(normalizeUptimeHours(Number.NaN)).toBeNull();
    expect(normalizeUptimeHours(-1)).toBeNull();
    expect(normalizeUptimeHours('342')).toBeNull();
  });

  it('renders the reported public IP and never falls back to a literal', () => {
    expect(normalizePublicIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizePublicIp('  203.0.113.9  ')).toBe('203.0.113.9');
    expect(normalizePublicIp(undefined)).toBeNull();
    expect(normalizePublicIp('')).toBeNull();
    expect(normalizePublicIp('   ')).toBeNull();
    expect(normalizePublicIp(129)).toBeNull();
  });

  it('accepts only the provider run states', () => {
    expect(normalizeVmStatus('RUNNING')).toBe('RUNNING');
    expect(normalizeVmStatus('STOPPED')).toBe('STOPPED');
    expect(normalizeVmStatus('PROVISIONING')).toBe('PROVISIONING');
    expect(normalizeVmStatus('online')).toBeNull();
    expect(normalizeVmStatus(undefined)).toBeNull();
  });

  it('clamps utilisation to 0-100 and rejects what cannot be measured', () => {
    expect(normalizeMetricPercent(42.4)).toBe(42.4);
    expect(normalizeMetricPercent(0)).toBe(0);
    expect(normalizeMetricPercent(107)).toBe(100);
    expect(normalizeMetricPercent(-5)).toBe(0);
    expect(normalizeMetricPercent(Number.NaN)).toBeNull();
    expect(normalizeMetricPercent(null)).toBeNull();
    expect(normalizeMetricPercent(undefined)).toBeNull();
  });

  it('builds an SSH command only for a reported address', () => {
    expect(buildSshCommand('203.0.113.9')).toBe(
      'ssh -i ~/.ssh/oracle_arm_key ubuntu@203.0.113.9'
    );
    // No address reported means no command to copy — not the hardcoded default.
    expect(buildSshCommand(undefined)).toBeNull();
    expect(buildSshCommand('')).toBeNull();
  });
});