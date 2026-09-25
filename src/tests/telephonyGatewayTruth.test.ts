import { describe, it, expect } from 'vitest';
import {
  SIMULATION_PROVIDER_ID,
  telephonyEngineProviderId,
  telephonyEngineMode,
  telephonyEngineLabel,
  telephonySelectionApplied,
} from '../utils/telephonyGatewayTruth';
import { TelephonyProviderRegistry } from '../utils/telephonyAdapters';

// Zero-fake-success guard for the Telephony Hub engine selector.
//
// The "Active Telephony Engine" choice was written to telephonySettingsState and
// never applied to TelephonyProviderRegistry, so the server kept serving whatever
// TELEPHONY_PROVIDER had set at boot. On top of that the simulated adapter's
// isConfigured() returns true unconditionally, so the obvious wiring would have
// flipped a simulator with no PSTN carrier to a green "GATEWAY CONFIGURED".
// These tests pin the mapping and the honest mode/label derived from it.

describe('telephony engine selection maps to a routable registry id', () => {
  it('maps the UI simulator value to its registered provider id', () => {
    expect(telephonyEngineProviderId('browser_webrtc_simulator')).toBe(SIMULATION_PROVIDER_ID);
    expect(telephonyEngineProviderId('twilio')).toBe('twilio');
  });

  it('returns null for engines this build cannot route', () => {
    expect(telephonyEngineProviderId('sip')).toBeNull();
    expect(telephonyEngineProviderId(undefined)).toBeNull();
    expect(telephonyEngineProviderId('')).toBeNull();
  });

  it('every registered provider id is reachable through the mapping', () => {
    for (const id of ['twilio', SIMULATION_PROVIDER_ID]) {
      expect(TelephonyProviderRegistry.setActiveProvider(id)).toBe(true);
    }
  });
});

describe('engine mode says only what was observed', () => {
  it('never reports a simulator as a live gateway even when isConfigured() is true', () => {
    // The simulator's own isConfigured() is unconditionally true; that claim
    // must not be promoted to LIVE_GATEWAY.
    expect(telephonyEngineMode(SIMULATION_PROVIDER_ID, true)).toBe('SIMULATION_ONLY');
    expect(telephonyEngineLabel(telephonyEngineMode(SIMULATION_PROVIDER_ID, true)))
      .not.toBe('GATEWAY CONFIGURED');
  });

  it('reports a configured carrier as a live gateway', () => {
    expect(telephonyEngineMode('twilio', true)).toBe('LIVE_GATEWAY');
    expect(telephonyEngineLabel('LIVE_GATEWAY')).toBe('GATEWAY CONFIGURED');
  });

  it('reports an unconfigured carrier as not configured', () => {
    expect(telephonyEngineMode('twilio', false)).toBe('NOT_CONFIGURED');
    expect(telephonyEngineLabel('NOT_CONFIGURED')).toBe('TELEPHONY_NOT_CONFIGURED');
  });

  it('reports an unknown engine id as unsupported, not configured', () => {
    expect(telephonyEngineMode(null, true)).toBe('UNSUPPORTED_ENGINE');
    expect(telephonyEngineLabel('UNSUPPORTED_ENGINE')).toBe('ENGINE NOT SUPPORTED');
  });
});

describe('selection applied is a measured comparison', () => {
  it('is true only when the saved engine is the serving provider', () => {
    expect(telephonySelectionApplied('twilio', 'twilio')).toBe(true);
    expect(telephonySelectionApplied('browser_webrtc_simulator', SIMULATION_PROVIDER_ID)).toBe(true);
  });

  it('is false when the saved engine and the serving provider disagree', () => {
    expect(telephonySelectionApplied('twilio', SIMULATION_PROVIDER_ID)).toBe(false);
    expect(telephonySelectionApplied('browser_webrtc_simulator', 'twilio')).toBe(false);
  });

  it('is false for an unroutable engine rather than silently true', () => {
    expect(telephonySelectionApplied('sip', 'twilio')).toBe(false);
    expect(telephonySelectionApplied(undefined, 'twilio')).toBe(false);
  });
});
