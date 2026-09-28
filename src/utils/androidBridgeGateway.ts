// ==============================================================================
// HERMES JARVIS — ANDROID BRIDGE GATEWAY (server-side state machine)
//
// Owns the truth about the phone link:
//   * which device is registered, and whether it is actually reachable
//   * what the device said it can and cannot do
//   * the last real telemetry it reported (battery, location, notifications)
//   * every action we dispatched and whether the device confirmed it
//
// The gateway never invents state. If no telemetry has been received, telemetry
// reads NOT_CONFIGURED rather than a plausible-looking default. If an action was
// dispatched but not acknowledged, it reads DISPATCHED rather than success.
// ==============================================================================

import type {
  AndroidDeviceCapabilities,
  AndroidPermissionState,
  MobilePermissionMatrix,
} from '../types/mobileBridge';
import {
  buildReceipt,
  makeEvidence,
  type ExecutionOutcome,
  type ExecutionReceipt,
} from './executionTruth';
import {
  BRIDGE_LIVE_TTL_MS,
  MobileBridgeSessionAuthority,
  redactToken,
  type BridgeSession,
  type SessionCheckReason,
} from './mobileBridgeSession';
import crypto from 'node:crypto';

// ------------------------------------------------------------------------------
// Capability negotiation
// ------------------------------------------------------------------------------

export type NegotiatedCapability =
  | 'NOTIFICATION_LISTENER'
  | 'CALL_DETECTION'
  | 'CALL_ANSWER'
  | 'INLINE_REPLY'
  | 'OPEN_APP'
  | 'TELEMETRY_BATTERY'
  | 'TELEMETRY_LOCATION'
  | 'TELEMETRY_NOTIFICATIONS'
  | 'CONTACTS_LOOKUP';

export interface CapabilityVerdict {
  capability: NegotiatedCapability;
  available: boolean;
  /** Why it is unavailable — never guessed, always derived from the handshake. */
  reason?: string;
  /** Android role/permission the operator must grant to enable it. */
  requiredGrant?: string;
}

export interface NegotiationResult {
  verdicts: CapabilityVerdict[];
  available: NegotiatedCapability[];
  unavailable: NegotiatedCapability[];
  /** A device is CONNECTED only when it can actually do something useful. */
  status: BridgeStatus;
}

export type BridgeStatus =
  | 'MOBILE_NOT_CONNECTED'
  | 'PERMISSION_REQUIRED'
  | 'PARTIALLY_CONNECTED'
  | 'CONNECTED'
  | 'LIMITED_CAPABILITY'
  | 'ERROR';

const CAPABILITY_PROBE_ORDER: NegotiatedCapability[] = [
  'TELEMETRY_BATTERY',
  'TELEMETRY_LOCATION',
  'TELEMETRY_NOTIFICATIONS',
  'NOTIFICATION_LISTENER',
  'CALL_DETECTION',
  'CALL_ANSWER',
  'INLINE_REPLY',
  'OPEN_APP',
  'CONTACTS_LOOKUP',
];

