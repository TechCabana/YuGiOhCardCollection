import { describe, it, expect } from 'vitest';
import { isValidCard, normaliseCards, loadCards } from '../assets/js/data.js';

const validCard = { name: 'Dark Magician', type: 'monster', rarity: 'ultra' };

/** Build a stub Response good enough for loadCards. */
const stubResponse = ({ ok = true, status = 200, statusText = 'OK', json }) => ({
    ok,
    status,
    statusText,
    json: json ?? (async () => [validCard])
});

describe('isValidCard', () => {
    it('accepts a record carrying every required field', () => {
        expect(isValidCard(validCard)).toBe(true);
    });

    it('rejects a record missing a required field', () => {
        expect(isValidCard({ name: 'X', type: 'monster' })).toBe(false);
    });

    it('rejects blank and whitespace-only required fields', () => {
        expect(isValidCard({ ...validCard, name: '' })).toBe(false);
        expect(isValidCard({ ...validCard, name: '   ' })).toBe(false);
    });

    it('rejects non-string required fields', () => {
        expect(isValidCard({ ...validCard, name: 42 })).toBe(false);
    });

    it('rejects non-objects', () => {
        [null, undefined, 'card', 7, []].forEach(input => {
            expect(isValidCard(input)).toBe(false);
        });
    });
});

describe('normaliseCards', () => {
    it('keeps valid records and counts the discarded ones', () => {
        const result = normaliseCards([validCard, { name: 'broken' }, validCard]);
        expect(result.cards).toHaveLength(2);
        expect(result.skipped).toBe(1);
    });

    it('reports nothing skipped for a clean payload', () => {
        expect(normaliseCards([validCard]).skipped).toBe(0);
    });

    it('handles an empty array without throwing', () => {
        expect(normaliseCards([])).toEqual({ cards: [], skipped: 0 });
    });

    it('throws when the payload is not an array', () => {
        expect(() => normaliseCards({ cards: [] })).toThrow(/must be an array/);
        expect(() => normaliseCards(null)).toThrow(/must be an array/);
    });
});

describe('loadCards', () => {
    it('returns validated cards on success', async () => {
        const result = await loadCards('data/cards.json', async () => stubResponse({}));
        expect(result.cards).toHaveLength(1);
        expect(result.skipped).toBe(0);
    });

    it('surfaces a serve-over-HTTP hint when fetch rejects', async () => {
        const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
        await expect(loadCards('data/cards.json', fetchImpl))
            .rejects.toThrow(/serve it over HTTP/);
    });

    it('throws with the status on a non-OK response', async () => {
        const fetchImpl = async () => stubResponse({ ok: false, status: 404, statusText: 'Not Found' });
        await expect(loadCards('data/cards.json', fetchImpl))
            .rejects.toThrow(/404 Not Found/);
    });

    it('throws a readable error on malformed JSON', async () => {
        const fetchImpl = async () => stubResponse({
            json: async () => { throw new SyntaxError('Unexpected token'); }
        });
        await expect(loadCards('data/cards.json', fetchImpl))
            .rejects.toThrow(/not valid JSON/);
    });

    it('rejects rather than returning an empty page when the payload is malformed', async () => {
        const fetchImpl = async () => stubResponse({ json: async () => ({ nope: true }) });
        await expect(loadCards('data/cards.json', fetchImpl))
            .rejects.toThrow(/must be an array/);
    });
});
