// ==============================================================================
// HERMES JARVIS — MOBILE BRIDGE HEARTBEAT TRUTH
//
// `POST /api/mobile/bridge/heartbeat` (`server.ts`) answered
// `success: true, outcome: 'VERIFIED'` for every heartbeat the gateway
// accepted — including one from a device flagged `isSimulation`, and one whose
// session had lapsed so the bridge status read `MOBILE_NOT_CONNECTED`. The
// reply told the caller the bridge was verified live when no real, live device
// was behind it. That is the fake-success shape item 13 removes.
//
// This module decides the honest verdict from the observed heartbeat: a real
// heartbeat against a live, non-simulated session is `VERIFIED`; a simulated
// device is `SIMULATION_ONLY`; a heartbeat that did not leave the bridge live
// is `PARTIAL`; anything else is `FAILED`.
// ==============================================================================

import type { BridgeStatus } from '../androidBridgeGateway';

export type HeartbeatTruthOutcome = 'VERIFIED' | 'SIMULATION_ONLY' | 'PARTIAL' | 'FAILED';

export interface HeartbeatTruthInput {
  /** Result of the gateway's heartbeat call. */
  accepted: boolean;
  /** The device the heartbeat was recorded against, if any. */
  isSimulation: boolean;
  /** Bridge status observed immediately after the heartbeat. */
  bridgeStatus: BridgeStatus;
  /** True only when a heartbeat arrived inside the live window. */
  deviceLive: boolean;
}

export interface HeartbeatTruthVerdict {
  /** True only when a real, live device heartbeat was observed. */
  success: boolean;
  outcome: HeartbeatTruthOutcome;
  /** True only when the heartbeat left the bridge live and verified. */
  verified: boolean;
  message: string;
}

/**
 * Classify a mobile-bridge heartbeat.
 *
 * `isSimulation` outranks a live status: a simulated device must never be
 * reported as a verified live bridge, however the session is tracked.
 */
export function classifyBridgeHeartbeat(input: HeartbeatTruthInput): HeartbeatTruthVerdict {
  if (!input.accepted) {
    return {
      success: false,
      outcome: 'FAILED',
      verified: false,
      message: 'Heartbeat was not accepted by the bridge gateway.',
    };
  }

  if (input.isSimulation) {
    return {
      success: false,
      outcome: 'SIMULATION_ONLY',
      verified: false,
      message:
        'Heartbeat recorded against a simulated device. A simulation is not a verified live bridge.',
    };
  }

  if (!input.deviceLive || input.bridgeStatus === 'MOBILE_NOT_CONNECTED') {
    return {
      success: false,
      outcome: 'PARTIAL',
      verified: false,
      message:
        'Heartbeat recorded, but the bridge is not live — no verified device connection is established.',
    };
  }

  return {
    success: true,
    outcome: 'VERIFIED',
    verified: true,
    message: 'Heartbeat verified against a live device bridge.',
  };
}
