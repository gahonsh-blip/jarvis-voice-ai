import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec, execSync } from 'child_process';
import {
  describeEmailConduit,
  isEmailTransportImplemented,
  EMAIL_CAPABILITY_NOTE,
  type EmailConduitStatus,
} from './src/utils/emailConduitTruth';
import {
  FINANCE_GUARD_PROBES,
  summariseFinanceGuard,
  type FinanceGuardProbeResult,
  type FinanceGuardReport,
} from './src/utils/financeGuardTruth';
import { PermissionGuard } from './src/utils/computerOperator/permissionGuard';
import { classifyWebFetchContent } from './src/utils/hardening/webFetchTruth';

// ==============================================================================
// 1. GLOBAL EMERGENCY STOP / PAUSE ENGINE
// ==============================================================================
export interface EmergencyState {
  emergencyPaused: boolean;
  hardKillSwitchTriggered?: boolean;
  pausedAt?: string;
  pausedBy?: string;
  reason?: string;
}

let emergencyState: EmergencyState = {
  emergencyPaused: false,
};

export function getEmergencyState(): EmergencyState {
  return { ...emergencyState };
}

/**
 * The durable subset of the emergency/kill-switch state. Persisted so a freeze
 * an operator engaged survives a restart — a safety stop that evaporates on
 * reboot is worse than no stop, because the operator still believes it holds.
 */
export interface EmergencyPersistedState {
  emergencyPaused: boolean;
  hardKillSwitchTriggered: boolean;
  pausedAt?: string;
  pausedBy?: string;
  reason?: string;
}

export function persistedEmergencyState(): EmergencyPersistedState {
  return {
    emergencyPaused: emergencyState.emergencyPaused === true,
    hardKillSwitchTriggered: emergencyState.hardKillSwitchTriggered === true,
    ...(emergencyState.pausedAt ? { pausedAt: emergencyState.pausedAt } : {}),
    ...(emergencyState.pausedBy ? { pausedBy: emergencyState.pausedBy } : {}),
    ...(emergencyState.reason ? { reason: emergencyState.reason } : {}),
  };
}

/**
 * Replace the live emergency state with a previously persisted snapshot. Used
 * on boot to restore a freeze, and to roll the freeze back when a write that
 * was reported could not actually reach disk.
 */
export function hydrateEmergencyState(stored: EmergencyPersistedState | null | undefined): void {
  emergencyState = {
    emergencyPaused: stored?.emergencyPaused === true,
    hardKillSwitchTriggered: stored?.hardKillSwitchTriggered === true,
    ...(stored?.pausedAt ? { pausedAt: stored.pausedAt } : {}),
    ...(stored?.pausedBy ? { pausedBy: stored.pausedBy } : {}),
    ...(stored?.reason ? { reason: stored.reason } : {}),
  };
}

export function toggleEmergencyStop(
  requestedBy: string = 'HUMAN_OPERATOR',
  reason: string = 'User triggered emergency safety stop'
): EmergencyState {
  emergencyState.emergencyPaused = !emergencyState.emergencyPaused;
  if (emergencyState.emergencyPaused) {
    emergencyState.pausedAt = new Date().toISOString();
    emergencyState.pausedBy = requestedBy;
    emergencyState.reason = reason;
  } else {
    emergencyState.pausedAt = undefined;
    emergencyState.pausedBy = undefined;
    emergencyState.reason = undefined;
  }
  return { ...emergencyState };
}

// ==============================================================================
// 2. STRICT FINANCE EXCLUSION SAFETY FILTER
// ==============================================================================
export function isFinanceBlocked(textOrAction: string): { blocked: boolean; reason?: string } {
  if (!textOrAction) return { blocked: false };
  const lower = String(textOrAction).toLowerCase();
  const financeKeywords = [
    'upi', 'gpay', 'phonepe', 'paytm', 'bhim', 'netbanking', 'bank account',
    'banking', 'account transfer', 'money transfer', 'transfer money', 'transfer funds',
    'send funds', 'move money', 'transfer rupees', 'credit card', 'debit card',
    'cvv', 'wallet balance', 'crypto', 'cryptocurrency', 'bitcoin', 'btc', 'eth',
    'ethereum', 'usdt', 'binance', 'crypto trading', 'stocks trading', 'zerodha',
    'groww', 'loan approval', 'apply loan', 'payment gateway', 'stripe charge',
    'razorpay charge', 'payout money', 'send money', 'withdraw money',
    'deposit money', 'financial transaction', 'wire money', 'fund transfer',
    'credit balance', 'debit balance'
  ];

  for (const kw of financeKeywords) {
    // Word-boundary matching only. The previous bare `lower.includes(kw)` fallback
    // was unsafe: short finance tokens ("eth", "btc", "upi", "cvv", "bhim") occur
    // inside ordinary English words ("whether", "together", "method", "recall"),
    // so benign conversation was misclassified as a blocked financial operation.
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) {
      return {
        blocked: true,
        reason: `JARVIS Security Guard: Financial operation involving "${kw}" is strictly restricted and excluded from autonomous control. JARVIS is prohibited from accessing, executing, or automating any banking, UPI, cards, wallets, investments, loans, crypto, or payment transactions.`,
      };
    }
  }
  return { blocked: false };
}

// ==============================================================================
// 2b. FINANCE-GUARD SELF-CHECK — runs the shared probe corpus through both
//     enforcement engines and returns what they actually did. Used by
//     `/api/security/finance-guard` and by the guard tests, so the panel's
//     status is derived from the same path the runtime uses.
// ==============================================================================
export function runFinanceGuardSelfCheck(): FinanceGuardReport {
  const results: FinanceGuardProbeResult[] = FINANCE_GUARD_PROBES.map((probe) => {
    if (probe.surface === 'intent') {
      const outcome = isFinanceBlocked(probe.text);
      return { ...probe, blocked: outcome.blocked, detail: outcome.reason };
    }
    const outcome = PermissionGuard.permanentBlock({
      id: 'finance-self-check',
      type: 'TERMINAL_COMMAND',
      command: probe.text,
      description: probe.text,
      securityLevel: 1,
      requiresHumanApproval: false,
    });
    return { ...probe, blocked: outcome !== null, detail: outcome?.blockReason };
  });

  return summariseFinanceGuard(results);
}

