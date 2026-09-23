import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { freelanceLeadsReply } from '../utils/freelanceLeadTruth';

// Regression guard: the Telegram "View Freelance Leads" reply interpolated only
// the lead count into a pair of hardcoded rows. Any store — renamed, emptied or
// extended — produced the same two sample names and amounts.

const lead = (
  clientName: string,
  amount: number,
  status: string,
  currency = 'INR'
) => ({ clientName, status, budgetEstimate: { currency, amount } });

describe('freelanceLeadsReply renders the stored leads, not sample rows', () => {
  it('lists each stored lead with its own name, amount and status', () => {
    const reply = freelanceLeadsReply([
      lead('Aarav Tech Solutions', 65000, 'Quotation Sent'),
      lead('Global Horizon Exports', 85000, 'AI Requirements Extracted'),
    ]);
    expect(reply).toContain('ACTIVE FREELANCE LEADS (2)');
    expect(reply).toContain('Aarav Tech Solutions');
    expect(reply).toContain('65000 INR');
    expect(reply).toContain('AI Requirements Extracted');
  });

  it('does not invent a row when the store holds a different lead', () => {
    const reply = freelanceLeadsReply([lead('Nimbus Analytics', 12000, 'New')]);
    expect(reply).toContain('ACTIVE FREELANCE LEADS (1)');
    expect(reply).toContain('Nimbus Analytics');
    expect(reply).not.toContain('Aarav');
    expect(reply).not.toContain('Global Horizon');
  });

  it('states an empty pipeline plainly instead of printing sample rows', () => {
    const reply = freelanceLeadsReply([]);
    expect(reply).toContain('ACTIVE FREELANCE LEADS (0)');
    expect(reply).toContain('No freelance lead is stored');
    expect(reply).not.toContain('₹');
    expect(reply).not.toContain('Aarav');
  });

  it('escapes Telegram markdown in client-supplied names', () => {
    const reply = freelanceLeadsReply([lead('Bad*Name_Co', 100, 'New')]);
    expect(reply).toContain('Bad\\*Name\\_Co');
  });
});

describe('server view-leads reply is built from memory, not a fixed string', () => {
  it('server.ts renders the lead listing through the helper', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
    const viewLeads = server.slice(server.indexOf("data === 'cmd_view_leads'"));
    const branch = viewLeads.slice(0, viewLeads.indexOf('} else if'));
    expect(branch).toContain('freelanceLeadsReply(memoryState.freelanceLeads)');
    expect(branch).not.toContain('Aarav Tech Solutions');
    expect(branch).not.toMatch(/₹\s?65,000/);
  });
});
