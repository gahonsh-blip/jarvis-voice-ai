// ==============================================================================
// HERMES JARVIS — MOBILE BRIDGE DEVICE-EVENT TRUTH
//
// `POST /api/mobile/bridge/event` (`server.ts`) answered
// `success: true, outcome: 'VERIFIED', accepted: true` for every device event
// the gateway accepted — including one whose device was a simulated testbed and
// one whose session had lapsed so the bridge read `MOBILE_NOT_CONNECTED`. The
// audit row written alongside it (`CALL_RECEIVED` / `NOTIFICATION_RECEIVED` /
// `EVENT_RECEIVED`) was stamped `VERIFIED` in the same way. The reply told the
// caller a live device event was verified when no real, live device was behind
// it. That is the fake-success shape item 13 removes.
//
// A device event is only as real as the device that sent it. This module decides
// the honest verdict from the observed bridge state: a real event against a
// live, non-simulated session is `VERIFIED`; a simulated device is
// `SIMULATION_ONLY`; an event that did not leave the bridge live is `UNVERIFIED`.
// The same verdict supplies the audit outcome so the trail cannot disagree with
// the reply.
// ==============================================================================

import type { BridgeStatus } from '../androidBridgeGateway';
import type { ExecutionOutcome } from '../executionTruth';

export interface BridgeEventTruthInput {
  /** Result of the gateway's sequence check. Only an accepted event reaches here. */
  accepted: boolean;
  /** The device the event was recorded against, if any. */
  isSimulation: boolean;
  /** Bridge status observed immediately after the event. */
  bridgeStatus: BridgeStatus;
  /** True only when the device is live (heartbeat inside the live window). */
  deviceLive: boolean;
  /** The event type the device reported (e.g. INCOMING_CALL). */
  eventType: string;
}

export interface BridgeEventTruthVerdict {
  /** True only when a real, live device event was observed. */
  success: boolean;
  outcome: ExecutionOutcome;
  /** True only when the event left the bridge live and verified. */
  verified: boolean;
  message: string;
}

/**
 * Classify a device event that reached the bridge.
 *
 * `isSimulation` outranks a live status: a simulated device must never be
 * reported as a verified live event, however the session is tracked.
 */
export function classifyBridgeEvent(input: BridgeEventTruthInput): BridgeEventTruthVerdict {
  if (!input.accepted) {
    return {
      success: false,
      outcome: 'FAILED',
      verified: false,
      message: 'Device event was not accepted by the bridge gateway.',
    };
  }

  if (input.isSimulation) {
    return {
      success: false,
      outcome: 'SIMULATION_ONLY',
      verified: false,
      message:
        'Device event recorded against a simulated device. A simulation is not a verified live event.',
    };
  }

  if (!input.deviceLive || input.bridgeStatus === 'MOBILE_NOT_CONNECTED') {
    return {
      success: false,
      outcome: 'UNVERIFIED',
      verified: false,
      message:
        'Device event recorded, but the bridge is not live — no verified device connection is established.',
    };
  }

  return {
    success: true,
    outcome: 'VERIFIED',
    verified: true,
    message: `Device event ${input.eventType} verified against a live device bridge.`,
  };
}
