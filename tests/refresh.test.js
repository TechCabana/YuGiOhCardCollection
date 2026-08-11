import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cacheBustedUrl, formatUpdatedAt, DATA_URL } from '../assets/js/data.js';
import { pruneSelection } from '../assets/js/facets.js';

/**
 * Covers the refresh button's logic.
 *
 * The two things that would make it look broken are both here: a cache-busted
 * URL that is not actually busting the cache, and a filter selection left
 * pointing at data that no longer exists, which empties the page with no
 * explanation.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const indexHtml = read('../index.html').replace(/<!--[\s\S]*?-->/g, '');
const scriptJs = read('../script.js');

describe('cacheBustedUrl', () => {
    it('stamps the data URL with the current second', () => {
        expect(cacheBustedUrl(1_700_000_000_000)).toBe(`${DATA_URL}?t=1700000000`);
    });

    // A random value would mean two clicks a moment apart fetch twice. Second
    // resolution makes a repeated click hit the browser cache instead.
    it('gives the same URL twice within one second', () => {
        expect(cacheBustedUrl(1_700_000_000_000)).toBe(cacheBustedUrl(1_700_000_000_999));
    });

    it('gives a different URL once the second rolls over', () => {
        expect(cacheBustedUrl(1_700_000_000_999)).not.toBe(cacheBustedUrl(1_700_000_001_000));
    });

    it('appends rather than replaces an existing query string', () => {
        expect(cacheBustedUrl(1_700_000_000_000, 'data/cards.json?v=2'))
            .toBe('data/cards.json?v=2&t=1700000000');
    });
});

describe('formatUpdatedAt', () => {
    it('formats local time zero-padded', () => {
        const morning = new Date(2026, 7, 11, 9, 5);
        expect(formatUpdatedAt(morning)).toBe('Updated 09:05');
    });

    it('uses a 24-hour clock', () => {
        expect(formatUpdatedAt(new Date(2026, 7, 11, 18, 30))).toBe('Updated 18:30');
    });

    it('returns an empty string rather than "Invalid Date"', () => {
        expect(formatUpdatedAt(new Date('nonsense'))).toBe('');
        expect(formatUpdatedAt('not a date')).toBe('');
        expect(formatUpdatedAt(null)).toBe('');
    });
});

describe('pruneSelection', () => {
    const cards = [
        { type: 'monster', attribute: 'Earth', level: 4, cardType: 'Insect / Effect', serial: 'SDJ-017' },
        { type: 'monster', attribute: 'Dark', level: 3, cardType: 'Fiend / Effect', serial: 'LOB-005' }
    ];

    it('keeps values the collection can still satisfy', () => {
        expect(pruneSelection({ attribute: ['Earth', 'Dark'] }, cards))
            .toEqual({ attribute: ['Earth', 'Dark'] });
    });

    // The case the refresh button creates: the last Water card leaves the
    // collection while a Water chip is still in the tray.
    it('drops a value no card carries any more', () => {
        expect(pruneSelection({ attribute: ['Earth', 'Water'] }, cards))
            .toEqual({ attribute: ['Earth'] });
    });

    it('drops the facet entirely when nothing of it survives', () => {
        expect(pruneSelection({ attribute: ['Water'] }, cards)).toEqual({});
    });

    // Only impossible values go. Earth plus level 3 currently returns nothing,
    // but removing either filter brings the other back, so both are kept.
    it('keeps a value that is merely empty in combination', () => {
        const selection = { attribute: ['Earth'], level: ['3'] };
        expect(pruneSelection(selection, cards)).toEqual(selection);
    });

    it('drops a facet key that no longer exists', () => {
        expect(pruneSelection({ nonsense: ['x'], attribute: ['Earth'] }, cards))
            .toEqual({ attribute: ['Earth'] });
    });

    it('returns an empty selection for empty input', () => {
        expect(pruneSelection({}, cards)).toEqual({});
        expect(pruneSelection()).toEqual({});
    });

    it('drops everything against an empty collection', () => {
        expect(pruneSelection({ attribute: ['Earth'] }, [])).toEqual({});
    });
});

describe('the refresh control', () => {
    it('is in the served markup with its timestamp region', () => {
        expect(indexHtml).toMatch(/<button class="refresh-btn" type="button" id="refreshBtn">/);
        expect(indexHtml).toMatch(/id="refreshStamp" aria-live="polite"/);
    });

    it('fetches through the cache-busted URL rather than the plain one', () => {
        expect(scriptJs).toMatch(/loadCards\(cacheBustedUrl\(\)\)/);
    });

    // Double-clicking must not start a second fetch: the guard is the disabled
    // flag, and it has to be cleared in a finally or a failed refresh would
    // leave the button dead for the rest of the session.
    it('disables while in flight and re-enables whatever happens', () => {
        expect(scriptJs).toMatch(/if \(button\.disabled\) return;/);
        expect(scriptJs).toMatch(/button\.disabled = true;/);
        expect(scriptJs).toMatch(/finally \{\s*button\.disabled = false;/);
    });

    it('prunes the selection against the new data', () => {
        expect(scriptJs).toMatch(/activeFacets = pruneSelection\(activeFacets, allCards\)/);
    });

    // The user's context is the whole point: a refresh that reset the filters
    // would be a page reload with extra steps.
    it('resets neither the filters, the search term nor the view', () => {
        const refresh = scriptJs.match(/async function refreshCollection\(\)[\s\S]*?\n\}/)?.[0] ?? '';

        expect(refresh).not.toMatch(/activeFacets = \{\}/);
        expect(refresh).not.toMatch(/searchQuery = ''/);
        expect(refresh).not.toMatch(/currentView =/);
    });

    it('keeps the loaded cards when the refresh fails', () => {
        const refresh = scriptJs.match(/async function refreshCollection\(\)[\s\S]*?\n\}/)?.[0] ?? '';

        // allCards is assigned only after the fetch has resolved and been
        // checked, so a throw anywhere before that leaves it untouched.
        const assignment = refresh.indexOf('allCards = cards');
        const guard = refresh.indexOf('came back empty');

        expect(guard).toBeGreaterThan(-1);
        expect(assignment).toBeGreaterThan(guard);
    });
});
