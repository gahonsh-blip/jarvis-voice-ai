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

describe('the offline intent engine does not fabricate telemetry or health', () => {
  const engineSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'),
    'utf8',
  );
  const engineFlat = engineSource.replace(/\s+/g, ' ');

  it('the morning briefing does not fall back to invented telemetry constants', () => {
    // Each of these was a `?? <plausible constant>` default, so a briefing with
    // no phone attached reported 78% battery, 27°C, 5 notifications, 3 events
    // and 2 emails as if measured.
    expect(engineFlat).not.toMatch(/battery\?\.level\s*\?\?\s*\d/);
    expect(engineFlat).not.toMatch(/temperatureC\s*\?\?\s*\d/);
    expect(engineFlat).not.toMatch(/humidity\s*\?\?\s*\d/);
    expect(engineFlat).not.toMatch(/totalCount\s*\?\?\s*\d/);
    expect(engineFlat).not.toMatch(/todayEventsCount\s*\?\?\s*\d/);
    expect(engineFlat).not.toMatch(/unreadCount\s*\?\?\s*\d/);
  });

  it('the weather inquiry does not invent a reading when no source is connected', () => {
    // It used to answer 27°C / 48% / 'New Delhi' with no weather provider.
    expect(engineFlat).not.toContain("condition || 'Clear Sky'");
    expect(engineFlat).not.toContain("location || 'New Delhi'");
  });

  it('the morning briefing does not default every permission to granted', () => {
    expect(engineFlat).not.toMatch(/BATTERY_STATUS: true, WEATHER_LOCATION: true, NOTIFICATIONS: true/);
  });

  it('the morning briefing does not assert unmeasured system health', () => {
    expect(engineFlat).not.toContain('All cloud nodes and local services are nominal');
    expect(engineFlat).not.toContain('All systems operational.');
  });

  it('the how-are-you intent does not claim all systems are nominal', () => {
    expect(engineFlat).not.toContain('All systems nominal. Ready to assist.');
    expect(flat).not.toContain('All systems nominal. Ready to assist.');
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

  it('the Oracle firewall rules are not asserted active without a probe', () => {
    // Every declared rule must be reported as never probed. The server cannot
    // observe VCN reachability, so a `firewallRules` entry with `active: true`
    // is an invented security claim.
    const rulesBlock = flat.match(/firewallRules:\s*\[[\s\S]*?\]/)?.[0] ?? '';
    expect(rulesBlock).toContain('active: null');
    expect(rulesBlock).not.toMatch(/active:\s*true/);
  });

  it('the modal does not render "Zero Accidental Ingress" unconditionally', () => {
    const modalFlat = fs
      .readFileSync(path.resolve(process.cwd(), 'src/components/OracleCloudModal.tsx'), 'utf8')
      .replace(/\s+/g, ' ');
    // The claim must sit behind the verified summary: it appears in the source
    // only after the guard that requires every rule to have been observed.
    expect(modalFlat).toContain('firewallSummary.verified ? (');
    expect(modalFlat).toContain('Ingress NOT_PROBED (');
    const guardAt = modalFlat.indexOf('firewallSummary.verified ? (');
    const claimAt = modalFlat.indexOf('Zero Accidental Ingress');
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(claimAt).toBeGreaterThan(guardAt);
    // Unprobed rules must render as a state, not a green check.
    expect(modalFlat).toContain('resolveFirewallRuleState(rule.active)');
  });
});

describe('the Oracle Cloud modal renders the payload, never a plausible default', () => {
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/OracleCloudModal.tsx'),
    'utf8',
  );
  const modalFlat = modalSource.replace(/\s+/g, ' ');

  it('the uptime card carries no hardcoded 342-hour fallback', () => {
    // `{vmStatus?.uptimeHours || 342}` also rewrote a measured 0 into 342.
    expect(modalFlat).not.toContain('|| 342');
    expect(modalFlat).not.toMatch(/uptimeHours\s*\|\|/);
  });

  it('the SSH card carries no hardcoded address', () => {
    expect(modalFlat).not.toContain('129.154.42.108');
    expect(modalFlat).not.toMatch(/publicIp\s*\|\|/);
  });

  it('the status card reports the server state, not a constant ONLINE', () => {
    expect(modalFlat).not.toMatch(/>\s*ONLINE\s*</);
    expect(modalFlat).toContain('runState ?? UNKNOWN');
  });

  it('the normalisers are actually used for the metric cards', () => {
    expect(modalFlat).toContain('normalizeUptimeHours(vmStatus?.uptimeHours)');
    expect(modalFlat).toContain('normalizePublicIp(vmStatus?.publicIp)');
    expect(modalFlat).toContain('normalizeVmStatus(vmStatus?.status)');
    expect(modalFlat).toContain('normalizeMetricPercent(vmStatus?.metrics?.cpuUsage)');
  });
});

describe('the Oracle instance run state and address are never seeded', () => {
  it('the state does not assert a constant RUNNING status or a literal public IP', () => {
    // These are OCI control-plane facts. A seeded value passes through the UI
    // normalisers (which can only reject a *missing* value), so it rendered as a
    // measured run state and was copied to the clipboard as an ssh target.
    expect(flat).not.toMatch(/status:\s*'RUNNING'\s*as const/);
    expect(flat).not.toContain("publicIp: '129.154.42.108'");
    expect(flat).not.toContain('129.154.42.108');
  });

  it('both start unobserved and are filled only by the host observation', () => {
    expect(flat).toContain('publicIp: null as string | null');
    expect(flat).toContain("status: null as 'RUNNING' | 'PROVISIONING' | 'STOPPED' | null");
    expect(flat).toContain('observeOciInstance()');
    expect(flat).toContain('observeInstanceFromHost(');
  });

  it('the Telegram reply names an unobserved state/address rather than a value', () => {
    // The previous reply interpolated `oracleCloudState.status` and
    // `oracleCloudState.publicIp` directly, so a null would print as "null" and
    // a seeded value printed as fact. It must go through the describers.
    expect(flat).toContain('describeRunState(oracleCloudState.status)');
    expect(flat).toContain('describePublicIp(oracleCloudState.publicIp)');
  });

  it('the modal header labels the shape/specs as a declared plan, not a reading', () => {
    const modalFlat = fs
      .readFileSync(path.resolve(process.cwd(), 'src/components/OracleCloudModal.tsx'), 'utf8')
      .replace(/\s+/g, ' ');
    expect(modalFlat).toContain('Declared plan:');
    expect(modalFlat).toContain('not read from a running instance');
  });
});