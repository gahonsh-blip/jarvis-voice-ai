// ==============================================================================
// HERMES JARVIS — COMPUTER OPERATOR PERMISSION GUARD
// Enforces Level 1-4 Security Matrix, Human-in-the-Loop gates, Finance Exclusions,
// and Dangerous Operation Blocking.
// ==============================================================================

import { ComputerAction } from '../../types/computerOperator';

export interface GuardEvaluation {
  allowed: boolean;
  requiresHumanApproval: boolean;
  securityLevel: 1 | 2 | 3 | 4;
  blockReason?: string;
  dangerCategory?: string;
}

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-rf|-r|-f)\b/i,
  /\bdel\s+\/[sS]\s+\/[qQ]\b/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bdrop\s+database\b/i,
  /\btruncate\s+table\b/i,
  /\bshutdown\b/i,
  /\bchmod\s+777\b/i,
  /\bset-executionpolicy\s+unrestricted\b/i,
  /\bdisable-netfirewallrule\b/i,
  /\bstop-service\s+windefend\b/i,
];

// Finance detection lives in two lists because `\b` is an ASCII word boundary:
// it correctly protects short tokens from matching inside unrelated words, but
// it can never bound a Devanagari term. Short single tokens therefore require a
// word boundary ("jupiter" must not trip "upi"), while multi-word phrases and
// Hindi terms stay plain substring matches. This mirrors the word-boundary rule
// already enforced by `isFinanceBlocked()` in `server_tools.ts`; the two guards
// gate different paths (intent surface vs. the OS executor) and must not drift.
const FINANCE_TOKENS = [
  'bank',
  'banking',
  'upi',
  'paytm',
  'gpay',
  'phonepe',
  'cvv',
  'crypto',
  'bitcoin',
  'payout',
  'neft',
  'rtgs',
  'imps',
];

const FINANCE_PHRASES = [
  'wire transfer',
  'fund transfer',
  'transfer money',
  'transfer funds',
  'send funds',
  'move money',
  'transfer rupees',
  'credit card',
  'debit card',
  'net banking',
  'wallet transfer',
  'send money',
  'buy btc',
  'पैसे भेजो',
  'खाते में',
];

/**
 * Returns the finance signature a description matched, or `null` when the text
 * carries no financial intent.
 */
function matchFinanceSignature(desc: string): string | null {
  for (const token of FINANCE_TOKENS) {
    if (new RegExp(`\\b${token}\\b`).test(desc)) return token;
  }
  for (const phrase of FINANCE_PHRASES) {
    if (desc.includes(phrase)) return phrase;
  }
  return null;
}

