// =============================================================================
// HERMES JARVIS ? Notification Privacy Engine
// Per-category + per-application policy, sensitive-content filtering (OTP, bank,}
// health, secrets), short-lived deduplication, and content hashing.
// Never stores full private message content permanently by default.
// =============================================================================
import {
  MobileBridgePolicy,
  MobileNotificationCategory,
  MobileCategoryPolicy,
  MobileNotificationEvent,
  DEFAULT_MOBILE_BRIDGE_POLICY,
} from '../types/mobileBridge';

// ---------------------------------------------------------------
// Sensitive notification patterns (privacy-first, default OFF)
// ---------------------------------------------------------------
const SENSITIVE_PATTERNS: Array<{ kind: 'OTP' | 'AUTH' | 'BANK' | 'HEALTH' | 'SECRET' | 'OTHER'; patterns: RegExp[] }> = [
  {
    kind: 'OTP',
    patterns: [
      /\b(?:otp|one[- ]?time pass(?:word|code)|one[- ]?time code|passcode)\b/i,
      /\b(?:verification code|verification otp|verification pin)\b/i,
      /\b(?:passcode)\b/i,
      /\b(?:\d{4,})?\s*(?:code|\u0915\u094b\u0921|\u0935\u0947\u0930\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0915\u094b\u0921)\b/i,
      /\u0913\u091f\u0917\u0940\u092a\u0940\u092a|\u090f\u091f\u0940\u092a\u0940|\u0913\u091f\u092a\u0940/i,
    ],
  },
  {
    kind: 'AUTH',
    patterns: [
      /\b(?:authentication code|auth code|login code|sign[-\s]?in code|security key|recovery key|2fa|two[- ]?factor)\b/i,
      /\b(?:password|\u092a\u093e\u0938\u0935\u0930\u094d\u0921|\u092a\u093e\u0938\u0935\u0921|\u092a\u093e\u0938\u0935\u0921\u0930\u094d\u0921)\b/i,
      /\b(?:pin\b|\u092a\u093f\u0928\b)/i,
    ],
  },
  {
    kind: 'BANK',
    patterns: [
      /\b(?:bank (?:transaction|transfer|payment)|upi (?:payment|transfer)|imps|neft|rtgs)\b/i,
      /\b(?:cvv|cvv2|card number|debit card|credit card|card pin|account number|acct no)\b/i,
      /\b(?:\u0915\u093e\u0930\u094d\u0921 \u0928\u0902\u092c\u0930|\u092c\u0948\u0902\u0915|\u0916\u093e\u0924\u093e \u0928\u0902\u092c\u0930|\u0915\u093e\u0930\u094d\u0921 \u0935\u093f\u0935\u0930\u0923)\b/i,
      /\b(?:credited|debited|spent|paid|sent) (?:\u20b9|rs\.?|inr|usd|\$)\d+\b/i,
    ],
  },
  {
    kind: 'HEALTH',
    patterns: [
      /\b(?:health report|medical report|diagnosis|prescription|test results|blood (?:sugar|pressure|report)|hiv|oncology|psychiatric|counselling)\b/i,
    ],
  },
  {
    kind: 'SECRET',
    patterns: [
      /\b(?:private key|api key|secret token|access token|password reset link)\b/i,
    ],
  },
  {
    kind: 'OTHER',
    patterns: [
      /\b(?:confidential|private party|don't share|do not share)\b/i,
    ],
  },
];


/** Sensitive content is never read aloud by default. */
export function detectSensitiveNotification(
  title?: string,
  body?: string,
  senderName?: string
): { sensitive: boolean; kind?: 'OTP' | 'AUTH' | 'BANK' | 'HEALTH' | 'SECRET' | 'OTHER' } {
  const haystack = [title || '', body || '', senderName || ''].join(' \n ').replace(/\s+/g, ' ');
  for (const rule of SENSITIVE_PATTERNS) {
    for (const re of rule.patterns) {
      if (re.test(haystack)) {
        return { sensitive: true, kind: rule.kind };
      }
    }
  }
  return { sensitive: false };
}

// ---------------------------------------------------------------
// App/category resolution + policy evaluation
// ---------------------------------------------------------------
const KNOWN_APP_CATEGORIES: Array<{ match: RegExp; category: MobileNotificationCategory }> = [
  { match: /\bwhatsapp\b/i, category: 'WHATSAPP' },
  { match: /\btelegram\b/i, category: 'TELEGRAM' },
  { match: /\be?-?mail\b|\bgmail\b|\boutlook\b/i, category: 'EMAIL' },
  { match: /\bsms\b|\bmessages\b|\bmessage\b|\bolauncher\b/i, category: 'SMS' },
  { match: /\b(?:phone|dialer|call|com\.android\.(?:incallui|dialer|phone))\b/i, category: 'CALLS' },
  { match: /\bcalend(?:ar|er)\b|\bschedule\b/i, category: 'CALENDAR' },
   { match: /\b(?:health|fit|steps|heart)\b/i, category: 'HEALTH' },
];

/** Map an Android package/app label to its default notification category. */
export function categorizeApp(packageName: string, appLabel: string): MobileNotificationCategory {
  const haystack = `${packageName} ${appLabel}`;
  for (const rule of KNOWN_APP_CATEGORIES) {
    if (rule.match.test(haystack)) {
      return rule.category;
    }
  }
  return 'OTHER_APPS';
}

export function categoryLabel(category: MobileNotificationCategory): string {
  switch (category) {
    case 'CALLS': return 'Calls';
    case 'SMS': return 'SMS';
    case 'WHATSAPP': return 'WhatsApp';
    case 'TELEGRAM': return 'Telegram';
    case 'EMAIL': return 'Email';
    case 'CALENDAR': return 'Calendar';
    case 'HEALTH': return 'Health';
    case 'OTHER_APPS': return 'Other Apps';
    default: return category;
  }
}

/**
 * Resolve effective policy for a given app+category.
 * Per-application override takes precedence over category policy.
 */
export function resolveNotificationPolicy(
  policy: MobileBridgePolicy,
  packageName: string,
  appLabel: string,
  category: MobileNotificationCategory
): MobileCategoryPolicy {
  const appOverride = policy.perApp[packageName];
  if (appOverride) return appOverride;
  const labelOverride = Object.entries(policy.perApp).find(([k]) => k.toLowerCase() === appLabel.toLowerCase());
  if (labelOverride) return labelOverride[1];
  return policy.categories[category] ?? 'ASK';
}

export function isNotificationPermitted(
  policy: MobileBridgePolicy,
  packageName: string,
  appLabel: string,
  category: MobileNotificationCategory
): boolean {
  const resolved = resolveNotificationPolicy(policy, packageName, appLabel, category);
  if (resolved === 'DENY') return false;
  if (resolved === 'ASK') return false;
  return true;
}

// ---------------------------------------------------------------
// Deduplication ? notification identity WITHOUT permanent content storage
// ---------------------------------------------------------------
const DEDUP_TTL_MS = 6 * 60 * 60 * 1000;
const DEDUP_STORAGE_KEY = 'hermes_jarvis_mobile_dedup_v1';

export function computeNotificationIdentity(input: {
  packageName: string;
  notificationId?: number;
  key: string;
  appLabel: string;
  senderName?: string;
  bodyHash?: string;
}): string {
  const parts = [
    input.packageName,
    input.notificationId !== undefined ? String(input.notificationId) : '',
    input.key,
    input.senderName || '',
    input.bodyHash || '',
  ];
  return parts.join('|');
}

export function contentHash(text?: string): string {
  if (!text) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'h' + (h >>> 0).toString(36);
}


type DedupBucket = { expiresAt: number };
type DedupStore = Record<string, DedupBucket>;

function loadDedupStore(): DedupStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DEDUP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DedupStore;
      // Drop expired entries eagerly
      const now = Date.now();
      const cleaned: DedupStore = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v.expiresAt > now) cleaned[k] = v;
      }
      return cleaned;
    }
  } catch {
    // ignore
  }
  return {};
}

