// ==============================================================================
// Tests for the GitHub repository scanner (backlog items 14-16).
//
// These run against a stubbed GitHub API so response shapes and the honesty
// rules can be asserted precisely. A response the scanner cannot parse must
// surface as an unreadable sub-read, never as a clean repository.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  githubTokenStatus,
  listRepositories,
  scanRepository,
  scanAllRepositories,
} from '../utils/github/repoScanner';

type Route = (url: string) => { status?: number; body: unknown } | undefined;

function makeFetch(routes: Route): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = routes(url);
    if (!match) {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const status = match.status ?? 200;
    return new Response(typeof match.body === 'string' ? match.body : JSON.stringify(match.body), {
      status,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999' },
    });
  }) as typeof fetch;
}

const REPO = 'acme/widgets';

function healthyRoutes(): Route {
  return (url) => {
    if (url.includes('/user/repos?')) {
      return {
        body: [
          {
            full_name: REPO,
            default_branch: 'main',
            private: false,
            pushed_at: '2026-09-19T00:00:00Z',
            permissions: { push: true },
          },
        ],
      };
    }
    if (url.endsWith(`/repos/${REPO}`)) {
      return { body: { full_name: REPO, default_branch: 'main', permissions: { push: true } } };
    }
    if (url.includes(`/repos/${REPO}/branches`)) {
      return {
        body: [
          { name: 'main', commit: { sha: 'aaa1111' } },
          { name: 'feature/x', commit: { sha: 'bbb2222' } },
        ],
      };
    }
    if (url.includes(`/repos/${REPO}/commits/main`)) {
      return {
        body: {
          sha: 'aaa1111',
          commit: { message: 'fix: something\n\nbody', author: { date: new Date().toISOString() } },
        },
      };
    }
    if (url.includes(`/repos/${REPO}/pulls`)) return { body: [] };
    if (url.includes(`/repos/${REPO}/actions/runs`)) {
      return { body: { total_count: 0, workflow_runs: [] } };
    }
    return undefined;
  };
}

describe('githubTokenStatus', () => {
  it('reports a missing token as not configured with a reason', () => {
    const status = githubTokenStatus('');
    expect(status.configured).toBe(false);
    expect(status.reason).toContain('GITHUB_TOKEN');
  });

  it('treats whitespace as missing', () => {
    expect(githubTokenStatus('   ').configured).toBe(false);
  });

  it('accepts a real token', () => {
    expect(githubTokenStatus('ghp_example').configured).toBe(true);
  });
});

describe('listRepositories', () => {
  it('returns NOT_CONFIGURED without a token and never calls the API', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error('should not be called');
    }) as unknown as typeof fetch;

    const result = await listRepositories({ token: '', fetchImpl });
    expect(result.receipt.outcome).toBe('NOT_CONFIGURED');
    expect(result.repos).toHaveLength(0);
    expect(called).toBe(false);
  });

  it('lists repositories when the token works', async () => {
    const result = await listRepositories({ token: 't', fetchImpl: makeFetch(healthyRoutes()) });
    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].fullName).toBe(REPO);
    expect(result.repos[0].canPush).toBe(true);
  });

  it('reports FAILED with the API message when the listing is rejected', async () => {
    const fetchImpl = makeFetch(() => ({ status: 401, body: { message: 'Bad credentials' } }));
    const result = await listRepositories({ token: 'bad', fetchImpl });
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toContain('Bad credentials');
  });

  it('reports FAILED on a network error rather than returning an empty list', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await listRepositories({ token: 't', fetchImpl });
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toContain('ECONNREFUSED');
  });
});

