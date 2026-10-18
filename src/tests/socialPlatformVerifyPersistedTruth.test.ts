import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  classifyProviderTestResponse,
  verifiedAccountName,
  describeProviderVerdict,
} from '../utils/socialPublishHonesty';

const source = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/**
 * Item 13 (zero fake success). `/api/social/platforms/test` was hardened to
 * answer `persisted: false` when the provider proved the account but the server
 * could not cache it durably — yet the Social Hub read that same response
 * through `classifyProviderTestResponse`, which looked only at
 * `success`/`status`/`accountName` and returned `OK`. The card rendered a green
 * "VERIFIED — <account>" and the spoken line said "verified live", so a
 * connection that would vanish on the next boot was reported as a saved, live
 * connection. The classifier now reads `persisted` and returns a distinct
 * verdict the card and the spoken reply both surface.
 */
describe('item 13 — a verified probe whose cache did not persist is not reported as saved', () => {
  const verifiedButUnsaved = {
    success: true,
    status: 'VERIFIED',
    accountName: 'Gahon',
    accountIdentifier: 'urn:li:person:abc',
    persisted: false,
    message: 'Live Verified: Connected to Personal Member Profile for Gahon.',
  };

  it('classifies a verified-but-unpersisted probe as VERIFIED_NOT_PERSISTED, not OK', () => {
    expect(classifyProviderTestResponse(verifiedButUnsaved)).toBe('VERIFIED_NOT_PERSISTED');
  });

  it('still classifies a verified, saved probe as OK', () => {
    expect(
      classifyProviderTestResponse({ ...verifiedButUnsaved, persisted: true })
    ).toBe('OK');
    // An older server that omits `persisted` entirely is not penalised: absence
    // is not a failed write, it is an unrecorded one.
    expect(
      classifyProviderTestResponse({ ...verifiedButUnsaved, persisted: undefined })
    ).toBe('OK');
  });

  it('does not weaken the account-name requirement: no name is still UNCONFIRMED', () => {
    expect(
      classifyProviderTestResponse({
        success: true,
        status: 'VERIFIED',
        persisted: false,
        message: 'ok',
      })
    ).toBe('UNCONFIRMED');
  });

  it('the verdict names the durability gap and is not read as a clean verification', () => {
    const verdict = classifyProviderTestResponse(verifiedButUnsaved);
    expect(verdict).not.toBe('OK');
    expect(verifiedAccountName(verifiedButUnsaved)).toBe('Gahon');
    expect(describeProviderVerdict(verdict, 'Gahon')).toMatch(/could not save/i);
  });

  it('the Social Hub card and the spoken reply both branch on the new verdict', () => {
    const modal = source('src/components/SocialMediaModal.tsx');
    // The spoken reply must not say "verified live against <account>" for a
    // probe the server reported as not persisted.
    expect(modal).toContain("verdict === 'VERIFIED_NOT_PERSISTED'");
    expect(modal).toContain('but the connection could not be saved');
    // The card labels the account it verified while naming the missing save.
    expect(modal).toContain('(NOT SAVED)');
  });

  it('the route does not answer persisted:true for a probe that verified nothing', () => {
    const server = source('server.ts');
    const start = server.indexOf("app.post('/api/social/platforms/test'");
    expect(start).toBeGreaterThan(-1);
    const body = server.slice(start, server.indexOf('\n});', start));
    // The unconditional `persisted: true` fall-through is gone; the claim is now
    // derived from the probe's own success, so a NOT_CONFIGURED / ERROR probe
    // that persisted nothing cannot read as durable.
    expect(body).not.toMatch(/res\.json\(\{\s*\.\.\.result,\s*persisted:\s*true\s*\}\)/);
    expect(body).toContain('result.success === true && result.profilePersisted !== false');
  });
});
