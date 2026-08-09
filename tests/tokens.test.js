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