// ==============================================================================
// 3. LEVEL 1-4 PERMISSION ACTION REGISTRY (HUMAN-IN-THE-LOOP APPROVALS)
// ==============================================================================
export interface PermissionActionRequest {
  id: string;
  exactAction: string;
  target: string;
  contentChanges: string;
  requiredPermission: 'LEVEL 4 EXTERNAL ACTION' | 'LEVEL 3 MODIFY';
  level: 3 | 4;
  requestedAt: string;
  source: 'web_terminal' | 'telegram_mobile' | 'voice_command' | 'scheduler_daemon' | string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'BLOCKED_EMERGENCY_STOP';
  platform?: string;
  actionPayload?: any;
  resultUrn?: string;
  errorReason?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

let pendingActionRequests: PermissionActionRequest[] = [];

export function getPendingApprovals(): PermissionActionRequest[] {
  return pendingActionRequests.filter((a) => a.status === 'PENDING_APPROVAL');
}

export function getAllActionRequests(): PermissionActionRequest[] {
  return [...pendingActionRequests];
}

/**
 * The registry snapshot that is persisted. Kept to the same 50-record cap the
 * live array uses, and round-tripped through JSON so only serialisable data is
 * written.
 */
export function persistedActionRequests(): PermissionActionRequest[] {
  return JSON.parse(JSON.stringify(pendingActionRequests.slice(0, 50)));
}

/**
 * Replace the live registry with a previously persisted snapshot. Used on boot
 * to restore the approval queue and to roll the queue back when a write that
 * was reported could not actually reach disk. A non-array (or a legacy file
 * with no registry) leaves the registry empty rather than inventing requests.
 */
export function hydrateActionRequests(stored: unknown): void {
  if (!Array.isArray(stored)) {
    pendingActionRequests = [];
    return;
  }
  pendingActionRequests = (stored as PermissionActionRequest[]).slice(0, 50);
}

/**
 * Statuses a request can no longer move out of. A decision is a fact: once a
 * request is REJECTED, EXECUTED, FAILED or blocked by the emergency stop, a
 * later call must not rewrite it. Before this guard the shared helper accepted
 * any transition, so re-approving an already-decided request re-stamped it and
 * callers (e.g. the Telegram `approve_perm_` branch) reported a fresh approval
 * for a decision the human had already made.
 */
const TERMINAL_ACTION_STATUSES: ReadonlySet<PermissionActionRequest['status']> = new Set([
  'REJECTED',
  'EXECUTED',
  'FAILED',
  'BLOCKED_EMERGENCY_STOP',
]);

/**
 * Whether a request may move from `current` to `next`. Only a live
 * PENDING_APPROVAL request can be decided, and only once: every decision is
 * terminal, so no further transition is allowed out of a terminal status.
 */
export function canTransitionActionStatus(
  current: PermissionActionRequest['status'],
  _next: PermissionActionRequest['status']
): boolean {
  return !TERMINAL_ACTION_STATUSES.has(current);
}

export function createPendingActionRequest(params: {
  exactAction: string;
  target: string;
  contentChanges: string;
  level?: 3 | 4;
  source?: string;
  platform?: string;
  actionPayload?: any;
}): { request: PermissionActionRequest; blockedByEmergency?: boolean; blockedByFinance?: boolean; financeReason?: string } {
  // 1. Finance Check
  const finCheck = isFinanceBlocked(`${params.exactAction} ${params.target} ${params.contentChanges}`);
  if (finCheck.blocked) {
    return {
      request: {
        id: `perm-${Date.now()}`,
        exactAction: params.exactAction,
        target: params.target,
        contentChanges: params.contentChanges,
        requiredPermission: params.level === 3 ? 'LEVEL 3 MODIFY' : 'LEVEL 4 EXTERNAL ACTION',
        level: params.level || 4,
        requestedAt: new Date().toISOString(),
        source: params.source || 'web_terminal',
        status: 'REJECTED',
        platform: params.platform,
        errorReason: finCheck.reason,
      },
      blockedByFinance: true,
      financeReason: finCheck.reason,
    };
  }

  // 2. Emergency Pause Check
  if (emergencyState.emergencyPaused) {
    const blockedReq: PermissionActionRequest = {
      id: `perm-${Date.now()}`,
      exactAction: params.exactAction,
      target: params.target,
      contentChanges: params.contentChanges,
      requiredPermission: params.level === 3 ? 'LEVEL 3 MODIFY' : 'LEVEL 4 EXTERNAL ACTION',
      level: params.level || 4,
      requestedAt: new Date().toISOString(),
      source: params.source || 'web_terminal',
      status: 'BLOCKED_EMERGENCY_STOP',
      platform: params.platform,
      errorReason: 'All autonomous external actions and modifications are paused due to active Emergency Stop.',
    };
    pendingActionRequests.unshift(blockedReq);
    return { request: blockedReq, blockedByEmergency: true };
  }

  const req: PermissionActionRequest = {
    id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    exactAction: params.exactAction,
    target: params.target,
    contentChanges: params.contentChanges,
    requiredPermission: params.level === 3 ? 'LEVEL 3 MODIFY' : 'LEVEL 4 EXTERNAL ACTION',
    level: params.level || 4,
    requestedAt: new Date().toISOString(),
    source: params.source || 'web_terminal',
    status: 'PENDING_APPROVAL',
    platform: params.platform,
    actionPayload: params.actionPayload,
  };

  pendingActionRequests.unshift(req);
  if (pendingActionRequests.length > 50) {
    pendingActionRequests = pendingActionRequests.slice(0, 50);
  }
  return { request: req };
}

export function activateEmergencyKillSwitch(
  requestedBy: string = 'GLOBAL_KILL_SWITCH',
  reason: string = 'Global Kill Switch Triggered by Operator'
): { emergencyState: EmergencyState; clearedTasksCount: number } {
  emergencyState.emergencyPaused = true;
  emergencyState.pausedAt = new Date().toISOString();
  emergencyState.pausedBy = requestedBy;
  emergencyState.reason = reason;

  let clearedTasksCount = 0;
  pendingActionRequests.forEach((req) => {
    if (req.status === 'PENDING_APPROVAL') {
      req.status = 'REJECTED';
      req.resolvedAt = new Date().toISOString();
      req.resolvedBy = requestedBy;
      req.errorReason = 'Aborted immediately by Global Kill Switch';
      clearedTasksCount++;
    }
  });

  return {
    emergencyState: { ...emergencyState },
    clearedTasksCount,
  };
}

export function resumeSystemOperation(requestedBy: string = 'HUMAN_OPERATOR'): EmergencyState {
  emergencyState.emergencyPaused = false;
  emergencyState.pausedAt = undefined;
  emergencyState.pausedBy = requestedBy;
  emergencyState.reason = undefined;
  return { ...emergencyState };
}

export function updateActionRequestStatus(
  id: string,
  status: PermissionActionRequest['status'],
  details?: { resultUrn?: string; errorReason?: string; resolvedBy?: string }
): PermissionActionRequest | null {
  const req = pendingActionRequests.find((a) => a.id === id);
  if (!req) return null;
  // A request that already carries a terminal decision is not re-decidable.
  // Returning null lets every caller apply the same "no such pending action"
  // handling, instead of re-stamping the request and reporting a fresh success.
  if (!canTransitionActionStatus(req.status, status)) return null;
  req.status = status;
  req.resolvedAt = new Date().toISOString();
  if (details?.resultUrn) req.resultUrn = details.resultUrn;
  if (details?.errorReason) req.errorReason = details.errorReason;
  if (details?.resolvedBy) req.resolvedBy = details.resolvedBy;
  return req;
}

// ==============================================================================
// 4. REAL FILESYSTEM EXECUTION TOOLS (RESTRICTED TO PROJECT ROOT)
// ==============================================================================
const PROJECT_ROOT = path.resolve(process.cwd());

const PROTECTED_PATH_SEGMENTS = new Set(['.git', '.ssh', '.gnupg', '.aws']);
const PROTECTED_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^\.yarnrc(\.yml)?$/i,
  /^\.git-credentials$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
];

