import { describe, it, expect } from 'vitest';
import { getIntegrationsAuditReport } from '../../server_tools';

// Regression guard for fabricated success in the Truth-in-Execution Integrations
// Matrix. The Oracle Cloud ARM VM entry was hardcoded to REAL_WORKING with an
// invented public IP and uptime, which inflated the summary's "connected" count
// even though no Oracle API credential or VM telemetry source exists here. The
// spoken audit also called env-var presence "verified real integrations online".

describe('integrations audit never fabricates a working integration', () => {
  it('counts every item exactly once across the three statuses', () => {
    const report = getIntegrationsAuditReport();
    const { total, connected, notConfigured, notAvailable } = report.summary;
    expect(total).toBe(report.items.length);
    expect(connected + notConfigured + notAvailable).toBe(total);
  });

  it('summary.connected only counts REAL_WORKING items', () => {
    const report = getIntegrationsAuditReport();
    const realWorking = report.items.filter((i) => i.status === 'REAL_WORKING').length;
    expect(report.summary.connected).toBe(realWorking);
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
    expect(oracle?.status).not.toBe('REAL_WORKING');
    expect(oracle?.status).toBe('NOT_AVAILABLE');
  });

  it('an integration is only REAL_WORKING when its credentials are visible here', () => {
    // With no integration env vars set in the test environment, nothing may be
    // reported as a live working integration.
    const report = getIntegrationsAuditReport();
    const missingCredential = report.items.filter(
      (i) => i.status === 'REAL_WORKING' && i.requiredEnvVars.some((v) => !v.configured)
    );
    expect(missingCredential).toEqual([]);
  });
});