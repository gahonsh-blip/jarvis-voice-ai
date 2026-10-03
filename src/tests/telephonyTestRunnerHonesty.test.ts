import { describe, it, expect } from 'vitest';
import { runTelephonyTestSuite } from '../utils/telephonyTestRunner';

// Zero-fake-success guard for the bundled 20-case telephony suite itself.
//
// Four of the suite's assertions used to encode fabricated success: reciting
// unverified clinic hours as fact, crediting a simulated handoff as
// CONFIRMED, and reporting an outbound call as "placed" with only a simulation
// adapter active. Those expectations are now honest, so the suite must report
// a clean run *and* its outbound case must carry actionExecuted === false —
// proving the suite cannot pass by narrating work no carrier performed.

describe('bundled telephony test suite reports honest results', () => {
  it('passes every case and never credits a simulated outbound as executed', async () => {
    const summary = await runTelephonyTestSuite();

    const failed = summary.results.filter((r) => !r.passed);
    expect(
      failed.map((r) => `#${r.id} ${r.name}: ${r.actualOutput}`),
    ).toEqual([]);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.total);

    const outbound = summary.results.find((r) => r.id === 17);
    expect(outbound).toBeDefined();
    expect(outbound!.actualOutput).toContain('actionExecuted: false');
    expect(outbound!.actualOutput).toContain('TELEPHONY_NOT_CONFIGURED');
  });
});
