import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  gatewaySendResult,
  telegramGatewayBubble,
  telegramGatewayNotice,
} from '../utils/hardening/telegramSendTruth';
import { interpretTelegramSend } from '../utils/communication/telegramDelivery';

// Regression guard (backlog item 13): the web gateway's "send" flow answered
// `success: true` unconditionally because the outbound Telegram call was
// fire-and-forget. A blocked or failed send still rendered as delivered and the
// reply was spoken aloud. server.ts binds a port on import, so the route's
// return shape is asserted against the source, and the decision logic is
// exercised directly.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/TelegramGatewayModal.tsx'),
  'utf8',
);

describe('gatewaySendResult never claims a delivery it did not observe', () => {
  it('treats a missing delivery attempt as NOT_CONFIGURED, not success', () => {
    const r = gatewaySendResult(undefined);
    expect(r.delivered).toBe(false);
    expect(r.outcome).toBe('NOT_CONFIGURED');
  });

  it('passes through a confirmed delivery with its message id', () => {
    const r = gatewaySendResult(interpretTelegramSend({ message_id: 4321 }));
    expect(r.delivered).toBe(true);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.messageId).toBe(4321);
  });

  it('treats a response with no message id as undelivered', () => {
    const r = gatewaySendResult(interpretTelegramSend({ ok: true }));
    expect(r.delivered).toBe(false);
    expect(r.outcome).toBe('UNVERIFIED');
  });
});

describe('telegramGatewayBubble / notice report the true outcome', () => {
  it('annotates a confirmed delivery with the message id', () => {
    const bubble = telegramGatewayBubble('Hello', gatewaySendResult(interpretTelegramSend({ message_id: 7 })));
    expect(bubble).toContain('Delivered to Telegram');
    expect(bubble).toContain('7');
  });

  it('warns plainly when the reply was not delivered', () => {
    const r = gatewaySendResult(interpretTelegramSend({ ok: true }));
    const bubble = telegramGatewayBubble('Hello', r);
    expect(bubble).toContain('NOT DELIVERED');
    expect(telegramGatewayNotice(r).ok).toBe(false);
    expect(telegramGatewayNotice(gatewaySendResult(interpretTelegramSend({ message_id: 9 }))).ok).toBe(
      true,
    );
  });
});

describe('server send route awaits delivery and reports it', () => {
  it('awaits deliverTelegramMessage inside the command processor', () => {
    expect(serverSource).toMatch(
      /deliverTelegramMessage\(chatId, botReplyText, inlineKeyboard\)/,
    );
  });

  it('no longer fires the send fire-and-forget from processMobileCommand', () => {
    // The old call returned immediately and swallowed the outcome.
    expect(serverSource).not.toMatch(
      /sendRealTelegramMessage\(chatId, botReplyText, inlineKeyboard\)\.catch/,
    );
  });

  it('derives the send route success from the delivery, not a constant', () => {
    expect(serverSource).toMatch(/success:\s*delivery\.delivered/);
    expect(serverSource).not.toMatch(
      /res\.json\(\{\s*success:\s*true,\s*userMessage:\s*result\.userMsg/,
    );
  });
});

describe('gateway modal voices only delivered replies', () => {
  it('gates onSpeak on the delivered flag', () => {
    expect(modalSource).toMatch(/data\.delivered === true && data\.botMessage\?\.text/);
  });

  it('does not append messages when the server returned none', () => {
    expect(modalSource).toMatch(/if \(data\.userMessage && data\.botMessage\)/);
  });
});
