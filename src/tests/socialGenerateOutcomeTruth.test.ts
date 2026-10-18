import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for item 13 (zero-fake-success). POST /api/social/generate
// refuses to answer success when the draft or its audit row is not durable, and
// the SocialMediaModal handler now surfaces that refusal. Before this guard the
// client read `if (data.success)` with no else and no catch message, so a
// refused generation left the form looking as though a draft had been prepared.
// server.ts binds a port on import, so the route assertion reads the source
// text, matching socialDraftAuditTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const modalFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/components/SocialMediaModal.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

function generateHandler(): string {
  const start = modalFlat.indexOf('const handleGeneratePost');
  expect(start, 'handleGeneratePost missing').toBeGreaterThan(-1);
  const end = modalFlat.indexOf('const handleAction', start);
  expect(end, 'handleGeneratePost end marker missing').toBeGreaterThan(start);
  return modalFlat.slice(start, end);
}

describe('POST /api/social/generate reports a durable draft or refuses', () => {
  it('answers success only after the draft and its audit row reach disk', () => {
    const routeStart = serverFlat.indexOf("app.post('/api/social/generate'");
    expect(routeStart, 'social/generate route missing').toBeGreaterThan(-1);
    const route = serverFlat.slice(routeStart, serverFlat.indexOf("app.post('/api/social/action'", routeStart));
    // The durable write and its read-back are the gate; a write that never lands
    // rolls the draft and row back and answers success:false.
    expect(route).toMatch(/persistMemory\(\) \|\| !diskHasAuditRow\(auditRow\.id\)/);
    expect(route).toMatch(/success: false, persisted: false/);
    expect(route).toMatch(/error: 'The draft could not be written to durable storage/);
  });
});

describe('SocialMediaModal surfaces a refused generation', () => {
  it('requires a post object, not just success, before crediting a draft', () => {
    const handler = generateHandler();
    expect(handler).toMatch(/if \(data\.success && data\.post\)/);
  });

  it('tells the operator and speaks a refusal instead of staying silent', () => {
    const handler = generateHandler();
    expect(handler).toMatch(/setGenerateNotice\(`Draft not prepared: \$\{reason\}`\)/);
    expect(handler).toMatch(/onSpeak\(`Draft not prepared/);
    expect(handler).toMatch(/Draft not prepared — the server could not be reached/);
  });

  it('renders the refusal notice next to the generator form', () => {
    expect(modalFlat).toMatch(/\{generateNotice && \(/);
    expect(modalFlat).toMatch(/\{generateNotice\}/);
  });
});
