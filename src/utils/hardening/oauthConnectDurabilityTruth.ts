/**
 * Backlog item 13 — zero fake success.
 *
 * Both OAuth connect callbacks (`/api/auth/linkedin/callback` and
 * `/api/auth/youtube/callback`) gate the stored credential on the durable
 * `persistMemory()` write and drop the credential when it fails. The security
 * audit row they append next is a *second* durable write, but its boolean was
 * discarded: `addAuditLog` routes through `recordDurableAuditRow`, which returns
 * false when the row never reached `jarvis_memory.json`. The route then rendered
 * its green "Connected!" card regardless, so an operator could believe the
 * connection was recorded in the security log while the row lived only in
 * process memory and vanished on the next boot.
 *
 * These helpers turn that boolean into an honest note. The connection itself is
 * real — its credential was persisted and read back — so the popup is not turned
 * into a failure; it names the one thing that did not land.
 */

export type OAuthConnectPlatform = 'linkedin' | 'youtube';

/**
 * The note rendered under a successful OAuth connection card. Names the
 * unrecorded security-audit row when the durable write did not land, and returns
 * an empty string when the row is on disk so the card stays unchanged.
 */
export function oauthConnectAuditNote(
  platform: OAuthConnectPlatform,
  auditRecorded: boolean
): string {
  if (auditRecorded) return '';
  const label = platform === 'linkedin' ? 'LinkedIn' : 'YouTube';
  return (
    `⚠️ ${label} connected and the credential was saved, but the security audit ` +
    'entry for this connection could not be written to durable storage. The ' +
    'connection is real; the audit record is not, and it will be absent after a restart.'
  );
}
