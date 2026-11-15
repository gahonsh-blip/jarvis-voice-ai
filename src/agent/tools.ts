/**
 * Super-agent tool pack.
 *
 * These are the real capabilities the agent uses to get work done on its own:
 * read and change files, run commands, search the web, call APIs, use git and
 * keep durable notes. Everything is jailed inside the configured workspace root
 * and tools that can destroy or publish something are marked dangerous so they
 * only run after a human confirms.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const MAX_OUTPUT = Number(process.env.AGENT_MAX_TOOL_OUTPUT || 12_000);
const SHELL_TIMEOUT = Number(process.env.AGENT_SHELL_TIMEOUT_MS || 60_000);

function clip(text: string, limit = MAX_OUTPUT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]`;
}

export function safeResolve(root: string, target: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, target || '.');
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new Error(`path_outside_workspace: ${target}`);
  }
  return abs;
}

const BLOCKED_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*\s+(-[a-z]*\s+)*\/(\s|$)/i, reason: 'recursive delete of /' },
  { pattern: /\bmkfs(\.|\s)/i, reason: 'filesystem format' },
  { pattern: /\bdd\s+if=/i, reason: 'raw disk write' },
  { pattern: /\bshutdown\b|\breboot\b|\bhalt\b/i, reason: 'host power control' },
  { pattern: /:\s*\(\s*\)\s*\{/, reason: 'fork bomb' },
  { pattern: /\bsudo\b|\bsu\s+-/i, reason: 'privilege escalation' },
  { pattern: /curl[^|]*\|\s*(ba)?sh/i, reason: 'piping remote script into shell' },
  { pattern: /\bchmod\s+-R\s+777\s+\//i, reason: 'opening the whole filesystem' },
  { pattern: /\bgit\s+push\s+.*--force\b/i, reason: 'force push' },
];

export function inspectCommand(command: string): { allowed: boolean; reason?: string } {
  if (!command || !command.trim()) return { allowed: false, reason: 'empty command' };
  if (command.length > 4000) return { allowed: false, reason: 'command too long' };
  for (const rule of BLOCKED_COMMANDS) {
    if (rule.pattern.test(command)) return { allowed: false, reason: rule.reason };
  }
  return { allowed: true };
}

function runShell(command: string, cwd: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd, env: process.env, timeout: SHELL_TIMEOUT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => resolve({ ok: false, output: `spawn_failed: ${e.message}` }));
    child.on('close', (code) => {
      const combined = [out, err].filter(Boolean).join('\n').trim() || '(no output)';
      resolve({ ok: code === 0, output: clip(`exit ${code}\n${combined}`) });
    });
  });
}

async function fetchText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse DuckDuckGo's lightweight HTML endpoint - free, no API key. */
export function parseDuckDuckGo(html: string, limit = 6) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(htmlToText(sm[1]));
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html)) && results.length < limit) {
    let url = m[1];
    const decoded = url.match(/uddg=([^&]+)/);
    if (decoded) url = decodeURIComponent(decoded[1]);
    results.push({ title: htmlToText(m[2]), url, snippet: snippets[i] || '' });
    i++;
  }
  return results;
}

const MEMORY_FILE = process.env.AGENT_MEMORY_FILE || 'agent_memory.json';

interface MemoryEntry {
  key: string;
  value: string;
  updated: string;
}

