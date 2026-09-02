import { describe, it, expect } from 'vitest';
import { renderPrivacyPolicyHtml, renderTermsOfServiceHtml } from '../utils/server_legal';

describe('HERMES JARVIS Legal Compliance & OAuth Pages', () => {
  describe('Privacy Policy Content & Google OAuth Requirements', () => {
    const privacyHtml = renderPrivacyPolicyHtml('https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app');

    it('returns a full standalone HTML document with DOCTYPE and meta tags', () => {
      expect(privacyHtml).toContain('<!DOCTYPE html>');
      expect(privacyHtml).toContain('<meta charset="UTF-8">');
      expect(privacyHtml).toContain('<meta name="viewport"');
      expect(privacyHtml).toContain('<title>Privacy Policy — HERMES JARVIS</title>');
    });

    it('accurately identifies application name and responsible developer', () => {
      expect(privacyHtml).toContain('HERMES JARVIS');
      expect(privacyHtml).toContain('Gahonsh');
      expect(privacyHtml).toContain('gahonsh@gmail.com');
    });

    it('accurately discloses requested Google YouTube OAuth scopes only', () => {
      expect(privacyHtml).toContain('https://www.googleapis.com/auth/youtube.readonly');
      expect(privacyHtml).toContain('https://www.googleapis.com/auth/youtube.upload');
      // Should not claim unrequested broad scopes
      expect(privacyHtml).not.toContain('https://mail.google.com/');
      expect(privacyHtml).not.toContain('https://www.googleapis.com/auth/drive.readonly');
    });

    it('explicitly includes the Google API Services User Data Policy / Limited Use statement', () => {
      expect(privacyHtml).toContain('Google API Services User Data Policy');
      expect(privacyHtml).toContain('Limited Use');
    });

    it('documents AES-256-GCM encrypted credential and token storage', () => {
      expect(privacyHtml).toContain('AES-256-GCM');
      expect(privacyHtml).toContain('Encryption');
    });

    it('documents the Level-4 Human Authorization Gateway for publishing', () => {
      expect(privacyHtml).toContain('Level-4 Human Authorization Gateway');
      expect(privacyHtml).toContain('explicitly authorized by you');
    });

    it('documents user disconnection, deletion, and Google revocation controls', () => {
      expect(privacyHtml).toContain('In-App Disconnect');
      expect(privacyHtml).toContain('https://myaccount.google.com/permissions');
      expect(privacyHtml).toContain('Clear Memory');
    });

    it('provides clear navigation links back to the homepage and terms', () => {
      expect(privacyHtml).toContain('href="https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/"');
      expect(privacyHtml).toContain('href="https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/terms"');
    });
  });

  describe('Terms of Service Content & Risk Disclaimers', () => {
    const termsHtml = renderTermsOfServiceHtml('https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app');

    it('returns a full standalone HTML document with DOCTYPE and meta tags', () => {
      expect(termsHtml).toContain('<!DOCTYPE html>');
      expect(termsHtml).toContain('<title>Terms of Service — HERMES JARVIS</title>');
    });

    it('identifies HERMES JARVIS and contact email', () => {
      expect(termsHtml).toContain('HERMES JARVIS');
      expect(termsHtml).toContain('gahonsh@gmail.com');
    });

    it('documents human-in-the-loop requirement and Level-4 authorization', () => {
      expect(termsHtml).toContain('Level-4 Gate');
      expect(termsHtml).toContain('Human-In-The-Loop');
    });

    it('covers YouTube Terms of Service and third party compliance', () => {
      expect(termsHtml).toContain('https://www.youtube.com/t/terms');
      expect(termsHtml).toContain('YouTube Terms of Service');
    });

    it('covers Global Kill Switch and emergency protocols', () => {
      expect(termsHtml).toContain('Global Kill Switch');
    });

    it('includes appropriate Disclaimers of Warranties and Limitation of Liability', () => {
      expect(termsHtml).toContain('AS IS');
      expect(termsHtml).toContain('Limitation of Liability');
      expect(termsHtml).toContain('Disclaimer of Warranties');
      expect(termsHtml).toContain('NOT WARRANT THAT THE APPLICATION WILL BE UNINTERRUPTED');
    });

    it('provides clear navigation links back to homepage and privacy policy', () => {
      expect(termsHtml).toContain('href="https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/"');
      expect(termsHtml).toContain('href="https://ais-pre-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/privacy"');
    });
  });
});
