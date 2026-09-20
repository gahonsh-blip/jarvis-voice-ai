import { describe, it, expect } from 'vitest';
import {
  NO_INSTANCE_OBSERVATION,
  observeInstanceFromHost,
  describeRunState,
  describePublicIp,
} from '../utils/hardening/ociInstanceTruth';

// The server must never assert an OCI control-plane fact it did not observe.
// These tests pin the derivation rules for the only instance fact that *is*
// provable from inside the process (a hostname match) and the honest rendering
// of the rest.

describe('observeInstanceFromHost', () => {
  it('reports no run state when the host is not the Oracle instance', () => {
    const obs = observeInstanceFromHost(false, '2026-09-21T00:00:00Z');
    expect(obs.status).toBeNull();
    expect(obs.publicIp).toBeNull();
    expect(obs.observedAt).toBeNull();
  });

  it('reports RUNNING only as a lower bound from a real hostname match', () => {
    const obs = observeInstanceFromHost(true, '2026-09-21T00:00:00Z');
    expect(obs.status).toBe('RUNNING');
    // The address is not derivable from a hostname match, so it stays unobserved.
    expect(obs.publicIp).toBeNull();
    expect(obs.observedAt).toBe('2026-09-21T00:00:00Z');
  });

  it('never invents a public address, even for a matched host', () => {
    const obs = observeInstanceFromHost(true, null);
    expect(obs.publicIp).toBeNull();
    expect(obs.observedAt).toBeNull();
  });

  it('exposes an explicit no-observation constant', () => {
    expect(NO_INSTANCE_OBSERVATION).toEqual({ status: null, publicIp: null, observedAt: null });
  });
});

describe('describeRunState', () => {
  it('names an unobserved state instead of assuming RUNNING', () => {
    expect(describeRunState(null)).toBe('NOT_OBSERVED');
  });

  it('passes through an observed state', () => {
    expect(describeRunState('RUNNING')).toBe('RUNNING');
    expect(describeRunState('STOPPED')).toBe('STOPPED');
  });
});

describe('describePublicIp', () => {
  it('names an unobserved address instead of a plausible default', () => {
    expect(describePublicIp(null)).toBe('not observed');
    expect(describePublicIp('')).toBe('not observed');
    expect(describePublicIp('   ')).toBe('not observed');
  });

  it('passes through a reported address', () => {
    expect(describePublicIp('203.0.113.9')).toBe('203.0.113.9');
  });

  it('never returns the address that was previously seeded as a constant', () => {
    expect(describePublicIp(null)).not.toContain('129.154.42.108');
  });
});