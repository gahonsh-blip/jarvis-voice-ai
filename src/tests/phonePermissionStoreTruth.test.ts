// HERMES JARVIS — telephony permission store honesty.
//
// `GET/POST /api/telephony/permissions` previously reported a granted
// permission as saved even though `loadPhonePermissions`/`savePhonePermissions`
// are browser helpers that do nothing without a `window`. The route now
// reports `applied: true` only when a durable store accepted the write, and
// `applied: false` with `outcome: 'NO_STORE'` otherwise.
//
// The unit cases pin `applyPhonePermissionUpdate`; the e2e case runs a real
// JARVIS server against a temporary permission file and proves the grant
// survives the request that wrote it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyPhonePermissionUpdate } from '../utils/hardening/phonePermissionStoreTruth';
import { DEFAULT_PHONE_PERMISSIONS } from '../utils/telephonyPermissions';
import type {
  PhonePermissionKey,
  PhonePermissionState,
} from '../types/telephonyProvider';

describe('applyPhonePermissionUpdate never claims a change without a store', () => {
  function makeStore() {
    const box: { value: Record<PhonePermissionKey, PhonePermissionState> | null } = {
      value: null,
    };
    const store = {
      load: () => ({ ...DEFAULT_PHONE_PERMISSIONS, ...(box.value ?? {}) }),
      save: (p: Record<PhonePermissionKey, PhonePermissionState>) => {
        box.value = p;
      },
    };
    return { store, saved: () => box.value };
  }

  it('refuses and reports NO_STORE when no durable store exists', () => {
    const v = applyPhonePermissionUpdate(null, DEFAULT_PHONE_PERMISSIONS, {
      PHONE_RECORDING: 'GRANTED',
    });
    expect(v.applied).toBe(false);
    expect(v.outcome).toBe('NO_STORE');
    expect(v.permissions.PHONE_RECORDING).toBe('DENIED');
    expect(v.message).toMatch(/not saved/i);
  });

  it('reports NOTHING_TO_APPLY for an empty change set even with a store', () => {
    const { store, saved } = makeStore();
    const v = applyPhonePermissionUpdate(store, DEFAULT_PHONE_PERMISSIONS, {});
    expect(v.applied).toBe(false);
    expect(v.outcome).toBe('NOTHING_TO_APPLY');
    expect(saved()).toBeNull();
  });

  it('applies and persists a real change when a durable store exists', () => {
    const { store, saved } = makeStore();
    const v = applyPhonePermissionUpdate(store, DEFAULT_PHONE_PERMISSIONS, {
      PHONE_RECORDING: 'GRANTED',
    });
    expect(v.applied).toBe(true);
    expect(v.outcome).toBe('APPLIED');
    expect(v.permissions.PHONE_RECORDING).toBe('GRANTED');
    expect(saved()?.PHONE_RECORDING).toBe('GRANTED');
    // The returned view is the store's, not the caller's local merge.
    expect(store.load().PHONE_RECORDING).toBe('GRANTED');
  });
});

const JARVIS_PORT = 4759;
const BASE = `http://127.0.0.1:${JARVIS_PORT}`;
let jarvis: ChildProcess | undefined;
let permFile: string;
let permDir: string;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function stopServer(): Promise<void> {
  if (!jarvis?.pid) return;
  try {
    process.kill(-jarvis.pid, 'SIGTERM');
  } catch {
    jarvis.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    process.kill(-jarvis.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

describe('the permissions route persists only when a store is configured', () => {
  beforeAll(async () => {
    permDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-perms-'));
    permFile = path.join(permDir, 'phone_permissions.json');
    jarvis = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        PORT: String(JARVIS_PORT),
        JARVIS_PHONE_PERMISSIONS_FILE: permFile,
        GEMINI_API_KEY: '',
      },
      stdio: 'ignore',
    });
    await waitForServer(`${BASE}/api/telephony/permissions`);
  }, 40_000);

  afterAll(async () => {
    await stopServer();
    try {
      fs.rmSync(permDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('reports a granted permission as applied and keeps it for the next read', async () => {
    const before = await (await fetch(`${BASE}/api/telephony/permissions`)).json();
    expect(before.persisted).toBe(true);
    expect(before.permissions.PHONE_RECORDING).toBe('DENIED');

    const post = await fetch(`${BASE}/api/telephony/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PHONE_RECORDING: { state: 'GRANTED' } }),
    });
    const postBody = await post.json();
    expect(post.status).toBe(200);
    expect(postBody.success).toBe(true);
    expect(postBody.applied).toBe(true);
    expect(postBody.outcome).toBe('APPLIED');
    expect(postBody.permissions.PHONE_RECORDING).toBe('GRANTED');

    // The change survives the request that wrote it.
    const after = await (await fetch(`${BASE}/api/telephony/permissions`)).json();
    expect(after.permissions.PHONE_RECORDING).toBe('GRANTED');
    expect(JSON.parse(fs.readFileSync(permFile, 'utf-8')).PHONE_RECORDING).toBe('GRANTED');
  });

  it('refuses an empty body without reporting a save', async () => {
    const res = await fetch(`${BASE}/api/telephony/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.applied).toBe(false);
    expect(body.reason).toBe('NO_KEYS');
  });

  it('refuses an unknown permission key without reporting a save', async () => {
    const res = await fetch(`${BASE}/api/telephony/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PHONE_NOT_A_REAL_PERMISSION: { state: 'GRANTED' } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.applied).toBe(false);
    expect(body.reason).toBe('ALL_UNKNOWN');
  });
});
