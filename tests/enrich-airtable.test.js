import { describe, it, expect, vi } from 'vitest';
import {
    isUnprocessed,
    collectEnrichedRows,
    buildPatchBatches,
    fetchSelectOptions
} from '../scripts/enrich-airtable.mjs';
import { HUMAN_OWNED_FIELDS } from '../scripts/enrich-ygoprodeck.mjs';
import { PRIVATE_FIELDS } from '../scripts/map-airtable.mjs';

/** Real cardsetsinfo response for SDJ-017. */
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

/** A resolveSerialImpl stand-in that always resolves successfully. */
const alwaysResolves = () => Promise.resolve({ ok: true, setInfo, cardInfo });

/** Build a fake unprocessed Airtable record with the given serial. */
function unprocessedRecord(id, serial) {
    return { id, fields: { Serial: serial, IsProcessed: false } };
}

describe('isUnprocessed', () => {
    it('treats a missing IsProcessed as unprocessed', () => {
        expect(isUnprocessed({ fields: {} })).toBe(true);
    });

    it('treats IsProcessed: false as unprocessed', () => {
        expect(isUnprocessed({ fields: { IsProcessed: false } })).toBe(true);
    });

    it('treats IsProcessed: true as processed', () => {
        expect(isUnprocessed({ fields: { IsProcessed: true } })).toBe(false);
    });
});

describe('buildPatchBatches', () => {
    it('splits 23 rows into batches of 10, 10 and 3', () => {
        const rows = Array.from({ length: 23 }, (_, i) => ({ id: `rec${i}`, fields: {} }));
        const batches = buildPatchBatches(rows);

        expect(batches).toHaveLength(3);
        expect(batches[0]).toHaveLength(10);
        expect(batches[1]).toHaveLength(10);
        expect(batches[2]).toHaveLength(3);
    });

    it('preserves row order and identity across batches', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ id: `rec${i}`, fields: {} }));
        const batches = buildPatchBatches(rows);

        expect(batches.flat().map(r => r.id)).toEqual(rows.map(r => r.id));
    });

    it('returns no batches for zero rows', () => {
        expect(buildPatchBatches([])).toEqual([]);
    });

    it('honours a custom batch size', () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({ id: `rec${i}`, fields: {} }));
        expect(buildPatchBatches(rows, 2)).toHaveLength(3);
    });
});

describe('collectEnrichedRows', () => {
    it('every collected row carries IsProcessed: true', async () => {
        const records = [unprocessedRecord('rec1', 'SDJ-017'), unprocessedRecord('rec2', 'SD6-EN005')];

        const { rows } = await collectEnrichedRows(records, {
            resolveSerialImpl: alwaysResolves,
            selectOptions
        });

        expect(rows).toHaveLength(2);
        rows.forEach(row => expect(row.fields.IsProcessed).toBe(true));
    });

    it('never includes a human-owned field in any payload', async () => {
        const records = [unprocessedRecord('rec1', 'SDJ-017')];

        const { rows } = await collectEnrichedRows(records, {
            resolveSerialImpl: alwaysResolves,
            selectOptions
        });

        rows.forEach(row => {
            HUMAN_OWNED_FIELDS.forEach(field => {
                expect(row.fields).not.toHaveProperty(field);
            });
        });
    });

    it('skips a row whose resolveSerial fails, without throwing', async () => {
        const records = [unprocessedRecord('rec1', 'UNKNOWN-999')];
        const resolveSerialImpl = () =>
            Promise.resolve({ ok: false, reason: 'No YGOPRODeck match for set code "UNKNOWN-999"' });

        const result = await collectEnrichedRows(records, { resolveSerialImpl, selectOptions });

        expect(result.rows).toHaveLength(0);
        expect(result.skipped).toEqual([
            { serial: 'UNKNOWN-999', reason: 'No YGOPRODeck match for set code "UNKNOWN-999"' }
        ]);
        expect(result.blocked).toHaveLength(0);
    });

    it('skips a row that fails select-option validation', async () => {
        // Mirrors the live Kuriboh test row: race "Fiend" is not an option.
        const records = [unprocessedRecord('rec1', 'SYE-019')];
        const resolveSerialImpl = () =>
            Promise.resolve({ ok: true, setInfo, cardInfo: { ...cardInfo, race: 'Fiend' } });

        const result = await collectEnrichedRows(records, { resolveSerialImpl, selectOptions });

        expect(result.rows).toHaveLength(0);
        expect(result.blocked).toHaveLength(1);
        expect(result.blocked[0]).toMatchObject({ serial: 'SYE-019' });
        expect(result.blocked[0].problems[0]).toMatchObject({ field: 'Card Type', value: 'Fiend' });
    });

    it('already-processed rows are never resolved or collected', async () => {
        const records = [{ id: 'rec1', fields: { Serial: 'SDJ-017', IsProcessed: true } }];
        const resolveSerialImpl = vi.fn(alwaysResolves);

        const result = await collectEnrichedRows(records, { resolveSerialImpl, selectOptions });

        expect(resolveSerialImpl).not.toHaveBeenCalled();
        expect(result.rows).toHaveLength(0);
    });

    it('processes a mix of ready, blocked and failing rows independently', async () => {
        const records = [
            unprocessedRecord('rec1', 'SDJ-017'),
            unprocessedRecord('rec2', 'SYE-019'),
            unprocessedRecord('rec3', 'UNKNOWN-999')
        ];
        const resolveSerialImpl = serial => {
            if (serial === 'SYE-019') return Promise.resolve({ ok: true, setInfo, cardInfo: { ...cardInfo, race: 'Fiend' } });
            if (serial === 'UNKNOWN-999') return Promise.resolve({ ok: false, reason: 'not found' });
            return alwaysResolves();
        };

        const result = await collectEnrichedRows(records, { resolveSerialImpl, selectOptions });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].id).toBe('rec1');
        expect(result.blocked).toHaveLength(1);
        expect(result.skipped).toHaveLength(1);
    });
});

describe('fetchSelectOptions', () => {
    /** Build a fake fetch response, mirroring the subset of the Fetch API used. */
    function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
        return { ok, status, statusText, json: async () => body, text: async () => JSON.stringify(body) };
    }

    it('extracts single-select choices keyed by field name', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({
                tables: [
                    {
                        id: 'tbl1',
                        fields: [
                            { name: 'Type', type: 'singleSelect', options: { choices: [{ name: 'Monster' }, { name: 'Spell' }] } },
                            { name: 'Name', type: 'singleLineText' }
                        ]
                    }
                ]
            })
        );

        const options = await fetchSelectOptions('base1', 'tbl1', 'secret-token', fetchImpl);

        expect(options).toEqual({ Type: ['Monster', 'Spell'] });
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer secret-token');
    });

    it('throws when the table id is not found in the metadata', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ tables: [] }));

        await expect(fetchSelectOptions('base1', 'missing', 'token', fetchImpl))
            .rejects.toThrow(/not found/);
    });

    it('throws with the status on a non-ok response', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({ error: 'nope' }, { ok: false, status: 401, statusText: 'Unauthorized' })
        );

        await expect(fetchSelectOptions('base1', 'tbl1', 'bad-token', fetchImpl))
            .rejects.toThrow(/401/);
    });
});

describe('PRIVATE_FIELDS', () => {
    it('includes Set Price, so price is written to Airtable but never published', () => {
        expect(PRIVATE_FIELDS).toContain('Set Price');
    });
});
