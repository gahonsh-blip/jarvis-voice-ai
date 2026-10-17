/**
 * Backlog item 13 — zero fake success.
 *
 * The OAuth disconnect routes (`/api/auth/linkedin/disconnect` and
 * `/api/auth/youtube/disconnect`) gate the credential removal on the durable
 * `persistMemory()` write and roll it back when that write fails. The security
 * audit row they append next is a *second* durable write, but its boolean was
 * discarded: `addAuditLog` routes through `recordDurableAuditRow`, which returns
 * false when the row never reached `jarvis_memory.json`. The route then answered
 * `success: true` with a bare "disconnected" message, so the operator had no way
 * to tell that the security log had no record of the removal — the row lived
 * only in process memory and vanished on the next boot.
 *
 * These helpers turn that boolean into an honest note on the reply. The
 * disconnect itself is real — the credential removal was persisted — so the
 * reply is not turned into a failure; it names the one thing that did not land.
 */

export type OAuthDisconnectPlatform = 'linkedin' | 'youtube';

/**
 * The caveat appended to a successful disconnect reply. Names the unrecorded
 * security-audit row when the durable write did not land, and returns an empty
 * string when the row is on disk so the reply stays unchanged.
 */
export function oauthDisconnectAuditNote(
  platform: OAuthDisconnectPlatform,
  auditRecorded: boolean
): string {
  if (auditRecorded) return '';
  const label = platform === 'linkedin' ? 'LinkedIn' : 'YouTube';
  return (
    `The ${label} account was disconnected and the credential removal was saved, ` +
    'but the security audit entry for this disconnection could not be written to ' +
    'durable storage. The disconnection is real; the audit record is not, and it ' +
    'will be absent after a restart.'
  );
}

/** The success message for a durable disconnect, carrying the audit caveat. */
export function oauthDisconnectMessage(
  platform: OAuthDisconnectPlatform,
  auditRecorded: boolean
): string {
  const base =
    platform === 'linkedin'
      ? 'LinkedIn disconnected successfully.'
      : 'YouTube disconnected successfully.';
  const note = oauthDisconnectAuditNote(platform, auditRecorded);
  return note ? `${base} ${note}` : base;
}

/**
 * The notice the Social Media Hub renders for a disconnect reply. A failed
 * durable write answers with `error` and no `message`, and the panel used to
 * fall through to "No ... account is connected." — announcing that nothing was
 * linked when in fact a linked account could not be removed. Prefer the
 * server's own explanation, in either shape.
 */
export function oauthDisconnectNotice(
  platform: OAuthDisconnectPlatform,
  reply: { success?: boolean; message?: unknown; error?: unknown }
): string {
  const notConnected =
    platform === 'linkedin'
      ? 'No LinkedIn account is connected.'
      : 'No YouTube channel is connected.';
  const serverText =
    (typeof reply.message === 'string' && reply.message.trim()) ||
    (typeof reply.error === 'string' && reply.error.trim()) ||
    '';
  if (serverText) return serverText;
  return notConnected;
}
