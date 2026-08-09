/**
 * YGOPRODeck API client.
 *
 * Two calls per card: the set code gives the passcode, name, set and rarity;
 * the passcode then gives type, race, attribute and stats.
 *
 * Kept thin and injectable so the enrichment logic can be tested without the
 * network.
 */

const API_BASE = 'https://db.ygoprodeck.com/api/v7';

/** Pause between requests. YGOPRODeck asks callers to be restrained. */
const REQUEST_DELAY_MS = 120;

/** Sleep helper used to space out sequential requests. */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch JSON with one retry on a server error.
 *
 * A 4xx is a permanent answer — an unknown set code is not going to become
 * known on a retry — so only 5xx is retried.
 *
 * @param {string} url - fully qualified request URL
 * @param {typeof fetch} fetchImpl - injectable fetch
 * @param {number} [attempt] - internal retry counter
 * @returns {Promise<object>} the parsed body
 */
async function fetchJson(url, fetchImpl, attempt = 0) {
    const response = await fetchImpl(url);

    if (response.status >= 500 && attempt === 0) {
        await sleep(500);
        return fetchJson(url, fetchImpl, attempt + 1);
    }

    // YGOPRODeck returns 400 with an {error} body for an unknown code.
    const payload = await response.json().catch(() => null);

    if (!payload) {
        throw new Error(`YGOPRODeck returned an unreadable response (${response.status}) for ${url}`);
    }

    return payload;
}

/**
 * Look up a printing by its set code.
 *
 * @param {string} setCode - e.g. "SDJ-017"
 * @param {typeof fetch} [fetchImpl] - injectable fetch
 * @returns {Promise<object|null>} the set info, or null when unknown
 */
export async function fetchSetInfo(setCode, fetchImpl = globalThis.fetch) {
    const url = `${API_BASE}/cardsetsinfo.php?setcode=${encodeURIComponent(setCode)}`;
    const payload = await fetchJson(url, fetchImpl);

    // An unknown code comes back as {error: "..."} rather than a 404.
    if (!payload || payload.error || payload.id === undefined) return null;

    return payload;
}

/**
 * Look up full card detail by passcode.
 *
 * @param {string|number} passcode - the card's passcode
 * @param {typeof fetch} [fetchImpl] - injectable fetch
 * @returns {Promise<object|null>} the card detail, or null when unknown
 */
export async function fetchCardInfo(passcode, fetchImpl = globalThis.fetch) {
    const url = `${API_BASE}/cardinfo.php?id=${encodeURIComponent(passcode)}`;
    const payload = await fetchJson(url, fetchImpl);

    if (!payload || payload.error || !Array.isArray(payload.data) || payload.data.length === 0) {
        return null;
    }

    return payload.data[0];
}

/**
 * Resolve one serial into both API responses.
 *
 * Returns a reason rather than throwing when a serial is unknown, so one bad
 * row cannot abort a whole sync.
 *
 * @param {string} setCode - the row's serial
 * @param {typeof fetch} [fetchImpl] - injectable fetch
 * @returns {Promise<{ok: boolean, setInfo?: object, cardInfo?: object, reason?: string}>}
 */
export async function resolveSerial(setCode, fetchImpl = globalThis.fetch) {
    const setInfo = await fetchSetInfo(setCode, fetchImpl);
    if (!setInfo) {
        return { ok: false, reason: `No YGOPRODeck match for set code "${setCode}"` };
    }

    await sleep(REQUEST_DELAY_MS);

    const cardInfo = await fetchCardInfo(setInfo.id, fetchImpl);
    if (!cardInfo) {
        return { ok: false, reason: `Set code "${setCode}" resolved to passcode ${setInfo.id}, which returned no card detail` };
    }

    return { ok: true, setInfo, cardInfo };
}
