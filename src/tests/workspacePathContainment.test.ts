import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { realFsList, realFsRead, realFsWrite, realFsDelete } from '../../server_tools';

// The workspace root is process.cwd() at import time (the repo root under vitest).
const PROJECT_ROOT = process.cwd();

// A sibling directory whose name extends the root's name. This is the exact shape
// that defeats a naive `absolute.startsWith(PROJECT_ROOT)` containment check.
const SIBLING = `${PROJECT_ROOT}-EXT`;
const SECRET = path.join(SIBLING, 'secret.txt');
const SECRET_CONTENT = 'TOP_SECRET_OUTSIDE_WORKSPACE';

describe('Workspace path containment (server_tools)', () => {
  beforeAll(() => {
    fs.rmSync(SIBLING, { recursive: true, force: true });
    fs.mkdirSync(SIBLING, { recursive: true });
    fs.writeFileSync(SECRET, SECRET_CONTENT);
  });

  afterAll(() => {
    fs.rmSync(SIBLING, { recursive: true, force: true });
  });

  it('documents the bypass: the naive string check accepts a prefix sibling', () => {
    // This assertion is the reason the bug existed - pin it so the fix cannot regress.
    expect(SECRET.startsWith(PROJECT_ROOT)).toBe(true);
    expect(SECRET === PROJECT_ROOT || SECRET.startsWith(PROJECT_ROOT + path.sep)).toBe(false);
  });

  it('denies reading files in a prefix-sibling directory outside the root', () => {
    const result = realFsRead(SECRET);
    expect(result.success).toBe(false);
    expect(result.content).toBeUndefined();
    expect(result.error).toMatch(/outside authorized workspace root/i);
  });

  it('denies writing files in a prefix-sibling directory outside the root', () => {
    const target = path.join(SIBLING, 'pwned.txt');
    const result = realFsWrite(target, 'ARBITRARY_WRITE_OUTSIDE_ROOT');
    expect(result.success).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('denies deleting files in a prefix-sibling directory outside the root', () => {
    const result = realFsDelete(SECRET);
    expect(result.success).toBe(false);
    expect(fs.existsSync(SECRET)).toBe(true);
  });

  it('denies listing a prefix-sibling directory outside the root', () => {
    const result = realFsList(SIBLING);
    expect(result.success).toBe(false);
    expect(result.files).toBeUndefined();
  });

  it('denies absolute paths that resolve outside the root', () => {
    const escapes = [
      '/etc/passwd',
      path.resolve(PROJECT_ROOT, '..', '..', 'etc', 'passwd'),
      path.join(SIBLING, '..', 'other'),
    ];
    for (const p of escapes) {
      expect(realFsRead(p).success, `expected read denial for ${p}`).toBe(false);
      expect(realFsWrite(p, 'x').success, `expected write denial for ${p}`).toBe(false);
    }
  });

  it('clamps parent traversal into the workspace instead of escaping it', () => {
    // Leading "../" are stripped, so these re-root inside the workspace and can
    // never touch /etc. Assert the resolved target stays under the root.
    const rel = 'hermes_traversal_ok.tmp';
    const payload = `../../../../../../${rel}`;
    const write = realFsWrite(payload, 'ok');
    expect(write.success).toBe(true);
    const abs = path.join(PROJECT_ROOT, rel);
    expect(fs.existsSync(abs)).toBe(true);
    expect(path.relative(PROJECT_ROOT, abs).startsWith('..')).toBe(false);
    fs.rmSync(abs, { force: true });
    // The absolute system target must be untouched.
    expect(fs.existsSync('/etc/passwd')).toBe(true);
  });

  it('still allows legitimate reads and writes inside the root', () => {
    const rel = 'hermes_containment_ok.tmp';
    const abs = path.join(PROJECT_ROOT, rel);
    try {
      expect(realFsWrite(rel, 'ok').success).toBe(true);
      const read = realFsRead(rel);
      expect(read.success).toBe(true);
      expect(read.content).toBe('ok');
      expect(realFsDelete(rel).success).toBe(true);
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });

  it('permits the root itself and dot-paths', () => {
    expect(realFsList('.').success).toBe(true);
    expect(realFsList(PROJECT_ROOT).success).toBe(true);
  });

  it('denies reading through a symlink that points outside the root', () => {
    const link = path.join(PROJECT_ROOT, '__hermes_escape_link__');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'OUTSIDE_SECRET');
    try {
      fs.symlinkSync(outside, link);
      const target = path.join('__hermes_escape_link__', 'secret.txt');
      const read = realFsRead(target);
      expect(read.success).toBe(false);
      expect(read.content).toBeUndefined();
      expect(read.error).toMatch(/outside authorized workspace root/i);
      // realpath's the escape: the link spelling is inside the root, the bytes are not.
      expect(fs.realpathSync(link)).toBe(fs.realpathSync(outside));
      expect(path.relative(PROJECT_ROOT, fs.realpathSync(link)).startsWith('..')).toBe(true);
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('denies writing, deleting and listing through an outside symlink', () => {
    const link = path.join(PROJECT_ROOT, '__hermes_escape_link_w__');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-outside-'));
    fs.writeFileSync(path.join(outside, 'victim.txt'), 'KEEP_ME');
    try {
      fs.symlinkSync(outside, link);
      const write = realFsWrite(path.join('__hermes_escape_link_w__', 'pwned.txt'), 'ARBITRARY');
      expect(write.success).toBe(false);
      expect(fs.existsSync(path.join(outside, 'pwned.txt'))).toBe(false);

      const del = realFsDelete(path.join('__hermes_escape_link_w__', 'victim.txt'));
      expect(del.success).toBe(false);
      expect(fs.existsSync(path.join(outside, 'victim.txt'))).toBe(true);

      const list = realFsList('__hermes_escape_link_w__');
      expect(list.success).toBe(false);
      expect(list.files).toBeUndefined();
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('denies a symlinked file (not just a symlinked directory) that escapes the root', () => {
    const link = path.join(PROJECT_ROOT, '__hermes_escape_file__');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-outside-'));
    const outsideFile = path.join(outside, 'leak.txt');
    fs.writeFileSync(outsideFile, 'LEAKED');
    try {
      fs.symlinkSync(outsideFile, link);
      const read = realFsRead('__hermes_escape_file__');
      expect(read.success).toBe(false);
      expect(read.content).toBeUndefined();
      expect(realFsDelete('__hermes_escape_file__').success).toBe(false);
      expect(fs.existsSync(outsideFile)).toBe(true);
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('still allows a symlink that stays inside the root', () => {
    const dir = path.join(PROJECT_ROOT, '__hermes_inside_dir__');
    const link = path.join(PROJECT_ROOT, '__hermes_inside_link__');
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'note.txt'), 'INSIDE');
      fs.symlinkSync(dir, link);
      const read = realFsRead(path.join('__hermes_inside_link__', 'note.txt'));
      expect(read.success).toBe(true);
      expect(read.content).toBe('INSIDE');
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});