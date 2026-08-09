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
