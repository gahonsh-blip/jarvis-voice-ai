// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// Both OAuth disconnect routes (`POST /api/auth/linkedin/disconnect` and
// `POST /api/auth/youtube/disconnect`) gate the credential removal on the
// durable `persistMemory()` write. The security audit row they append next is a
// *second* durable write, but its boolean was discarded: `addAuditLog` routes
// through `recordDurableAuditRow`, which returns false when the row never
// reached `jarvis_memory.json`. The route then answered `success: true` with a
// bare "disconnected" message, so the operator could not tell the security log
// had no record of the removal — the row lived only in process memory and
// vanished on the next boot.
//
// The routes now carry the audit result as `auditRecorded` and name the
// unrecorded entry in `message`. The Social Media Hub's failure branch also
// reads the server's own `error`/`message` instead of always claiming nothing
// was connected.
//
// A real server process runs against a memory file that is made read-only
// *after* the first successful write, so the audit-row write genuinely fails
// and the response is observed end to end. Source guards pin the wiring so a
// future edit cannot quietly drop the check.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  oauthDisconnectAuditNote,
  oauthDisconnectMessage,
  oauthDisconnectNotice,
} from '../utils/hardening/oauthDisconnectAuditTruth';

const JARVIS_PORT = 4766;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/SocialMediaModal.tsx'),
  'utf8'
);
const modalFlat = modalSource.replace(/\s+/g, ' ');

