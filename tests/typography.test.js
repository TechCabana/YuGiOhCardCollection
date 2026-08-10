import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the type system.
 *
 * Two different failures are covered here. One is drift — a raw `0.85rem`
 * creeping back in beside the scale. The other is a broken deploy: a font
 * referenced but not committed, or preloaded from a path that does not match
 * the @font-face, fails in a way local development never shows, because the
 * fallback renders perfectly well.
 */

const path = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const read = (relativePath) => readFileSync(path(relativePath), 'utf8');

const stylesCss = read('../styles.css');
const tokensCss = read('../assets/css/tokens.css');
const indexHtml = read('../index.html');

/** The @font-face block, which is exempt from the no-literals rules below. */
const fontFace = stylesCss.match(/@font-face\s*{[^}]*}/)?.[0] ?? '';
const stylesWithoutFontFace = stylesCss.replace(/@font-face\s*{[^}]*}/g, '');

describe('the font file', () => {
    const fontPath = '../assets/fonts/instrument-sans-latin-var.woff2';

    it('is committed rather than only referenced', () => {
        expect(existsSync(path(fontPath))).toBe(true);
    });

    it('is a real woff2 payload', () => {
        const bytes = readFileSync(path(fontPath));
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('wOF2');
    });

    // A latin subset of a variable face is tens of kilobytes. A full face with
    // every script is several times that, and would mean the subset step was
    // skipped.
    it('stays small enough to be worth preloading', () => {
        expect(statSync(path(fontPath)).size).toBeLessThan(80_000);
    });

    it('ships its licence beside it', () => {
        expect(existsSync(path('../assets/fonts/OFL.txt'))).toBe(true);
    });
});

describe('@font-face', () => {
    it('is declared once, self-hosted', () => {
        expect(fontFace).not.toBe('');
        expect(fontFace).toMatch(/url\('assets\/fonts\/[^']+\.woff2'\)/);
    });

    // The whole reason not to link Google Fonts: a third-party request before
    // any text can paint, and another origin learning who reads the page.
    it('fetches from no external origin', () => {
        expect(stylesCss).not.toMatch(/fonts\.googleapis\.com/);
        expect(stylesCss).not.toMatch(/fonts\.gstatic\.com/);
        expect(indexHtml).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    });

    it('swaps rather than hiding text while the font loads', () => {
        expect(fontFace).toMatch(/font-display:\s*swap/);
    });

    it('declares the variable weight range the tokens rely on', () => {
        expect(fontFace).toMatch(/font-weight:\s*400 700/);
    });

    it('carries a unicode-range, so the subset is actually scoped', () => {
        expect(fontFace).toMatch(/unicode-range:/);
    });
});

describe('the preload', () => {
    it('points at exactly the file @font-face asks for', () => {
        const preloaded = indexHtml.match(/<link rel="preload" href="([^"]+)"/)?.[1];
        const declared = fontFace.match(/url\('([^']+)'\)/)?.[1];

        expect(preloaded).toBe(declared);
    });

    // Fonts are fetched in CORS mode even same-origin. Without crossorigin the
    // preload is discarded and the file is fetched a second time.
    it('carries as, type and crossorigin', () => {
        const link = indexHtml.match(/<link rel="preload"[^>]*>/)?.[0] ?? '';

        expect(link).toMatch(/as="font"/);
        expect(link).toMatch(/type="font\/woff2"/);
        expect(link).toMatch(/crossorigin/);
    });
});

describe('the type scale', () => {
    it('declares every step it promises', () => {
        for (const step of ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl']) {
            expect(tokensCss).toMatch(new RegExp(`--text-${step}:\\s*[0-9.]+rem`));
        }
    });

    it('rises monotonically', () => {
        const steps = [...tokensCss.matchAll(/--text-[a-z0-9]+:\s*([0-9.]+)rem/g)].map((m) =>
            Number(m[1])
        );

        expect(steps.length).toBe(9);
        for (let i = 1; i < steps.length; i += 1) {
            expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        }
    });

    /**
     * Values of one property in styles.css, ignoring the @font-face block.
     *
     * The values are read out and inspected rather than matched with a
     * negative lookahead: `\s*` backtracks to zero width, so a lookahead after
     * it never sees the `var(` it is meant to exclude, and the assertion
     * silently passes on everything.
     */
    const valuesOf = (property) =>
        [...stylesWithoutFontFace.matchAll(new RegExp(`${property}:\\s*([^;]+);`, 'g'))].map(
            (match) => match[1].trim()
        );

    it('reads real declarations, so the assertions below are not vacuous', () => {
        expect(valuesOf('font-size').length).toBeGreaterThan(20);
    });

    it('sets no font-size outside the scale', () => {
        const literals = valuesOf('font-size').filter((value) => !value.startsWith('var(--text-'));
        expect(literals).toEqual([]);
    });

    it('sets no weight or tracking outside the tokens', () => {
        expect(
            valuesOf('font-weight').filter((value) => !value.startsWith('var(--weight-'))
        ).toEqual([]);
        expect(
            valuesOf('letter-spacing').filter((value) => !value.startsWith('var(--tracking-'))
        ).toEqual([]);
    });
});

describe('the family', () => {
    // The old stack was 'Segoe UI', Tahoma, ... — Windows-only, quietly
    // rendering as Tahoma everywhere else.
    it('names no platform-specific font as the primary face', () => {
        expect(stylesCss).not.toMatch(/Segoe UI/);
        expect(tokensCss).not.toMatch(/'Segoe UI',\s*Tahoma/);
    });

    it('sets the body face from the token', () => {
        expect(stylesCss).toMatch(/body\s*{[^}]*font-family:\s*var\(--font-sans\)/);
    });

    // Form controls do not inherit the page font, so a missing rule here means
    // every button silently renders in the browser's own UI font.
    it('makes buttons and inputs inherit it', () => {
        expect(stylesCss).toMatch(/button,\s*\n\s*input\s*{[^}]*font-family:\s*inherit/);
    });
});
