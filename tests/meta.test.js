import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the document metadata.
 *
 * Read as text for the same reason tokens.test.js is: these are properties of
 * what the document says, and nothing else in the repo notices when a tag is
 * dropped. A missing og:image costs nothing at runtime and everything the
 * first time someone shares the link.
 */

const path = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const indexHtml = readFileSync(path('../index.html'), 'utf8');

const PAGES_URL = 'https://techcabana.github.io/YuGiOhCardCollection/';

/** The content of <meta name="..."> or <meta property="...">, or null. */
const meta = (attribute, name) => {
    const match = indexHtml.match(
        new RegExp(`<meta\\s+${attribute}="${name}"\\s+content="([^"]*)"`, 'i')
    );
    return match ? match[1] : null;
};

/** Every href on a <link> carrying the given rel. */
const linkHrefs = (rel) =>
    [...indexHtml.matchAll(/<link\s+([^>]*)>/gi)]
        .map((match) => match[1])
        .filter((attributes) => new RegExp(`rel="${rel}"`, 'i').test(attributes))
        .map((attributes) => attributes.match(/href="([^"]*)"/i)?.[1])
        .filter(Boolean);

describe('description and canonical', () => {
    it('describes the page in a length search results will show', () => {
        const description = meta('name', 'description');
        expect(description).not.toBeNull();
        expect(description.length).toBeGreaterThan(50);
        expect(description.length).toBeLessThanOrEqual(160);
    });

    it('points the canonical URL at the Pages site', () => {
        expect(linkHrefs('canonical')).toEqual([PAGES_URL]);
    });

    it('matches the theme colour to the background token', () => {
        const tokensCss = readFileSync(path('../assets/css/tokens.css'), 'utf8');
        const background = tokensCss.match(/--bg:\s*(#[0-9a-f]{6})/i)[1];
        expect(meta('name', 'theme-color')).toBe(background);
    });
});

describe('link preview', () => {
    it('declares the Open Graph tags a scraper needs', () => {
        expect(meta('property', 'og:type')).toBe('website');
        expect(meta('property', 'og:title')).toBeTruthy();
        expect(meta('property', 'og:description')).toBeTruthy();
        expect(meta('property', 'og:url')).toBe(PAGES_URL);
    });

    // A relative og:image resolves against the scraper, not the page, so every
    // platform drops it silently. This is the tag most easily got wrong.
    it('gives an absolute og:image URL', () => {
        const image = meta('property', 'og:image');
        expect(image).toMatch(/^https:\/\//);
        expect(image.startsWith(PAGES_URL)).toBe(true);
    });

    it('states the image dimensions the file actually has', () => {
        const width = Number(meta('property', 'og:image:width'));
        const height = Number(meta('property', 'og:image:height'));

        // Read straight out of the PNG's IHDR rather than trusting the markup.
        const png = readFileSync(path('../assets/icons/og-image.png'));
        expect(png.readUInt32BE(16)).toBe(width);
        expect(png.readUInt32BE(20)).toBe(height);
    });

    it('describes the image for anyone who cannot see it', () => {
        expect(meta('property', 'og:image:alt')).toBeTruthy();
    });

    it('declares a large Twitter card with its own image', () => {
        expect(meta('name', 'twitter:card')).toBe('summary_large_image');
        expect(meta('name', 'twitter:title')).toBeTruthy();
        expect(meta('name', 'twitter:image')).toMatch(/^https:\/\//);
    });
});

describe('icons', () => {
    it('links an SVG, a PNG and an ICO favicon', () => {
        const hrefs = linkHrefs('icon');
        expect(hrefs).toContain('assets/icons/favicon.svg');
        expect(hrefs).toContain('assets/icons/favicon-32.png');
        expect(hrefs).toContain('assets/icons/favicon.ico');
    });

    it('links an apple-touch-icon', () => {
        expect(linkHrefs('apple-touch-icon')).toEqual(['assets/icons/apple-touch-icon.png']);
    });

    it('ships every icon file the document references', () => {
        const referenced = [...linkHrefs('icon'), ...linkHrefs('apple-touch-icon')];
        for (const href of referenced) {
            expect(existsSync(path(`../${href}`))).toBe(true);
        }
    });
});

describe('the script tag', () => {
    // type="module" is deferred by definition, so an explicit defer would be
    // redundant rather than a correction. Asserted so nobody re-adds it, and
    // so a change back to a classic script has to face the question.
    it('loads as a module, which defers without saying so', () => {
        const script = indexHtml.match(/<script\s+([^>]*)>/i)[1];
        expect(script).toContain('type="module"');
        expect(script).not.toContain('defer');
    });
});
