/**
 * Truthfulness helpers for the email / outbound communications surface.
 *
 * The Autonomous Tools HUD rendered an emerald badge reading `READY` whenever
 * `GMAIL_USER` and `GMAIL_APP_PASSWORD` were present, and the Integrations
 * Matrix counted that same credential presence as `REAL_WORKING` with the
 * reason "SMTP Conduit verified for client notifications and quotations".
 * No SMTP client, transport, or send route exists anywhere in this codebase —
 * there is no nodemailer dependency, no socket opened to port 465/587, and no
 * `/api/.../email/send` endpoint. The badge therefore advertised a working
 * outbound conduit that had never been built, let alone exercised. A user
 * reading `READY` could reasonably believe a quotation had been dispatched.
 *
 * This module makes the missing capability explicit so no surface can render a
 * credential check as proof of a delivery path.
 */

export const EMAIL_TRANSPORT_ID = 'smtp-outbound';

/**
 * A transport is "implemented" only when this build contains code that can
 * actually open a connection to a mail server. It does not. Credentials alone
 * can never satisfy this predicate, so it is a constant here rather than a
 * runtime check that could drift back to a credential test.
 */
export function isEmailTransportImplemented(): boolean {
  return false;
}

export type EmailConduitStatus =
  | 'NOT_CONFIGURED'
  | 'CREDENTIALS_PRESENT_NO_TRANSPORT';

export interface EmailConduitTruth {
  /** Backwards-compatible flag: credentials for an SMTP account are present. */
  configured: boolean;
  /** What may be claimed about the outbound path right now. */
  status: EmailConduitStatus;
  /** Short badge label. Never says READY while no sender exists. */
  label: string;
  /** Because this is the honesty notice other surfaces reuse. */
  summary: string;
}

/** Capability text that must not promise a send that cannot happen. */
export const EMAIL_CAPABILITY_NOTE =
  'Outbound SMTP transport is NOT implemented in this build — credentials may be present for a future sender, but no email can be sent.';

export function describeEmailConduit(credentialsPresent: boolean): EmailConduitTruth {
  if (!credentialsPresent) {
    return {
      configured: false,
      status: 'NOT_CONFIGURED',
      label: 'NOT CONFIGURED',
      summary: 'No SMTP credentials are present in this environment.',
    };
  }
  return {
    configured: true,
    status: 'CREDENTIALS_PRESENT_NO_TRANSPORT',
    label: 'CREDENTIALS ONLY — NO SENDER',
    summary:
      'SMTP credentials are present, but this build contains no outbound email transport, so no message can be sent.',
  };
}
