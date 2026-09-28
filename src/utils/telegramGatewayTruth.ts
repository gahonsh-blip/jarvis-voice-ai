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
