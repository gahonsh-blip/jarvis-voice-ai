// ==============================================================================
// HERMES JARVIS — FREELANCE LEAD LISTING, STATED FROM REAL RECORDS
//
// The Telegram "View Freelance Leads" button replied with two fixed rows —
// "Aarav Tech Solutions — ₹65,000 (Quotation Sent)" and "Global Horizon
// Exports — ₹85,000 (AI Requirements Extracted)" — interpolating only the
// count. Those names and amounts were start-up sample data: a renamed, deleted
// or newly added lead still produced the same two lines, so the message
// described records that need not exist and hid records that did.
//
// This module renders the listing from the leads actually held in memory. It
// makes no claim about a lead the store does not contain, and states plainly
// when the pipeline is empty instead of inventing a first row.
// ==============================================================================

/** The subset of a stored lead the listing needs. */
export interface LeadListingRecord {
  clientName: string;
  status: string;
  budgetEstimate: { currency: string; amount: number | null };
}

/** Telegram Markdown reserves these; a client-supplied name must not break the
 * message structure by injecting an asterisk or underscore. */
const escapeMarkdown = (value: string): string => value.replace(/([*_`[\]])/g, '\\$1');

/**
 * Build the "Active Freelance Leads" reply from the stored records.
 *
 * `leads` is read verbatim: an empty store yields an explicit empty-pipeline
 * line, never a fabricated row.
 */
export function freelanceLeadsReply(leads: readonly LeadListingRecord[]): string {
  const header = `💼 *ACTIVE FREELANCE LEADS (${leads.length})*`;
  if (leads.length === 0) {
    return `${header}\n\nNo freelance lead is stored in the pipeline. I did not find one to report.`;
  }
  const rows = leads
    .map(
      (lead, index) =>
        `${index + 1}. *${escapeMarkdown(lead.clientName)}* — ${escapeMarkdown(
          formatLeadBudget(lead.budgetEstimate.amount)
        )} ${escapeMarkdown(lead.budgetEstimate.currency)} (${escapeMarkdown(lead.status)})`
    )
    .join('\n');
  return `${header}\n\n${rows}`;
}

// ==============================================================================
// NEW-LEAD INTAKE — NO INVENTED IDENTITY OR BUDGET
//
// `POST /api/freelance/create-lead` filled every field an operator omitted with
// a plausible-looking constant: a ₹50,000 budget, "Telegram AI Bot",
// "Full-Stack Web App", "New Client Inquiry". It then auto-generated a
// three-milestone quotation priced against that fabricated ₹50,000, so a lead
// created without an amount was presented with a real-looking ₹5,000 +
// ₹22,500 + ₹10,000 breakdown derived from a number nobody entered. The status
// was set to "AI Requirements Extracted" before any AI had run.
//
// This builder keeps only the values actually supplied. A missing amount is a
// missing amount, not ₹50,000, and a missing client name is stated as such
// rather than replaced with a placeholder that looks like a real client.
// ==============================================================================

/** A stored lead. Kept structurally compatible with the server's `ServerFreelanceLead`. */
export interface NewLeadRecord {
  id: string;
  clientName: string;
  source: string;
  projectType: string;
  rawRequirement: string;
  budgetEstimate: { currency: string; amount: number | null };
  status: string;
  createdAt: string;
  quotation?: {
    scopeSummary: string;
    timelineDays: number;
    totalPrice: number;
    milestones: { title: string; price: number; days: number }[];
  };
}

export interface NewLeadInput {
  id: string;
  clientName?: unknown;
  source?: unknown;
  projectType?: unknown;
  rawRequirement?: unknown;
  budget?: unknown;
  createdAt: string;
}

/** Shown in place of a name the operator never gave. Not a client name. */
export const CLIENT_NAME_NOT_RECORDED = 'Client name not recorded';

/** Shown in place of a requirement the operator never gave. Not a requirement. */
export const REQUIREMENT_NOT_RECORDED = 'No requirement was recorded with this lead.';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * A budget is recorded only when the operator supplied a finite, positive
 * number. Anything else — omitted, blank, zero, negative, or non-numeric —
 * leaves the amount unrecorded rather than defaulting to a plausible figure.
 */
export function recordedBudgetAmount(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

const MILESTONE_SPLIT = [
  { title: 'Phase 1: Architecture & UI Prototype', weight: 0.35, days: 4 },
  { title: 'Phase 2: Core Engineering & Backend APIs', weight: 0.45, days: 5 },
  { title: 'Phase 3: QA Testing, Deployment & Handover', weight: 0.2, days: 3 },
] as const;

/**
 * Build the stored lead from the intake payload. No field is invented:
 *   - client name falls back to an explicit "not recorded" label,
 *   - project type falls back to an explicit "not specified" label,
 *   - source falls back to the honest intake channel,
 *   - the requirement falls back to an explicit "not recorded" sentence,
 *   - the budget is recorded only if one was really entered.
 * A quotation is attached only when a budget exists, because a milestone
 * breakdown cannot be priced without a real total.
 */
export function buildNewLeadRecord(input: NewLeadInput): NewLeadRecord {
  const amount = recordedBudgetAmount(input.budget);
  const projectType = text(input.projectType);
  const record: NewLeadRecord = {
    id: input.id,
    clientName: text(input.clientName) || CLIENT_NAME_NOT_RECORDED,
    source: text(input.source) || 'Web intake form',
    projectType: projectType || 'Project type not specified',
    rawRequirement: text(input.rawRequirement) || REQUIREMENT_NOT_RECORDED,
    budgetEstimate: { currency: 'INR', amount },
    // No AI has run at intake time; the lead was only entered.
    status: 'Lead Entered',
    createdAt: input.createdAt,
  };

  if (amount !== null) {
    record.quotation = {
      scopeSummary: `Turnkey implementation for ${record.projectType}`,
      timelineDays: MILESTONE_SPLIT.reduce((total, m) => total + m.days, 0),
      totalPrice: amount,
      milestones: MILESTONE_SPLIT.map((m) => ({
        title: m.title,
        price: Math.round(amount * m.weight),
        days: m.days,
      })),
    };
  }

  return record;
}

/** Renders a budget for display, stating plainly when none is on record. */
export function formatLeadBudget(amount: number | null | undefined): string {
  return typeof amount === 'number' && Number.isFinite(amount)
    ? `₹${amount.toLocaleString('en-IN')}`
    : 'Budget not recorded';
}

// ==============================================================================
// NEW-LEAD INTAKE — THE ROUTE MUST NOT REPORT A STORED LEAD IT DID NOT STORE
//
// `POST /api/freelance/create-lead` built a record from the payload and
// answered `{ success: true, lead }` unconditionally. A submission that carried
// nothing but an auto-generated id — no client name, no requirement, no budget —
// was still announced as a created lead, and the operator's "Add Client
// Inquiry" form closed as though a client had been entered. The record holds
// only "not recorded" placeholders in that case, so the reply described a lead
// the operator never supplied.
//
// This classifier decides whether the payload carried anything a lead can be
// built from. Any real field is enough; a body that supplied only an id (or
// nothing) is refused, and the route answers honestly instead of reporting a
// stored lead.
// ==============================================================================

export type NewLeadIntakeVerdict =
  | { accepted: true; hasClientIdentity: boolean; message: string }
  | { accepted: false; reason: 'NO_FIELDS'; message: string };

/**
 * Decide whether a create-lead payload carried any real lead field.
 *
 * A lead is accepted when at least one of clientName / projectType /
 * rawRequirement / budget was really supplied. `hasClientIdentity` is false
 * when no client name was given, so the caller can say the lead is stored
 * without an identified client rather than presenting a placeholder as a name.
 */
export function classifyNewLeadIntake(input: {
  clientName?: unknown;
  projectType?: unknown;
  rawRequirement?: unknown;
  budget?: unknown;
}): NewLeadIntakeVerdict {
  const hasClientIdentity = text(input.clientName) !== null;
  const hasProjectType = text(input.projectType) !== null;
  const hasRequirement = text(input.rawRequirement) !== null;
  const hasBudget = recordedBudgetAmount(input.budget) !== null;

  if (!hasClientIdentity && !hasProjectType && !hasRequirement && !hasBudget) {
    return {
      accepted: false,
      reason: 'NO_FIELDS',
      message:
        'No client name, project type, requirement or budget was supplied; no lead was stored.',
    };
  }

  return {
    accepted: true,
    hasClientIdentity,
    message: hasClientIdentity
      ? 'Lead stored.'
      : 'Lead stored without a client name; the client was not identified in the request.',
  };
}
