import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  reverseGeocodeCoordinates,
  isResolvedAddress,
} from '../utils/locationService';
import type { LocationAddress } from '../types/location';

// item 13 — the reverse-geocode panel. `reverseGeocodeCoordinates()` falls back
// to `estimateOfflineRegion()` whenever the network lookup fails. That fallback
// is a coarse quadrant guess, but it returned city/country values that read as
// a resolved civic address, and the modal stamped the result
// `CIVIC SECTOR / REVERSE GEOCODE`. A reader takes that for a geocoder answer
// the app never received.

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const read = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');
const SERVICE = fs.readFileSync(
  path.resolve(__dirname, '../utils/locationService.ts'),
  'utf8',
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reverseGeocodeCoordinates marks an offline estimate as unresolved', () => {
  it('an unreachable geocoder yields resolved:false / source:offline_estimate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const addr = await reverseGeocodeCoordinates(19.076, 72.8777);
    expect(addr.resolved).toBe(false);
    expect(addr.source).toBe('offline_estimate');
    // The estimate must not present itself as a confident civic name.
    expect(addr.formattedAddress).toMatch(/offline estimate/i);
    expect(addr.formattedAddress).not.toMatch(/Telemetry Sector/);
  });

  it('a non-ok geocoder response also yields an unresolved estimate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    );
    const addr = await reverseGeocodeCoordinates(40.7128, -74.006);
    expect(addr.resolved).toBe(false);
    expect(addr.source).toBe('offline_estimate');
  });

  it('a resolved geocoder response is marked resolved:true / source:nominatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              address: {
                city: 'Mumbai',
                state: 'Maharashtra',
                country: 'India',
                country_code: 'in',
              },
            }),
        }),
      ),
    );
    const addr = await reverseGeocodeCoordinates(19.076, 72.8777);
    expect(addr.resolved).toBe(true);
    expect(addr.source).toBe('nominatim');
    expect(addr.city).toBe('Mumbai');
  });

  it('isResolvedAddress trusts only an explicit resolved:true', () => {
    expect(isResolvedAddress({ formattedAddress: 'x', resolved: true })).toBe(true);
    expect(isResolvedAddress({ formattedAddress: 'x', resolved: false })).toBe(false);
    expect(isResolvedAddress({ formattedAddress: 'x' })).toBe(false);
    expect(isResolvedAddress(null)).toBe(false);
  });
});

describe('the offline estimate never returns an unlabelled civic name', () => {
  it('the fallback marks every returned address unresolved', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('function estimateOfflineRegion'));
    const body = fn.slice(0, fn.indexOf('isResolvedAddress'));
    expect(body).toContain('resolved: false');
    expect(body).toContain("source: 'offline_estimate'");
    expect(body).toContain('offline estimate, not a resolved address');
    // The old confident literals must be gone.
    expect(body).not.toMatch(/Telemetry Sector|Earth Grid|Indian Subcontinent Core/);
  });
});

describe('the location surfaces distinguish a geocoded address from a guess', () => {
  it('LocationServicesModal gates the CIVIC SECTOR label on resolution', () => {
    const src = read('LocationServicesModal.tsx');
    expect(src).toContain('isResolvedAddress');
    expect(src).toContain('REGION ESTIMATE / NO GEOCODER');
    // The unconditional CIVIC SECTOR literal must not survive.
    expect(src).not.toMatch(/>\s*CIVIC SECTOR \/ REVERSE GEOCODE\s*</);
  });

  it('DashboardMapSnippet gates its labels on resolution', () => {
    const src = read('DashboardMapSnippet.tsx');
    expect(src).toContain('isResolvedAddress');
    expect(src).toContain('REGION ESTIMATE');
    expect(src).not.toMatch(/address\?\.city \|\| 'CURRENT FIX'/);
  });
});