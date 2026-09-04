export type AndroidBridgeStatus =
  | 'MOBILE_NOT_CONNECTED'
  | 'PERMISSION_REQUIRED'
  | 'PARTIALLY_CONNECTED'
  | 'CONNECTED'
  | 'LIMITED_CAPABILITY'
  | 'ERROR';

export type AndroidPermissionState =
  | 'NOT_CONFIGURED'
  | 'DENIED'
  | 'ASK'
  | 'GRANTED'
  | 'LIMITED';

export interface MobilePermissionMatrix {
  notification_access: AndroidPermissionState;
  call_detection: AndroidPermissionState;
  call_answer: AndroidPermissionState;
  message_reading: AndroidPermissionState;
  message_reply: AndroidPermissionState;
  contacts_lookup: AndroidPermissionState;
  notification_history: AndroidPermissionState;
}

export type NotificationCategory =
  | 'CALLS'
  | 'SMS'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'EMAIL'
  | 'CALENDAR'
  | 'OTHER_APPS';

export interface AppPrivacyRule {
  packageName: string;
  appName: string;
  category: NotificationCategory;
  allowed: boolean;
  redactSensitive: boolean;
}

export interface AndroidDeviceCapabilities {
  deviceId: string;
  deviceName: string;
  model: string;
  osVersion: string;
  bridgeVersion: string;
  canDetectCalls: boolean;
  canAnswerCalls: boolean;
  telecomRoleDialer: boolean;
  answerCallsPermission: boolean;
  canReadNotifications: boolean;
  canInlineReply: boolean;
  canOpenApp: boolean;
  canLookupContacts: boolean;
  isSimulation?: boolean;
}

export type AndroidEventType =
  | 'INCOMING_CALL'
  | 'CALL_ENDED'
  | 'INCOMING_NOTIFICATION'
  | 'NOTIFICATION_REMOVED'
  | 'CALL_ANSWER_RESULT'
  | 'MESSAGE_REPLY_RESULT'
  | 'DEVICE_CONNECT'
  | 'DEVICE_DISCONNECT';

export interface AndroidCallEventPayload {
  callId: string;
  callerNumber: string;
  callerName?: string | null;
  timestamp: string;
  state: 'RINGING' | 'OFFHOOK' | 'IDLE';
  durationSeconds?: number;
}

export interface AndroidNotificationPayload {
  notificationId: string;
  packageName: string;
  appName: string;
  category: NotificationCategory;
  sender?: string | null;
  senderNumber?: string | null;
  title: string;
  text?: string | null;
  timestamp: string;
  hasInlineReply: boolean;
  actionKey?: string;
  isSensitive?: boolean;
  sensitiveCategory?: 'OTP' | 'BANK' | 'BANKING' | 'HEALTH' | 'AUTH' | 'GENERAL';
}

export interface AndroidPendingEvent {
  id: string;
  type: 'CALL' | 'MESSAGE';
  createdAt: string;
  appName: string;
  sender: string;
  senderNumber?: string;
  previewText?: string;
  rawText?: string;
  isSensitive: boolean;
  sensitiveCategory?: 'OTP' | 'BANK' | 'BANKING' | 'HEALTH' | 'AUTH' | 'GENERAL';
  sensitiveWarning?: string;
  spokenAnnouncement: string;
  status: 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'DISPATCHED' | 'CONFIRMED' | 'UNAVAILABLE' | 'FAILED';
  hasInlineReply: boolean;
  packageName?: string;
  actionKey?: string;
  callId?: string;
}

export type ReplyDispatchStatus =
  | 'REPLY_PENDING_APPROVAL'
  | 'REPLY_AUTHORIZED'
  | 'REPLY_DISPATCHED'
  | 'REPLY_CONFIRMED'
  | 'REPLY_UNAVAILABLE'
  | 'REPLY_FAILED';

export interface AndroidAuditLog {
  id: string;
  timestamp: string;
  eventType:
    | 'CALL_RECEIVED'
    | 'CALL_ANNOUNCED'
    | 'CALL_APPROVAL_REQUESTED'
    | 'CALL_APPROVED'
    | 'CALL_ANSWERED'
    | 'CALL_DECLINED'
    | 'MESSAGE_RECEIVED'
    | 'MESSAGE_ANNOUNCED'
    | 'REPLY_APPROVAL_REQUESTED'
    | 'REPLY_APPROVED'
    | 'REPLY_SENT'
    | 'ACTION_DENIED'
    | 'CAPABILITY_UNAVAILABLE'
    | 'SENSITIVE_REDACTION'
    | 'APP_OPENED'
    | 'DEVICE_CONNECTED'
    | 'DEVICE_DISCONNECTED';
  application: string;
  actionRequested: string;
  permissionState: AndroidPermissionState;
  authorizationState: string;
  result: 'SUCCESS' | 'REJECTED' | 'UNSUPPORTED' | 'BLOCKED_EMERGENCY_STOP' | 'PERMISSION_REQUIRED' | 'ROLE_REQUIRED' | 'FAILED';
  notes?: string;
}

export interface AndroidBridgeSettings {
  autoAnswerEnabled: boolean;
  autoAnswerDelaySeconds: number;
  readNotificationsAloud: boolean;
  privacyRules: Record<string, AppPrivacyRule>;
  categoryPermissions: Record<NotificationCategory, boolean>;
  sensitiveFilteringEnabled: boolean;
  blockHealthNotificationsByDefault: boolean;
}
