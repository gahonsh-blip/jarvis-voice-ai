import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  describeBillingCost,
  describeDeclaredCost,
} from '../../utils/hardening/billingEntitlementTruth';

// server.ts binds a port on import, so the reply assertions read the source
// text, matching the convention in securityMatrixTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('the billing cost line only claims a guarantee it observed', () => {
  it('names the unqueried entitlement instead of asserting a guarantee', () => {
    const line = describeBillingCost(null);
    expect(line).toContain('NOT_PROBED');
    expect(line).not.toContain('Guaranteed');
    expect(line).not.toContain('₹0 —');
  });

  it('treats a missing entitlement as unobserved, not free', () => {
    expect(describeBillingCost(undefined)).toContain('NOT_PROBED');
  });

  it('only reports a cost figure after a real billing observation', () => {
    expect(describeBillingCost('FREE')).toContain('confirmed by a billing observation');
    expect(describeBillingCost('BILLED')).toContain('BILLED');
  });

  it('qualifies a declared label as a plan, never a guarantee', () => {
    const declared = describeDeclaredCost('₹0 / Always Free', null);
    expect(declared).toContain('declared plan');
    expect(declared).toContain('NOT_PROBED');
  });
});

describe('the Telegram cloud reply derives its cost line', () => {
  it('no longer hardcodes an Always Free guarantee', () => {
    expect(serverFlat).not.toContain('₹0 / Always Free Guaranteed');
  });

  it('builds the cost line from the entitlement helper', () => {
    expect(serverFlat).toContain('describeBillingCost(oracleCloudState.billingEntitlement)');
  });

  it('seeds the entitlement as unobserved rather than free', () => {
    expect(serverFlat).toContain('billingEntitlement: null as');
  });
});

describe('the blueprint surfaces do not assert a zero-cost guarantee', () => {
  it('the report drops the strict zero-cost guarantee wording', () => {
    expect(serverFlat).not.toContain('Strict Zero-Cost Guarantee');
  });

  it('the phase row labels the Always Free figure as a declared plan', () => {
    expect(serverFlat).not.toContain("cost: '₹0 Always Free Guaranteed'");
  });
});
