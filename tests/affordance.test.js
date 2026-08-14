import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the rule that a pointer cursor means a real control.
 *
 * A `cursor: pointer` on an element with no handler is an affordance that
 * lies: it promises an action to a mouse user that never happens, and it
 * promises nothing at all to a keyboard user, because a cursor is not an
 * interaction. The grid card carried exactly that for several PRs.
 *
 * Read as text, like motion.test.js and tokens.test.js — this is a property of
 * what the stylesheet says, and a browser renders the lie perfectly happily.
 * There is no DOM test environment here, so the pairing of a selector to a
 * handler is asserted by keeping the allowlist below in step with the markup
 * and the script, not by clicking anything.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const stylesCss = read('../styles.css');
const scriptJs = read('../script.js');
const indexHtml = read('../index.html');

/**
 * Selectors allowed to carry `cursor: pointer`.
 *
 * Each one is a real control — a <button>, or the <label> of a checkbox, which
 * a browser makes clickable and focusable through the input it wraps. The
 * comment records where the behaviour lives, so a selector cannot be added
 * here without naming the handler that justifies it.
 */
const interactive_selectors = new Map([
    ['.empty-state-action', 'button built in script.js buildEmptyStateItem'],
    ['.facet-btn', 'button built in script.js renderFacetControls'],
    ['.facet-option', 'label wrapping the facet checkbox, script.js renderFacetOptions'],
    ['.chip', 'button built in script.js renderChips'],
    ['.clear-btn', 'button in index.html, clearFilters'],
    ['.refresh-btn', 'button in index.html, handler in script.js'],
    ['.view-btn', 'button in index.html, handler in script.js'],
    ['.carousel-card-action', 'button built in script.js buildCarouselCardAction'],
    ['.nav-btn', 'button in index.html, prevBtn and nextBtn'],
    ['.page-btn', 'button in index.html, prevPage and nextPage']
]);

/**
 * Every selector whose rule block declares `cursor: pointer`.
 *
 * Splits on the closing brace and keeps the blocks that declare it, so a
 * declaration is attributed to the selector that actually owns it rather than
 * to whichever selector happens to sit above it in the file.
 *
 * @returns {string[]} one entry per selector, comma-separated groups split out
 */
const pointer_selectors = () => {
    const blocks = stylesCss.split('}');
    const selectors = [];

    for (const block of blocks) {
        const brace = block.indexOf('{');
        if (brace === -1) continue;

        const body = block.slice(brace + 1);
        if (!/cursor:\s*pointer\s*;/.test(body)) continue;

        // Strip comments before reading the selector: a block preceded by a
        // /* ... */ comment carries it in the same chunk.
        const head = block.slice(0, brace).replace(/\/\*[\s\S]*?\*\//g, '');
        for (const selector of head.split(',')) {
            const trimmed = selector.trim();
            if (trimmed !== '') selectors.push(trimmed);
        }
    }

    return selectors;
};

describe('pointer cursors', () => {
    it('declares some, so the assertions below are not vacuous', () => {
        expect(pointer_selectors().length).toBeGreaterThan(0);
    });

    it('puts one only on a selector backed by a real control', () => {
        const offenders = pointer_selectors().filter(
            (selector) => !interactive_selectors.has(selector)
        );
        expect(offenders).toEqual([]);
    });

    it('keeps the allowlist honest by requiring each entry to be used', () => {
        const used = new Set(pointer_selectors());
        const unused = [...interactive_selectors.keys()].filter(
            (selector) => !used.has(selector)
        );
        expect(unused).toEqual([]);
    });
});

describe('the grid card', () => {
    /** The `.grid-card { ... }` block on its own, comments excluded. */
    const grid_card_block = () => {
        const match = stylesCss.match(/(^|\n)\.grid-card\s*\{([^}]*)\}/);
        expect(match).not.toBeNull();
        return match[2];
    };

    it('carries no pointer cursor, because it has no action', () => {
        expect(grid_card_block()).not.toMatch(/cursor:/);
    });

    it('has no click handler anywhere, which is what makes that correct', () => {
        // If one is ever added, this fails and the affordance has to come back
        // together with a focusable control — the two travel as a pair.
        expect(scriptJs).not.toMatch(/grid-?[Cc]ard[\s\S]{0,200}addEventListener\('click'/);
    });

    it('creates a plain li with no tab stop, so the tab order holds no dead ends', () => {
        const creation = scriptJs.match(/cardEl\.className = 'grid-card';[\s\S]{0,200}/);
        expect(creation).not.toBeNull();
        expect(creation[0]).not.toMatch(/tabIndex|tabindex|role\s*=/);
    });

    it('still answers hover, so the grid does not go flat', () => {
        expect(stylesCss).toMatch(/\.grid-card:hover\s*\{[^}]*transform:\s*translateY\(/);
    });
});

describe('the focus ring', () => {
    it('is declared globally rather than control by control', () => {
        expect(stylesCss).toMatch(/(^|\n):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
    });

    it('is never removed without a replacement', () => {
        expect(stylesCss).not.toMatch(/outline:\s*(none|0)\s*;/);
    });

    it('offsets the ring so it clears the element it traces', () => {
        expect(stylesCss).toMatch(/(^|\n):focus-visible\s*\{[^}]*outline-offset:/);
    });
});

describe('every control in the markup', () => {
    /** Every <button> in index.html, with its attributes. */
    const buttons = () => [...indexHtml.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);

    it('declares a button type, so none of them submits anything', () => {
        expect(buttons().length).toBeGreaterThan(0);
        for (const button of buttons()) {
            expect(button).toMatch(/type="button"/);
        }
    });

    it('never carries a positive tabindex, which would reorder the tab sequence', () => {
        const offenders = [...indexHtml.matchAll(/tabindex="([^"]+)"/g)]
            .map((m) => m[1])
            .filter((value) => Number(value) > 0);
        expect(offenders).toEqual([]);
    });
});
