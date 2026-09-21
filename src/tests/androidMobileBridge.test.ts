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

    // The answer is dispatched, not claimed as done: the device has not confirmed.
    const execResult = engine.executeCallAnswer();
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe('ANSWER_DISPATCHED');
    expect(execResult.messageEn).toContain('confirmation pending');
    expect(engine.getPendingEvent()).toBeNull();

    const receipt = engine.getLastReceipt();
    expect(receipt?.outcome).toBe('DISPATCHED');
    expect(receipt?.verified).toBe(false);

    // Only the device's own confirmation may promote this to VERIFIED.
    const confirmed = engine.confirmCallAnswer('call_1', true);
    expect(confirmed.outcome).toBe('VERIFIED');
    expect(confirmed.verified).toBe(true);
    expect(confirmed.evidence?.kind).toBe('device_ack');
  });

  it('Scenario 4b: Device-reported answer failure is never converted into success', () => {
    engine.connectDevice({
      deviceId: 'test_phone_fail',
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
    engine.executeCallAnswer();

    const failed = engine.confirmCallAnswer('call_1', false);
    expect(failed.outcome).toBe('FAILED');
    expect(failed.verified).toBe(false);
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
    // The reply must not claim the call was answered — only that it was dispatched.
    expect(res.spokenText).toBe(
      'सर, कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है। डिवाइस की पुष्टि आते ही बताऊँगा।'
    );
    expect(res.spokenText).not.toContain('उठा ली गई');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.title).toBe('Call Answer Dispatched (unconfirmed)');
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

  it('Scenario 16: Required Android permissions matrix (Notification, Call, Contacts, Reply) can be queried and updated', () => {
    // Check initial permissions retrieval
    const initialPerms = androidBridgeEngine.getPermissions();
    expect(initialPerms).toHaveProperty('notification_access');
    expect(initialPerms).toHaveProperty('call_detection');
    expect(initialPerms).toHaveProperty('contacts_lookup');
    expect(initialPerms).toHaveProperty('message_reply');

    // Update Notification
    androidBridgeEngine.updatePermission('notification_access', 'DENIED');
    expect(androidBridgeEngine.getPermissions().notification_access).toBe('DENIED');
    androidBridgeEngine.updatePermission('notification_access', 'GRANTED');
    expect(androidBridgeEngine.getPermissions().notification_access).toBe('GRANTED');

    // Update Call
    androidBridgeEngine.updatePermission('call_detection', 'DENIED');
    androidBridgeEngine.updatePermission('call_answer', 'DENIED');
    expect(androidBridgeEngine.getPermissions().call_detection).toBe('DENIED');
    androidBridgeEngine.updatePermission('call_detection', 'GRANTED');
    androidBridgeEngine.updatePermission('call_answer', 'GRANTED');
    expect(androidBridgeEngine.getPermissions().call_detection).toBe('GRANTED');

    // Update Contacts
    androidBridgeEngine.updatePermission('contacts_lookup', 'DENIED');
    expect(androidBridgeEngine.getPermissions().contacts_lookup).toBe('DENIED');
    androidBridgeEngine.updatePermission('contacts_lookup', 'GRANTED');
    expect(androidBridgeEngine.getPermissions().contacts_lookup).toBe('GRANTED');

    // Update Reply
    androidBridgeEngine.updatePermission('message_reply', 'DENIED');
    expect(androidBridgeEngine.getPermissions().message_reply).toBe('DENIED');
    androidBridgeEngine.updatePermission('message_reply', 'GRANTED');
    expect(androidBridgeEngine.getPermissions().message_reply).toBe('GRANTED');
  });

  describe('Owner approval parsing — negation must never grant consent', () => {
    const capabilities = {
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
    };

    beforeEach(() => {
      engine.connectDevice(capabilities);
      engine.handleIncomingCall({
        callerName: 'Rahul Verma',
        callerNumber: '+91 9876543210',
      });
    });

    // Regression: these phrases previously parsed as APPROVE. The Devanagari
    // verb stem "उठा" occurs inside refusals such as "नहीं उठा", and the old
    // matcher accepted it as an approval keyword — satisfying the Level-4 human
    // authorization gate with a refusal.
    it.each([
      'नहीं उठाओ',
      'कॉल मत उठाओ',
      'नहीं उठा',
      'मत उठा',
      'कॉल नहीं उठाना',
    ])('treats call refusal "%s" as REJECT, never APPROVE', (phrase) => {
      const result = engine.evaluateOwnerApproval(phrase);
      expect(result.decision).toBe('REJECT');
      expect(result.targetType).toBe('CALL');
    });

    it.each(['हाँ', 'हाँ, कॉल उठा लो', 'उठा लो', 'कॉल उठा', 'answer', 'yes'])(
      'still treats genuine approval "%s" as APPROVE',
      (phrase) => {
        expect(engine.evaluateOwnerApproval(phrase).decision).toBe('APPROVE');
      }
    );

    it.each(['नहीं', 'नहीं, मत करो', 'cancel', 'no', 'काट दो'])(
      'still treats genuine rejection "%s" as REJECT',
      (phrase) => {
        expect(engine.evaluateOwnerApproval(phrase).decision).toBe('REJECT');
      }
    );

    it('treats message negation as REJECT and message consent as APPROVE', () => {
      const msgEngine = new AndroidBridgeManager();
      msgEngine.connectDevice(capabilities);
      msgEngine.handleIncomingNotification({
        packageName: 'com.whatsapp',
        appName: 'WhatsApp',
        title: 'Rahul Verma',
        text: 'Kal milte hain',
      });

      expect(msgEngine.evaluateOwnerApproval('मत भेजो').decision).toBe('REJECT');
      expect(msgEngine.evaluateOwnerApproval('नहीं भेजना').decision).toBe('REJECT');
      expect(msgEngine.evaluateOwnerApproval('भेज दो').decision).toBe('APPROVE');
    });

    it('leaves the call awaiting approval when the owner said not to answer', () => {
      const evalResult = engine.evaluateOwnerApproval('कॉल मत उठाओ');
      expect(evalResult.decision).toBe('REJECT');
      expect(engine.getPendingEvent()?.status).toBe('AWAITING_APPROVAL');
      expect(engine.getPendingEvent()?.type).toBe('CALL');
    });
  });

  it('Scenario 17: openApplication gates truthfully — disconnected, emergency stop, unsupported, denied', () => {
    const caps = {
      deviceId: 'phone_open_app',
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
    };

    // 1. Disconnected bridge must refuse and audit the refusal
    const disconnected = engine.openApplication('com.whatsapp');
    expect(disconnected.success).toBe(false);
    expect(disconnected.blockedReason).toBe('MOBILE_NOT_CONNECTED');
    expect(engine.getAuditLogs()[0].result).toBe('REJECTED');

    // 2. Emergency stop must block even with a capable device
    engine.connectDevice(caps);
    engine.setEmergencyStop(true);
    const killed = engine.openApplication('com.whatsapp');
    expect(killed.success).toBe(false);
    expect(killed.blockedReason).toBe('BLOCKED_EMERGENCY_STOP');
    expect(engine.getAuditLogs()[0].result).toBe('BLOCKED_EMERGENCY_STOP');
    engine.setEmergencyStop(false);

    // 3. Device without launch capability reports UNSUPPORTED
    engine.connectDevice({ ...caps, canOpenApp: false });
    const unsupported = engine.openApplication('com.whatsapp');
    expect(unsupported.success).toBe(false);
    expect(unsupported.blockedReason).toBe('OPEN_APP_UNSUPPORTED');

    // 4. Privacy-denied app (banking default DENY) must be refused
    engine.connectDevice(caps);
    const denied = engine.openApplication('com.phonepe.app');
    expect(denied.success).toBe(false);
    expect(denied.blockedReason).toBe('APP_DENIED');

    // 5. Gates pass -> dispatched, but the launch itself is never claimed as done
    const dispatched = engine.openApplication('com.whatsapp');
    expect(dispatched.success).toBe(false);
    expect(dispatched.message).toContain('awaiting device confirmation');
    const audit = engine.getAuditLogs()[0];
    expect(audit.eventType).toBe('APP_OPENED');
    expect(audit.result).toBe('UNSUPPORTED');
  });

  it('Scenario 18: Simulated adapter openApp propagates the engine gate instead of hardcoding success', async () => {
    androidBridgeEngine.disconnectDevice();
    const offline = await simulatedAndroidAdapter.openApp('com.whatsapp');
    expect(offline.success).toBe(false);
    expect(offline.message).toContain('[SIMULATION_ONLY]');
    expect(offline.message).toContain('No Android device is connected');

    await simulatedAndroidAdapter.connect();
    const online = await simulatedAndroidAdapter.openApp('com.whatsapp');
    expect(online.success).toBe(false);
    expect(online.message).toContain('awaiting device confirmation');
  });
});
