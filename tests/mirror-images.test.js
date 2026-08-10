import { describe, it, expect, vi } from 'vitest';
import {
    isValidPasscode,
    imagePath,
    imageUrl,
    planDownloads,
    downloadImage,
    mirrorImages,
    parseLimit,
    IMAGE_DIR
} from '../scripts/mirror-images.mjs';

/**
 * Guards the art mirror.
 *
 * The two behaviours worth protecting are that a run is incremental (an image
 * already on disk is never fetched again) and that a single bad image cannot
 * abort the rest of the collection.
 */

/** A minimal JPEG body: the SOI marker plus filler. */
const jpegBody = (size = 32) => {
    const buffer = Buffer.alloc(size, 0x41);
    buffer[0] = 0xff;
    buffer[1] = 0xd8;
    return buffer;
};

/** Build a fetch stub returning a JPEG for every request. */
const okFetch = (body = jpegBody()) => vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
}));

const card = (passcode, name = 'Card') => ({ name, passcode });

describe('isValidPasscode', () => {
    it('accepts a run of digits', () => {
        expect(isValidPasscode('54652250')).toBe(true);
        expect(isValidPasscode('7')).toBe(true);
    });

    it('rejects anything that is not a short digit string', () => {
        ['', '   ', 'abc', '12345678901', '../../etc/passwd', '12 34', '1.2'].forEach(value => {
            expect(isValidPasscode(value)).toBe(false);
        });
    });

    it('rejects non-string values', () => {
        [undefined, null, 54652250, {}, []].forEach(value => {
            expect(isValidPasscode(value)).toBe(false);
        });
    });
});

describe('imagePath and imageUrl', () => {
    it('builds both from the passcode', () => {
        expect(imagePath('54652250')).toBe(`${IMAGE_DIR}/54652250.jpg`);
        expect(imageUrl('54652250')).toBe('https://images.ygoprodeck.com/images/cards/54652250.jpg');
    });

    it('returns null rather than a traversable path for a bad passcode', () => {
        expect(imagePath('../../secrets')).toBeNull();
        expect(imageUrl('../../secrets')).toBeNull();
        expect(imagePath(undefined)).toBeNull();
    });
});

describe('planDownloads', () => {
    it('queues only the passcodes that are not already on disk', () => {
        const onDisk = new Set([`${IMAGE_DIR}/111.jpg`]);
        const plan = planDownloads([card('111'), card('222')], path => onDisk.has(path));

        expect(plan.missing).toEqual(['222']);
        expect(plan.present).toBe(1);
    });

    it('deduplicates two printings that share a passcode', () => {
        const plan = planDownloads([card('111', 'SDJ print'), card('111', 'LOB print')], () => false);
        expect(plan.missing).toEqual(['111']);
    });

    it('reports cards with an unusable passcode instead of dropping them silently', () => {
        const plan = planDownloads([card('', 'No passcode'), card('abc', 'Bad passcode')], () => false);

        expect(plan.missing).toEqual([]);
        expect(plan.invalid).toEqual([
            { name: 'No passcode', passcode: '' },
            { name: 'Bad passcode', passcode: 'abc' }
        ]);
    });

    it('tolerates null entries in the card list', () => {
        const plan = planDownloads([null, undefined], () => false);
        expect(plan.missing).toEqual([]);
        expect(plan.invalid).toHaveLength(2);
    });

    it('throws when given something that is not an array', () => {
        expect(() => planDownloads('cards', () => false)).toThrow(/must be an array/);
    });
});

