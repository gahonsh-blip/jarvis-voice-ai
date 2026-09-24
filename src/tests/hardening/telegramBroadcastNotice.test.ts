import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  telegramBroadcastNotice,
  telegramBroadcastTransportFailure,
} from '../../utils/hardening/telegramBroadcastNotice';

// The component renders through React and touches `navigator`/`window`, so the
// wiring assertion reads the source text, matching micInputTruth.test.ts.
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/MobilePersonalStatusModal.tsx'),
  'utf8',
);

describe('the morning-briefing Telegram broadcast reports only confirmed delivery', () => {
  it('reports success only when the server confirms an observed message id', () => {
    const notice = telegramBroadcastNotice({ success: true, verified: true, messageId: 4242 });
    expect(notice.tone).toBe('success');
    expect(notice.text).toContain('confirmed delivery');
    expect(notice.text).toContain('4242');
  });

  it('does not claim success when the server reports success but no verification', () => {
    const notice = telegramBroadcastNotice({ success: true, verified: false });
    expect(notice.tone).toBe('unconfirmed');
    expect(notice.text.toLowerCase()).not.toContain('success');
    expect(notice.text).toContain('Not delivered');
  });

  it('reports an unconfirmed send with the server reason, never a completed broadcast', () => {
    const notice = telegramBroadcastNotice({
      success: false,
      verified: false,
      outcome: 'UNVERIFIED',
      message: 'Telegram delivery was not confirmed: no message id.',
    });
    expect(notice.tone).toBe('unconfirmed');
    expect(notice.text).toContain('Not delivered');
    expect(notice.text).toContain('no message id');
    expect(notice.text.toLowerCase()).not.toContain('completed');
  });

  it('never describes a failed send as a simulated broadcast completing', () => {
    const notice = telegramBroadcastNotice({ success: false });
    expect(notice.text.toLowerCase()).not.toContain('simulator');
    expect(notice.text.toLowerCase()).not.toContain('complete');
  });

  it('treats a thrown request as not delivered, not as a completed broadcast', () => {
    const notice = telegramBroadcastTransportFailure(new Error('Failed to fetch'));
    expect(notice.tone).toBe('unconfirmed');
    expect(notice.text).toContain('Not delivered');
    expect(notice.text).toContain('Failed to fetch');
    expect(notice.text.toLowerCase()).not.toContain('completed');
  });
});

describe('MobilePersonalStatusModal is wired to the honest broadcast helper', () => {
  it('no longer fabricates a completed broadcast on the error or fallback paths', () => {
    expect(modalSource).not.toContain('Telegram broadcast completed (Simulated/Live)');
    expect(modalSource).not.toContain('Telegram simulator broadcast complete.');
    expect(modalSource).not.toContain('Briefing broadcast to Telegram Mobile successfully!');
  });

  it('routes the response and the thrown error through the truth helper', () => {
    expect(modalSource).toContain('telegramBroadcastNotice(data).text');
    expect(modalSource).toContain('telegramBroadcastTransportFailure(err).text');
  });
});
