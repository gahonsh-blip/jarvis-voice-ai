import { describe, it, expect } from 'vitest';
import {
  detectSensitiveNotification,
  categorizeApp,
  categoryLabel,
  resolveNotificationPolicy,
  isNotificationPermitted,
  computeNotificationIdentity,
  contentHash,
  exposeNotificationContent,
  ingestNotification,
  loadMobileBridgePolicy,
  setAppPolicy,
  setCategoryPolicy,
} from '../utils/mobileNotificationPrivacy';
import {
  DEFAULT_MOBILE_BRIDGE_POLICY,
  MobileBridgePolicy,
  MobileCategoryPolicy,
  MobileNotificationCategory,
} from '../types/mobileBridge';

function mkPolicy(overrides: {
  categories?: Partial<Record<MobileNotificationCategory, MobileCategoryPolicy>>;
  perApp?: Record<string, MobileCategoryPolicy>;
  readNotificationContent?: boolean;
} = {}): MobileBridgePolicy {
  return {
    ...DEFAULT_MOBILE_BRIDGE_POLICY,
    categories: { ...DEFAULT_MOBILE_BRIDGE_POLICY.categories, ...(overrides.categories || {}) },
    perApp: overrides.perApp ? { ...overrides.perApp } : {},
    readNotificationContent:
      overrides.readNotificationContent !== undefined
        ? overrides.readNotificationContent
        : DEFAULT_MOBILE_BRIDGE_POLICY.readNotificationContent,
  };
}

describe('Notification Privacy Engine — sensitive content detection', () => {
  it('flags an OTP verification code', () => {
    const r = detectSensitiveNotification('Bank', 'Your verification code is 482913', 'HDFC');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('OTP');
  });

  it('flags an OTP announced only in the sender name', () => {
    const r = detectSensitiveNotification(undefined, undefined, 'OTP Service');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('OTP');
  });

  it('flags authentication/password content', () => {
    expect(detectSensitiveNotification('Security', 'Your password was changed').kind).toBe('AUTH');
    expect(detectSensitiveNotification('Your PIN is set').kind).toBe('AUTH');
  });

  it('flags banking content', () => {
    expect(detectSensitiveNotification('Alert', 'Your account number is updated').kind).toBe('BANK');
    expect(detectSensitiveNotification('Alert', 'IMPS transfer initiated').kind).toBe('BANK');
  });

  it('flags health content', () => {
    const r = detectSensitiveNotification('Clinic', 'Your medical report is ready');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('HEALTH');
  });

  it('flags secret material', () => {
    const r = detectSensitiveNotification('DevOps', 'Here is your private key');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('SECRET');
  });

  it('flags an explicitly confidential message', () => {
    const r = detectSensitiveNotification('Note', 'This is confidential');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('OTHER');
  });

  it('flags a Hindi OTP notification', () => {
    const r = detectSensitiveNotification('बैंक', 'आपका ओटीपी 4821 है');
    expect(r.sensitive).toBe(true);
    expect(r.kind).toBe('OTP');
  });

  it('does not flag ordinary conversation', () => {
    const r = detectSensitiveNotification('Amit', 'Are we meeting at 5?');
    expect(r.sensitive).toBe(false);
    expect(r.kind).toBeUndefined();
  });

  it('does not flag on empty input', () => {
    expect(detectSensitiveNotification().sensitive).toBe(false);
    expect(detectSensitiveNotification('', '', '').sensitive).toBe(false);
  });
});

describe('Notification Privacy Engine — app categorisation', () => {
  it('maps known packages to their category', () => {
    expect(categorizeApp('com.whatsapp', 'WhatsApp')).toBe('WHATSAPP');
    expect(categorizeApp('org.telegram.messenger', 'Telegram')).toBe('TELEGRAM');
    expect(categorizeApp('com.google.android.gm', 'Gmail')).toBe('EMAIL');
    expect(categorizeApp('com.android.dialer', 'Phone')).toBe('CALLS');
    expect(categorizeApp('com.package.app', 'Messages')).toBe('SMS');
    expect(categorizeApp('com.google.android.calendar', 'Calendar')).toBe('CALENDAR');
    expect(categorizeApp('com.package.app', 'Fit')).toBe('HEALTH');
  });

  it('falls back to OTHER_APPS for unknown apps', () => {
    expect(categorizeApp('com.acme.thing', 'Acme')).toBe('OTHER_APPS');
  });

  it('accepts a bare app label as well as a package', () => {
    expect(categorizeApp('', 'WhatsApp')).toBe('WHATSAPP');
  });

  it('exposes a human label for every category', () => {
    const all: MobileNotificationCategory[] = [
      'CALLS', 'SMS', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'CALENDAR', 'HEALTH', 'OTHER_APPS',
    ];
    for (const c of all) {
      expect(categoryLabel(c).length).toBeGreaterThan(0);
    }
  });
});

