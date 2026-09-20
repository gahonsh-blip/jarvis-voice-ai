import { describe, it, expect } from 'vitest';
import { redactSecrets, auditSecrets, redactObjectSecrets } from '../utils/computerOperator/credentialRedactor';

describe('credential redaction', () => {
  it('redacts an OpenAI-style key', () => {
    const out = redactSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890ABCD');
    expect(out).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890ABCD');
  });

  it('redacts a Google API key', () => {
    const key = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
    expect(redactSecrets(`key=${key}`)).not.toContain(key);
  });

  it('redacts a GitHub token', () => {
    const token = 'ghp_' + 'a'.repeat(40);
    expect(redactSecrets(`token: ${token}`)).not.toContain(token);
  });

  it('redacts a Telegram bot token', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawx';
    expect(redactSecrets(`url https://api.telegram.org/bot${token}/sendMessage`)).not.toContain(token);
  });

  it('does not redact an ordinary 48-character identifier', () => {
    // A git SHA-256 or a hashed filename is not a secret. Over-redacting these
    // would corrupt legitimate content in logs and screenshots.
    const sha = 'a'.repeat(64);
    expect(redactSecrets(`commit ${sha}`)).toContain(sha);
  });

  it('redacts secrets nested inside objects', () => {
    const out = redactObjectSecrets({ headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456' } });
    expect(JSON.stringify(out)).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('redacts a password field by key name', () => {
    const out = redactObjectSecrets({ password: 'hunter2-long-enough' });
    expect(out.password).toBe('[REDACTED_SECRET]');
  });

  it('auditSecrets counts and categorises detections', () => {
    const result = auditSecrets(`ghp_${'b'.repeat(40)} and AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q`);
    expect(result.secretsDetectedCount).toBeGreaterThanOrEqual(2);
    expect(result.redactedCategories).toContain('GitHub Token');
  });

  it('leaves clean text untouched', () => {
    expect(redactSecrets('the battery is at 80 percent')).toBe('the battery is at 80 percent');
  });

  // Regression: a live probe found the following real token families passed
  // through redaction unchanged, so screenshots and command streams leaked them.
  it('redacts a Stripe secret key (sk_live_ / rk_test_)', () => {
    const body = '51H8xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    const sk = 'sk_' + 'live_' + body;
    const rk = 'rk_' + 'test_' + body;
    expect(redactSecrets(`stripe=${sk}`)).toContain('[REDACTED_STRIPE_KEY]');
    expect(redactSecrets(`stripe=${rk}`)).not.toContain(rk);
  });

  it('redacts Slack bot and user tokens', () => {
    const bot = ['xoxb', '123456789012', '1234567890123', 'AbCdEfGhIjKlMnOpQrStUvWx'].join('-');
    const user = ['xoxp', '123456789012', '1234567890123', '1234567890123', 'abcdefabcdefabcdefabcdefabcdefab'].join('-');
    expect(redactSecrets(`SLACK=${bot}`)).not.toContain(bot);
    expect(redactSecrets(`SLACK=${user}`)).not.toContain(user);
  });

  it('redacts an npm token', () => {
    const token = 'npm_' + 'a'.repeat(40);
    expect(redactSecrets(`//registry.npmjs.org/:_authToken=${token}`)).not.toContain(token);
  });

  it('redacts a Hugging Face token', () => {
    const token = 'hf_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7';
    expect(redactSecrets(`token=${token}`)).not.toContain(token);
  });

  it('redacts a SendGrid API key', () => {
    const token = 'SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43);
    expect(redactSecrets(`key=${token}`)).not.toContain(token);
  });

  it('does not redact a Twilio account SID (public identifier, not a secret)', () => {
    // The auth token is the secret; the SID is a public account identifier and
    // redacting it would only destroy legitimate logs.
    const sid = 'AC' + '0123456789abcdef0123456789abcdef';
    expect(redactSecrets(`account=${sid}`)).toContain(sid);
  });
});