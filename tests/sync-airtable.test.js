import { describe, it, expect, vi } from 'vitest';
import { fetchAllRecords, serialise } from '../scripts/sync-airtable.mjs';

/**
 * Build a fake fetch response, mirroring the subset of the Fetch API
 * fetchAllRecords actually reads.
 */
function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
    return {
        ok,
        status,
        statusText,
        json: async () => body,
        text: async () => JSON.stringify(body)
    };
}

describe('fetchAllRecords', () => {
    it('returns every record from a single page', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({ records: [{ id: 'rec1' }, { id: 'rec2' }] })
        );

        const records = await fetchAllRecords('base', 'table', 'token', fetchImpl);

        expect(records).toEqual([{ id: 'rec1' }, { id: 'rec2' }]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('sends the token as a bearer header', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ records: [] }));

        await fetchAllRecords('base', 'table', 'secret-token', fetchImpl).catch(() => {});

        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer secret-token');
    });

    it('follows the offset token across multiple pages', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'a' }], offset: 'page2' }))
            .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'b' }], offset: 'page3' }))
            .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'c' }] }));

        const records = await fetchAllRecords('base', 'table', 'token', fetchImpl);

        expect(records.map(r => r.id)).toEqual(['a', 'b', 'c']);
        expect(fetchImpl).toHaveBeenCalledTimes(3);

        // The second and third requests must carry the offset the previous
        // response returned, or pagination silently restarts from page one.
        const secondUrl = fetchImpl.mock.calls[1][0];
        const thirdUrl = fetchImpl.mock.calls[2][0];
        expect(secondUrl.searchParams.get('offset')).toBe('page2');
        expect(thirdUrl.searchParams.get('offset')).toBe('page3');
    });

    it('stops once a response omits the offset', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ records: [{ id: 'only' }] }));

        await fetchAllRecords('base', 'table', 'token', fetchImpl);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('throws with the status on a non-ok response', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(jsonResponse({ error: 'nope' }, { ok: false, status: 401, statusText: 'Unauthorized' }));

        await expect(fetchAllRecords('base', 'table', 'bad-token', fetchImpl))
            .rejects.toThrow(/401/);
    });

    it('throws when the response has no records array', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ notRecords: [] }));

        await expect(fetchAllRecords('base', 'table', 'token', fetchImpl))
            .rejects.toThrow(/records array/);
    });

    it('aborts rather than looping forever when the offset never clears', async () => {
        // Every response hands back a fresh offset, simulating a malformed
        // or misbehaving pagination sequence that would otherwise never end.
        const fetchImpl = vi.fn().mockImplementation(async () =>
            jsonResponse({ records: [{ id: 'x' }], offset: 'always-more' })
        );

        await expect(fetchAllRecords('base', 'table', 'token', fetchImpl))
            .rejects.toThrow(/exceeded 200 pages/);

        // 200 pages must actually have been attempted before giving up,
        // not an early or late bail-out.
        expect(fetchImpl).toHaveBeenCalledTimes(201);
    }, 10000);
});

describe('serialise', () => {
    it('sorts keys alphabetically so diffs stay stable between runs', () => {
        const output = serialise([{ zebra: 1, apple: 2, mango: 3 }]);
        const parsed = JSON.parse(output);

        expect(Object.keys(parsed[0])).toEqual(['apple', 'mango', 'zebra']);
    });

    it('ends with a trailing newline', () => {
        expect(serialise([{ a: 1 }]).endsWith('\n')).toBe(true);
    });

    it('round-trips the same values it was given', () => {
        const cards = [{ id: 'rec1', name: 'Pot of Greed', atk: null }];
        expect(JSON.parse(serialise(cards))).toEqual(cards);
    });

    it('produces an empty array literal for no cards', () => {
        expect(JSON.parse(serialise([]))).toEqual([]);
    });
});