export function negotiateCapabilities(
  caps: AndroidDeviceCapabilities,
  permissions: MobilePermissionMatrix
): NegotiationResult {
  const granted = (state: AndroidPermissionState) => state === 'GRANTED';

  const table: Record<NegotiatedCapability, { available: boolean; reason?: string; requiredGrant?: string }> = {
    TELEMETRY_BATTERY: {
      // Battery stats come back on the heartbeat once the device is paired.
      available: !caps.isSimulation,
      reason: caps.isSimulation ? 'Simulated device reports no real battery telemetry' : undefined,
      requiredGrant: caps.isSimulation ? 'Pair a real Android device' : undefined,
    },
    TELEMETRY_LOCATION: {
      available: !caps.isSimulation && granted(permissions.location_access),
      reason: caps.isSimulation
        ? 'Simulated device has no GPS hardware'
        : granted(permissions.location_access)
        ? undefined
        : 'Location permission has not been granted on the device',
      requiredGrant: granted(permissions.location_access) ? undefined : 'ACCESS_FINE_LOCATION',
    },
    TELEMETRY_NOTIFICATIONS: {
      available: !caps.isSimulation && caps.canReadNotifications && granted(permissions.notification_access),
      reason: !granted(permissions.notification_access)
        ? 'Notification listener access has not been granted'
        : !caps.canReadNotifications
        ? 'Device reports no notification listener capability'
        : undefined,
      requiredGrant: granted(permissions.notification_access) ? undefined : 'BIND_NOTIFICATION_LISTENER_SERVICE',
    },
    NOTIFICATION_LISTENER: {
      available: caps.canReadNotifications && granted(permissions.notification_access),
      reason: granted(permissions.notification_access) ? undefined : 'Notification access not granted',
      requiredGrant: granted(permissions.notification_access) ? undefined : 'BIND_NOTIFICATION_LISTENER_SERVICE',
    },
    CALL_DETECTION: {
      available: caps.canDetectCalls && granted(permissions.call_detection),
      reason: granted(permissions.call_detection) ? undefined : 'READ_PHONE_STATE has not been granted',
      requiredGrant: granted(permissions.call_detection) ? undefined : 'READ_PHONE_STATE',
    },
    CALL_ANSWER: {
      available: caps.canAnswerCalls && caps.telecomRoleDialer && granted(permissions.call_answer),
      reason: !caps.telecomRoleDialer
        ? 'Device does not hold the default-dialer role'
        : !granted(permissions.call_answer)
        ? 'ANSWER_PHONE_CALLS has not been granted'
        : undefined,
      requiredGrant: !caps.telecomRoleDialer ? 'ROLE_DIALER' : granted(permissions.call_answer) ? undefined : 'ANSWER_PHONE_CALLS',
    },
    INLINE_REPLY: {
      available: caps.canInlineReply && granted(permissions.message_reply),
      reason: granted(permissions.message_reply) ? undefined : 'Message reply permission not granted',
      requiredGrant: granted(permissions.message_reply) ? undefined : 'NOTIFICATION_REPLY_POLICY',
    },
    OPEN_APP: {
      available: caps.canOpenApp,
      reason: caps.canOpenApp ? undefined : 'Device reports it cannot launch applications',
    },
    CONTACTS_LOOKUP: {
      available: caps.canLookupContacts && granted(permissions.contacts_lookup),
      reason: granted(permissions.contacts_lookup) ? undefined : 'READ_CONTACTS has not been granted',
      requiredGrant: granted(permissions.contacts_lookup) ? undefined : 'READ_CONTACTS',
    },
  };

  const verdicts = CAPABILITY_PROBE_ORDER.map((capability) => ({ capability, ...table[capability] }));
  const available = verdicts.filter((v) => v.available).map((v) => v.capability);
  const unavailable = verdicts.filter((v) => !v.available).map((v) => v.capability);

  const hasInbound = table.CALL_DETECTION.available || table.NOTIFICATION_LISTENER.available;
  const bothInboundBlockedByPermission =
    !table.CALL_DETECTION.available &&
    !table.NOTIFICATION_LISTENER.available &&
    Boolean(table.CALL_DETECTION.requiredGrant || table.NOTIFICATION_LISTENER.requiredGrant);

  let status: BridgeStatus;
  if (available.length === 0) {
    status = 'PERMISSION_REQUIRED';
  } else if (bothInboundBlockedByPermission) {
    // The device is reachable but the operator has not granted the listener/telephony
    // access that makes it useful. That is a permission problem, not a hardware limit.
    status = 'PERMISSION_REQUIRED';
  } else if (!hasInbound) {
    status = 'LIMITED_CAPABILITY';
  } else if (unavailable.length === 0) {
    status = 'CONNECTED';
  } else {
    status = 'PARTIALLY_CONNECTED';
  }

  return { verdicts, available, unavailable, status };
}

// ------------------------------------------------------------------------------
// Telemetry
// ------------------------------------------------------------------------------

export interface BatteryTelemetry {
  levelPercent: number;
  isCharging: boolean;
  temperatureC?: number;
  health?: string;
  observedAt: string;
}

export interface LocationTelemetry {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  provider: 'gps' | 'network' | 'fused';
  observedAt: string;
}

export interface NotificationTelemetry {
  unreadCount: number;
  /** Counts per package, taken from the device's listener. Never inferred. */
  perPackage?: Record<string, number>;
  observedAt: string;
}

export interface DeviceTelemetryState {
  battery: BatteryTelemetry | null;
  location: LocationTelemetry | null;
  notifications: NotificationTelemetry | null;
}

/**
 * Inbound heartbeat payload. `observedAt` is optional here because the gateway
 * stamps arrival time when the device omits it — the stored state always has one.
 */
