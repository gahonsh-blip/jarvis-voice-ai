// ==============================================================================
// HERMES JARVIS — GITHUB REPOSITORY SCANNER (backlog items 14-16)
//
// Discovers repositories the token can reach and reports their real state:
// default branch, head commit, branches, open PRs and recent workflow
// conclusions.
//
// Every field is either read from the GitHub API or marked unavailable. A repo
// that cannot be reached is reported as unreachable with the reason — it is
// never quietly omitted or reported as healthy.
// ==============================================================================

import { ExecutionReceipt, buildReceipt, makeEvidence } from '../executionTruth';

const API = 'https://api.github.com';

export interface RepoSummary {
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  pushedAt: string | null;
  /** True when the token can push to this repository. */
  canPush: boolean;
}

export interface BranchSummary {
  name: string;
  sha: string;
  /** True when this branch is the repository's default branch. */
  isDefault: boolean;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  headBranch: string;
  baseBranch: string;
  /** GitHub's own mergeability verdict; null while GitHub is still computing it. */
  mergeable: boolean | null;
  updatedAt: string;
  htmlUrl: string;
}

export interface WorkflowRunSummary {
  id: number;
  name: string;
  branch: string | null;
  status: string | null;
  conclusion: string | null;
  createdAt: string;
  htmlUrl: string;
}

export interface RepoScan {
  fullName: string;
  reachable: boolean;
  /** Populated only when reachable is false. */
  reason?: string;
  defaultBranch?: string;
  headSha?: string;
  headCommitMessage?: string;
  headCommitAgeHours?: number;
  branches?: BranchSummary[];
  openPullRequests?: PullRequestSummary[];
  recentWorkflowRuns?: WorkflowRunSummary[];
  /** Workflow runs that finished in a failing conclusion, newest first. */
  failingWorkflowRuns?: WorkflowRunSummary[];
  /** Runs that were cancelled or skipped: no verdict on the code either way. */
  abortedWorkflowRuns?: WorkflowRunSummary[];
  /** True when the repository has workflow runs configured. */
  ciConfigured?: boolean;
  /** Number of non-default branches with no open PR. */
  unmergedBranchCount?: number;
  scannedAt: string;
  receipt: ExecutionReceipt;
}

export interface GitHubFetchOptions {
  token: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface GitHubFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  rateLimitRemaining?: number;
}

async function githubFetch<T>(
  path: string,
  options: GitHubFetchOptions
): Promise<GitHubFetchResult<T>> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = path.startsWith('http') ? path : `${API}${path}`;
  try {
    const res = await doFetch(url, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hermes-jarvis-automation',
      },
    });

    const rateLimitRemaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);

    if (res.status === 204) {
      return { ok: true, status: 204, data: null, rateLimitRemaining };
    }

    const text = await res.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        return {
          ok: false,
          status: res.status,
          data: null,
          error: 'Response was not JSON',
          rateLimitRemaining,
        };
      }
    }

    if (!res.ok) {
      const message = (data as { message?: string } | null)?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: message, rateLimitRemaining };
    }

    return { ok: true, status: res.status, data, rateLimitRemaining };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'network error',
    };
  }
}

/**
 * Whether a token is configured well enough to attempt any call. Reported
 * separately so callers can distinguish "no setup" from "API refused".
 */
export function githubTokenStatus(token: string | undefined): {
  configured: boolean;
  reason?: string;
} {
  if (!token || !token.trim()) {
    return {
      configured: false,
      reason:
        'No GitHub token is configured. Set GITHUB_TOKEN (or GITHUB_AUTOMATION_TOKEN) to allow repository scanning.',
    };
  }
  return { configured: true };
}

