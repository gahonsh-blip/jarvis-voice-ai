// =============================================================================
// HERMES JARVIS — Android Mobile Bridge (Call + Notification + Message Assistant)
// Privacy-first domain types for the authenticated bridge between an Android device
// and the HERMES JARVIS backend. All content is treated as untrusted device input.
// =============================================================================

// ---------------------------------------------------------------
// 1. BRIDGE CONNECTION STATES
// ---------------------------------------------------------------
/** Possible states of the Android bridge linkage. Never report CONNECTED unless a live bridge is connected. */
export type MobileBridgeConnectionState =
  | 'MOBILE_NOT_CONNECTED'
  | 'PERMISSION_REQUIRED'
  | 'PARTIALLY_CONNECTED'
  | 'CONNECTED'
  | 'LIMITED_CAPABILITY'
  | 'ERROR';

/** Android capabilities reported by the bridge at connect time (detected on the device). */
export interface AndroidBridgeCapabilities {
  /** Device reported package of the bridge app */
  deviceId: string;
  deviceModel?: string;
  androidVersion?: string;
  /** Notification Listener permission currently held on the device */
  notificationListenerGranted: boolean;
  /** READ_PHONE_STATE (or Telephony role) granting incoming-call state visibility */
  callDetectionSupported: boolean;
  /** True only when the device actually holds an answering-capable role/dialer permission */
  callAnswerSupported: boolean;
  /** Human-readable key of the Android role required to answer calls (e.g. ROLE_DIALER, CALL_PHONE} */
  callAnswerRequiredRole?: string;
  /** Device can open the correct messaging application via Intent */
  openAppSupported: boolean;
  /** Device can perform inline notification replies via RemoteInput action */
  inlineReplySupported: boolean;
  /** Device has granted Contacts read (owner-authorized lookup only) */
  contactsLookupGranted: boolean;
  /** Bridge build/target Android SDK level */
  sdkInt?: number;
}

export type BridgeSessionInfo = {
  tokenIssuedAt: string;
  tokenExpiresAt: string;
  tokenRevoked: boolean;
};

// ---------------------------------------------------------------
// 2. NOTIFICATION ACCESS STATE
// ---------------------------------------------------------------
/** Notification-Listener onboarding state. Only GRANTED events are processed. */
export type NotificationAccessState = 'DENIED' | 'ASK' | 'GRANTED';

// ---------------------------------------------------------------
// 3. MOBILE PERMISSION CENTER (extends existing Permission Gateway)
// ---------------------------------------------------------------
export type MobilePermissionState =
  | 'NOT_CONFIGURED'
  | 'DENIED'
  | 'ASK'
  | 'GRANTED'
  | 'LIMITED';

export type MobilePermissionKey =
  | 'NOTIFICATION_ACCESS'
  | 'CALL_DETECTION'
  | 'CALL_ANSWER'
  | 'MESSAGE_READING'
  | 'MESSAGE_REPLY'
  | 'CONTACTS_LOOKUP'
  | 'NOTIFICATION_HISTORY';

export interface MobilePermissionDefinition {
  key: MobilePermissionKey;
  nameEn: string;
  nameHi: string;
  descriptionEn: string;
  descriptionHi: string;
  defaultState: MobilePermissionState;
  securityLevel: 1 | 2 | 3 | 4;
  icon?: string;
}

// ---------------------------------------------------------------
// 4. NOTIFICATION CATEGORY & PER-APP POLICY
// ---------------------------------------------------------------
export type MobileNotificationCategory =
  | 'CALLS'
  | 'SMS'
  |'WHATSAPP'
  | 'TELEGRAM'
  | 'EMAIL'
  |'CALENDAR'
  | 'HEALTH'
  | 'OTHER_APPS';

export type MobileCategoryPolicy = 'ALLOW' | 'DENY' | 'ASK';

export interface MobileBridgePolicy {
  categories: Record<MobileNotificationCategory, MobileCategoryPolicy>;
  /** Per-application override keyed by Android package (or app label)} */
  perApp: Record<string, MobileCategoryPolicy>;
  /** Explicit owner switch: announce call automatically once Call Notification permission granted */
  announceCallsAutomatically: boolean;
  /** Separate trusted auto-answer mode. Default OFF. */
  autoAnswerEnabled: boolean;
  /** Read (and announce) notification body content for allowed apps */
  readNotificationContent: boolean;
  /** Allow notifications to persist in a short-lived history view (metadata only) */
  notificationHistoryEnabled: boolean;
}

