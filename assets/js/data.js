/**
 * Card data loading.
 *
 * Data lives in data/cards.json rather than in source, so the Airtable sync can
 * overwrite that one file without any code change. Nothing here knows or cares
 * whether the file was hand-written or generated.
 */

/** Location of the collection data, relative to the page. */
const DATA_URL = 'data/cards.json';

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
