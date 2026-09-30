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

const REDACTION_PATTERNS: {
  category: string;
  regex: RegExp;
  placeholder: string;
  // Optional custom replacer for patterns that must preserve surrounding text
  // (e.g. a connection string, where only the password is secret).
  replacer?: (match: string, ...groups: string[]) => string;
}[] = [
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
  // 3. Telegram Bot Tokens. The leading lookbehind replaces \b: the token is
  // normally embedded after "bot" in a URL, where \b would never match.
  {
    category: 'Telegram Bot Token',
    regex: /(?<![0-9])[0-9]{8,11}:[a-zA-Z0-9_-]{35}\b/g,
    placeholder: '[REDACTED_TELEGRAM_BOT_TOKEN]',
  },
  // 4. JWT Web Tokens
  {
    category: 'JWT Token',
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\b/g,
    placeholder: '[REDACTED_JWT_TOKEN]',
  },
  // 5. OpenAI API Keys. The previous pattern contained a stray "T3BlbkFJ"
  // fragment that broke the quantifier, so no key ever matched. The trailing
  // bare-\b alternative also matched any 48+ character run, redacting commit
  // hashes and other harmless identifiers, so it was removed.
  {
    category: 'OpenAI Key',
    regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/g,
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
  // 12. Stripe secret/restricted keys (`sk_live_`, `sk_test_`, `rk_live_`, `rk_test_`)
  {
    category: 'Stripe Key',
    regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    placeholder: '[REDACTED_STRIPE_KEY]',
  },
  // 13. Slack tokens (`xoxb-`/`xoxp-`/`xoxa-`/`xoxr-`/`xoxs-`)
  {
    category: 'Slack Token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    placeholder: '[REDACTED_SLACK_TOKEN]',
  },
  // 14. npm automation/publish tokens
  {
    category: 'npm Token',
    regex: /\bnpm_[A-Za-z0-9]{36,}/g,
    placeholder: '[REDACTED_NPM_TOKEN]',
  },
  // 15. Hugging Face access tokens
  {
    category: 'Hugging Face Token',
    regex: /\bhf_[A-Za-z0-9]{34,}\b/g,
    placeholder: '[REDACTED_HF_TOKEN]',
  },
  // 16. SendGrid API keys (`SG.<22>.<43>`)
  {
    category: 'SendGrid Key',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    placeholder: '[REDACTED_SENDGRID_KEY]',
  },
  // 17. Google OAuth client secrets (`GOCSPX-...`)
  {
    category: 'Google OAuth Client Secret',
    regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
    placeholder: '[REDACTED_GOOGLE_OAUTH_SECRET]',
  },
  // 18. Discord bot tokens (`<base64 id>.<6-char timestamp>.<27+ char hmac>`)
  {
    category: 'Discord Bot Token',
    regex: /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g,
    placeholder: '[REDACTED_DISCORD_TOKEN]',
  },
  // 19. GitLab personal/project access tokens (`glpat-...`)
  {
    category: 'GitLab Token',
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    placeholder: '[REDACTED_GITLAB_TOKEN]',
  },
  // 20. DigitalOcean personal access tokens (`dop_v1_` + 64 hex)
  {
    category: 'DigitalOcean Token',
    regex: /\bdop_v1_[a-f0-9]{64}\b/g,
    placeholder: '[REDACTED_DIGITALOCEAN_TOKEN]',
  },
  // 21. AWS secret access keys. These have no fixed prefix, so they are only
  // unambiguous when labelled; anchor on the label to avoid redacting prose.
  {
    category: 'AWS Secret Access Key',
    regex: /(aws_secret_access_key|secret_access_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    placeholder: 'AWS_SECRET_ACCESS_KEY: [REDACTED_AWS_SECRET]',
  },
  // 22. Database connection-string passwords (`scheme://user:password@host`).
  // Only the password is secret; the scheme, user and host are preserved so the
  // line stays useful in a log, mirroring the Password Assignment placeholder.
  {
    category: 'Connection String Password',
    regex: /\b([a-z][a-z0-9+.-]*:\/\/[^:@\s/]+):([^@\s/]+)@/gi,
    placeholder: '$1:[REDACTED_SECRET]@',
    replacer: (match, schemeUser, password) => `${schemeUser}:[REDACTED_SECRET]@`,
  },
  // 23. Groq API keys (`gsk_` + long body)
  {
    category: 'Groq Key',
    regex: /\bgsk_[A-Za-z0-9]{40,}\b/g,
    placeholder: '[REDACTED_GROQ_KEY]',
  },
  // 24. Perplexity API keys (`pplx-` + body)
  {
    category: 'Perplexity Key',
    regex: /\bpplx-[A-Za-z0-9]{20,}\b/g,
    placeholder: '[REDACTED_PERPLEXITY_KEY]',
  },
  // 25. Notion integration tokens. Current `ntn_` tokens and the legacy
  // `secret_` internal-integration tokens are both provider-issued secrets.
  {
    category: 'Notion Token',
    regex: /\bntn_[A-Za-z0-9]{20,}\b/g,
    placeholder: '[REDACTED_NOTION_TOKEN]',
  },
  {
    category: 'Notion Legacy Token',
    regex: /\bsecret_[A-Za-z0-9]{20,}\b/g,
    placeholder: '[REDACTED_NOTION_TOKEN]',
  },
  // 26. Shopify access / shared-secret / private-app tokens
  {
    category: 'Shopify Token',
    regex: /\bshp(?:at|ss|ca|pa)_[A-Za-z0-9]{16,}\b/g,
    placeholder: '[REDACTED_SHOPIFY_TOKEN]',
  },
  // 27. Linear API keys (`lin_api_` + body)
  {
    category: 'Linear API Key',
    regex: /\blin_api_[A-Za-z0-9]{20,}\b/g,
    placeholder: '[REDACTED_LINEAR_KEY]',
  },
  // 28. Slack incoming-webhook URLs. The whole `/services/...` path is the
  // secret; redacting it also removes the T/B channel ids, which is correct —
  // the URL alone is enough to post to the workspace.
  {
    category: 'Slack Webhook URL',
    regex: /https?:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/g,
    placeholder: '[REDACTED_SLACK_WEBHOOK_URL]',
  },
  // 29. Azure Storage / Cosmos connection-string account keys
  {
    category: 'Azure Account Key',
    regex: /AccountKey=[A-Za-z0-9+/=]{40,}/g,
    placeholder: '[REDACTED_AZURE_ACCOUNT_KEY]',
  },
  // 30. Firebase / Google browser API keys. The specific `AIzaSy` pattern above
  // only covers server keys; a Firebase web config key uses the same `AIza`
  // marker but not the `Sy` infix, so it needs its own branch.
  {
    category: 'Firebase API Key',
    regex: /\bAIza[A-Za-z0-9_\-]{30,}\b/g,
    placeholder: '[REDACTED_FIREBASE_KEY]',
  },
  // 31. Resend API keys (`re_` + body). The body length floor keeps the ordinary
  // English "re" prefix and short identifiers from matching.
  {
    category: 'Resend Key',
    regex: /\bre_[A-Za-z0-9]{20,}\b/g,
    placeholder: '[REDACTED_RESEND_KEY]',
  },
  // 32. Meta / Facebook Graph API access tokens (`EAA` + long body). These are
  // what `FACEBOOK_PAGE_ACCESS_TOKEN` and `INSTAGRAM_ACCESS_TOKEN` carry; the
  // `EAA` marker is stable across app and page tokens and does not occur in
  // ordinary prose.
  {
    category: 'Meta Access Token',
    regex: /\bEAA[A-Za-z0-9]{40,}\b/g,
    placeholder: '[REDACTED_META_TOKEN]',
  },
  // 33. Google OAuth refresh tokens (`1//` + body). `YOUTUBE_REFRESH_TOKEN` and
  // the Gmail/Calendar refresh tokens use this form. The `1//` marker is not a
  // word boundary, so a lookbehind guards against matching inside a longer run.
  {
    category: 'Google OAuth Refresh Token',
    regex: /(?<![A-Za-z0-9])1\/\/[0-9A-Za-z_-]{20,}/g,
    placeholder: '[REDACTED_GOOGLE_OAUTH_REFRESH_TOKEN]',
  },
  // 34. Google OAuth authorization codes (`4/0A` + body). These are short-lived
  // but exchangeable for refresh tokens, so they are treated as secrets.
  {
    category: 'Google OAuth Authorization Code',
    regex: /(?<![A-Za-z0-9])4\/0A[A-Za-z0-9_-]{20,}/g,
    placeholder: '[REDACTED_GOOGLE_OAUTH_CODE]',
  },
  // 35. Google OAuth access tokens (`ya29.` + body), issued in the auth-code
  // exchange flow.
  {
    category: 'Google OAuth Access Token',
    regex: /\bya29\.[A-Za-z0-9_-]{20,}\b/g,
    placeholder: '[REDACTED_GOOGLE_OAUTH_ACCESS_TOKEN]',
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
      if (item.replacer) {
        return item.replacer(match, ...(groups as string[]));
      }
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
        if (item.replacer) {
          return item.replacer(match, ...(groups as string[]));
        }
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