export interface DeviceTelemetryInput {
  battery?: Omit<BatteryTelemetry, 'observedAt'> & { observedAt?: string };
  location?: Omit<LocationTelemetry, 'observedAt'> & { observedAt?: string };
  notifications?: Omit<NotificationTelemetry, 'observedAt'> & { observedAt?: string };
}

export type TelemetryKind = 'battery' | 'location' | 'notifications';

export interface TelemetryReadResult {
  outcome: ExecutionOutcome;
  data: BatteryTelemetry | LocationTelemetry | NotificationTelemetry | null;
  receipt: ExecutionReceipt;
  ageSeconds?: number;
}

// ------------------------------------------------------------------------------
// Action dispatch ledger
// ------------------------------------------------------------------------------

export type BridgeActionType = 'ANSWER_CALL' | 'SEND_REPLY' | 'OPEN_APP' | 'DISMISS_NOTIFICATION';

export interface DispatchedAction {
  dispatchId: string;
  actionType: BridgeActionType;
  sessionId: string;
  target: string;
  payloadSummary: string;
  dispatchedAt: string;
  status: 'DISPATCHED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  confirmedAt?: string;
  failureDetail?: string;
  deviceStatusEcho?: string;
}

export interface BridgeAuditEntry {
  id: string;
  timestamp: string;
  event: string;
  detail: string;
  outcome: ExecutionOutcome;
  sessionId?: string;
  deviceId?: string;
}

interface RegisteredDevice {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  model: string;
  osVersion: string;
  bridgeVersion: string;
  sdkInt?: number;
  capabilities: AndroidDeviceCapabilities;
  permissions: MobilePermissionMatrix;
  negotiation: NegotiationResult;
  registeredAt: string;
  lastHeartbeatAt: string;
  heartbeatCount: number;
  telemetry: DeviceTelemetryState;
  firstSeenAt: number;
}

export interface RegisterRequest {
  sessionId: string;
  deviceId: string;
  deviceName?: string;
  model?: string;
  osVersion?: string;
  bridgeVersion?: string;
  sdkInt?: number;
  capabilities: Partial<AndroidDeviceCapabilities>;
  permissions?: Partial<MobilePermissionMatrix>;
}

const DEFAULT_PERMISSIONS: MobilePermissionMatrix = {
  notification_access: 'NOT_CONFIGURED',
  call_detection: 'NOT_CONFIGURED',
  call_answer: 'LIMITED',
  message_reading: 'NOT_CONFIGURED',
  message_reply: 'LIMITED',
  contacts_lookup: 'NOT_CONFIGURED',
  notification_history: 'NOT_CONFIGURED',
  location_access: 'NOT_CONFIGURED',
};

const PERMISSION_STATES: AndroidPermissionState[] = ['NOT_CONFIGURED', 'DENIED', 'ASK', 'GRANTED', 'LIMITED'];

function coercePermission(value: unknown): AndroidPermissionState {
  return PERMISSION_STATES.includes(value as AndroidPermissionState)
    ? (value as AndroidPermissionState)
    : 'NOT_CONFIGURED';
}

export interface GatewayOptions {
  signingSecret: string;
  now?: () => number;
  maxAuditEntries?: number;
  maxDispatchLedger?: number;
}

export class AndroidBridgeGateway {
  private authority: MobileBridgeSessionAuthority;
  private device: RegisteredDevice | null = null;
  private dispatchLedger: DispatchedAction[] = [];
  private audit: BridgeAuditEntry[] = [];
  private now: () => number;
  private maxAudit: number;
  private maxLedger: number;
  /** Sessions we have seen connect/disconnect, for reconnect accounting. */
  private disconnectCount = 0;

  constructor(opts: GatewayOptions) {
    this.authority = new MobileBridgeSessionAuthority(opts.signingSecret, opts.now);
    this.now = opts.now ?? (() => Date.now());
    this.maxAudit = opts.maxAuditEntries ?? 300;
    this.maxLedger = opts.maxDispatchLedger ?? 100;
  }

  // ---- session lifecycle -----------------------------------------------------

  get sessions(): MobileBridgeSessionAuthority {
    return this.authority;
  }

  issueSession(deviceId: string, clientLabel?: string) {
    const result = this.authority.issueSession(deviceId, clientLabel);
    this.recordAudit('SESSION_ISSUED', `Session ${result.session.sessionId} issued for ${deviceId}`, 'VERIFIED', {
      sessionId: result.session.sessionId,
      deviceId,
    });
    return result;
  }

