import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPABILITIES,
  capabilityForTool,
  checkPermission,
  grant,
  revoke,
  listPermissions,
  pendingRequests,
  offlineMode,
} from '../agent/permissions.js';
import { executeTool } from '../agent/tools.js';

let dir: string;
const saved = { state: process.env.AGENT_STATE_DIR, offline: process.env.AGENT_OFFLINE };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'perm-test-'));
  process.env.AGENT_STATE_DIR = dir;
  delete process.env.AGENT_OFFLINE;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (saved.state === undefined) delete process.env.AGENT_STATE_DIR;
  else process.env.AGENT_STATE_DIR = saved.state;
  if (saved.offline === undefined) delete process.env.AGENT_OFFLINE;
  else process.env.AGENT_OFFLINE = saved.offline;
});

describe('permissions — the app-style consent layer', () => {
  it('asks before writing, running commands or using the internet', () => {
    for (const tool of ['write_file', 'bash', 'web_search', 'make_phone_call', 'send_message_to_builder', 'browser_confirm_payment']) {
      const r = checkPermission(tool);
      expect(r.ok).toBe(false);
      expect(String((r as any).output)).toMatch(/^permission_required:/);
    }
  });

  it('lets the agent read and remember on a fresh install', () => {
    expect(checkPermission('read_file').ok).toBe(true);
    expect(checkPermission('save_memory').ok).toBe(true);
  });

  it('remembers a grant across calls and stops asking', () => {
    expect(checkPermission('bash').ok).toBe(false);
    expect(grant('shell').ok).toBe(true);
    expect(checkPermission('bash').ok).toBe(true);
    // and it really landed on disk, so a restart keeps the answer
    const onDisk = JSON.parse(readFileSync(join(dir, 'permissions.json'), 'utf8'));
    expect(onDisk.grants.shell.granted).toBe(true);
  });

  it('revoking puts the question back', () => {
    grant('shell');
    expect(checkPermission('bash').ok).toBe(true);
    expect(revoke('shell').ok).toBe(true);
    expect(checkPermission('bash').ok).toBe(false);
  });

  it('queues each ask once instead of repeating it', () => {
    checkPermission('web_search');
    checkPermission('web_search');
    const pending = pendingRequests().filter((p) => p.capability === 'network');
    expect(pending.length).toBe(1);
    grant('network');
    expect(pendingRequests().some((p) => p.capability === 'network')).toBe(false);
  });

  it('rejects an unknown capability instead of silently granting it', () => {
    const r = grant('everything' as any);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown_capability/);
  });

  it('maps every advertised tool to a real capability', () => {
    const ids = new Set(CAPABILITIES.map((c) => c.id));
    for (const tool of ['read_file', 'write_file', 'grep', 'bash', 'web_search', 'run_skill', 'send_image', 'make_phone_call', 'read_entities', 'browserbase_click']) {
      expect(ids.has(capabilityForTool(tool))).toBe(true);
    }
    expect(capabilityForTool('send_message_to_builder')).toBe('publish');
    expect(capabilityForTool('send_image')).toBe('messages');
    expect(capabilityForTool('read_entities')).toBe('platform');
  });

  it('blocks a real tool call before the tool runs', async () => {
    const out = await executeTool('write_file', { path: 'x.txt', content: 'y' }, { root: dir, approved: true } as any);
    expect(out.ok).toBe(false);
    expect(String(out.output)).toMatch(/^permission_required: .*files\.write/);

    grant('files.write');
    const after = await executeTool('write_file', { path: 'x.txt', content: 'y' }, { root: dir, approved: true } as any);
    expect(after.ok).toBe(true);
  });

  it('offline mode keeps local tools working and refuses the internet', async () => {
    process.env.AGENT_OFFLINE = '1';
    expect(offlineMode()).toBe(true);
    grant('network');
    const net = await executeTool('web_search', { query: 'x' }, { root: dir, approved: true } as any);
    expect(net.ok).toBe(false);
    expect(String(net.output)).toMatch(/^offline_mode:/);

    const local = await executeTool('bash', { command: 'echo offline-ok' }, { root: dir, approved: true } as any);
    expect(local.ok).toBe(false); // shell still needs its own grant
    grant('shell');
    const local2 = await executeTool('bash', { command: 'echo offline-ok' }, { root: dir, approved: true } as any);
    expect(local2.ok).toBe(true);
    expect(String(local2.output)).toContain('offline-ok');
  });

  it('lists every capability with a plain-language ask and its state', () => {
    const list = listPermissions();
    expect(list.length).toBe(CAPABILITIES.length);
    for (const c of list) {
      expect(c.asks.length).toBeGreaterThan(10);
      expect(typeof c.granted).toBe('boolean');
    }
  });
});
