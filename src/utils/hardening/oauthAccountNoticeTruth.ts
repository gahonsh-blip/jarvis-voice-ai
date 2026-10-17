/**
 * Honesty helpers for the OAuth popup notices in SocialMediaModal.
 *
 * The popup posts the linked account name when the provider returned one, but
 * it may post a payload without a name (or a blank/non-string name). The panel
 * previously fell back to the literal `'Channel'` / `'LinkedIn Member'`, so the
 * notice announced a named account nobody had read. These helpers return the
 * recorded name or `null`, and the notice states plainly that the name was not
 * returned instead of inventing one.
 */

export type OAuthPlatform = 'linkedin' | 'youtube';

/** The account name carried by the popup, or `null` when none was supplied. */
export function recordedAccountName(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export interface OAuthConnectionNotice {
  notice: string;
  spoken: string;
  /** True only when a real account name was recorded and named in the notice. */
  named: boolean;
}

/** The UI + spoken notice for a completed OAuth popup. Never invents a name. */
export function oauthConnectionNotice(platform: OAuthPlatform, rawName: unknown): OAuthConnectionNotice {
  const name = recordedAccountName(rawName);

  if (platform === 'linkedin') {
    return name
      ? {
          notice: `✅ Successfully authorized Personal Profile for ${name}!`,
          spoken: `LinkedIn personal profile connected successfully for ${name}, Sir.`,
          named: true,
        }
      : {
          notice: '✅ LinkedIn authorization completed — the account name was not returned by the popup.',
          spoken: 'LinkedIn personal profile connected successfully, Sir. The account name was not returned.',
          named: false,
        };
  }

  return name
    ? {
        notice: `✅ Successfully connected YouTube Channel "${name}"!`,
        spoken: `YouTube channel connected successfully for ${name}, Sir.`,
        named: true,
      }
    : {
        notice: '✅ YouTube authorization completed — the channel name was not returned by the popup.',
        spoken: 'YouTube channel connected successfully, Sir. The channel name was not returned.',
        named: false,
      };
}