  /** Verifies a presented token without mutating device state. */
  verifyToken(token: string | undefined | null, touch: boolean = true): { valid: boolean; reason: SessionCheckReason; session?: BridgeSession } {
    return this.authority.checkSession(token, touch);
  }

  revoke(sessionId: string, reason: string): void {
    this.authority.revokeSession(sessionId, reason);
    if (this.device?.sessionId === sessionId) {
      this.disconnectCount += 1;
      const deviceId = this.device.deviceId;
      this.device = null;
      this.recordAudit('DEVICE_DISCONNECTED', `Device ${deviceId} disconnected (${reason})`, 'VERIFIED', {
        sessionId,
        deviceId,
      });
    }
  }

  // ---- registration ---------------------------------------------------------

  register(req: RegisterRequest): { device: RegisteredDevice; negotiation: NegotiationResult } {
    const caps: AndroidDeviceCapabilities = {
      deviceId: req.deviceId,
      deviceName: req.deviceName || 'Android Device',
      model: req.model || 'Unknown Android Model',
      osVersion: req.osVersion || 'Unknown',
      bridgeVersion: req.bridgeVersion || 'HERMES-ANDROID-BRIDGE/unknown',
      canDetectCalls: Boolean(req.capabilities.canDetectCalls),
      canAnswerCalls: Boolean(req.capabilities.canAnswerCalls),
      telecomRoleDialer: Boolean(req.capabilities.telecomRoleDialer),
      answerCallsPermission: Boolean(req.capabilities.answerCallsPermission),
      canReadNotifications: Boolean(req.capabilities.canReadNotifications),
      canInlineReply: Boolean(req.capabilities.canInlineReply),
      canOpenApp: Boolean(req.capabilities.canOpenApp),
      canLookupContacts: Boolean(req.capabilities.canLookupContacts),
      isSimulation: Boolean(req.capabilities.isSimulation),
    };

    const permissions: MobilePermissionMatrix = { ...DEFAULT_PERMISSIONS };
    for (const key of Object.keys(DEFAULT_PERMISSIONS) as (keyof MobilePermissionMatrix)[]) {
      if (req.permissions && key in req.permissions) {
        permissions[key] = coercePermission((req.permissions as Record<string, unknown>)[key]);
      }
    }

    const negotiation = negotiateCapabilities(caps, permissions);
    const nowIso = new Date(this.now()).toISOString();

    this.device = {
      sessionId: req.sessionId,
      deviceId: req.deviceId,
      deviceName: caps.deviceName,
      model: caps.model,
      osVersion: caps.osVersion,
      bridgeVersion: caps.bridgeVersion,
      sdkInt: req.sdkInt,
      capabilities: caps,
      permissions,
      negotiation,
      registeredAt: nowIso,
      lastHeartbeatAt: nowIso,
      heartbeatCount: 0,
      telemetry: { battery: null, location: null, notifications: null },
      firstSeenAt: this.now(),
    };

    this.recordAudit(
      'DEVICE_REGISTERED',
      `${caps.model} registered with ${negotiation.available.length}/${negotiation.verdicts.length} capabilities available`,
      'VERIFIED',
      { sessionId: req.sessionId, deviceId: req.deviceId }
    );

    return { device: this.device, negotiation };
  }

  // ---- heartbeat + telemetry -------------------------------------------------

  heartbeat(sessionId: string, telemetry?: DeviceTelemetryInput): {
    accepted: boolean;
    reason?: string;
    lastHeartbeatAt?: string;
    sessionId: string;
  } {
    if (!this.device || this.device.sessionId !== sessionId) {
      return { accepted: false, reason: 'NO_REGISTERED_DEVICE_FOR_SESSION', sessionId };
    }
    if (telemetry) this.applyTelemetry(this.device, telemetry);
    this.device.lastHeartbeatAt = new Date(this.now()).toISOString();
    this.device.heartbeatCount += 1;
    return { accepted: true, lastHeartbeatAt: this.device.lastHeartbeatAt, sessionId };
  }

