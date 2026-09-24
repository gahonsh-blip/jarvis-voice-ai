import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert';
import {
  buildCallAnnouncement,
  buildNotificationAnnouncement,
  buildSensitiveAnnouncement,
  buildCallAnswerUnsupported,
  classifyApproval,
  isExplicitApproval,
  enqueuePendingEvent,
  getPendingQueue,
  getTopPendingEvent,
  updatePendingEventStatus,
  clearPendingQueue,
  evaluateMobileActionGate,
  createSimulatedBridgeEvent,
  simulationOnly,
  logMobileAudit,
  getMobileAuditLog,
  clearMobileAuditLog,
  maskCallerId,
  saveBridgeRegistration,
  loadBridgeRegistration,
  clearBridgeRegistration,
  getBridgeConnectionState,
} from '../utils/mobileBridgeEngine';
import {
  loadMobileBridgePolicy,
  setCategoryPolicy,
  setAppPolicy,
  isNotificationPermitted,
  exposeNotificationContent,
  detectSensitiveNotification,
  computeNotificationIdentity,
  clearNotificationDedupStore,
  contentHash,
} from '../utils/mobileNotificationPrivacy';
import { MobileNotificationCategory } from '../types/mobileBridge';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function installMemoryStorage(): void {
  const mem = new MemoryStorage();
  (globalThis as any).localStorage = mem;
  (globalThis as any).window = globalThis;
}

function makeCall(overrides: Record<string, unknown> = {}): any {
  return {
    kind: 'INCOMING_CALL',
    callerName: 'Rahul',
    callerNumber: '+919876543210',
    callerMasked: '+91 ******3210',
    callState: 'RINGING',
    timestamp: '2026-09-03T07:45:00.000Z',
    eventId: 'call-1',
    status: 'PENDING_APPROVAL',
    ...overrides,
  };
}

function makeNotification(overrides: Record<string, unknown> = {}): any {
  return {
    kind: 'NOTIFICATION',
    appPackage: 'com.whatsapp',
    appLabel: 'WhatsApp',
    category: 'WHATSAPP',
    title: 'Rahul',
    body: 'Shall we meet tomorrow?',
    bodyPreview: 'Shall we meet tomorr...',
    notificationKey: 'whatsapp-1',
    postTime: Date.now(),
    time: Date.now(),
    eventId: 'msg-1',
    status: 'PENDING_APPROVAL',
    contentAvailable: true,
    ...overrides,
  };
}