function isProtectedPath(absolutePath: string): boolean {
  const rel = path.relative(PROJECT_ROOT, absolutePath);
  if (!rel) return false;
  const segments = rel.split(path.sep).filter(Boolean);
  if (segments.some((segment) => PROTECTED_PATH_SEGMENTS.has(segment.toLowerCase()))) return true;
  const base = segments[segments.length - 1] ?? '';
  return PROTECTED_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

function safeResolvePath(relativePath: string): { safePath: string; error?: string } {
  try {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      return { safePath: '', error: 'Invalid path: a non-empty string is required.' };
    }
    if (relativePath.includes('\0')) {
      return { safePath: '', error: 'Access denied: path contains an illegal null byte.' };
    }
    const cleaned = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const absolute = path.resolve(PROJECT_ROOT, cleaned);
    // Containment must be decided on path segments, never on a raw string prefix:
    // "/root-sibling".startsWith("/root") is true, yet lies outside the root.
    const relative = path.relative(PROJECT_ROOT, absolute);
    const escapesRoot =
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative);
    if (escapesRoot) {
      return { safePath: '', error: 'Access denied: Path is outside authorized workspace root.' };
    }
    if (isProtectedPath(absolute)) {
      return { safePath: '', error: 'Access denied: Path targets a protected credential or VCS location.' };
    }
    return { safePath: absolute };
  } catch (err: any) {
    return { safePath: '', error: `Invalid path resolution: ${err.message}` };
  }
}

