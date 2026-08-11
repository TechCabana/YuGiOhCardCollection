/**
 * Card data loading.
 *
 * Data lives in data/cards.json rather than in source, so the Airtable sync can
 * overwrite that one file without any code change. Nothing here knows or cares
 * whether the file was hand-written or generated.
 */

/** Location of the collection data, relative to the page. */
export const DATA_URL = 'data/cards.json';

/**
 * Add a cache-busting stamp to the data URL.
 *
 * Pages serves `cards.json` with caching headers, so a plain re-fetch can hand
 * back the copy the browser already has — which would make the refresh button
 * look broken in exactly the case it exists for.
 *
 * The stamp is the current second, not a random value: repeated clicks inside
 * one second produce the same URL and hit the browser cache rather than
 * hammering the network, while anything a second later gets a fresh fetch.
 *
 * @param {number} [now] - milliseconds since the epoch, injectable for tests
 * @param {string} [url] - base URL, overridable for tests
 * @returns {string} the URL with a `t` query parameter
 */
export function cacheBustedUrl(now = Date.now(), url = DATA_URL) {
    const seconds = Math.floor(now / 1000);
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${seconds}`;
}

/**
 * Format a fetch time for the "updated" label.
 *
 * Local 24-hour time, built by hand rather than through toLocaleTimeString so
 * the output does not change with the runner's locale — a test that passes on
 * one machine and fails on another is worse than no test.
 *
 * `cards.json` carries no timestamp of its own and Airtable record ids are not
 * time-ordered, so the fetch time is the only honest answer available: it says
 * when this page last looked, not when the data was last written.
 *
 * @param {Date} [date] - the moment of the fetch
 * @returns {string} a label such as "Updated 14:32"
 */
export function formatUpdatedAt(date = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `Updated ${hours}:${minutes}`;
}

/**
 * Fields every card must carry for the render path to work.
 * A record missing any of these is dropped rather than rendered half-blank.
 */
const REQUIRED_FIELDS = ['name', 'type', 'rarity'];

/**
 * Check that a record has the fields the renderer depends on.
 *
 * @param {unknown} card - a parsed record
 * @returns {boolean} true when the record is usable
 */
export function isValidCard(card) {
    if (!card || typeof card !== 'object') return false;

    return REQUIRED_FIELDS.every(field =>
        typeof card[field] === 'string' && card[field].trim() !== ''
    );
}

/**
 * Normalise a parsed payload into a usable card array.
 *
 * Invalid records are discarded rather than allowed to reach the renderer,
 * because Airtable will eventually be the source and a half-filled row should
 * not break the page.
 *
 * @param {unknown} payload - parsed JSON
 * @returns {{cards: object[], skipped: number}} valid cards and a discard count
 */
export function normaliseCards(payload) {
    if (!Array.isArray(payload)) {
        throw new Error('Card data must be an array');
    }

    const cards = payload.filter(isValidCard);

    return { cards, skipped: payload.length - cards.length };
}

/**
 * Fetch and validate the collection.
 *
 * Rejects with a readable message on a network failure, a non-OK response, or
 * malformed JSON, so the caller can show a real error state rather than an
 * empty page.
 *
 * @param {string} [url] - override the data location, used by tests
 * @param {typeof fetch} [fetchImpl] - injectable fetch, used by tests
 * @returns {Promise<{cards: object[], skipped: number}>}
 */
export async function loadCards(url = DATA_URL, fetchImpl = globalThis.fetch) {
    let response;

    try {
        response = await fetchImpl(url);
    } catch (cause) {
        // Covers offline, DNS failure, and the file:// CORS case.
        throw new Error(`Could not reach ${url}. If you opened this page from disk, serve it over HTTP instead.`, { cause });
    }

    if (!response.ok) {
        throw new Error(`Card data request failed with ${response.status} ${response.statusText}`);
    }

    let payload;
    try {
        payload = await response.json();
    } catch (cause) {
        throw new Error(`Card data at ${url} is not valid JSON`, { cause });
    }

    return normaliseCards(payload);
}
