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
  // The connected-account banners in SocialMediaModal.tsx fell back to these
  // when the OAuth grant carried no name, and announced a named member.
  'Personal Member',
  'Authenticated Member',
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

/** Label shown when a connected account's channel/account ID was not recorded. */
export const CHANNEL_ID_NOT_RECORDED_LABEL = 'channel ID not recorded — no channel was read';

/**
 * Identity line for the connected LinkedIn banner. The banner rendered
 * `oauth.name || 'Personal Member'` and the target line rendered
 * `linkedInInfo?.accountName || 'Authenticated Member'`, so a connected grant
 * whose name the provider never returned was announced as a named member. This
 * returns the observed name or states plainly that none was returned.
 */
export function connectedLinkedInIdentity(raw: unknown): string {
  return observedAccountName(raw) ?? ACCOUNT_NAME_NOT_RETURNED_LABEL;
}

/**
 * Channel-ID line for the connected YouTube banner. The banner rendered
 * `ytOauth.channelId || 'Authenticated Google Account'`, so a connection whose
 * channel ID was never read displayed an invented account identity. This
 * returns the recorded ID or states that no channel was read.
 */
export function connectedYouTubeChannelId(raw: unknown): string {
  if (typeof raw !== 'string') return CHANNEL_ID_NOT_RECORDED_LABEL;
  const trimmed = raw.trim();
  // A replayed payload carrying the old placeholder must not read as an ID.
  if (!trimmed || trimmed === 'Authenticated Google Account') return CHANNEL_ID_NOT_RECORDED_LABEL;
  return trimmed;
}

/** Label shown when a connected account's LinkedIn author URN was not recorded. */
export const AUTHOR_URN_NOT_RECORDED_LABEL = 'author URN not recorded — no member was read';

/**
 * The historical placeholder member URN. It is syntactically valid but names no
 * real member, so it must never be treated as a resolved author — a legacy
 * persisted value is as good as unread.
 */
export const LEGACY_LINKEDIN_SELF_URN = 'urn:li:person:self';

/**
 * Resolves the member URN to publish under, or `null` when no real member
 * identity was read. The publish path defaulted an unresolved author to
 * `urn:li:person:self`, so a grant that carried no author URN and whose
 * `/v2/userinfo` returned no member sub was published to an invented member.
 * This returns the recorded URN, else a URN derived from a real member sub,
 * else `null` so the caller can refuse instead of posting to a phantom author.
 */
export function resolveLinkedInAuthorUrn(rawUrn: unknown, rawMemberSub: unknown): string | null {
  const urn = typeof rawUrn === 'string' ? rawUrn.trim() : '';
  if (urn && urn !== LEGACY_LINKEDIN_SELF_URN) return urn;
  const sub = typeof rawMemberSub === 'string' ? rawMemberSub.trim() : '';
  if (sub && sub !== 'self') return `urn:li:person:${sub}`;
  return null;
}

/**
 * Author-URN line for the connected LinkedIn banner. The banner rendered
 * `oauth.authorUrn || \`urn:li:person:${oauth.memberSub || 'self'}\``. A grant
 * whose author URN and member sub were both absent — the member identity was
 * never read — still displayed `urn:li:person:self`, a syntactically valid
 * member URN, so the operator read a concrete author identity that no provider
 * had returned. This returns the recorded URN or member-sub-derived URN, or
 * states plainly that no member was read; it never fabricates `self`.
 */
export function linkedInAuthorUrnLabel(rawUrn: unknown, rawMemberSub: unknown): string {
  const urn = typeof rawUrn === 'string' ? rawUrn.trim() : '';
  if (urn) return urn;
  const sub = typeof rawMemberSub === 'string' ? rawMemberSub.trim() : '';
  // `self` is the historical placeholder for an unread member, not a real sub.
  if (sub && sub !== 'self') return `urn:li:person:${sub}`;
  return AUTHOR_URN_NOT_RECORDED_LABEL;
}