/** Extracts one route handler's source up to the next app.<method> registration. */
function routeBlock(routePath: string): string {
  const start = serverFlat.indexOf(`'${routePath}'`);
  expect(start, `route ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + routePath.length);
  return serverFlat.slice(start, next === -1 ? undefined : next);
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

function startServer(): ChildProcess {
  return spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: memoryFile,
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
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
  jarvis = undefined;
}

const base = () => `http://127.0.0.1:${JARVIS_PORT}`;

/** Seeds the memory file the server loads at boot with a linked account. */
function seedLinkedInAccount(): void {
  fs.writeFileSync(
    memoryFile,
    JSON.stringify(
      {
        linkedInConnection: {
          name: 'Ada Lovelace',
          connected: true,
          authorUrn: 'urn:li:person:ada',
          connectedAt: '2026-01-01T00:00:00.000Z',
          accessTokenEncrypted: '',
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-disconnect-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  seedLinkedInAccount();
  jarvis = startServer();
  await waitForServer(`${base()}/api/memory`);
}, 60_000);

afterAll(async () => {
  await stopServer();
  try {
    fs.chmodSync(memoryFile, 0o644);
  } catch {
    // may not exist
  }
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('OAuth disconnect reports a durable security-audit row honestly', () => {
  // Run the un-writable case first: the account is linked at boot and the
  // volume is made read-only, so the removal's own persistMemory() genuinely
  // fails. The successful disconnect that follows proves the happy path on the
  // same process, so no restart (and no port hand-off race) is needed.
  it('refuses to report success when the credential removal cannot reach disk', async () => {
    fs.chmodSync(memoryFile, 0o444);
    // Sanity: prove this environment actually honours the read-only mode, so a
    // 500 below cannot be an artefact of an unexpectedly writable file.
    expect(() => fs.writeFileSync(memoryFile, 'probe', 'utf-8')).toThrow();

    const res = await fetch(`${base()}/api/auth/linkedin/disconnect`, { method: 'POST' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback holds: the account is still connected in the running process
    // and still present on the durable file.
    const status = await (await fetch(`${base()}/api/auth/linkedin/status`)).json();
    expect(status.connected).toBe(true);
    expect(JSON.parse(fs.readFileSync(memoryFile, 'utf-8')).linkedInConnection).toBeDefined();
  });

  it('disconnects a linked account, reports the audit row recorded, and persists it', async () => {
    fs.chmodSync(memoryFile, 0o644);
    const res = await fetch(`${base()}/api/auth/linkedin/disconnect`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.auditRecorded).toBe(true);
    // No caveat is appended when the row landed.
    expect(body.message).toBe('LinkedIn disconnected successfully.');

    // The disconnection and its audit row must both be on disk.
    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(onDisk.linkedInConnection).toBeUndefined();
    expect(
      (onDisk.auditLogs ?? []).some((e: any) => /LinkedIn Personal Profile Disconnected/.test(e.action))
    ).toBe(true);
  });
});

describe('the disconnect routes carry the audit-row result', () => {
  const routes = [
    { path: '/api/auth/linkedin/disconnect', varName: 'linkedInDisconnectAuditRecorded' },
    { path: '/api/auth/youtube/disconnect', varName: 'youTubeDisconnectAuditRecorded' },
  ];

  for (const route of routes) {
    it(`${route.path} captures addAuditLog's boolean and reports it`, () => {
      const block = routeBlock(route.path);
      // The boolean must be captured, not discarded.
      expect(block).toContain(`const ${route.varName} = addAuditLog(`);
      // ... and surfaced on the reply alongside an honest message.
      expect(block).toContain('auditRecorded:');
      expect(block).toMatch(/message: oauthDisconnectMessage\('(linkedin|youtube)'/);
      // The reply is still only reached after the durable removal.
      const persistAt = block.indexOf('if (!persistMemory())');
      const auditAt = block.indexOf('addAuditLog(');
      expect(persistAt).toBeGreaterThanOrEqual(0);
      expect(auditAt).toBeGreaterThan(persistAt);
    });
  }
});

describe('the Social Media Hub surfaces the server explanation on failure', () => {
  it('both disconnect handlers route the failure notice through the helper', () => {
    const linkedinHandler = modalFlat.slice(
      modalFlat.indexOf('const handleDisconnectLinkedIn'),
      modalFlat.indexOf('const handleConnectYouTube')
    );
    expect(linkedinHandler).toContain("oauthDisconnectNotice('linkedin', data)");

    const youtubeHandler = modalFlat.slice(
      modalFlat.indexOf('const handleDisconnectYouTube'),
      modalFlat.indexOf('const handleCopyRedirectUri')
    );
    expect(youtubeHandler).toContain("oauthDisconnectNotice('youtube', data)");
  });
});

describe('oauthDisconnectAuditTruth helpers', () => {
  it('appends a caveat only when the audit row did not land', () => {
    expect(oauthDisconnectAuditNote('linkedin', true)).toBe('');
    expect(oauthDisconnectAuditNote('youtube', true)).toBe('');
    expect(oauthDisconnectAuditNote('linkedin', false)).toMatch(/audit entry/);
    expect(oauthDisconnectAuditNote('youtube', false)).toMatch(/audit entry/);
  });

  it('keeps the base success message when the row is durable', () => {
    expect(oauthDisconnectMessage('linkedin', true)).toBe('LinkedIn disconnected successfully.');
    expect(oauthDisconnectMessage('youtube', true)).toBe('YouTube disconnected successfully.');
    expect(oauthDisconnectMessage('linkedin', false)).toMatch(/^LinkedIn disconnected successfully\. /);
    expect(oauthDisconnectMessage('youtube', false)).toMatch(/^YouTube disconnected successfully\. /);
  });

  it('prefers the server error over the not-connected text', () => {
    // A failed durable removal answers with `error` and no `message`.
    expect(
      oauthDisconnectNotice('linkedin', { success: false, error: 'disk full' })
    ).toBe('disk full');
    expect(
      oauthDisconnectNotice('youtube', { success: false, error: 'disk full' })
    ).toBe('disk full');
    // The not-connected reply carries `message`.
    expect(
      oauthDisconnectNotice('linkedin', { success: false, message: 'No LinkedIn account is connected; nothing was disconnected.' })
    ).toMatch(/No LinkedIn account is connected/);
    // A blank reply falls back to the platform's not-connected text, never blank.
    expect(oauthDisconnectNotice('linkedin', {})).toBe('No LinkedIn account is connected.');
    expect(oauthDisconnectNotice('youtube', {})).toBe('No YouTube channel is connected.');
  });
});
