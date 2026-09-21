import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { realEmailStatus, getIntegrationsAuditReport } from '../../server_tools';
import {
  describeEmailConduit,
  isEmailTransportImplemented,
  EMAIL_CAPABILITY_NOTE,
} from '../utils/emailConduitTruth';

// Regression guard for fabricated success on the outbound email surface.
//
// `/api/tools/email/status` reported `configured: true` from the mere presence
// of GMAIL_USER + GMAIL_APP_PASSWORD, and both the Autonomous Tools HUD and the
// Integrations Matrix turned that into an emerald `READY` badge and a
// `REAL_WORKING` row ("SMTP Conduit verified for client notifications and
// quotations"). No SMTP client, socket, or send route exists in this build, so
// the credential check was being presented as a working delivery path.

const EMAIL_ENV_KEYS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'SMTP_USER', 'SMTP_PASS', 'SMTP_HOST'];
const savedEnv: Record<string, string | undefined> = {};

function clearEmailEnv() {
  for (const key of EMAIL_ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  for (const key of EMAIL_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of EMAIL_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('email conduit status never implies a working sender', () => {
  it('reports NOT_CONFIGURED when no credentials are present', () => {
    const status = realEmailStatus();
    expect(status.configured).toBe(false);
    expect(status.status).toBe('NOT_CONFIGURED');
    expect(status.transportImplemented).toBe(false);
  });

  it('does not claim a transport exists even when credentials are present', () => {
    process.env.GMAIL_USER = 'client.enterprise@techcorp.io';
    process.env.GMAIL_APP_PASSWORD = 'app-password-placeholder';
    const status = realEmailStatus();
    // Credentials are visible...
    expect(status.configured).toBe(true);
    // ...but that may never be upgraded into a working outbound conduit.
    expect(status.transportImplemented).toBe(false);
    expect(status.status).toBe('CREDENTIALS_PRESENT_NO_TRANSPORT');
    expect(status.message).toContain(EMAIL_CAPABILITY_NOTE);
  });

  it('the message no longer promises Level 4-confirmed sends', () => {
    process.env.GMAIL_USER = 'client.enterprise@techcorp.io';
    process.env.GMAIL_APP_PASSWORD = 'app-password-placeholder';
    const status = realEmailStatus();
    expect(status.message).not.toMatch(/Level 4 confirmation required for all sends/i);
    expect(status.message).not.toMatch(/\bverified\b/i);
  });

  it('the email integration is never REAL_WORKING, credentials or not', () => {
    const withoutCreds = getIntegrationsAuditReport();
    expect(withoutCreds.items.find((i) => i.id === 'email')?.status).not.toBe('REAL_WORKING');

    process.env.GMAIL_USER = 'client.enterprise@techcorp.io';
    process.env.GMAIL_APP_PASSWORD = 'app-password-placeholder';
    const withCreds = getIntegrationsAuditReport();
    const email = withCreds.items.find((i) => i.id === 'email');
    expect(email?.status).toBe('NOT_AVAILABLE');
    expect(email?.reason).not.toMatch(/\bverified\b/i);
    expect(email?.capabilities.join(' ')).toMatch(/not implemented/i);
  });

  it('describeEmailConduit labels credentials without a sender as such', () => {
    expect(describeEmailConduit(false).label).toBe('NOT CONFIGURED');
    const present = describeEmailConduit(true);
    expect(present.label).not.toBe('READY');
    expect(present.status).toBe('CREDENTIALS_PRESENT_NO_TRANSPORT');
  });

  it('no outbound email transport is implemented in this build', () => {
    // If a real SMTP sender is ever added, this assertion must be flipped to
    // true in the same change, or the guard is lying in the other direction.
    expect(isEmailTransportImplemented()).toBe(false);
  });
});
