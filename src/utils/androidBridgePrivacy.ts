// =============================================================================
// HERMES JARVIS — Android Bridge HTTP Privacy Helpers
// Shared by the /api/mobile/bridge/* routes so the HTTP surface masks caller
// identifiers with the canonical engine helper instead of a local regex.
// =============================================================================
import { maskPhoneNumber } from './androidBridgeEngine';

/**
 * Mask a caller identifier reported by an Android device.
 * Returns `undefined` when the device reported no identifier at all, so the
 * caller can fall back to its own honest "unknown" wording rather than a mask.
 */
export function maskAndroidCallerNumber(raw?: string | null): string | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  return maskPhoneNumber(String(raw));
}
