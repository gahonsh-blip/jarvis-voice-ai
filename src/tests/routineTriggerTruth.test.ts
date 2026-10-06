import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveRoutineTrigger,
  routineTriggerDelivery,
  ROUTINE_SLOTS,
} from '../utils/hardening/routineTriggerTruth';
import type { DeliveryInterpretation } from '../utils/communication/telegramDelivery';

// Regression guard for backlog item 13. `POST /api/routines/trigger` answered
// `{ success: true, routine }` for every request and fell back to
// `proactiveReports[0]` when the requested slot did not match — so an unknown
// slot, or an empty store (both match and fallback undefined), still read as a
// triggered briefing. server.ts binds a port on import, so the wiring is
// asserted against the source text and the decision logic is exercised directly,
// matching schedulerRunTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('resolveRoutineTrigger accepts only the four real slots', () => {
  it('accepts each slot the report builder produces', () => {
    for (const slot of ROUTINE_SLOTS) {
      const verdict = resolveRoutineTrigger(slot);
      expect(verdict.ok).toBe(true);
      expect(verdict.slot).toBe(slot);
    }
  });

  it('refuses an unknown slot instead of defaulting to the first routine', () => {
    const verdict = resolveRoutineTrigger('midnight');
    expect(verdict.ok).toBe(false);
    expect(verdict.slot).toBeNull();
    expect(verdict.reason).toContain('midnight');
  });

  it('refuses a missing slot instead of silently picking a routine', () => {
    for (const missing of [undefined, null, '']) {
      const verdict = resolveRoutineTrigger(missing);
      expect(verdict.ok).toBe(false);
      expect(verdict.slot).toBeNull();
    }
  });

  it('refuses a non-string slot so a truthy object cannot trigger a routine', () => {
    expect(resolveRoutineTrigger({ timeSlot: 'morning' }).ok).toBe(false);
    expect(resolveRoutineTrigger(0).ok).toBe(false);
  });
});

describe('the routines/trigger route no longer fakes a trigger', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/routines/trigger'");
    return serverSource.slice(start, serverSource.indexOf('// =====', start));
  })();

  it('validates the slot before answering and returns success:false on a miss', () => {
    expect(route).toContain('resolveRoutineTrigger(');
    expect(route).toMatch(/success:\s*false/);
    expect(route).toMatch(/status\(400\)/);
  });

  it('no longer falls back to proactiveReports[0] for an unmatched slot', () => {
    expect(route).not.toContain('proactiveReports[0]');
  });

  it('awaits the delivery verdict and no longer reports an unconditional trigger', () => {
    expect(route).toContain('routineTriggerDelivery(');
    expect(route).not.toMatch(/triggered:\s*true,\s*routine/);
  });
});

describe('routineTriggerDelivery reports what Telegram actually observed', () => {
  const verified: DeliveryInterpretation = { outcome: 'VERIFIED', delivered: true, messageId: 417 };
  const notConfigured: DeliveryInterpretation = {
    outcome: 'NOT_CONFIGURED',
    delivered: false,
    errorReason: 'no chat',
  };

  it('marks a confirmed Telegram push as delivered', async () => {
    const seen: { chatId: unknown; text: string }[] = [];
    const result = await routineTriggerDelivery('123', 'Morning', 'body', async (chatId, text) => {
      seen.push({ chatId, text });
      return verified;
    });
    expect(result).toMatchObject({ triggered: true, delivered: true, outcome: 'VERIFIED' });
    expect(result.message).toContain('417');
    expect(seen[0].chatId).toBe('123');
    expect(seen[0].text).toContain('Morning');
  });

  it('reports triggered-but-not-delivered when no chat is configured', async () => {
    const result = await routineTriggerDelivery(null, 'Morning', 'body', async () => notConfigured);
    expect(result).toMatchObject({
      triggered: true,
      delivered: false,
      outcome: 'NOT_CONFIGURED',
    });
    expect(result.message).toContain('NOT_CONFIGURED');
  });

  it('never claims delivery when the send returns nothing or a permission refusal', async () => {
    for (const outcome of [null, undefined, { outcome: 'PERMISSION_REQUIRED', delivered: false } as DeliveryInterpretation]) {
      const result = await routineTriggerDelivery('123', 'Night', 'body', async () => outcome);
      expect(result.triggered).toBe(true);
      expect(result.delivered).toBe(false);
    }
  });
});
