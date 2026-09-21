import {
  AndroidBridgeStatus,
  AndroidPermissionState,
  MobilePermissionMatrix,
  NotificationCategory,
  AppPrivacyRule,
  AndroidDeviceCapabilities,
  AndroidCallEventPayload,
  AndroidNotificationPayload,
  AndroidPendingEvent,
  AndroidAuditLog,
  AndroidBridgeSettings,
} from '../types/mobileBridge';
import { buildReceipt, makeEvidence, type ExecutionReceipt } from './executionTruth';

// Storage keys
const SETTINGS_STORAGE_KEY = 'hermes_jarvis_android_bridge_settings_v1';
const PERMS_STORAGE_KEY = 'hermes_jarvis_android_perms_v1';
const AUDIT_STORAGE_KEY = 'hermes_jarvis_android_audit_v1';

export const DEFAULT_PERMISSIONS_MATRIX: MobilePermissionMatrix = {
  notification_access: 'NOT_CONFIGURED',
  call_detection: 'NOT_CONFIGURED',
  call_answer: 'LIMITED',
  message_reading: 'NOT_CONFIGURED',
  message_reply: 'LIMITED',
  contacts_lookup: 'NOT_CONFIGURED',
  notification_history: 'NOT_CONFIGURED',
  location_access: 'NOT_CONFIGURED',
};

export const DEFAULT_CATEGORY_PERMISSIONS: Record<NotificationCategory, boolean> = {
  CALLS: true,
  SMS: true,
  WHATSAPP: true,
  TELEGRAM: true,
  EMAIL: true,
  CALENDAR: true,
  OTHER_APPS: false,
};

export const DEFAULT_APP_RULES: Record<string, AppPrivacyRule> = {
  'com.whatsapp': {
    packageName: 'com.whatsapp',
    appName: 'WhatsApp',
    category: 'WHATSAPP',
    allowed: true,
    redactSensitive: true,
  },
  'org.telegram.messenger': {
    packageName: 'org.telegram.messenger',
    appName: 'Telegram',
    category: 'TELEGRAM',
    allowed: true,
    redactSensitive: true,
  },
  'com.google.android.apps.messaging': {
    packageName: 'com.google.android.apps.messaging',
    appName: 'Messages (SMS)',
    category: 'SMS',
    allowed: true,
    redactSensitive: true,
  },
  'com.google.android.gm': {
    packageName: 'com.google.android.gm',
    appName: 'Gmail',
    category: 'EMAIL',
    allowed: true,
    redactSensitive: true,
  },
  'com.google.android.calendar': {
    packageName: 'com.google.android.calendar',
    appName: 'Google Calendar',
    category: 'CALENDAR',
    allowed: true,
    redactSensitive: true,
  },
  // Banking / UPI apps default to DENY
  'com.google.android.apps.nbu.paisa.user': {
    packageName: 'com.google.android.apps.nbu.paisa.user',
    appName: 'Google Pay (UPI)',
    category: 'OTHER_APPS',
    allowed: false,
    redactSensitive: true,
  },
  'com.phonepe.app': {
    packageName: 'com.phonepe.app',
    appName: 'PhonePe',
    category: 'OTHER_APPS',
    allowed: false,
    redactSensitive: true,
  },
  'net.one97.paytm': {
    packageName: 'net.one97.paytm',
    appName: 'Paytm',
    category: 'OTHER_APPS',
    allowed: false,
    redactSensitive: true,
  },
};

export const DEFAULT_BRIDGE_SETTINGS: AndroidBridgeSettings = {
  autoAnswerEnabled: false,
  autoAnswerDelaySeconds: 3,
  readNotificationsAloud: true,
  privacyRules: DEFAULT_APP_RULES,
  categoryPermissions: DEFAULT_CATEGORY_PERMISSIONS,
  blockHealthNotificationsByDefault: true,
};

/**
 * Mask phone numbers to preserve privacy in logs & UI
 * Example: +91 9876543210 -> +91 ******3210
 */
export function maskPhoneNumber(numberStr: string): string {
  if (!numberStr) return 'Unknown Number';
  const clean = numberStr.trim();
  if (clean.length <= 4) return '****';
  const lastFour = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) : '';
  return `${prefix ? prefix + ' ' : ''}******${lastFour}`;
}

/**
 * Detect sensitive content (OTP, Banking, Passwords, Health)
 * Ensures secrets are never read aloud or logged unredacted.
 */
