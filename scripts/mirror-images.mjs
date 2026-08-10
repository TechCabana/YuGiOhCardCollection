#!/usr/bin/env node
/**
 * Card art mirroring.
 *
 * YGOPRODeck asks callers not to hotlink their images per page view, so the art
 * is downloaded once during the data pipeline and committed into the repo. The
 * site then serves everything from its own origin: no third-party request per
 * card, no dependency on their uptime, and no rate limit hit by visitors.
 *
 * Mirroring is incremental. A passcode whose file already exists is never
 * fetched again, so a normal run downloads only the cards added since the last
 * one and costs nothing when the collection is unchanged.
 *
 * Usage:
 *   node scripts/mirror-images.mjs            # mirrors every card in data/cards.json
 *   node scripts/mirror-images.mjs --limit 5  # first 5 missing images only
 *
 * A single failed image is reported and skipped rather than thrown: one dead
 * passcode must not stop the rest of the collection from getting its art.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Where mirrored art is written. Served as-is by Pages. */
export const IMAGE_DIR = 'assets/cards';

/** Source of the artwork. The full-size face is 421x614. */
const IMAGE_BASE = 'https://images.ygoprodeck.com/images/cards';

/** Spacing between downloads, matching the restraint in ygoprodeck-client.mjs. */
const REQUEST_DELAY_MS = 120;

/** Largest response accepted, as a guard against a surprise multi-MB payload. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * A passcode is 1-8 digits in practice; 10 leaves headroom without admitting
 * anything that could climb out of IMAGE_DIR. Validated here rather than at the
 * point of use so the same rule governs the filename, the URL and the src
 * attribute the renderer emits.
 */
const PASSCODE_PATTERN = /^\d{1,10}$/;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Report whether a value is usable as a passcode.
 *
 * @param {unknown} passcode - candidate passcode
 * @returns {boolean} true when it is a short run of digits
 */
export function isValidPasscode(passcode) {
    return typeof passcode === 'string' && PASSCODE_PATTERN.test(passcode);
}

/**
 * Build the repo-relative path a passcode's art is mirrored to.
 *
 * @param {unknown} passcode - card passcode
 * @returns {string|null} the path, or null when the passcode is unusable
 */
export function imagePath(passcode) {
    return isValidPasscode(passcode) ? `${IMAGE_DIR}/${passcode}.jpg` : null;
}

/**
 * Build the upstream URL for a passcode's art.
 *
 * @param {unknown} passcode - card passcode
 * @returns {string|null} the URL, or null when the passcode is unusable
 */
export function imageUrl(passcode) {
    return isValidPasscode(passcode) ? `${IMAGE_BASE}/${passcode}.jpg` : null;
}

/**
 * Work out which cards still need their art downloaded.
 *
 * Deduplicates by passcode — two printings of the same card share one image —
 * and drops anything already on disk, which is what keeps a run incremental.
 *
 * @param {object[]} cards - cards from data/cards.json
 * @param {(path: string) => boolean} [existsFn] - injectable existence check
 * @returns {{missing: string[], invalid: object[], present: number}} work plan
 */
export function planDownloads(cards, existsFn = existsSync) {
    if (!Array.isArray(cards)) {
        throw new Error('Cards must be an array');
    }

    const missing = [];
    const invalid = [];
    const seen = new Set();
    let present = 0;

    for (const card of cards) {
        const passcode = card?.passcode;

        if (!isValidPasscode(passcode)) {
            // Recorded rather than dropped: a card with no passcode renders a
            // placeholder, and the owner needs to know which one to fix.
            invalid.push({ name: card?.name ?? '(unnamed)', passcode: passcode ?? '' });
            continue;
        }

        if (seen.has(passcode)) continue;
        seen.add(passcode);

        if (existsFn(imagePath(passcode))) {
            present += 1;
            continue;
        }

        missing.push(passcode);
    }

    return { missing, invalid, present };
}

/**
 * Download one image into the mirror directory.
 *
 * @param {string} passcode - card passcode
 * @param {object} [deps] - injectable dependencies
 * @param {typeof fetch} [deps.fetchImpl] - fetch implementation
 * @param {(path: string, data: Buffer) => void} [deps.writeFn] - file writer
 * @returns {Promise<{ok: boolean, bytes?: number, reason?: string}>} outcome
 */
