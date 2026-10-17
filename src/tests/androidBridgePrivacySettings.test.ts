import { describe, it, expect, beforeEach } from 'vitest';
import {
  AndroidBridgeManager,
  notificationDeduplicator,
} from '../utils/androidBridgeEngine';
import { AndroidDeviceCapabilities } from '../types/mobileBridge';

const CAPS: AndroidDeviceCapabilities = {
  deviceId: 'privacy_test_phone',
  deviceName: 'Privacy Test Phone',
  model: 'Pixel 8 Pro',
  osVersion: 'Android 14',
  bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0',
  canDetectCalls: true,
  canAnswerCalls: true,
  telecomRoleDialer: true,
  answerCallsPermission: true,
  canReadNotifications: true,
  canInlineReply: true,
  canOpenApp: true,
  canLookupContacts: true,
  isSimulation: false,
};

const HEALTH_NOTIFICATION = {
  notificationId: 'notif_health_1',
  appName: 'Apollo Health',
  packageName: 'com.apollo.health',
  title: 'Pathology Lab',
  text: 'Your medical report is ready',
  sender: 'Apollo',
  category: 'SMS' as const,
  timestamp: new Date().toISOString(),
  hasInlineReply: false,
};

const OTP_NOTIFICATION = {
  notificationId: 'notif_otp_1',
  appName: 'Bank Alerts',
  packageName: 'com.example.bank',
  title: 'Verification',
  text: 'Your OTP is 4821',
  sender: 'Bank',
  category: 'SMS' as const,
  timestamp: new Date().toISOString(),
  hasInlineReply: false,
};

describe('Android Bridge — privacy settings are actually enforced', () => {
  let engine: AndroidBridgeManager;

  beforeEach(() => {
    notificationDeduplicator.clear();
    engine = new AndroidBridgeManager();
    engine.connectDevice(CAPS);
  });

  it('blocks health-category notifications while blockHealthNotificationsByDefault is enabled', () => {
    expect(engine.getSettings().blockHealthNotificationsByDefault).toBe(true);

    const result = engine.handleIncomingNotification(HEALTH_NOTIFICATION);

    expect(result.announced).toBe(false);
    expect(result.blockedReason).toBe('HEALTH_BLOCKED');
    expect(engine.getPendingEvent()).toBeNull();
    expect(engine.getPendingQueue()).toHaveLength(0);
  });

  it('announces health notifications only after the owner disables the block flag', () => {
    engine.updateSettings({ blockHealthNotificationsByDefault: false });

    const result = engine.handleIncomingNotification(HEALTH_NOTIFICATION);

    expect(result.announced).toBe(true);
    expect(result.isSensitive).toBe(true);
    expect(result.sensitiveCategory).toBe('HEALTH');
    expect(engine.getPendingEvent()).not.toBeNull();
  });

  it('redacts sensitive content unconditionally', () => {
    const result = engine.handleIncomingNotification(OTP_NOTIFICATION);

    expect(result.announced).toBe(true);
    expect(result.isSensitive).toBe(true);
    expect(result.sensitiveCategory).toBe('OTP');
    expect(result.pendingEvent?.rawText).toBeUndefined();
    expect(result.pendingEvent?.isSensitive).toBe(true);
    expect(result.spokenText).not.toContain('4821');
  });

  it('cannot be switched off by a legacy persisted sensitiveFilteringEnabled=false', () => {
    // Older builds persisted this key and it used to disable the guard. It is
    // no longer read, so a stored value cannot silently expose OTP/bank bodies.
    const legacySettings = { sensitiveFilteringEnabled: false } as unknown as Parameters<
      typeof engine.updateSettings
    >[0];
    engine.updateSettings(legacySettings);

    const result = engine.handleIncomingNotification(OTP_NOTIFICATION);

    expect(result.isSensitive).toBe(true);
    expect(result.sensitiveCategory).toBe('OTP');
    expect(result.pendingEvent?.rawText).toBeUndefined();
    expect(result.spokenText).not.toContain('4821');
  });

  it('records a SENSITIVE_REDACTION audit entry and never leaks the raw body', () => {
    engine.handleIncomingNotification(OTP_NOTIFICATION);

    const redactionLogs = engine.getAuditLogs().filter((l) => l.eventType === 'SENSITIVE_REDACTION');
    expect(redactionLogs).toHaveLength(1);

    const serialized = JSON.stringify(engine.getAuditLogs());
    expect(serialized).not.toContain('4821');
  });
});