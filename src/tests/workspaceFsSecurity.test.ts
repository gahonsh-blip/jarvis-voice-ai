import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { realFsRead, realFsWrite, realFsList, realFsDelete } from '../../server_tools';

const PROJECT_ROOT = process.cwd();

// A sibling directory whose *name* shares PROJECT_ROOT as a string prefix.
// The old `absolute.startsWith(PROJECT_ROOT)` guard admitted it; `path.relative` must not.
const SIBLING_DIR = `${PROJECT_ROOT}-fsguard-probe`;
const SIBLING_FILE = path.join(SIBLING_DIR, 'sentinel.txt');
const SENTINEL = 'SIBLING_PREFIX_LEAK_SENTINEL';

describe('Workspace Filesystem Path Confinement', () => {
  beforeAll(() => {
    fs.rmSync(SIBLING_DIR, { recursive: true, force: true });
    fs.mkdirSync(SIBLING_DIR, { recursive: true });
    fs.writeFileSync(SIBLING_FILE, SENTINEL, 'utf-8');
  });

  afterAll(() => {
    fs.rmSync(SIBLING_DIR, { recursive: true, force: true });
  });

  it('rejects upward relative traversal out of the workspace root', () => {
    for (const candidate of ['../outside.txt', '../../etc/passwd', 'a/../../b.txt', '..\\outside.txt']) {
      const result = realFsRead(candidate);
      expect(result.success, `expected traversal to be denied: ${candidate}`).toBe(false);
      expect(result.content).toBeUndefined();
    }
  });

  it('rejects absolute paths outside the workspace root', () => {
    for (const candidate of ['/etc/passwd', '/tmp/hermes_probe/secret.txt']) {
      const result = realFsRead(candidate);
      expect(result.success, `expected absolute escape to be denied: ${candidate}`).toBe(false);
      expect(result.error).toMatch(/outside authorized workspace root/i);
    }
  });

  it('rejects a sibling directory that only shares a string prefix with the root', () => {
    // Regression guard: this read succeeded under the old startsWith() check.
    const result = realFsRead(SIBLING_FILE);
    expect(result.success).toBe(false);
    expect(result.content).toBeUndefined();
    expect(result.error).toMatch(/outside authorized workspace root/i);
    // Prove the sentinel really was reachable on disk, so the denial is meaningful.
    expect(fs.readFileSync(SIBLING_FILE, 'utf-8')).toBe(SENTINEL);
  });

  it('rejects reads of credential and VCS locations inside the root', () => {
    for (const candidate of ['.env', '.env.local', '.git/config', '.git/HEAD', 'nested/.env', 'certs/server.pem', '.ssh/id_rsa']) {
      const result = realFsRead(candidate);
      expect(result.success, `expected protected path to be denied: ${candidate}`).toBe(false);
      expect(result.content).toBeUndefined();
      expect(result.error).toMatch(/protected credential or VCS/i);
    }
  });

  it('rejects writes and deletes of protected credential and VCS locations', () => {
    const write = realFsWrite('.env', 'LEAKED=1');
    expect(write.success).toBe(false);
    expect(write.error).toMatch(/protected credential or VCS/i);

    const del = realFsDelete('.git/config');
    expect(del.success).toBe(false);
    expect(del.error).toMatch(/protected credential or VCS/i);
  });

  it('rejects null-byte injection and empty paths', () => {
    expect(realFsRead('package.json\0.txt').success).toBe(false);
    expect(realFsRead('').success).toBe(false);
    expect(realFsRead('   ').success).toBe(false);
  });

  it('still permits legitimate in-workspace reads and listings', () => {
    const read = realFsRead('package.json');
    expect(read.success).toBe(true);
    expect(read.content).toContain('jarvis-voice-ai');

    const list = realFsList('.');
    expect(list.success).toBe(true);
    expect(list.files).toContain('📄 package.json');
  });
});
