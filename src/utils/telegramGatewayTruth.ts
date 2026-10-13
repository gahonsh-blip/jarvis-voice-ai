// Truthfulness helpers for the Telegram Gateway panel.
//
// The panel is the surface an operator reads to decide whether the phone
// gateway is live. It had three problems, all of the same class as the other
// surfaces fixed in this window: it asserted states nothing had observed.
//
//  1. The status bar printed `config.botUsername` unconditionally. The server
//     seeds that field to the template literal `@HermesJarvisAssistantBot` and
//     only overwrites it with the API's real username inside the long-polling
//     loop, so before a successful `getMe` the panel showed a bot handle that
//     may not exist.
//  2. The mode line rendered "Web Gateway Mode" for every non-live state,
//     including the state where the status request had never answered.
//  3. The sidebar asserted "24/7 Mobile Command" with the copy "execute
//     autonomously on your Oracle Cloud VM and sync live back to this matrix" —
//     a hosting and sync claim nothing in this process measures (this daemon may
//     not even be running on the declared Oracle instance).

export type TelegramLiveness = 'LIVE' | 'NOT_LIVE' | 'UNKNOWN';

export interface TelegramStatusLike {
  isLiveConnected?: unknown;
  isLiveTokenConfigured?: unknown;
  botUsername?: unknown;
  botUsernameReported?: unknown;
  mode?: unknown;
}

// The server's template default. A handle equal to this was never reported by
// the Telegram API, so it must not be presented as the configured bot.
export const TELEGRAM_TEMPLATE_BOT_HANDLE = '@HermesJarvisAssistantBot';

export function telegramStatusKnown(config: TelegramStatusLike | null | undefined): boolean {
  return typeof config?.isLiveConnected === 'boolean';
}

export function telegramLiveness(config: TelegramStatusLike | null | undefined): TelegramLiveness {
  if (!telegramStatusKnown(config)) return 'UNKNOWN';
  return config?.isLiveConnected === true ? 'LIVE' : 'NOT_LIVE';
}

export function telegramLivenessLabel(liveness: TelegramLiveness): string {
  switch (liveness) {
    case 'LIVE':
      return 'LIVE ONLINE';
    case 'NOT_LIVE':
      return 'Interactive Gateway';
    default:
      return 'STATUS UNKNOWN';
  }
}

// A token merely being present proves a credential was read, never that the
// carrier accepted it. Only a boolean observation may claim liveness.
export function telegramTokenLabel(config: TelegramStatusLike | null | undefined): string {
  if (typeof config?.isLiveTokenConfigured !== 'boolean') return 'UNKNOWN';
  return config.isLiveTokenConfigured
    ? 'Token present — connection not verified'
    : 'No bot token configured';
}

export function telegramBotHandleLabel(config: TelegramStatusLike | null | undefined): string {
  const raw = typeof config?.botUsername === 'string' ? config.botUsername.trim() : '';
  if (!raw || raw === TELEGRAM_TEMPLATE_BOT_HANDLE) {
    return `${TELEGRAM_TEMPLATE_BOT_HANDLE} (NOT REPORTED BY THE TELEGRAM API)`;
  }
  return raw;
}

export function telegramTransportLabel(config: TelegramStatusLike | null | undefined): string {
  const liveness = telegramLiveness(config);
  if (liveness === 'UNKNOWN') return 'STATUS UNKNOWN';
  return liveness === 'LIVE' ? 'Real Telegram API (Long Polling)' : 'Web Gateway Mode';
}

// The hosting/sync claim. Nothing here contacts a cloud control plane or
// verifies a replication path, so the honest copy is a refusal to claim one.
export function telegramCloudSyncClaim(): string {
  return (
    'Messages sent from your phone are handled by this gateway process when a bot token ' +
    'is configured and the long-polling connection is live. This build makes no claim ' +
    'about which host runs it and does not verify any cloud sync.'
  );
}

// ------------------------------------------------------------------------------
// "Test Connection" banner honesty (backlog item 13).
//
// The button POSTs /api/telegram/test-live, which defines `success` as a
// Telegram-CONFIRMED delivery (`delivery.delivered`, i.e. a returned message id)
// and reports `botReachable: true` separately from `success: false` when the bot
// answered `getMe` but no delivery was confirmed. The panel, however, rendered
// its banner from the button's own boolean:
//
//   setTestResult({ success: true, message: data.notificationSent
//     ? '✅ Live Bot Verified! Ping notification sent ...'
//     : `✅ Connected to ${username}. Send /start ...` })
//
// So a run where `notificationSent` was false still drew a green
// "✅ Live Bot Verified!" banner. The only outcome the current server returns
// with `success: true` is a confirmed delivery, so a success banner is always a
// delivery claim — but the copy must not assert a notification was sent unless
// the server actually said so, and a rejected/undelivered result must render as
// a failure (or, when `botReachable` proves the bot answered, an accurate
// "reachable, not delivered" partial). This helper renders only what was
// observed: `success` and `notificationSent` booleans, the bot username the API
// returned, and the configured chat id.
// ------------------------------------------------------------------------------

export type TelegramTestBannerTone = 'success' | 'warn' | 'fail';

export interface TelegramTestResultLike {
  success?: unknown;
  botReachable?: unknown;
  notificationSent?: unknown;
  outcome?: unknown;
  botUsername?: unknown;
  activeChatId?: unknown;
}

export interface TelegramTestBanner {
  tone: TelegramTestBannerTone;
  message: string;
}

export function telegramTestBanner(data: TelegramTestResultLike | null | undefined): TelegramTestBanner {
  const botUsername =
    typeof data?.botUsername === 'string' && data.botUsername.trim().length > 0
      ? data.botUsername.trim()
      : null;
  const botLabel = botUsername ? `@${botUsername.replace(/^@/, '')}` : 'the bot';
  const confirmedDelivery = data?.success === true && data?.notificationSent === true;

  if (confirmedDelivery) {
    return {
      tone: 'success',
      message: '✅ Live Bot Verified — Telegram confirmed a delivery to your chat. It should have reached your phone.',
    };
  }

  if (data?.success === true) {
    // The server's current contract pairs `success: true` only with a confirmed
    // delivery; if a future caller returns success without that proof, do not
    // claim a notification was sent.
    return {
      tone: 'warn',
      message: `The gateway reported success but did not confirm a delivery to ${botLabel}. Treat this as unverified.`,
    };
  }

  // `botReachable` proves only that `getMe` answered — not that anything was
  // delivered. Name which of the two happened.
  const chatConfigured = Boolean(data?.activeChatId);
  if (data?.botReachable === true) {
    const outcome = typeof data?.outcome === 'string' ? ` (${data.outcome})` : '';
    return {
      tone: 'warn',
      message: chatConfigured
        ? `⚠️ ${botLabel} is reachable (getMe answered)${outcome}, but no delivery was confirmed to your chat.`
        : `⚠️ ${botLabel} is reachable (getMe answered)${outcome}, but no chat id is registered — send /start from your phone to register one.`,
    };
  }

  return { tone: 'fail', message: '❌ Not connected — the bot was not reachable and no delivery was confirmed.' };
}
