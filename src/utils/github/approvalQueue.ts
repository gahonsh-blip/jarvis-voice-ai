// ==============================================================================
// HERMES JARVIS — HUMAN APPROVAL QUEUE (backlog items 20, 44)
//
// A pending-approval registry for actions that must not proceed autonomously.
//
// Requests expire rather than waiting forever, and an expired request resolves
// as denied. Nothing in this module can approve itself: a decision must arrive
// from an explicit human path (HUD, Telegram confirmation) carrying a name.
// ==============================================================================

export type ApprovalState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface PendingApproval {
  id: string;
  createdAt: string;
  expiresAt: string;
  actionId: string;
  summary: string;
  summaryHi: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  files: string[];
  targetBranch: string;
  state: ApprovalState;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface ApprovalQueueOptions {
  /** How long a request stays open. Defaults to 15 minutes. */
  ttlMs?: number;
  now?: () => Date;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export class ApprovalQueue {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly waiters = new Map<
    string,
    (decision: { approved: boolean; approvedBy: string; reason?: string }) => void
  >();
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private counter = 0;

  constructor(options: ApprovalQueueOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Registers a request and resolves when a human decides, or when it expires.
   * An expired request resolves as denied — never as an implicit yes.
   */
  request(input: {
    actionId: string;
    summary: string;
    summaryHi: string;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    files: string[];
    targetBranch: string;
  }): { approval: PendingApproval; decision: Promise<{ approved: boolean; approvedBy: string; reason?: string }> } {
    const createdAt = this.now();
    const id = `apr-${createdAt.getTime()}-${++this.counter}`;
    const approval: PendingApproval = {
      id,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlMs).toISOString(),
      ...input,
      state: 'PENDING',
    };
    this.pending.set(id, approval);

    const decision = new Promise<{ approved: boolean; approvedBy: string; reason?: string }>(
      (resolve) => {
        const timer = setTimeout(() => {
          const current = this.pending.get(id);
          if (!current || current.state !== 'PENDING') return;
          current.state = 'EXPIRED';
          current.decidedAt = this.now().toISOString();
          current.reason = `No decision arrived within ${Math.round(this.ttlMs / 1000)}s, so the request expired and was treated as denied.`;
          this.waiters.delete(id);
          resolve({ approved: false, approvedBy: 'NONE', reason: current.reason });
        }, this.ttlMs);
        // Do not hold the process open for an approval that may never arrive.
        if (typeof timer.unref === 'function') timer.unref();

        this.waiters.set(id, (d) => {
          clearTimeout(timer);
          this.waiters.delete(id);
          resolve(d);
        });
      }
    );

    return { approval, decision };
  }

  /** Records a human decision. Returns the updated record, or null if unknown. */
  decide(
    id: string,
    approved: boolean,
    decidedBy: string,
    reason?: string
  ): PendingApproval | null {
    const approval = this.pending.get(id);
    if (!approval) return null;
    if (approval.state !== 'PENDING') return approval;

    approval.state = approved ? 'APPROVED' : 'REJECTED';
    approval.decidedAt = this.now().toISOString();
    approval.decidedBy = decidedBy;
    approval.reason = reason;

    this.waiters.get(id)?.({ approved, approvedBy: decidedBy, reason });
    return approval;
  }

  get(id: string): PendingApproval | null {
    return this.pending.get(id) ?? null;
  }

  list(): PendingApproval[] {
    return Array.from(this.pending.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  listPending(): PendingApproval[] {
    return this.list().filter((a) => a.state === 'PENDING');
  }

  /** Drops old settled records so the queue does not grow without bound. */
  prune(maxRecords = 100): void {
    const settled = this.list().filter((a) => a.state !== 'PENDING');
    for (const rec of settled.slice(maxRecords)) {
      this.pending.delete(rec.id);
    }
  }
}

// ==============================================================================
// Backlog item 13: "Zero-fake-success for all tools".
//
// `POST /api/github/approvals/:id/decision` answered `{ success: true, approval }`
// for every id that existed, even one that was already settled (APPROVED,
// REJECTED or EXPIRED). A late or duplicate click therefore re-reported a success
// this request did not produce, and the audit log was written as though a human
// had just decided. `decide` changes state only on a PENDING request, so the
// route must claim success only when the state actually moved.
// ==============================================================================

export type ApprovalDecisionOutcome = 'DECIDED' | 'ALREADY_SETTLED' | 'NOT_FOUND';

export interface ApprovalDecisionVerdict {
  success: boolean;
  recorded: boolean;
  outcome: ApprovalDecisionOutcome;
  message: string;
}

/**
 * Derives the honest reply for an approval decision from the approval's state
 * before and after the attempt. Success is claimed only when a PENDING request
 * transitioned; an unknown id or an already-settled request is a no-op.
 */
export function classifyApprovalDecision(
  before: ApprovalState | null,
  after: ApprovalState | null
): ApprovalDecisionVerdict {
  if (before === null || after === null) {
    return {
      success: false,
      recorded: false,
      outcome: 'NOT_FOUND',
      message: 'No such approval request.',
    };
  }

  if (before !== 'PENDING') {
    return {
      success: false,
      recorded: false,
      outcome: 'ALREADY_SETTLED',
      message: `Approval was already ${before.toLowerCase()}; this decision did not change it.`,
    };
  }

  return {
    success: true,
    recorded: true,
    outcome: 'DECIDED',
    message: `Approval ${after.toLowerCase()}.`,
  };
}