export function detectSensitiveContent(
  text: string | null | undefined,
  title?: string
): {
  isSensitive: boolean;
  category?: 'OTP' | 'BANK' | 'BANKING' | 'HEALTH' | 'AUTH' | 'GENERAL';
  reason?: string;
  redactedText: string;
} {
  if (!text) {
    return { isSensitive: false, redactedText: '' };
  }

  const combined = `${title || ''} ${text}`.toLowerCase();

  // 1. OTP / Verification code detection
  const otpKeywords = [
    'otp',
    'one time password',
    'verification code',
    'auth code',
    'security code',
    'verification pin',
    'ओटीपी',
    'वैरिफिकेशन कोड',
    'पासकोड',
  ];
  const hasOtpKw = otpKeywords.some((kw) => combined.includes(kw));
  const hasOtpCode = /\b\d{4,8}\b/.test(combined);

  if (hasOtpKw || (combined.includes('code') && hasOtpCode)) {
    return {
      isSensitive: true,
      category: 'OTP',
      reason: 'Contains one-time password or security verification code',
      redactedText: '[OTP / Verification Code Redacted for Privacy]',
    };
  }

  // 2. Banking / Transaction / UPI / Credit Card detection
  const bankKeywords = [
    'bank',
    'hdfc',
    'sbi',
    'icici',
    'axis',
    'account credited',
    'account debited',
    'debited',
    'credited',
    'balance inr',
    'avl bal',
    'available balance',
    'upi ref',
    'upi txn',
    'cvv',
    'card ending',
    'debit card',
    'credit card',
    'atm withdrawal',
    'खाता',
    'रुपये जमा',
    'रुपये निकाले',
    'बैंक खाता',
  ];
  if (bankKeywords.some((kw) => combined.includes(kw))) {
    return {
      isSensitive: true,
      category: 'BANKING',
      reason: 'Contains financial transaction or banking details',
      redactedText: '[Financial / Banking Telemetry Redacted for Privacy]',
    };
  }

  // 3. Password / Secret Token / PIN detection
  const authKeywords = [
    'password',
    'login pin',
    'secret token',
    'private key',
    'passcode',
    'पासवर्ड',
    'पिन',
  ];
  if (authKeywords.some((kw) => combined.includes(kw))) {
    return {
      isSensitive: true,
      category: 'AUTH',
      reason: 'Contains authentication password or security credential',
      redactedText: '[Authentication Credential Redacted]',
    };
  }

  // 4. Health / Medical details detection
  const healthKeywords = [
    'prescription',
    'diagnosis',
    'medical report',
    'pathology lab',
    'doctor consultation report',
    'दवा पर्ची',
    'जांच रिपोर्ट',
  ];
  if (healthKeywords.some((kw) => combined.includes(kw))) {
    return {
      isSensitive: true,
      category: 'HEALTH',
      reason: 'Contains private medical or diagnostic information',
      redactedText: '[Confidential Health Record Protected]',
    };
  }

  return { isSensitive: false, redactedText: text };
}

/**
 * Short-lived notification deduplication state
 */
class NotificationDeduplicator {
  private cache: Map<string, number> = new Map();
  private ttlMs = 5 * 60 * 1000; // 5 minutes

  public isDuplicate(notification: AndroidNotificationPayload): boolean {
    const now = Date.now();
    this.cleanup(now);

    const safeText = (notification.text || '').trim().slice(0, 80);
    const key = `${notification.packageName}:${notification.sender || ''}:${safeText}`;

    if (this.cache.has(key)) {
      return true;
    }

    this.cache.set(key, now);
    return false;
  }

  public clear(): void {
    this.cache.clear();
  }

  private cleanup(now: number): void {
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

export const notificationDeduplicator = new NotificationDeduplicator();

/**
 * Android Mobile Bridge State Manager
 */
export class AndroidBridgeManager {
  private status: AndroidBridgeStatus = 'MOBILE_NOT_CONNECTED';
  private capabilities: AndroidDeviceCapabilities | null = null;
  private permissions: MobilePermissionMatrix = { ...DEFAULT_PERMISSIONS_MATRIX };
  private settings: AndroidBridgeSettings = { ...DEFAULT_BRIDGE_SETTINGS };
  private pendingEvent: AndroidPendingEvent | null = null;
  private pendingEventQueue: AndroidPendingEvent[] = [];
  private auditLogs: AndroidAuditLog[] = [];
  private isEmergencyStopActive = false;
  private lastReceipt: ExecutionReceipt | null = null;
  private listeners: ((event: AndroidPendingEvent | null) => void)[] = [];

  constructor() {
    this.loadState();
  }

  public addListener(cb: (event: AndroidPendingEvent | null) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notifyListeners(event: AndroidPendingEvent | null): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Android bridge listener failed', e);
      }
    }
  }

  public openApplication(packageName: string): {
    success: boolean;
    blockedReason?:
      | 'MOBILE_NOT_CONNECTED'
      | 'BLOCKED_EMERGENCY_STOP'
      | 'OPEN_APP_UNSUPPORTED'
      | 'APP_DENIED';
    message: string;
  } {
    // Launching an app is a device-side effect. Without a device acknowledgement
    // we can only say we asked for it, not that it happened — so gates are
    // checked first and success is never reported.
    if (this.status === 'MOBILE_NOT_CONNECTED' || !this.capabilities) {
      this.recordAudit({
        eventType: 'ACTION_DENIED',
        application: packageName,
        actionRequested: 'Launch Application',
        permissionState: 'DENIED',
        authorizationState: 'MOBILE_NOT_CONNECTED',
        result: 'REJECTED',
        notes: `App launch requested for ${packageName} with no Android device connected`,
      });
      return {
        success: false,
        blockedReason: 'MOBILE_NOT_CONNECTED',
        message: 'No Android device is connected to the bridge.',
      };
    }

    if (this.isEmergencyStopActive) {
      this.recordAudit({
        eventType: 'ACTION_DENIED',
        application: packageName,
        actionRequested: 'Launch Application',
        permissionState: 'DENIED',
        authorizationState: 'BLOCKED_EMERGENCY_STOP',
        result: 'BLOCKED_EMERGENCY_STOP',
        notes: `App launch for ${packageName} blocked by Global Kill Switch`,
      });
      return {
        success: false,
        blockedReason: 'BLOCKED_EMERGENCY_STOP',
        message: 'App launch blocked by Global Kill Switch.',
      };
    }

    if (!this.capabilities.canOpenApp) {
      this.recordAudit({
        eventType: 'CAPABILITY_UNAVAILABLE',
        application: packageName,
        actionRequested: 'Launch Application',
        permissionState: 'GRANTED',
        authorizationState: 'CAPABILITY_MISSING',
        result: 'UNSUPPORTED',
        notes: 'Device does not report launch-intent capability',
      });
      return {
        success: false,
        blockedReason: 'OPEN_APP_UNSUPPORTED',
        message: 'This device does not support launching applications via the bridge.',
      };
    }

    const rule = this.settings.privacyRules[packageName];
    if (rule && !rule.allowed) {
      this.recordAudit({
        eventType: 'ACTION_DENIED',
        application: rule.appName,
        actionRequested: 'Launch Application',
        permissionState: 'DENIED',
        authorizationState: 'APP_DENIED',
        result: 'REJECTED',
        notes: `Launch of ${packageName} denied by privacy policy`,
      });
      return {
        success: false,
        blockedReason: 'APP_DENIED',
        message: `Application ${rule.appName} is denied by the privacy policy.`,
      };
    }

    // Gates passed: dispatch the launch intent, but the app opening is still
    // unconfirmed, so success stays false and the attempt is audited as dispatched.
    this.recordAudit({
      eventType: 'APP_OPENED',
      application: rule?.appName || packageName,
      actionRequested: 'Launch Application',
      permissionState: 'GRANTED',
      authorizationState: 'HUMAN_EXPLICIT_APPROVAL',
      result: 'UNSUPPORTED',
      notes: `Launch intent requested for ${packageName}; awaiting device confirmation`,
    });
    this.lastReceipt = buildReceipt({
      action: 'OPEN_APP',
      target: packageName,
      outcome: 'DISPATCHED',
      detailEn: `Launch intent for ${packageName} was handed to the Android device; confirmation pending.`,
      detailHi: `${packageName} खोलने का निर्देश भेज दिया गया है; पुष्टि बाकी है।`,
      dispatchedAt: new Date().toISOString(),
    });
    return { success: false, message: `Launch intent for ${packageName} dispatched; awaiting device confirmation.` };
  }

