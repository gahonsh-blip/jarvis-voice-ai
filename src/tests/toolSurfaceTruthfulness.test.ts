import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for fabricated success across the intent/tool surfaces in
// server.ts. server.ts binds a port on import, so it cannot be imported here;
// these assertions read the source text instead. They are deliberately narrow:
// each checks that a *specific* literal that once asserted un-performed work
// has not come back, not that the file is free of any similar pattern.
//
// Fixed in this cycle:
//  - the Telegram `check_project` intent hardcoded "All active repositories
//    inspected", a clean branch, an Oracle VM uptime and "All tests green";
//  - `oracleCloudState.uptimeHours` added a hardcoded +342 hours;
//  - `/api/daemon/status` reported integrations.oracleCloud as a live
//    'RUNNING' integration with a fixed price, and read the LinkedIn author
//    URN straight from process.env, bypassing the encrypted store.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

// Collapse whitespace so a reformatted literal still matches.
const flat = serverSource.replace(/\s+/g, ' ');

describe('intent and status surfaces never fabricate success', () => {
  it('check_project does not claim all repositories were inspected', () => {
    expect(flat).not.toContain('All active repositories inspected');
  });

  it('check_project does not claim the test suite is green', () => {
    expect(flat).not.toContain('All tests green');
  });

  it('the Oracle uptime figure carries no hardcoded offset', () => {
    expect(flat).not.toMatch(/uptimeHours:[^,;]*\+\s*342/);
  });

  it('the daemon status does not report Oracle Cloud as a running integration', () => {
    // The hardcoded tier/status/cost triple that appeared under
    // integrations.oracleCloud.
    expect(flat).not.toContain("tier: 'Always Free (₹0 / month)', status: 'RUNNING', cost: '₹0.00 Guaranteed'");
    expect(flat).not.toContain("status: 'RUNNING', cost: '₹0.00 Guaranteed'");
  });

  it('the integrations matrix does not read the LinkedIn URN from raw env', () => {
    // It must go through the decrypted store, not process.env directly.
    expect(flat).not.toContain('authorUrnConfigured: Boolean(process.env.LINKEDIN_AUTHOR_URN)');
  });

  it('the Telegram test signal does not assert an unverified mobile gateway state', () => {
    expect(flat).not.toContain('Mobile gateway is online and securely authenticated');
  });

  it('the voice fallback does not claim unverified cloud health or provider identity', () => {
    expect(flat).not.toContain('All cloud systems operating at 100% efficiency');
    expect(flat).not.toContain('your autonomous mobile-controlled AI assistant running on Oracle Always Free cloud');
  });
});

describe('the truth-telling replacements are actually present', () => {
  it('check_project routes through the real git reader', () => {
    expect(flat).toContain("intentData.intent === 'check_project'");
    expect(serverSource).toMatch(/intent === 'check_project'[\s\S]{0,600}realGitStatus\(\)/);
  });

  it('the integrations matrix exposes metricsSource rather than a fixed status', () => {
    expect(flat).toContain('metricsSource: oracleCloudState.metricsSource');
  });
});