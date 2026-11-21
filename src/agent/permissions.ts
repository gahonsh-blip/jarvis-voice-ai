/**
 * Permissions — the app-style consent layer.
 *
 * Other apps ask once for the folder, the mic, the call log. Jarvis does the
 * same: every tool belongs to a capability, a capability is asked for the first
 * time it is needed, and the answer is stored so the owner is never asked twice
 * for the same thing. Nothing here can be bypassed by a prompt: the check runs
 * inside executeTool, before the tool's own code.
 *
 * State lives in one JSON file so it survives restarts and works offline:
 *   ${AGENT_STATE_DIR:-~/.jarvis}/permissions.json
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export type Capability =
  | 'files.read'
  | 'files.write'
  | 'shell'
  | 'network'
  | 'memory'
  | 'messages'
  | 'calls'
  | 'publish'
  | 'payments'
  | 'platform';

export interface CapabilityInfo {
  id: Capability;
  label: string;
  /** What the owner is actually allowing, in plain words. */
  asks: string;
  risk: 'low' | 'medium' | 'high';
  /** Granted on a fresh install, because the agent cannot even answer without it. */
  defaultGranted: boolean;
}

export const CAPABILITIES: CapabilityInfo[] = [
  { id: 'files.read', label: 'Read files', asks: 'Read files inside the workspace', risk: 'low', defaultGranted: true },
  { id: 'memory', label: 'Remember things', asks: 'Keep notes and memories between tasks', risk: 'low', defaultGranted: true },
  { id: 'files.write', label: 'Write files', asks: 'Create or change files in the workspace', risk: 'medium', defaultGranted: false },
  { id: 'shell', label: 'Run commands', asks: 'Run shell commands and skills on this device', risk: 'high', defaultGranted: false },
  { id: 'network', label: 'Use the internet', asks: 'Search the web, open pages and call APIs', risk: 'medium', defaultGranted: false },
  { id: 'messages', label: 'Send messages', asks: 'Send email, WhatsApp or chat messages as you', risk: 'high', defaultGranted: false },
  { id: 'calls', label: 'Make calls', asks: 'Place or answer phone calls', risk: 'high', defaultGranted: false },
  { id: 'publish', label: 'Publish', asks: 'Post, deploy or change a live app or site', risk: 'high', defaultGranted: false },
  { id: 'payments', label: 'Payments', asks: 'Start a checkout or spend money', risk: 'high', defaultGranted: false },
  { id: 'platform', label: 'Platform tools', asks: 'Use the Base44 platform tools (database, workflows, apps)', risk: 'medium', defaultGranted: false },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function capabilityInfo(id: Capability): CapabilityInfo | undefined {
  return BY_ID.get(id);
}

/** Offline mode: the agent must still work with no key and no internet. */
export function offlineMode(): boolean {
  return String(process.env.AGENT_OFFLINE || '') === '1';
}

/**
 * Which capability a tool needs. Longest prefix wins so `send_message_to_builder`
 * is not mistaken for `send_image`.
 */
const TOOL_CAPABILITY: Array<[RegExp, Capability]> = [
  [/^browser_confirm_payment$|^suggest_payments_installation$/, 'payments'],
  [/^send_message_to_builder$|^deploy_backend_function$|^delete_backend_function$|^manage_workflow$|^create_or_update_workflow$/, 'publish'],
  [/^send_image$|^send_whatsapp_voice_message$|^create_whatsapp_group$|^manage_imessage_connections$|^invite_friend$/, 'messages'],
  [/^make_phone_call$|^manage_phone$|^show_channel_connection_options$|^list_whatsapp_groups$/, 'calls'],
  [/^browserbase_|^browser_/, 'network'],
  [/^web_search$|^fetch_url$|^read_web_page$|^http_request$/, 'network'],
  [/^read_file$|^grep$|^grep_files$|^list_files$|^json_get$|^hash_text$|^time_now$/, 'files.read'],
  [/^write_file$|^upload_file$|^upload_private_file$|^create_file_signed_url$|^artifacts$/, 'files.write'],
  [/^bash$|^run_command$|^run_skill$|^git$/, 'shell'],
  [/^save_memory$|^forget_memory$|^update_identity$|^memory_set$|^memory_get$|^remember$|^recall$|^search_previous_messages$|^list_sessions$|^read_session_log$|^search_sessions$/, 'memory'],
];

/**
 * Tools that only format text for the owner. They touch no file, no network and
 * no account, so asking for a permission would be noise.
 */
const FREE_TOOLS = new Set(['ask_clarifying_questions']);

export function capabilityForTool(toolName: string): Capability {
  for (const [re, cap] of TOOL_CAPABILITY) if (re.test(toolName)) return cap;
  return 'platform';
}

/* ----------------------------- stored state ----------------------------- */

export interface PermissionState {
  version: 1;
  grants: Record<string, { granted: boolean; at: string; note?: string }>;
  pending: Array<{ capability: Capability; tool: string; at: string; reason: string }>;
}

function stateDir(): string {
  return process.env.AGENT_STATE_DIR || path.join(os.homedir(), '.jarvis');
}

function stateFile(): string {
  return path.join(stateDir(), 'permissions.json');
}

function blank(): PermissionState {
  const grants: PermissionState['grants'] = {};
  for (const c of CAPABILITIES) {
    if (c.defaultGranted) grants[c.id] = { granted: true, at: new Date().toISOString(), note: 'default' };
  }
  return { version: 1, grants, pending: [] };
}

export function loadState(): PermissionState {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.grants !== 'object') return blank();
    return {
      version: 1,
      grants: parsed.grants,
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    };
  } catch {
    return blank();
  }
}

