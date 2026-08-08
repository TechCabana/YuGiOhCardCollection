#!/usr/bin/env node
/**
 * Airtable to data/cards.json sync.
 *
 * Runs in CI, never in the browser. Airtable has no read-only public key, so a
 * token shipped to the client would grant read and write on the base to anyone
 * viewing source. Fetching at build time keeps the token in GitHub Secrets and
 * ships a static file.
 *
 * Usage:
 *   AIRTABLE_TOKEN=... AIRTABLE_BASE_ID=... AIRTABLE_TABLE_ID=... node scripts/sync-airtable.mjs
 *
 * Exits non-zero on any failure, so a bad run fails the workflow rather than
 * committing a truncated or empty collection.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { mapRecords, assertNoPrivateFields } from './map-airtable.mjs';

const OUTPUT_PATH = 'data/cards.json';
const PAGE_SIZE = 100;

/**
 * Read a required environment variable, or exit with a clear message.
 *
 * @param {string} name - variable name
 * @returns {string} the value
 */
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

/**
 * Fetch every record from the table, following Airtable's pagination.
 *
 * Airtable returns at most 100 records per request and supplies an offset
 * token when more remain.
 *
 * @param {string} baseId - Airtable base id
 * @param {string} tableId - Airtable table id
 * @param {string} token - Airtable personal access token
 * @returns {Promise<object[]>} every record in the table
 */
async function fetchAllRecords(baseId, tableId, token) {
    const records = [];
    let offset;
    let page = 0;

    do {
        const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
        url.searchParams.set('pageSize', String(PAGE_SIZE));
        if (offset) url.searchParams.set('offset', offset);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `Airtable request failed: ${response.status} ${response.statusText}. ${body.slice(0, 200)}`
            );
        }

        const payload = await response.json();

        if (!Array.isArray(payload.records)) {
            throw new Error('Airtable response did not contain a records array');
        }

        records.push(...payload.records);
        offset = payload.offset;
        page += 1;

        // A malformed offset that never clears would otherwise loop forever.
        if (page > 200) {
            throw new Error('Aborting: exceeded 200 pages, Airtable pagination did not terminate');
        }
    } while (offset);

    return records;
}

/**
 * Serialise cards with stable key order so diffs stay readable between runs.
 *
 * @param {object[]} cards - mapped cards
 * @returns {string} JSON text with a trailing newline
 */
function serialise(cards) {
    const ordered = cards.map(card =>
        Object.fromEntries(Object.keys(card).sort().map(key => [key, card[key]]))
    );
    return JSON.stringify(ordered, null, 2) + '\n';
}

async function main() {
    const token = requireEnv('AIRTABLE_TOKEN');
    const baseId = requireEnv('AIRTABLE_BASE_ID');
    const tableId = requireEnv('AIRTABLE_TABLE_ID');

    console.log(`Fetching records from base ${baseId}, table ${tableId}…`);
    const records = await fetchAllRecords(baseId, tableId, token);
    console.log(`Fetched ${records.length} record(s).`);

    if (records.length === 0) {
        throw new Error('Airtable returned zero records. Refusing to publish an empty collection.');
    }

    const { cards, skipped } = mapRecords(records);

    if (skipped > 0) {
        console.warn(`Skipped ${skipped} record(s) missing Name, Type or Rarity.`);
    }

    if (cards.length === 0) {
        throw new Error('No usable records after mapping. Refusing to overwrite the collection.');
    }

    // The repo is public — a mapping mistake would publish inventory data.
    assertNoPrivateFields(cards);

    const next = serialise(cards);
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : '';

    if (next === current) {
        console.log('No change. data/cards.json is already up to date.');
        return;
    }

    writeFileSync(OUTPUT_PATH, next);
    console.log(`Wrote ${cards.length} card(s) to ${OUTPUT_PATH}.`);
}

main().catch(error => {
    console.error(`Sync failed: ${error.message}`);
    process.exit(1);
});
