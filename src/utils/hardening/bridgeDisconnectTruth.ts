// ==============================================================================
// HERMES JARVIS — MOBILE BRIDGE DISCONNECT TRUTH
//
// `POST /api/mobile/bridge/disconnect` (`server.ts`) answered the hardcoded
// literal `{ success: true, outcome: 'VERIFIED', status: 'MOBILE_NOT_CONNECTED' }`
// on every request that passed the session guard. The `status` literal happened
// to be right in the common case, but the verdict was not measured: a request
// that owned the device link yet tore down nothing (a repeated disconnect) still
// reported a `VERIFIED` disconnect, and the caller could not tell a real teardown
// from a no-op.
//
// This module derives the verdict from the observed teardown — the gateway's
// disconnect counter before and after `revoke()`, plus the bridge status read
// immediately afterwards — so `verified` is true only when a real device link
// was actually dropped.
// ==============================================================================

import type { BridgeStatus } from '../androidBridgeGateway';

export type BridgeDisconnectOutcome = 'VERIFIED' | 'PARTIAL' | 'FAILED';

export interface BridgeDisconnectInput {
  /** True only when the authenticated session owned a live device link. */
  deviceWasLinked: boolean;
  /** `bridgeGateway.getDisconnectCount()` before the revoke. */
  disconnectsBefore: number;
  /** `bridgeGateway.getDisconnectCount()` after the revoke. */
  disconnectsAfter: number;
  /** Bridge status observed immediately after the revoke. */
  bridgeStatus: BridgeStatus;
  /** Human-readable reason the device gave, echoed in the message. */
  reason: string;
}

export interface BridgeDisconnectVerdict {
  /** True only when a real device link was dropped. */
  success: boolean;
  outcome: BridgeDisconnectOutcome;
  /** True only when a real device link was dropped. */
  verified: boolean;
  status: BridgeStatus;
  message: string;
}

/**
 * Classify a mobile-bridge disconnect.
 *
 * A real teardown is the only thing that may report `VERIFIED`: the session
 * owned the link, the gateway's disconnect counter advanced, and the bridge is
 * no longer connected. A session that owned the link but dropped nothing is
 * `PARTIAL` (a no-op), and a session that owned no link is `FAILED`.
 */
export function classifyBridgeDisconnect(input: BridgeDisconnectInput): BridgeDisconnectVerdict {
  if (!input.deviceWasLinked) {
    return {
      success: false,
      outcome: 'FAILED',
      verified: false,
      status: input.bridgeStatus,
      message: 'No device link was owned by this session, so nothing was disconnected.',
    };
  }

  const dropped = input.disconnectsAfter > input.disconnectsBefore;
  const disconnected = input.bridgeStatus === 'MOBILE_NOT_CONNECTED';

  if (!dropped || !disconnected) {
    return {
      success: false,
      outcome: 'PARTIAL',
      verified: false,
      status: input.bridgeStatus,
      message: `Device link was owned by this session but no live disconnect was observed (status ${input.bridgeStatus}).`,
    };
  }

  return {
    success: true,
    outcome: 'VERIFIED',
    verified: true,
    status: input.bridgeStatus,
    message: `Device link disconnected (${input.reason}).`,
  };
}