/** Lists repositories the token can reach, most recently pushed first. */
export async function listRepositories(options: GitHubFetchOptions): Promise<{
  repos: RepoSummary[];
  receipt: ExecutionReceipt;
}> {
  const status = githubTokenStatus(options.token);
  if (!status.configured) {
    return {
      repos: [],
      receipt: buildReceipt({
        action: 'github.listRepositories',
        target: 'github account',
        outcome: 'NOT_CONFIGURED',
        detailEn: status.reason!,
        detailHi: 'गिटहब टोकन सेट नहीं है, इसलिए रिपॉज़िटरी सूची उपलब्ध नहीं है।',
        failureReason: status.reason,
      }),
    };
  }

  const res = await githubFetch<
    Array<{
      full_name: string;
      default_branch: string;
      private: boolean;
      pushed_at: string | null;
      permissions?: { push?: boolean };
    }>
  >(
    '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
    options
  );

  if (!res.ok || !res.data) {
    return {
      repos: [],
      receipt: buildReceipt({
        action: 'github.listRepositories',
        target: 'github account',
        outcome: 'FAILED',
        detailEn: `GitHub rejected the repository listing: ${res.error}`,
        detailHi: 'गिटहब ने रिपॉज़िटरी सूची अस्वीकार कर दी।',
        failureReason: res.error,
      }),
    };
  }

  const repos: RepoSummary[] = res.data.map((r) => ({
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    isPrivate: r.private,
    pushedAt: r.pushed_at,
    canPush: r.permissions?.push === true,
  }));

  return {
    repos,
    receipt: buildReceipt({
      action: 'github.listRepositories',
      target: 'github account',
      outcome: 'VERIFIED',
      detailEn: `Discovered ${repos.length} repositories via the GitHub API.`,
      detailHi: `गिटहब API से ${repos.length} रिपॉज़िटरी मिलीं।`,
      evidence: makeEvidence('remote_http_response', `${repos.length} repositories returned`, {
        ref: `${API}/user/repos`,
      }),
    }),
  };
}

const FAILING_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
]);

/**
 * Runs that ended without a verdict on the code. A cancelled run is not a
 * failure — it was stopped, often deliberately — so it is tracked separately
 * rather than inflating the failure count.
 */
const NON_FAILURE_ABORT_CONCLUSIONS = new Set(['cancelled', 'stale', 'skipped', 'neutral']);

/**
 * Scans a single repository: branch head, open PRs and recent CI conclusions.
 *
 * A repo the token cannot read comes back `reachable: false` with the API's own
 * message, so a private-repo 404 is never mistaken for a clean repo.
 */