  private applyTelemetry(device: RegisteredDevice, telemetry: DeviceTelemetryInput): void {
    const nowIso = new Date(this.now()).toISOString();
    if (telemetry.battery && typeof telemetry.battery.levelPercent === 'number') {
      device.telemetry.battery = {
        levelPercent: Math.max(0, Math.min(100, Math.round(telemetry.battery.levelPercent))),
        isCharging: Boolean(telemetry.battery.isCharging),
        temperatureC: telemetry.battery.temperatureC,
        health: telemetry.battery.health,
        observedAt: telemetry.battery.observedAt || nowIso,
      };
    }
    if (
      telemetry.location &&
      typeof telemetry.location.latitude === 'number' &&
      typeof telemetry.location.longitude === 'number'
    ) {
      device.telemetry.location = {
        latitude: telemetry.location.latitude,
        longitude: telemetry.location.longitude,
        accuracyMeters: telemetry.location.accuracyMeters,
        provider: telemetry.location.provider || 'fused',
        observedAt: telemetry.location.observedAt || nowIso,
      };
    }
    if (telemetry.notifications && typeof telemetry.notifications.unreadCount === 'number') {
      device.telemetry.notifications = {
        unreadCount: telemetry.notifications.unreadCount,
        perPackage: telemetry.notifications.perPackage,
        observedAt: telemetry.notifications.observedAt || nowIso,
      };
    }
  }

  /** True when a heartbeat arrived inside the live window. */
  isDeviceLive(): boolean {
    if (!this.device) return false;
    if (this.device.capabilities.isSimulation) return false;
    const session = this.authority.getSession(this.device.sessionId);
    if (!session || !this.authority.isLive(session)) return false;
    return this.now() - Date.parse(this.device.lastHeartbeatAt) <= BRIDGE_LIVE_TTL_MS;
  }

  getStatus(): BridgeStatus {
    if (!this.device) return 'MOBILE_NOT_CONNECTED';
    if (!this.isDeviceLive()) return 'MOBILE_NOT_CONNECTED';
    return this.device.negotiation.status;
  }

  getDevice(): RegisteredDevice | null {
    return this.device;
  }

  getDisconnectCount(): number {
    return this.disconnectCount;
  }

  reconnectCount(): number {
    if (!this.device) return 0;
    return this.authority.getSession(this.device.sessionId)?.reconnectCount ?? 0;
  }

  // ---- telemetry reads -------------------------------------------------------

  readTelemetry(kind: TelemetryKind): TelemetryReadResult {
    const actionMap: Record<TelemetryKind, string> = {
      battery: 'READ_BATTERY_TELEMETRY',
      location: 'READ_LOCATION_TELEMETRY',
      notifications: 'READ_NOTIFICATION_TELEMETRY',
    };
    const target = this.device ? `${this.device.model} (${this.device.deviceId})` : 'no device';

    if (!this.device) {
      return this.telemetryFailure(actionMap[kind], target, 'NOT_CONFIGURED', 'No Android device is registered with the bridge.', 'कोई Android डिवाइस ब्रिज से जुड़ा नहीं है।');
    }
    if (!this.isDeviceLive()) {
      return this.telemetryFailure(
        actionMap[kind],
        target,
        'FAILED',
        `Device ${this.device.model} is not reachable (no heartbeat within ${Math.round(BRIDGE_LIVE_TTL_MS / 1000)}s). Reporting stale-free: no data.`,
        `डिवाइस ${this.device.model} से संपर्क नहीं है, इसलिए कोई डेटा उपलब्ध नहीं है।`
      );
    }

    const verdict = this.device.negotiation.verdicts.find((v) =>
      kind === 'battery' ? v.capability === 'TELEMETRY_BATTERY' : kind === 'location' ? v.capability === 'TELEMETRY_LOCATION' : v.capability === 'TELEMETRY_NOTIFICATIONS'
    );
    if (verdict && !verdict.available) {
      const outcome: ExecutionOutcome = verdict.requiredGrant ? 'PERMISSION_REQUIRED' : 'NOT_AVAILABLE';
      // Name the exact Android grant so the operator knows what to enable.
      const detailEn = verdict.requiredGrant
        ? `${verdict.reason || `${kind} telemetry unavailable`}. Grant ${verdict.requiredGrant} on the device to enable it.`
        : verdict.reason || `${kind} telemetry unavailable`;
      return this.telemetryFailure(
        actionMap[kind],
        target,
        outcome,
        detailEn,
        `इस डिवाइस पर ${kind} टेलीमेट्री उपलब्ध नहीं है।`
      );
    }

    const data = this.device.telemetry[kind];
    if (!data) {
      return this.telemetryFailure(
        actionMap[kind],
        target,
        'NOT_CONFIGURED',
        `Device is connected but has not reported ${kind} telemetry yet.`,
        `डिवाइस जुड़ा है, लेकिन अभी ${kind} डेटा नहीं भेजा गया।`
      );
    }

    const ageSeconds = Math.round((this.now() - Date.parse(data.observedAt)) / 1000);
    const receipt = buildReceipt({
      action: actionMap[kind],
      target,
      outcome: 'VERIFIED',
      detailEn: `Live ${kind} telemetry from ${this.device.model}, observed ${ageSeconds}s ago by the device itself.`,
      detailHi: `${this.device.model} से वास्तविक ${kind} डेटा प्राप्त हुआ।`,
      evidence: makeEvidence('device_ack', `Device-reported ${kind} telemetry`, {
        ref: `${this.device.deviceId}#${kind}@${data.observedAt}`,
      }),
    });

    return { outcome: 'VERIFIED', data, receipt, ageSeconds };
  }