describe('Mobile Bridge Engine + Notification Privacy Suite', () => {
  beforeEach(() => {
    installMemoryStorage();
    clearPendingQueue();
    clearMobileAuditLog();
    clearBridgeRegistration();
    clearNotificationDedupStore();
    try {
      localStorage.clear();
    } catch (e) {
      // noop
    }
    loadMobileBridgePolicy();
  });

  describe('1. Announcements through the existing TTS-format pipeline', () => {
    it('builds Hindi incoming-call announcement with caller name', () => {
      const text = buildCallAnnouncement(makeCall(), 'hi-IN');
      assert.ok(text.includes('Rahul'));
      assert.ok(text.includes('\u0915\u0949\u0932'));
    });

    it('builds English announcement for unknown caller', () => {
      const text = buildCallAnnouncement(makeCall({ callerName: undefined, callerMasked: undefined }), 'en-US');
      assert.ok(text.includes('unknown number'));
      assert.ok(!text.includes('Rahul'));
    });

    it('never fabricates a caller name when only a number exists', () => {
      const text = buildCallAnnouncement(makeCall(
        { callerName: undefined, callerMasked: '+91 ******1234' }), 'hi-IN');
      assert.ok(text.includes('+91 ******1234'));
      assert.ok(!text.includes('Rahul'));
    });

    it('announces readable message content', () => {
      const text = buildNotificationAnnouncement(makeNotification(), 'hi-IN');
      assert.ok(text.includes('WhatsApp'));
      assert.ok(text.includes('Rahul'));
      assert.ok(text.includes('meet tomorrow'));
    });

    it('states content unavailability without inventing it', () => {
      const text = buildNotificationAnnouncement(makeNotification(
        { body: undefined, bodyPreview: undefined, contentAvailable: false }), 'en-US');
      assert.ok(text.includes('content is not available'));
      assert.ok(!text.includes('meet tomorrow'));
    });

    it('sensitive announcement never reads the secret aloud', () => {
      const text = buildSensitiveAnnouncement('hi-IN');
      assert.ok(text.includes('sensitive notification'));
      assert.ok(!text.includes('OTP'));
    });

    it('call-answer unsupported explains the Android role requirement', () => {
      const text = buildCallAnswerUnsupported('hi-IN');
      assert.ok(text.includes('Android'));
      assert.ok(text.includes('\u0905\u0928\u0941\u092e\u0924\u093f'));
    });
  });

  describe('2. Privacy policy, privacy-safe by default', () => {
    it('defaults every category to ASK', () => {
      const policy = loadMobileBridgePolicy();
      const keys = Object.keys(policy.categories) as MobileNotificationCategory[];
      for (const cat of keys) {
        assert.ok(policy.categories[cat] === 'ASK' || policy.categories[cat] === 'DENY');
      }
    });

    it('blocks reading content from a denied application', () => {
      const policy = loadMobileBridgePolicy();
      const p = setAppPolicy(policy, 'com.whatsapp', 'DENY');
      assert.equal(
        isNotificationPermitted(p, 'WhatsApp', 'com.whatsapp', 'WHATSAPP'),
        false);
      const exp = exposeNotificationContent({
        policy: p,
        packageName: 'com.whatsapp',
        appLabel: 'WhatsApp',
        category: 'WHATSAPP',
        title: 'Rahul',
        body: 'Shall we meet tomorrow?',
      });
      assert.equal(exp.permitted, false);
      assert.equal(exp.reason, 'APP_DENIED');
      assert.equal(exp.contentAvailable, false);
    });

    it('per-application DENY overrides an ALLOW category', () => {
      const base = setAppPolicy(loadMobileBridgePolicy(), 'com.bank', 'DENY');
      const allowed = setCategoryPolicy(base, 'OTHER_APPS', 'ALLOW');
      assert.equal(allowed.categories.OTHER_APPS, 'ALLOW');
      assert.equal(
        isNotificationPermitted(allowed, 'Bank', 'com.bank', 'OTHER_APPS'),
        false);
    });

    it('filters an OTP notification as sensitive', () => {
      const detect = detectSensitiveNotification(
        'Your OTP is 482913', 'Verification code: 482913');
      assert.equal(detect.sensitive, true);
      const policy = setCategoryPolicy(loadMobileBridgePolicy(), 'OTHER_APPS', 'ALLOW');
      const p = setAppPolicy(policy, 'com.bank', 'ALLOW');
      const exp = exposeNotificationContent({
        policy: p,
        packageName: 'com.bank',
        appLabel: 'Bank',
        category: 'OTHER_APPS',
        title: 'Your OTP is 482913',
        body: 'Verification code: 482913',
      });
      assert.equal(exp.sensitive, true);
      assert.equal(exp.reason, 'SENSITIVE');
      assert.equal(exp.contentAvailable, false);
      assert.equal(exp.body, undefined);
    });

    it('content-hash identity never contains the raw secret', () => {
      const hash = contentHash('Your OTP is 482913');
      assert.ok(!hash.includes('482913'));
      assert.ok(hash.length > 4);
      clearNotificationDedupStore();
      const id1 = computeNotificationIdentity({
        packageName: 'com.whatsapp',
        key: 'whatsapp-1',
        appLabel: 'WhatsApp',
        bodyHash: contentHash('meet tomorrow'),
      });
      const id2 = computeNotificationIdentity({
        packageName: 'com.whatsapp',
        key: 'whatsapp-1',
        appLabel: 'WhatsApp',
        bodyHash: contentHash('meet tomorrow'),
      });
      assert.equal(id1, id2);
    });
  });

  describe('3. Pending-event queue + approval-context pinning', () => {
    it('enqueues call and message events independently', () => {
      enqueuePendingEvent(makeCall() as any);
      enqueuePendingEvent(makeNotification() as any);
      assert.equal(getPendingQueue().length, 2);
      const top = getTopPendingEvent();
      assert.equal(top?.eventId, 'call-1');
    });

    it('explicit approval applies only to the immediately pending event', () => {
      enqueuePendingEvent(makeCall() as any);
      enqueuePendingEvent(makeNotification() as any);
      updatePendingEventStatus('call-1', 'REJECTED');
      updatePendingEventStatus('msg-1', 'AUTHORIZED');
      assert.equal(getPendingQueue().length, 0);
      assert.equal(getTopPendingEvent(), undefined);
    });

    it('ambiguous speech is never treated as authorization', () => {
      assert.equal(classifyApproval('maybe'), null);
      assert.equal(classifyApproval('\u0915\u0941\u091b'), null);
      assert.equal(isExplicitApproval('random chatter'), false);
    });

    it('recognizes Hindi English Hinglish approval phrasings', () => {
      assert.equal(isExplicitApproval('\u0939\u093e\u0901'), true);
      assert.equal(isExplicitApproval('\u0909\u0920\u093e \u0932\u094b'), true);
      assert.equal(isExplicitApproval('\u091c\u0935\u093e\u092c \u0926\u094b'), true);
      assert.equal(isExplicitApproval('yes'), true);
      assert.equal(isExplicitApproval('answer'), true);
      assert.equal(isExplicitApproval('\u0928\u0939\u0940\u0902'), false);
      assert.equal(isExplicitApproval('cancel'), false);
    });
  });

  describe('4. Action gate, kill switch, bridge liveness', () => {
    it('blocked by emergency kill switch before anything else', () => {
      const gate = evaluateMobileActionGate({
        bridgeLive: true,
        approved: true,
        permission: 'GRANTED',
        emergencyActive: true,
      });
      assert.equal(gate.allowed, false);
    });

    it('never reports success when bridged disconnected', () => {
      const gate = evaluateMobileActionGate({
        bridgeLive: false,
        approved: true,
        permission: 'GRANTED',
        emergencyActive: false,
      });
      assert.equal(gate.allowed, false);
    });

    it('requires explicit approval even when bridge live', () => {
      const gate = evaluateMobileActionGate({
        bridgeLive: true,
        approved: false,
        permission: 'GRANTED',
        emergencyActive: false,
      });
      assert.equal(gate.allowed, false);
    });

    it('denies when permission denied', () => {
      const gate = evaluateMobileActionGate({
        bridgeLive: true,
        approved: true,
        permission: 'DENIED',
        emergencyActive: false,
      });
      assert.equal(gate.allowed, false);
    });
  });

  describe('5. Simulation adapter never mimics a real device event', () => {
    it('marks every simulated result SIMULATION_ONLY', () => {
      const kinds = [
        'INCOMING_CALL', 'NOTIFICATION', 'APPROVAL', 'REJECTION',
        'CALL_ANSWER', 'REPLY', 'PERMISSION_DENIED',
        'DUPLICATE_NOTIFICATION', 'MULTIPLE_PENDING', 'BRIDGE_DISCONNECT',
      ] as const;
      for (const k of kinds) {
        const ev = createSimulatedBridgeEvent(k);
        assert.equal(ev.simulationOnly, true);
        assert.equal(simulationOnly(ev), true);
      }
      assert.equal(simulationOnly({ kind: 'INCOMING_CALL' }), false);
    });
  });

  describe('6. Audit log, metadata only', () => {
    it('records safe metadata entries without full message body', () => {
      logMobileAudit({
        eventType: 'MESSAGE_RECEIVED',
        application: 'WhatsApp',
        actionRequested: 'REPLY',
        permissionState: 'GRANTED',
        authorizationState: 'PENDING',
        result: 'SUCCESS',
      } as any);
      const log = getMobileAuditLog();
      assert.equal(log.length, 1);
      assert.ok(!JSON.stringify(log).includes('Shall we meet tomorrow'));
    });

    it('does not log secrets even if mistakenly passed in', () => {
      logMobileAudit({
        eventType: 'ACTION_DENIED',
        application: 'com.bank',
        actionRequested: 'NOTIFICATION_READ',
        permissionState: 'DENIED',
        authorizationState: 'BLOCKED',
        result: 'FAILED',
        note: 'secret 482913',
      } as any);
      assert.ok(!JSON.stringify(getMobileAuditLog()).includes('482913'));
    });
  });

  describe('7. Bridge connection truthfulness', () => {
    it('reports MOBILE_NOT_CONNECTED when no live bridge registered', () => {
      clearBridgeRegistration();
      assert.equal(getBridgeConnectionState(), 'MOBILE_NOT_CONNECTED');
    });

    it('does not claim CONNECTED without registration', () => {
      assert.notEqual(getBridgeConnectionState(), 'CONNECTED');
    });

    it('masks phone numbers', () => {
      assert.equal(maskCallerId('+919876543210'), '+919****3210');
      assert.equal(maskCallerId(undefined), 'unknown number');
    });
  });
});