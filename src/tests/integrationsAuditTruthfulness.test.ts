import { describe, it, expect } from 'vitest';
import { getIntegrationsAuditReport } from '../../server_tools';

// Regression guard for fabricated success in the Truth-in-Execution Integrations
// Matrix. The Oracle Cloud ARM VM entry was hardcoded to a working status with an
// invented public IP and uptime, which inflated the summary's "connected" count
// even though no Oracle API credential or VM telemetry source exists here. The
// spoken audit also called env-var presence "verified real integrations online".
//
// The status vocabulary was then renamed REAL_WORKING -> CREDENTIALS_PRESENT:
// a matrix that makes no provider call cannot observe that an integration works,
// only that a credential string is visible in the environment. These tests pin
// that weaker, honest claim and forbid the stronger one.

describe('integrations audit never fabricates a working integration', () => {
  it('counts every item exactly once across the three statuses', () => {
    const report = getIntegrationsAuditReport();
    const { total, credentialsPresent, notConfigured, notAvailable } = report.summary;
    expect(total).toBe(report.items.length);
    expect(credentialsPresent + notConfigured + notAvailable).toBe(total);
  });

  it('summary.credentialsPresent only counts CREDENTIALS_PRESENT items', () => {
    const report = getIntegrationsAuditReport();
    const present = report.items.filter((i) => i.status === 'CREDENTIALS_PRESENT').length;
    expect(report.summary.credentialsPresent).toBe(present);
    expect(report.summary.notConfigured).toBe(
      report.items.filter((i) => i.status === 'NOT_CONNECTED').length
    );
    expect(report.summary.notAvailable).toBe(
      report.items.filter((i) => i.status === 'NOT_AVAILABLE').length
    );
  });

  it('does not claim the Oracle Cloud ARM VM is a live working integration', () => {
    const report = getIntegrationsAuditReport();
    const oracle = report.items.find((i) => i.id === 'oracle_cloud');
    expect(oracle).toBeDefined();
    expect(oracle?.status).not.toBe('CREDENTIALS_PRESENT');
    expect(oracle?.status).toBe('NOT_AVAILABLE');
  });

  it('an integration is only CREDENTIALS_PRESENT when its credentials are visible here', () => {
    // With no integration env vars set in the test environment, nothing may be
    // reported as connected.
    const report = getIntegrationsAuditReport();
    const missingCredential = report.items.filter(
      (i) => i.status === 'CREDENTIALS_PRESENT' && i.requiredEnvVars.some((v) => !v.configured)
    );
    expect(missingCredential).toEqual([]);
  });

  it('credential presence never claims authentication, validation or a live call', () => {
    // Force the credential-visible branch for every integration so the guard
    // covers the reasons that a bare env-var presence would otherwise dress up
    // as a successful provider connection.
    const saved: Record<string, string | undefined> = {};
    const keys = [
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'TELEGRAM_BOT_TOKEN',
      'GITHUB_TOKEN',
      'FACEBOOK_PAGE_ACCESS_TOKEN',
      'FACEBOOK_PAGE_ID',
      'INSTAGRAM_ACCESS_TOKEN',
      'INSTAGRAM_BUSINESS_ACCOUNT_ID',
      'YOUTUBE_API_KEY',
    ];
    try {
      for (const key of keys) {
        saved[key] = process.env[key];
        process.env[key] = 'placeholder-for-test';
      }
      const report = getIntegrationsAuditReport();
      const present = report.items.filter((i) => i.status === 'CREDENTIALS_PRESENT');
      // Sanity: the branch we are guarding must actually be exercised.
      expect(present.length).toBeGreaterThan(0);
      for (const item of present) {
        expect(item.reason).not.toMatch(/\b(authenticated|verified|active|online|working)\b/i);
        expect(item.reason).toMatch(/no .*call is made|not confirmed|not measured/i);
      }
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});