// ==============================================================================
// HERMES JARVIS — PERMISSION MATRIX (backlog items 44, 52)
//
// A single place that answers "may this action run, and who must approve it?".
// The gateway, the autonomous runner, and the social/communication modules all
// consult this rather than each carrying their own rules, which is how gaps
// appear: one module allows an action another would have blocked.
//
// An unknown action is treated as the most restricted category. Defaulting an
// unrecognised action to "safe" is how an unanticipated capability becomes an
// unapproved one.
// ==============================================================================

export type RiskLevel = 1 | 2 | 3 | 4;

export interface PermissionDecision {
  allowed: boolean;
  /** The lowest security level that permits the action. */
  requiredLevel: RiskLevel;
  /** True when a named human must approve before execution. */
  requiresApproval: boolean;
  category: string;
  reason: string;
}

export interface PermissionEntry {
  category: string;
  /** Keywords that select this entry from a command string. */
  keywords: string[];
  requiredLevel: RiskLevel;
  requiresApproval: boolean;
}

/**
 * Ordered most-restricted-first. The first matching entry wins, so a command
 * containing both "read" and "delete" is classified as a delete.
 */
export const PERMISSION_MATRIX: PermissionEntry[] = [
  {
    category: 'destructive',
    keywords: [
      'delete', 'remove', 'uninstall', 'format', 'wipe', 'overwrite', 'shutdown',
      'shut down', 'reboot', 'restart', 'kill process', 'drop table', 'rm -rf',
      'मिटा', 'हटा', 'बंद कर',
    ],
    requiredLevel: 4,
    requiresApproval: true,
  },
  {
    category: 'financial',
    keywords: ['pay', 'payment', 'transfer', 'invoice payment', 'purchase', 'buy', 'refund', 'भुगतान'],
    requiredLevel: 4,
    requiresApproval: true,
  },
  {
    category: 'credentials',
    keywords: ['password', 'api key', 'apikey', 'token', 'credential', 'secret', 'oauth', 'login as'],
    requiredLevel: 4,
    requiresApproval: true,
  },
  {
    category: 'external_publish',
    keywords: ['post', 'publish', 'tweet', 'upload', 'share publicly', 'deploy', 'release'],
    requiredLevel: 4,
    requiresApproval: true,
  },
  {
    category: 'communication',
    keywords: ['send', 'message', 'email', 'sms', 'whatsapp', 'reply', 'call', 'dial', 'भेज', 'कॉल'],
    requiredLevel: 4,
    requiresApproval: true,
  },
  {
    category: 'repo_write',
    keywords: ['push', 'commit', 'merge', 'pull request', 'create branch', 'revert', 'force push'],
    requiredLevel: 3,
    requiresApproval: true,
  },
  {
    category: 'system_write',
    keywords: ['write file', 'create file', 'mkdir', 'move file', 'rename', 'install', 'append', 'save file'],
    requiredLevel: 3,
    requiresApproval: false,
  },
  {
    category: 'external_read',
    keywords: ['search web', 'browse', 'fetch url', 'download', 'screenshot', 'capture'],
    requiredLevel: 2,
    requiresApproval: false,
  },
  {
    category: 'read_only',
    keywords: ['read', 'status', 'check', 'list', 'show', 'tell', 'summar', 'diagnos', 'report', 'battery', 'weather'],
    requiredLevel: 1,
    requiresApproval: false,
  },
];

/** Unknown actions fall here: no capability, maximum scrutiny. */
export const UNKNOWN_ACTION_DECISION: Omit<PermissionDecision, 'reason'> = {
  allowed: false,
  requiredLevel: 4,
  requiresApproval: true,
  category: 'unknown',
};

function normalise(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:।"'“”]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Classifies a command into a matrix category, most-restricted match first. */
export function classifyAction(command: string): PermissionEntry | null {
  const cleaned = normalise(command);
  if (!cleaned) return null;

  for (const entry of PERMISSION_MATRIX) {
    if (entry.keywords.some((k) => cleaned.includes(k))) return entry;
  }
  return null;
}

/**
 * Decides whether an action may run at the current security level.
 *
 * `approvedBy` must be a real operator name. An empty or placeholder approver
 * is not a human decision.
 */
export function evaluatePermission(
  command: string,
  currentLevel: RiskLevel,
  approvedBy?: string,
): PermissionDecision {
  const entry = classifyAction(command);

  if (!entry) {
    return {
      ...UNKNOWN_ACTION_DECISION,
      reason:
        'Action is not recognised by the permission matrix, so it is refused. Add it to the matrix to allow it.',
    };
  }

  if (currentLevel < entry.requiredLevel) {
    return {
      allowed: false,
      requiredLevel: entry.requiredLevel,
      requiresApproval: entry.requiresApproval,
      category: entry.category,
      reason: `Requires security level ${entry.requiredLevel}; current level is ${currentLevel}.`,
    };
  }

  if (entry.requiresApproval) {
    const approver = (approvedBy || '').trim();
    const placeholder = ['', 'system', 'auto', 'anonymous', 'unknown'].includes(approver.toLowerCase());
    if (placeholder) {
      return {
        allowed: false,
        requiredLevel: entry.requiredLevel,
        requiresApproval: true,
        category: entry.category,
        reason: 'Requires named human approval, which was not provided.',
      };
    }
  }

  return {
    allowed: true,
    requiredLevel: entry.requiredLevel,
    requiresApproval: entry.requiresApproval,
    category: entry.category,
    reason: `Permitted at level ${currentLevel}${entry.requiresApproval ? `, approved by ${approvedBy}` : ''}.`,
  };
}

/** True when the kill switch is engaged. Nothing autonomous may run. */
export function isBlockedByKillSwitch(emergencyPaused: boolean): boolean {
  return emergencyPaused === true;
}