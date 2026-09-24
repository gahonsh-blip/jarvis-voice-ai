import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  describeBillingCost,
  describeDeclaredCost,
  declaredCostCell,
  billingBadgeLabel,
  parseBillingEntitlement,
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

  it('the cost table total is not a fixed ₹0.00 / Forever Free claim', () => {
    expect(serverFlat).not.toContain('₹0.00 / Forever Free');
    expect(serverFlat).not.toContain('Strict Zero-Cost Blueprint');
  });

  it('every cost-table row and the total derive from the declared-cost helpers', () => {
    // 7 component rows call declaredCostCell; the total uses describeDeclaredCost.
    expect(serverFlat.match(/declaredCostCell\('₹0'\)/g)?.length ?? 0).toBe(7);
    expect(serverFlat).toContain("describeDeclaredCost('₹0', oracleCloudState.billingEntitlement)");
  });
});

describe('declaredCostCell marks every table figure as an unobserved plan', () => {
  it('never emits a bare ₹0 guarantee', () => {
    const cell = declaredCostCell('₹0');
    expect(cell).toContain('declared plan');
    expect(cell).toContain('no billing API queried');
    expect(cell).not.toMatch(/^₹0$/);
  });
});

describe('the badge label never asserts an unobserved zero-cost guarantee', () => {
  it('names the unqueried entitlement instead of a ₹0 badge', () => {
    const badge = billingBadgeLabel(null);
    expect(badge).toContain('declared plan');
    expect(badge).toContain('not probed');
    expect(badge).not.toContain('₹0');
  });

  it('keeps an unqueried entitlement labelled when it is undefined', () => {
    expect(billingBadgeLabel(undefined)).toContain('not probed');
  });

  it('only shows a confirmed figure after a real billing observation', () => {
    expect(billingBadgeLabel('FREE')).toContain('confirmed by billing');
    expect(billingBadgeLabel('BILLED')).toContain('BILLED');
  });
});

describe('parseBillingEntitlement only accepts an explicit observation', () => {
  it('returns null for a payload that never reported an entitlement', () => {
    expect(parseBillingEntitlement({ metrics: {} })).toBeNull();
    expect(parseBillingEntitlement({})).toBeNull();
    expect(parseBillingEntitlement(null)).toBeNull();
    expect(parseBillingEntitlement(undefined)).toBeNull();
  });

  it('rejects a non-observation value rather than upgrading it', () => {
    expect(parseBillingEntitlement({ billingEntitlement: 'free' })).toBeNull();
    expect(parseBillingEntitlement({ billingEntitlement: true })).toBeNull();
    expect(parseBillingEntitlement({ billingEntitlement: 0 })).toBeNull();
  });

  it('passes through an explicit FREE/BILLED observation', () => {
    expect(parseBillingEntitlement({ billingEntitlement: 'FREE' })).toBe('FREE');
    expect(parseBillingEntitlement({ billingEntitlement: 'BILLED' })).toBe('BILLED');
  });
});

const componentDir = path.resolve(process.cwd(), 'src/components');
const readComponent = (file: string) => fs.readFileSync(path.join(componentDir, file), 'utf8');

describe('decorative cost badges derive from the observed entitlement', () => {
  it('the HUD header does not print a fixed ₹0 Always Free badge', () => {
    const src = readComponent('HUDHeader.tsx');
    expect(src).not.toContain('₹0 Always Free');
    expect(src).toContain('billingBadgeLabel');
  });

  it('the Oracle panel header does not print a fixed Forever Free badge', () => {
    const src = readComponent('OracleCloudModal.tsx');
    expect(src).not.toContain('₹0.00 / Forever Free');
    expect(src).toContain('billingBadgeLabel');
  });
});
