import { describe, it, expect } from 'vitest';
import { cardFrame, frameLabel, FRAME_KEYS, FRAME_LABELS } from '../assets/js/frames.js';

/**
 * Covers the frame derivation.
 *
 * The point of the card is that colour carries the card's type, so the
 * assertions are about a card landing in the frame the printed card would
 * actually have — in particular a Fusion monster with an effect being purple
 * rather than orange.
 */

const monster = (fields = {}) => ({
    type: 'monster',
    summonType: null,
    cardType: 'Spellcaster / Effect',
    ...fields
});

describe('cardFrame', () => {
    it('maps the non-monster types straight through', () => {
        expect(cardFrame({ type: 'spell' })).toBe('spell');
        expect(cardFrame({ type: 'trap' })).toBe('trap');
        expect(cardFrame({ type: 'token' })).toBe('token');
    });

    it('reads an effect monster as the effect frame', () => {
        expect(cardFrame(monster())).toBe('effect');
    });

    it('reads a monster with no effect as the normal frame', () => {
        expect(cardFrame(monster({ cardType: 'Dragon / Normal' }))).toBe('normal');
    });

    it.each([
        ['Fusion', 'fusion'],
        ['Synchro', 'synchro'],
        ['XYZ', 'xyz'],
        ['Ritual', 'ritual'],
        ['Link', 'link']
    ])('reads summon type %s as the %s frame', (summonType, expected) => {
        expect(cardFrame(monster({ summonType }))).toBe(expected);
    });

    // How the real card is printed: the frame states the summon mechanic, and
    // nearly every Fusion monster also has an effect.
    it('lets the summon type outrank the effect flag', () => {
        expect(cardFrame(monster({ summonType: 'Fusion', cardType: 'Warrior / Fusion / Effect' })))
            .toBe('fusion');
    });

    it('ignores the None summon type the data uses for ordinary monsters', () => {
        expect(cardFrame(monster({ summonType: 'None' }))).toBe('effect');
    });

    it('is case and whitespace insensitive', () => {
        expect(cardFrame({ type: ' SPELL ' })).toBe('spell');
        expect(cardFrame(monster({ summonType: ' fusion ' }))).toBe('fusion');
    });

    // A new Airtable Type shown in another type's colour would be worse than
    // one shown in no colour at all, because the colour is load-bearing now.
    it('returns null rather than guessing at an unknown type', () => {
        expect(cardFrame({ type: 'skill' })).toBeNull();
        expect(cardFrame({})).toBeNull();
        expect(cardFrame(null)).toBeNull();
        expect(cardFrame({ type: 42 })).toBeNull();
    });

    it('falls back to the normal frame when a monster has no card type line', () => {
        expect(cardFrame({ type: 'monster' })).toBe('normal');
    });

    it('only ever returns a declared frame key', () => {
        const cards = [
            { type: 'spell' },
            { type: 'trap' },
            { type: 'token' },
            monster(),
            monster({ summonType: 'Link' }),
            monster({ cardType: 'Beast / Normal' })
        ];

        for (const card of cards) {
            expect(FRAME_KEYS).toContain(cardFrame(card));
        }
    });
});

describe('frameLabel', () => {
    it('labels every declared frame', () => {
        for (const key of FRAME_KEYS) {
            expect(frameLabel(key)).toBe(FRAME_LABELS[key]);
            expect(frameLabel(key)).not.toBe('');
        }
    });

    it('returns an empty string for an unknown frame', () => {
        expect(frameLabel(null)).toBe('');
        expect(frameLabel('skill')).toBe('');
    });
});
