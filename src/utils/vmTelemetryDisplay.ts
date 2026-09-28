// =============================================================================
// HERMES JARVIS — Oracle Cloud modal display normalisation
//
// The modal renders the payload from GET /api/oracle-cloud. Three of the values
// it used to render were invented whenever the payload lacked a field:
//
//   * `{vmStatus?.uptimeHours || 342}` printed a fixed 342 hours. Because `0` is
//     falsy this also turned a *measured* zero (a daemon started this hour) into
//     342.
//   * `{vmStatus?.publicIp || '129.154.42.108'}` printed, and copied to the
//     clipboard for `ssh`, an address the server never reported.
//   * the status card printed a constant `ONLINE` regardless of the reported
//     state.
//
// Every helper below returns `null` for a missing, malformed or nonsensical
// value. The caller renders that as an explicit unknown — no helper ever
// substitutes a plausible constant. `0` is a valid measurement and is preserved.
// =============================================================================

/** Uptime in whole hours, or null when no usable figure was reported. */
export function normalizeUptimeHours(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** The reported public IP, or null when absent/blank. Never a default address. */
export function normalizePublicIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The only run states the provider reports. Anything else is unknown, not ONLINE. */
export type VmRunState = 'RUNNING' | 'PROVISIONING' | 'STOPPED';

export function normalizeVmStatus(value: unknown): VmRunState | null {
  return value === 'RUNNING' || value === 'PROVISIONING' || value === 'STOPPED' ? value : null;
}

/** A 0-100 utilisation reading, clamped, or null when unmeasurable. */
export function normalizeMetricPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), 100);
}

/** A non-negative gigabyte reading, or null when unmeasurable. */
export function normalizeGigabytes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * The SSH command for a *reported* address, or null when there is none. Returning
 * null (rather than a default command) keeps a fabricated target out of the
 * clipboard.
 */
export function buildSshCommand(publicIp: unknown): string | null {
  const ip = normalizePublicIp(publicIp);
  return ip ? `ssh -i ~/.ssh/oracle_arm_key ubuntu@${ip}` : null;
}

/**
 * Observed state of one declared ingress rule. `NOT_PROBED` is the default and
 * the only honest answer for a rule this server never tested: nothing here
 * contacts the Oracle VCN or opens a socket, so the server cannot know whether a
 * port is reachable from the internet.
 */
export type FirewallRuleState = 'OBSERVED_OPEN' | 'OBSERVED_CLOSED' | 'NOT_PROBED';

/**
 * Map a rule's `active` flag onto a state that distinguishes observation from
 * assumption. Only a literal boolean counts as an observation; a missing or
 * non-boolean value stays `NOT_PROBED` so the caller cannot render a checkmark
 * for a rule that was never tested.
 */
export function resolveFirewallRuleState(active: unknown): FirewallRuleState {
  if (active === true) return 'OBSERVED_OPEN';
  if (active === false) return 'OBSERVED_CLOSED';
  return 'NOT_PROBED';
}

/**
 * One-line summary of a rule set for the panel heading. It only claims ingress
 * is verified when *every* rule carries a real observation, which no rule does
 * today — the heading therefore states the unprobed truth instead of
 * "Zero Accidental Ingress".
 */
export function summarizeFirewallObservation(
  rules: Array<{ active?: unknown }> | null | undefined,
): { verified: boolean; probedCount: number; total: number } {
  const list = Array.isArray(rules) ? rules : [];
  const probedCount = list.filter((rule) => resolveFirewallRuleState(rule?.active) !== 'NOT_PROBED').length;
  return { verified: list.length > 0 && probedCount === list.length, probedCount, total: list.length };
}