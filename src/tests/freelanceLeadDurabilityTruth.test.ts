// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/freelance/create-lead` and `POST /api/freelance/update-status`
// (both `server.ts`) applied the change to the in-process store, called
// `persistMemory()`, and discarded its return value. They then answered
// `stored: true` / `applied: true` regardless, so a read-only volume or a full
// disk produced a "created lead" / "status changed" for a write that never
// reached storage — the same hole the memory routes closed at 21:35 IST.
//
// A real `npx tsx server.ts` process runs against a memory file made read-only
// after the first successful write, so the failure path is exercised end to
// end, not asserted from source text alone. The source guards pin the wiring so
// a future edit cannot quietly drop the durability check or its rollback.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4771;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

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
const postJson = (route: string, body: unknown) =>
  fetch(`${base()}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const listLeads = async () => (await (await fetch(`${base()}/api/freelance/leads`)).json()).leads as any[];

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-lead-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/freelance/leads`);
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

describe('the freelance lead routes report a durable change honestly', () => {
  let leadId: string;

  it('stores and persists a real lead while the disk is writable', async () => {
    const res = await postJson('/api/freelance/create-lead', {
      clientName: 'Acme Corp',
      projectType: 'Web App',
      rawRequirement: 'Build a marketing site',
      budgetAmount: 50000,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stored).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.lead.clientName).toBe('Acme Corp');
    leadId = body.lead.id;

    const leads = await listLeads();
    expect(leads.map((l: any) => l.clientName)).toContain('Acme Corp');
  });

  it('refuses to report a stored lead when the write cannot reach disk', async () => {
    // Make the memory file unwritable. The server process is uid-nonroot, so the
    // next writeFileSync throws EACCES and persistMemory() returns false.
    fs.chmodSync(memoryFile, 0o444);

    const res = await postJson('/api/freelance/create-lead', {
      clientName: 'Blocked Client',
      projectType: 'Web App',
      rawRequirement: 'must not be saved',
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.stored).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback must hold: the lead that could not be saved is not readable,
    // and the earlier persisted lead survives.
    const leads = await listLeads();
    expect(leads.map((l: any) => l.clientName)).not.toContain('Blocked Client');
    expect(leads.map((l: any) => l.clientName)).toContain('Acme Corp');
  });

  it('refuses to report an applied status when the write cannot reach disk', async () => {
    const res = await postJson('/api/freelance/update-status', {
      leadId,
      status: 'Quotation Sent',
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.applied).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback must hold: the status change is not visible.
    const leads = await listLeads();
    const lead = leads.find((l: any) => l.id === leadId);
    expect(lead.status).toBe('Lead Entered');
  });
});

describe('the freelance lead routes keep the durability check wired', () => {
  const route = (startMarker: string, endMarker: string) => {
    const start = serverSource.indexOf(startMarker);
    return serverSource.slice(start, serverSource.indexOf(endMarker, start));
  };

  const createRoute = route("app.post('/api/freelance/create-lead'", "app.post('/api/freelance/update-status'");
  const updateRoute = route("app.post('/api/freelance/update-status'", '// Social Media Engine APIs');

  it('gates the create route on persistMemory() and reports failure otherwise', () => {
    expect(createRoute).toMatch(/if \(!persistMemory\(\)\)/);
    expect(createRoute).toMatch(/persisted:\s*false/);
    expect(createRoute).toMatch(/persisted:\s*true/);
  });

  it('gates the update-status route on persistMemory() and reports failure otherwise', () => {
    expect(updateRoute).toMatch(/if \(!persistMemory\(\)\)/);
    expect(updateRoute).toMatch(/persisted:\s*false/);
    expect(updateRoute).toMatch(/persisted:\s*true/);
  });

  it('rolls back the in-memory change when the write fails', () => {
    expect(createRoute).toMatch(/memoryState\.freelanceLeads = leadSnapshot/);
    expect(updateRoute).toMatch(/lead\.status = previousStatus/);
  });
});