function persistDedupStore(store: DedupStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full ? degrade gracefully, never crash the pipeline
  }
}

/**
 * Returns true if this notification identity was already processed
 * within the short-lived window (dedup). Also marks it processed.
 */
export function isDuplicateNotification(identity: string): boolean {
  const store = loadDedupStore();
  if (store[identity]) return true;
  store[identity] = { expiresAt: Date.now() + DEDUP_TTL_MS };
  // Hard cap on dedup bucket size (privacy + memory hygiene)
  const keys = Object.keys(store);
  if (keys.length > 500) {
    const sorted = keys.sort((a, b) => store[a].expiresAt - store[b].expiresAt);
  for (const k of sorted.slice(0, keys.length - 500)) {
      delete store[k];
    }
  }
  persistDedupStore(store);
  return false;
}

/** Reset dedup store (test helpers). */
export function clearNotificationDedupStore(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(DEDUP_STORAGE_KEY); } catch {}
}

// ---------------------------------------------------------------
// Content exposure ? never expose denied/sensitive content
// ---------------------------------------------------------------
export interface NotificationExposure {
  contentAvailable: boolean;
  body?: string;
  bodyPreview?: string;
  sensitive: boolean;
  sensitiveKind?: 'OTP' | 'AUTH' | 'BANK' | 'HEALTH' | 'SECRET' | 'OTHER';
  permitted: boolean;
  reason: 'ALLOWED' | 'APP_DENIED' | 'SENSITIVE' | 'CONTENT_OFF' | 'HEALTH_DENIED';
}

/**
 * Decide exactly how much of a raw notification may reach JARVIS/the HUD.
 * Denied app -> nothing. Sensitive -> never body; content off -> no body but title/preview.
 */
