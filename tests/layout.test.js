import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the card geometry.
 *
 * Card art is 59mm x 86mm. Once a fixed pixel height creeps back onto the art
 * box, the frame stops matching the artwork and letterboxes it at some
 * viewport, which is exactly what these assertions exist to catch.
 */

const stylesCss = readFileSync(
    fileURLToPath(new URL('../styles.css', import.meta.url)),
    'utf8'
);

/** Every declaration block whose selector list mentions .card-image-area. */
const cardImageAreaBlocks = () =>
    [...stylesCss.matchAll(/([^{}]*\.card-image-area[^{}]*){([^}]*)}/g)]
        .map((match) => ({ selector: match[1].trim(), body: match[2] }));

describe('card art geometry', () => {
    it('sets the true 59:86 card ratio on the art box', () => {
        expect(stylesCss).toMatch(/\.card-image-area\s*{[^}]*aspect-ratio:\s*59\s*\/\s*86/);
    });

    it('pins no fixed height on the art box at any breakpoint', () => {
        const offenders = cardImageAreaBlocks()
            .filter(({ body }) => /(^|[^-])height:\s*[\d.]+(px|rem|em|vh)/.test(body))
            .map(({ selector }) => selector);

        expect(offenders).toEqual([]);
    });

    it('derives the carousel card height from the width rather than typing it', () => {
        expect(stylesCss).toMatch(/--card-height:\s*calc\(var\(--card-width\)\s*\*\s*86\s*\/\s*59/);
    });

    it('derives the stage and container heights from the card height', () => {
        expect(stylesCss).toMatch(/--stage-height:\s*calc\(var\(--card-height\)/);
        expect(stylesCss).toMatch(/--container-height:\s*calc\(var\(--card-height\)/);
    });

    it('caps the card against the viewport so it never grows taller than the screen', () => {
        expect(stylesCss).toMatch(/--card-max-height:\s*\d+vh/);

        // Every width declaration must pass through the cap, or a breakpoint
        // could reintroduce a card taller than the viewport.
        const widths = [...stylesCss.matchAll(/--card-width:\s*([^;]+);/g)].map((m) => m[1]);
        expect(widths.length).toBeGreaterThan(0);
        for (const width of widths) {
            expect(width).toContain('var(--card-width-cap)');
        }
    });
});

/*
 * Guards the two badges on the card art from overlapping.
 *
 * "Prismatic Secret Rare" is a real Airtable rarity option (see
 * RARITY_LABELS in assets/js/render.js) and it is wider than half the card
 * at every card width below ~320px, which the carousel and grid both fall
 * to on phones and on the 641-900px tablet band. A fixed `left: 15px` /
 * `right: 15px` pair, each sized to its own content with no shrink
 * mechanism, collides in the middle at those widths. The flex layout in
 * styles.css (.card-badges) fixes this structurally rather than by
 * breakpoint arithmetic; these assertions are what stop that structure
 * being quietly reverted to the two-absolute-badges shape that overlapped.
 */
describe('card badge layout', () => {
    /**
     * The declaration body of a single selector block, e.g. ".card-badges".
     * Matches only a standalone rule: requiring `{` immediately after the
     * selector (modulo whitespace) is what stops ".rarity-badge" here from
     * also matching inside the shared ".rarity-badge,\n.edition-badge {"
     * selector list further up the file.
     */
    const declarationsFor = (selector) => {
        const pattern = new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*{([^}]*)}`);
        const match = stylesCss.match(pattern);
        expect(match, `expected a standalone rule for ${selector}`).not.toBeNull();
        return match[1];
    };

    it('lays the badges out with flex, so they only shrink relative to each other when they must', () => {
        expect(declarationsFor('.card-badges')).toMatch(/display:\s*flex/);
    });

    it('reserves a minimum gap between the two badges even when both are maxed out', () => {
        expect(declarationsFor('.card-badges')).toMatch(/gap:\s*\S/);
    });

    it('pins the rarity badge to the right via margin, not a fixed position, so it works with or without an edition badge', () => {
        expect(declarationsFor('.rarity-badge')).toMatch(/margin-left:\s*auto/);
    });

    // The rarity badge kept the truncation it was given when it shared the row
    // with the edition marker. It still needs it on its own: "Prismatic Secret
    // Rare" is wider than a card below about 320px whether or not anything
    // else is beside it.
    it('lets the rarity badge truncate rather than overflow its card', () => {
        const rarity = declarationsFor('.rarity-badge');

        expect(rarity).toMatch(/min-width:\s*0/);
        expect(rarity).toMatch(/overflow:\s*hidden/);
        expect(rarity).toMatch(/text-overflow:\s*ellipsis/);
        expect(rarity).toMatch(/white-space:\s*nowrap/);
    });

    // The marker moved off the art and onto the card-type row, where the
    // pressure is reversed: the type text is the part that gives way, and the
    // marker must not, because "1st Edi…" is worse than no marker.
    it('lets the card type truncate and holds the edition marker at full width', () => {
        const cardType = declarationsFor('.card-type');
        const typeText = declarationsFor('.card-type-text');
        const edition = declarationsFor('.edition-badge');

        expect(cardType).toMatch(/display:\s*flex/);
        expect(cardType).toMatch(/justify-content:\s*space-between/);
        expect(cardType).toMatch(/gap:\s*\S/);

        expect(typeText).toMatch(/min-width:\s*0/);
        expect(typeText).toMatch(/text-overflow:\s*ellipsis/);

        expect(edition).toMatch(/flex:\s*none/);
        expect(edition).toMatch(/white-space:\s*nowrap/);
    });

    // It no longer sits over card art, so it no longer needs the scrim the
    // rarity badge has. Keeping it would be a floating panel on a flat surface.
    it('drops the overlay background now the marker is off the art', () => {
        expect(declarationsFor('.edition-badge')).not.toMatch(/background:\s*var\(--overlay\)/);
        expect(declarationsFor('.rarity-badge')).toMatch(/background:\s*var\(--overlay\)/);
    });

    it('does not position either marker with a fixed left or right offset', () => {
        // A fixed offset on the badge itself is what caused the original
        // overlap: it sizes to its own content with no regard for anything
        // else. Positioning belongs to the container in both rows now.
        expect(declarationsFor('.rarity-badge')).not.toMatch(/\bright:\s*\d/);
        expect(declarationsFor('.edition-badge')).not.toMatch(/\bleft:\s*\d/);
        expect(declarationsFor('.edition-badge')).not.toMatch(/position:\s*absolute/);
    });
});
