import { describe, it, expect } from 'vitest';
import {
  buildDeliveryReceipt,
  classifyTelegramError,
  interpretTelegramSend,
} from '../utils/communication/telegramDelivery';

describe('interpretTelegramSend', () => {
  it('verifies a delivery only when Telegram returns a message id', () => {
    const result = interpretTelegramSend({ message_id: 417, chat: { id: 99 }, text: 'hi' });
    expect(result.outcome).toBe('VERIFIED');
    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe(417);
  });

  it('treats a null result as not configured rather than failed', () => {
    const result = interpretTelegramSend(null);
    expect(result.outcome).toBe('NOT_CONFIGURED');
    expect(result.delivered).toBe(false);
  });

  it('does not confirm a response with no message id', () => {
    const result = interpretTelegramSend({ ok: true });
    expect(result.outcome).toBe('UNVERIFIED');
    expect(result.delivered).toBe(false);
    expect(result.errorReason).toContain('message id');
  });

  it('rejects a non-positive or non-numeric message id', () => {
    for (const message_id of [0, -5, 'abc', null]) {
      const result = interpretTelegramSend({ message_id });
      expect(result.delivered).toBe(false);
      expect(result.outcome).toBe('UNVERIFIED');
    }
  });

  it('accepts a numeric string message id', () => {
    const result = interpretTelegramSend({ message_id: '12' });
    expect(result.outcome).toBe('VERIFIED');
    expect(result.messageId).toBe(12);
  });

  it('does not confirm an unexpected non-object result', () => {
    const result = interpretTelegramSend('ok');
    expect(result.outcome).toBe('UNVERIFIED');
    expect(result.delivered).toBe(false);
  });
});

describe('classifyTelegramError', () => {
  it('maps a blocked bot or bad token to PERMISSION_REQUIRED', () => {
    expect(classifyTelegramError({ errorCode: 403, message: 'bot was blocked' }).outcome).toBe(
      'PERMISSION_REQUIRED',
    );
    expect(classifyTelegramError({ errorCode: 401, message: 'unauthorized' }).outcome).toBe(
      'PERMISSION_REQUIRED',
    );
    expect(classifyTelegramError({ statusCode: 400, message: 'bad request' }).outcome).toBe(
      'PERMISSION_REQUIRED',
    );
  });

  it('maps other errors to FAILED', () => {
    const result = classifyTelegramError({ statusCode: 500, message: 'server error' });
    expect(result.outcome).toBe('FAILED');
    expect(result.errorReason).toBe('server error');
  });
});

describe('buildDeliveryReceipt', () => {
  it('marks a verified delivery as verified with message-id evidence', () => {
    const receipt = buildDeliveryReceipt(interpretTelegramSend({ message_id: 7 }), '12345');
    expect(receipt.verified).toBe(true);
    expect(receipt.outcome).toBe('VERIFIED');
    expect(receipt.evidence?.ref).toBe('7');
  });

  it('never marks an unconfirmed delivery as verified', () => {
    const receipt = buildDeliveryReceipt(interpretTelegramSend(null), '12345');
    expect(receipt.verified).toBe(false);
    expect(receipt.outcome).toBe('NOT_CONFIGURED');
    expect(receipt.evidence).toBeNull();
  });
});