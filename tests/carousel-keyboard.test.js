import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getCarouselSlots } from '../assets/js/filters.js';

/**
 * Covers the carousel side cards being operable by keyboard.
 *
 * The bug was invisible by design: clicking a side card worked perfectly, so
 * nothing looked wrong unless you put the mouse down. These assertions are
 * about the shape of the control that replaced the bare onclick — a real
 * button, only on the cards that do something, with the card's heading left
 * outside it.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const scriptJs = read('../script.js');
const stylesCss = read('../styles.css');

/** The body of buildCarouselCardAction. */
const actionBuilder = scriptJs.match(/function buildCarouselCardAction[\s\S]*?\n\}/)?.[0] ?? '';

/** The body of updateCarousel. */
const updateCarousel = scriptJs.match(/function updateCarousel\(\)[\s\S]*?\n\}/)?.[0] ?? '';

describe('the side card control', () => {
    it('is a real button, not a div with a click handler', () => {
        expect(actionBuilder).toMatch(/createElement\('button'\)/);
        expect(actionBuilder).toMatch(/action\.type = 'button'/);
    });

    // Enter and Space come free with a button. Rebuilding them on a div is
    // where this kind of control usually goes wrong.
    it('reimplements no keyboard handling of its own', () => {
        expect(actionBuilder).not.toMatch(/keydown|keypress|tabindex|role/i);
    });

    it('carries an accessible name naming the card', () => {
        expect(actionBuilder).toMatch(/setAttribute\('aria-label', `Show \$\{card\?\.name/);
    });

    // The name comes from Airtable, so it goes through setAttribute rather
    // than being interpolated into markup.
    it('sets that name as an attribute rather than building markup', () => {
        expect(actionBuilder).not.toMatch(/innerHTML/);
    });

    it('moves focus somewhere real after the card it was on stops being a button', () => {
        expect(actionBuilder).toMatch(/getElementById\('nextBtn'\)\?\.focus\(\)/);
    });
});

describe('which cards get one', () => {
    it('gives the control to side cards only', () => {
        expect(updateCarousel).toMatch(/if \(!isCenter\) \{\s*cardEl\.appendChild\(buildCarouselCardAction/);
    });

    it('no longer hangs the behaviour off the card element itself', () => {
        expect(updateCarousel).not.toMatch(/cardEl\.onclick/);
    });

    // getCarouselSlots marks exactly one slot as the centre at any size, so
    // "everything except the centre" is a well-defined set rather than an
    // assumption about there being five cards.
    it.each([1, 2, 3, 4, 5, 12])('has exactly one non-actionable card among %i', (count) => {
        const cards = Array.from({ length: count }, (_, index) => ({ name: `Card ${index}` }));
        const slots = getCarouselSlots(cards, 0);

        expect(slots.filter((slot) => slot.isCenter)).toHaveLength(1);
        expect(slots.filter((slot) => !slot.isCenter)).toHaveLength(slots.length - 1);
    });
});

describe('how the control is styled', () => {
    const rule = stylesCss.match(/\.carousel-card-action \{([^}]*)\}/)?.[1] ?? '';

    it('covers the card without covering it up', () => {
        expect(rule).toMatch(/position:\s*absolute/);
        expect(rule).toMatch(/inset:\s*0/);
        expect(rule).toMatch(/background:\s*transparent/);
        expect(rule).toMatch(/border:\s*0/);
    });

    // Without its own focus style the ring would trace an invisible rectangle
    // and be clipped by the card's overflow: hidden.
    it('shows a focus ring inside the card', () => {
        const focusRule = stylesCss.match(/\.carousel-card-action:focus-visible \{([^}]*)\}/)?.[1] ?? '';

        expect(focusRule).toMatch(/outline:\s*2px solid var\(--accent\)/);
        expect(focusRule).toMatch(/outline-offset:\s*-\d/);
    });

    // The card is no longer the clickable thing, so it should not claim to be.
    it('moves the pointer cursor off the card and onto the control', () => {
        const cardRule = stylesCss.match(/\.carousel-card \{([^}]*)\}/)?.[1] ?? '';

        expect(cardRule).not.toMatch(/cursor:\s*pointer/);
        expect(rule).toMatch(/cursor:\s*pointer/);
    });
});

describe('the focus ring stays perceivable on a dimmed side card', () => {
    // pos-left/pos-right blur and fade the whole card, focus ring included —
    // `filter` composites an element's entire subtree before blurring it, so
    // a ring drawn at 30% opacity through a 3px blur would fail WCAG 2.4.11.
    // Both properties are lifted while the control inside is focus-visible.
    const undim = stylesCss.match(
        /\.carousel-card\.pos-left:has\(\.carousel-card-action:focus-visible\),\s*\.carousel-card\.pos-right:has\(\.carousel-card-action:focus-visible\)\s*\{([^}]*)\}/
    )?.[1] ?? '';

    it('restores full opacity', () => {
        expect(undim).toMatch(/opacity:\s*1/);
    });

    it('removes the blur', () => {
        expect(undim).toMatch(/filter:\s*none/);
    });
});
