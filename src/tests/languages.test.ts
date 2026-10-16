import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, getLanguageOption, POPULAR_LANGUAGE_CODES } from '../utils/languages';

describe('Multi-Language Protocols & Definitions', () => {
  it('should have supported languages with mandatory properties', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(15);

    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
      expect(lang.flag).toBeTruthy();
      expect(lang.geminiPromptDesc).toBeTruthy();
      expect(lang.samplePhrase).toBeTruthy();
    });
  });

  it('should find exact language matches with getLanguageOption', () => {
    const en = getLanguageOption('en-US');
    expect(en.code).toBe('en-US');
    expect(en.name).toContain('English');

    const hi = getLanguageOption('hi-IN');
    expect(hi.code).toBe('hi-IN');
    expect(hi.nativeName).toContain('हिन्दी');

    const es = getLanguageOption('es-ES');
    expect(es.code).toBe('es-ES');
    expect(es.nativeName).toBe('Español');
  });

  it('should find prefix matches if region is omitted', () => {
    const fr = getLanguageOption('fr');
    expect(fr.code).toBe('fr-FR');

    const de = getLanguageOption('de');
    expect(de.code).toBe('de-DE');

    const ja = getLanguageOption('ja');
    expect(ja.code).toBe('ja-JP');
  });

  it('should handle fallback for unknown custom language codes gracefully', () => {
    const custom = getLanguageOption('xx-YY');
    expect(custom.code).toBe('xx-YY');
    expect(custom.flag).toBe('🌐');
  });

  it('should default to en-US if code is undefined or empty', () => {
    const empty = getLanguageOption();
    expect(empty.code).toBe('en-US');
  });

  it('should contain key popular language codes in POPULAR_LANGUAGE_CODES', () => {
    expect(POPULAR_LANGUAGE_CODES).toContain('en-US');
    expect(POPULAR_LANGUAGE_CODES).toContain('hi-IN');
    expect(POPULAR_LANGUAGE_CODES).toContain('es-ES');
    expect(POPULAR_LANGUAGE_CODES).toContain('fr-FR');
    expect(POPULAR_LANGUAGE_CODES).toContain('de-DE');
  });
});