export async function scanRepository(
  fullName: string,
  options: GitHubFetchOptions
): Promise<RepoScan> {
  const scannedAt = new Date().toISOString();
  const status = githubTokenStatus(options.token);

  if (!status.configured) {
    return {
      fullName,
      reachable: false,
      reason: status.reason,
      scannedAt,
      receipt: buildReceipt({
        action: 'github.scanRepository',
        target: fullName,
        outcome: 'NOT_CONFIGURED',
        detailEn: status.reason!,
        detailHi: 'गिटहब टोकन सेट नहीं है, इसलिए रिपॉज़िटरी स्कैन संभव नहीं है।',
        failureReason: status.reason,
      }),
    };
  }

  const repoRes = await githubFetch<{
    full_name: string;
    default_branch: string;
    permissions?: { push?: boolean };
  }>(`/repos/${fullName}`, options);

  if (!repoRes.ok || !repoRes.data) {
    return {
      fullName,
      reachable: false,
      reason: repoRes.error,
      scannedAt,
      receipt: buildReceipt({
        action: 'github.scanRepository',
        target: fullName,
        outcome: 'FAILED',
        detailEn: `Could not read ${fullName}: ${repoRes.error}`,
        detailHi: `${fullName} पढ़ा नहीं जा सका।`,
        failureReason: repoRes.error,
      }),
    };
  }

  const defaultBranch = repoRes.data.default_branch;

  const [branchRes, commitRes, prRes, runRes] = await Promise.all([
    githubFetch<Array<{ name: string; commit: { sha: string } }>>(
      `/repos/${fullName}/branches?per_page=100`,
      options
    ),
    githubFetch<{ sha: string; commit: { message: string; author: { date: string } | null } }>(
      `/repos/${fullName}/commits/${defaultBranch}`,
      options
    ),
    githubFetch<
      Array<{
        number: number;
        title: string;
        state: 'open' | 'closed';
        draft: boolean;
        head: { ref: string };
        base: { ref: string };
        mergeable: boolean | null;
        updated_at: string;
        html_url: string;
      }>
    >(`/repos/${fullName}/pulls?state=open&per_page=100`, options),
    githubFetch<{
      total_count: number;
      workflow_runs: Array<{
        id: number;
        name: string;
        head_branch: string | null;
        status: string | null;
        conclusion: string | null;
        created_at: string;
        html_url: string;
      }>;
    }>(`/repos/${fullName}/actions/runs?per_page=30`, options),
  ]);

  const branches: BranchSummary[] =
    branchRes.ok && branchRes.data
      ? branchRes.data.map((b) => ({
          name: b.name,
          sha: b.commit.sha,
          isDefault: b.name === defaultBranch,
        }))
      : [];

  const openPullRequests: PullRequestSummary[] =
    prRes.ok && prRes.data
      ? prRes.data.map((p) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          draft: p.draft,
          headBranch: p.head.ref,
          baseBranch: p.base.ref,
          mergeable: p.mergeable,
          updatedAt: p.updated_at,
          htmlUrl: p.html_url,
        }))
      : [];

  const recentWorkflowRuns: WorkflowRunSummary[] =
    runRes.ok && runRes.data && Array.isArray(runRes.data.workflow_runs)
      ? runRes.data.workflow_runs.map((r) => ({
          id: r.id,
          name: r.name,
          branch: r.head_branch,
          status: r.status,
          conclusion: r.conclusion,
          createdAt: r.created_at,
          htmlUrl: r.html_url,
        }))
      : [];

  const failingWorkflowRuns = recentWorkflowRuns.filter(
    (r) => r.conclusion !== null && FAILING_CONCLUSIONS.has(r.conclusion)
  );
  const abortedWorkflowRuns = recentWorkflowRuns.filter(
    (r) => r.conclusion !== null && NON_FAILURE_ABORT_CONCLUSIONS.has(r.conclusion)
  );

  // GitHub returns 404 when Actions is disabled for a repository; a 200 with an
  // empty list means CI exists but has never run.
  const ciConfigured = runRes.status !== 404;
  const headSha = commitRes.data?.sha;
  const headCommitMessage = commitRes.data?.commit?.message?.split('\n')[0];
  const headCommitDate = commitRes.data?.commit?.author?.date;
  const headCommitAgeHours = headCommitDate
    ? Math.round(((Date.now() - new Date(headCommitDate).getTime()) / 3_600_000) * 10) / 10
    : undefined;

  const branchesWithPrs = new Set(openPullRequests.map((p) => p.headBranch));
  const unmergedBranchCount = branches.filter(
    (b) => !b.isDefault && !branchesWithPrs.has(b.name)
  ).length;

  const missing: string[] = [];
  if (!branchRes.ok || !Array.isArray(branchRes.data)) missing.push(`branches (${branchRes.error || 'unexpected response shape'})`);
  if (!commitRes.ok || !commitRes.data) missing.push(`head commit (${commitRes.error || 'unexpected response shape'})`);
  if (!prRes.ok || !Array.isArray(prRes.data)) missing.push(`pull requests (${prRes.error || 'unexpected response shape'})`);
  // A 404 means Actions is disabled for this repository, which is a real answer.
  if (runRes.status === 404) {
    // CI genuinely not configured; not a read failure.
  } else if (!runRes.ok || !runRes.data || !Array.isArray(runRes.data.workflow_runs)) {
    missing.push(`workflow runs (${runRes.error || 'unexpected response shape'})`);
  }

  const detailParts = [
    `default branch ${defaultBranch}`,
    headSha ? `head ${headSha.slice(0, 7)}` : 'head unknown',
    `${openPullRequests.length} open PR(s)`,
    ciConfigured ? `${failingWorkflowRuns.length} failing run(s)` : 'no CI configured',
    abortedWorkflowRuns.length > 0 ? `${abortedWorkflowRuns.length} cancelled/skipped run(s)` : null,
  ].filter((p): p is string => p !== null);
  if (missing.length > 0) detailParts.push(`unreadable: ${missing.join(', ')}`);

  // The scan is trustworthy even when a sub-read failed, but a partial scan must
  // say so rather than claiming a complete picture.
  const outcome = missing.length > 0 ? 'DISPATCHED' : 'VERIFIED';

  return {
    fullName,
    reachable: true,
    defaultBranch,
    headSha,
    headCommitMessage,
    headCommitAgeHours,
    branches,
    openPullRequests,
    recentWorkflowRuns,
    failingWorkflowRuns,
    abortedWorkflowRuns,
    ciConfigured,
    unmergedBranchCount,
    scannedAt,
    receipt: buildReceipt({
      action: 'github.scanRepository',
      target: fullName,
      outcome,
      detailEn: `${fullName}: ${detailParts.join(', ')}.`,
      detailHi: `${fullName} का स्कैन पूरा हुआ।`,
      evidence: makeEvidence('remote_http_response', `${fullName} scanned via GitHub API`, {
        ref: `${API}/repos/${fullName}`,
      }),
    }),
  };
}

