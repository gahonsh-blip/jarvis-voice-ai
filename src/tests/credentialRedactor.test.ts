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
});