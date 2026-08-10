import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCardHTML } from '../assets/js/render.js';

/**
 * Guards the document structure.
 *
 * A landmark is not something a browser complains about when it goes missing:
 * the page renders identically either way, and only a screen reader user finds
 * out. So the shape of index.html is asserted here, read as text, the same way
 * tokens.test.js guards where colour is allowed to live.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const stylesCss = read('../styles.css');
const scriptJs = read('../script.js');

/**
 * index.html with its comments stripped.
 *
 * The comments in that file discuss the very elements these tests count — a
 * note explaining why `<main>` wraps both views would otherwise be counted as
 * a second `<main>`.
 */
const indexHtml = read('../index.html').replace(/<!--[\s\S]*?-->/g, '');

describe('landmarks', () => {
    it.each([
        ['header', /<header[\s>]/],
        ['main', /<main[\s>]/],
        ['search', /<search[\s>]/]
    ])('exposes exactly one %s landmark', (_name, pattern) => {
        const matches = indexHtml.match(new RegExp(pattern, 'g')) ?? [];
        expect(matches).toHaveLength(1);
    });

    // Two navs — carousel and pagination — so each needs its own name or a
    // screen reader announces "navigation" twice with no way to tell them apart.
    it('names every nav', () => {
        const navs = [...indexHtml.matchAll(/<nav([^>]*)>/g)].map((match) => match[1]);

        expect(navs.length).toBeGreaterThanOrEqual(2);
        for (const attributes of navs) {
            expect(attributes).toMatch(/aria-label="[^"]+"/);
        }
    });

    it('names the search landmark, since there is other filtering on the page', () => {
        expect(indexHtml).toMatch(/<search[^>]*aria-label="[^"]+"/);
    });

    it('leaves no top-level div container behind', () => {
        // The three that remain are inside a landmark: the status banner and
        // the two view wrappers. What must not survive is a div standing in
        // for a landmark.
        expect(indexHtml).not.toMatch(/<div class="header"/);
        expect(indexHtml).not.toMatch(/<div class="controls"/);
    });
});

describe('the skip link', () => {
    it('is the first focusable element and points at main', () => {
        const skip = indexHtml.match(/<a class="skip-link" href="#([^"]+)"/);

        expect(skip).not.toBeNull();
        expect(indexHtml).toMatch(new RegExp(`<main id="${skip[1]}"`));
    });

    it('comes before the header in source order', () => {
        expect(indexHtml.indexOf('skip-link')).toBeLessThan(indexHtml.indexOf('<header'));
    });

    // Hidden by transform rather than display:none — a skip link that is not
    // in the tab order is not a skip link.
    it('is revealed on focus rather than removed from the page', () => {
        expect(stylesCss).toMatch(/\.skip-link:focus-visible\s*{/);
        expect(stylesCss).not.toMatch(/\.skip-link\s*{[^}]*display:\s*none/);
    });
});

describe('the card lists', () => {
    it('renders both views as real lists', () => {
        expect(indexHtml).toMatch(/<ul class="carousel-stage"/);
        expect(indexHtml).toMatch(/<ul class="card-grid"/);
    });

    it('strips the list styling that comes with them', () => {
        expect(stylesCss).toMatch(/\.carousel-stage,\s*\n\.card-grid\s*{[^}]*list-style:\s*none/);
    });

    // A <div> child of a <ul> is invalid and drops out of the list as far as
    // assistive technology is concerned — including the empty state, which is
    // the one message that must not be missed.
    it('builds every card as an li', () => {
        expect(scriptJs).toMatch(/createElement\('li'\);[\s\S]{0,200}?carousel-card/);
        expect(scriptJs).toMatch(/createElement\('li'\);[\s\S]{0,200}?'grid-card'/);
        expect(scriptJs).not.toMatch(/createElement\('div'\);[\s\S]{0,200}?'grid-card'/);
    });

    it('wraps the empty state in a list item in both views', () => {
        // buildEmptyStateItem is the only thing either renderer may append —
        // the unwrapped block is a div, which is invalid inside a ul.
        expect(scriptJs).toMatch(/function buildEmptyStateItem\(\)/);
        expect(scriptJs).toMatch(/stage\.appendChild\(buildEmptyStateItem\(\)\)/);
        expect(scriptJs).toMatch(/const empty = buildEmptyStateItem\(\)/);
        expect(scriptJs).not.toMatch(/stage\.appendChild\(buildEmptyState\(\)\)/);
    });
});

describe('the heading outline', () => {
    it('has one h1', () => {
        expect(indexHtml.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    });

    it('gives each view an h2, so cards do not jump from h1 to h3', () => {
        const h2s = indexHtml.match(/<h2[^>]*>/g) ?? [];
        expect(h2s).toHaveLength(2);
        for (const heading of h2s) {
            expect(heading).toMatch(/visually-hidden/);
        }
    });

    it('renders a card name as an h3 rather than a styled div', () => {
        const html = buildCardHTML({ name: 'Dark Magician', type: 'monster', rarity: 'ultra' });

        expect(html).toMatch(/<h3 class="card-name">Dark Magician<\/h3>/);
        expect(html).not.toMatch(/<div class="card-name"/);
    });

    it('still escapes a hostile name now that it sits in a heading', () => {
        const html = buildCardHTML({ name: '<img src=x onerror="alert(1)">', type: 'spell' });

        expect(html).toContain('&lt;img src=x');
        expect(html).not.toContain('<img src=x');
    });
});

describe('visually-hidden', () => {
    it('keeps hidden text in the accessibility tree', () => {
        const rule = stylesCss.match(/\.visually-hidden\s*{([^}]*)}/);

        expect(rule).not.toBeNull();
        // display:none and visibility:hidden both remove the element from the
        // tree, which would silently undo every use of this class.
        expect(rule[1]).not.toMatch(/display:\s*none/);
        expect(rule[1]).not.toMatch(/visibility:\s*hidden/);
        expect(rule[1]).toMatch(/clip-path/);
    });
});