describe('Notification Privacy Engine — policy resolution', () => {
  it('uses an exact per-app override over the category policy', () => {
    const policy = mkPolicy({ categories: { WHATSAPP: 'ALLOW' }, perApp: { 'com.whatsapp': 'DENY' } });
    expect(resolveNotificationPolicy(policy, 'com.whatsapp', 'WhatsApp', 'WHATSAPP')).toBe('DENY');
  });

  it('matches a per-app override by case-insensitive app label', () => {
    const policy = mkPolicy({ perApp: { whatsapp: 'ALLOW' } });
    expect(resolveNotificationPolicy(policy, 'com.whatsapp', 'WhatsApp', 'WHATSAPP')).toBe('ALLOW');
  });

  it('falls back to the category policy', () => {
    const policy = mkPolicy({ categories: { SMS: 'ALLOW' } });
    expect(resolveNotificationPolicy(policy, 'com.unknown', 'Unknown', 'SMS')).toBe('ALLOW');
  });

  it('defaults to ASK when the category is absent from the map', () => {
    const policy = mkPolicy();
    delete (policy.categories as Record<string, unknown>).EMAIL;
    expect(resolveNotificationPolicy(policy, 'com.unknown', 'Unknown', 'EMAIL')).toBe('ASK');
  });

  it('permits only ALLOW, never DENY or ASK', () => {
    const policy = mkPolicy({ categories: { SMS: 'ALLOW', EMAIL: 'DENY' } });
    expect(isNotificationPermitted(policy, 'x', 'x', 'SMS')).toBe(true);
    expect(isNotificationPermitted(policy, 'x', 'x', 'EMAIL')).toBe(false);
    expect(isNotificationPermitted(policy, 'x', 'x', 'TELEGRAM')).toBe(false); // default ASK
  });

  it('denies HEALTH by default', () => {
    expect(isNotificationPermitted(mkPolicy(), 'com.fit', 'Fit', 'HEALTH')).toBe(false);
  });
});

describe('Notification Privacy Engine — identity and hashing', () => {
  it('builds a deterministic composite identity', () => {
    const id = computeNotificationIdentity({
      packageName: 'com.whatsapp',
      notificationId: 3,
      key: 'k1',
      appLabel: 'WhatsApp',
      senderName: 'Amit',
      bodyHash: 'h1',
    });
    expect(id).toBe('com.whatsapp|3|k1|Amit|h1');
  });

  it('omits an undefined notification id', () => {
    const id = computeNotificationIdentity({ packageName: 'p', key: 'k', appLabel: 'a' });
    expect(id).toBe('p||k||');
  });

  it('changes identity when the body hash changes', () => {
    const a = computeNotificationIdentity({ packageName: 'p', key: 'k', appLabel: 'a', bodyHash: 'h1' });
    const b = computeNotificationIdentity({ packageName: 'p', key: 'k', appLabel: 'a', bodyHash: 'h2' });
    expect(a).not.toBe(b);
  });

  it('hashes content deterministically and never returns the raw text', () => {
    const h = contentHash('secret message');
    expect(h).toBe(contentHash('secret message'));
    expect(h).not.toBe(contentHash('other message'));
    expect(h).not.toContain('secret');
  });

  it('returns an empty hash for empty input', () => {
    expect(contentHash(undefined)).toBe('');
    expect(contentHash('')).toBe('');
  });
});

