// ==============================================================================
// HERMES JARVIS — CLIPBOARD COPY TRUTH
//
// Several HUD modals set their "Copied" flag the instant they called
// `navigator.clipboard.writeText(...)` and never observed the returned promise:
//
//   • NotepadModal       — Copy           → "Copied"
//   • BlueprintRoadmap   — Copy Markdown  → "Copied!"
//   • LocationServices   — Copy           → "Copied"
//   • OracleCloudModal   — Copy           → "Copied"
//   • SocialMediaModal   — Copy Text / Copy URL → "Copied"
//   • PermissionGateway  — Copy           → "Copied"
//   • FreelancePipeline  — Copy Quote     → "Copied"
//
// `writeText` rejects when the Clipboard API is missing (older browsers), when
// the document is not focused, and when the user/enterprise policy denies the
// permission. In every one of those cases the control still rendered a green
// "Copied" tick while the clipboard was untouched. The operator pastes and
// finds nothing.
//
// These helpers turn the real promise verdict into the label and the detail
// line, so a Copy control only reads "Copied" when the browser confirmed the
// write, and otherwise says plainly that nothing was copied.
// ==============================================================================

export type ClipboardCopyTone = 'success' | 'warn';

export interface ClipboardCopyResult {
  /** True only when `writeText` resolved — the browser confirmed the write. */
  copied: boolean;
  tone: ClipboardCopyTone;
  /** Short button label. */
  label: string;
  /** Full sentence for a tooltip / inline notice. */
  detail: string;
}

/**
 * Builds the honest copy outcome from the real write verdict. A failure names
 * the reason and states that nothing was copied; a success claims only the
 * clipboard write the browser confirmed (never that anything was saved).
 */
export function clipboardCopyOutcome(
  copied: boolean,
  what: string,
  failureReason?: string
): ClipboardCopyResult {
  const target = what.trim() || 'The text';
  if (copied) {
    return {
      copied: true,
      tone: 'success',
      label: 'Copied',
      detail: `${target} was copied to the clipboard.`,
    };
  }
  const reason = (failureReason || '').trim();
  return {
    copied: false,
    tone: 'warn',
    label: 'Copy failed',
    detail: reason
      ? `${target} could not be copied to the clipboard: ${reason}. Nothing was copied.`
      : `${target} could not be copied to the clipboard. Nothing was copied.`,
  };
}

/**
 * The text to place on the clipboard. A blank payload is replaced by an
 * explanatory notice so a "Copy" click can never put an empty string on the
 * clipboard and call it done.
 */
export function clipboardTextOrNotice(
  text: string | null | undefined,
  emptyNotice = 'Nothing was available to copy.'
): string {
  const value = typeof text === 'string' ? text : '';
  return value.length > 0 ? value : emptyNotice;
}

/**
 * Performs the clipboard write and reports what actually happened. Never throws:
 * a missing Clipboard API, a rejected promise, or a non-string payload all
 * resolve to a `copied: false` outcome with the reason.
 */
export async function copyToClipboard(
  text: string | null | undefined,
  what: string,
  emptyReason = 'there was nothing to copy'
): Promise<ClipboardCopyResult> {
  const value = typeof text === 'string' ? text : '';
  if (value.length === 0) {
    return clipboardCopyOutcome(false, what, emptyReason);
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return clipboardCopyOutcome(false, what, 'the Clipboard API is unavailable in this browser');
  }
  try {
    await navigator.clipboard.writeText(value);
    return clipboardCopyOutcome(true, what);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'the browser refused the clipboard write';
    return clipboardCopyOutcome(false, what, message);
  }
}
