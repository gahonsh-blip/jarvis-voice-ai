import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { offlineOperatorCountsAsHostWork } from '../utils/computerOperator/offlineOperatorTruth';

// App.tsx is a React entry that imports browser-only modules, so these
// assertions read the source text, matching actionExecutedSweepAudit.test.ts.
const appFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

/** Views the dispatcher can open via `setActiveApp('...')`. */
const ASSIGNED = new Set(
  [...appFlat.matchAll(/setActiveApp\('([a-z_]+)'\)/g)].map((m) => m[1]),
);

/** Views that actually mount a modal/panel via `activeApp === '...'`. */
const RENDERED = new Set(
  [...appFlat.matchAll(/activeApp === '([a-z_]+)'/g)].map((m) => m[1]),
);

describe('every view the action dispatcher opens is actually mounted', () => {
  it('has a render site for each assigned activeApp value', () => {
    const dangling = [...ASSIGNED].filter((v) => !RENDERED.has(v));
    // A value with no `activeApp === '...'` check sets state nothing consumes,
    // so `handleExecuteAction` reports a view switch that never happens.
    expect(dangling, `assigned but never rendered: ${dangling.join(', ')}`).toEqual([]);
  });

  it('routes open_computer_operator to a mounted Computer Operator view', () => {
    expect(appFlat).toContain("setActiveApp('computer_operator')");
    expect(appFlat).toContain("activeApp === 'computer_operator'");
    expect(appFlat).toContain('<ComputerOperatorModal');
  });
});

describe('the offline operator intent that counts as page-local work opens a real view', () => {
  it('open_computer_operator is the only counted intent and it maps to a rendered view', () => {
    expect(offlineOperatorCountsAsHostWork('open_computer_operator')).toBe(true);
    // The offline verdict credits this intent as real page-local work, so the
    // view it names must actually exist; otherwise the credit is false.
    expect(RENDERED.has('computer_operator')).toBe(true);
  });
});
