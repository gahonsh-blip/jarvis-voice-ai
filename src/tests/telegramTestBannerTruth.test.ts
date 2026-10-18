import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { telegramTestBanner } from '../utils/telegramGatewayTruth';

// Item 13 ("zero fake success") — the Telegram Gateway "Test Connection" button
// rendered its banner from its own boolean, not from what the server observed.
// When /api/telegram/test-live answered `success: true, notificationSent: false`
// the handler still drew a green "✅ Live Bot Verified!" banner. The server
// defines `success` as a Telegram-CONFIRMED delivery, and reports
// `botReachable: true` separately when getMe answered but no delivery was
// confirmed — so a reachable-but-undelivered result is not a live verified
// connection. `telegramTestBanner` renders only the observed fields.

const componentSource = fs.readFileSync(
  path.resolve(__dirname, '../components/TelegramGatewayModal.tsx'),
  'utf8'
);
const serverSource = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');

describe('Item 13 — Telegram test banner renders only what the server observed', () => {
  it('claims a live delivery only when the server confirmed one', () => {
    const banner = telegramTestBanner({ success: true, notificationSent: true });
    expect(banner.tone).toBe('success');
    expect(banner.message).toMatch(/confirmed a delivery/i);
  });

  it('does not claim success without a confirmed delivery', () => {
    // The server's own contract: success is paired only with a confirmed
    // delivery. A response carrying success without it must not read as a sent
    // notification.
    const banner = telegramTestBanner({ success: true, notificationSent: false });
    expect(banner.tone).not.toBe('success');
    expect(banner.message).toMatch(/unverified/i);
    expect(banner.message).not.toMatch(/\bsent\b/i);
    expect(banner.message).not.toMatch(/confirmed a delivery/i);
  });

  it('reports a reachable bot with no confirmed delivery as a warning, not a failure or a success', () => {
    const banner = telegramTestBanner({
      success: false,
      botReachable: true,
      activeChatId: '123456',
      botUsername: 'HermesBot',
    });
    expect(banner.tone).toBe('warn');
    expect(banner.message).toMatch(/reachable/i);
    expect(banner.message).toMatch(/no delivery was confirmed/i);
    expect(banner.message).toContain('@HermesBot');
  });

  it('tells the operator to /start when no chat id is registered', () => {
    const banner = telegramTestBanner({ success: false, botReachable: true, activeChatId: null });
    expect(banner.tone).toBe('warn');
    expect(banner.message).toMatch(/no chat id is registered/i);
    expect(banner.message).toMatch(/\/start/);
  });

  it('reports an unreachable, undelivered result as a failure', () => {
    for (const data of [{ success: false }, { success: false, botReachable: false }, null, undefined]) {
      const banner = telegramTestBanner(data as any);
      expect(banner.tone).toBe('fail');
      expect(banner.message).toMatch(/not connected/i);
    }
  });

  it('never invents a bot name — falls back to a neutral label', () => {
    const banner = telegramTestBanner({ success: false, botReachable: true });
    expect(banner.message).toContain('the bot');
    expect(banner.message).not.toMatch(/@Telegram\b/);
  });
});

describe('Item 13 — the Telegram gateway button no longer fabricates a success banner', () => {
  it('the component renders the banner from telegramTestBanner, not its own boolean', () => {
    expect(componentSource).toContain('telegramTestBanner(data)');
    expect(componentSource).not.toContain('Live Bot Verified! Ping notification sent');
    expect(componentSource).not.toContain('data.bot?.username');
  });

  it('the test-live response exposes the username the API returned', () => {
    expect(serverSource).toContain("botUsername: typeof botInfo?.username === 'string'");
  });
});
