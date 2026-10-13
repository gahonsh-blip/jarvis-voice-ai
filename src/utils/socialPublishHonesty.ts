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
 * The upload/publish scope a provider requires, keyed by the platform ids the
 * Social Hub uses. A token that was granted without the scope authenticates
 * fine yet cannot publish, so "connected" and "can publish" are different
 * facts.
 */
export const PLATFORM_PUBLISH_SCOPES: Record<SocialPlatformKey, string> = {
  linkedin: 'w_member_social',
  facebook: 'pages_manage_posts',
  instagram: 'instagram_content_publish',
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
  twitter: 'tweet.write',
};

/**
 * Reads the scopes the provider actually granted from an OAuth token response.
 *
 * Returns `null` when the response carried no scope field. That is a real
 * observation — the provider was silent — and must not be read as "all scopes
 * granted". A non-empty list is returned as-is, including an empty array.
 */
export function grantedScopesFromTokenResponse(tokenData: unknown): string[] | null {
  if (!tokenData || typeof tokenData !== 'object') return null;
  const raw = (tokenData as Record<string, unknown>).scope;
  if (typeof raw === 'string') return raw.split(/\s+/).filter((s) => s.length > 0);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  return null;
}

/** True only when the granted scope list is known and contains the scope. */
export function scopeGranted(grantedScopes: string[] | null, required: string): boolean {
  return Array.isArray(grantedScopes) && grantedScopes.includes(required);
}

/**
 * Whether the stored credential has a granted publish scope.
 *
 * `undefined` means the scope list was never recorded (older connections) and
 * is reported as UNKNOWN rather than being assumed to include the scope.
 */
export function publishScopeGranted(
  platform: SocialPlatformKey,
  grantedScopes: string[] | undefined
): boolean | undefined {
  if (!Array.isArray(grantedScopes)) return undefined;
  return grantedScopes.includes(PLATFORM_PUBLISH_SCOPES[platform]);
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

/**
 * Human-readable list of the scopes the provider actually granted.
 *
 * `/api/auth/youtube/status` reports the recorded grant in `scopes` and leaves
 * it `undefined` when nothing was ever recorded. An absent list is the absence
 * of an observation, so it reads as `not recorded`, never as a scope list.
 */
export function describeGrantedScopes(scopes: string[] | undefined): string {
  if (!Array.isArray(scopes)) return 'not recorded';
  return scopes.length > 0 ? scopes.join(', ') : 'none granted';
}

/**
 * Whether a connection that the server measured can publish with that grant.
 *
 * Read access and upload access are different facts: a channel probe proves
 * the former. This returns true only for a live-verified connection that the
 * server also reports as able to publish.
 */
export function youtubeCanPublishMeasured(status: {
  status?: string;
  scopes?: string[];
  canPublish?: boolean;
} | null | undefined): boolean {
  if (!status) return false;
  return status.status === 'API_VERIFIED' && status.canPublish === true;
}

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

/**
 * The reach label for a post the server reported as published / VERIFIED.
 *
 * The server distinguishes an upload anyone can watch from one only the owner
 * can see: a YouTube upload is PRIVATE unless public is applied, and its
 * message states the privacy actually applied. The panel used to print
 * "Uploaded & Verified Live on YouTube" for every verified upload, asserting a
 * public audience the server never measured. This reads the privacy the server
 * recorded instead, and says so when none was recorded.
 */
export function publishedPostReachLabel(post: {
  platform?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}): string {
  if ((post?.platform ?? '') === 'YouTube') {
    switch (post?.privacyStatus) {
      case 'public':
        return 'Uploaded & Verified Public on YouTube';
      case 'unlisted':
        return 'Uploaded & Verified Unlisted on YouTube';
      case 'private':
        return 'Uploaded & Verified Private on YouTube';
      default:
        return 'Uploaded & Verified — visibility not recorded';
    }
  }
  return 'Live & Verified';
}

/** The status line the YouTube Studio banner shows for the current OAuth state. */
export const YOUTUBE_STUDIO_UNKNOWN_STATUS =
  'Status: UNKNOWN — the YouTube connection state has not been observed yet';

/**
 * Honest status line for the YouTube Data API v3 Studio banner.
 *
 * The banner used to fall through to
 * `Status: Ready for YouTube Video File Selection & Level-4 Human Authorization`
 * whenever `youTubeOAuthStatus` was absent — before the platforms probe
 * answered, after a failed load, or on a response whose status the branches did
 * not name. A green "Ready" over a value nobody observed reads as a live
 * channel. This names only what the provider data shows: a verified upload
 * grant, a read-only channel, configured-but-unverified credentials, a token
 * error, or an explicit UNKNOWN when no status was recorded.
 */
export function youTubeStudioStatusLine(
  oauth: {
    status?: string;
    connected?: boolean;
    canPublish?: boolean;
    authType?: string;
    channelTitle?: string;
    scopes?: string[];
    diagnosticError?: string;
  } | null | undefined
): string {
  if (!oauth || !oauth.status) {
    return YOUTUBE_STUDIO_UNKNOWN_STATUS;
  }
  if (oauth.status === 'API_VERIFIED' || (oauth.connected && oauth.canPublish)) {
    if (youtubeCanPublishMeasured(oauth)) {
      return `Channel: ${oauth.channelTitle || 'Unnamed channel'} | Grant confirmed by the provider — scopes: ${describeGrantedScopes(oauth.scopes)}`;
    }
    return `Channel confirmed read-only: ${oauth.channelTitle || 'unnamed channel'} | Video upload is NOT authorized — granted scopes: ${describeGrantedScopes(oauth.scopes)}`;
  }
  if (oauth.status === 'CONFIGURED') {
    return `Status: Configured (${oauth.authType || 'OAuth 2.0'}) — 1-Click OAuth Connect Required for Uploads`;
  }
  if (oauth.status === 'TOKEN_INVALID' || oauth.status === 'ERROR') {
    return `Status: Token / Permission Error (${oauth.diagnosticError || 'Re-authentication required'})`;
  }
  return YOUTUBE_STUDIO_UNKNOWN_STATUS;
}