function readMemory(root: string): MemoryEntry[] {
  try {
    const raw = fs.readFileSync(path.join(root, MEMORY_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemory(root: string, entries: MemoryEntry[]) {
  fs.writeFileSync(path.join(root, MEMORY_FILE), JSON.stringify(entries.slice(-500), null, 2), 'utf8');
}

export const TOOLS: AgentTool[] = [
  {
    name: 'list_files',
    description: 'List files and folders inside the workspace. Use before reading unknown code.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory, default "."' },
        depth: { type: 'number', description: 'How many levels to walk, default 1, max 3' },
      },
    },
    async run(args, ctx) {
      const rel = String(args.path || '.');
      const depth = Math.min(Math.max(Number(args.depth || 1), 1), 3);
      const abs = safeResolve(ctx.root, rel);
      const lines: string[] = [];
      const walk = (dir: string, level: number) => {
        if (level > depth) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const indent = '  '.repeat(level - 1);
          lines.push(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
          if (entry.isDirectory() && level < depth) walk(path.join(dir, entry.name), level + 1);
        }
      };
      walk(abs, 1);
      return { ok: true, output: clip(lines.join('\n') || '(empty)') };
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file from the workspace. Returns numbered lines.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        start: { type: 'number', description: 'First line, 1 based' },
        lines: { type: 'number', description: 'How many lines, default 200' },
      },
      required: ['path'],
    },
    async run(args, ctx) {
      const abs = safeResolve(ctx.root, String(args.path));
      if (!fs.existsSync(abs)) return { ok: false, output: `not_found: ${args.path}` };
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) return { ok: false, output: 'is_a_directory: use list_files' };
      if (stat.size > 2_000_000) return { ok: false, output: 'file_too_large: use grep_files or read a slice' };
      const all = fs.readFileSync(abs, 'utf8').split('\n');
      const start = Math.max(Number(args.start || 1), 1);
      const count = Math.min(Number(args.lines || 200), 800);
      const slice = all.slice(start - 1, start - 1 + count);
      return {
        ok: true,
        output: clip(slice.map((l, i) => `${start + i}: ${l}`).join('\n') || '(empty file)'),
      };
    },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a file in the workspace. Provide the complete final content, not a diff.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
    dangerous: true,
    async run(args, ctx) {
      if (!ctx.approved) return { ok: false, output: 'approval_required: writing files', needsApproval: true };
      const abs = safeResolve(ctx.root, String(args.path));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, String(args.content ?? ''), 'utf8');
      return { ok: true, output: `wrote ${String(args.content ?? '').length} chars to ${args.path}` };
    },
  },
  {
    name: 'grep_files',
    description: 'Search file contents with a regular expression. Fast way to find where code lives.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex to search for' },
        include: { type: 'string', description: 'Optional file extension filter, e.g. "*.ts"' },
      },
      required: ['pattern'],
    },
    async run(args, ctx) {
      let re: RegExp;
      try {
        re = new RegExp(String(args.pattern), 'i');
      } catch (e: any) {
        return { ok: false, output: `bad_pattern: ${e.message}` };
      }
      const include = String(args.include || '').replace('*', '');
      const hits: string[] = [];
      const skip = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (hits.length >= 80) return;
          if (skip.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (include && !entry.name.endsWith(include)) continue;
          const stat = fs.statSync(full);
          if (stat.size > 1_000_000) continue;
          try {
            const text = fs.readFileSync(full, 'utf8');
            text.split('\n').forEach((line, idx) => {
              if (hits.length < 80 && re.test(line)) {
                hits.push(`${path.relative(ctx.root, full)}:${idx + 1}: ${line.trim().slice(0, 160)}`);
              }
            });
          } catch {
            /* binary file, skip */
          }
        }
      };
      walk(path.resolve(ctx.root));
      return { ok: true, output: clip(hits.join('\n') || 'no matches') };
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command inside the workspace (builds, tests, git, npm). Returns exit code and output.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Shell command to run' } },
      required: ['command'],
    },
    dangerous: true,
    async run(args, ctx) {
      if (!ctx.approved) return { ok: false, output: 'approval_required: running commands', needsApproval: true };
      const command = String(args.command || '');
      const check = inspectCommand(command);
      if (!check.allowed) return { ok: false, output: `blocked: ${check.reason}` };
      return runShell(command, path.resolve(ctx.root));
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch any URL and return readable text. Use for docs, APIs and checking a live site.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full http(s) URL' } },
      required: ['url'],
    },
    async run(args) {
      const url = String(args.url || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, output: 'invalid_url' };
      try {
        const { status, body } = await fetchText(url, {
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; HERMES-JARVIS/1.0)' },
        });
        const isJson = /json/i.test(url) || /^\s*[[{]/.test(body);
        const text = isJson ? body : htmlToText(body);
        return { ok: status < 400, output: clip(`HTTP ${status}\n${text}`) };
      } catch (e: any) {
        return { ok: false, output: `fetch_failed: ${e.message}` };
      }
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for free (DuckDuckGo). Returns titles, URLs and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        limit: { type: 'number', description: 'How many results, default 6' },
      },
      required: ['query'],
    },
    async run(args) {
      const query = String(args.query || '').trim();
      if (!query) return { ok: false, output: 'empty_query' };
      const limit = Math.min(Math.max(Number(args.limit || 6), 1), 10);
      try {
        const { body } = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          },
        });
        const results = parseDuckDuckGo(body, limit);
        if (!results.length) return { ok: false, output: 'no_results: search page had no parsable results' };
        return {
          ok: true,
          output: clip(results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n')),
        };
      } catch (e: any) {
        return { ok: false, output: `search_failed: ${e.message}` };
      }
    },
  },
  {
    name: 'git',
    description:
      'Git helper: status, diff, log, add_all, commit, push, pull. Push and pull are dangerous and need approval.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'add_all', 'commit', 'push', 'pull', 'branch'],
        },
        message: { type: 'string', description: 'Commit message when action is commit' },
      },
      required: ['action'],
    },
    async run(args, ctx) {
      const action = String(args.action || 'status');
      const dangerous = action === 'push' || action === 'pull';
      if (dangerous && !ctx.approved) {
        return { ok: false, output: `approval_required: ${action}`, needsApproval: true };
      }
      const map: Record<string, string> = {
        status: 'git status --short --branch',
        diff: 'git diff --stat',
        log: 'git log --oneline -12',
        add_all: 'git add -A',
        branch: 'git branch --show-current',
        push: 'git push',
        pull: 'git pull --ff-only',
      };
      if (action === 'commit') {
        const message = String(args.message || '').replace(/["`$]/g, '').slice(0, 200);
        if (!message) return { ok: false, output: 'commit_message_required' };
        const staged = await runShell('git add -A && git commit -m "' + message + '"', path.resolve(ctx.root));
        return staged;
      }
      const cmd = map[action];
      if (!cmd) return { ok: false, output: `unknown_action: ${action}` };
      return runShell(cmd, path.resolve(ctx.root));
    },
  },
  {
    name: 'remember',
    description: 'Save a durable fact or preference to agent memory so it survives restarts.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short label, e.g. "client pricing"' },
        value: { type: 'string', description: 'The fact to remember' },
      },
      required: ['key', 'value'],
    },
    async run(args, ctx) {
      const key = String(args.key || '').slice(0, 120);
      const value = String(args.value || '').slice(0, 4000);
      if (!key || !value) return { ok: false, output: 'key_and_value_required' };
      const entries = readMemory(ctx.root).filter((e) => e.key.toLowerCase() !== key.toLowerCase());
      entries.push({ key, value, updated: new Date().toISOString() });
      writeMemory(ctx.root, entries);
      return { ok: true, output: `remembered: ${key}` };
    },
  },
  {
    name: 'recall',
    description: 'Search saved agent memory by keyword. Call this before asking the user to repeat something.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keyword to look for, empty returns recent' } },
    },
    async run(args, ctx) {
      const query = String(args.query || '').toLowerCase();
      const entries = readMemory(ctx.root);
      const matches = query
        ? entries.filter((e) => `${e.key} ${e.value}`.toLowerCase().includes(query))
        : entries.slice(-15);
      if (!matches.length) return { ok: true, output: 'no memory entries matched' };
      return {
        ok: true,
        output: clip(matches.map((e) => `• ${e.key}: ${e.value}`).join('\n')),
      };
    },
  },
];

export const TOOL_SPECS = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));

export function findTool(name: string): AgentTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) return { ok: false, output: `unknown_tool: ${name}` };
  try {
    return await tool.run(args, ctx);
  } catch (err: any) {
    return { ok: false, output: `tool_error: ${err?.message || String(err)}` };
  }
}