export function realFsList(subDir: string = '.'): { success: boolean; files?: string[]; error?: string } {
  const { safePath, error } = safeResolvePath(subDir);
  if (error || !safePath) return { success: false, error };

  try {
    if (!fs.existsSync(safePath)) {
      return { success: false, error: `Directory "${subDir}" does not exist.` };
    }
    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    const formatted = entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
      .map((e) => `${e.isDirectory() ? '📁 ' : '📄 '}${e.name}`);
    return { success: true, files: formatted };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Search the workspace for files whose name matches a query. Returns the real
 * relative paths and byte sizes read from disk. Never invents a match: an empty
 * result means the file genuinely is not in the workspace.
 */
export function realFsSearch(query: string, maxResults: number = 10): {
  success: boolean;
  matches?: { path: string; sizeBytes: number }[];
  error?: string;
} {
  const term = (query || '').trim().toLowerCase();
  if (!term) return { success: false, error: 'No search term provided.' };

  const skipDirs = new Set(['node_modules', 'dist', '.git', 'build', 'coverage']);
  const found: { path: string; sizeBytes: number }[] = [];

  const walk = (dir: string): void => {
    if (found.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxResults) return;
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().includes(term)) {
        let sizeBytes = 0;
        try {
          sizeBytes = fs.statSync(full).size;
        } catch {
          continue;
        }
        found.push({ path: path.relative(PROJECT_ROOT, full), sizeBytes });
      }
    }
  };

  try {
    walk(PROJECT_ROOT);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  return { success: true, matches: found };
}

export function realFsRead(filePath: string): { success: boolean; content?: string; error?: string; sizeBytes?: number } {
  const { safePath, error } = safeResolvePath(filePath);
  if (error || !safePath) return { success: false, error };

  try {
    if (!fs.existsSync(safePath)) {
      return { success: false, error: `File "${filePath}" does not exist in workspace.` };
    }
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      return { success: false, error: `Path "${filePath}" is a directory, not a file.` };
    }
    if (stat.size > 2 * 1024 * 1024) {
      return { success: false, error: `File exceeds maximum safe read limit (2MB).` };
    }
    const content = fs.readFileSync(safePath, 'utf-8');
    return { success: true, content, sizeBytes: stat.size };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function realFsWrite(filePath: string, content: string): { success: boolean; error?: string; bytesWritten?: number } {
  if (emergencyState.emergencyPaused) {
    return { success: false, error: 'File write blocked: Emergency Stop is currently active.' };
  }

  const { safePath, error } = safeResolvePath(filePath);
  if (error || !safePath) return { success: false, error };

  try {
    const parentDir = path.dirname(safePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(safePath, content, 'utf-8');
    return { success: true, bytesWritten: Buffer.byteLength(content, 'utf-8') };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function realFsDelete(filePath: string): { success: boolean; error?: string } {
  if (emergencyState.emergencyPaused) {
    return { success: false, error: 'File delete blocked: Emergency Stop is currently active.' };
  }

  const { safePath, error } = safeResolvePath(filePath);
  if (error || !safePath) return { success: false, error };

  try {
    if (!fs.existsSync(safePath)) {
      return { success: false, error: `Target file "${filePath}" does not exist.` };
    }
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      if (typeof fs.rmSync === 'function') {
        fs.rmSync(safePath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(safePath, { recursive: true });
      }
    } else {
      fs.unlinkSync(safePath);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ==============================================================================
// 5. REAL GIT & REPOSITORY EXECUTION TOOLS
// ==============================================================================
export function realGitStatus(): { success: boolean; branch?: string | null; statusText?: string; clean?: boolean; error?: string } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { cwd: PROJECT_ROOT, timeout: 3000 })
      .toString()
      .trim();
    const statusOutput = execSync('git status -s 2>/dev/null', { cwd: PROJECT_ROOT, timeout: 3000 })
      .toString()
      .trim();
    return {
      success: true,
      branch: branch || null,
      statusText: statusOutput || 'Working tree clean (no uncommitted changes)',
      clean: !statusOutput,
    };
  } catch (err: any) {
    // Never invent repository state. If git cannot be queried, report failure
    // so callers show UNKNOWN instead of a fabricated clean "main" branch.
    return {
      success: false,
      error: `Git is unavailable in this environment: ${err?.message || err}`,
    };
  }
}

export function realGitLog(count: number = 5): { success: boolean; commits?: string[]; error?: string } {
  try {
    const logOutput = execSync(`git log -n ${count} --oneline 2>/dev/null`, { cwd: PROJECT_ROOT, timeout: 3000 })
      .toString()
      .trim();
    const commits = logOutput ? logOutput.split('\n') : [];
    return { success: true, commits };
  } catch (err: any) {
    // The previous fallback returned three invented commit subjects with
    // success: true, so the tools HUD displayed a history that never existed.
    return {
      success: false,
      error: `Git is unavailable in this environment: ${err?.message || err}`,
    };
  }
}

export function realGitDiff(): { success: boolean; diff?: string; error?: string } {
  try {
    const diff = execSync('git diff 2>/dev/null', { cwd: PROJECT_ROOT, timeout: 4000 }).toString().trim();
    return { success: true, diff: diff || 'No uncommitted differences found.' };
  } catch (err: any) {
    // 'Diff tool nominal.' asserted success while saying nothing about state.
    return {
      success: false,
      error: `Git is unavailable in this environment: ${err?.message || err}`,
    };
  }
}

// ==============================================================================
// 6. REAL GITHUB REST API INTEGRATION
// ==============================================================================
export async function realGithubStatus(): Promise<{
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  publicRepos?: number;
  message?: string;
  missingEnvVar?: string;
}> {
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (!token) {
    return {
      connected: false,
      missingEnvVar: 'GITHUB_TOKEN',
      message: 'GITHUB_TOKEN is not configured in environment variables. Add GITHUB_TOKEN in AI Studio Settings (⚙️) to enable GitHub repository and issue management.',
    };
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'HERMES-JARVIS-Daemon',
      },
    });

    if (res.ok) {
      const data: any = await res.json();
      return {
        connected: true,
        username: data.login,
        avatarUrl: data.avatar_url,
        publicRepos: data.public_repos,
        message: `Authenticated as GitHub user: @${data.login}`,
      };
    } else {
      return {
        connected: false,
        message: `GitHub token rejected by API (HTTP ${res.status}). Verify GITHUB_TOKEN validity and scopes.`,
      };
    }
  } catch (err: any) {
    return {
      connected: false,
      message: `Failed to contact api.github.com: ${err.message}`,
    };
  }
}

export async function realGithubRepos(): Promise<{
  success: boolean;
  repos?: { name: string; fullName: string; private: boolean; htmlUrl: string; description: string; defaultBranch: string }[];
  error?: string;
  message?: string;
}> {
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (!token) {
    return {
      success: false,
      error: 'NOT_CONNECTED',
      message: 'GITHUB_TOKEN is missing. Provide GITHUB_TOKEN in environment settings.',
    };
  }

  try {
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=15', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'HERMES-JARVIS-Daemon',
      },
    });

    if (res.ok) {
      const list: any[] = await res.json();
      const formatted = list.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
        description: r.description || '',
        defaultBranch: r.default_branch || 'main',
      }));
      return { success: true, repos: formatted };
    } else {
      return { success: false, error: `GitHub API error: HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function realGithubCreateIssue(
  repoFullName: string,
  title: string,
  body: string
): Promise<{ success: boolean; issueUrl?: string; issueNumber?: number; error?: string }> {
  if (emergencyState.emergencyPaused) {
    return { success: false, error: 'Action blocked: Emergency Stop is currently active.' };
  }

  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (!token) {
    return { success: false, error: 'GITHUB_TOKEN is not configured.' };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'HERMES-JARVIS-Daemon',
      },
      body: JSON.stringify({ title, body }),
    });

    const data: any = await res.json();
    if (res.ok && data.html_url) {
      return { success: true, issueUrl: data.html_url, issueNumber: data.number };
    } else {
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ==============================================================================
// 7. CONTROLLED WEB RESEARCH & SAFE FETCHER
// ==============================================================================
export async function realWebFetch(targetUrl: string): Promise<{
  success: boolean;
  title?: string;
  textContent?: string;
  url?: string;
  error?: string;
}> {
  try {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    } catch {
      return { success: false, error: 'Invalid URL format provided.' };
    }

    // Security boundary: disallow private IP addresses and localhost loops
    const host = parsedUrl.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('169.254.')) {
      return { success: false, error: 'Access denied: Target URL resolves to an internal network boundary.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, error: `Website returned status code HTTP ${res.status}` };
    }

    const rawHtml = await res.text();
    // A 2xx response is not a retrieval: a bot-check / consent interstitial, an
    // empty shell or a script-only page answers 200 with nothing readable. The
    // old code reported `success: true` regardless and labelled such a page with
    // its hostname, so a page that exposed nothing still read as fetched.
    const content = classifyWebFetchContent(rawHtml);
    if (!content.usable) {
      return { success: false, error: `No readable content: ${content.reason}.` };
    }

    let cleanText = content.textContent;
    if (cleanText.length > 5000) {
      cleanText = cleanText.slice(0, 5000) + '... [Content truncated for safe analysis]';
    }

    return {
      success: true,
      title: content.title ?? undefined,
      url: parsedUrl.toString(),
      textContent: cleanText,
    };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch web content: ${err.message}` };
  }
}