describe('downloadImage', () => {
    it('writes the body to the mirror path', async () => {
        const writeFn = vi.fn();
        const result = await downloadImage('54652250', { fetchImpl: okFetch(), writeFn });

        expect(result.ok).toBe(true);
        expect(writeFn).toHaveBeenCalledWith(`${IMAGE_DIR}/54652250.jpg`, expect.any(Buffer));
    });

    it('reports an HTTP failure without writing', async () => {
        const writeFn = vi.fn();
        const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }));

        const result = await downloadImage('54652250', { fetchImpl, writeFn });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('404');
        expect(writeFn).not.toHaveBeenCalled();
    });

    it('reports a network error rather than throwing', async () => {
        const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
        const result = await downloadImage('54652250', { fetchImpl, writeFn: vi.fn() });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('ECONNRESET');
    });

    // An error page served with a 200 would otherwise be saved as a .jpg.
    it('rejects a 200 response that is not a JPEG', async () => {
        const writeFn = vi.fn();
        const html = Buffer.from('<html>rate limited</html>');
        const result = await downloadImage('54652250', { fetchImpl: okFetch(html), writeFn });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('not a JPEG');
        expect(writeFn).not.toHaveBeenCalled();
    });

    it('rejects an empty body', async () => {
        const result = await downloadImage('54652250', {
            fetchImpl: okFetch(Buffer.alloc(0)),
            writeFn: vi.fn()
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Empty');
    });

    it('rejects an oversized body', async () => {
        const result = await downloadImage('54652250', {
            fetchImpl: okFetch(jpegBody(3 * 1024 * 1024)),
            writeFn: vi.fn()
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('larger than');
    });

    it('never requests an invalid passcode', async () => {
        const fetchImpl = vi.fn();
        const result = await downloadImage('../evil', { fetchImpl, writeFn: vi.fn() });

        expect(result.ok).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('mirrorImages', () => {
    const deps = overrides => ({
        existsFn: () => false,
        writeFn: vi.fn(),
        delayMs: 0,
        ...overrides
    });

    it('downloads every missing image', async () => {
        const fetchImpl = okFetch();
        const result = await mirrorImages([card('111'), card('222')], deps({ fetchImpl }));

        expect(result.downloaded).toBe(2);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.failed).toEqual([]);
    });

    it('fetches nothing when every image is already mirrored', async () => {
        const fetchImpl = okFetch();
        const result = await mirrorImages([card('111')], deps({ fetchImpl, existsFn: () => true }));

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.downloaded).toBe(0);
        expect(result.present).toBe(1);
    });

    // The card's own requirement: one dead passcode must not stop the rest.
    it('carries on after a failure and reports it', async () => {
        const fetchImpl = vi.fn(async url =>
            url.includes('222')
                ? { ok: false, status: 404, statusText: 'Not Found' }
                : (await okFetch()())
        );

        const result = await mirrorImages(
            [card('111'), card('222'), card('333')],
            deps({ fetchImpl })
        );

        expect(result.downloaded).toBe(2);
        expect(result.failed).toEqual([{ passcode: '222', reason: 'HTTP 404 Not Found' }]);
    });

    it('honours a limit so a manual run stays short', async () => {
        const fetchImpl = okFetch();
        const result = await mirrorImages(
            [card('111'), card('222'), card('333')],
            deps({ fetchImpl, limit: 2 })
        );

        expect(result.downloaded).toBe(2);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('passes cards with no passcode through as invalid rather than failing', async () => {
        const result = await mirrorImages([card('', 'Unmatched')], deps({ fetchImpl: okFetch() }));

        expect(result.invalid).toEqual([{ name: 'Unmatched', passcode: '' }]);
        expect(result.failed).toEqual([]);
    });
});

describe('parseLimit', () => {
    it('returns Infinity when the flag is absent', () => {
        expect(parseLimit([])).toBe(Infinity);
    });

    it('reads a positive integer', () => {
        expect(parseLimit(['--limit', '5'])).toBe(5);
    });

    it('rejects a non-positive or non-integer value', () => {
        expect(() => parseLimit(['--limit', '0'])).toThrow(/positive integer/);
        expect(() => parseLimit(['--limit', 'many'])).toThrow(/positive integer/);
        expect(() => parseLimit(['--limit'])).toThrow(/positive integer/);
    });
});
