import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  telegramLiveness,
  telegramLivenessLabel,
  telegramStatusKnown,
  telegramTokenLabel,
  telegramBotHandleLabel,
  telegramTransportLabel,
  telegramCloudSyncClaim,
  TELEGRAM_TEMPLATE_BOT_HANDLE,
} from '../utils/telegramGatewayTruth';

// Regression guard for fabricated status claims in the Telegram gateway panel.
// Before this fix the panel asserted a bot handle no API had reported, a
// "Real Telegram API (Long Polling)" transport for any non-live state, and that
// messages "execute autonomously on your Oracle Cloud VM and sync live back" —
// none of which this process measures.

const COMPONENT_PATH = path.resolve(__dirname, '../components/TelegramGatewayModal.tsx');
const componentSource = fs.readFileSync(COMPONENT_PATH, 'utf8');
const SERVER_PATH = path.resolve(__dirname, '../../server.ts');
const serverSource = fs.readFileSync(SERVER_PATH, 'utf8');

describe('telegramGatewayTruth helpers refuse to overstate liveness', () => {
  it('treats a missing or unreported boolean as UNKNOWN, not as offline or online', () => {
    expect(telegramStatusKnown(null)).toBe(false);
    expect(telegramStatusKnown(undefined)).toBe(false);
    expect(telegramStatusKnown({})).toBe(false);
    expect(telegramLiveness({})).toBe('UNKNOWN');
    expect(telegramLivenessLabel('UNKNOWN')).toBe('STATUS UNKNOWN');
  });

  it('maps an observed boolean to LIVE or NOT_LIVE only', () => {
    expect(telegramLiveness({ isLiveConnected: true })).toBe('LIVE');
    expect(telegramLiveness({ isLiveConnected: false })).toBe('NOT_LIVE');
    expect(telegramLivenessLabel('LIVE')).toBe('LIVE ONLINE');
    expect(telegramLivenessLabel('NOT_LIVE')).toBe('Interactive Gateway');
  });

  it('never turns a present token into a verified-connection claim', () => {
    const present = telegramTokenLabel({ isLiveTokenConfigured: true });
    expect(present).toContain('not verified');
    expect(present.toLowerCase()).not.toContain('connected');
    expect(telegramTokenLabel({})).toBe('UNKNOWN');
  });

  it('flags the template bot handle as not reported by the Telegram API', () => {
    const label = telegramBotHandleLabel({ botUsername: TELEGRAM_TEMPLATE_BOT_HANDLE });
    expect(label).toContain('NOT REPORTED BY THE TELEGRAM API');
    expect(telegramBotHandleLabel({ botUsername: '' })).toContain('NOT REPORTED');
    expect(telegramBotHandleLabel({ botUsername: '@real_hermes_bot' })).toBe('@real_hermes_bot');
  });

  it('refuses to name a transport before liveness is known', () => {
    expect(telegramTransportLabel({})).toBe('STATUS UNKNOWN');
    expect(telegramTransportLabel({ isLiveConnected: true })).toContain('Real Telegram API');
    expect(telegramTransportLabel({ isLiveConnected: false })).toBe('Web Gateway Mode');
  });

  it('makes no host or cloud-sync claim', () => {
    const claim = telegramCloudSyncClaim();
    expect(claim).toContain('makes no claim');
    expect(claim).not.toMatch(/oracle/i);
    expect(claim).not.toMatch(/24\/7/);
  });
});

describe('TelegramGatewayModal no longer hardcodes the status strings', () => {
  it('does not render a literal LIVE ONLINE badge', () => {
    expect(componentSource).not.toMatch(/>\s*LIVE ONLINE\s*</);
  });

  it('does not render the Oracle cloud-sync marketing claim', () => {
    expect(componentSource).not.toMatch(/Oracle Cloud VM/);
    expect(componentSource).not.toMatch(/24\/7 Mobile Command/);
  });

  it('does not print a raw botUsername straight from seeded config', () => {
    expect(componentSource).not.toMatch(/config\.botUsername/);
    expect(componentSource).toContain('telegramBotHandleLabel');
  });

  it('gates config storage on an observed boolean', () => {
    expect(componentSource).toContain('telegramStatusKnown(data.config)');
  });
});

describe('server no longer seeds fabricated telegram telemetry', () => {
  it('starts the received-message counter at zero', () => {
    expect(serverSource).not.toMatch(/totalMessagesReceived:\s*3\b/);
    expect(serverSource).toMatch(/totalMessagesReceived:\s*0\b/);
  });

  it('tracks whether the bot handle came from the Telegram API', () => {
    expect(serverSource).toContain('botUsernameReported: false');
    expect(serverSource).toContain('telegramConfig.botUsernameReported = true');
  });
});
