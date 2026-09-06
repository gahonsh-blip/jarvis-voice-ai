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

const FINANCE_KEYWORDS = [
  'bank',
  'upi',
  'paytm',
  'gpay',
  'phonepe',
  'wire transfer',
  'credit card',
  'cvv',
  'crypto',
  'bitcoin',
  'wallet transfer',
  'send money',
  'buy btc',
  'payout',
  'पैसे भेजो',
  'खाते में',
];

export class PermissionGuard {
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
      };
    }

    const desc = `${action.description} ${action.command || ''} ${action.filePath || ''} ${action.text || ''}`.toLowerCase();

    // 2. Strict Finance Exclusions Guard (Permanently blocked from autonomous operation)
    for (const kw of FINANCE_KEYWORDS) {
      if (desc.includes(kw)) {
        return {
          allowed: false,
          requiresHumanApproval: false,
          securityLevel: 4,
          blockReason: `HERMES JARVIS Security Protocol: Financial operation involving "${kw}" is strictly prohibited from autonomous computer control.`,
          dangerCategory: 'FINANCE_RESTRICTION',
        };
      }
    }

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

    // 4. Security Bypass / CAPTCHA / Credential Theft Guard
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

    // 5. Level 4 Actions: Deleting files, sending external messages, publishing
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
   * Helper to determine if an action requires confirmation
   */
  public static isApprovalRequired(action: ComputerAction): boolean {
    const evalResult = this.evaluateAction(action, false);
    return evalResult.requiresHumanApproval;
  }
}
