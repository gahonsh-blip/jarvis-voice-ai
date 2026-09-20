import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { realGitStatus, realGitLog, realGitDiff } from '../../server_tools';

// Regression guard for a truthfulness bug: realGitStatus/realGitLog/realGitDiff
// caught every git failure and returned `success: true` with invented data
// (branch "main", three fabricated commit subjects, "Diff tool nominal.").
// A model that cannot run git must report UNKNOWN, never a plausible fiction.

const originalPath = process.env.PATH;
const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-no-git-'));

function breakGit() {
  const stub = path.join(fakeBin, 'git');
  fs.writeFileSync(stub, '#!/bin/sh\nexit 127\n');
  fs.chmodSync(stub, 0o755);
  // The stub is the only `git` on PATH, so every invocation fails like a
  // sandbox without git installed.
  process.env.PATH = `${fakeBin}:/usr/bin:/bin`;
}

afterEach(() => {
  process.env.PATH = originalPath;
});

describe('git tools report real state, never fabricated state', () => {
  it('realGitStatus returns the actual branch when git is available', () => {
    const expected = execSync('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd() }).toString().trim();
    const status = realGitStatus();
    expect(status.success).toBe(true);
    expect(status.branch).toBe(expected);
  });

  it('realGitStatus reports failure instead of inventing a clean "main" branch', () => {
    breakGit();
    const status = realGitStatus();
    expect(status.success).toBe(false);
    expect(status.error).toMatch(/git is unavailable/i);
    // The old fallback's exact fabricated values must not reappear.
    expect(status.branch).toBeUndefined();
    expect(status.clean).toBeUndefined();
  });

  it('realGitLog reports failure instead of inventing commit subjects', () => {
    breakGit();
    const log = realGitLog(5);
    expect(log.success).toBe(false);
    expect(log.commits).toBeUndefined();
    expect(log.error).toMatch(/git is unavailable/i);
  });

  it('realGitLog never emits the previously fabricated commit subjects', () => {
    breakGit();
    const log = realGitLog(5);
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain('permission-gated autonomous assistant');
    expect(serialized).not.toContain('linkedin');
    expect(serialized).not.toContain('initialize workspace structure');
  });

  it('realGitDiff reports failure instead of claiming the diff tool is "nominal"', () => {
    breakGit();
    const diff = realGitDiff();
    expect(diff.success).toBe(false);
    expect(diff.diff).toBeUndefined();
    expect(diff.error).toMatch(/git is unavailable/i);
  });

  it('realGitLog returns a real commit list when git is available', () => {
    const log = realGitLog(3);
    expect(log.success).toBe(true);
    expect(Array.isArray(log.commits)).toBe(true);
    expect(log.commits!.length).toBeGreaterThan(0);
  });
});