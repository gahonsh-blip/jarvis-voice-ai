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
  budgetEstimate: { currency: string; amount: number };
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
        `${index + 1}. *${escapeMarkdown(lead.clientName)}* — ${lead.budgetEstimate.amount} ${escapeMarkdown(
          lead.budgetEstimate.currency
        )} (${escapeMarkdown(lead.status)})`
    )
    .join('\n');
  return `${header}\n\n${rows}`;
}
