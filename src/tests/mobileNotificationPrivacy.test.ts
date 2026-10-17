import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  applyCategoryPolicy,
  saveMobileBridgePolicy,
  checkAndMarkDuplicate,
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

// Item 13 (Zero-fake-success). The category-policy toggle reported a change
// that may never have reached storage: saveMobileBridgePolicy discarded the
// localStorage error and the component adopted the unsaved policy into React
// state anyway, so the operator saw the privacy filter flip while the next
// reload silently dropped it. The writer now reports the real result and the
// applier surfaces it.
describe('Notification Privacy Engine — policy writes report whether they landed', () => {
  class ControllableStorage {
    private store = new Map<string, string>();
    failWrites = false;
    // A store that accepts setItem without throwing yet drops the bytes:
    // private browsing, a frozen or quota-clamped store. The pre-fix writer
    // could not see this because it never read the bytes back.
    refuseSilently = false;
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    setItem(key: string, value: string) {
      if (this.failWrites) throw new DOMException('QuotaExceededError');
      if (this.refuseSilently) return;
      this.store.set(key, String(value));
    }
    removeItem(key: string) {
      this.store.delete(key);
    }
  }

  const store = new ControllableStorage();

  beforeEach(() => {
    store.clear();
    store.failWrites = false;
    store.refuseSilently = false;
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveMobileBridgePolicy returns true when storage accepts the write', () => {
    expect(saveMobileBridgePolicy(mkPolicy({ categories: { WHATSAPP: 'DENY' } }))).toBe(true);
    expect(JSON.parse(store.getItem('hermes_jarvis_mobile_bridge_policy_v1')!).categories.WHATSAPP).toBe('DENY');
  });

  it('saveMobileBridgePolicy returns false when storage refuses the write', () => {
    store.failWrites = true;
    expect(saveMobileBridgePolicy(mkPolicy())).toBe(false);
  });

  it('applyCategoryPolicy reports persisted=true only when the policy reached storage', () => {
    const ok = applyCategoryPolicy(mkPolicy(), 'WHATSAPP', 'ALLOW');
    expect(ok.persisted).toBe(true);
    expect(ok.policy.categories.WHATSAPP).toBe('ALLOW');
    expect(JSON.parse(store.getItem('hermes_jarvis_mobile_bridge_policy_v1')!).categories.WHATSAPP).toBe('ALLOW');

    store.failWrites = true;
    const refused = applyCategoryPolicy(mkPolicy(), 'EMAIL', 'DENY');
    expect(refused.persisted).toBe(false);
  });

  it('saveMobileBridgePolicy reports a silently dropped write as not saved', () => {
    // Seed a policy so a dropped write can be told apart from "never written".
    saveMobileBridgePolicy(mkPolicy({ categories: { WHATSAPP: 'DENY' } }));
    store.refuseSilently = true;
    expect(saveMobileBridgePolicy(mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }))).toBe(false);
    // The store still holds the previous bytes — the change did not land.
    expect(JSON.parse(store.getItem('hermes_jarvis_mobile_bridge_policy_v1')!).categories.WHATSAPP).toBe('DENY');
    expect(loadMobileBridgePolicy().categories.WHATSAPP).toBe('DENY');
  });

  it('applyCategoryPolicy reports a silently dropped write as not persisted', () => {
    store.refuseSilently = true;
    const change = applyCategoryPolicy(mkPolicy(), 'WHATSAPP', 'ALLOW');
    expect(change.persisted).toBe(false);
    // The reload the operator would see: the default, not the requested ALLOW.
    expect(loadMobileBridgePolicy().categories.WHATSAPP).toBe(DEFAULT_MOBILE_BRIDGE_POLICY.categories.WHATSAPP);
  });
});