export class PermissionGuard {
  /**
   * Checks the categories that are never permissible under any circumstances —
   * the emergency stop, the Level-4 finance exclusion, and security-bypass
   * attempts. Human approval cannot lift any of these, and neither the HTTP
   * layer nor a low-level executor may skip them.
   *
   * @returns the blocking evaluation, or `null` when no permanent rule fires.
   */
  public static permanentBlock(
    action: ComputerAction,
    emergencyStopActive: boolean = false
  ): GuardEvaluation | null {
    if (emergencyStopActive) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        securityLevel: action.securityLevel,
        blockReason: 'Action blocked: Global Emergency Stop is currently active.',
        dangerCategory: 'EMERGENCY_STOP',
      };
    }

    const desc = this.describe(action);

    const financeMatch = matchFinanceSignature(desc);
    if (financeMatch) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        securityLevel: 4,
        blockReason: `HERMES JARVIS Security Protocol: Financial operation involving "${financeMatch}" is strictly prohibited from autonomous computer control.`,
        dangerCategory: 'FINANCE_RESTRICTION',
      };
    }

    if (
      desc.includes('captcha') ||
      desc.includes('bypass authentication') ||
      desc.includes('steal password') ||
      desc.includes('dump credentials') ||
      desc.includes('disable antivirus')
    ) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        securityLevel: 4,
        blockReason: 'Security bypass or credential tampering attempt permanently prohibited.',
        dangerCategory: 'SECURITY_BYPASS_ATTEMPT',
      };
    }

    return null;
  }

  /** Lower-cased haystack of every free-text field an action carries. */
  private static describe(action: ComputerAction): string {
    return `${action.description} ${action.command || ''} ${action.filePath || ''} ${action.text || ''}`.toLowerCase();
  }

  /**
   * Assesses a computer action against the Level 1-4 security hierarchy
   */
  public static evaluateAction(action: ComputerAction, emergencyStopActive: boolean = false): GuardEvaluation {
    // 1. Check Global Emergency Stop
    if (emergencyStopActive) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        securityLevel: action.securityLevel,
        blockReason: 'Action blocked: Global Emergency Stop is currently active.',
        dangerCategory: 'EMERGENCY_STOP',
      };
    }

    const desc = this.describe(action);

    // 2. Permanent prohibitions (finance exclusion, security bypass).
    const permanent = this.permanentBlock(action, emergencyStopActive);
    if (permanent) return permanent;

    // 3. Destructive Command / Malicious Action Guard
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(desc)) {
        return {
          allowed: false,
          requiresHumanApproval: true,
          securityLevel: 4,
          blockReason: 'Destructive system command detected. Autonomous execution blocked.',
          dangerCategory: 'DESTRUCTIVE_SYSTEM_COMMAND',
        };
      }
    }

    // 4. Level 4 Actions: Deleting files, sending external messages, publishing
    if (
      action.securityLevel === 4 ||
      action.requiresHumanApproval ||
      desc.includes('delete') ||
      desc.includes('publish') ||
      desc.includes('broadcast') ||
      desc.includes('push --force') ||
      desc.includes('email')
    ) {
      return {
        allowed: false, // Must be explicitly approved by human
        requiresHumanApproval: true,
        securityLevel: 4,
        blockReason: 'Level 4 authorization required. Waiting for explicit human consent ("YES / APPROVE").',
        dangerCategory: 'LEVEL_4_HUMAN_GATE',
      };
    }

    // 6. Level 3 Actions: Surgical edits to local workspace files, running builds/tests
    if (action.type === 'EDIT_FILE' || action.type === 'RUN_TESTS' || action.securityLevel === 3) {
      return {
        allowed: true,
        requiresHumanApproval: false,
        securityLevel: 3,
      };
    }

    // 7. Level 1 & 2: Read, inspect, move mouse, plan, navigate
    return {
      allowed: true,
      requiresHumanApproval: false,
      securityLevel: action.securityLevel || 1,
    };
  }

  /**
   * Safety-only re-check intended for the executors that actually touch the OS.
   *
   * `evaluateAction` also carries the Level-4 human gate, which a low-level
   * executor must not re-apply: the only legitimate way to run a gated action is
   * after `resumeApprovedTask` resolves the pending approval. This method
   * returns just the permanently prohibited categories plus the emergency stop,
   * so the decision cannot be skipped by a dispatch path that forgot to call
   * `evaluateAction` at all.
   *
   * @returns the blocking evaluation, or `null` when the action is not
   *          prohibited outright by a safety rule.
   */
  public static evaluateHostSafety(
    action: ComputerAction,
    emergencyStopActive: boolean = false
  ): GuardEvaluation | null {
    const permanent = this.permanentBlock(action, emergencyStopActive);
    if (permanent) return permanent;

    const desc = this.describe(action);
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(desc)) {
        return {
          allowed: false,
          requiresHumanApproval: true,
          securityLevel: 4,
          blockReason: 'Destructive system command detected. Autonomous execution blocked.',
          dangerCategory: 'DESTRUCTIVE_SYSTEM_COMMAND',
        };
      }
    }

    return null;
  }

  /**
   * Helper to determine if an action requires confirmation
   */
  public static isApprovalRequired(action: ComputerAction): boolean {
    const evalResult = this.evaluateAction(action, false);
    return evalResult.requiresHumanApproval;
  }
}