// ==============================================================================
// 8. REAL EMAIL / GOOGLE WORKSPACE TOOLS
// ==============================================================================
export function realEmailStatus(): {
  configured: boolean;
  status: EmailConduitStatus;
  transportImplemented: boolean;
  service: string;
  senderAddress?: string;
  missingEnvVars: string[];
  message: string;
} {
  const user = (process.env.GMAIL_USER || process.env.SMTP_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').trim();
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();

  const missing: string[] = [];
  if (!user) missing.push('GMAIL_USER');
  if (!pass) missing.push('GMAIL_APP_PASSWORD');

  const credentialsPresent = Boolean(user && pass);
  const truth = describeEmailConduit(credentialsPresent);

  return {
    // `configured` is retained for existing callers but now only ever means
    // "credentials are present", never "a sender exists".
    configured: credentialsPresent,
    status: truth.status,
    transportImplemented: isEmailTransportImplemented(),
    service: host.includes('gmail') ? 'Gmail (Google Workspace SMTP)' : `Custom SMTP (${host})`,
    senderAddress: user || undefined,
    missingEnvVars: missing,
    message: credentialsPresent
      ? `SMTP credentials present for ${user}, but ${EMAIL_CAPABILITY_NOTE}`
      : `Email is NOT configured. Provide ${missing.join(' and ')} in environment settings to enable outbound email actions.`,
  };
}

// ==============================================================================
// 9. YOUTUBE TRANSCRIPT EXTRACTION & AUTONOMOUS SUMMARIZER ENGINE
// ==============================================================================
export interface YouTubeVideoInfo {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  durationSeconds: number;
  durationFormatted: string;
  description: string;
  thumbnailUrl: string;
  hasTranscript: boolean;
  transcriptLength: number;
  availableLanguages: string[];
}

export interface YouTubeTranscriptSegment {
  start: number;
  duration: number;
  timestamp: string;
  text: string;
}

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  
  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i,
    /youtube\.com\/clip\/([\w-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface YouTubePageMetadata {
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  description: string;
  playerResponse: any | null;
  hasPlayerResponse: boolean;
  // `ogTitle` only exists on a real watch page. A consent/bot-check page answers
  // HTTP 200 with a generic Chrome-y `<title>` and no `og:title`, which is how an
  // unparseable page is told apart from a real one without inventing a title.
  hadOpenGraphTitle: boolean;
}

/**
 * Resolve the video metadata that a fetched watch-page actually exposes.
 * Returns `null` for title/channel/duration when they were not observed — the
 * caller must then refuse the request rather than narrate a placeholder. A page
 * that parsed no `ytInitialPlayerResponse` and carries no `og:title` is treated
 * as a bot-check/consent interstitial and never as a real video.
 */
export function resolveYouTubePageMetadata(html: string, playerResponse: any | null): YouTubePageMetadata {
  const hasPlayerResponse = Boolean(playerResponse);
  const playerDetails = hasPlayerResponse ? playerResponse?.videoDetails : null;
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
  const hadOpenGraphTitle = Boolean(ogTitleMatch && ogTitleMatch[1].trim());

  let title: string | null = null;
  let channel: string | null = null;
  let durationSeconds: number | null = null;
  let description = '';

  if (playerDetails) {
    const rawTitle = typeof playerDetails.title === 'string' ? playerDetails.title.trim() : '';
    const rawAuthor = typeof playerDetails.author === 'string' ? playerDetails.author.trim() : '';
    const rawDuration = parseInt(playerDetails.lengthSeconds || '', 10);
    const rawDesc = typeof playerDetails.shortDescription === 'string' ? playerDetails.shortDescription : '';
    title = rawTitle || null;
    channel = rawAuthor || null;
    durationSeconds = Number.isFinite(rawDuration) ? rawDuration : null;
    description = rawDesc;
  } else if (hadOpenGraphTitle) {
    // A real watch page whose player-response JSON failed to parse but which
    // still exposes its own title. This is genuine page metadata, not a claim
    // about the video's channel or length, so only the title is taken.
    title = ogTitleMatch![1].replace(/ - YouTube$/, '').trim() || null;
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (descMatch) description = descMatch[1];
  }

  return { title, channel, durationSeconds, description, playerResponse, hasPlayerResponse, hadOpenGraphTitle };
}

export async function fetchYouTubeTranscriptData(
  videoIdOrUrl: string,
  preferredLang: string = 'en'
): Promise<{
  success: boolean;
  videoInfo?: YouTubeVideoInfo;
  transcript?: string;
  segments?: YouTubeTranscriptSegment[];
  error?: string;
}> {
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  if (!videoId) {
    return {
      success: false,
      error: `Invalid YouTube URL or Video ID: "${videoIdOrUrl}". Please provide a valid YouTube link (e.g. https://www.youtube.com/watch?v=...)`,
    };
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        error: `YouTube returned HTTP status ${res.status} when accessing video details.`,
      };
    }

    const html = await res.text();

    // 1. Extract Player Response JSON
    let playerResponse: any = null;
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s) ||
                               html.match(/var\s+ytInitialPlayerResponse\s*=\s*({.+?});/s);
    
    if (playerResponseMatch && playerResponseMatch[1]) {
      try {
        playerResponse = JSON.parse(playerResponseMatch[1]);
      } catch {
        // Safe fallback if trailing garbage
        const firstBrace = playerResponseMatch[0].indexOf('{');
        const lastBrace = playerResponseMatch[0].lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          try {
            playerResponse = JSON.parse(playerResponseMatch[0].substring(firstBrace, lastBrace + 1));
          } catch {
            playerResponse = null;
          }
        }
      }
    }

    // 2. Extract Title and Metadata
    const metadata = resolveYouTubePageMetadata(html, playerResponse);

    // A page that parsed no player response and exposes no og:title is a
    // consent/bot-check interstitial, not a video. Refuse it instead of
    // narrating a placeholder title and a duration nobody measured.
    if (!metadata.hasPlayerResponse && !metadata.hadOpenGraphTitle) {
      return {
        success: false,
        error:
          `YouTube did not return video metadata for "${videoId}" — the page was a consent or bot-check interstitial, ` +
          `not the video. No title, channel or duration was observed, so no summary can be produced.`,
      };
    }
    if (!metadata.title) {
      return {
        success: false,
        error: `YouTube returned a page for "${videoId}" without a usable video title; refusing to narrate a placeholder.`,
      };
    }

    const durationSeconds = metadata.durationSeconds ?? 0;

    const videoInfo: YouTubeVideoInfo = {
      videoId,
      url: watchUrl,
      title: metadata.title,
      channel: metadata.channel ?? 'Unknown creator',
      durationSeconds,
      durationFormatted: formatDuration(durationSeconds),
      description: metadata.description,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      hasTranscript: false,
      transcriptLength: 0,
      availableLanguages: [],
    };

    // 3. Extract Captions Tracks
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    videoInfo.availableLanguages = captionTracks.map((t: any) => t.languageCode || t.vssId || 'unknown');

    let segments: YouTubeTranscriptSegment[] = [];
    let fullTranscript = '';

    if (captionTracks.length > 0) {
      // Find matching language or fallback
      let selectedTrack = captionTracks.find((t: any) =>
        (t.languageCode && t.languageCode.toLowerCase() === preferredLang.toLowerCase()) ||
        (t.vssId && t.vssId.toLowerCase().includes(preferredLang.toLowerCase()))
      );

      if (!selectedTrack) {
        // Try English fallback
        selectedTrack = captionTracks.find((t: any) =>
          (t.languageCode && t.languageCode.startsWith('en')) ||
          (t.vssId && t.vssId.includes('.en'))
        );
      }

      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
      }

      if (selectedTrack && selectedTrack.baseUrl) {
        const transcriptFetchUrl = `${selectedTrack.baseUrl}&fmt=json3`;
        try {
          const capRes = await fetch(transcriptFetchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });

          if (capRes.ok) {
            const capData: any = await capRes.json();
            if (capData && Array.isArray(capData.events)) {
              for (const ev of capData.events) {
                if (ev.segs && Array.isArray(ev.segs)) {
                  const text = ev.segs
                    .map((s: any) => s.utf8 || '')
                    .join('')
                    .replace(/\n/g, ' ')
                    .trim();

                  if (text) {
                    const startSec = Math.floor((ev.tStartMs || 0) / 1000);
                    const durSec = Math.floor((ev.dDurationMs || 0) / 1000);
                    segments.push({
                      start: startSec,
                      duration: durSec,
                      timestamp: formatDuration(startSec),
                      text: decodeXmlEntities(text),
                    });
                  }
                }
              }
            }
          }
        } catch {
          // If JSON format fails, attempt XML format
          try {
            const xmlRes = await fetch(selectedTrack.baseUrl);
            if (xmlRes.ok) {
              const xmlText = await xmlRes.text();
              const xmlRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
              let match;
              while ((match = xmlRegex.exec(xmlText)) !== null) {
                const startSec = Math.floor(parseFloat(match[1]));
                const durSec = Math.floor(parseFloat(match[2]));
                const rawText = decodeXmlEntities(match[3]);
                if (rawText) {
                  segments.push({
                    start: startSec,
                    duration: durSec,
                    timestamp: formatDuration(startSec),
                    text: rawText,
                  });
                }
              }
            }
          } catch (e: any) {
            console.warn('[YouTube Transcript] XML fallback error:', e.message);
          }
        }
      }
    }

    if (segments.length > 0) {
      videoInfo.hasTranscript = true;
      fullTranscript = segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n');
      videoInfo.transcriptLength = segments.length;
    } else {
      // If closed captions are disabled on the video, use the comprehensive description and metadata.
      // This is NOT a transcript: `transcriptLength` counts observed transcript
      // segments, so it stays 0 here. Reporting `description.length` made a
      // description-character count read as a transcript length.
      fullTranscript = `[Video Metadata & Outline]\nTitle: ${videoInfo.title}\nChannel: ${videoInfo.channel}\nDuration: ${videoInfo.durationFormatted}\n\nDescription & Chapters:\n${videoInfo.description}`;
      videoInfo.hasTranscript = false;
      videoInfo.transcriptLength = 0;
    }

    return {
      success: true,
      videoInfo,
      transcript: fullTranscript,
      segments,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to fetch YouTube transcript: ${err.message}`,
    };
  }
}

// Extractive-only summarizer. It never invents content: when there is no
// transcript or description to quote it returns zero items rather than a
// plausible-sounding paragraph claiming to describe the video.
export function heuristicTranscriptSummarize(
  title: string,
  channel: string,
  durationFormatted: string,
  segments: YouTubeTranscriptSegment[],
  description: string
): {
  hasSourceText: boolean;
  executiveSummary: string;
  keyTakeaways: string[];
  bulletPoints: string[];
  actionableInsights: string[];
} {
  const combinedText = segments.length > 0 ? segments.map((s) => s.text).join(' ') : description;
  const hasSourceText = combinedText.trim().length > 0;

  // Extract key sentences with highest keyword density
  const sentences = combinedText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 240);

  const topSentences = sentences.slice(0, 6);
  const keyTakeaways = topSentences.map((s) => `• ${s}`);
  const bulletPoints = segments.slice(0, 8).map((s) => `[${s.timestamp}] ${s.text}`);

  const executiveSummary = hasSourceText
    ? `Extractive outline of "${title}" by ${channel} (${durationFormatted}) — the lines below are quoted directly from the ${segments.length > 0 ? 'transcript' : 'video description'}, not an AI interpretation.`
    : `No transcript or description is available for "${title}" by ${channel} (${durationFormatted}), so no content summary can be produced.`;

  return {
    hasSourceText,
    executiveSummary,
    keyTakeaways,
    bulletPoints,
    actionableInsights: topSentences,
  };
}

export type YouTubeSummarySource = 'gemini' | 'extractive' | 'none';

export interface YouTubeSummaryResult {
  success: true;
  videoInfo: YouTubeVideoInfo;
  summary: string;
  executiveOverview: string;
  keyTakeaways: string[];
  actionableInsights: string[];
  segments: YouTubeTranscriptSegment[];
  transcript: string;
  source: YouTubeSummarySource;
  verificationStatus: 'VERIFIED' | 'PARTIAL';
  notice?: string;
}

// Single source of truth for the summarizer's output and its truthfulness
// label. Dependency-free so it can be unit-tested without the HTTP layer.
export function buildYouTubeSummary(params: {
  videoInfo: YouTubeVideoInfo;
  segments: YouTubeTranscriptSegment[];
  transcript: string;
  description: string;
  geminiRawSummary?: string | null;
  geminiFailed?: boolean;
}): YouTubeSummaryResult {
  const { videoInfo, segments, transcript, description, geminiRawSummary, geminiFailed } = params;
  const base = { success: true as const, videoInfo, segments, transcript };

  if (geminiRawSummary && geminiRawSummary.trim()) {
    const rawSummary = geminiRawSummary.trim();
    const extractedTakeaways = (rawSummary.match(/^[•\-\*]\s+(.+)$/gm) || []).map((t) => t.trim());
    return {
      ...base,
      summary: rawSummary,
      executiveOverview: rawSummary,
      keyTakeaways: extractedTakeaways,
      actionableInsights: [],
      source: 'gemini',
      verificationStatus: 'VERIFIED',
    };
  }

  const heuristic = heuristicTranscriptSummarize(
    videoInfo.title,
    videoInfo.channel,
    videoInfo.durationFormatted,
    segments,
    description
  );

  if (heuristic.hasSourceText) {
    const summary = `### 📌 Extractive Overview\n${heuristic.executiveSummary}\n\n### ⏱️ Quoted Key Lines\n${heuristic.keyTakeaways.join('\n')}\n\n### 💡 Quoted Insights\n${heuristic.actionableInsights.map((i) => `• ${i}`).join('\n')}`;
    return {
      ...base,
      summary,
      executiveOverview: heuristic.executiveSummary,
      keyTakeaways: heuristic.keyTakeaways,
      actionableInsights: heuristic.actionableInsights,
      source: 'extractive',
      verificationStatus: 'VERIFIED',
      notice: geminiFailed
        ? 'AI synthesis was unavailable for this request; the summary is quoted directly from the transcript/description.'
        : 'Summary is quoted directly from the transcript/description (extractive mode).',
    };
  }

  // No transcript and no description: there is nothing real to summarize.
  return {
    ...base,
    success: true,
    summary: '',
    executiveOverview: '',
    keyTakeaways: [],
    actionableInsights: [],
    source: 'none',
    verificationStatus: 'PARTIAL',
    notice: geminiFailed
      ? 'AI synthesis failed and this video exposes no transcript or description, so no summary can be produced.'
      : 'AI synthesis is not configured and this video exposes no transcript or description, so no summary can be produced.',
  };
}