  private loadState(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        this.settings = { ...DEFAULT_BRIDGE_SETTINGS, ...JSON.parse(savedSettings) };
      }
      const savedPerms = localStorage.getItem(PERMS_STORAGE_KEY);
      if (savedPerms) {
        this.permissions = { ...DEFAULT_PERMISSIONS_MATRIX, ...JSON.parse(savedPerms) };
      }
      const savedAudit = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (savedAudit) {
        this.auditLogs = JSON.parse(savedAudit);
      }
    } catch {
      // Safe fallback
    }
  }

  public saveState(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      localStorage.setItem(PERMS_STORAGE_KEY, JSON.stringify(this.permissions));
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(this.auditLogs.slice(0, 100)));
    } catch {
      // Safe fallback
    }
  }

  public getStatus(): AndroidBridgeStatus {
    return this.status;
  }

  public setStatus(newStatus: AndroidBridgeStatus): void {
    this.status = newStatus;
  }

  public getCapabilities(): AndroidDeviceCapabilities | null {
    return this.capabilities;
  }

  public getPermissions(): MobilePermissionMatrix {
    return { ...this.permissions };
  }

  public updatePermission(key: keyof MobilePermissionMatrix, state: AndroidPermissionState): void {
    this.permissions[key] = state;
    this.saveState();
  }

  public getSettings(): AndroidBridgeSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<AndroidBridgeSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveState();
  }

  public setEmergencyStop(active: boolean): void {
    this.isEmergencyStopActive = active;
  }

  public isEmergencyStop(): boolean {
    return this.isEmergencyStopActive;
  }

  /**
   * Connect an Android device with verified capabilities
   */
  public connectDevice(
    caps: AndroidDeviceCapabilities,
    permissions?: Partial<MobilePermissionMatrix>
  ): { success: boolean; status: AndroidBridgeStatus } {
    this.capabilities = caps;

    if (permissions) {
      this.permissions = { ...this.permissions, ...permissions };
    } else {
      if (caps.canDetectCalls) this.permissions.call_detection = 'GRANTED';
      if (caps.canReadNotifications) this.permissions.notification_access = 'GRANTED';
      if (caps.canAnswerCalls && caps.telecomRoleDialer) {
        this.permissions.call_answer = 'GRANTED';
      } else {
        this.permissions.call_answer = 'LIMITED';
      }
      if (caps.canInlineReply) this.permissions.message_reply = 'GRANTED';
      if (caps.canLookupContacts) this.permissions.contacts_lookup = 'GRANTED';
    }

    // Check permissions requirements
    const hasNotif = this.permissions.notification_access === 'GRANTED';
    const hasCall = this.permissions.call_detection === 'GRANTED';

    if (caps.isSimulation) {
      // A simulated/testbed device must never be reported as a live connection.
      this.status = 'LIMITED_CAPABILITY';
    } else if (!hasNotif && !hasCall) {
      this.status = 'PERMISSION_REQUIRED';
    } else if (!caps.canAnswerCalls || !caps.telecomRoleDialer) {
      this.status = 'LIMITED_CAPABILITY';
    } else if (!hasNotif || !hasCall) {
      this.status = 'PARTIALLY_CONNECTED';
    } else {
      this.status = 'CONNECTED';
    }

    this.recordAudit({
      eventType: 'DEVICE_CONNECTED',
      application: 'AndroidBridge',
      actionRequested: 'Device Pairing & Registration',
      permissionState: this.permissions.notification_access,
      authorizationState: 'AUTHENTICATED',
      result: caps.isSimulation ? 'UNSUPPORTED' : 'SUCCESS',
      notes: `Device: ${caps.model} (${caps.deviceName}), OS: ${caps.osVersion}${caps.isSimulation ? ' [SIMULATION_ONLY - not a live device]' : ''}`,
    });

    return { success: true, status: this.status };
  }

  /**
   * Disconnect the device
   */
  public disconnectDevice(reason: string = 'User initiated disconnect'): void {
    const prevModel = this.capabilities?.model || 'Device';
    this.capabilities = null;
    this.status = 'MOBILE_NOT_CONNECTED';
    this.pendingEvent = null;
    this.pendingEventQueue = [];

    this.recordAudit({
      eventType: 'DEVICE_DISCONNECTED',
      application: 'AndroidBridge',
      actionRequested: 'Bridge Disconnect',
      permissionState: this.permissions.notification_access,
      authorizationState: 'DISCONNECTED',
      result: 'SUCCESS',
      notes: `${prevModel} disconnected: ${reason}`,
    });
  }

  /**
   * Evaluate Call Answering Capability
   */
  public evaluateCallAnswerSupport(): {
    supported: boolean;
    reason: string;
    hindiNotice: string;
    requiresRole: boolean;
  } {
    if (!this.capabilities) {
      return {
        supported: false,
        reason: 'BRIDGE_DISCONNECTED',
        hindiNotice: 'सर, Android device अभी JARVIS से कनेक्टेड नहीं है।',
        requiresRole: false,
      };
    }

    if (!this.capabilities.canAnswerCalls) {
      return {
        supported: false,
        reason: 'CALL_ANSWER_UNSUPPORTED',
        hindiNotice: 'सर, इस Android device पर JARVIS को अभी call answer करने की अनुमति नहीं मिली है।',
        requiresRole: false,
      };
    }

    // Android Telecom role or direct Answer permission required
    if (!this.capabilities.telecomRoleDialer && !this.capabilities.answerCallsPermission) {
      return {
        supported: false,
        reason: 'ROLE_REQUIRED',
        hindiNotice: 'सर, इस Android device पर कॉल उठाने के लिए Default Phone App / Telecom Role की आवश्यकता है।',
        requiresRole: true,
      };
    }

    return {
      supported: true,
      reason: 'CAPABILITY_VERIFIED',
      hindiNotice: 'कॉल उठाने की अनुमति उपलब्ध है।',
      requiresRole: false,
    };
  }

  /**
   * Process an incoming call event from Android
   */
  public handleIncomingCall(payload: Partial<AndroidCallEventPayload>, language: string = 'hi-IN'): {
    announced: boolean;
    spokenText?: string;
    spokenAnnouncement?: string;
    sender?: string;
    senderNumber?: string;
    isSensitive: boolean;
    pendingEvent?: AndroidPendingEvent;
    blockedReason?: string;
  } {
    // 1. Permission check
    if (this.permissions.call_detection !== 'GRANTED') {
      this.recordAudit({
        eventType: 'CALL_RECEIVED',
        application: 'TelecomManager',
        actionRequested: 'Incoming Call Detection',
        permissionState: this.permissions.call_detection,
        authorizationState: 'UNAUTHORIZED',
        result: 'PERMISSION_REQUIRED',
        notes: `Call detection denied for masked number ${maskPhoneNumber(payload.callerNumber || 'Unknown')}`,
      });
      return { announced: false, isSensitive: false, blockedReason: 'PERMISSION_REQUIRED' };
    }

    const contactsAllowed = this.permissions.contacts_lookup === 'GRANTED';
    const effectiveCallerName = contactsAllowed && payload.callerName ? payload.callerName : null;
    const masked = maskPhoneNumber(payload.callerNumber || 'Unknown');

    // 2. Generate natural announcement
    const isHindi = language.startsWith('hi') || language === 'auto';
    const isHinglish = language === 'hinglish';

    let spokenText = '';
    if (effectiveCallerName) {
      spokenText = isHindi
        ? `सर, ${effectiveCallerName} का कॉल आया है। क्या मैं कॉल उठा दूँ?`
        : isHinglish
        ? `Sir, ${effectiveCallerName} ka call aaya hai. Kya main call utha doon?`
        : `Sir, incoming call from ${effectiveCallerName}. Shall I answer the call?`;
    } else {
      const displayNum = masked !== 'Unknown' ? masked : 'अज्ञात नंबर';
      spokenText = isHindi
        ? `सर, ${displayNum} से कॉल आया है। क्या मैं कॉल उठा दूँ?`
        : isHinglish
        ? `Sir, ${displayNum} se call aaya hai. Kya main call utha doon?`
        : `Sir, incoming call from ${displayNum}. Shall I answer the call?`;
    }

    // 3. Stage pending call event
    const pendingCall: AndroidPendingEvent = {
      id: `call_event_${Date.now()}`,
      type: 'CALL',
      createdAt: new Date().toISOString(),
      appName: 'Phone',
      sender: effectiveCallerName || 'Unknown Caller',
      senderNumber: masked,
      previewText: `Incoming Call from ${effectiveCallerName ? `${effectiveCallerName} (${masked})` : masked}`,
      isSensitive: false,
      spokenAnnouncement: spokenText,
      status: 'AWAITING_APPROVAL',
      hasInlineReply: false,
      callId: payload.callId,
    };

    this.pendingEvent = pendingCall;
    this.pendingEventQueue.unshift(pendingCall);
    this.notifyListeners(pendingCall);

    this.recordAudit({
      eventType: 'CALL_RECEIVED',
      application: 'TelecomManager',
      actionRequested: 'Call Announce & Approval Gate',
      permissionState: 'GRANTED',
      authorizationState: 'WAITING_FOR_OWNER_APPROVAL',
      result: 'SUCCESS',
      notes: `Caller: ${effectiveCallerName || 'Unknown'}, Number: ${masked}`,
    });

    return {
      announced: true,
      spokenText,
      spokenAnnouncement: spokenText,
      sender: effectiveCallerName || 'Unknown Caller',
      senderNumber: masked,
      isSensitive: false,
      pendingEvent: pendingCall,
    };
  }

  /**
   * Process an incoming notification from Android NotificationListenerService
   */
  public handleIncomingNotification(
    payload: Partial<AndroidNotificationPayload>,
    language: string = 'hi-IN'
  ): {
    announced: boolean;
    spokenText?: string;
    spokenAnnouncement?: string;
    isSensitive?: boolean;
    sensitiveCategory?: 'OTP' | 'BANK' | 'BANKING' | 'HEALTH' | 'AUTH' | 'GENERAL';
    previewText?: string;
    pendingEvent?: AndroidPendingEvent;
    blockedReason?: string;
  } {
    // 1. Notification access permission check
    if (this.permissions.notification_access !== 'GRANTED') {
      return { announced: false, blockedReason: 'PERMISSION_REQUIRED' };
    }

    // 2. Category privacy check
    if (payload.category && this.settings.categoryPermissions[payload.category] === false) {
      return { announced: false, blockedReason: `CATEGORY_${payload.category}_DENIED` };
    }

    // 3. Per-application allow/deny check
    const appRule = payload.packageName ? this.settings.privacyRules[payload.packageName] : undefined;
    if (appRule && !appRule.allowed) {
      this.recordAudit({
        eventType: 'MESSAGE_RECEIVED',
        application: payload.appName || 'Unknown',
        actionRequested: 'Read Notification',
        permissionState: 'DENIED',
        authorizationState: 'APP_DENIED',
        result: 'REJECTED',
        notes: `Notification from denied app ${payload.packageName} discarded`,
      });
      return { announced: false, blockedReason: 'APP_DENIED' };
    }

    // 4. Deduplication
    if (notificationDeduplicator.isDuplicate(payload as AndroidNotificationPayload)) {
      return { announced: false, blockedReason: 'DUPLICATE_NOTIFICATION' };
    }

    // 5. Sensitive content detection. This guard is deliberately not
    // settings-gated: docs/MOBILE_CALL_NOTIFICATION.md promises OTP, banking and
    // credential bodies are *never* read aloud or written to logs, so there is
    // no owner override that would let a raw secret through. (A persisted
    // `sensitiveFilteringEnabled: false` from an older build is ignored, since
    // it could otherwise silently disable the guard.)
    const sensitiveCheck = detectSensitiveContent(payload.text, payload.title);
    const isSensitive = sensitiveCheck.isSensitive;

    // Health notifications are the one category the owner may opt into, via
    // AndroidBridgeSettings.blockHealthNotificationsByDefault. It defaults to
    // blocking, and unlike the redaction guard it only widens what is announced.
    if (
      this.settings.blockHealthNotificationsByDefault &&
      sensitiveCheck.category === 'HEALTH'
    ) {
      this.recordAudit({
        eventType: 'SENSITIVE_REDACTION',
        application: payload.appName || 'Unknown',
        actionRequested: 'Announce Notification',
        permissionState: 'GRANTED',
        authorizationState: 'BLOCKED_HEALTH_DEFAULT',
        result: 'REJECTED',
        notes: 'Health notification blocked because blockHealthNotificationsByDefault is enabled',
      });
      return { announced: false, blockedReason: 'HEALTH_BLOCKED' };
    }

    const isHindi = language.startsWith('hi') || language === 'auto';
    const isHinglish = language === 'hinglish';
    const appName = payload.appName || 'App';
    const sender = payload.sender || payload.title || 'Unknown';

    let spokenText = '';

    if (isSensitive) {
      spokenText = isHindi
        ? `सर, ${appName} पर एक गोपनीय सूचना आई है।`
        : isHinglish
        ? `Sir, ${appName} par ek confidential notification aaya hai.`
        : `Sir, a confidential notification was received from ${appName}.`;
    } else if (!payload.text || payload.text.trim() === '') {
      spokenText = isHindi
        ? `सर, ${appName} पर ${sender} का notification आया है।`
        : isHinglish
        ? `Sir, ${appName} par ${sender} ka notification aaya hai.`
        : `Sir, a notification arrived on ${appName} from ${sender}.`;
    } else {
      spokenText = isHindi
        ? `सर, ${appName} पर ${sender} का संदेश आया है।`
        : isHinglish
        ? `Sir, ${appName} par ${sender} ka message aaya hai.`
        : `Sir, you received a message on ${appName} from ${sender}.`;
    }

    // 6. Stage pending message event (for reply approval)
    const pendingMsg: AndroidPendingEvent = {
      id: `msg_event_${Date.now()}`,
      type: 'MESSAGE',
      createdAt: new Date().toISOString(),
      appName,
      sender,
      previewText: isSensitive ? `[PROTECTED - ${sensitiveCheck.reason}]` : (payload.text || payload.title || ''),
      rawText: isSensitive ? undefined : payload.text || undefined,
      isSensitive,
      sensitiveCategory: isSensitive ? sensitiveCheck.category : undefined,
      sensitiveWarning: isSensitive ? sensitiveCheck.reason : undefined,
      spokenAnnouncement: spokenText,
      status: 'AWAITING_APPROVAL',
      hasInlineReply: Boolean(payload.hasInlineReply),
      packageName: payload.packageName,
      actionKey: payload.actionKey,
    };

    // If a call is already pending, don't overwrite it; place in queue
    if (this.pendingEvent && this.pendingEvent.type === 'CALL') {
      this.pendingEventQueue.push(pendingMsg);
    } else {
      this.pendingEvent = pendingMsg;
      this.pendingEventQueue.unshift(pendingMsg);
    }
    this.notifyListeners(pendingMsg);

    this.recordAudit({
      eventType: 'MESSAGE_RECEIVED',
      application: appName,
      actionRequested: 'Notification Announcement',
      permissionState: 'GRANTED',
      authorizationState: 'WAITING_FOR_OWNER_APPROVAL',
      result: 'SUCCESS',
      notes: `App: ${appName}, Sender: ${sender}, Sensitive: ${isSensitive}`,
    });

    if (isSensitive) {
      // Record the redaction without ever persisting the protected body.
      this.recordAudit({
        eventType: 'SENSITIVE_REDACTION',
        application: appName,
        actionRequested: 'Redact Notification Body',
        permissionState: 'GRANTED',
        authorizationState: 'WAITING_FOR_OWNER_APPROVAL',
        result: 'SUCCESS',
        notes: `Protected ${sensitiveCheck.category} content redacted before announcement`,
      });
    }

    return {
      announced: true,
      spokenText,
      spokenAnnouncement: spokenText,
      isSensitive,
      sensitiveCategory: isSensitive ? sensitiveCheck.category : undefined,
      previewText: pendingMsg.previewText,
      pendingEvent: pendingMsg,
    };
  }

  /**
   * Get currently active pending event
   */
  public getPendingEvent(): AndroidPendingEvent | null {
    return this.pendingEvent;
  }

  public getPendingQueue(): AndroidPendingEvent[] {
    return [...this.pendingEventQueue];
  }

  public clearPendingEvent(): void {
    this.pendingEvent = null;
    this.pendingEventQueue.shift();
    if (this.pendingEventQueue.length > 0) {
      this.pendingEvent = this.pendingEventQueue[0];
    }
    this.notifyListeners(this.pendingEvent);
  }

  /**
   * Check if speech or command is an explicit owner approval
   */
  public evaluateOwnerApproval(
    phrase: string
  ): {
    decision: 'APPROVE' | 'REJECT' | 'AMBIGUOUS' | 'NONE';
    targetType: 'CALL' | 'MESSAGE' | 'NONE';
    matchedPhrase: string;
  } {
    const clean = phrase.trim().toLowerCase();
    const current = this.pendingEvent;

    if (!current) {
      return { decision: 'AMBIGUOUS', targetType: 'NONE', matchedPhrase: clean };
    }

    const norm = clean.replace(/[,\.!?।\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const normHindi = norm.replace(/\u0901/g, '\u0902');

    const matchesKeyword = (phrase: string, kw: string): boolean => {
      const pNorm = phrase.toLowerCase().trim();
      const kNorm = kw.toLowerCase().trim();
      if (pNorm === kNorm) return true;

      // For ASCII / Latin keywords (e.g. 'no', 'yes', 'cancel', 'reply')
      if (/^[a-z0-9]+$/i.test(kNorm)) {
        const regex = new RegExp(`\\b${kNorm}\\b`, 'i');
        return regex.test(pNorm);
      }

      // For Devanagari Hindi phrases: match whole tokens only. Loose prefix
      // matching is unsafe here because verb stems appear inside negated
      // phrases ("उठाओ" inside "मत उठाओ"), which would read a refusal as consent.
      const tokens = pNorm.split(/\s+/);
      if (tokens.includes(kNorm)) return true;
      if (kNorm.includes(' ')) {
        return pNorm.includes(kNorm);
      }
      return false;
    };

    // Call approvals. 'उठा' is deliberately excluded: it is a verb stem that
    // also occurs inside refusals ("मत उठा"), so it is ambiguous on its own.
    const callApprovalKeywords = ['हाँ', 'हां', 'जी', 'answer', 'yes', 'कॉल उठा', 'फोन उठा', 'उठा लो'];
    const callRejectKeywords = ['नहीं', 'नही', 'मत', 'काट', 'रहने', 'cancel', 'no', 'decline', 'reject'];

    // Message approvals
    const msgApprovalKeywords = ['हाँ', 'हां', 'जी', 'जवाब', 'भेज', 'रिप्लाई', 'reply', 'send', 'yes'];
    const msgRejectKeywords = ['नहीं', 'नही', 'मत', 'रहने', 'cancel', 'no', 'dismiss'];

    const keywordMatrix = current.type === 'CALL'
      ? { approve: callApprovalKeywords, reject: callRejectKeywords }
      : current.type === 'MESSAGE'
      ? { approve: msgApprovalKeywords, reject: msgRejectKeywords }
      : null;

    if (keywordMatrix) {
      const matches = (p: string) => {
        const normP = p.replace(/\u0901/g, '\u0902');
        return matchesKeyword(normHindi, normP);
      };

      // Negation takes precedence. A single spoken phrase must never satisfy the
      // Level-4 human approval gate by contradicting itself: "नहीं उठाओ" is a
      // refusal, not consent, even though it also contains the verb stem "उठा".
      if (keywordMatrix.reject.some(matches)) {
        return { decision: 'REJECT', targetType: current.type, matchedPhrase: clean };
      }
      if (keywordMatrix.approve.some(matches)) {
        return { decision: 'APPROVE', targetType: current.type, matchedPhrase: clean };
      }
    }

    return { decision: 'NONE', targetType: 'NONE', matchedPhrase: clean };
  }

  /**
   * Execute Approved Call Answering
   */
  public executeCallAnswer(): {
    success: boolean;
    status: 'ANSWER_DISPATCHED' | 'ROLE_REQUIRED' | 'CALL_ANSWER_UNSUPPORTED' | 'BLOCKED_EMERGENCY_STOP' | 'CALL_NOT_FOUND' | 'MOBILE_NOT_CONNECTED';
    messageEn: string;
    messageHi: string;
  } {
    if (this.status === 'MOBILE_NOT_CONNECTED' || !this.capabilities) {
      return {
        success: false,
        status: 'MOBILE_NOT_CONNECTED',
        messageEn: 'No Android device connected to bridge.',
        messageHi: 'ब्रिज से कोई Android डिवाइस कनेक्ट नहीं है।',
      };
    }

    if (this.isEmergencyStopActive) {
      this.recordAudit({
        eventType: 'ACTION_DENIED',
        application: 'TelecomManager',
        actionRequested: 'Answer Call',
        permissionState: this.permissions.call_answer,
        authorizationState: 'BLOCKED_EMERGENCY_STOP',
        result: 'BLOCKED_EMERGENCY_STOP',
        notes: 'Call answer blocked because Emergency Stop is active',
      });
      return {
        success: false,
        status: 'BLOCKED_EMERGENCY_STOP',
        messageEn: 'Call answering blocked by Global Kill Switch.',
        messageHi: 'ग्लोबल किल स्विच सक्रिय होने के कारण कॉल उठाना अवरुद्ध है।',
      };
    }

    const current = this.pendingEvent;
    if (!current || current.type !== 'CALL') {
      return {
        success: false,
        status: 'CALL_NOT_FOUND',
        messageEn: 'No pending call found to answer.',
        messageHi: 'उठाने के लिए कोई पेंडिंग कॉल उपलब्ध नहीं है।',
      };
    }

    const capability = this.evaluateCallAnswerSupport();
    if (!capability.supported) {
      this.recordAudit({
        eventType: 'CAPABILITY_UNAVAILABLE',
        application: 'TelecomManager',
        actionRequested: 'Answer Call',
        permissionState: this.permissions.call_answer,
        authorizationState: 'PERMISSION_MISSING',
        result: capability.requiresRole ? 'ROLE_REQUIRED' : 'UNSUPPORTED',
        notes: capability.reason,
      });

      return {
        success: false,
        status: capability.requiresRole ? 'ROLE_REQUIRED' : 'CALL_ANSWER_UNSUPPORTED',
        messageEn: capability.reason,
        messageHi: capability.hindiNotice,
      };
    }

    current.status = 'APPROVED';
    this.clearPendingEvent();

    // The server has authorized the answer, but the phone has not confirmed it.
    // We report DISPATCHED here; only the device's ACTION_RESULT can upgrade this
    // to VERIFIED via confirmCallAnswer().
    this.recordAudit({
      eventType: 'CALL_ANSWERED',
      application: 'TelecomManager',
      actionRequested: 'Answer Call',
      permissionState: 'GRANTED',
      authorizationState: 'HUMAN_EXPLICIT_APPROVAL',
      result: 'SUCCESS',
      notes: `Answer authorized for call ${current.callId}; awaiting device confirmation`,
    });

    this.lastReceipt = buildReceipt({
      action: 'ANSWER_CALL',
      target: current.senderNumber || current.sender,
      outcome: 'DISPATCHED',
      detailEn: 'Call answer authorized and handed to the Android device. Awaiting device confirmation.',
      detailHi: 'कॉल उठाने की अनुमति दे दी गई है; डिवाइस की पुष्टि की प्रतीक्षा है।',
      dispatchedAt: new Date().toISOString(),
      dispatchId: current.callId,
    });

    return {
      success: false,
      status: 'ANSWER_DISPATCHED',
      messageEn: 'Call answer authorized and dispatched to the Android device; confirmation pending.',
      messageHi: 'कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है; पुष्टि बाकी है।',
    };
  }

  /**
   * Records the device's own confirmation that a call was answered.
   * This is the ONLY path that can produce a verified call-answer result.
   */
  public confirmCallAnswer(callId: string | undefined, deviceConfirmed: boolean): ExecutionReceipt {
    if (!deviceConfirmed) {
      this.lastReceipt = buildReceipt({
        action: 'ANSWER_CALL',
        target: callId || 'unknown call',
        outcome: 'FAILED',
        detailEn: 'Android device reported that the call was not answered.',
        detailHi: 'डिवाइस ने बताया कि कॉल नहीं उठाई गई।',
        failureReason: 'DEVICE_REPORTED_NOT_ANSWERED',
      });
      return this.lastReceipt;
    }

    this.lastReceipt = buildReceipt({
      action: 'ANSWER_CALL',
      target: callId || 'unknown call',
      outcome: 'VERIFIED',
      detailEn: 'Android device confirmed the call is connected.',
      detailHi: 'Android डिवाइस ने पुष्टि कर दी कि कॉल जुड़ गई है।',
      evidence: makeEvidence('device_ack', 'Device call-state confirmation (OFFHOOK)', { ref: callId }),
    });
    return this.lastReceipt;
  }

  /** The most recent truthful receipt produced by this engine, if any. */
  public getLastReceipt(): ExecutionReceipt | null {
    return this.lastReceipt;
  }

  /**
   * Execute Approved Message Reply
   */
  public executeMessageReply(replyContent: string): {
    success: boolean;
    status:
      | 'REPLY_CONFIRMED'
      | 'REPLY_DISPATCHED'
      | 'REPLY_UNAVAILABLE'
      | 'BLOCKED_EMERGENCY_STOP'
      | 'AUTHORIZATION_REQUIRED'
      | 'MOBILE_NOT_CONNECTED';
    actionType: 'INLINE_REPLY' | 'OPEN_APP' | 'NONE';
    messageEn: string;
    messageHi: string;
  } {
    if (this.status === 'MOBILE_NOT_CONNECTED' || !this.capabilities) {
      return {
        success: false,
        status: 'MOBILE_NOT_CONNECTED',
        actionType: 'NONE',
        messageEn: 'No Android device connected to bridge.',
        messageHi: 'ब्रिज से कोई Android डिवाइस कनेक्ट नहीं है।',
      };
    }

    if (this.isEmergencyStopActive) {
      this.recordAudit({
        eventType: 'ACTION_DENIED',
        application: 'NotificationManager',
        actionRequested: 'Message Reply',
        permissionState: this.permissions.message_reply,
        authorizationState: 'BLOCKED_EMERGENCY_STOP',
        result: 'BLOCKED_EMERGENCY_STOP',
        notes: 'Reply blocked by Global Kill Switch',
      });
      return {
        success: false,
        status: 'BLOCKED_EMERGENCY_STOP',
        actionType: 'NONE',
        messageEn: 'Message reply blocked by Global Kill Switch.',
        messageHi: 'ग्लोबल किल स्विच सक्रिय होने के कारण संदेश उत्तर अवरुद्ध है।',
      };
    }

    const current = this.pendingEvent;
    if (!current || current.type !== 'MESSAGE') {
      return {
        success: false,
        status: 'REPLY_UNAVAILABLE',
        actionType: 'NONE',
        messageEn: 'No pending message awaiting reply.',
        messageHi: 'उत्तर देने के लिए कोई पेंडिंग संदेश नहीं मिला।',
      };
    }

    // If notification has inline reply action supported
    if (current.hasInlineReply && this.capabilities?.canInlineReply) {
      current.status = 'DISPATCHED';
      this.clearPendingEvent();

      // The reply text left the server. Whether WhatsApp/SMS actually delivered it
      // is the device's business — we report DISPATCHED until the device confirms.
      this.recordAudit({
        eventType: 'REPLY_SENT',
        application: current.appName,
        actionRequested: 'Inline Notification Reply',
        permissionState: 'GRANTED',
        authorizationState: 'HUMAN_EXPLICIT_APPROVAL',
        result: 'SUCCESS',
        notes: `Inline reply handed to ${current.sender} via RemoteInput; awaiting device confirmation [Content Protected]`,
      });

      this.lastReceipt = buildReceipt({
        action: 'SEND_REPLY',
        target: `${current.sender} on ${current.appName}`,
        outcome: 'DISPATCHED',
        detailEn: `Reply handed to ${current.appName} through the notification RemoteInput action. Awaiting the device's own delivery confirmation.`,
        detailHi: `${current.appName} को उत्तर भेज दिया गया है; डिवाइस की पुष्टि बाकी है।`,
        dispatchedAt: new Date().toISOString(),
        dispatchId: current.id,
      });

      return {
        success: false,
        status: 'REPLY_DISPATCHED',
        actionType: 'INLINE_REPLY',
        messageEn: `Reply handed to ${current.appName} for ${current.sender}. Delivery is not yet confirmed by the device.`,
        messageHi: `उत्तर ${current.sender} को भेजने के लिए ${current.appName} को दिया गया है; डिलीवरी की पुष्टि बाकी है।`,
      };
    }

    // Fallback: Open Messaging Application for the human to send it themselves
    if (this.capabilities?.canOpenApp) {
      current.status = 'DISPATCHED';
      this.clearPendingEvent();

      this.recordAudit({
        eventType: 'REPLY_SENT',
        application: current.appName,
        actionRequested: 'Open Messaging App',
        permissionState: 'GRANTED',
        authorizationState: 'HUMAN_EXPLICIT_APPROVAL',
        result: 'SUCCESS',
        notes: `Opened ${current.appName} for manual dispatch; message was NOT sent by JARVIS`,
      });

      this.lastReceipt = buildReceipt({
        action: 'SEND_REPLY',
        target: `${current.sender} on ${current.appName}`,
        outcome: 'DISPATCHED',
        detailEn: `${current.appName} was opened with the reply prepared. JARVIS did not send it — you must press send. The message has NOT been delivered.`,
        detailHi: `${current.appName} खोल दिया गया है। JARVIS ने संदेश नहीं भेजा — आपको भेजना होगा। संदेश अभी नहीं गया है।`,
        dispatchedAt: new Date().toISOString(),
        dispatchId: current.id,
      });

      return {
        success: false,
        status: 'REPLY_DISPATCHED',
        actionType: 'OPEN_APP',
        messageEn: `${current.appName} opened with the response prepared. The message has NOT been sent — you must confirm it in the app.`,
        messageHi: `${current.appName} खोल दिया गया है। संदेश अभी नहीं भेजा गया — आपको ऐप में भेजना होगा।`,
      };
    }

    return {
      success: false,
      status: 'REPLY_UNAVAILABLE',
      actionType: 'NONE',
      messageEn: 'Device does not support programmatic reply or app opening.',
      messageHi: 'इस डिवाइस पर ऑटोमेटिक रिप्लाई अथवा ऐप खोलने की सुविधा उपलब्ध नहीं है।',
    };
  }

  public recordAudit(log: Omit<AndroidAuditLog, 'id' | 'timestamp'>): void {
    const entry: AndroidAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...log,
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 200) {
      this.auditLogs.pop();
    }
    this.saveState();
  }

  public getAuditLogs(): AndroidAuditLog[] {
    return [...this.auditLogs];
  }

  public clearAuditLogs(): void {
    this.auditLogs = [];
    this.saveState();
  }
}

export const androidBridgeEngine = new AndroidBridgeManager();