function saveState(state: PermissionState): boolean {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- the API -------------------------------- */

export function isGranted(capability: Capability, state = loadState()): boolean {
  return state.grants[capability]?.granted === true;
}

export function grant(capability: Capability, note = 'owner approved'): { ok: boolean; state?: PermissionState; error?: string } {
  if (!BY_ID.has(capability)) return { ok: false, error: `unknown_capability: ${capability}` };
  const state = loadState();
  state.grants[capability] = { granted: true, at: new Date().toISOString(), note };
  state.pending = state.pending.filter((p) => p.capability !== capability);
  if (!saveState(state)) return { ok: false, error: 'could_not_write_permissions_file' };
  return { ok: true, state };
}

export function revoke(capability: Capability): { ok: boolean; state?: PermissionState; error?: string } {
  if (!BY_ID.has(capability)) return { ok: false, error: `unknown_capability: ${capability}` };
  const state = loadState();
  state.grants[capability] = { granted: false, at: new Date().toISOString(), note: 'revoked by owner' };
  if (!saveState(state)) return { ok: false, error: 'could_not_write_permissions_file' };
  return { ok: true, state };
}

export function listPermissions(): Array<CapabilityInfo & { granted: boolean; at?: string }> {
  const state = loadState();
  return CAPABILITIES.map((c) => ({
    ...c,
    granted: state.grants[c.id]?.granted === true,
    at: state.grants[c.id]?.at,
  }));
}

/**
 * The question the owner sees before a new capability is used, phrased the way
 * a phone OS phrases it: what is being asked, by which tool, and why.
 */
export function permissionQuestion(capability: Capability, toolName: string): string {
  const info = BY_ID.get(capability);
  const asks = info?.asks || capability;
  return `permission_required: ${asks} (tool: ${toolName}). Allow? Reply "allow ${capability}" or POST /permissions/grant.`;
}

/** Gate one tool call. Returns null when the call may proceed. */
export function checkPermission(toolName: string): { ok: true } | { ok: false; output: string } {
  if (FREE_TOOLS.has(toolName)) return { ok: true };
  const capability = capabilityForTool(toolName);

  if (offlineMode() && (capability === 'network' || capability === 'platform' || capability === 'calls' || capability === 'messages' || capability === 'publish')) {
    return {
      ok: false,
      output: `offline_mode: ${toolName} needs the internet and AGENT_OFFLINE=1 is set. Local tools (files, shell, memory) still work.`,
    };
  }

  const state = loadState();
  if (isGranted(capability, state)) return { ok: true };

  // Remember the ask once, so the owner has a queue to approve instead of a
  // prompt that scrolls away.
  if (!state.pending.some((p) => p.capability === capability && p.tool === toolName)) {
    state.pending.push({
      capability,
      tool: toolName,
      at: new Date().toISOString(),
      reason: BY_ID.get(capability)?.asks || capability,
    });
    saveState(state);
  }
  return { ok: false, output: permissionQuestion(capability, toolName) };
}

export function pendingRequests(): PermissionState['pending'] {
  return loadState().pending;
}
