import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  assessedServerStatus,
  describeServerHealthClaim,
  isMeasuredServerStatus,
  UNMEASURED_SERVER_STATUS,
} from '../../utils/hardening/serverHealthTruth';

// server.ts binds a port on import, so the routine assertions read the source
// text, matching the convention in billingEntitlementTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('a self-built routine carries no server health verdict', () => {
  it('reports NOT_MEASURED rather than a literal Nominal', () => {
    expect(assessedServerStatus()).toBe('NOT_MEASURED');
    expect(UNMEASURED_SERVER_STATUS).toBe('NOT_MEASURED');
  });

  it('treats NOT_MEASURED and unknown values as unmeasured', () => {
    expect(isMeasuredServerStatus('NOT_MEASURED')).toBe(false);
    expect(isMeasuredServerStatus(undefined)).toBe(false);
    expect(isMeasuredServerStatus(null)).toBe(false);
    expect(isMeasuredServerStatus('Nominal')).toBe(true);
    expect(isMeasuredServerStatus('Critical')).toBe(true);
  });

  it('names the absent observation instead of asserting health', () => {
    const note = describeServerHealthClaim(assessedServerStatus());
    expect(note).toContain('NOT_MEASURED');
    expect(note).toContain('no independent health observation exists');
    expect(note).not.toContain('Nominal');
  });

  it('only reports a verdict when it came from an external observation', () => {
    expect(describeServerHealthClaim('Nominal')).toContain('external observation');
  });
});

describe('the four proactive routines no longer hardcode a health literal', () => {
  it('contains no assigned Nominal literal', () => {
    expect(serverFlat).not.toContain("serverStatus: 'Nominal'");
  });

  it('derives the status from the truth helper', () => {
    const occurrences = serverFlat.split('serverStatus: assessedServerStatus()').length - 1;
    expect(occurrences).toBe(4);
  });

  it('states the unmeasured health note in every routine', () => {
    const notes =
      serverFlat.split('describeServerHealthClaim(assessedServerStatus())').length - 1;
    expect(notes).toBe(4);
  });
});
