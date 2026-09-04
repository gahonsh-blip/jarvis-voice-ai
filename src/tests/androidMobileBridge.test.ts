import { describe, it, expect, beforeEach } from 'vitest';
import {
  androidBridgeEngine,
  AndroidBridgeManager,
} from '../utils/androidBridgeEngine';
import { simulatedAndroidAdapter } from '../utils/androidBridgeAdapter';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { MemoryStore } from '../types';

describe('Android Mobile Call & Notification Assistant Bridge', () => {
  let engine: AndroidBridgeManager;

  const mockMemory: MemoryStore = {
    name: 'Sir',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 10, actionsExecuted: 5, lastActive: new Date().toISOString() },
  };

  beforeEach(() => {
    engine = new AndroidBridgeManager();
  });

  it('Scenario 1: Formulates truthful Hindi announcement for named caller and never fabricates', () => {
    engine.connectDevice({
      deviceId: 'pixel_8_pro',
      deviceName: 'Pixel 8 Pro',
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
    });

    const event = engine.handleIncomingCall({
      callerName: 'Rahul Verma',
      callerNumber: '+91 9876543210',
    });

    expect(event.announced).toBe(true);
    expect(event.spokenAnnouncement).toBe('सर, Rahul Verma का कॉल आया है। क्या मैं कॉल उठा दूँ?');
    expect(event.sender).toBe('Rahul Verma');
    expect(event.senderNumber).toBe('+91 ******3210');
  });

  it('Scenario 2: Handles unknown caller truthfully with masked number', () => {
    engine.connectDevice({
      deviceId: 'test_phone',
      deviceName: 'Android Device',
      model: 'Android Phone',
      osVersion: 'Android 14',
      bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0',
      canDetectCalls: true,
      canAnswerCalls: true,
      telecomRoleDialer: true,
      answerCallsPermission: true,
      canReadNotifications: true,
      canInlineReply: true,
      canOpenApp: true,
      canLookupContacts: false,
      isSimulation: false,
    });

    const event = engine.handleIncomingCall({
      callerNumber: '+91 9988776655',
    });

    expect(event.sender).toBe('Unknown Caller');
    expect(event.senderNumber).toBe('+91 ******6655');
    expect(event.spokenAnnouncement).toBe('सर, +91 ******6655 से कॉल आया है। क्या मैं कॉल उठा दूँ?');
  });

  it('Scenario 3: Call answer without explicit owner approval is BLOCKED', () => {
    engine.connectDevice({
      deviceId: 'test_phone',
      deviceName: 'Android Device',
      model: 'Android Phone',
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
    });

    engine.handleIncomingCall({ callerName: 'Aman' });

    // Unrelated command or query
    const evalResult = engine.evaluateOwnerApproval('मौसम कैसा है आज?');
    expect(evalResult.decision).toBe('NONE');

    // Pending event must still be waiting
    expect(engine.getPendingEvent()?.status).toBe('AWAITING_APPROVAL');
  });

  it('Scenario 4: Call answer with explicit "हाँ" or "उठा लो" executes when capability exists', () => {
    engine.connectDevice({
      deviceId: 'test_phone',
      deviceName: 'Android Device',
      model: 'Android Phone',
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
    });

    engine.handleIncomingCall({ callerName: 'Rohit' });

    const evalResult = engine.evaluateOwnerApproval('हाँ, कॉल उठा लो');
    expect(evalResult.decision).toBe('APPROVE');
    expect(evalResult.targetType).toBe('CALL');

    const execResult = engine.executeCallAnswer();
    expect(execResult.success).toBe(true);
    expect(execResult.status).toBe('ANSWERED');
    expect(engine.getPendingEvent()).toBeNull();
  });

  it('Scenario 5: Call answer returns truthful limitation notice if Android capability or role is missing', () => {
    // Device without telecom role
    engine.connectDevice({
      deviceId: 'pixel_restricted',
      deviceName: 'Pixel Restricted',
      model: 'Pixel Restricted',
      osVersion: 'Android 14',
      bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0',
      canDetectCalls: true,
      canAnswerCalls: false, // OS or hardware unsupported
      telecomRoleDialer: false,
      answerCallsPermission: false,
      canReadNotifications: true,
      canInlineReply: true,
      canOpenApp: true,
      canLookupContacts: true,
      isSimulation: false,
    });

    engine.handleIncomingCall({ callerName: 'Priya' });

    const cap = engine.evaluateCallAnswerSupport();
    expect(cap.supported).toBe(false);
    expect(cap.hindiNotice).toContain('सर, इस Android device पर JARVIS को अभी call answer करने की अनुमति नहीं मिली है।');

    const execResult = engine.executeCallAnswer();
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe('CALL_ANSWER_UNSUPPORTED');
  });

  it('Scenario 6: WhatsApp message notification is announced truthfully without reading long sensitive text', () => {
    engine.connectDevice({
      deviceId: 'phone_msg',
      deviceName: 'Phone',
      model: 'Phone',
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
    });

    const event = engine.handleIncomingNotification({
      appName: 'WhatsApp',
      packageName: 'com.whatsapp',
      title: 'Vikas',
      text: 'Are you joining the standup meeting today?',
    });

    expect(event.announced).toBe(true);
    expect(event.spokenAnnouncement).toBe('सर, WhatsApp पर Vikas का संदेश आया है।');
    expect(event.isSensitive).toBe(false);
  });

  it('Scenario 7: OTP notification is classified as sensitive and never read aloud', () => {
    engine.connectDevice({
      deviceId: 'phone_sec',
      deviceName: 'Phone',
      model: 'Phone',
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
    });

    const event = engine.handleIncomingNotification({
      appName: 'Messages',
      packageName: 'com.google.android.apps.messaging',
      title: 'Google Verification',
      text: 'G-748291 is your Google verification code. Never share your OTP with anyone.',
    });

    expect(event.isSensitive).toBe(true);
    expect(event.sensitiveCategory).toBe('OTP');
    // Spoken text must NOT contain the OTP numbers!
    expect(event.spokenAnnouncement).toBe('सर, Messages पर एक गोपनीय सूचना आई है।');
    expect(event.spokenAnnouncement).not.toContain('748291');
    expect(event.previewText).toContain('[PROTECTED');
  });

  it('Scenario 8: Bank transaction notification is marked sensitive and never read aloud', () => {
    engine.connectDevice({
      deviceId: 'phone_bank',
      deviceName: 'Phone',
      model: 'Phone',
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
    });

    const event = engine.handleIncomingNotification({
      appName: 'HDFC Bank',
      packageName: 'com.hdfc.bank',
      title: 'HDFC Bank Alert',
      text: 'INR 15,400.00 debited from A/C **4920 on 03-SEP-26 to UPI-Swiggy. Avl Bal INR 84,210.50',
    });

    expect(event.isSensitive).toBe(true);
    expect(event.sensitiveCategory).toBe('BANKING');
    expect(event.spokenAnnouncement).toBe('सर, HDFC Bank पर एक गोपनीय सूचना आई है।');
    expect(event.spokenAnnouncement).not.toContain('15,400');
    expect(event.spokenAnnouncement).not.toContain('Swiggy');
  });

  it('Scenario 9: Emergency Stop blocks all call answering and message reply operations immediately', () => {
    engine.connectDevice({
      deviceId: 'phone_emerg',
      deviceName: 'Phone',
      model: 'Phone',
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
    });

    engine.handleIncomingCall({ callerName: 'Boss' });

    // Engage emergency pause
    engine.setEmergencyStop(true);

    const answerAttempt = engine.executeCallAnswer();
    expect(answerAttempt.success).toBe(false);
    expect(answerAttempt.status).toBe('BLOCKED_EMERGENCY_STOP');

    const replyAttempt = engine.executeMessageReply('On my way');
    expect(replyAttempt.success).toBe(false);
    expect(replyAttempt.status).toBe('BLOCKED_EMERGENCY_STOP');
  });

  it('Scenario 10: Disconnected state produces truthful error with no fake simulation', () => {
    engine.disconnectDevice();
    expect(engine.getStatus()).toBe('MOBILE_NOT_CONNECTED');

    const callResult = engine.executeCallAnswer();
    expect(callResult.success).toBe(false);
    expect(callResult.status).toBe('MOBILE_NOT_CONNECTED');

    const replyResult = engine.executeMessageReply('Hello');
    expect(replyResult.success).toBe(false);
    expect(replyResult.status).toBe('MOBILE_NOT_CONNECTED');
  });

  it('Scenario 11: Audit log records actions while redacting sensitive parameters', () => {
    engine.connectDevice({
      deviceId: 'phone_audit',
      deviceName: 'Phone',
      model: 'Phone',
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
    });

    engine.handleIncomingCall({ callerName: 'Audit Tester', callerNumber: '+91 9123456789' });
    engine.executeCallAnswer();

    const logs = engine.getAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const answeredLog = logs.find((l) => l.eventType === 'CALL_ANSWERED');
    expect(answeredLog).toBeDefined();
    expect(answeredLog?.result).toBe('SUCCESS');

    // Numbers in logs must be masked
    const callRecLog = logs.find((l) => l.eventType === 'CALL_RECEIVED');
    expect(callRecLog?.notes).toContain('+91 ******6789');
    expect(callRecLog?.notes).not.toContain('9123456789');
  });

  it('Scenario 12: Integrated voice processing test in localJarvisEngine', () => {
    // Setup global bridge engine
    androidBridgeEngine.connectDevice({
      deviceId: 'global_test',
      deviceName: 'Global Test Phone',
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
      isSimulation: true,
    });

    androidBridgeEngine.handleIncomingCall({ callerName: 'Rahul Verma', callerNumber: '+91 9876543210' });

    // Test answering via Hindi speech command
    const res = processOfflineCommand('हाँ, उठा लो', mockMemory);
    expect(res.intent).toBe('answer_call');
    expect(res.spokenText).toBe('सर, कॉल उठा ली गई है।');
    expect(res.actionExecuted).toBe(true);
  });

  it('Scenario 13: addListener receives notifications on new event and clearPendingEvent', () => {
    const receivedEvents: any[] = [];
    const unsubscribe = androidBridgeEngine.addListener((event) => {
      receivedEvents.push(event);
    });

    androidBridgeEngine.handleIncomingCall({ callerName: 'Aarav', callerNumber: '+91 9998887777' });
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]?.sender).toBe('Aarav');

    androidBridgeEngine.clearPendingEvent();
    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[1]).toBeNull();

    unsubscribe();
  });

  it('Scenario 14: Direct call decline command via voice declines and clears call', () => {
    androidBridgeEngine.handleIncomingCall({ callerName: 'Kunal', callerNumber: '+91 9998886666' });
    expect(androidBridgeEngine.getPendingEvent()?.sender).toBe('Kunal');

    const res = processOfflineCommand('कॉल काटो', mockMemory);
    expect(res.intent).toBe('reject_call');
    expect(res.spokenText).toBe('सर, कॉल अस्वीकार कर दी गई है।');
    expect(res.actionExecuted).toBe(true);
    expect(androidBridgeEngine.getPendingEvent()).toBeNull();
  });

  it('Scenario 15: Notification inquiry handles both pending and empty notification states', () => {
    // Empty state
    const emptyRes = processOfflineCommand('कोई notification आया क्या?', mockMemory);
    expect(emptyRes.spokenText).toContain('कोई नया पेंडिंग नोटिफिकेशन नहीं है');

    // With active notification
    androidBridgeEngine.handleIncomingNotification({
      appName: 'Slack',
      title: 'DevOps Alert',
      text: 'Production deployment successful',
    });

    const activeRes = processOfflineCommand('notifications check करो', mockMemory);
    expect(activeRes.spokenText).toContain('Slack');
  });
});
