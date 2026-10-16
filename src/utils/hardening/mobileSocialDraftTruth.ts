// ==============================================================================
// HERMES JARVIS — MOBILE SOCIAL DRAFT TRUTH
//
// The Telegram/`processMobileCommand` `create_social_post` branch answered
// "NEW SOCIAL MEDIA POST DRAFTED" while it only looked up an existing
// pending-approval draft — it generated nothing. With no draft in the store the
// lookup returned undefined and the branch threw on `activeDraft.topic`, so the
// webhook answered 500 for a command the reply claimed to have drafted. The same
// intent is reported honestly everywhere else: the `/api/chat` case titles the
// result "Existing Draft Awaiting Approval", and the offline engine opens the
// Social Media Console without claiming a post was created.
//
// This helper derives the reply and the action target from the draft that was
// actually found, so a lookup is never presented as a creation, and an empty
// store answers with a real "no draft" notice instead of an exception.
// ==============================================================================

export interface MobileSocialDraft {
  id?: string | null;
  topic?: string | null;
  platform?: string | null;
  content?: string | null;
  status?: string | null;
}

export interface MobileSocialDraftReply {
  /** True only when a real draft was found. A lookup is not a creation. */
  found: boolean;
  /** The draft the caller may act on, or null when none exists. */
  draftId: string | null;
  /** Exact reply text, honest about lookup vs. creation. */
  replyText: string;
}

const NON_EMPTY = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/**
 * The draft this command should surface: the pending-approval draft when one
 * exists, otherwise the most recently stored post. Returns null for an empty or
 * malformed store rather than a fabricated record.
 */
export function resolveMobileSocialDraft(
  posts: MobileSocialDraft[] | null | undefined
): MobileSocialDraft | null {
  if (!Array.isArray(posts) || posts.length === 0) return null;
  return posts.find((p) => p?.status === 'pending_approval') ?? posts[0] ?? null;
}

/** A bounded content preview that never renders an empty string as content. */
function previewContent(content: string | null | undefined): string {
  if (!NON_EMPTY(content)) return '(no content stored on this draft)';
  const text = content.trim();
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

/**
 * Builds the reply and action target from the drafts actually present. A found
 * draft is labelled an existing draft — never a newly created one — and an empty
 * store produces a plain "no draft" notice with no action target.
 */
export function mobileSocialDraftReply(
  posts: MobileSocialDraft[] | null | undefined
): MobileSocialDraftReply {
  const draft = resolveMobileSocialDraft(posts);
  if (!draft) {
    return {
      found: false,
      draftId: null,
      replyText:
        '📱 *NO SOCIAL MEDIA DRAFT*\n\nThere is no social media draft to review — I did not create one. Generate a post from the web panel first.',
    };
  }

  const topic = NON_EMPTY(draft.topic) ? draft.topic.trim() : 'untitled draft';
  const platform = NON_EMPTY(draft.platform) ? draft.platform.trim() : 'platform not recorded';
  const draftId = NON_EMPTY(draft.id) ? draft.id : null;

  return {
    found: true,
    draftId,
    replyText:
      `📱 *EXISTING SOCIAL MEDIA DRAFT*\n\n*Topic*: ${topic}\n*Platform*: ${platform}\n\n` +
      `📝 *Draft Content*:\n"${previewContent(draft.content)}"\n\n` +
      `⚠️ *Human Approval Mode*: यह एक पहले से मौजूद draft है, मैंने अभी कोई नया post नहीं बनाया। इसे publish करूँ?`,
  };
}
