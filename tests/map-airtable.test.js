import { describe, it, expect } from 'vitest';
import {
    mapRecord,
    mapRecords,
    buildCardTypeLabel,
    buildStats,
    assertNoPrivateFields,
    PRIVATE_FIELDS
} from '../scripts/map-airtable.mjs';
import { RARITY_ORDER } from '../assets/js/filters.js';
import { RARITY_LABELS, safeGradient } from '../assets/js/render.js';

/** Mirrors a real record from the live base. */
const monsterRecord = {
    id: 'rec001',
    fields: {
        Name: 'Magician of Faith',
        Passcode: '31560081',
        Type: 'Monster',
        'Card Type': 'Spellcaster',
        'Card Sign': 'Light',
        'Summon Type': 'None',
        HasEffect: true,
        Rarity: 'Common',
        Serial: 'SDJ-017',
        Attack: 300,
        Defense: 400,
        Level: 1,
        Quantity: 1,
        Condition: 'Moderately Played'
    }
};

const spellRecord = {
    id: 'rec002',
    fields: {
        Name: 'Pot of Greed',
        Passcode: '55144522',
        Type: 'Spell',
        Rarity: 'Ultra Rare',
        Serial: 'LOB-119',
        Quantity: 3,
        Condition: 'Near Mint'
    }
};

describe('buildCardTypeLabel', () => {
    it('composes race, summon type and effect flag', () => {
        expect(buildCardTypeLabel({
            'Card Type': 'Spellcaster', 'Summon Type': 'Fusion', HasEffect: true, Type: 'Monster'
        })).toBe('Spellcaster / Fusion / Effect');
    });

    it('marks a non-effect monster as Normal', () => {
        expect(buildCardTypeLabel({
            'Card Type': 'Warrior', 'Summon Type': 'None', HasEffect: false, Type: 'Monster'
        })).toBe('Warrior / Normal');
    });

    it('omits a "None" summon type', () => {
        expect(buildCardTypeLabel(monsterRecord.fields)).toBe('Spellcaster / Effect');
    });

    it('labels spells and traps by their type', () => {
        expect(buildCardTypeLabel({ Type: 'Trap' })).toBe('Trap');
    });

    it('returns an empty string when nothing is known', () => {
        expect(buildCardTypeLabel({})).toBe('');
    });
});

describe('buildStats', () => {
    it('gives monsters combat stats', () => {
        expect(buildStats(monsterRecord.fields)).toEqual([
            { label: 'ATK', value: '300' },
            { label: 'DEF', value: '400' },
            { label: 'Level', value: '⭐1' }
        ]);
    });

    it('substitutes a dash for missing monster numbers', () => {
        const stats = buildStats({ Type: 'Monster' });
        expect(stats.map(s => s.value)).toEqual(['—', '—', '—']);
    });

    it('keeps a zero attack rather than treating it as missing', () => {
        const stats = buildStats({ Type: 'Monster', Attack: 0, Defense: 0, Level: 4 });
        expect(stats[0].value).toBe('0');
        expect(stats[1].value).toBe('0');
    });

    it('gives spells and traps classification stats instead', () => {
        expect(buildStats(spellRecord.fields).map(s => s.label))
            .toEqual(['Type', 'Attribute', 'Serial']);
    });

    it('always returns exactly three entries', () => {
        [monsterRecord.fields, spellRecord.fields, {}].forEach(fields => {
            expect(buildStats(fields)).toHaveLength(3);
        });
    });
});

