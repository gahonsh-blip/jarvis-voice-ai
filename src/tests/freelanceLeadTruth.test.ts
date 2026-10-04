import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  freelanceLeadsReply,
  buildNewLeadRecord,
  recordedBudgetAmount,
  formatLeadBudget,
  classifyNewLeadIntake,
  CLIENT_NAME_NOT_RECORDED,
  REQUIREMENT_NOT_RECORDED,
} from '../utils/freelanceLeadTruth';

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
    expect(reply).toContain('₹65,000 INR');
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

// Regression guard for the create-lead intake: every omitted field used to be
// filled with a plausible constant (₹50,000, "Telegram AI Bot", "Full-Stack Web
// App", "New Client Inquiry") and a three-milestone quotation was priced against
// that invented ₹50,000. A lead created without an amount must not present one.

const NEW_LEAD_BASE = {
  id: 'lead-test',
  createdAt: '2026-10-04T00:00:00.000Z',
};

describe('recordedBudgetAmount records only a real, positive amount', () => {
  it('accepts a positive number and a numeric string', () => {
    expect(recordedBudgetAmount(65000)).toBe(65000);
    expect(recordedBudgetAmount('65000')).toBe(65000);
    expect(recordedBudgetAmount(1234.6)).toBe(1235);
  });

  it('leaves omitted, blank, zero, negative and non-numeric amounts unrecorded', () => {
    expect(recordedBudgetAmount(undefined)).toBeNull();
    expect(recordedBudgetAmount(null)).toBeNull();
    expect(recordedBudgetAmount('')).toBeNull();
    expect(recordedBudgetAmount('   ')).toBeNull();
    expect(recordedBudgetAmount(0)).toBeNull();
    expect(recordedBudgetAmount(-5000)).toBeNull();
    expect(recordedBudgetAmount('not a number')).toBeNull();
    expect(recordedBudgetAmount(NaN)).toBeNull();
    expect(recordedBudgetAmount(Infinity)).toBeNull();
  });
});

describe('buildNewLeadRecord never invents a client, requirement or budget', () => {
  it('records a lead created with no budget as having no budget and no quotation', () => {
    const record = buildNewLeadRecord({
      ...NEW_LEAD_BASE,
      clientName: 'Nimbus Analytics',
      projectType: 'AI Integration',
      rawRequirement: 'Need a reporting dashboard.',
      // budget deliberately omitted
    });
    expect(record.budgetEstimate.amount).toBeNull();
    expect(record.quotation).toBeUndefined();
    expect(record.status).toBe('Lead Entered');
  });

  it('does not substitute ₹50,000 or a sample client name for missing fields', () => {
    const record = buildNewLeadRecord({ ...NEW_LEAD_BASE });
    expect(record.budgetEstimate.amount).toBeNull();
    expect(record.clientName).toBe(CLIENT_NAME_NOT_RECORDED);
    expect(record.rawRequirement).toBe(REQUIREMENT_NOT_RECORDED);
    expect(record.clientName).not.toBe('New Client Inquiry');
    expect(record.quotation).toBeUndefined();
  });

  it('prices the milestone quotation against the amount actually supplied', () => {
    const record = buildNewLeadRecord({
      ...NEW_LEAD_BASE,
      clientName: 'Real Client',
      budget: 40000,
    });
    expect(record.quotation).toBeDefined();
    expect(record.quotation!.totalPrice).toBe(40000);
    expect(record.quotation!.milestones.reduce((sum, m) => sum + m.price, 0)).toBe(40000);
    expect(record.quotation!.milestones[0].price).toBe(14000);
  });

  it('labels a lead entered without AI as "Lead Entered", not "AI Requirements Extracted"', () => {
    const record = buildNewLeadRecord({ ...NEW_LEAD_BASE, budget: 1000 });
    expect(record.status).toBe('Lead Entered');
    expect(record.status).not.toBe('AI Requirements Extracted');
  });
});

describe('formatLeadBudget states plainly when no amount is on record', () => {
  it('renders a recorded amount', () => {
    expect(formatLeadBudget(65000)).toContain('65,000');
  });
  it('does not print ₹0 or blank for an unrecorded amount', () => {
    expect(formatLeadBudget(null)).toBe('Budget not recorded');
    expect(formatLeadBudget(undefined)).toBe('Budget not recorded');
  });
});

describe('server create-lead route stores only supplied values', () => {
  it('no longer defaults the budget to ₹50,000', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
    const route = server.slice(server.indexOf("'/api/freelance/create-lead'"));
    const body = route.slice(0, route.indexOf('update-status'));
    expect(body).toContain('buildNewLeadRecord');
    expect(body).not.toContain('50000');
    expect(body).not.toContain('New Client Inquiry');
  });
});

// Regression guard for the create-lead reply: the route answered
// `{ success: true, lead }` unconditionally. A submission carrying no real
// field at all still produced a "lead" made entirely of "not recorded"
// placeholders, and the operator's Add Client form closed as though a client
// had been entered.

describe('classifyNewLeadIntake refuses a payload that carried no lead field', () => {
  it('refuses a body with only an id (no real field)', () => {
    const verdict = classifyNewLeadIntake({});
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) {
      expect(verdict.reason).toBe('NO_FIELDS');
      expect(verdict.message).toContain('no lead was stored');
    }
  });

  it('refuses blank and whitespace-only fields', () => {
    expect(classifyNewLeadIntake({ clientName: '   ', rawRequirement: '' }).accepted).toBe(false);
    expect(classifyNewLeadIntake({ budget: 0 }).accepted).toBe(false);
    expect(classifyNewLeadIntake({ budget: 'not a number' }).accepted).toBe(false);
  });

  it('accepts a body that carries any one real field', () => {
    expect(classifyNewLeadIntake({ clientName: 'Nimbus Analytics' }).accepted).toBe(true);
    expect(classifyNewLeadIntake({ rawRequirement: 'Need a dashboard.' }).accepted).toBe(true);
    expect(classifyNewLeadIntake({ budget: 40000 }).accepted).toBe(true);
    expect(classifyNewLeadIntake({ projectType: 'AI Integration' }).accepted).toBe(true);
  });

  it('reports whether a client was actually identified', () => {
    const named = classifyNewLeadIntake({ clientName: 'Nimbus Analytics' });
    const unnamed = classifyNewLeadIntake({ rawRequirement: 'Need a dashboard.' });
    expect(named.accepted && named.hasClientIdentity).toBe(true);
    expect(unnamed.accepted && unnamed.hasClientIdentity).toBe(false);
  });
});

describe('server create-lead route refuses an empty payload instead of reporting success', () => {
  it('gates on classifyNewLeadIntake and answers success:false when nothing was supplied', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
    const route = server.slice(server.indexOf("'/api/freelance/create-lead'"));
    const body = route.slice(0, route.indexOf('update-status'));
    expect(body).toContain('classifyNewLeadIntake');
    expect(body).toContain('if (!intake.accepted)');
    expect(body).toContain('success: false');
    expect(body).toContain('stored: false');
  });

  it('frontend keeps the form open and surfaces the refusal', () => {
    const modal = fs.readFileSync(path.resolve(__dirname, '../components/FreelancePipelineModal.tsx'), 'utf8');
    expect(modal).toContain('setCreateNotice');
    expect(modal).toContain('The lead was not stored');
  });
});
