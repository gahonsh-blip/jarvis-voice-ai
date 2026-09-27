import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards against the .gitignore being saved in a non-UTF-8 encoding.
// Git only parses a UTF-8 .gitignore; a UTF-16 encoded file silently drops
// every ASCII-only pattern (including `.env`), which risks committing secrets.
const GITIGNORE_PATH = resolve(process.cwd(), '.gitignore');

describe('Repository hygiene — .gitignore integrity', () => {
  const raw = readFileSync(GITIGNORE_PATH);

  it('is valid UTF-8 without null bytes (not UTF-16 encoded)', () => {
    expect(raw.includes(0x00)).toBe(false);
    // A BOM would corrupt the first pattern even if the rest decoded.
    expect(raw.subarray(0, 3).toString('hex')).not.toBe('efbbbf');
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(raw)).not.toThrow();
  });

  it('ignores secrets, build artifacts, and cache directories', () => {
    const lines = raw.toString('utf-8').split(/\r?\n/).map((l) => l.trim());
    for (const required of ['.env', '.env.local', 'node_modules/', 'dist/', '__pycache__/']) {
      expect(lines).toContain(required);
    }
  });
});
