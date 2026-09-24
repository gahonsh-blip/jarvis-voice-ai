import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processUptimeLabel } from '../../utils/hardening/processUptimeTruth';

// `oracleCloudState.uptimeHours` is the lifetime of this Node process, not the
// Oracle instance. It was printed as `Uptime: Nh` in the Telegram reply headed
// "ORACLE CLOUD ARM VM STATUS" and as "Nh hours continuous" on the modal's
// instance card, so a reader took a process measurement for a cloud fact.
// server.ts binds a port on import, so the reply assertions read the source
// text, matching billingEntitlementTruth.test.ts.

describe('processUptimeLabel names the process, never the instance', () => {
  it('labels a measured lifetime as the process uptime', () => {
    expect(processUptimeLabel(7)).toBe('this JARVIS process: 7h');
  });

  it('preserves a measured zero', () => {
    expect(processUptimeLabel(0)).toBe('this JARVIS process: 0h');
  });

  it('floors a fractional reading', () => {
    expect(processUptimeLabel(7.9)).toBe('this JARVIS process: 7h');
  });

  it('reports an unmeasured or nonsensical value as not measured', () => {
    expect(processUptimeLabel(undefined)).toContain('not measured');
    expect(processUptimeLabel(null)).toContain('not measured');
    expect(processUptimeLabel(Number.NaN)).toContain('not measured');
    expect(processUptimeLabel(-1)).toContain('not measured');
    expect(processUptimeLabel('7')).toContain('not measured');
  });

  it('never labels the figure as instance or VM uptime', () => {
    for (const value of [0, 7, 342, undefined, -1]) {
      const label = processUptimeLabel(value).toLowerCase();
      expect(label).not.toContain('vm uptime');
      expect(label).not.toContain('instance uptime');
    }
  });
});

describe('the Telegram cloud reply does not present process uptime as VM uptime', () => {
  const serverFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
    .replace(/\s+/g, ' ');

  it('no longer prints the raw figure as the VM uptime', () => {
    // The removed literal was `• *Status*: ${describeRunState(...)} (Uptime: ${...uptimeHours}h)`.
    expect(serverFlat).not.toMatch(/Uptime: \$\{oracleCloudState\.uptimeHours\}h/);
  });

  it('builds the uptime line from the process-uptime helper', () => {
    expect(serverFlat).toContain('processUptimeLabel(oracleCloudState.uptimeHours)');
  });

  it('states that instance uptime is not measured here', () => {
    expect(serverFlat).toContain('instance uptime is a control-plane fact this server does not measure');
  });
});

describe('the Oracle modal does not present process uptime as instance uptime', () => {
  const modalFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'src/components/OracleCloudModal.tsx'), 'utf8')
    .replace(/\s+/g, ' ');

  it('no longer claims hours continuous on the instance card', () => {
    expect(modalFlat).not.toContain('hours continuous');
  });

  it('consistently uses the process-uptime helper', () => {
    expect(modalFlat).toContain('processUptimeLabel(uptimeHours)');
  });
});