export const MOBILE_NOTIFICATION_CATEGORIES: MobileNotificationCategory[] = [
  'CALLS',
  'SMS',
  'WHATSAPP',
  'TELEGRAM',
  'EMAIL',
  'CALENDAR',
  'HEALTH','OTHER_APPS',
];

export const CATEGORY_DEFAULT_POLICY: Record<MobileNotificationCategory, MobileCategoryPolicy> = {
  CALLS: 'ASK',
  SMS: 'ASK',
  WHATSAPP: 'ASK',
  TELEGRAM: 'ASK',
  EMAIL: 'ASK',
  CALENDAR: 'ASK',
  HEALTH: 'DENY',
  OTHER_APPS: 'ASK',
};

export const DEFAULT_MOBILE_BRIDGE_POLICY: MobileBridgePolicy = {
  categories: { ...CATEGORY_DEFAULT_POLICY },
  perApp: {},
  announceCallsAutomatically: true,
  autoAnswerEnabled: false,
  readNotificationContent: true,
  notificationHistoryEnabled: false,
};

/** Recommended explicit permission prompt (must be shown to owner before enabling). */
export const NOTIFICATION_ACCESS_PROMPT_HI =
  'JARVIS को आपके notifications पढ़ने की अनुमति चाहिए ताकि वह आपको incoming notifications के बारे में बता सके।';
export const NOTIFICATION_ACCESS_PROMPT_EN =
  'JARVIS needs permission to read your notifications so that it can inform you about incoming notifications.';

// ---------------------------------------------------------------
// 5. MOBILE EVENTS
// ---------------------------------------------------------------
export type MobileEventType =
  | 'INCOMING_CALL'
  | 'NOTIFICATION'
  | 'SENSITIVE_NOTIFICATION'
  | 'CALL_STATE_ENDED'
  | 'ACTION_RESULT';

export type MobileCallState = 'RINGING' | 'ANSWERING' | 'CONNECTED' | 'ENDED';

export interface MobileIncomingCallEvent {
  eventId: string;
  type: 'INCOMING_CALL';
  receivedAt: string;
  state: MobileCallState;
  /** Apps package (or dialer label) if resolvable */
  app?: string;
  callerName?: string;
  callerNumber?: string;
  callerMasked: string;
  category: 'CALLS';
  /** Permission state used to accept this event */
  permissionState: MobilePermissionState;
  isSimulated: boolean;
  simulationOnly?: boolean;
}

export interface MobileNotificationEvent {
  eventId: string;
  packageName: string;
  appLabel: string;
  category: MobileNotificationCategory;
  title?: string;
  senderName?: string;
  /** Only present when MESSAGE_READING granted, content permitted, and not sensitive */
  body?: string;
  bodyPreview?: string;
  contentAvailable: boolean;
  sensitive: boolean;
  sensitiveKind?: 'OTP' | 'AUTH' | 'BANK' | 'HEALTH' | 'SECRET' | 'OTHER';
  key: string;
  notificationId: number;
  postTime: number;
  receivedAt: string;
  permissionState: MobilePermissionState;
  isSimulated: boolean;
  simulationOnly?: boolean;
}

export type MobileEvent = MobileIncomingCallEvent | MobileNotificationEvent | MobileStateEvent | MobileActionResultEvent;

export interface MobileStateEvent {
  eventId: string;
  type: 'CALL_STATE_ENDED';
  receivedAt: string;
  callEventId?: string;
  state: 'ENDED';
  durationSeconds?: number;
  isSimulated: boolean;
  simulationOnly?: boolean;
}

export type MobileActionResultStatus =
  | 'REPLY_CONFIRMED'
  | 'REPLY_FAILED'
  | 'REPLY_UNAVAILABLE'
  | 'CALL_ANSWERED'
  | 'CALL_ANSWER_UNSUPPORTED'
  | 'APP_OPENED'
  | 'APP_OPEN_FAILED'
  | 'ACTION_NOT_EXECUTED';

