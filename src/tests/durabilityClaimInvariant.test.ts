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
// This test asserts that property globally: every mutating route making a
// durability claim (`persisted` / `recorded` / `stored`) must either read the
// value back from the memory file (`*OnDisk()` / `diskHasAuditRow()`), answer an
// explicit non-durable refusal (`persisted: false`), or forward the verdict of a
// durability-aware writer (`persistMemory()`, `recordNightlyRun()`, ...).
//
// Slot 4 of this window found the first version of the guard matched only the
// literal `persisted: true`, so variable-form claims (`persisted: result.persisted`,
// `recorded: runRecorded`) and object shorthand (`{ ..., persisted }`) escaped it.
// The cases below pin that gap shut and negative-validate the fix.
//
// It is a source-level guard because `server.ts` binds a port on import and
// cannot be imported here, matching approvalDecisionTruth.test.ts.
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

  it('flags a variable-form claim that forwards a writer it never calls', () => {
    // The literal-only guard missed this shape entirely. `result.persisted` is a
    // claim, but nothing in the route produced it, so it is unbacked.
    const snippet = `
      app.post('/api/fake', async (req, res) => {
        const result = await somethingElse(req.body);
        res.json({ success: true, persisted: result.persisted });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/fake');
  });

  it('flags a recorded/stored claim, not just persisted', () => {
    const snippet = `
      app.post('/api/fake', (req, res) => {
        res.json({ success: true, recorded: true, stored: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(1);
  });

  it('flags an object-shorthand durability claim', () => {
    const snippet = `
      app.post('/api/fake', (req, res) => {
        const persisted = true;
        res.json({ success: true, persisted });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(1);
  });

  it('accepts a forwarded claim when the route calls the durability writer', () => {
    const snippet = `
      app.post('/api/good', async (req, res) => {
        const result = await executeApprovedAction(req.body.id, 'reject', 'HUMAN');
        res.json({ success: result.success, persisted: result.persisted });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('still flags a discarded persistMemory() boolean behind a literal true', () => {
    // The exact item-13 defect: the write is attempted, its boolean is thrown
    // away, and the route answers a hard-coded true. The writer's presence must
    // not excuse it.
    const snippet = `
      app.post('/api/fake', (req, res) => {
        memoryState.thing = req.body.thing;
        persistMemory();
        res.json({ success: true, persisted: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(1);
  });

  it('ignores a claim that appears only in a comment', () => {
    const snippet = `
      app.post('/api/clean', (req, res) => {
        // The old code answered persisted: true without checking disk.
        res.json({ success: true });
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

  it('slices an array-form route so its body cannot escape the scan', () => {
    // Slot 5: `sliceRoutes` matched only the single-quoted single-path form, so a
    // route declared as an array was not a slice at all and its body — including
    // an unbacked claim — was invisible to the guard.
    const snippet = `
      app.post(['/api/fake', '/api/fake/'], (req, res) => {
        memoryState.thing = req.body.thing;
        persistMemory();
        res.json({ success: true, persisted: true });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/fake | /api/fake/');
  });

  it('flags a claim forwarded from a value the route never computed, even when it calls the writer', () => {
    // Slot 5: the writer exemption matched the *call*, not its *use*. Here the
    // route calls `persistMemory()` and discards the boolean, then forwards an
    // unrelated flag as the durability claim — the exact defect item 13 removes.
    const snippet = `
      app.post('/api/fake', (req, res) => {
        memoryState.thing = req.body.thing;
        persistMemory();
        res.json({ success: true, persisted: someOtherFlag });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/fake');
  });

  it('accepts a forwarded claim when the writer verdict is consumed', () => {
    const snippet = `
      app.post('/api/good', (req, res) => {
        const stored = persistMemory();
        res.json({ success: stored, stored });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('flags a hardcoded claim "backed" only by an unrelated refusal in the same body', () => {
    // Slot 9: the refusal exemption was body-wide, so this route — which answers
    // `persisted: true` on the happy path and never computed a durability verdict —
    // was cleared by the unrelated `persisted: false` in its validation branch.
    // The claim is now unbacked unless the route also consumes a writer.
    const snippet = `
      app.post('/api/fake', (req, res) => {
        const result = probe(req.body);
        if (result.profilePersisted === false) {
          return res.json({ ...result, persisted: false, message: 'not saved' });
        }
        res.json({ ...result, persisted: true });
      });
    `;
    const violations = findUnbackedDurabilityClaims(snippet);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('/api/fake');
  });

  it('accepts a refusal paired with a consumed writer, the shape a repaired route uses', () => {
    // The same refusal branch is a genuine durability gate once the route
    // consumes the writer verdict it is reporting.
    const snippet = `
      app.post('/api/good', (req, res) => {
        const stored = persistMemory();
        if (!stored) return res.json({ persisted: false, error: 'disk' });
        res.json({ persisted: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('recognises the durability writers the earlier allowlist omitted', () => {
    // Slot 9: four repaired routes consume a writer the list did not name, so the
    // tightened refusal rule flagged them. Each of these must read as backed.
    const snippet = `
      app.post('/api/blueprint/toggle-item', (req, res) => {
        const stored = persistBlueprintPhases();
        if (!stored) return res.status(500).json({ persisted: false });
        res.json({ success: true, persisted: true });
      });
      app.post('/api/security/update', (req, res) => {
        const stored = persistSecurityMatrixState();
        res.json({ success: true, persisted: stored });
      });
      app.post('/api/telephony/settings', (req, res) => {
        const stored = persistTelephonySettingsState();
        res.json({ success: true, persisted: stored });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
  });

  it('recognises testPlatformConnection, whose returned verdict the verify route forwards', () => {
    const snippet = `
      app.post('/api/social/platforms/test', async (req, res) => {
        const result = await testPlatformConnection(req.body.platform);
        if (result.profilePersisted === false) {
          return res.json({ ...result, persisted: false });
        }
        res.json({ ...result, persisted: true });
      });
    `;
    expect(findUnbackedDurabilityClaims(snippet)).toHaveLength(0);
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

  it('scans the broader persisted/recorded/stored claim set, not just literal true', () => {
    const claiming = sliceRoutes(serverSource).filter(
      (r) => r.method !== 'GET' && /(?:persisted|recorded|stored)\s*:/.test(r.body)
    );
    // Observed 32 at the time of writing. The bound guards against the scanner
    // silently narrowing back to literal-only claims.
    expect(claiming.length).toBeGreaterThanOrEqual(30);
    const paths = claiming.map((r) => r.path);
    expect(paths).toContain('/api/social/action');
    expect(paths).toContain('/api/github/nightly/run');
  });

  it('no mutating route makes an unbacked durability claim', () => {
    const violations = findUnbackedDurabilityClaims(serverSource);
    const rendered = violations.map((v) => `${v.method} ${v.path} (line ${v.line}): ${v.reason}`);
    expect(rendered).toEqual([]);
  });

  it('slices the array-form routes, which the single-path regex skipped', () => {
    // Slot 5: four routes in server.ts are declared as arrays. Before the fix
    // `sliceRoutes` dropped them entirely, so their bodies were never scanned.
    const paths = sliceRoutes(serverSource).map((r) => r.path);
    expect(paths).toContain('/api/auth/linkedin/callback | /api/auth/linkedin/callback/');
    expect(paths).toContain('/api/auth/youtube/callback | /api/auth/youtube/callback/');
    expect(paths).toContain('/privacy | /privacy-policy');
    expect(paths).toContain('/terms | /terms-of-service');
  });
});