export interface MultiRepoScan {
  scans: RepoScan[];
  reachableCount: number;
  unreachableCount: number;
  reposWithFailingCi: string[];
  reposWithOpenPrs: string[];
  scannedAt: string;
  receipt: ExecutionReceipt;
}

/** Scans every reachable repository. Unreachable repositories are listed, not hidden. */
export async function scanAllRepositories(options: GitHubFetchOptions): Promise<MultiRepoScan> {
  const { repos, receipt } = await listRepositories(options);
  const scannedAt = new Date().toISOString();

  if (!receipt.verified && repos.length === 0) {
    return {
      scans: [],
      reachableCount: 0,
      unreachableCount: 0,
      reposWithFailingCi: [],
      reposWithOpenPrs: [],
      scannedAt,
      receipt,
    };
  }

  const scans: RepoScan[] = [];
  for (const repo of repos) {
    scans.push(await scanRepository(repo.fullName, options));
  }

  const reachable = scans.filter((s) => s.reachable);
  const reposWithFailingCi = reachable
    .filter((s) => (s.failingWorkflowRuns?.length ?? 0) > 0)
    .map((s) => s.fullName);
  const reposWithOpenPrs = reachable
    .filter((s) => (s.openPullRequests?.length ?? 0) > 0)
    .map((s) => s.fullName);

  const unreachable = scans.filter((s) => !s.reachable);

  return {
    scans,
    reachableCount: reachable.length,
    unreachableCount: unreachable.length,
    reposWithFailingCi,
    reposWithOpenPrs,
    scannedAt,
    receipt: buildReceipt({
      action: 'github.scanAllRepositories',
      target: 'all repositories',
      outcome: unreachable.length > 0 ? 'DISPATCHED' : 'VERIFIED',
      detailEn: `Scanned ${scans.length} repositories: ${reachable.length} reachable, ${unreachable.length} unreachable, ${reposWithFailingCi.length} with failing CI.`,
      detailHi: `${scans.length} रिपॉज़िटरी स्कैन हुईं।`,
      evidence: makeEvidence('remote_http_response', `${reachable.length} repositories scanned`, {
        ref: `${API}/user/repos`,
      }),
    }),
  };
}