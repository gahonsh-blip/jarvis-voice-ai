import { describe, it, expect } from 'vitest';
import {
  detectWakeWord,
  isBareWakeWord,
  wakePhrasesFor,
} from '../utils/voice/wakeWord';

describe('wakePhrasesFor', () => {
  it('includes recogniser mis-hearings for the default wake word', () => {
    const phrases = wakePhrasesFor('jarvis');
    expect(phrases).toContain('jarvis');
    expect(phrases).toContain('jarviz');
  });

  it('uses only the configured word when it is custom', () => {
    const phrases = wakePhrasesFor('hermes');
    expect(phrases).toEqual(['hermes']);
  });
});

describe('detectWakeWord', () => {
  it('detects the wake word and returns the command that followed', () => {
    const match = detectWakeWord('Jarvis, what is the battery level?');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('what is the battery level');
  });

  it('detects a mis-hearing', () => {
    const match = detectWakeWord('jarviz open notepad');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('open notepad');
  });

  it('accepts a greeting form', () => {
    const match = detectWakeWord('hey jarvis take a screenshot');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('take a screenshot');
  });

  it('detects a Hindi wake word', () => {
    const match = detectWakeWord('जार्विस स्क्रीनशॉट लो');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('स्क्रीनशॉट लो');
  });

  it('does not fire when the wake word is absent', () => {
    const match = detectWakeWord('what is the weather today');
    expect(match.detected).toBe(false);
    expect(match.command).toBe('');
  });

  it('does not fire on a word that merely contains the wake word', () => {
    const match = detectWakeWord('the jarviskian protocol is active');
    expect(match.detected).toBe(false);
  });

  it('returns an empty command for a bare wake word', () => {
    const match = detectWakeWord('jarvis');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('');
  });

  it('ignores a custom wake word when the default was configured', () => {
    expect(detectWakeWord('hermes do this').detected).toBe(false);
  });

  it('honours a configured custom wake word', () => {
    const match = detectWakeWord('hermes do this', 'hermes');
    expect(match.detected).toBe(true);
    expect(match.command).toBe('do this');
  });

  it('handles an empty transcript', () => {
    expect(detectWakeWord('').detected).toBe(false);
  });
});

describe('isBareWakeWord', () => {
  it('is true when only the wake word was spoken', () => {
    expect(isBareWakeWord('jarvis')).toBe(true);
  });

  it('is false when a command followed', () => {
    expect(isBareWakeWord('jarvis open chrome')).toBe(false);
  });

  it('is false when the wake word was absent', () => {
    expect(isBareWakeWord('open chrome')).toBe(false);
  });
});