import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyLeadStatusUpdate,
  FREELANCE_LEAD_STATUSES,
} from '../utils/hardening/freelanceLeadStatusTruth';

// Regression guard for backlog item 13. `POST /api/freelance/update-status`
// answered `{ success: true, lead }` for every request that matched a stored
// lead, storing any string the caller supplied and reporting a change even
// when the stored status was already the requested one. server.ts binds a port
// on import, so the wiring is asserted against the source text and the decision
// logic is exercised directly, matching routineTriggerTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

describe('classifyLeadStatusUpdate only applies a real transition', () => {
  it('applies a recognised status that differs from the stored one', () => {
    const verdict = classifyLeadStatusUpdate('Quotation Sent', 'Lead Entered');
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.status).toBe('Quotation Sent');
  });

  it('accepts every status the UI can display', () => {
    for (const status of FREELANCE_LEAD_STATUSES) {
      const verdict = classifyLeadStatusUpdate(status, 'Lead Entered');
      if (status === 'Lead Entered') {
        expect(verdict.success).toBe(false);
      } else {
        expect(verdict.success).toBe(true);
        expect(verdict.status).toBe(status);
      }
    }
  });

  it('refuses an unknown status instead of storing it as a real pipeline state', () => {
    const verdict = classifyLeadStatusUpdate('Bogus Status', 'Lead Entered');
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNKNOWN_STATUS');
    expect(verdict.status).toBeNull();
  });

  it('reports a repeat of the stored status as a no-op, not a saved change', () => {
    const verdict = classifyLeadStatusUpdate('In Progress', 'In Progress');
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNCHANGED');
    expect(verdict.status).toBeNull();
  });

  it('refuses a missing or non-string status', () => {
    for (const missing of [undefined, null, '', '   ', 42, { status: 'In Progress' }]) {
      const verdict = classifyLeadStatusUpdate(missing, 'Lead Entered');
      expect(verdict.success).toBe(false);
      expect(verdict.outcome).toBe('NO_STATUS');
      expect(verdict.status).toBeNull();
    }
  });

  it('trims surrounding whitespace before matching a known status', () => {
    const verdict = classifyLeadStatusUpdate('  In Progress  ', 'Lead Entered');
    expect(verdict.success).toBe(true);
    expect(verdict.status).toBe('In Progress');
  });
});

describe('the freelance update-status route no longer fakes a saved change', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/freelance/update-status'");
    return serverSource.slice(start, serverSource.indexOf('// Social Media Engine APIs', start));
  })();

  it('classifies the requested status before writing it', () => {
    expect(route).toContain('classifyLeadStatusUpdate(');
    expect(route).toMatch(/success:\s*false/);
  });

  it('no longer writes the raw request status straight onto the lead', () => {
    expect(route).not.toMatch(/lead\.status\s*=\s*status\b/);
  });

  it('answers a missing lead with success:false rather than a bare error', () => {
    expect(route).toMatch(/status\(404\)\.json\(\{\s*success:\s*false/);
  });
});
