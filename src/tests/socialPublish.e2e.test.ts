// ==============================================================================
// End-to-end test for social publishing (backlog items 26-29).
//
// A real JARVIS server process is started, and a local HTTP server stands in for
// the LinkedIn API. The test drives the real HTTP publish route and the real
// retry/verification path in server.ts, then asserts on what the server reports.
//
// The point is to prove the honesty rules hold through the whole stack, not just
// in the retry helper's unit tests:
//   - a confirmed post is VERIFIED and stores the platform's URN
//   - a 2xx with no URN is UNVERIFIED, never VERIFIED
//   - a retryable server error is retried and can still succeed
//   - an authentication failure is not retried and reports the credential gap
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4731;
const LINKEDIN_PORT = 4732;

let jarvis: ChildProcess | undefined;
let linkedin: http.Server | undefined;
let memoryFile: string;

/** How the mock LinkedIn should answer the next publish request. */
interface MockBehaviour {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** When true the connection is destroyed without a response. */
  hangUp?: boolean;
}

let behaviour: MockBehaviour = { status: 201, headers: { 'x-restli-id': 'urn:li:share:TEST1' } };
let publishRequests = 0;
let queuedBehaviours: MockBehaviour[] = [];

function takeBehaviour(): MockBehaviour {
  return queuedBehaviours.length > 0 ? queuedBehaviours.shift()! : behaviour;
}

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

beforeAll(async () => {
  memoryFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-social-')), 'memory.json');

  linkedin = http.createServer((req, res) => {
    if (req.url?.includes('/v2/userinfo')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sub: 'abc123', name: 'Test User' }));
      return;
    }

    if (req.url?.includes('/rest/posts')) {
      publishRequests++;
      const chosen = takeBehaviour();
      if (chosen.hangUp) {
        req.socket.destroy();
        return;
      }
      res.writeHead(chosen.status, { 'Content-Type': 'application/json', ...(chosen.headers ?? {}) });
      res.end(JSON.stringify(chosen.body ?? {}));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => linkedin!.listen(LINKEDIN_PORT, '127.0.0.1', resolve));

  jarvis = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: memoryFile,
      LINKEDIN_API_BASE_URL: `http://127.0.0.1:${LINKEDIN_PORT}`,
      LINKEDIN_ACCESS_TOKEN: 'test-token',
      LINKEDIN_AUTHOR_URN: 'urn:li:person:abc123',
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });

  await waitForServer(`http://127.0.0.1:${JARVIS_PORT}/api/social/posts`);
}, 60_000);

afterAll(async () => {
  if (jarvis) {
    jarvis.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (!jarvis.killed) jarvis.kill('SIGKILL');
  }
  if (linkedin) await new Promise<void>((resolve) => linkedin!.close(() => resolve()));
  fs.rmSync(path.dirname(memoryFile), { recursive: true, force: true });
});

function api(pathname: string, init?: RequestInit) {
  return fetch(`http://127.0.0.1:${JARVIS_PORT}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

/** Creates a draft and returns its id. */
async function createDraft(platform = 'LinkedIn'): Promise<string> {
  const res = await api('/api/social/generate', {
    method: 'POST',
    body: JSON.stringify({ platform, topic: 'Automation truthfulness' }),
  });
  const data: any = await res.json();
  const id = data.post?.id ?? data.postId;
  expect(id).toBeTruthy();
  return id;
}

async function publish(postId: string) {
  const res = await api('/api/social/action', {
    method: 'POST',
    body: JSON.stringify({ postId, action: 'approve_and_publish' }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe('social publishing end-to-end', () => {
  it('reports VERIFIED and stores the platform URN when LinkedIn confirms', async () => {
    queuedBehaviours = [];
    behaviour = { status: 201, headers: { 'x-restli-id': 'urn:li:share:CONFIRMED' } };
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(body.success).toBe(true);
    expect(body.post.finalTruthState).toBe('VERIFIED');
    expect(body.post.providerUrn).toBe('urn:li:share:CONFIRMED');
    expect(body.message).toContain('VERIFIED');
    expect(publishRequests).toBe(1);
  });

  it('reports UNVERIFIED, not success, when LinkedIn returns no URN', async () => {
    queuedBehaviours = [];
    // A 201 with no x-restli-id and an empty body: accepted, but unconfirmed.
    behaviour = { status: 201, headers: {}, body: {} };
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(body.success).toBe(false);
    expect(body.post.finalTruthState).toBe('UNVERIFIED');
    expect(body.post.providerUrn).toBeUndefined();
    expect(body.message).toContain('UNVERIFIED');
    // The post is not left claiming to be published.
    expect(body.post.status).not.toBe('published');
    expect(publishRequests).toBe(1);
  });

  it('retries a server error and succeeds, reporting VERIFIED', async () => {
    behaviour = { status: 201, headers: { 'x-restli-id': 'urn:li:share:AFTERRETRY' } };
    queuedBehaviours = [
      { status: 503, body: { message: 'service unavailable' } },
      { status: 503, body: { message: 'service unavailable' } },
    ];
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(publishRequests).toBe(3);
    expect(body.success).toBe(true);
    expect(body.post.finalTruthState).toBe('VERIFIED');
    expect(body.post.providerUrn).toBe('urn:li:share:AFTERRETRY');
  }, 30_000);

  it('does not retry an authentication failure and names the credential gap', async () => {
    behaviour = { status: 401, body: { message: 'Invalid access token' } };
    queuedBehaviours = [];
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(publishRequests).toBe(1);
    expect(body.success).toBe(false);
    expect(body.post.finalTruthState).toBe('FAILED');
    expect(body.post.verificationStatus).toBe('PROVIDER_ERROR');
    expect(body.message).toMatch(/AUTH|PERMISSION/);
  });

  it('does not retry a dropped connection and reports UNVERIFIED to avoid a duplicate', async () => {
    // Destroying the socket without a response is the ambiguous case: the POST
    // may have been applied, so it must not be retried.
    behaviour = { status: 0, hangUp: true };
    queuedBehaviours = [];
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(publishRequests).toBe(1);
    expect(body.success).toBe(false);
    expect(body.post.finalTruthState).toBe('UNVERIFIED');
    expect(body.message).toContain('UNVERIFIED');
  });

  it('does not retry a client error that is not auth or rate limiting', async () => {
    // A 418 is a plain client error: it will not succeed on a repeat, and it is
    // not ambiguous, so it is one attempt and a plain FAILED.
    behaviour = { status: 418, body: { unexpected: 'teapot' } };
    queuedBehaviours = [];
    publishRequests = 0;

    const id = await createDraft();
    const { body } = await publish(id);

    expect(publishRequests).toBe(1);
    expect(body.success).toBe(false);
    expect(body.post.finalTruthState).toBe('FAILED');
    expect(body.post.verificationStatus).toBe('PROVIDER_ERROR');
  });

  it('never reports published without an external provider', async () => {
    // An unknown platform has no provider to confirm against.
    const id = await createDraft('MySpace');
    const { body } = await publish(id);

    expect(body.success).toBe(false);
    expect(body.post.finalTruthState).toBe('NOT_PUBLISHED');
    expect(body.post.verificationStatus).toBe('STANDBY');
    expect(body.post.likesSimulated ?? 0).toBe(0);
    expect(body.message).toContain('NOT_VERIFIED');
  });
});