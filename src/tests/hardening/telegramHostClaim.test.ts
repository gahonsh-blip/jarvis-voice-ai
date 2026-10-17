import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  telegramHostClaim,
  telegramGatewayWelcome,
  telegramSeedMessages,
} from '../../utils/hardening/telegramHostClaim';

// server.ts binds a port on import, so the wiring assertions read the source
// text, matching the convention in billingEntitlementTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('the Telegram hosting claim is derived from a measured host identity', () => {
  it('does not assert an Oracle VM when the hostname is not Oracle-like', () => {
    const line = telegramHostClaim({ hostname: 'sandbox-01', isOracleLike: false });
    expect(line).not.toContain('Connected to your Oracle');
    expect(line).toContain('NOT verified');
    expect(line).toContain('sandbox-01');
  });

  it('qualifies even a matching hostname as a hostname match, not control-plane confirmation', () => {
    const line = telegramHostClaim({ hostname: 'oracle-arm-1', isOracleLike: true });
    expect(line).toContain('hostname match only');
    expect(line).toContain('control plane is not queried');
  });
});

describe('the Telegram gateway seeds no fabricated transcript', () => {
  it('seeds exactly one startup notice, not an exchanged conversation', () => {
    const seed = telegramSeedMessages({ hostname: 'sandbox-01', isOracleLike: false }, '2026-09-24T00:00:00Z');
    expect(seed).toHaveLength(1);
    expect(seed[0].sender).toBe('jarvis_bot');
    expect(seed[0].text).toContain('not a transcript');
    expect(seed[0].text).toContain('Work performed*: none');
  });

  it('never claims a project audit or a deployment sync in the seed', () => {
    const welcome = telegramGatewayWelcome({ hostname: 'sandbox-01', isOracleLike: false });
    expect(welcome).not.toContain('PROJECT AUDIT REPORT');
    expect(welcome).not.toContain('deployment sync complete');
    expect(welcome).not.toContain('0 open issues');
  });
});

describe('server.ts no longer hardcodes the Oracle/daemon claims', () => {
  it('removes the seeded gateway-online and project-audit messages', () => {
    expect(serverFlat).not.toContain('HERMES JARVIS MOBILE GATEWAY ONLINE');
    expect(serverFlat).not.toContain('PROJECT AUDIT REPORT');
  });

  it('removes the /start Oracle VM and 24/7 daemon assertion', () => {
    expect(serverFlat).not.toContain('Connected to your Oracle Always Free ARM VM (24/7 Daemon Active)');
  });

  it('builds the /start hosting line from the helper', () => {
    expect(serverFlat).toContain('${telegramHostClaim(getLocalHostIdentity())}');
  });

  it('seeds the gateway history from the helper', () => {
    expect(serverFlat).toContain('let telegramMessages = telegramSeedMessages(getLocalHostIdentity());');
  });
});