describe('scanRepository', () => {
  it('scans a healthy repository and reports real values', async () => {
    const scan = await scanRepository(REPO, { token: 't', fetchImpl: makeFetch(healthyRoutes()) });
    expect(scan.reachable).toBe(true);
    expect(scan.receipt.outcome).toBe('VERIFIED');
    expect(scan.defaultBranch).toBe('main');
    expect(scan.headSha).toBe('aaa1111');
    expect(scan.headCommitMessage).toBe('fix: something');
    expect(scan.ciConfigured).toBe(true);
    expect(scan.failingWorkflowRuns).toEqual([]);
  });

  it('reports an unreachable repository with the API reason', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.endsWith(`/repos/${REPO}`)) return { status: 404, body: { message: 'Not Found' } };
      return healthyRoutes()(url);
    });
    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.reachable).toBe(false);
    expect(scan.reason).toContain('Not Found');
    expect(scan.receipt.outcome).toBe('FAILED');
  });

  it('finds failing workflow runs', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/actions/runs')) {
        return {
          body: {
            total_count: 2,
            workflow_runs: [
              {
                id: 1,
                name: 'CI',
                head_branch: 'main',
                status: 'completed',
                conclusion: 'failure',
                created_at: '2026-09-19T01:00:00Z',
                html_url: 'https://example.test/run/1',
              },
              {
                id: 2,
                name: 'CI',
                head_branch: 'main',
                status: 'completed',
                conclusion: 'success',
                created_at: '2026-09-19T00:30:00Z',
                html_url: 'https://example.test/run/2',
              },
            ],
          },
        };
      }
      return healthyRoutes()(url);
    });

    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.failingWorkflowRuns).toHaveLength(1);
    expect(scan.failingWorkflowRuns?.[0].id).toBe(1);
  });

  it('does not count a cancelled run as a failure', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/actions/runs')) {
        return {
          body: {
            total_count: 1,
            workflow_runs: [
              {
                id: 9,
                name: 'CI',
                head_branch: 'main',
                status: 'completed',
                conclusion: 'cancelled',
                created_at: '2026-09-19T01:00:00Z',
                html_url: 'https://example.test/run/9',
              },
            ],
          },
        };
      }
      return healthyRoutes()(url);
    });

    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.failingWorkflowRuns).toEqual([]);
    expect(scan.abortedWorkflowRuns).toHaveLength(1);
  });

  it('treats a 404 on actions as CI not configured, not a read failure', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/actions/runs')) {
        return { status: 404, body: { message: 'Actions are disabled' } };
      }
      return healthyRoutes()(url);
    });
    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.ciConfigured).toBe(false);
    expect(scan.receipt.outcome).toBe('VERIFIED');
  });

  it('downgrades a partial scan to DISPATCHED and names the unreadable part', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes(`/repos/${REPO}/pulls`)) {
        return { status: 500, body: { message: 'Server Error' } };
      }
      return healthyRoutes()(url);
    });
    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.receipt.outcome).toBe('DISPATCHED');
    expect(scan.receipt.detailEn).toContain('unreadable');
    expect(scan.receipt.detailEn).toContain('pull requests');
  });

  it('flags an unexpected response shape instead of reporting an empty list', async () => {
    // GitHub returns an object here; a bare array is malformed.
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/actions/runs')) return { body: [] };
      return healthyRoutes()(url);
    });
    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.receipt.outcome).toBe('DISPATCHED');
    expect(scan.receipt.detailEn).toContain('unexpected response shape');
  });

  it('counts branches with no open PR', async () => {
    const scan = await scanRepository(REPO, { token: 't', fetchImpl: makeFetch(healthyRoutes()) });
    // main is the default; feature/x has no PR.
    expect(scan.unmergedBranchCount).toBe(1);
  });

  it('does not count a branch as unmerged when it has an open PR', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes(`/repos/${REPO}/pulls`)) {
        return {
          body: [
            {
              number: 7,
              title: 'Add x',
              state: 'open',
              draft: false,
              head: { ref: 'feature/x' },
              base: { ref: 'main' },
              mergeable: true,
              updated_at: '2026-09-19T02:00:00Z',
              html_url: 'https://example.test/pr/7',
            },
          ],
        };
      }
      return healthyRoutes()(url);
    });

    const scan = await scanRepository(REPO, { token: 't', fetchImpl });
    expect(scan.unmergedBranchCount).toBe(0);
    expect(scan.openPullRequests).toHaveLength(1);
    expect(scan.openPullRequests?.[0].mergeable).toBe(true);
  });

  it('reports NOT_CONFIGURED without a token', async () => {
    const scan = await scanRepository(REPO, { token: '' });
    expect(scan.reachable).toBe(false);
    expect(scan.receipt.outcome).toBe('NOT_CONFIGURED');
  });
});

describe('scanAllRepositories', () => {
  it('summarises reachable, unreachable and failing repositories', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/user/repos?')) {
        return {
          body: [
            { full_name: 'acme/a', default_branch: 'main', private: false, pushed_at: null },
            { full_name: 'acme/b', default_branch: 'main', private: true, pushed_at: null },
          ],
        };
      }
      if (url.endsWith('/repos/acme/b')) return { status: 404, body: { message: 'Not Found' } };
      if (url.endsWith('/repos/acme/a')) {
        return { body: { full_name: 'acme/a', default_branch: 'main' } };
      }
      if (url.includes('/repos/acme/a/branches')) {
        return { body: [{ name: 'main', commit: { sha: 's1' } }] };
      }
      if (url.includes('/repos/acme/a/commits/main')) {
        return {
          body: { sha: 's1', commit: { message: 'init', author: { date: '2026-09-19T00:00:00Z' } } },
        };
      }
      if (url.includes('/repos/acme/a/pulls')) return { body: [] };
      if (url.includes('/repos/acme/a/actions/runs')) {
        return {
          body: {
            total_count: 1,
            workflow_runs: [
              {
                id: 5,
                name: 'CI',
                head_branch: 'main',
                status: 'completed',
                conclusion: 'failure',
                created_at: '2026-09-19T01:00:00Z',
                html_url: 'https://example.test/run/5',
              },
            ],
          },
        };
      }
      return undefined;
    });

    const result = await scanAllRepositories({ token: 't', fetchImpl });
    expect(result.scans).toHaveLength(2);
    expect(result.reachableCount).toBe(1);
    expect(result.unreachableCount).toBe(1);
    expect(result.reposWithFailingCi).toEqual(['acme/a']);
    // An unreachable repository means the sweep is incomplete, not verified.
    expect(result.receipt.outcome).toBe('DISPATCHED');
  });

  it('returns the list failure when nothing could be listed', async () => {
    const fetchImpl = makeFetch(() => ({ status: 500, body: { message: 'boom' } }));
    const result = await scanAllRepositories({ token: 't', fetchImpl });
    expect(result.scans).toHaveLength(0);
    expect(result.receipt.outcome).toBe('FAILED');
  });
});