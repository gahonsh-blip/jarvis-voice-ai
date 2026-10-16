import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { maskAndroidCallerNumber } from '../utils/androidBridgePrivacy';

// The bridge event route used to carry its own inline masking regex:
//   String(payload.callerNumber).replace(/(\d{2,3})\d{4,6}(\d{3,4})/, '$1******$2')
// That pattern is anchored to contiguous digits, so a number formatted with
// spaces never matched and was echoed back completely unmasked; when it did
// match it kept the leading 2-3 digits *and* 3-4 more of the subscriber number
// visible. It is replaced by the canonical engine helper, which extracts digits
// first. These tests pin the route to that helper and pin the helper's output on
// the exact inputs the old regex got wrong.

describe('android bridge HTTP caller masking', () => {
  it('masks a spaced international number instead of echoing it', () => {
    // Old inline regex: '+1 415 890 2134' -> '+1 415 890 2134' (unmasked).
    const masked = maskAndroidCallerNumber('+1 415 890 2134');
    expect(masked).toBe('+1 ******2134');
    expect(masked).not.toContain('415');
    expect(masked).not.toContain('890');
  });

  it('does not leak four subscriber digits on an Indian mobile', () => {
    // Old inline regex: '+91 9876543210' -> '+91 987******210'.
    const masked = maskAndroidCallerNumber('+91 9876543210');
    expect(masked).toBe('+91 ******3210');
    expect(masked).not.toContain('98765');
  });

  it('masks a grouped number with no match-anchor', () => {
    const masked = maskAndroidCallerNumber('+91 98765 43210');
    expect(masked).not.toContain('98765');
    expect(masked).not.toContain('43210');
  });

  it('reports an honest unknown for a digit-free identifier', () => {
    expect(maskAndroidCallerNumber('Unknown')).toBe('Unknown Number');
    expect(maskAndroidCallerNumber('private')).toBe('Unknown Number');
  });

  it('returns undefined when the device reported no identifier', () => {
    expect(maskAndroidCallerNumber(undefined)).toBeUndefined();
    expect(maskAndroidCallerNumber(null)).toBeUndefined();
    expect(maskAndroidCallerNumber('')).toBeUndefined();
  });
});

describe('server.ts event route uses the canonical mask', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const flat = serverSource.replace(/\s+/g, ' ');

  it('does not re-introduce the contiguous-digit inline mask', () => {
    expect(flat).not.toContain('(\\d{2,3})\\d{4,6}(\\d{3,4})');
  });

  it('masks the event route caller number through the shared helper', () => {
    expect(flat).toContain('const maskedNumber = maskAndroidCallerNumber(payload.callerNumber);');
  });
});
