import { describe, it, expect } from 'vitest';
import {
    buildCardHTML,
    buildCardImageHTML,
    buildStatsHTML,
    frameAttribute,
    safeImagePath,
    rarityLabel
} from '../assets/js/render.js';

const baseCard = {
    name: 'Dark Magician',
    type: 'monster',
    rarity: 'ultra',
    cardType: 'Spellcaster / Effect',
    serial: 'LOB-005',
    image: 'assets/cards/46986414.jpg',
    stats: [
        { label: 'ATK', value: '2500' },
        { label: 'DEF', value: '2100' },
        { label: 'Serial', value: 'LOB-005' }
    ]
};

describe('frameAttribute', () => {
    it('emits the attribute for a declared frame', () => {
        expect(frameAttribute('spell')).toBe(' data-frame="spell"');
    });

    // The value is derived, not user data, but it lands in an attribute, so
    // anything outside the declared set is dropped rather than written out.
    it('emits nothing for a frame it does not recognise', () => {
        expect(frameAttribute(null)).toBe('');
        expect(frameAttribute('skill')).toBe('');
        expect(frameAttribute('spell" onload="alert(1)')).toBe('');
    });
});

describe('safeImagePath', () => {
    it('passes through a mirrored art path', () => {
        expect(safeImagePath('assets/cards/46986414.jpg')).toBe('assets/cards/46986414.jpg');
    });

    it('rejects a path outside the mirror directory', () => {
        expect(safeImagePath('assets/cards/../../.env')).toBeNull();
        expect(safeImagePath('../../.env')).toBeNull();
    });

    // Escaping alone would let each of these through as a real request.
    it('rejects remote, protocol-relative and inline sources', () => {
        expect(safeImagePath('https://evil.example/x.jpg')).toBeNull();
        expect(safeImagePath('//evil.example/x.jpg')).toBeNull();
        expect(safeImagePath('data:image/svg+xml,<svg onload="alert(1)"/>')).toBeNull();
        expect(safeImagePath('javascript:alert(1)')).toBeNull();
    });

    it('rejects a non-jpg extension and a non-numeric name', () => {
        expect(safeImagePath('assets/cards/46986414.svg')).toBeNull();
        expect(safeImagePath('assets/cards/evil.jpg')).toBeNull();
    });

    it('returns null for missing or non-string values', () => {
        [undefined, null, 46986414, {}].forEach(value => {
            expect(safeImagePath(value)).toBeNull();
        });
    });
});

describe('buildCardImageHTML', () => {
    it('emits the attributes that keep CLS at zero', () => {
        const html = buildCardImageHTML(baseCard);

        expect(html).toContain('src="assets/cards/46986414.jpg"');
        expect(html).toContain('width="421"');
        expect(html).toContain('height="614"');
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('decoding="async"');
    });

    // The card name is rendered as adjacent text, so a descriptive alt would
    // make a screen reader announce the same name twice.
    it('marks the image decorative with an empty alt', () => {
        expect(buildCardImageHTML(baseCard)).toContain('alt=""');
    });

    // mirror-images.mjs assigns the path from the passcode before the download
    // runs, and a failed download is deliberately non-fatal, so a src that
    // passes safeImagePath is not a guarantee the file exists on disk. This is
    // the client-side half of the placeholder fallback: it must fire on a 404
    // exactly like the missing-passcode case does.
    it('drops itself on a load failure instead of leaving a broken-image icon', () => {
        expect(buildCardImageHTML(baseCard)).toContain('onerror="this.remove()"');
    });

    it('emits nothing when the card has no art, leaving the placeholder ground', () => {
        expect(buildCardImageHTML({ ...baseCard, image: null })).toBe('');
        expect(buildCardImageHTML({ ...baseCard, image: undefined })).toBe('');
        expect(buildCardImageHTML(null)).toBe('');
    });

    it('emits nothing rather than a hostile src', () => {
        const html = buildCardImageHTML({ ...baseCard, image: 'x.jpg" onerror="alert(1)' });

        expect(html).toBe('');
    });
});

