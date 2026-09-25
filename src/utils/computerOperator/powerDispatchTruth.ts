// ==============================================================================
// HERMES JARVIS — POWER DISPATCH TRUTH
//
// The `/api/chat` `pc_shutdown` / `pc_restart` intents answered "Simulating
// system shutdown protocol. Standby mode initiated." and "Restarting Jarvis
// subsystem protocols in 5 seconds." with `actionExecuted = true` and titles
// `Shutdown Simulation` / `Restart Protocol` — no shutdown command was built,
// no approval was collected, and the process did not stop. The spoken text says
// "simulating" while `actionExecuted = true` records performed work, so the
// transcript and the Security Matrix report a power action that never happened.
//
// Shutting down or restarting the host that runs JARVIS is irreversible and
// destructive, so this intent may only ever *request* the action through the
// permission gateway; it never executes it here.
// ==============================================================================

import type { HostActionCapabilityMap } from './launchDispatchTruth';

export type PowerOutcome =
  | 'NOT_IMPLEMENTED'
  | 'NOT_AVAILABLE'
  | 'BLOCKED';

export interface PowerVerdict {
  /** Always false: this intent never executes a power action. */
  actionExecuted: boolean;
  outcome: PowerOutcome;
  /** True when a real backend exists but the destructive action needs a human. */
  permissionRequired: boolean;
  title: string;
  detailEn: string;
  detailHi: string;
}

function displayAvailable(caps: HostActionCapabilityMap): boolean {
  const cap = caps.LAUNCH_APP || caps.INSPECT_SCREEN;
  return Boolean(cap?.available);
}

/**
 * Builds the honest verdict for a power intent.
 *
 * @param kind    'shutdown' or 'restart'
 * @param caps    the host capability map from `hostActionCapabilities()`
 * @param blocked whether the permission gateway refuses the action outright
 *                (emergency stop engaged, or a permanent block rule)
 */
export function powerVerdict(
  kind: 'shutdown' | 'restart',
  caps: HostActionCapabilityMap,
  blocked = false,
): PowerVerdict {
  const label = kind === 'shutdown' ? 'Shutdown' : 'Restart';

  if (blocked) {
    return {
      actionExecuted: false,
      outcome: 'BLOCKED',
      permissionRequired: false,
      title: `${label} Blocked`,
      detailEn: `The ${kind} request was refused by the security policy and was not executed.`,
      detailHi: `${kind === 'shutdown' ? 'शटडाउन' : 'रीस्टार्ट'} अनुरोध सुरक्षा नीति द्वारा अस्वीकार किया गया; कोई कार्रवाई नहीं हुई।`,
    };
  }

  if (!displayAvailable(caps)) {
    return {
      actionExecuted: false,
      outcome: 'NOT_AVAILABLE',
      permissionRequired: false,
      title: `${label} Not Available`,
      detailEn: `No desktop session is available on this host, so the ${kind} request was not sent anywhere.`,
      detailHi: `इस होस्ट पर कोई डेस्कटॉप सत्र उपलब्ध नहीं है, इसलिए ${kind === 'shutdown' ? 'शटडाउन' : 'रीस्टार्ट'} अनुरोध कहीं नहीं भेजा गया।`,
    };
  }

  // No host power backend is wired up yet. Even once one is, this destructive
  // action must pass the permission gateway and a named human approval first.
  return {
    actionExecuted: false,
    outcome: 'NOT_IMPLEMENTED',
    permissionRequired: true,
    title: `${label} Not Implemented (approval required)`,
    detailEn: `No host power backend is implemented, so nothing was executed. ${label} is destructive and would require explicit human approval before it could ever run.`,
    detailHi: `होस्ट पावर बैकएंड लागू नहीं है, इसलिए कुछ भी निष्पादित नहीं हुआ। ${kind === 'shutdown' ? 'शटडाउन' : 'रीस्टार्ट'} एक अपरिवर्तनीय कार्रवाई है और इसके लिए मानव की स्पष्ट स्वीकृति आवश्यक होगी।`,
  };
}

/** Honest spoken reply for a power verdict, in the operator's language. */
export function powerReply(verdict: PowerVerdict, language: string): string {
  return language.startsWith('hi') ? verdict.detailHi : verdict.detailEn;
}
