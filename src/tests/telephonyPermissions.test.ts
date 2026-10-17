import { describe, it, expect, beforeEach } from 'vitest';
import {
  PHONE_PERMISSION_DEFINITIONS,
  DEFAULT_PHONE_PERMISSIONS,
  loadPhonePermissions,
  savePhonePermissions,
  maskPhoneNumber,
  evaluateClinicSafety,
  checkHumanHandoffIntent,
} from '../utils/telephonyPermissions';
import { PhonePermissionKey } from '../types/telephonyProvider';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function installMemoryStorage(): void {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).window = globalThis;
}

describe('Telephony Permissions & Clinic Safety Suite', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  describe('1. Permission definition integrity (Level-4 safety invariants)', () => {
    it('declares exactly one entry per PhonePermissionKey', () => {
      const keys = PHONE_PERMISSION_DEFINITIONS.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.length).toBe(Object.keys(DEFAULT_PHONE_PERMISSIONS).length);
    });

    it('keeps every declared definition consistent with its default state', () => {
      for (const def of PHONE_PERMISSION_DEFINITIONS) {
        expect(DEFAULT_PHONE_PERMISSIONS[def.key]).toBe(def.defaultState);
      }
    });

    it('defaults all private-data and recording permissions to DENIED', () => {
      expect(DEFAULT_PHONE_PERMISSIONS.PHONE_PRIVATE_DATA_ACCESS).toBe('DENIED');
      expect(DEFAULT_PHONE_PERMISSIONS.PHONE_EMAIL_ACCESS).toBe('DENIED');
      expect(DEFAULT_PHONE_PERMISSIONS.PHONE_RECORDING).toBe('DENIED');
    });

    it('never grants an outbound call without an explicit human decision', () => {
      expect(DEFAULT_PHONE_PERMISSIONS.PHONE_OUTBOUND_CALL).not.toBe('GRANTED');
      const outboundDef = PHONE_PERMISSION_DEFINITIONS.find(
        (d) => d.key === 'PHONE_OUTBOUND_CALL'
      );
      expect(outboundDef?.level).toBe(4);
    });
  });

  describe('2. Permission persistence safety', () => {
    it('returns a copy of the defaults when nothing is stored', () => {
      const loaded = loadPhonePermissions();
      expect(loaded).toEqual(DEFAULT_PHONE_PERMISSIONS);
      loaded.PHONE_OUTBOUND_CALL = 'GRANTED';
      expect(DEFAULT_PHONE_PERMISSIONS.PHONE_OUTBOUND_CALL).toBe('ASK');
    });

    it('round-trips a saved permission set', () => {
      const updated: Record<PhonePermissionKey, any> = {
        ...DEFAULT_PHONE_PERMISSIONS,
        PHONE_OUTBOUND_CALL: 'GRANTED',
        PHONE_RECORDING: 'ASK',
      };
      savePhonePermissions(updated);
      expect(loadPhonePermissions()).toEqual(updated);
    });

    it('falls back to defaults on corrupted stored JSON', () => {
      localStorage.setItem('hermes_jarvis_phone_permissions_v1', '{not-json');
      expect(loadPhonePermissions()).toEqual(DEFAULT_PHONE_PERMISSIONS);
    });
  });

  describe('3. Caller-ID masking (privacy-critical)', () => {
    it('preserves only the last four digits of a full number', () => {
      expect(maskPhoneNumber('+919876543210')).toBe('+91 ******3210');
    });

    it('does not leak the subscriber digits before the last four', () => {
      const masked = maskPhoneNumber('+919876543210');
      expect(masked).not.toContain('987654');
      expect(masked).not.toContain('98765');
      expect(masked).not.toContain('9876');
    });

    it('masks a number without a country prefix', () => {
      expect(maskPhoneNumber('9876543210')).toBe('******3210');
    });

    it('keeps the country prefix but masks the rest of a spaced number', () => {
      expect(maskPhoneNumber('+91 9876543210')).toBe('+91 ******3210');
    });

    it('formats an international number with its country prefix', () => {
      expect(maskPhoneNumber('+1 (415) 890-2134')).toBe('+1 ******2134');
    });

    it('fully masks inputs too short to hold a subscriber number', () => {
      expect(maskPhoneNumber('1234')).toBe('****');
      expect(maskPhoneNumber('123')).toBe('****');
    });

    it('never reveals more than the final four subscriber digits', () => {
      for (const raw of ['+919876543210', '9876543210', '+91 9876543210', '123456']) {
        const masked = maskPhoneNumber(raw);
        const digits = raw.replace(/\D/g, '');
        const lastFour = digits.slice(-4);
        const beforeLastFour = digits.slice(0, -4).replace(/^91|^1/, '');
        expect(masked.endsWith(lastFour)).toBe(true);
        expect(masked).not.toContain(beforeLastFour);
      }
    });

    it('labels missing caller identity without inventing digits', () => {
      expect(maskPhoneNumber('')).toBe('Unknown / Private');
      expect(maskPhoneNumber('   ')).toBe('Unknown / Private');
    });
  });

  describe('4. Clinic safety evaluator (Section F)', () => {
    it('flags an English medical emergency with a non-diagnostic response', () => {
      const res = evaluateClinicSafety('I think I am having a heart attack', 'en-US');
      expect(res.isMedicalEmergency).toBe(true);
      expect(res.isMedicalAdviceRequest).toBe(false);
      expect(res.safeResponse).toContain('108');
    });

    it('flags a Hindi medical emergency in Hindi', () => {
      const res = evaluateClinicSafety('सीने में दर्द हो रहा है', 'hi-IN');
      expect(res.isMedicalEmergency).toBe(true);
      expect(res.safeResponse).toMatch(/[\u0900-\u097F]/);
    });

    it('refuses to prescribe when asked for medicine', () => {
      const res = evaluateClinicSafety('which medicine should I take', 'en-US');
      expect(res.isMedicalEmergency).toBe(false);
      expect(res.isMedicalAdviceRequest).toBe(true);
      expect(res.safeResponse?.toLowerCase()).toContain('cannot');
    });

    it('refuses a Hindi medicine request', () => {
      const res = evaluateClinicSafety('मुझे कौन सी दवाई लूं', 'hi-IN');
      expect(res.isMedicalAdviceRequest).toBe(true);
    });

    it('treats a plain appointment query as safe (no override response)', () => {
      const res = evaluateClinicSafety('I want to book an appointment', 'en-US');
      expect(res.isMedicalEmergency).toBe(false);
      expect(res.isMedicalAdviceRequest).toBe(false);
      expect(res.safeResponse).toBeUndefined();
    });

    it('prioritises an emergency over an advice request when both appear', () => {
      const res = evaluateClinicSafety('severe bleeding, which medicine should I take', 'en-US');
      expect(res.isMedicalEmergency).toBe(true);
    });
  });

  describe('5. Human handoff intent detection (Section G)', () => {
    it('detects English handoff requests', () => {
      expect(checkHumanHandoffIntent('I want to speak with a human')).toBe(true);
      expect(checkHumanHandoffIntent('connect me to staff')).toBe(true);
    });

    it('detects Hindi handoff requests', () => {
      expect(checkHumanHandoffIntent('डॉक्टर से बात कराइए')).toBe(true);
    });

    it('does not trigger on an ordinary booking sentence', () => {
      expect(checkHumanHandoffIntent('I want to book an appointment for tomorrow')).toBe(false);
    });
  });
});