describe('rarityLabel', () => {
    it('maps a known rarity to its label', () => {
        expect(rarityLabel('ultra')).toBe('Ultra Rare');
        expect(rarityLabel('common')).toBe('Common');
    });

    it('echoes an unknown rarity rather than dropping it', () => {
        expect(rarityLabel('promo')).toBe('promo');
    });

    it('escapes an unknown rarity carrying markup', () => {
        expect(rarityLabel('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
    });

    it('returns an empty string for a missing rarity', () => {
        expect(rarityLabel(undefined)).toBe('');
    });
});

describe('buildStatsHTML', () => {
    it('escapes stat labels and values', () => {
        const html = buildStatsHTML([{ label: '<b>ATK</b>', value: '<i>2500</i>' }]);
        expect(html).not.toContain('<b>');
        expect(html).not.toContain('<i>');
        expect(html).toContain('&lt;b&gt;ATK&lt;/b&gt;');
    });

    it('returns an empty string when stats are missing or malformed', () => {
        expect(buildStatsHTML(undefined)).toBe('');
        expect(buildStatsHTML('ATK')).toBe('');
    });

    it('tolerates null entries without throwing', () => {
        expect(() => buildStatsHTML([null])).not.toThrow();
    });
});

describe('buildCardHTML', () => {
    it('renders a normal card with its real values', () => {
        const html = buildCardHTML(baseCard);
        expect(html).toContain('Dark Magician');
        expect(html).toContain('Ultra Rare');
        expect(html).toContain('2500');
    });

    // The card's Done-when: a card named <script>alert(1)</script> renders as literal text.
    it('renders a script-tag card name as literal text', () => {
        const html = buildCardHTML({ ...baseCard, name: '<script>alert(1)</script>' });

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('neutralises an img onerror payload in the card name', () => {
        const html = buildCardHTML({ ...baseCard, name: '<img src=x onerror="alert(1)">' });

        // The card art is itself an img now, and it legitimately carries its own
        // fixed onerror handler (see buildCardImageHTML), so the assertion is
        // that the only img in the output is that one, wired to that exact
        // fixed handler, and the name became literal text rather than a second
        // live attribute built from attacker-controlled input.
        expect(html.match(/<img/g)).toHaveLength(1);
        expect(html).toContain('<img class="card-image"');
        expect(html.match(/onerror="/g)).toHaveLength(1);
        expect(html).toContain('onerror="this.remove()"');
        expect(html).not.toContain('onerror="alert(1)"');
        expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('injects no img at all for a hostile name on a card with no art', () => {
        const html = buildCardHTML({
            ...baseCard,
            image: null,
            name: '<img src=x onerror="alert(1)">'
        });

        expect(html).not.toContain('<img');
    });

    it('escapes markup in every interpolated field', () => {
        const hostile = '<svg onload="alert(1)">';
        const html = buildCardHTML({
            ...baseCard,
            name: hostile,
            cardType: hostile,
            rarity: hostile
        });

        expect(html).not.toContain('<svg');
        expect(html).not.toContain('onload="');
    });

    // The gradient used to be interpolated into a style attribute and had to be
    // allowlisted. Card colour is now a key resolved by CSS, so no card data
    // reaches a style attribute at all and the whole class of break-out is gone.
    it('puts no card data in a style attribute', () => {
        const html = buildCardHTML({
            ...baseCard,
            gradient: 'red" onmouseover="alert(1)',
            type: 'monster" onmouseover="alert(1)'
        });

        expect(html).not.toContain('onmouseover');
        expect(html).not.toContain('style="background');
    });

    it('carries the derived frame on both card areas', () => {
        const html = buildCardHTML({ ...baseCard, type: 'spell', cardType: 'Quick-Play / Spell' });

        expect(html).toContain('class="card-image-area" data-frame="spell"');
        expect(html).toContain('class="card-info-area" data-frame="spell"');
        expect(html).toContain('<span class="type-chip">Spell</span>');
    });

    it('reads a fusion monster as the fusion frame rather than the effect one', () => {
        const html = buildCardHTML({
            ...baseCard,
            summonType: 'Fusion',
            cardType: 'Warrior / Fusion / Effect'
        });

        expect(html).toContain('data-frame="fusion"');
        expect(html).not.toContain('data-frame="effect"');
    });

    it('renders an unknown card type with no frame and no chip', () => {
        const html = buildCardHTML({ ...baseCard, type: 'skill' });

        expect(html).not.toContain('data-frame');
        expect(html).not.toContain('type-chip');
        expect(html).toContain('Dark Magician');
    });

    it('keeps the surrounding markup structure intact', () => {
        const html = buildCardHTML(baseCard);
        expect(html).toContain('class="card-image-area"');
        expect(html).toContain('class="rarity-badge"');
        expect(html).toContain('class="card-stats-grid"');
    });

    it('places the art inside the art area', () => {
        const html = buildCardHTML(baseCard);

        expect(html).toContain('class="card-image"');
        expect(html.indexOf('class="card-image"')).toBeGreaterThan(html.indexOf('card-image-area'));
        expect(html.indexOf('class="card-image"')).toBeLessThan(html.indexOf('card-info-area'));
    });

    it('renders a card with no art without an img tag', () => {
        const html = buildCardHTML({ ...baseCard, image: null });

        expect(html).not.toContain('<img');
        expect(html).toContain('class="card-image-area"');
        expect(html).toContain('Dark Magician');
    });

    // Emoji as UI chrome is a design smell the mirrored art replaces.
    it('renders no placeholder glyph', () => {
        expect(buildCardHTML({ ...baseCard, emoji: '🐉' })).not.toContain('🐉');
    });

    it('returns an empty string for a missing card', () => {
        expect(buildCardHTML(null)).toBe('');
        expect(buildCardHTML('card')).toBe('');
    });
});