// A dedup store that refuses the write is the same defect class as the policy
// writer: the pipeline must not report a notification as de-duplicated when its
// dedup record never reached storage.
describe('Notification Privacy Engine — dedup writes report whether they landed', () => {
  class ControllableStorage {
    private store = new Map<string, string>();
    failWrites = false;
    refuseSilently = false;
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    setItem(key: string, value: string) {
      if (this.failWrites) throw new DOMException('QuotaExceededError');
      if (this.refuseSilently) return;
      this.store.set(key, String(value));
    }
    removeItem(key: string) {
      this.store.delete(key);
    }
  }

  const store = new ControllableStorage();
  const base = {
    packageName: 'com.whatsapp',
    appLabel: 'WhatsApp',
    notificationId: 1,
    key: 'k1',
    eventId: 'evt-1',
    receivedAt: '2026-09-20T12:00:00.000Z',
  };

  beforeEach(() => {
    store.clear();
    store.failWrites = false;
    store.refuseSilently = false;
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkAndMarkDuplicate reports persisted=true and a real store record when the write lands', () => {
    const res = checkAndMarkDuplicate('id-a');
    expect(res.duplicate).toBe(false);
    expect(res.persisted).toBe(true);
    expect(store.getItem('hermes_jarvis_mobile_dedup_v1')).toContain('id-a');
  });

  it('checkAndMarkDuplicate reports persisted=false when the store refuses the write', () => {
    store.failWrites = true;
    const res = checkAndMarkDuplicate('id-b');
    expect(res.duplicate).toBe(false);
    expect(res.persisted).toBe(false);
  });

  it('a second sighting of a stored identity is a duplicate and needs no write', () => {
    checkAndMarkDuplicate('id-c');
    const again = checkAndMarkDuplicate('id-c');
    expect(again.duplicate).toBe(true);
    expect(again.persisted).toBe(true);
  });

  it('ingestNotification marks dedupPersisted=true when the dedup record reached storage', () => {
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(e).not.toBeNull();
    expect(e!.dedupPersisted).toBe(true);
  });

  it('ingestNotification marks dedupPersisted=false when the dedup store refused the write', () => {
    store.failWrites = true;
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(e).not.toBeNull();
    expect(e!.dedupPersisted).toBe(false);
  });

  it('a refused dedup write means a re-delivery is ingested again, not silently dropped', () => {
    store.failWrites = true;
    const first = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(first).not.toBeNull();
    const second = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    // The refused write left no record, so the re-delivery is not recognised as
    // a duplicate. This is the behaviour the flag exists to disclose.
    expect(second).not.toBeNull();
    expect(second!.dedupPersisted).toBe(false);
  });

  it('checkAndMarkDuplicate reports a silently dropped write as not persisted', () => {
    store.refuseSilently = true;
    const res = checkAndMarkDuplicate('id-silent');
    expect(res.duplicate).toBe(false);
    // setItem did not throw, but the record never landed.
    expect(res.persisted).toBe(false);
    expect(store.getItem('hermes_jarvis_mobile_dedup_v1')).toBeNull();
  });

  it('ingestNotification marks dedupPersisted=false when the dedup store drops the write silently', () => {
    store.refuseSilently = true;
    const e = ingestNotification({
      ...base,
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(e).not.toBeNull();
    expect(e!.dedupPersisted).toBe(false);
  });
});

// Without a browser window the dedup writer must never claim a stored record.
describe('Notification Privacy Engine — dedup write with no window', () => {
  it('checkAndMarkDuplicate reports not-persisted and ingest marks the event', () => {
    expect(typeof window).toBe('undefined');
    expect(checkAndMarkDuplicate('id-nw').persisted).toBe(false);
    const e = ingestNotification({
      packageName: 'com.whatsapp',
      appLabel: 'WhatsApp',
      notificationId: 1,
      key: 'k1',
      eventId: 'evt-nw',
      receivedAt: '2026-09-20T12:00:00.000Z',
      policy: mkPolicy({ categories: { WHATSAPP: 'ALLOW' } }),
      title: 'Amit',
      body: 'Hello there',
    });
    expect(e).not.toBeNull();
    expect(e!.dedupPersisted).toBe(false);
  });
});

// Without a browser window the writers must never claim a successful save.
describe('Notification Privacy Engine — no window means no persisted write', () => {
  it('saveMobileBridgePolicy and applyCategoryPolicy report not-saved', () => {
    expect(typeof window).toBe('undefined');
    expect(saveMobileBridgePolicy(mkPolicy())).toBe(false);
    expect(applyCategoryPolicy(mkPolicy(), 'WHATSAPP', 'DENY').persisted).toBe(false);
  });
});
