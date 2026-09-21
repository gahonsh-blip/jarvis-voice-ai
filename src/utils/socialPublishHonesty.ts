import type { SocialPlatformKey } from '../types';

/**
 * Truthfulness helpers for the social publishing surface.
 *
 * The Social Hub read three things as facts that it never measured:
 *   1. A platform whose credentials are merely *present* was labelled
 *      `CONNECTED`, and the draft panel rendered a green "Ready" / "OAuth Ready"
 *      badge from that label. Presence of a token is not a live connection —
 *      the server only learns the token still works when a provider call is
 *      made.
 *   2. A successful credential test took the `success` flag at face value and
 *      spoke "verified member" without reading the provider's own verification
 *      field.
 *   3. The header printed "Level 4 Approval Active" without asking whether the
 *      permission state had been fetched.
 */

export type ProviderVerdict =
  | 'IDLE'
  | 'OK'
  | 'NOT_CONFIGURED'
  | 'RECONNECT'
  | 'FAILED'
  | 'UNCONFIRMED';

/**
 * Classifies a raw `/api/social/platforms/test` response.
 *
 * The endpoint answers `{ success, status, accountName?, message }`. Only a
 * `success: true` paired with `status: 'VERIFIED'` **and** a reported account
 * name is a verification: `success: true` alone means the request completed,
 * not that the identity behind the credential was read.
 */
export function classifyProviderTestResponse(raw: unknown): ProviderVerdict {
  if (!raw || typeof raw !== 'object') return 'UNCONFIRMED';
  const data = raw as Record<string, unknown>;

  if (data.success === true) {
    if (data.status !== 'VERIFIED') return 'UNCONFIRMED';
    return verifiedAccountName(raw) ? 'OK' : 'UNCONFIRMED';
  }

  switch (data.status) {
    case 'NOT_CONFIGURED':
      return 'NOT_CONFIGURED';
    case 'AUTH_REQUIRED':
    case 'EXPIRED':
      return 'RECONNECT';
    case 'ERROR':
      return 'FAILED';
    // success:false with a status claiming verification, or no status at all,
    // is contradictory — report it as unverified rather than guessing.
    default:
      return 'UNCONFIRMED';
  }
}

/** Exact account identity proven by the provider, or null when unmeasured. */
export function verifiedAccountName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (data.success !== true || data.status !== 'VERIFIED') return null;
  const name = data.accountName;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

/** Human-readable outcome for the platform test card. Never overstates. */
export function describeProviderVerdict(
  verdict: ProviderVerdict,
  account: string | null,
  providerMessage?: string
): string {
  switch (verdict) {
    case 'OK':
      return account ? `Verified — live account: ${account}` : 'Verified by the provider.';
    case 'NOT_CONFIGURED':
      return 'Not configured — no credentials present.';
    case 'RECONNECT':
      return 'Authentication required — reconnect this account.';
    case 'FAILED':
      return providerMessage ? `Provider error: ${providerMessage}` : 'Provider call failed.';
    case 'UNCONFIRMED':
      return 'Provider answered but did not confirm the account — treated as UNVERIFIED.';
    default:
      return 'Not tested.';
  }
}

/**
 * Maps a platform status to text that does not overstate it. A token that is
 * merely present is `CONFIGURED — not yet verified`, never a confirmed
 * connection.
 */
export function connectionStatusLabel(
  status: string | null | undefined,
  measured: boolean
): string {
  if (!measured || !status) return 'Not checked yet — status unavailable';
  switch (status) {
    case 'CONNECTED':
    case 'API_VERIFIED':
    case 'VERIFIED':
      return 'Credentials present — live connection not yet verified';
    case 'AUTH_REQUIRED':
    case 'AUTHORIZATION_REQUIRED':
      return 'Authorization required — connect this account';
    case 'TOKEN_INVALID':
    case 'EXPIRED':
      return 'Credential rejected or expired — reconnect';
    case 'ERROR':
      return 'Provider error — nothing published';
    case 'CONFIGURED':
      return 'Configured — not yet verified';
    case 'NOT_CONFIGURED':
      return 'Not configured';
    default:
      return 'Unknown status';
  }
}

/** Returns true only for a status the server measured and found usable. */
export function isUsableCredential(status: string | null | undefined, measured: boolean): boolean {
  if (!measured) return false;
  return status === 'CONNECTED' || status === 'API_VERIFIED' || status === 'VERIFIED';
}

/**
 * The provider each platform id publishes through, as the server actually
 * addresses it. Rendered so the operator can see the claimed destination.
 */
export const PLATFORM_PROVIDER_HOSTS: Record<SocialPlatformKey, string> = {
  linkedin: 'api.linkedin.com',
  facebook: 'graph.facebook.com',
  instagram: 'graph.facebook.com',
  youtube: 'www.googleapis.com/youtube/v3',
  twitter: 'api.twitter.com',
};

/** Honest header label for the approval posture, derived from `/api/security`. */
export function socialApprovalPostureLabel(
  level: number | null | undefined,
  measured: boolean
): string {
  if (!measured || typeof level !== 'number' || !Number.isFinite(level)) {
    return 'Approval posture UNKNOWN';
  }
  if (level >= 4) return `Level ${level} approval required for external posts`;
  return `Permission level ${level} — NOT a Level 4 gate`;
}
