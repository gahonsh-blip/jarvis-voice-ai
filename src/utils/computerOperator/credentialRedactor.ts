// ==============================================================================
// HERMES JARVIS — CREDENTIAL & SECRET REDACTION ENGINE
// Redacts API keys, OAuth tokens, passwords, cookies, and secrets from screen
// text, logs, screenshots metadata, and command streams.
// ==============================================================================

export interface RedactionResult {
  redactedText: string;
  secretsDetectedCount: number;
  redactedCategories: string[];
}

const REDACTION_PATTERNS: { category: string; regex: RegExp; placeholder: string }[] = [
  // 1. Google API Keys
  {
    category: 'Google API Key',
    regex: /\bAIzaSy[a-zA-Z0-9_-]{33}\b/g,
    placeholder: '[REDACTED_GOOGLE_API_KEY]',
  },
  // 2. GitHub Tokens (Classic, Fine-grained, OAuth)
  {
    category: 'GitHub Token',
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b|\bgithub_pat_[a-zA-Z0-9_]{50,}\b/g,
    placeholder: '[REDACTED_GITHUB_TOKEN]',
  },
  // 3. Telegram Bot Tokens
  {
    category: 'Telegram Bot Token',
    regex: /\b[0-9]{8,11}:[a-zA-Z0-9_-]{35,}\b/g,
    placeholder: '[REDACTED_TELEGRAM_BOT_TOKEN]',
  },
  // 4. JWT Web Tokens
  {
    category: 'JWT Token',
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\b/g,
    placeholder: '[REDACTED_JWT_TOKEN]',
  },
  // 5. OpenAI API Keys
  {
    category: 'OpenAI Key',
    regex: /\bsk-[a-zA-Z0-9]{20,T3BlbkFJ[a-zA-Z0-9_-]*|[a-zA-Z0-9]{48,}\b/g,
    placeholder: '[REDACTED_OPENAI_KEY]',
  },
  // 6. Generic Bearer Tokens
  {
    category: 'Bearer Token',
    regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    placeholder: 'Bearer [REDACTED_AUTH_TOKEN]',
  },
  // 7. Passwords in URLs or Configs
  {
    category: 'Password Assignment',
    regex: /(password|passwd|pwd|secret|token|api_key|apikey|app_secret)\s*[:=]\s*["']?([^\s"',;]+)["']?/gi,
    placeholder: '$1: [REDACTED_SECRET]',
  },
  // 8. Basic Auth Header
  {
    category: 'Basic Auth',
    regex: /Basic\s+[a-zA-Z0-9+/=]{16,}/gi,
    placeholder: 'Basic [REDACTED_BASIC_AUTH]',
  },
  // 9. AWS Keys
  {
    category: 'AWS Access Key',
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
    placeholder: '[REDACTED_AWS_KEY]',
  },
  // 10. PEM / Private Keys
  {
    category: 'Private Key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    placeholder: '[REDACTED_PRIVATE_KEY_BLOCK]',
  },
  // 11. Credit Cards & CVVs
  {
    category: 'Credit Card',
    regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    placeholder: '[REDACTED_CARD_NUMBER]',
  },
  {
    category: 'CVV',
    regex: /\b(?:cvv|cvc|security code)\s*[:=]\s*\d{3,4}\b/gi,
    placeholder: 'cvv: [REDACTED]',
  },
];

/**
 * Sanitizes a string, stripping out API keys, tokens, passwords, and sensitive credentials
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let text = input;

  for (const item of REDACTION_PATTERNS) {
    text = text.replace(item.regex, (match, ...groups) => {
      // If the pattern has group references like '$1: [REDACTED_SECRET]'
      if (item.placeholder.includes('$1') && groups.length > 0) {
        return `${groups[0]}: [REDACTED_SECRET]`;
      }
      return item.placeholder;
    });
  }

  return text;
}

/**
 * Deeply sanitizes an object, redacting secrets from all string properties recursively
 */
export function redactObjectSecrets<T>(obj: T): T {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return redactSecrets(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObjectSecrets(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const copy: any = {};
    for (const [key, val] of Object.entries(obj)) {
      // Sensitive key name detection
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('api_key') ||
          lowerKey.includes('cookie')) &&
        typeof val === 'string' &&
        val.length > 4
      ) {
        copy[key] = '[REDACTED_SECRET]';
      } else {
        copy[key] = redactObjectSecrets(val);
      }
    }
    return copy;
  }
  return obj;
}

/**
 * Audit function checking if a text contains any credentials
 */
export function auditSecrets(input: string): RedactionResult {
  if (!input) {
    return { redactedText: '', secretsDetectedCount: 0, redactedCategories: [] };
  }

  let text = input;
  let count = 0;
  const categories: string[] = [];

  for (const item of REDACTION_PATTERNS) {
    const matches = text.match(item.regex);
    if (matches && matches.length > 0) {
      count += matches.length;
      categories.push(item.category);
      text = text.replace(item.regex, (match, ...groups) => {
        if (item.placeholder.includes('$1') && groups.length > 0) {
          return `${groups[0]}: [REDACTED_SECRET]`;
        }
        return item.placeholder;
      });
    }
  }

  return {
    redactedText: text,
    secretsDetectedCount: count,
    redactedCategories: Array.from(new Set(categories)),
  };
}
