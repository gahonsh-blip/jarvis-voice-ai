import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { realFsSearch } from '../../server_tools';

// Regression guard for a truthfulness bug: the `find_document` intent answered
// every query with a fabricated result — a hardcoded path
// `/workspace/storage/documents/<query>`, an invented "42.5 KB" size and a made-up
// summary — regardless of whether any such file existed. realFsSearch returns
// real on-disk matches and an empty list when there is genuinely nothing.

const probeName = `hermes-search-probe-${Date.now()}.md`;
const probePath = path.join(process.cwd(), probeName);

afterAll(() => {
  if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
});

describe('document search reports real files, never fabricated ones', () => {
  it('rejects an empty query instead of inventing a match', () => {
    const result = realFsSearch('');
    expect(result.success).toBe(false);
    expect(result.matches).toBeUndefined();
  });

  it('returns no matches for a name that does not exist in the workspace', () => {
    const result = realFsSearch('definitely-not-a-real-file-xyzzy-12345');
    expect(result.success).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it('finds a real file and reports its true size', () => {
    fs.writeFileSync(probePath, 'x'.repeat(1234));
    const result = realFsSearch(probeName);
    expect(result.success).toBe(true);
    expect(result.matches!.length).toBe(1);
    expect(result.matches![0].path).toContain(probeName);
    expect(result.matches![0].sizeBytes).toBe(1234);
  });

  it('never surfaces the previously fabricated storage path or size', () => {
    const serialized = JSON.stringify(realFsSearch(probeName));
    expect(serialized).not.toContain('/workspace/storage/documents/');
    expect(serialized).not.toContain('42.5');
  });
});

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in toolDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

function chatCaseBody(intent: string, max = 900): string {
  const label = serverFlat.indexOf(`case '${intent}':`);
  expect(label, `${intent} case missing`).toBeGreaterThan(-1);
  const blockOpen = serverFlat.indexOf('{', label);
  const rest = serverFlat.slice(blockOpen + 1);
  const nextMatch = /case '[a-z_]+': \{/.exec(rest);
  const end = nextMatch ? blockOpen + 1 + nextMatch.index : serverFlat.length;
  return serverFlat.slice(label, Math.min(end, label + max));
}

describe('the find_document route does not credit a search that found nothing', () => {
  it('a zero-match search is a non-action, not an executed document lookup', () => {
    const body = chatCaseBody('find_document');
    expect(body).toContain('No file matching');
    // Isolate the "search succeeded but found nothing" branch.
    const afterFound = body.slice(body.indexOf('else if (search.success)'));
    const branch = afterFound.slice(0, afterFound.indexOf('} else {'));
    expect(branch).toContain('actionExecuted = false;');
    expect(branch).not.toContain('actionExecuted = true;');
  });

  it('an empty query is rejected by the real search rather than inventing success', () => {
    const result = realFsSearch('   ');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// The found-branch previously credited an executed action with no client route:
// `handleExecuteAction` had no `find_document` case, so the counter advanced and
// no panel opened. The fix routes the intent to the filesystem explorer and
// seeds it with the same query, so the credited action has a matching surface.
describe('a credited find_document opens a real search surface for the same query', () => {
  const appFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    .replace(/\s+/g, ' ');
  const modalFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'src/components/AutonomousToolsModal.tsx'), 'utf8')
    .replace(/\s+/g, ' ');

  it('carries the search query in the found-branch payload', () => {
    const body = chatCaseBody('find_document');
    expect(body).toContain('payload: { query, matches: search.matches }');
    expect(body).toContain('actionExecuted = true;');
  });

  it('exposes a real recursive search endpoint backed by realFsSearch', () => {
    expect(serverFlat).toContain("app.post('/api/tools/fs/search'");
    const route = serverFlat.slice(serverFlat.indexOf("app.post('/api/tools/fs/search'"));
    expect(route.slice(0, 260)).toContain('realFsSearch');
  });

  it('routes the intent to the autonomous tools view with the query', () => {
    expect(appFlat).toContain("case 'find_document':");
    const route = appFlat.slice(appFlat.indexOf("case 'find_document':"));
    const body = route.slice(0, 320);
    expect(body).toContain("setActiveApp('autonomous_tools')");
    expect(body).toContain('setDocumentSearchQuery');
  });

  it('seeds and runs the search when the explorer opens with a query', () => {
    expect(modalFlat).toContain('handleFsSearch(initialQuery)');
    expect(modalFlat).toContain("setActiveTab('filesystem')");
    expect(modalFlat).toContain("fetch('/api/tools/fs/search'");
  });
});