export function exposeNotificationContent(params: {
  policy: MobileBridgePolicy;
  packageName: string;
  appLabel: string;
  category: MobileNotificationCategory;
  title?: string;
  body?: string;
  bodyPreview?: string;
  senderName?: string;
}): NotificationExposure {
  const permitted = isNotificationPermitted(params.policy, params.packageName, params.appLabel, params.category);
   if (!permitted) {
    return {
      contentAvailable: false,
      sensitive: false,
      permitted: false,
      reason: params.category === 'HEALTH' ? 'HEALTH_DENIED' : 'APP_DENIED',
    };
  }

  const detected = detectSensitiveNotification(params.title, params.body, params.senderName);
  if (detected.sensitive) {
    return {
      contentAvailable: false,
      sensitive: true,
      sensitiveKind: detected.kind,
      permitted: true,
      reason: 'SENSITIVE',
    };
  }

  const readContent = params.policy.readNotificationContent !== false;
  if (readContent && params.body) {
    return {
      contentAvailable: true,
      body: params.body,
      bodyPreview: params.bodyPreview || params.body.slice(0, 140),
      sensitive: false,
      permitted: true,
      reason: 'ALLOWED',
    };
  }

  return {
    contentAvailable: false,
    bodyPreview: params.bodyPreview || (params.title ? undefined : undefined),
    sensitive: false,
    permitted: true,
    reason: readContent ? 'ALLOWED' : 'CONTENT_OFF',
  };
}

/**
 * Build a notification event after policy/sensitive/dedup processing.
 * Returns null when the event must be skipped entirely (denied app or duplicate?
 */
export function ingestNotification(params: {
  policy: MobileBridgePolicy;
  packageName: string;
  appLabel: string;
  notificationId: number;
  title?: string;
  body?: string;
  bodyPreview?: string;
  senderName?: string;
  key: string;
  eventId: string;
  receivedAt: string;
  postTime?: number;
  isSimulated?: boolean;
}): MobileNotificationEvent | null {
  const category = categorizeApp(params.packageName, params.appLabel);
  const exposure = exposeNotificationContent({
    policy: params.policy,
    packageName: params.packageName,
    appLabel: params.appLabel,
    category,
    title: params.title,
    body: params.body,
    bodyPreview: params.bodyPreview,
    senderName: params.senderName,
  });

  if (!exposure.permitted) {
    return null;
  }

  const identity = computeNotificationIdentity({
    packageName: params.packageName,
    notificationId: params.notificationId,
    key: params.key,
    appLabel: params.appLabel,
    senderName: params.senderName,
    bodyHash: contentHash(params.body),
  });

  if (isDuplicateNotification(identity)) {
    return null;
  }

  const sensitive = exposure.sensitive;

  return {
    eventId: params.eventId,

    packageName: params.packageName,
    appLabel: params.appLabel,
    category,
    title: sensitive ? undefined : params.title,
    senderName: sensitive ? undefined : params.senderName,
    body: sensitive ? undefined : exposure.body,
    bodyPreview: sensitive ? undefined : exposure.bodyPreview,
    contentAvailable: sensitive ? false : exposure.contentAvailable,
    sensitive,
    sensitiveKind: sensitive ? exposure.sensitiveKind : undefined,
    key: params.key,
    notificationId: params.notificationId,
    postTime: params.postTime || Date.now(),
    receivedAt: params.receivedAt,
    permissionState: exposure.contentAvailable ? 'GRANTED' : sensitive ? 'GRANTED' : 'LIMITED',
    isSimulated: Boolean(params.isSimulated),
    simulationOnly: Boolean(params.isSimulated),
  };
}

// ---------------------------------------------------------------
// Policy persistence (local, per-device browser)
// ---------------------------------------------------------------
const POLICY_STORAGE_KEY = 'hermes_jarvis_mobile_bridge_policy_v1';

export function loadMobileBridgePolicy(): MobileBridgePolicy {
  if (typeof window === 'undefined') return DEFAULT_MOBILE_BRIDGE_POLICY;

  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MobileBridgePolicy>;
      return {
        ...DEFAULT_MOBILE_BRIDGE_POLICY,
        ...parsed,
        categories: {
          ...DEFAULT_MOBILE_BRIDGE_POLICY.categories,
          ...(parsed.categories || {}),
        },
        perApp: parsed.perApp || {},
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_MOBILE_BRIDGE_POLICY;
}

export function saveMobileBridgePolicy(policy: MobileBridgePolicy): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy)); } catch {}
}

export function setAppPolicy(policy: MobileBridgePolicy, appKey: string, value: MobileCategoryPolicy): MobileBridgePolicy {
  const next: MobileBridgePolicy = {
    ...policy,
    perApp: { ...policy.perApp, [appKey]: value },
  };
  saveMobileBridgePolicy(next);
  return next;
}

export function setCategoryPolicy(policy: MobileBridgePolicy, category: MobileNotificationCategory, value: MobileCategoryPolicy): MobileBridgePolicy {
  const next: MobileBridgePolicy = {
    ...policy,
    categories: { ...policy.categories, [category]: value },
  };
  saveMobileBridgePolicy(next);
  return next;
}