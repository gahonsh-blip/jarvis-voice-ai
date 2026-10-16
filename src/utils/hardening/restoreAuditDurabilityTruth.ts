/**
 * Backlog item 13 — zero fake success.
 *
 * `POST /api/restore` gates the merged restore on `persistMemory()` and rolls
 * the merge back when it fails. The `VERIFIED` audit row appended afterwards is
 * a *second* durable write through `addAuditLog()` → `recordDurableAuditRow()`,
 * which returns false when the row never reached `jarvis_memory.json` (and drops
 * the phantom row). That boolean was discarded, so a restore that was applied
 * durably but whose security record did not land still answered an unqualified
 * `success: true`, and the operator had no way to tell that the audit trail for a
 * Level-4 destructive operation was missing.
 *
 * The restore itself is real — it was written and read back — so the response is
 * not turned into a failure; the helper names the one thing that did not land.
 */

/**
 * The note attached to a successful restore response. Names the unrecorded
 * security-audit row when the durable write did not land, and returns an empty
 * string when the row is on disk so a durable restore is unchanged.
 */
export function restoreAuditNote(auditRecorded: boolean): string {
  if (auditRecorded) return '';
  return (
    'The restore was applied and saved, but the security audit entry for this ' +
    'restore could not be written to durable storage. The restore is real; the ' +
    'audit record is not, and it will be absent after a restart.'
  );
}
