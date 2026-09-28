// =============================================================================
// HERMES JARVIS — Oracle VM instance-observation truth
//
// A VM *plan* declares shape, OCPU count, RAM, boot volume and OS. An *instance*
// reports its run state and public address, and those two facts come from the
// OCI control plane. Nothing in this process ever calls that control plane, so
// the server must not seed them with plausible values.
//
// The previous seed asserted `status: 'RUNNING'` and a literal public IP
// (`129.154.42.108`) as if they had been observed. The UI normalisers added on
// 2026-09-21 02:25 IST can only reject a *missing* value — a supplied constant
// passes straight through — so the seeded values rendered as a measured run
// state and, worse, were copied into the clipboard as an `ssh` target. The same
// fabricated IP and status were quoted in the Telegram reply.
//
// The one instance fact this process can honestly derive is a *lower bound*: if
// the daemon host is the Oracle ARM instance (hostname match), then the instance
// is running, because the process serving this request is running on it. Nothing
// else about the instance is observed here.
// =============================================================================

export type VmRunState = 'RUNNING' | 'PROVISIONING' | 'STOPPED';

export interface OciInstanceObservation {
  status: VmRunState | null;
  publicIp: string | null;
  /** When the observation was made, or null when nothing was observed. */
  observedAt: string | null;
}

/** Nothing about the instance has been observed in this process. */
export const NO_INSTANCE_OBSERVATION: OciInstanceObservation = {
  status: null,
  publicIp: null,
  observedAt: null,
};

/**
 * Derive the one instance fact that is provable from inside the process.
 *
 * `isOracleLike` must come from a real hostname check, not a configured
 * expectation. A public address is never derivable this way — the host's own
 * interface addresses are not the instance's cloud-assigned IP as reported by
 * OCI — so `publicIp` stays null until an operator supplies an observation.
 */
export function observeInstanceFromHost(
  isOracleLike: boolean,
  sampledAt: string | null,
): OciInstanceObservation {
  if (!isOracleLike) return { ...NO_INSTANCE_OBSERVATION };
  return { status: 'RUNNING', publicIp: null, observedAt: sampledAt };
}

/**
 * Human-readable run state for a log line or a spoken reply. An unobserved
 * state is named as such rather than assumed `RUNNING`.
 */
export function describeRunState(status: VmRunState | null): string {
  return status ?? 'NOT_OBSERVED';
}

/** The reported public address, or an explicit non-observation. */
export function describePublicIp(publicIp: string | null): string {
  const trimmed = typeof publicIp === 'string' ? publicIp.trim() : '';
  return trimmed.length > 0 ? trimmed : 'not observed';
}