export async function downloadImage(passcode, { fetchImpl = globalThis.fetch, writeFn = writeFileSync } = {}) {
    const url = imageUrl(passcode);
    if (!url) return { ok: false, reason: `Invalid passcode "${passcode}"` };

    let response;
    try {
        response = await fetchImpl(url);
    } catch (error) {
        return { ok: false, reason: `Request failed: ${error.message}` };
    }

    if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status} ${response.statusText}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
        return { ok: false, reason: 'Empty response body' };
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
        return { ok: false, reason: `Response larger than ${MAX_IMAGE_BYTES} bytes` };
    }

    // JPEG SOI marker. A rate-limit or error page served with a 200 would
    // otherwise be written to disk as a .jpg and render as a broken image.
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return { ok: false, reason: 'Response is not a JPEG' };
    }

    writeFn(imagePath(passcode), buffer);
    return { ok: true, bytes: buffer.length };
}

/**
 * Mirror every card image that is not already on disk.
 *
 * @param {object[]} cards - cards from data/cards.json
 * @param {object} [deps] - injectable dependencies
 * @param {typeof fetch} [deps.fetchImpl] - fetch implementation
 * @param {(path: string) => boolean} [deps.existsFn] - existence check
 * @param {(path: string, data: Buffer) => void} [deps.writeFn] - file writer
 * @param {number} [deps.delayMs] - spacing between requests
 * @param {number} [deps.limit] - cap on downloads this run
 * @param {(message: string) => void} [deps.log] - progress reporter
 * @returns {Promise<{downloaded: number, present: number, failed: object[], invalid: object[]}>}
 */
export async function mirrorImages(cards, {
    fetchImpl = globalThis.fetch,
    existsFn = existsSync,
    writeFn = writeFileSync,
    delayMs = REQUEST_DELAY_MS,
    limit = Infinity,
    log = () => {}
} = {}) {
    const { missing, invalid, present } = planDownloads(cards, existsFn);
    const queue = missing.slice(0, limit === Infinity ? missing.length : limit);

    const failed = [];
    let downloaded = 0;

    for (const [index, passcode] of queue.entries()) {
        // Spacing goes before every request but the first, so a single-image
        // run does not pay a delay it gains nothing from.
        if (index > 0) await sleep(delayMs);

        const result = await downloadImage(passcode, { fetchImpl, writeFn });

        if (result.ok) {
            downloaded += 1;
            log(`  ${passcode}.jpg (${Math.round(result.bytes / 1024)} KB)`);
        } else {
            failed.push({ passcode, reason: result.reason });
            log(`  ${passcode}.jpg FAILED — ${result.reason}`);
        }
    }

    return { downloaded, present, failed, invalid };
}

/**
 * Read the --limit flag, used to keep a manual run short.
 *
 * @param {string[]} argv - process arguments
 * @returns {number} the limit, or Infinity when absent
 */
export function parseLimit(argv) {
    const index = argv.indexOf('--limit');
    if (index === -1) return Infinity;

    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('--limit requires a positive integer');
    }

    return value;
}

async function main() {
    const limit = parseLimit(process.argv.slice(2));
    const cards = JSON.parse(readFileSync('data/cards.json', 'utf8'));

    mkdirSync(IMAGE_DIR, { recursive: true });

    console.log(`Mirroring card art into ${IMAGE_DIR}/…`);
    const { downloaded, present, failed, invalid } = await mirrorImages(cards, {
        limit,
        log: message => console.log(message)
    });

    console.log(`Already mirrored: ${present}. Downloaded: ${downloaded}.`);

    if (invalid.length > 0) {
        console.warn(`${invalid.length} card(s) have no usable passcode and will render a placeholder:`);
        for (const { name, passcode } of invalid) {
            console.warn(`  ${name} — passcode "${passcode}"`);
        }
    }

    if (failed.length > 0) {
        // Non-fatal by design: the cards that did download still ship. The
        // workflow surfaces this in the log without failing the data sync.
        console.warn(`${failed.length} image(s) could not be mirrored:`);
        for (const { passcode, reason } of failed) {
            console.warn(`  ${passcode} — ${reason}`);
        }
    }
}

// Only run when executed directly, never on import — tests import the helpers
// and must not trigger a network fetch or a file write by loading the module.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch(error => {
        console.error(`Mirroring failed: ${error.message}`);
        process.exit(1);
    });
}