  private telemetryFailure(
    action: string,
    target: string,
    outcome: ExecutionOutcome,
    detailEn: string,
    detailHi: string
  ): TelemetryReadResult {
    return {
      outcome,
      data: null,
      receipt: buildReceipt({ action, target, outcome, detailEn, detailHi, failureReason: detailEn }),
    };
  }

  // ---- action dispatch ledger ------------------------------------------------

  /**
   * Records an action handed to the device. The device must echo the dispatchId
   * back through confirmAction before this can ever become VERIFIED.
   */
  dispatchAction(params: {
    actionType: BridgeActionType;
    sessionId: string;
    target: string;
    payloadSummary: string;
  }): { dispatch: DispatchedAction; receipt: ExecutionReceipt } {
    const dispatch: DispatchedAction = {
      dispatchId: `disp_${crypto.randomBytes(6).toString('hex')}`,
      actionType: params.actionType,
      sessionId: params.sessionId,
      target: params.target,
      payloadSummary: params.payloadSummary,
      dispatchedAt: new Date(this.now()).toISOString(),
      status: 'DISPATCHED',
    };

    this.dispatchLedger.unshift(dispatch);
    if (this.dispatchLedger.length > this.maxLedger) this.dispatchLedger.pop();

    this.recordAudit(
      `ACTION_DISPATCHED:${params.actionType}`,
      `Dispatched to ${params.target} for device confirmation (${dispatch.dispatchId})`,
      'DISPATCHED',
      { sessionId: params.sessionId, deviceId: this.device?.deviceId }
    );

    const receipt = buildReceipt({
      action: params.actionType,
      target: params.target,
      outcome: 'DISPATCHED',
      detailEn: `Command handed to the Android device. Awaiting device confirmation (${dispatch.dispatchId}).`,
      detailHi: 'कमांड डिवाइस को भेज दिया गया है, डिवाइस की पुष्टि की प्रतीक्षा है।',
      dispatchedAt: dispatch.dispatchedAt,
      dispatchId: dispatch.dispatchId,
    });

    return { dispatch, receipt };
  }

