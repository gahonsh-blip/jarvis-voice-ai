/**
 * Consent + lock-screen gate.
 *
 * Every action that can touch the real world (send a message, place a call,
 * delete or overwrite a file, spend money, change a password) must pass
 * through here first. The pattern is deliberately boring:
 *
 *   ask  ->  the user reads exactly what will happen
 *   unlock -> the user types their local passcode (the "screen lock")
 *   act  ->  only then does the tool run, and the decision is logged
 *
 * The passcode never leaves the device: only a SHA-256 hash is stored.
 */

export type RiskAction =
  | 'file:write'
  | 'file:delete'
  | 'message:send'
  | 'call:place'
  | 'account:change'
  | 'payment:spend'
  | 'system:exec';

export interface ConsentRequest {
  action: RiskAction;
  title: string;
  detail: string;
  irreversible?: boolean;
}

const HASH_KEY = 'jarvis.passcode.hash';
const UNLOCK_TTL_MS = 10 * 60 * 1000; // one unlock per 10 minutes
let unlockedUntil = 0;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hasPasscode(): boolean {
  return Boolean(localStorage.getItem(HASH_KEY));
}

export async function setPasscode(passcode: string): Promise<void> {
  if (passcode.trim().length < 4) throw new Error('Use at least 4 characters.');
  localStorage.setItem(HASH_KEY, await sha256(passcode.trim()));
  unlockedUntil = Date.now() + UNLOCK_TTL_MS;
}

export function clearPasscode(): void {
  localStorage.removeItem(HASH_KEY);
  unlockedUntil = 0;
}

export function isUnlocked(): boolean {
  return Date.now() < unlockedUntil;
}

export async function unlock(passcode: string): Promise<boolean> {
  const stored = localStorage.getItem(HASH_KEY);
  if (!stored) return false;
  const ok = (await sha256(passcode.trim())) === stored;
  if (ok) unlockedUntil = Date.now() + UNLOCK_TTL_MS;
  return ok;
}

export function lock(): void {
  unlockedUntil = 0;
}

/** Human-readable description shown inside the consent card. */
export function describe(req: ConsentRequest): string {
  const label: Record<RiskAction, string> = {
    'file:write': 'Create or edit a file',
    'file:delete': 'Delete a file',
    'message:send': 'Send a message',
    'call:place': 'Place a phone call',
    'account:change': 'Change an account, password or login',
    'payment:spend': 'Spend money',
    'system:exec': 'Run a system command',
  };
  return `${label[req.action]}${req.irreversible ? ' (this cannot be undone)' : ''}`;
}

export interface ConsentLogEntry extends ConsentRequest {
  at: string;
  granted: boolean;
}

const LOG_KEY = 'jarvis.consent.log';

export function logConsent(entry: ConsentLogEntry): void {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const list: ConsentLogEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* logging must never break the action */
  }
}

export function readConsentLog(): ConsentLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as ConsentLogEntry[]) : [];
  } catch {
    return [];
  }
}
