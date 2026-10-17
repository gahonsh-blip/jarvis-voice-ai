// =============================================================================
// HERMES JARVIS — Social action command truth (backlog item 13)
//
// `handleRejectLevel4Approval` (`src/components/SocialMediaModal.tsx`) issued
// `POST /api/social/action` with `action: 'reject'` and then discarded the
// response entirely: it cleared the staged draft from the panel and spoke
// "YouTube video draft rejected and kept offline" without ever reading the
// reply. The server does not always reject successfully. `executeApprovedAction`
// (`server.ts`) answers `success: false` when the rejection could not be written
// to durable storage (read-only volume, full disk), when the target post is not
// found, or when the kill switch is active. On all of those the draft stays
// `pending_approval` on disk, yet the panel hid it and announced a rejection
// that had not been recorded — the operator's next load finds the draft still
// awaiting authorization.
//
// This module keeps the claim apart from the write: only a response whose
// `success` is exactly `true` is treated as a recorded rejection. Every other
// reply (including a missing or malformed body) is reported honestly instead.
// =============================================================================

/** The exact sentence the panel speaks only for a recorded rejection. */
export const SOCIAL_REJECTION_REQUEST_FAILED =
  'The rejection request did not complete; the draft was not confirmed as rejected, Sir.';

export interface SocialRejectOutcome {
  /** True only when the server confirmed the rejection was recorded. */
  recorded: boolean;
  /** Message to show/spoken to the operator — never claims an unrecorded rejection. */
  message: string;
}

/**
 * Interpret a `/api/social/action` reject response.
 *
 * `success` counts as a recorded rejection only when it is exactly the boolean
 * `true`. A non-boolean truthy value (e.g. a string) is not a confirmation the
 * server contract guarantees, so it is treated as not recorded. A response
 * carrying a server `message` is surfaced verbatim; otherwise the caller's
 * honest fallback line is used.
 */
export function socialRejectOutcome(data: unknown): SocialRejectOutcome {
  const body = (data ?? {}) as { success?: unknown; message?: unknown };
  if (body.success === true) {
    return {
      recorded: true,
      message:
        typeof body.message === 'string' && body.message.trim()
          ? body.message
          : 'Draft rejected. Post returned to offline draft status.',
    };
  }
  return {
    recorded: false,
    message:
      typeof body.message === 'string' && body.message.trim()
        ? body.message
        : SOCIAL_REJECTION_REQUEST_FAILED,
  };
}