  /**
   * Device-reported outcome for a dispatch. Only a device-confirmed status
   * upgrades the receipt to VERIFIED; anything else stays non-success.
   */
  confirmAction(params: {
    dispatchId: string;
    sessionId: string;
    confirmedStatus: string;
    detail?: string;
  }): ExecutionReceipt {
    const dispatch = this.dispatchLedger.find((d) => d.dispatchId === params.dispatchId);
    if (!dispatch) {
      return buildReceipt({
        action: 'CONFIRM_ACTION',
        target: params.dispatchId,
        outcome: 'FAILED',
        detailEn: `Unknown dispatch id ${params.dispatchId}; the device confirmed something we never sent.`,
        detailHi: 'अज्ञात डिस्पैच आईडी।',
        failureReason: 'UNKNOWN_DISPATCH_ID',
      });
    }
    if (dispatch.sessionId !== params.sessionId) {
      return buildReceipt({
        action: dispatch.actionType,
        target: dispatch.target,
        outcome: 'BLOCKED',
        detailEn: `Confirmation for ${params.dispatchId} arrived on a different session than the one it was dispatched to.`,
        detailHi: 'पुष्टि दूसरे सत्र से आई, इसे अस्वीकार किया गया।',
        failureReason: 'SESSION_MISMATCH',
      });
    }
    if (dispatch.status !== 'DISPATCHED') {
      return buildReceipt({
        action: dispatch.actionType,
        target: dispatch.target,
        outcome: 'FAILED',
        detailEn: `Dispatch ${params.dispatchId} was already settled as ${dispatch.status}.`,
        detailHi: 'यह कमांड पहले ही तय हो चुका है।',
        failureReason: 'ALREADY_SETTLED',
      });
    }

    const successStatuses = new Set(['CONFIRMED', 'OK', 'SUCCESS', 'DONE']);
    const normalized = String(params.confirmedStatus || '').toUpperCase();

    if (!successStatuses.has(normalized)) {
      dispatch.status = 'FAILED';
      dispatch.confirmedAt = new Date(this.now()).toISOString();
      dispatch.failureDetail = params.detail || `Device reported ${normalized}`;
      dispatch.deviceStatusEcho = normalized;
      this.recordAudit(
        `ACTION_FAILED:${dispatch.actionType}`,
        `Device reported ${normalized}: ${dispatch.failureDetail}`,
        'FAILED',
        { sessionId: params.sessionId, deviceId: this.device?.deviceId }
      );
      return buildReceipt({
        action: dispatch.actionType,
        target: dispatch.target,
        outcome: 'FAILED',
        detailEn: `Android device reported "${normalized}": ${dispatch.failureDetail}`,
        detailHi: `डिवाइस ने विफलता बताई: ${dispatch.failureDetail}`,
        failureReason: dispatch.failureDetail,
      });
    }

    dispatch.status = 'CONFIRMED';
    dispatch.confirmedAt = new Date(this.now()).toISOString();
    dispatch.deviceStatusEcho = normalized;

    this.recordAudit(
      `ACTION_CONFIRMED:${dispatch.actionType}`,
      `Device confirmed ${dispatch.actionType} (${dispatch.dispatchId})`,
      'VERIFIED',
      { sessionId: params.sessionId, deviceId: this.device?.deviceId }
    );

    return buildReceipt({
      action: dispatch.actionType,
      target: dispatch.target,
      outcome: 'VERIFIED',
      detailEn: `Android device ${this.device?.model || 'device'} confirmed ${dispatch.actionType} at ${dispatch.confirmedAt}.`,
      detailHi: `Android डिवाइस ने ${dispatch.actionType} की पुष्टि कर दी।`,
      evidence: makeEvidence('device_ack', `Device confirmation for ${dispatch.actionType}`, {
        ref: dispatch.dispatchId,
      }),
    });
  }

  /** Expires dispatches the device never acknowledged. */
  expireStaleDispatches(maxAgeMs: number = 60 * 1000): number {
    const cutoff = this.now() - maxAgeMs;
    let expired = 0;
    for (const dispatch of this.dispatchLedger) {
      if (dispatch.status === 'DISPATCHED' && Date.parse(dispatch.dispatchedAt) < cutoff) {
        dispatch.status = 'EXPIRED';
        expired += 1;
        this.recordAudit(
          `ACTION_EXPIRED:${dispatch.actionType}`,
          `No device confirmation for ${dispatch.dispatchId} within ${Math.round(maxAgeMs / 1000)}s — reported as unconfirmed, not success.`,
          'FAILED',
          { sessionId: dispatch.sessionId }
        );
      }
    }
    return expired;
  }

  getDispatchLedger(): DispatchedAction[] {
    return [...this.dispatchLedger];
  }

  getDispatch(dispatchId: string): DispatchedAction | undefined {
    return this.dispatchLedger.find((d) => d.dispatchId === dispatchId);
  }

  // ---- audit -----------------------------------------------------------------

  recordAudit(
    event: string,
    detail: string,
    outcome: ExecutionOutcome,
    context: { sessionId?: string; deviceId?: string } = {}
  ): BridgeAuditEntry {
    const entry: BridgeAuditEntry = {
      id: `baudit_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date(this.now()).toISOString(),
      event,
      detail,
      outcome,
      sessionId: context.sessionId,
      deviceId: context.deviceId,
    };
    this.audit.unshift(entry);
    if (this.audit.length > this.maxAudit) this.audit.pop();
    return entry;
  }

  getAudit(limit: number = 100): BridgeAuditEntry[] {
    return this.audit.slice(0, limit);
  }

  clearAudit(): void {
    this.audit = [];
  }

  /** Diagnostics page data. Token material is reduced to a prefix. */
  describeTokenForDiagnostics(token: string | undefined): string {
    return redactToken(token);
  }
}
