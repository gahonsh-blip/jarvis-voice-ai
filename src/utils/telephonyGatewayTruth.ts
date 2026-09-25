// ==============================================================================
// HERMES JARVIS — TELEPHONY GATEWAY ENGINE TRUTH
//
// The Telephony Hub "Active Telephony Engine" selector stored its choice in
// telephonySettingsState but nothing ever applied it to
// TelephonyProviderRegistry, so the choice was decorative: the server kept
// answering with whatever TELEPHONY_PROVIDER (default 'twilio') had set at
// boot. The operator could select "Browser WebRTC Simulator", read a green
// "GATEWAY CONFIGURED" badge, and still be talking to a different engine.
//
// The settings value also did not map to any registry id: the UI's
// 'browser_webrtc_simulator' is registered as 'simulation_test_provider', so
// the selection could never have been applied as written.
//
// Worst of all, SimulatedTestTelephonyProvider.isConfigured() returns `true`
// unconditionally ("test adapter is always ready for tests"), so wiring the
// selection naively would have flipped the simulator to a green
// "GATEWAY CONFIGURED" — a fresh fake success. A simulator has no PSTN
// carrier, so it is reported as SIMULATION_ONLY and never as configured.
// ==============================================================================

/** Registry id of the simulated/test adapter (see telephonyAdapters.ts). */
export const SIMULATION_PROVIDER_ID = 'simulation_test_provider';

/** Engine value the UI exposes -> the registry id that actually serves it. */
export const TELEPHONY_ENGINE_TO_PROVIDER: Record<string, string> = {
  browser_webrtc_simulator: SIMULATION_PROVIDER_ID,
  twilio: 'twilio',
};

/**
 * Resolve a UI engine value to a registered provider id. Returns null for an
 * engine this build cannot route (e.g. 'sip'), so the caller can report the
 * selection as unapplied instead of silently keeping the old engine.
 */
export function telephonyEngineProviderId(engine?: string | null): string | null {
  if (!engine) return null;
  return TELEPHONY_ENGINE_TO_PROVIDER[engine] ?? null;
}

export type TelephonyEngineMode =
  | 'LIVE_GATEWAY'
  | 'SIMULATION_ONLY'
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_ENGINE';

/**
 * Mode of the engine *actually* active, derived from the registry's active
 * provider id. `providerConfigured` is the adapter's own reading, used only
 * for real carriers; a simulation adapter is never LIVE_GATEWAY no matter what
 * its isConfigured() claims.
 */
export function telephonyEngineMode(
  providerId: string | null | undefined,
  providerConfigured: boolean,
): TelephonyEngineMode {
  if (!providerId) return 'UNSUPPORTED_ENGINE';
  if (providerId === SIMULATION_PROVIDER_ID) return 'SIMULATION_ONLY';
  return providerConfigured ? 'LIVE_GATEWAY' : 'NOT_CONFIGURED';
}

/** Label that says only what was observed. The simulator never reads CONFIGURED. */
export function telephonyEngineLabel(mode: TelephonyEngineMode): string {
  switch (mode) {
    case 'LIVE_GATEWAY':
      return 'GATEWAY CONFIGURED';
    case 'SIMULATION_ONLY':
      return 'SIMULATION ONLY (no PSTN)';
    case 'UNSUPPORTED_ENGINE':
      return 'ENGINE NOT SUPPORTED';
    default:
      return 'TELEPHONY_NOT_CONFIGURED';
  }
}

/**
 * Whether the saved engine selection is the one the registry is serving. When
 * false the settings panel and the live gateway disagree, and the UI must say
 * so rather than print a green badge over the mismatch.
 */
export function telephonySelectionApplied(
  selectedEngine: string | null | undefined,
  activeProviderId: string | null | undefined,
): boolean {
  const wanted = telephonyEngineProviderId(selectedEngine);
  return wanted !== null && wanted === activeProviderId;
}
