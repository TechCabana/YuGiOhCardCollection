import { describe, it, expect } from 'vitest';
import {
    deriveType,
    deriveSummonType,
    hasEffect,
    deriveAttribute,
    parsePrice,
    buildEnrichedFields,
    validateSelectOptions,
    assertNoHumanOwnedFields,
    describeProblem,
    MACHINE_OWNED_FIELDS,
    HUMAN_OWNED_FIELDS
} from '../scripts/enrich-ygoprodeck.mjs';

/** Real cardsetsinfo response for SDJ-017, captured from the live API. */
const setInfo = {
    id: 31560081,
    name: 'Magician of Faith',
    set_name: 'Starter Deck: Joey',
    set_code: 'SDJ-017',
    set_rarity: 'Common',
    set_price: '1.92'
};

/** Real cardinfo entry for the same card. */
const cardInfo = {
    id: 31560081,
    name: 'Magician of Faith',
    type: 'Flip Effect Monster',
    race: 'Spellcaster',
    attribute: 'LIGHT',
    atk: 300,
    def: 400,
    level: 1
};

/** The base's actual single-select options. */
const selectOptions = {
    Type: ['Monster', 'Spell', 'Trap'],
    'Card Type': ['Spellcaster', 'Warrior'],
    'Card Sign': ['Light', 'Dark', 'Water'],
    'Summon Type': ['Fusion', 'Synchro', 'XYZ', 'Ritual', 'Link', 'None'],
    Rarity: ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare']
};

describe('deriveType', () => {
    it.each([
        ['Flip Effect Monster', 'Monster'],
        ['Normal Monster', 'Monster'],
        ['Fusion Monster', 'Monster'],
        ['Spell Card', 'Spell'],
        ['Trap Card', 'Trap']
    ])('maps %s to %s', (input, expected) => {
        expect(deriveType(input)).toBe(expected);
    });

    it('returns null for an unrecognised or missing type', () => {
        expect(deriveType('Skill Card')).toBeNull();
        expect(deriveType(undefined)).toBeNull();
    });
});

describe('deriveSummonType', () => {
    it.each([
        ['Fusion Monster', 'Fusion'],
        ['Synchro Tuner Monster', 'Synchro'],
        ['XYZ Monster', 'XYZ'],
        ['Link Monster', 'Link']
    ])('maps %s to %s', (input, expected) => {
        expect(deriveSummonType(input)).toBe(expected);
    });

    // "Ritual Effect Monster" contains both keywords; Ritual must win.
    it('picks Ritual over the effect keyword', () => {
        expect(deriveSummonType('Ritual Effect Monster')).toBe('Ritual');
    });

    it('returns None for a main-deck monster rather than leaving it blank', () => {
        expect(deriveSummonType('Flip Effect Monster')).toBe('None');
        expect(deriveSummonType('Normal Monster')).toBe('None');
        expect(deriveSummonType(undefined)).toBe('None');
    });
});

describe('hasEffect', () => {
    it('is true for every effect monster variant', () => {
        ['Effect Monster', 'Flip Effect Monster', 'Ritual Effect Monster']
            .forEach(type => expect(hasEffect(type)).toBe(true));
    });

    it('is false for a normal monster', () => {
        expect(hasEffect('Normal Monster')).toBe(false);
    });

    // The flag distinguishes Normal from Effect monsters, so non-monsters are false.
    it('is false for spells and traps', () => {
        expect(hasEffect('Spell Card')).toBe(false);
        expect(hasEffect('Trap Card')).toBe(false);
    });
});

describe('deriveAttribute', () => {
    it('title-cases the shouted attribute', () => {
        expect(deriveAttribute('LIGHT')).toBe('Light');
        expect(deriveAttribute('DARK')).toBe('Dark');
        expect(deriveAttribute('WATER')).toBe('Water');
    });

    it('returns null when absent, as spells and traps have no attribute', () => {
        expect(deriveAttribute(undefined)).toBeNull();
        expect(deriveAttribute('')).toBeNull();
        expect(deriveAttribute('   ')).toBeNull();
    });
});

describe('parsePrice', () => {
    it('parses the string YGOPRODeck returns', () => {
        expect(parsePrice('1.92')).toBe(1.92);
    });

    // null means unknown; 0 would mean the card is worthless.
    it('returns null rather than 0 when unavailable', () => {
        expect(parsePrice(undefined)).toBeNull();
        expect(parsePrice(null)).toBeNull();
        expect(parsePrice('n/a')).toBeNull();
    });

    it('keeps a genuine zero', () => {
        expect(parsePrice('0.00')).toBe(0);
    });
});