export interface MobileActionResultEvent {
  eventId: string;
  type: 'ACTION_RESULT';
  receivedAt: string;
  actionId: string;
  status: MobileActionResultStatus;
  /** Present ONLY when provider/device confirmed the result. */
  confirmed: boolean;
  detail?: string;
  requiredRole?: string;
  isSimulated: boolean;
  simulationOnly?: boolean;
}

// ---------------------------------------------------------------
// 6. PENDING EVENT QUEUE & APPROVAL
// ---------------------------------------------------------------
export type PendingMobileEventKind = 'CALL_ANSWER' | 'MESSAGE_REPLY' | 'OPEN_APP' | 'NOTIFICATION_INFO';

export interface PendingMobileEvent {
  eventId: string;
  kind: PendingMobileEventKind;
  displayTitle: string;
  displaySubtitle: string;
  maskedIdentifier: string;
  appLabel?: string;
  preview?: string;
  sensitive: boolean;
  timestamp: number;
  status: 'PENDING_APPROVAL' | 'AUTHORIZED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';
  actionRequestId?: string;
  sourceEvent: MobileEvent;
  isSimulated: boolean;
  simulationOnly?: boolean;
  autoAnnounced?: boolean;
}

export type MobileApprovalDecision = 'ANSWER' | 'REPLY' | 'OPEN' | 'DISMISS' | 'DECLINE';

// ---------------------------------------------------------------
// 7. REPLY / ACTION STATUSES
// ---------------------------------------------------------------
export type MobileReplyStatus =
  | 'REPLY_PENDING_APPROVAL'
  | 'REPLY_AUTHORIZED'
  | 'REPLY_DISPATCHED'
  | 'REPLY_CONFIRMED'
   | 'REPLY_UNAVAILABLE'
   | 'REPLY_FAILED';

export type MobileActionStatus =
  | 'ACTION_PENDING_APPROVAL'
  | 'ACTION_AUTHORIZED'
  | 'ACTION_DISPATCHED'
  | 'ACTION_CONFIRMED'
  | 'ACTION_FAILED'
  | 'ACTION_UNAVAILABLE'
  | 'BLOCKED_EMERGENCY_STOP';

// ---------------------------------------------------------------
// 8. ERROR CODES (no fake success)
// ---------------------------------------------------------------
export type MobileBridgeErrorCode =
  | 'PERMISSION_DENIED'
  | 'ROLE_REQUIRED'
  | 'NOTIFICATION_CONTENT_UNAVAILABLE'
   | 'REPLY_UNSUPPORTED'
   | 'CALL_ANSWER_UNSUPPORTED'
   | 'BRIDGE_DISCONNECTED'
   | 'DEVICE_OFFLINE'
   | 'ACTION_TIMEOUT'
   |'ACTION_FAILED'
   | 'EMERGENCY_STOP_ACTIVE'
   | 'INVALID_SESSION';

// ---------------------------------------------------------------
// 9. AUDIT LOG (metadata only — never full private message content)
// ---------------------------------------------------------------
export type MobileAuditEventType =
  | 'CALL_RECEIVED'
   |'CALL_ANNOUNCED'
   |'CALL_APPROVAL_REQUESTED'
   |'CALL_APPROVED'
   |'CALL_ANSWERED'
   |'MESSAGE_RECEIVED'
   |'MESSAGE_ANNOUNCED'
   |'REPLY_APPROVAL_REQUESTED'
   |'REPLY_APPROVED'
   |'REPLY_SENT'
   |'REPLY_CONFIRMED'
   |'ACTION_DENIED'
   |'CAPABILITY_UNAVAILABLE'
   |'SENSITIVE_BLOCKED'
   |'BRIDGE_CONNECTED'
   |'BRIDGE_DISCONNECTED'
   |'EMERGENCY_BLOCKED'
   |'PERMISSION_CHANGED';

export interface MobileAuditEntry {
  id: string;
  timestamp: string;
  eventType: MobileAuditEventType;
  application?: string;
  actionRequested?: string;
  permissionState?: MobilePermissionState;
  authorizationState?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO' | 'BLOCKED';
  result?: 'SUCCESS' |'FAILED' |'DENIED' |'UNAVAILABLE';
  masked?: string;
}

export type MobileReplyStatusMap = Record<string, MobileReplyStatus>;