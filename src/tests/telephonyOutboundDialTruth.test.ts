import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SIMULATION_PROVIDER_ID,
  telephonyEngineMode,
  telephonyEngineCanDial,
  telephonyDialRefusal,
} from '../utils/telephonyGatewayTruth';
import {
  TelephonyProviderRegistry,
  TwilioTelephonyProvider,
} from '../utils/telephonyAdapters';

// Zero-fake-success guard for the outbound-call authorization route.
//
// `POST /api/telephony/outbound/authorize` gated its dial on the raw
// `provider.isConfigured()` boolean. The simulator's isConfigured() is
// unconditionally true and its startOutboundCall() returns a fabricated
// providerCallId, so once the simulator was selected as the active engine the
// route placed a "call" no carrier saw and answered `success: true,
// providerCallId: "sim-..."`. The honest mode derived from the provider id is
// the only thing that says whether a real dial is possible.

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in actionExecutedSweepAudit.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const ORIGINAL_PROVIDER = TelephonyProviderRegistry.getProvider().id;
afterAll(() => {
  TelephonyProviderRegistry.setActiveProvider(ORIGINAL_PROVIDER);
});

describe('telephonyEngineCanDial only permits a live gateway', () => {
  it('permits a live gateway', () => {
    expect(telephonyEngineCanDial('LIVE_GATEWAY')).toBe(true);
  });

  it('refuses the simulator, an unconfigured carrier, and an unroutable engine', () => {
    expect(telephonyEngineCanDial('SIMULATION_ONLY')).toBe(false);
    expect(telephonyEngineCanDial('NOT_CONFIGURED')).toBe(false);
    expect(telephonyEngineCanDial('UNSUPPORTED_ENGINE')).toBe(false);
  });
});

describe('telephonyDialRefusal names why no call was placed', () => {
  it('states plainly that no outbound call was placed for every refused mode', () => {
    for (const mode of ['SIMULATION_ONLY', 'NOT_CONFIGURED', 'UNSUPPORTED_ENGINE'] as const) {
      expect(telephonyDialRefusal(mode)).toContain('no outbound call was placed');
    }
  });

  it('names the simulator so a simulated dial is not mistaken for a carrier one', () => {
    expect(telephonyDialRefusal('SIMULATION_ONLY')).toContain('SIMULATION_ONLY');
    expect(telephonyDialRefusal('SIMULATION_ONLY').toLowerCase()).toContain('simulator');
  });
});

describe('the active engine decides whether a dial is real', () => {
  it('refuses a dial when the simulator is active, even though isConfigured() is true', () => {
    TelephonyProviderRegistry.setActiveProvider(SIMULATION_PROVIDER_ID);
    const provider = TelephonyProviderRegistry.getProvider();
    // The simulator lies about being configured; the derived mode must not.
    expect(provider.isConfigured()).toBe(true);
    const mode = telephonyEngineMode(provider.id, provider.isConfigured());
    expect(mode).toBe('SIMULATION_ONLY');
    expect(telephonyEngineCanDial(mode)).toBe(false);
  });

  it('permits a dial only for a carrier that is actually configured', () => {
    TelephonyProviderRegistry.registerProvider(new TwilioTelephonyProvider({
      accountSid: 'AC' + '0'.repeat(18),
      authToken: 'x'.repeat(20),
      phoneNumber: '+15551234567',
    }));
    expect(TelephonyProviderRegistry.setActiveProvider('twilio')).toBe(true);
    const provider = TelephonyProviderRegistry.getProvider();
    expect(provider.isConfigured()).toBe(true);
    const mode = telephonyEngineMode(provider.id, provider.isConfigured());
    expect(mode).toBe('LIVE_GATEWAY');
    expect(telephonyEngineCanDial(mode)).toBe(true);
  });

  it('refuses a dial for an unconfigured carrier', () => {
    TelephonyProviderRegistry.registerProvider(new TwilioTelephonyProvider({
      accountSid: '',
      authToken: '',
      phoneNumber: '',
    }));
    TelephonyProviderRegistry.setActiveProvider('twilio');
    const provider = TelephonyProviderRegistry.getProvider();
    expect(provider.isConfigured()).toBe(false);
    const mode = telephonyEngineMode(provider.id, provider.isConfigured());
    expect(mode).toBe('NOT_CONFIGURED');
    expect(telephonyEngineCanDial(mode)).toBe(false);
  });
});

describe('the outbound-authorize route gates on the derived mode, not the raw boolean', () => {
  it('derives the dial mode from the active provider and refuses through telephonyEngineCanDial', () => {
    expect(serverFlat).toContain(
      'const dialEngineMode = telephonyEngineMode(provider.id, provider.isConfigured())',
    );
    expect(serverFlat).toContain('if (!telephonyEngineCanDial(dialEngineMode))');
    expect(serverFlat).toContain('error: telephonyDialRefusal(dialEngineMode)');
  });

  it('no longer gates the dial on the raw isConfigured() boolean', () => {
    expect(serverFlat).not.toContain(
      '!provider.isConfigured() && req.body.isSimulated !== true',
    );
  });
});
