import { describe, it, expect } from 'vitest';
import {
  classifyProviderTestResponse,
  verifiedAccountName,
  describeProviderVerdict,
  connectionStatusLabel,
  isUsableCredential,
  socialApprovalPostureLabel,
  PLATFORM_PROVIDER_HOSTS,
} from '../utils/socialPublishHonesty';

describe('social publish honesty — the Hub must not claim an unmeasured connection', () => {
  it('treats a verified provider answer with a named account as verified', () => {
    const raw = {
      success: true,
      status: 'VERIFIED',
      accountName: 'Gahon',
      accountIdentifier: 'urn:li:person:abc',
      message: 'Live Verified: Connected to Personal Member Profile for Gahon.',
    };
    expect(classifyProviderTestResponse(raw)).toBe('OK');
    expect(verifiedAccountName(raw)).toBe('Gahon');
  });

  it('does NOT verify success:true when the provider never named the account', () => {
    const raw = { success: true, status: 'VERIFIED', message: 'ok' };
    expect(verifiedAccountName(raw)).toBeNull();
    expect(classifyProviderTestResponse(raw)).toBe('UNCONFIRMED');
    expect(describeProviderVerdict('UNCONFIRMED', null)).toMatch(/UNVERIFIED/);
  });

  it('does NOT verify success:true carrying a non-verified status', () => {
    const raw = { success: true, status: 'CONNECTED', accountName: 'Gahon', message: 'ok' };
    expect(classifyProviderTestResponse(raw)).toBe('UNCONFIRMED');
  });

  it('refuses to verify contradictory responses claiming verification on a failure', () => {
    const raw = { success: false, status: 'VERIFIED', accountName: 'Gahon', message: 'nope' };
    expect(classifyProviderTestResponse(raw)).toBe('UNCONFIRMED');
  });

  it('maps missing credentials to NOT_CONFIGURED, not to a failure', () => {
    expect(
      classifyProviderTestResponse({ success: false, status: 'NOT_CONFIGURED', message: 'missing' })
    ).toBe('NOT_CONFIGURED');
  });

  it('maps expired/authorization-required to a reconnect, never to a pass', () => {
    expect(classifyProviderTestResponse({ success: false, status: 'EXPIRED', message: '' })).toBe(
      'RECONNECT'
    );
    expect(
      classifyProviderTestResponse({ success: false, status: 'AUTH_REQUIRED', message: '' })
    ).toBe('RECONNECT');
  });

  it('maps a provider error to FAILED and surfaces the provider message', () => {
    const verdict = classifyProviderTestResponse({
      success: false,
      status: 'ERROR',
      message: 'Meta Graph API error: token revoked',
    });
    expect(verdict).toBe('FAILED');
    expect(describeProviderVerdict(verdict, null, 'Meta Graph API error: token revoked')).toMatch(
      /token revoked/
    );
  });

  it('never verifies a malformed payload', () => {
    expect(classifyProviderTestResponse(null)).toBe('UNCONFIRMED');
    expect(classifyProviderTestResponse('VERIFIED')).toBe('UNCONFIRMED');
    expect(classifyProviderTestResponse({})).toBe('UNCONFIRMED');
  });

  it('labels a merely-present credential as unverified, not as connected', () => {
    expect(connectionStatusLabel('CONNECTED', true)).toMatch(/not yet verified/);
    expect(isUsableCredential('CONNECTED', true)).toBe(true);
    expect(isUsableCredential('CONNECTED', false)).toBe(false);
  });

  it('never reports a measured status before the status was actually fetched', () => {
    expect(connectionStatusLabel('CONNECTED', false)).toMatch(/Not checked yet/);
    expect(isUsableCredential('CONNECTED', false)).toBe(false);
  });

  it('does not advertise a Level 4 approval gate before the posture is measured', () => {
    expect(socialApprovalPostureLabel(null, false)).toMatch(/UNKNOWN/);
    expect(socialApprovalPostureLabel(undefined, true)).toMatch(/UNKNOWN/);
    expect(socialApprovalPostureLabel(4, true)).toMatch(/Level 4 approval required/);
  });

  it('says plainly when the live level is below a Level 4 gate', () => {
    const label = socialApprovalPostureLabel(2, true);
    expect(label).toMatch(/NOT a Level 4 gate/);
    expect(label).not.toMatch(/Level 4 Approval Active/);
  });

  it('names the real provider host each platform is claimed to publish through', () => {
    expect(PLATFORM_PROVIDER_HOSTS.linkedin).toBe('api.linkedin.com');
    expect(PLATFORM_PROVIDER_HOSTS.facebook).toBe('graph.facebook.com');
    expect(PLATFORM_PROVIDER_HOSTS.instagram).toBe('graph.facebook.com');
    expect(PLATFORM_PROVIDER_HOSTS.youtube).toBe('www.googleapis.com/youtube/v3');
    expect(PLATFORM_PROVIDER_HOSTS.twitter).toBe('api.twitter.com');
  });
});