describe('buildEnrichedFields', () => {
    it('maps a real monster completely', () => {
        expect(buildEnrichedFields(setInfo, cardInfo)).toEqual({
            Name: 'Magician of Faith',
            Passcode: '31560081',
            Rarity: 'Common',
            'Set Name': 'Starter Deck: Joey',
            'Set Price': 1.92,
            Type: 'Monster',
            'Card Type': 'Spellcaster',
            'Card Sign': 'Light',
            'Summon Type': 'None',
            HasEffect: true,
            Attack: 300,
            Defense: 400,
            Level: 1
        });
    });

    it('keeps the passcode a string so leading zeros survive', () => {
        const fields = buildEnrichedFields({ ...setInfo, id: 123 }, cardInfo);
        expect(fields.Passcode).toBe('123');
        expect(typeof fields.Passcode).toBe('string');
    });

    it('omits combat stats for spells and traps', () => {
        const fields = buildEnrichedFields(
            { ...setInfo, set_rarity: 'Rare' },
            { type: 'Spell Card', race: 'Quick-Play' }
        );

        expect(fields.Type).toBe('Spell');
        expect(fields).not.toHaveProperty('Attack');
        expect(fields).not.toHaveProperty('Level');
        expect(fields).not.toHaveProperty('Summon Type');
    });

    it('keeps a zero attack rather than dropping it', () => {
        const fields = buildEnrichedFields(setInfo, { ...cardInfo, atk: 0, def: 0 });
        expect(fields.Attack).toBe(0);
        expect(fields.Defense).toBe(0);
    });

    // A partial response must not blank a field that already held a good value.
    it('omits absent values instead of writing null', () => {
        const fields = buildEnrichedFields({}, {});
        Object.values(fields).forEach(value => expect(value).not.toBeNull());
        expect(fields).not.toHaveProperty('Name');
    });

    it('only ever emits machine-owned fields', () => {
        Object.keys(buildEnrichedFields(setInfo, cardInfo)).forEach(field => {
            expect(MACHINE_OWNED_FIELDS).toContain(field);
            expect(HUMAN_OWNED_FIELDS).not.toContain(field);
        });
    });
});

describe('validateSelectOptions', () => {
    it('passes a payload whose values all exist as options', () => {
        const result = validateSelectOptions(buildEnrichedFields(setInfo, cardInfo), selectOptions);
        expect(result.ok).toBe(true);
        expect(result.problems).toEqual([]);
    });

    // The live Kuriboh test row: Fiend is not yet an option in the base.
    it('reports a race the base has no option for', () => {
        const fields = buildEnrichedFields(setInfo, { ...cardInfo, race: 'Fiend' });
        const result = validateSelectOptions(fields, selectOptions);

        expect(result.ok).toBe(false);
        expect(result.problems).toHaveLength(1);
        expect(result.problems[0]).toMatchObject({ field: 'Card Type', value: 'Fiend' });
    });

    it('reports a rarity the base has no option for', () => {
        const fields = buildEnrichedFields({ ...setInfo, set_rarity: 'Starlight Rare' }, cardInfo);
        expect(validateSelectOptions(fields, selectOptions).ok).toBe(false);
    });

    it('collects every problem rather than stopping at the first', () => {
        const fields = buildEnrichedFields(
            { ...setInfo, set_rarity: 'Ghost Rare' },
            { ...cardInfo, race: 'Fiend' }
        );
        expect(validateSelectOptions(fields, selectOptions).problems).toHaveLength(2);
    });

    it('ignores fields that are absent from the payload', () => {
        expect(validateSelectOptions({}, selectOptions).ok).toBe(true);
    });
});

describe('assertNoHumanOwnedFields', () => {
    it('accepts a correctly built payload', () => {
        expect(() => assertNoHumanOwnedFields(buildEnrichedFields(setInfo, cardInfo))).not.toThrow();
    });

    it.each(HUMAN_OWNED_FIELDS)('throws if %s ever appears in a write', field => {
        expect(() => assertNoHumanOwnedFields({ [field]: 'x' }))
            .toThrow(/human-owned/);
    });
});

describe('describeProblem', () => {
    it('names the serial, the value and the current options', () => {
        const message = describeProblem('SYE-019', {
            field: 'Card Type', value: 'Fiend', allowed: ['Spellcaster', 'Warrior']
        });

        expect(message).toContain('SYE-019');
        expect(message).toContain('Fiend');
        expect(message).toContain('Card Type');
        expect(message).toContain('Spellcaster, Warrior');
    });
});
