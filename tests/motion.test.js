import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the motion rules.
 *
 * Read as text, like tokens.test.js, because these are properties of what the
 * stylesheet says rather than of what a browser computes. Nothing else in the
 * repo notices when a `transition: all` or a hard-coded duration creeps back
 * in — a browser renders both perfectly happily.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const stylesCss = read('../styles.css');
const tokensCss = read('../assets/css/tokens.css');

/** Every transition declaration in the stylesheet, whitespace collapsed. */
const transitions = () =>
    [...stylesCss.matchAll(/transition:\s*([^;]+);/g)].map((match) =>
        match[1].replace(/\s+/g, ' ').trim()
    );

describe('transitions', () => {
    it('declares at least one, so the assertions below are not vacuous', () => {
        expect(transitions().length).toBeGreaterThan(0);
    });

    // `all` animates layout properties too, forcing a reflow on every hover.
    it('never uses the all keyword', () => {
        const offenders = transitions().filter((value) => /^all\b/.test(value));
        expect(offenders).toEqual([]);
    });

    it('drives every duration from a token rather than a literal', () => {
        const literal = transitions().filter((value) => /\d+(\.\d+)?m?s/.test(value));
        expect(literal).toEqual([]);
    });

    it('uses only the two declared durations', () => {
        for (const value of transitions()) {
            const durations = [...value.matchAll(/var\((--duration-[a-z]+)\)/g)].map((m) => m[1]);
            expect(durations.length).toBeGreaterThan(0);
            for (const duration of durations) {
                expect(['--duration-state', '--duration-view']).toContain(duration);
            }
        }
    });

    it('eases everything the same way', () => {
        for (const value of transitions()) {
            expect(value).toContain('var(--ease-out)');
        }
    });

    it('keeps state changes inside the 120-200ms the design rules ask for', () => {
        const state = tokensCss.match(/--duration-state:\s*(\d+)ms/);
        expect(state).not.toBeNull();
        expect(Number(state[1])).toBeGreaterThanOrEqual(120);
        expect(Number(state[1])).toBeLessThanOrEqual(200);
    });

    it('keeps the view transition inside the 300-400ms the card asks for', () => {
        const view = tokensCss.match(/--duration-view:\s*(\d+)ms/);
        expect(view).not.toBeNull();
        expect(Number(view[1])).toBeGreaterThanOrEqual(300);
        expect(Number(view[1])).toBeLessThanOrEqual(400);
    });
});

describe('animations', () => {
    // The float animation was applied to .card-image-area but built from the
    // parent card's transform, so the art drifted inside its own overflow
    // clip. The owner asked for it gone; this stops it coming back.
    it('declares no keyframes at all', () => {
        expect(stylesCss).not.toMatch(/@keyframes/);
    });

    it('applies no animation property', () => {
        expect(stylesCss).not.toMatch(/\banimation\s*:/);
    });

    // An idle infinite animation is one of the named tells in CLAUDE.md §4.
    it('runs nothing on a loop', () => {
        expect(stylesCss).not.toMatch(/\binfinite\b/);
    });
});

/**
 * Reduced motion.
 *
 * The OS setting is the one accessibility signal a browser hands over
 * directly, and the stylesheet had no answer for it at all — eleven
 * transitions and four hover transforms ran regardless of what the user had
 * asked their machine for.
 *
 * Checked as text for the same reason the rest of this file is: nothing here
 * is about how a browser computes a value, and a media query that stops
 * matching would not fail anything else.
 */
describe('prefers-reduced-motion', () => {
    /** The body of the reduced-motion query in a stylesheet, or null. */
    const reducedMotionBlock = (css) => {
        const start = css.search(/@media \(prefers-reduced-motion: reduce\)/);
        if (start === -1) return null;

        // Walk the braces rather than matching a fixed shape: the block holds
        // nested rules, which a lazy regex would cut short at the first }.
        let depth = 0;
        for (let index = css.indexOf('{', start); index < css.length; index += 1) {
            if (css[index] === '{') depth += 1;
            if (css[index] === '}') {
                depth -= 1;
                if (depth === 0) return css.slice(start, index + 1);
            }
        }

        return null;
    };

    it('is answered by the token layer', () => {
        expect(reducedMotionBlock(tokensCss)).not.toBeNull();
    });

    it('collapses both durations, so every transition is covered at once', () => {
        const block = reducedMotionBlock(tokensCss);

        for (const name of ['--duration-state', '--duration-view']) {
            const value = block.match(new RegExp(`${name}:\\s*([\\d.]+)ms`));
            expect(value).not.toBeNull();
            expect(Number(value[1])).toBeLessThan(1);
        }
    });

    // Zero never fires transitionend, so anything waiting on one would hang.
    it('collapses to a fraction of a millisecond rather than to zero', () => {
        const block = reducedMotionBlock(tokensCss);
        expect(block).not.toMatch(/--duration-[a-z]+:\s*0m?s/);
    });

    it('drops the hover transforms that would otherwise jump instantly', () => {
        const block = reducedMotionBlock(stylesCss);
        expect(block).not.toBeNull();
        expect(block).toMatch(/transform:\s*none/);

        for (const selector of ['.nav-btn:hover', '.page-btn:hover', '.grid-card:hover']) {
            expect(block).toContain(selector);
        }
    });

    // The carousel's transforms place the cards; without them five cards stack
    // on one spot. Reduced motion asks for less movement, not a broken layout.
    it('leaves the carousel positioning transforms alone', () => {
        const block = reducedMotionBlock(stylesCss);
        for (const selector of ['.pos-left', '.pos-right', '.pos-center']) {
            expect(block).not.toContain(selector);
        }
    });

    it('never uses the no-preference form, which fails closed on old engines', () => {
        // An engine that does not know the feature matches neither branch, so
        // wrapping motion in no-preference would silently remove it for
        // everyone on that engine. reduce is the additive form.
        expect(tokensCss).not.toMatch(/prefers-reduced-motion:\s*no-preference/);
        expect(stylesCss).not.toMatch(/prefers-reduced-motion:\s*no-preference/);
    });
});
