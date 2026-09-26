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