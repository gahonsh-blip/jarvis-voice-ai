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

  // Regression: a second live probe found six more token families that passed
  // through redaction byte-for-byte. Each test uses the token *bare* (no
  // `NAME=` prefix), because that is how it appears in a screenshot or a
  // terminal stream — the path this function exists to protect. A labelled
  // form would be caught by the engine's separate keyword pattern and so would
  // not actually prove the token-family pattern works.
  it('redacts a Google OAuth client secret (GOCSPX-)', () => {
    const secret = 'GOCSPX-' + 'aBcDeFgHiJkLmNoPqRsTuVwX';
    expect(redactSecrets(secret)).not.toContain(secret);
  });

  it('redacts a Discord bot token', () => {
    const token = 'MTAx' + 'a'.repeat(20) + '.QrsTuv.' + 'b'.repeat(30);
    expect(redactSecrets(token)).not.toContain(token);
  });

  it('redacts a GitLab access token (glpat-)', () => {
    const token = 'glpat-' + 'aBcDeFgHiJkLmNoPqRsTuVwX';
    expect(redactSecrets(token)).not.toContain(token);
  });

  it('redacts a DigitalOcean personal access token', () => {
    const token = 'dop_v1_' + '0123456789abcdef'.repeat(4);
    expect(redactSecrets(token)).not.toContain(token);
  });

  it('redacts a labelled AWS secret access key', () => {
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const out = redactSecrets(`aws_secret_access_key = ${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED_AWS_SECRET]');
  });

  it('redacts the password in a database connection string but keeps the host', () => {
    const out = redactSecrets('postgres://admin:hunter2pass@db.internal:5432/prod');
    expect(out).not.toContain('hunter2pass');
    expect(out).toContain('db.internal');
    const out2 = redactSecrets('mongodb+srv://user:SuperSecret123@cluster0.example.net/db');
    expect(out2).not.toContain('SuperSecret123');
    expect(out2).toContain('cluster0.example.net');
  });

  it('does not over-redact ordinary dotted prose or URLs', () => {
    // Guards the Discord-shaped pattern against matching a version string or a
    // versioned hostname, which would corrupt legitimate log output.
    expect(redactSecrets('running node 20.11.0 build')).toBe('running node 20.11.0 build');
    expect(redactSecrets('fetching https://example.com/releases/v1.2.3/notes')).toContain(
      'https://example.com/releases/v1.2.3/notes',
    );
    expect(redactSecrets('please read this and that page')).toBe('please read this and that page');
  });
});