// ==============================================================================
// 10. INTEGRATIONS DIAGNOSTICS MATRIX (TRUTH-IN-EXECUTION AUDITOR)
// ==============================================================================
export function getIntegrationsAuditReport(): {
  summary: { total: number; credentialsPresent: number; notConfigured: number; notAvailable: number };
  items: {
    id: string;
    name: string;
    category: string;
    // CREDENTIALS_PRESENT means this process can see the integration's
    // credentials in its environment — nothing more. It is not a live
    // connection, a token validation, or a working integration; no provider
    // call is made here, so no status may claim one succeeded. NOT_AVAILABLE
    // means the integration cannot be configured in this environment at all.
    status: 'CREDENTIALS_PRESENT' | 'NOT_CONNECTED' | 'NOT_AVAILABLE';
    reason: string;
    requiredEnvVars: { key: string; label: string; configured: boolean; isSecret: boolean }[];
    capabilities: string[];
  }[];
} {
  // LinkedIn
  const linkedInClientId = Boolean(process.env.LINKEDIN_CLIENT_ID);
  const linkedInClientSecret = Boolean(process.env.LINKEDIN_CLIENT_SECRET);
  const linkedInStatic = Boolean(process.env.LINKEDIN_ACCESS_TOKEN);
  const linkedInConnected = (linkedInClientId && linkedInClientSecret) || linkedInStatic;

  // Telegram
  const tgToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const tgConnected = Boolean(tgToken && tgToken.includes(':'));

  // GitHub
  const ghToken = Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT);

  // Email
  const emailUser = Boolean(process.env.GMAIL_USER || process.env.SMTP_USER);
  const emailPass = Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);
  const emailConnected = emailUser && emailPass;

  // Facebook
  const fbToken = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID);

  // Instagram
  const igToken = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);

  // YouTube
  const ytConnected = Boolean(process.env.YOUTUBE_ACCESS_TOKEN || process.env.YOUTUBE_REFRESH_TOKEN || process.env.YOUTUBE_API_KEY);

  // Twitter/X
  const twConnected = Boolean(process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_ACCESS_TOKEN);

  const items = [
    {
      id: 'linkedin',
      name: 'LinkedIn Personal Profile (Member Posts API)',
      category: 'Professional Social',
      status: linkedInConnected ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: linkedInConnected
        ? 'Credentials are present in this environment. No provider call is made here, so authentication is not confirmed.'
        : 'Missing LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET. Configure in Settings.',
      requiredEnvVars: [
        { key: 'LINKEDIN_CLIENT_ID', label: 'OAuth 2.0 Client ID', configured: linkedInClientId, isSecret: false },
        { key: 'LINKEDIN_CLIENT_SECRET', label: 'OAuth 2.0 Client Secret', configured: linkedInClientSecret, isSecret: true },
      ],
      capabilities: ['Personal Profile Posting', 'REST Posts API 2025/v2', 'Live Verification URN', 'Human Approval Gate'],
    },
    {
      id: 'telegram',
      name: 'Telegram Bot Mobile Controller',
      category: 'Mobile Gateway',
      status: tgConnected ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: tgConnected
        ? 'A bot token is present in this environment. Polling liveness is not measured here, so a running daemon is not confirmed.'
        : 'TELEGRAM_BOT_TOKEN is missing. Provide Bot Token from @BotFather.',
      requiredEnvVars: [
        { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token', configured: tgConnected, isSecret: true },
        { key: 'TELEGRAM_ADMIN_CHAT_ID', label: 'Admin Chat ID', configured: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID), isSecret: false },
      ],
      capabilities: ['24/7 Background Polling', 'Interactive Approval Cards', 'Bilingual Command Routing', 'Proactive Briefings'],
    },
    {
      id: 'github',
      name: 'GitHub Repositories & Issue Manager',
      category: 'Code & Version Control',
      status: ghToken ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: ghToken
        ? 'A GitHub token is present in this environment. No API call is made here, so authentication is not confirmed.'
        : 'GITHUB_TOKEN is missing. Add Personal Access Token in Settings.',
      requiredEnvVars: [
        { key: 'GITHUB_TOKEN', label: 'GitHub Personal Access Token', configured: ghToken, isSecret: true },
      ],
      capabilities: ['Inspect Repositories', 'Read Commit Logs & Diffs', 'Create Issues (Level 4 Approved)', 'Branch Audits'],
    },
    {
      id: 'email',
      name: 'Email Outbound Service (SMTP / Google Workspace)',
      category: 'Communications',
      // Credential presence was reported as a working integration with the
      // reason "SMTP Conduit verified for client notifications and quotations",
      // but no SMTP client or send route exists in this build. A sender that
      // does not exist cannot be a working integration, so the status is pinned
      // to NOT_AVAILABLE and is never derived from the env vars.
      status: 'NOT_AVAILABLE' as const,
      reason: emailConnected
        ? `SMTP credentials are present, but ${EMAIL_CAPABILITY_NOTE}`
        : 'GMAIL_USER or GMAIL_APP_PASSWORD not configured, and no outbound SMTP transport exists in this build.',
      requiredEnvVars: [
        { key: 'GMAIL_USER', label: 'Gmail / SMTP Account', configured: emailUser, isSecret: false },
        { key: 'GMAIL_APP_PASSWORD', label: 'Gmail App Password', configured: emailPass, isSecret: true },
      ],
      capabilities: ['Credentials only — quotation/inquiry dispatch is NOT implemented in this build'],
    },
    {
      id: 'oracle_cloud',
      name: 'Oracle Cloud Always Free ARM VM',
      category: 'Cloud Infrastructure',
      // This process runs in a container, not on the Oracle ARM VM. The VM shape,
      // public IP and uptime are deployment metadata constants, not a measurement
      // of any live host, and no Oracle API credential is available here, so the
      // integration cannot be confirmed at all. Reporting it as a working
      // integration was a fabrication that inflated the "verified real
      // integrations" count.
      status: 'NOT_AVAILABLE' as const,
      reason:
        'No Oracle Cloud API credential or VM-level telemetry source is available in this environment; this process runs in a container, not on the Oracle ARM VM. The only live figures available describe the daemon host and are reported with metricsSource=live_host.',
      requiredEnvVars: [],
      capabilities: ['Deployment metadata only — not a verified live integration in this environment'],
    },
    {
      id: 'facebook',
      name: 'Facebook Page Graph API',
      category: 'Social Media',
      status: fbToken ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: fbToken
        ? 'Facebook Page credentials are present in this environment. No Graph API call is made here, so the page is not confirmed reachable.'
        : 'FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID missing.',
      requiredEnvVars: [
        { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Token', configured: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN), isSecret: true },
        { key: 'FACEBOOK_PAGE_ID', label: 'Page ID', configured: Boolean(process.env.FACEBOOK_PAGE_ID), isSecret: false },
      ],
      capabilities: ['Page Feed Publishing', 'Media Attachments', 'Level 4 Confirmation'],
    },
    {
      id: 'instagram',
      name: 'Instagram Business Graph API',
      category: 'Visual Social',
      status: igToken ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: igToken
        ? 'Instagram Business credentials are present in this environment. No Graph API call is made here, so the account is not confirmed reachable.'
        : 'INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID missing.',
      requiredEnvVars: [
        { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Access Token', configured: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN), isSecret: true },
        { key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID', label: 'IG Account ID', configured: Boolean(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID), isSecret: false },
      ],
      capabilities: ['Post Container Dispatch', 'Hashtags', 'Level 4 Confirmation'],
    },
    {
      id: 'youtube',
      name: 'YouTube Data API v3',
      category: 'Video Portal',
      status: ytConnected ? ('CREDENTIALS_PRESENT' as const) : ('NOT_CONNECTED' as const),
      reason: ytConnected
        ? 'A YouTube API credential is present in this environment. No API call is made here, so the key is not confirmed valid.'
        : 'YOUTUBE_API_KEY or YOUTUBE_ACCESS_TOKEN missing.',
      requiredEnvVars: [
        { key: 'YOUTUBE_API_KEY', label: 'Google API Key', configured: Boolean(process.env.YOUTUBE_API_KEY), isSecret: true },
      ],
      capabilities: ['Channel Telemetry', 'Community Posts', 'Quota Monitoring'],
    },
  ];

  const credentialsPresentCount = items.filter((i) => i.status === 'CREDENTIALS_PRESENT').length;
  const notConfiguredCount = items.filter((i) => i.status === 'NOT_CONNECTED').length;
  const notAvailableCount = items.filter((i) => i.status === 'NOT_AVAILABLE').length;
  return {
    summary: {
      total: items.length,
      credentialsPresent: credentialsPresentCount,
      notConfigured: notConfiguredCount,
      notAvailable: notAvailableCount,
    },
    items,
  };
}
