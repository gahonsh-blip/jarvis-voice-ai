// ==============================================================================
// HERMES JARVIS — Oracle billing entitlement truth (backlog item 13)
//
// The Telegram `cloud_telemetry` reply stated, in fixed text,
//   `• *Cost*: ₹0 / Always Free Guaranteed`
// and `/api/blueprint/report` stated
//   `**Total Architecture Cost**: **₹0.00 / Always Free (Strict Zero-Cost Guarantee)**`
// for every process, regardless of whether the instance is actually on the
// Always Free allowance.
//
// Nothing in this server calls the OCI billing/entitlement API, so no process
// here can observe whether this instance is free — the OracleCloudModal itself
// already labels that fact `NOT_PROBED`. A guaranteed figure asserted next to
// live telemetry reads as an observation, which is exactly the class of
// unverified status claim this backlog item exists to remove.
//
// The fix mirrors `ociInstanceTruth.ts`: the guarantee wording is derived from
// state that was actually observed, and an unobserved entitlement is named as
// such instead of being upgraded to a claim.
// ==============================================================================

/** What a real billing/entitlement check could report. */
export type BillingEntitlement = 'FREE' | 'BILLED';

/**
 * The reported cost line. Only an explicit {@link BillingEntitlement} is an
 * observation; `null`/`undefined` means the entitlement API was never queried
 * and the line says so rather than asserting a guarantee.
 */
export function describeBillingCost(entitlement: BillingEntitlement | null | undefined): string {
  if (entitlement === 'FREE') return '₹0 — confirmed by a billing observation';
  if (entitlement === 'BILLED') return 'BILLED — a charge was observed for this instance';
  return 'NOT_PROBED — billing/entitlement API not queried; Always Free is the declared plan only';
}

/**
 * The cost figure a report or phase row may print. A declared *plan* is not a
 * guarantee, so the declared value is returned with that qualifier whenever the
 * entitlement was not observed.
 */
export function describeDeclaredCost(declaredLabel: string, entitlement: BillingEntitlement | null | undefined): string {
  if (entitlement === 'FREE' || entitlement === 'BILLED') return describeBillingCost(entitlement);
  return `${declaredLabel} — declared plan, entitlement NOT_PROBED`;
}

/**
 * Compact chip label for the HUD and the Oracle panel header. Mirrors
 * {@link describeBillingCost} in short form so a decorative badge cannot assert
 * a zero-cost guarantee the process never observed.
 */
export function billingBadgeLabel(entitlement: BillingEntitlement | null | undefined): string {
  if (entitlement === 'FREE') return '₹0 — confirmed by billing';
  if (entitlement === 'BILLED') return 'BILLED — charge observed';
  return 'Always Free — declared plan, not probed';
}

/**
 * Cost cell for the blueprint's declared-cost table. Every row names a
 * *declared plan*: this process queries no billing API for any of them, so a
 * bare `₹0.00` cell (or a `₹0.00 / Forever Free` total) is an unobserved
 * guarantee. The header of the same report was already corrected to
 * `describeBillingCost`, but the table beneath it still printed the fixed
 * figures, so the report contradicted itself.
 */
export function declaredCostCell(declaredLabel: string): string {
  return `${declaredLabel} — declared plan, no billing API queried`;
}

/**
 * Read the entitlement out of an `/api/oracle-cloud` payload. Any value other
 * than an explicit `FREE`/`BILLED` observation is treated as unobserved (null),
 * so a malformed or absent field can never be upgraded to a claim.
 */
export function parseBillingEntitlement(payload: unknown): BillingEntitlement | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { billingEntitlement?: unknown }).billingEntitlement;
  return value === 'FREE' || value === 'BILLED' ? value : null;
}
