import { describe, it, expect } from 'vitest';
import {
  normalizeUptimeHours,
  normalizePublicIp,
  normalizeVmStatus,
  normalizeMetricPercent,
  buildSshCommand,
  resolveFirewallRuleState,
  summarizeFirewallObservation,
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

  it('treats a firewall rule as unprobed until a real observation exists', () => {
    // The server no longer sets `active: true` for rules it never tested, so a
    // plain boolean still maps to an observation but null/stale values do not.
    expect(resolveFirewallRuleState(true)).toBe('OBSERVED_OPEN');
    expect(resolveFirewallRuleState(false)).toBe('OBSERVED_CLOSED');
    expect(resolveFirewallRuleState(null)).toBe('NOT_PROBED');
    expect(resolveFirewallRuleState(undefined)).toBe('NOT_PROBED');
    // A truthy non-boolean must not be mistaken for an observation.
    expect(resolveFirewallRuleState('true')).toBe('NOT_PROBED');
    expect(resolveFirewallRuleState(1)).toBe('NOT_PROBED');
  });

  it('only claims verified ingress when every rule was actually observed', () => {
    const declared = [
      { active: null },
      { active: null },
      { active: null },
      { active: null },
      { active: null },
    ];
    // This is the shape the server returns today: five declared, zero observed.
    expect(summarizeFirewallObservation(declared)).toEqual({
      verified: false,
      probedCount: 0,
      total: 5,
    });
    expect(summarizeFirewallObservation([{ active: true }, { active: true }])).toEqual({
      verified: true,
      probedCount: 2,
      total: 2,
    });
    // One unobserved rule withholds the whole claim.
    expect(summarizeFirewallObservation([{ active: true }, { active: null }])).toEqual({
      verified: false,
      probedCount: 1,
      total: 2,
    });
    // An empty list is not a verified claim either.
    expect(summarizeFirewallObservation([])).toEqual({ verified: false, probedCount: 0, total: 0 });
    expect(summarizeFirewallObservation(undefined)).toEqual({ verified: false, probedCount: 0, total: 0 });
  });
});