describe('Notification Privacy Engine — content exposure', () => {
  const allowedPolicy = mkPolicy({ categories: { WHATSAPP: 'ALLOW' } });

  it('returns nothing for a denied application', () => {
    const e = exposeNotificationContent({
      policy: mkPolicy({ categories: { WHATSAPP: 'DENY' } }),
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      category: 'WHATSAPP',
      title: 'Amit',
      body: 'Hello',
    });
    expect(e.permitted).toBe(false);
    expect(e.contentAvailable).toBe(false);
    expect(e.body).toBeUndefined();
    expect(e.reason).toBe('APP_DENIED');
  });

  it('reports HEALTH_DENIED for a blocked health notification', () => {
    const e = exposeNotificationContent({
      policy: mkPolicy(),
      packageName: 'com.fit',
      appLabel: 'Fit',
      category: 'HEALTH',
      body: 'steps',
    });
    expect(e.permitted).toBe(false);
    expect(e.reason).toBe('HEALTH_DENIED');
  });

  it('never exposes the body of a sensitive notification', () => {
    const e = exposeNotificationContent({
      policy: allowedPolicy,
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      category: 'WHATSAPP',
      title: 'Bank',
      body: 'Your verification code is 482913',
    });
    expect(e.permitted).toBe(true);
    expect(e.sensitive).toBe(true);
    expect(e.sensitiveKind).toBe('OTP');
    expect(e.contentAvailable).toBe(false);
    expect(e.body).toBeUndefined();
    expect(e.reason).toBe('SENSITIVE');
  });

  it('exposes body and a bounded preview for an allowed notification', () => {
    const long = 'x'.repeat(300);
    const e = exposeNotificationContent({
      policy: allowedPolicy,
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      category: 'WHATSAPP',
      body: long,
    });
    expect(e.reason).toBe('ALLOWED');
    expect(e.contentAvailable).toBe(true);
    expect(e.body).toBe(long);
    expect(e.bodyPreview).toHaveLength(140);
  });

  it('withholds the body but retains a caller-supplied preview when content reading is off', () => {
    const e = exposeNotificationContent({
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' }, readNotificationContent: false }),
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      category: 'WHATSAPP',
      title: 'Amit',
      body: 'Full private message text',
      bodyPreview: 'Short preview',
    });
    expect(e.reason).toBe('CONTENT_OFF');
    expect(e.contentAvailable).toBe(false);
    expect(e.body).toBeUndefined();
    expect(e.bodyPreview).toBe('Short preview');
  });

  it('does not invent a preview when none was supplied and content reading is off', () => {
    const e = exposeNotificationContent({
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' }, readNotificationContent: false }),
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      category: 'WHATSAPP',
      body: 'Full private message text',
    });
    expect(e.bodyPreview).toBeUndefined();
  });
});

describe('Notification Privacy Engine — notification ingestion', () => {
  const base = {
    packageName: 'com.whatsapp',
    appLabel: 'WhatsApp',
    notificationId: 1,
    key: 'k1',
    eventId: 'evt-1',
    receivedAt: '2026-09-20T12:00:00.000Z',
  };

  it('drops a notification from a denied application', () => {
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'DENY' } }),
      title: 'Amit',
      body: 'Hello',
    });
    expect(e).toBeNull();
  });

  it('drops a notification from an app still set to ASK', () => {
    const e = ingestNotification({ ...base, policy: mkPolicy(), title: 'Amit', body: 'Hello' });
    expect(e).toBeNull();
  });

  it('ingests an allowed notification with body and category', () => {
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(e).not.toBeNull();
    expect(e!.category).toBe('WHATSAPP');
    expect(e!.body).toBe('Hello there');
    expect(e!.sensitive).toBe(false);
    expect(e!.contentAvailable).toBe(true);
    expect(e!.permissionState).toBe('GRANTED');
    expect(e!.isSimulated).toBe(false);
  });

  it('redacts title, sender and body for a sensitive notification but keeps the kind', () => {
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Bank',
      senderName: 'HDFC',
      body: 'Your verification code is 482913',
    });
    expect(e).not.toBeNull();
    expect(e!.sensitive).toBe(true);
    expect(e!.sensitiveKind).toBe('OTP');
    expect(e!.title).toBeUndefined();
    expect(e!.senderName).toBeUndefined();
    expect(e!.body).toBeUndefined();
    expect(e!.bodyPreview).toBeUndefined();
    expect(e!.contentAvailable).toBe(false);
  });

  it('marks a simulated event as simulated', () => {
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello',
      isSimulated: true,
    });
    expect(e!.isSimulated).toBe(true);
    expect(e!.simulationOnly).toBe(true);
  });
});

describe('Notification Privacy Engine — policy persistence (no window)', () => {
  it('falls back to the default policy when no browser storage is available', () => {
    expect(loadMobileBridgePolicy()).toEqual(DEFAULT_MOBILE_BRIDGE_POLICY);
  });

  it('setAppPolicy returns a new object without mutating the original', () => {
    const original = mkPolicy();
    const next = setAppPolicy(original, 'com.whatsapp', 'DENY');
    expect(next).not.toBe(original);
    expect(next.perApp['com.whatsapp']).toBe('DENY');
    expect(original.perApp['com.whatsapp']).toBeUndefined();
  });

  it('setCategoryPolicy returns a new object without mutating the original', () => {
    const original = mkPolicy();
    const next = setCategoryPolicy(original, 'WHATSAPP', 'ALLOW');
    expect(next.categories.WHATSAPP).toBe('ALLOW');
    expect(original.categories.WHATSAPP).toBe('ASK');
    expect(next).not.toBe(original);
  });
});