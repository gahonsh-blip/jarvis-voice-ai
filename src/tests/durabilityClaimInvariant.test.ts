import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  sliceRoutes,
  findUnbackedDurabilityClaims,
} from '../utils/hardening/durabilityClaimScan';

// Regression guard for backlog item 13, "zero fake success".
//
// Slots 1-3 of this window repaired the durability claim on individual routes
// (OAuth connect/disconnect, `/api/restore`, the approval decision). Each repair
// was pinned by its own test, but nothing pinned the *property* across the whole
// file — so the next mutating route that answers `persisted: true` without any
// way to know the write landed would pass every existing test.
//
// This test asserts that property globally: every mutating route claiming
// `persisted: true` must either read the value back from the memory file
// (`*OnDisk()` / `diskHasAuditRow()`) or answer an explicit non-durable refusal
// (`persisted: false`). It is a source-level guard because `server.ts` binds a
// port on import and cannot be imported here, matching approvalDecisionTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

describe('durabilityClaimScan detector', () => {
  it('flags a route that claims persisted: true with no read-back and no refusal', () => {
    const snippet = `
      app.post('/api/fake', (req, res) => {
        memoryState.thing = req.body.thing;
        persistMemory();
        res.json({ success: true, persisted: true });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/fake');
  });

  it('accepts a route that reads its state back from disk', () => {
    const snippet = `
      app.post('/api/good', (req, res) => {
        const persisted = persistEmergencyState() && emergencyStateOnDisk(true);
        res.json({ success: true, persisted });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('accepts a route that can refuse the claim with persisted: false', () => {
    const snippet = `
      app.post('/api/good', (req, res) => {
        if (!persistMemory()) {
          return res.status(500).json({ success: false, persisted: false });
        }
        res.json({ success: true, persisted: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('does not judge read routes, which cannot persist anything', () => {
    const snippet = `
      app.get('/api/read', (_req, res) => {
        res.json({ success: true, persisted: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('bounds each slice at the next route so a guarded route does not mask its neighbour', () => {
    const snippet = `
      app.post('/api/guarded', (req, res) => {
        const persisted = persistMemory() && diskHasAuditRow('x');
        res.json({ success: true, persisted: true });
      });
      app.post('/api/unguarded', (req, res) => {
        persistMemory();
        res.json({ success: true, persisted: true });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations.map((v) => v.path)).toEqual(['/api/unguarded']);
  });
});

describe('server.ts durability claims (real file)', () => {
  it('finds the mutating routes that claim persisted: true', () => {
    const claiming = sliceRoutes(serverSource).filter(
      (r) => r.method !== 'GET' && r.body.includes('persisted: true')
    );
    // The repaired routes are the ones that make this guard non-vacuous; if the
    // scanner stopped finding them it would pass trivially.
    expect(claiming.length).toBeGreaterThanOrEqual(10);
    const paths = claiming.map((r) => r.path);
    expect(paths).toContain('/api/restore');
    expect(paths).toContain('/api/approvals/resolve');
    expect(paths).toContain('/api/memory/sync');
    expect(paths).toContain('/api/telephony/calls');
  });

  it('no mutating route claims persisted: true without a read-back or a refusal path', () => {
    const violations = findUnbackedDurabilityClaims(serverSource);
    const rendered = violations.map((v) => `${v.method} ${v.path} (line ${v.line}): ${v.reason}`);
    expect(rendered).toEqual([]);
  });
});
