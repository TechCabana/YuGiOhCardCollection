import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the token layer.
 *
 * The rule "colour lives in tokens.css and nowhere else" is only worth having
 * if something enforces it. These read the stylesheets as text, because the
 * property they check is about where values are written, not about how a
 * browser resolves them.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const tokensCss = read('../assets/css/tokens.css');
const stylesCss = read('../styles.css');

/** Custom properties declared by a stylesheet, e.g. `--accent`. */
const declaredProperties = (css) =>
    [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]);

/** Custom properties consumed by a stylesheet through var(). */
const referencedProperties = (css) =>
    [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]);

describe('tokens.css', () => {
    it('declares every token on :root', () => {
        expect(tokensCss).toMatch(/:root\s*{/);
        expect(declaredProperties(tokensCss).length).toBeGreaterThan(0);
    });

    it('declares no duplicate tokens', () => {
        const declared = declaredProperties(tokensCss);
        expect(declared.length).toBe(new Set(declared).size);
    });

    it('carries no token that styles.css never uses', () => {
        const referenced = new Set(referencedProperties(stylesCss));
        const unused = declaredProperties(tokensCss).filter((name) => !referenced.has(name));
        expect(unused).toEqual([]);
    });
});

/**
 * Relative luminance of an #rrggbb colour, per WCAG 2.1.
 *
 * @param {string} hex - a six-digit hex colour
 * @returns {number} relative luminance, 0 to 1
 */
const luminance = (hex) => {
    const channel = (value) => {
        const srgb = value / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };

    const digits = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16));

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Contrast ratio between two hex colours, 1 to 21. */
const contrastRatio = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

/** Value of a declared token, or undefined when it is not declared. */
const tokenValue = (css, name) => css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();

describe('card frame tokens', () => {
    const frameKeys = [
        'normal', 'effect', 'ritual', 'fusion', 'synchro',
        'xyz', 'link', 'spell', 'trap', 'token'
    ];

    // The surfaces a card's text can sit on. --surface-3 is the lightest, so
    // it is the hardest case for a light ink.
    const surfaces = ['--surface-1', '--surface-2', '--surface-3'].map((name) =>
        tokenValue(tokensCss, name)
    );

    it('declares a base and an ink value for every frame', () => {
        for (const key of frameKeys) {
            expect(tokenValue(tokensCss, `--frame-${key}`)).toMatch(/^#[0-9a-f]{6}$/i);
            expect(tokenValue(tokensCss, `--frame-${key}-ink`)).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    // The card asks for an AA contrast check on every frame colour. Computing
    // it is the only version of that check that cannot quietly rot: a later
    // tweak to a hex value is caught here rather than in review.
    it.each(frameKeys)('clears WCAG AA for %s ink on every surface', (key) => {
        const ink = tokenValue(tokensCss, `--frame-${key}-ink`);

        for (const surface of surfaces) {
            expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('gives each frame a distinct base colour', () => {
        const bases = frameKeys.map((key) => tokenValue(tokensCss, `--frame-${key}`));
        expect(new Set(bases).size).toBe(frameKeys.length);
    });

    it('keeps the interaction accent distinct from every frame colour', () => {
        // Accent means "state the user caused". A frame colour equal to it
        // would read as an active filter rather than as a card type.
        const accent = tokenValue(tokensCss, '--accent');
        const bases = frameKeys.map((key) => tokenValue(tokensCss, `--frame-${key}`));
        expect(bases).not.toContain(accent);
    });
});

describe('styles.css', () => {
    it('holds no raw hex colour', () => {
        const hex = stylesCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
        expect(hex).toEqual([]);
    });

    it('holds no raw rgb() or rgba() colour', () => {
        const rgb = stylesCss.match(/\brgba?\(/g) ?? [];
        expect(rgb).toEqual([]);
    });

    it('resolves every var() against a declared token', () => {
        const declared = new Set([
            ...declaredProperties(tokensCss),
            // The carousel declares its own geometry properties locally.
            ...declaredProperties(stylesCss)
        ]);
        const unresolved = referencedProperties(stylesCss).filter((name) => !declared.has(name));
        expect(unresolved).toEqual([]);
    });

    it('keeps the page background flat rather than a gradient', () => {
        const body = stylesCss.match(/\bbody\s*{[^}]*}/);
        expect(body).not.toBeNull();
        expect(body[0]).not.toMatch(/gradient/);
    });

    it('clips no heading text to a gradient', () => {
        expect(stylesCss).not.toMatch(/background-clip:\s*text/);
        expect(stylesCss).not.toMatch(/text-fill-color/);
    });

    it('balances its braces', () => {
        const open = (stylesCss.match(/{/g) ?? []).length;
        const close = (stylesCss.match(/}/g) ?? []).length;
        expect(open).toBe(close);
    });
});
