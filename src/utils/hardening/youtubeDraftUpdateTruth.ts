// =============================================================================
// HERMES JARVIS — YouTube draft metadata update truth (backlog item 13)
//
// `POST /api/social/youtube/update-draft` (`server.ts`) answered
// `{ success: true, post }` for every request that matched a staged post, even
// when the request carried nothing the route could apply. The Social Hub calls
// this with `{ postId, title, description, privacyStatus }`; when the operator
// clears the title and description fields and leaves privacy at `private` — the
// strict default the route coerces to — the call falls through every guard and
// mutates nothing, yet the modal announced "YouTube video parameters updated."
// A caller reading `success` cannot tell an applied change from a no-op, which
// is the fake-success shape item 13 exists to eliminate.
//
// This module decides what a request would actually change before the route
// writes, so the route only claims success for a real transition.
// =============================================================================

export interface YouTubeDraftFields {
  videoTitle?: string;
  videoDescription?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

export interface YouTubeDraftChanges {
  videoTitle?: string;
  videoDescription?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

export interface YouTubeDraftUpdateVerdict {
  /** True only when at least one field differs from the stored draft. */
  success: boolean;
  /** The fields to apply; empty when nothing changes. */
  changes: YouTubeDraftChanges;
  /** Machine-readable outcome: APPLIED or UNCHANGED. */
  outcome: 'APPLIED' | 'UNCHANGED';
  message: string;
}

/**
 * Decide which draft fields a request actually changes.
 *
 * A field is applied only when it is present and differs from the stored value.
 * `privacyStatus` mirrors the route's strict default: an unrecognised value
 * means `private`, and re-applying the stored privacy is not a change. This
 * keeps a repeat submission — the common UI case — reported as a no-op rather
 * than a saved update.
 */
export function classifyYouTubeDraftUpdate(
  requested: {
    title?: unknown;
    description?: unknown;
    privacyStatus?: unknown;
  },
  current: YouTubeDraftFields
): YouTubeDraftUpdateVerdict {
  const changes: YouTubeDraftChanges = {};

  if (typeof requested.title === 'string' && requested.title.trim()) {
    const title = requested.title.trim();
    if (title !== current.videoTitle) changes.videoTitle = title;
  }

  if (typeof requested.description === 'string') {
    if (requested.description !== current.videoDescription) {
      changes.videoDescription = requested.description;
    }
  }

  if (typeof requested.privacyStatus === 'string' && requested.privacyStatus) {
    const privacy = requested.privacyStatus === 'unlisted' || requested.privacyStatus === 'public'
      ? requested.privacyStatus
      : 'private';
    if (privacy !== current.privacyStatus) changes.privacyStatus = privacy;
  }

  const applied = Object.keys(changes).length > 0;
  return {
    success: applied,
    changes,
    outcome: applied ? 'APPLIED' : 'UNCHANGED',
    message: applied
      ? `Draft updated: ${Object.keys(changes).join(', ')}.`
      : 'The request did not change the draft; no update was applied.',
  };
}
