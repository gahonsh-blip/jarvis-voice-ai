// ==============================================================================
// HERMES JARVIS — LIVE SOCIAL ACCOUNT IDENTITY, STATED HONESTLY
//
// `testPlatformConnection()` in server.ts makes a real, token-authenticated call
// to each platform and answers `success: true, status: 'VERIFIED'` when the call
// authenticates. The account NAME it returns, however, was invented when the
// provider response omitted one:
//
//   • LinkedIn  — `data.name || (given+family) || 'LinkedIn Member'`
//   • Facebook  — `data.name || 'Facebook Page'`
//   • Instagram — `data.username ? '@'+username : (data.name || 'Instagram Account')`
//   • YouTube   — `item.snippet?.title || 'YouTube Channel'`
//
// A provider response missing the name field still authenticated, so the card
// announced a named account ("Verified ... for LinkedIn Member", "Connected &
// Verified to Page "Facebook Page"") that no provider had returned. The account
// is genuinely verified; the NAME is not measured. These helpers return the
// observed name or `null`, and the caller states plainly that the provider did
// not return one instead of inventing it.
// ==============================================================================

/** Names earlier code invented when a provider response carried no name. */
const INVENTED_ACCOUNT_NAMES = new Set([
  'LinkedIn Member',
  'Facebook Page',
  'Instagram Account',
  'YouTube Channel',
  'YouTube User',
  // The disconnect routes (`server.ts`) fell back to these when the stored
  // connection carried no name, then logged the removal with the placeholder.
  'LinkedIn User',
  'YouTube Account',
]);

/**
 * The trimmed, observed account name, or `null` when the provider returned none
 * (missing, blank/non-string, or one of the historical placeholder names so a
 * replayed payload cannot read as a real account).
 */
export function observedAccountName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (INVENTED_ACCOUNT_NAMES.has(trimmed)) return null;
  return trimmed;
}

export type SocialAccountPlatform = 'linkedin' | 'facebook' | 'instagram' | 'youtube' | 'twitter';

/** Human label used when the provider did not return an account name. */
export const ACCOUNT_NAME_NOT_RETURNED_LABEL = 'name not returned by the provider';

/**
 * Description of the verified identity for a platform's message line. Uses the
 * observed name when present; otherwise falls back to the real identifier
 * (URL/handle/id, e.g. `@handle` or a page id) and, failing that, states that no
 * name was returned. Never invents a display name.
 */
export function describeVerifiedAccount(
  platform: SocialAccountPlatform,
  rawName: unknown,
  rawIdentifier: unknown
): string {
  const name = observedAccountName(rawName);
  if (name) return name;

  const identifier =
    typeof rawIdentifier === 'string' && rawIdentifier.trim().length > 0 ? rawIdentifier.trim() : null;
  if (identifier) return identifier;

  switch (platform) {
    case 'linkedin':
      return ACCOUNT_NAME_NOT_RETURNED_LABEL;
    case 'facebook':
      return ACCOUNT_NAME_NOT_RETURNED_LABEL;
    case 'instagram':
      return ACCOUNT_NAME_NOT_RETURNED_LABEL;
    case 'youtube':
      return 'channel name not returned — the authenticated channel was not named';
    default:
      return ACCOUNT_NAME_NOT_RETURNED_LABEL;
  }
}

/**
 * Label for an OAuth disconnect audit row. The disconnect routes used to name
 * the removed account with a hardcoded fallback — `'LinkedIn User'` /
 * `'YouTube Account'` — when the stored connection carried no name, and then
 * logged the removal as `VERIFIED`. The credential removal is real; the NAME
 * was invented. This returns the recorded name, or a plain statement that no
 * name was recorded, so the audit row never presents a placeholder as the
 * account that was disconnected.
 */
export function disconnectAccountLabel(raw: unknown): string {
  const name = observedAccountName(raw);
  return name ? name : 'account name not recorded — no name was read';
}
