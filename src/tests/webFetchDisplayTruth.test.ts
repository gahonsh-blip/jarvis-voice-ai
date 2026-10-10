import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  webFetchDisplayTitle,
  webFetchSuccessNotice,
  NO_WEB_TITLE_OBSERVED_LABEL,
} from '../utils/hardening/webFetchDisplayTruth';

// Item 13 ("zero fake success"). `realWebFetch` refuses a page that exposed
// nothing, but a *successful* fetch may still have no observed title (the page
// carried readable body text and no <title>/og:title). The Tools HUD used to
// render that undefined title directly, so it drew a blank title bar and said
// `Successfully fetched and cleaned "undefined"`. These cases pin the honest
// labels and forbid a return to the raw render.

const source = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

describe('Item 13 — a fetched page with no observed title is named, never rendered blank', () => {
  it('returns the observed title when the page supplied one', () => {
    expect(webFetchDisplayTitle('Example Domain')).toBe('Example Domain');
    expect(webFetchDisplayTitle('  Padded Title  ')).toBe('Padded Title');
  });

  it('names the missing title instead of an empty string or "undefined"', () => {
    for (const missing of [undefined, null, '', '   ', 42, {}]) {
      const label = webFetchDisplayTitle(missing);
      expect(label).toBe(NO_WEB_TITLE_OBSERVED_LABEL);
      expect(label.toLowerCase()).not.toContain('undefined');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('the success notice never quotes an invented or undefined title', () => {
    expect(webFetchSuccessNotice('Real Page')).toBe('Fetched and cleaned "Real Page"');
    const notice = webFetchSuccessNotice(undefined);
    expect(notice).not.toContain('undefined');
    expect(notice).not.toContain('""');
    expect(notice).toContain('no title');
  });

  it('the modal routes the title and feedback through the helper (source guard)', () => {
    const modal = source('src/components/AutonomousToolsModal.tsx');
    expect(modal).toContain('webFetchDisplayTitle(webResult.title)');
    expect(modal).toContain('webFetchSuccessNotice(data.title)');
    // The pre-fix renders must be gone.
    expect(modal).not.toContain('{webResult.title}');
    expect(modal).not.toContain('Successfully fetched and cleaned "${data.title}"');
  });
});
