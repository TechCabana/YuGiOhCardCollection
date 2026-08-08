import { describe, it, expect } from 'vitest';
import {
    buildCardHTML,
    buildStatsHTML,
    safeGradient,
    rarityLabel
} from '../assets/js/render.js';

const baseCard = {
    name: 'Dark Magician',
    type: 'monster',
    rarity: 'ultra',
    cardType: 'Spellcaster / Effect',
    serial: 'LOB-005',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    emoji: '🐉',
    stats: [
        { label: 'ATK', value: '2500' },
        { label: 'DEF', value: '2100' },
        { label: 'Serial', value: 'LOB-005' }
    ]
};

describe('safeGradient', () => {
    it('passes through a well-formed gradient unchanged', () => {
        expect(safeGradient(baseCard.gradient)).toBe(baseCard.gradient);
    });

    it('falls back when the value tries to close the declaration', () => {
        const payload = 'red; background-image: url(javascript:alert(1))';
        expect(safeGradient(payload)).not.toContain('javascript');
        expect(safeGradient(payload)).toContain('linear-gradient');
    });

    it('falls back on a quote-based attribute break-out', () => {
        expect(safeGradient('red" onload="alert(1)')).not.toContain('onload');
    });

    it('falls back on arbitrary CSS functions', () => {
        expect(safeGradient('url(https://evil.example/x.png)')).not.toContain('evil');
        expect(safeGradient('expression(alert(1))')).not.toContain('expression');
    });

    it('falls back for missing or non-string values', () => {
        [undefined, null, 42, {}].forEach(input => {
            expect(safeGradient(input)).toContain('linear-gradient');
        });
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

        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror="');
    });

    it('escapes markup in every interpolated field', () => {
        const hostile = '<svg onload="alert(1)">';
        const html = buildCardHTML({
            ...baseCard,
            name: hostile,
            cardType: hostile,
            emoji: hostile,
            rarity: hostile
        });

        expect(html).not.toContain('<svg');
        expect(html).not.toContain('onload="');
    });

    it('does not let a hostile gradient escape the style attribute', () => {
        const html = buildCardHTML({ ...baseCard, gradient: 'red" onmouseover="alert(1)' });

        expect(html).not.toContain('onmouseover');
        expect(html).toContain('style="background: linear-gradient(');
    });

    it('keeps the surrounding markup structure intact', () => {
        const html = buildCardHTML(baseCard);
        expect(html).toContain('class="card-image-area"');
        expect(html).toContain('class="rarity-badge"');
        expect(html).toContain('class="card-stats-grid"');
    });

    it('returns an empty string for a missing card', () => {
        expect(buildCardHTML(null)).toBe('');
        expect(buildCardHTML('card')).toBe('');
    });
});