describe('mapRecord', () => {
    it('maps a monster record completely', () => {
        const card = mapRecord(monsterRecord);

        expect(card).toMatchObject({
            id: 'rec001',
            name: 'Magician of Faith',
            type: 'monster',
            rarity: 'common',
            passcode: '31560081',
            serial: 'SDJ-017',
            cardType: 'Spellcaster / Effect',
            attribute: 'Light',
            atk: 300,
            def: 400,
            level: 1,
            summonType: null
        });
    });

    it('lowercases the type and rarity for the filters', () => {
        expect(mapRecord(spellRecord)).toMatchObject({ type: 'spell', rarity: 'ultra' });
    });

    it('keeps the passcode as a string so leading zeros survive', () => {
        const card = mapRecord({ id: 'r', fields: { ...monsterRecord.fields, Passcode: '00123456' } });
        expect(card.passcode).toBe('00123456');
    });

    it('never carries a private field through', () => {
        const card = mapRecord(monsterRecord);
        PRIVATE_FIELDS.forEach(field => {
            expect(Object.keys(card).map(k => k.toLowerCase()))
                .not.toContain(field.toLowerCase());
        });
    });

    it('returns null when a required field is missing', () => {
        expect(mapRecord({ id: 'r', fields: { Type: 'Monster', Rarity: 'Common' } })).toBeNull();
        expect(mapRecord({ id: 'r', fields: { Name: 'X', Rarity: 'Common' } })).toBeNull();
        expect(mapRecord({ id: 'r', fields: { Name: 'X', Type: 'Monster' } })).toBeNull();
    });

    it('returns null for an unrecognised type or rarity', () => {
        expect(mapRecord({ id: 'r', fields: { Name: 'X', Type: 'Token', Rarity: 'Common' } })).toBeNull();
        expect(mapRecord({ id: 'r', fields: { Name: 'X', Type: 'Monster', Rarity: 'Promo' } })).toBeNull();
    });

    it('returns null for a malformed record', () => {
        [null, undefined, {}, { id: 'r' }].forEach(input => {
            expect(mapRecord(input)).toBeNull();
        });
    });

    it('produces a gradient the renderer will accept', () => {
        ['Monster', 'Spell', 'Trap'].forEach(type => {
            const card = mapRecord({ id: 'r', fields: { Name: 'X', Type: type, Rarity: 'Common' } });
            expect(safeGradient(card.gradient)).toBe(card.gradient);
        });
    });
});

describe('mapRecords', () => {
    it('maps a set and counts the skipped records', () => {
        const result = mapRecords([monsterRecord, { id: 'bad', fields: { Name: 'X' } }, spellRecord]);
        expect(result.cards).toHaveLength(2);
        expect(result.skipped).toBe(1);
    });

    // The collection is keyed by printing, not by card. Two rows sharing a
    // passcode with different serials are two things the owner physically has.
    it('keeps both printings of the same card rather than deduplicating', () => {
        const second = { ...monsterRecord, id: 'rec003', fields: { ...monsterRecord.fields, Serial: 'SD6-EN005' } };
        const result = mapRecords([monsterRecord, second]);

        expect(result.cards).toHaveLength(2);
        expect(result.cards.map(c => c.serial)).toEqual(['SDJ-017', 'SD6-EN005']);
        expect(new Set(result.cards.map(c => c.passcode)).size).toBe(1);
    });

    it('throws when given something other than an array', () => {
        expect(() => mapRecords(null)).toThrow(/must be an array/);
    });
});

describe('assertNoPrivateFields', () => {
    it('passes for correctly mapped cards', () => {
        expect(() => assertNoPrivateFields([mapRecord(monsterRecord)])).not.toThrow();
    });

    it('throws if an inventory field ever leaks into the output', () => {
        expect(() => assertNoPrivateFields([{ name: 'X', Quantity: 3 }]))
            .toThrow(/must not be published/);
        expect(() => assertNoPrivateFields([{ name: 'X', condition: 'Near Mint' }]))
            .toThrow(/must not be published/);
    });
});

describe('rarity vocabulary stays in step', () => {
    // Three places define rarity: the Airtable options, RARITY_ORDER, and
    // RARITY_LABELS. Drift between them makes cards vanish under a filter.
    const airtableRarities = [
        'common', 'rare', 'super', 'ultra', 'secret',
        'ultimate', 'collector', 'ghost', 'prismatic', 'starlight'
    ];

    it('RARITY_ORDER covers every rarity the sync can emit', () => {
        airtableRarities.forEach(rarity => {
            expect(RARITY_ORDER).toContain(rarity);
        });
    });

    it('every ordered rarity has a display label', () => {
        RARITY_ORDER.forEach(rarity => {
            expect(RARITY_LABELS[rarity]).toBeTruthy();
        });
    });

    it('keeps common as the lowest tier so "rare or better" excludes it', () => {
        expect(RARITY_ORDER[0]).toBe('common');
        expect(RARITY_ORDER.indexOf('rare')).toBe(1);
    });
});
