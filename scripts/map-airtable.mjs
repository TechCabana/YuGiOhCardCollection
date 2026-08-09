/**
 * Airtable record mapping.
 *
 * Translates the Airtable column names and display values into the shape the
 * renderer expects. Kept pure and separate from the fetching code so the
 * mapping rules are unit testable without touching the network.
 *
 * Field names here must match the Airtable base exactly, including spaces.
 */

/**
 * Airtable columns that must never reach data/cards.json.
 *
 * The repo is public, so anything published is world-readable. These are
 * inventory and valuation details rather than card properties.
 */
export const PRIVATE_FIELDS = ['Condition', 'Quantity', 'Set Price'];

/** Airtable Type display value to the lowercase key the filters use. */
const TYPE_MAP = {
    Monster: 'monster',
    Spell: 'spell',
    Trap: 'trap',
    Token: 'token'
};

/** Airtable Rarity display value to the lowercase key the filters use. */
const RARITY_MAP = {
    'Common': 'common',
    'Rare': 'rare',
    'Super Rare': 'super',
    'Ultra Rare': 'ultra',
    'Secret Rare': 'secret',
    'Ultimate Rare': 'ultimate',
    "Collector's Rare": 'collector',
    'Ghost Rare': 'ghost',
    'Prismatic Secret Rare': 'prismatic',
    'Starlight Rare': 'starlight'
};

/**
 * Background gradient per card type.
 *
 * Placeholder styling until the design system rebuild replaces this with the
 * real card-frame colours. Each value matches the allowlist pattern that
 * render.js validates against.
 */
const TYPE_GRADIENTS = {
    monster: 'linear-gradient(135deg, #c9954f 0%, #8a5a2b 100%)',
    spell: 'linear-gradient(135deg, #1d9e8f 0%, #0d5f56 100%)',
    trap: 'linear-gradient(135deg, #b0347f 0%, #6b1f4d 100%)',
    token: 'linear-gradient(135deg, #9aa1ac 0%, #52565f 100%)'
};

/**
 * Placeholder glyph per card type, also pending the design rebuild.
 *
 * Deliberately has no `token` entry: CLAUDE.md §4 already lists emoji-as-UI-chrome
 * as a design smell to remove, not extend. render.js's escapeHtml(undefined)
 * renders an empty string, so a missing entry degrades cleanly.
 */
const TYPE_EMOJI = {
    monster: '⚔️',
    spell: '✨',
    trap: '🌀'
};

/**
 * Build the descriptive type line shown under a card name.
 *
 * Composes the Airtable race, summon type and effect flag into a single
 * string, e.g. "Spellcaster / Fusion / Effect".
 *
 * @param {object} fields - raw Airtable fields
 * @returns {string} display string, empty when nothing is known
 */
export function buildCardTypeLabel(fields) {
    const parts = [];

    if (fields['Card Type']) parts.push(fields['Card Type']);

    const summon = fields['Summon Type'];
    if (summon && summon !== 'None') parts.push(summon);

    if (fields['Type'] === 'Monster') {
        parts.push(fields['HasEffect'] ? 'Effect' : 'Normal');
    } else if (fields['Type']) {
        parts.push(fields['Type']);
    }

    return parts.join(' / ');
}

/**
 * Build the three stat boxes shown on a card.
 *
 * Monsters show combat stats; spells and traps have none, so they show
 * classification details instead.
 *
 * @param {object} fields - raw Airtable fields
 * @returns {{label: string, value: string}[]} exactly three stat entries
 */
export function buildStats(fields) {
    if (fields['Type'] === 'Monster') {
        return [
            { label: 'ATK', value: String(fields['Attack'] ?? '—') },
            { label: 'DEF', value: String(fields['Defense'] ?? '—') },
            { label: 'Level', value: fields['Level'] ? `⭐${fields['Level']}` : '—' }
        ];
    }

    return [
        { label: 'Type', value: fields['Type'] ?? '—' },
        { label: 'Attribute', value: fields['Card Sign'] || '—' },
        { label: 'Serial', value: fields['Serial'] ?? '—' }
    ];
}

/**
 * Map one Airtable record to a renderable card.
 *
 * Returns null for a record missing the fields the renderer depends on, so the
 * caller can count and report skipped rows rather than emitting broken cards.
 *
 * @param {{id: string, fields: object}} record - an Airtable record
 * @returns {object|null} a card object, or null when unusable
 */
export function mapRecord(record) {
    const fields = record?.fields;
    if (!fields) return null;

    const name = typeof fields['Name'] === 'string' ? fields['Name'].trim() : '';
    const type = TYPE_MAP[fields['Type']];
    const rarity = RARITY_MAP[fields['Rarity']];

    // name, type and rarity are what the filters and renderer require.
    if (!name || !type || !rarity) return null;

    const passcode = fields['Passcode'] ? String(fields['Passcode']).trim() : '';

    return {
        id: record.id,
        name,
        type,
        rarity,
        passcode,
        serial: fields['Serial'] ? String(fields['Serial']).trim() : '',
        cardType: buildCardTypeLabel(fields),
        summonType: fields['Summon Type'] && fields['Summon Type'] !== 'None'
            ? fields['Summon Type']
            : null,
        attribute: fields['Card Sign'] || null,
        atk: typeof fields['Attack'] === 'number' ? fields['Attack'] : null,
        def: typeof fields['Defense'] === 'number' ? fields['Defense'] : null,
        level: typeof fields['Level'] === 'number' ? fields['Level'] : null,
        gradient: TYPE_GRADIENTS[type],
        emoji: TYPE_EMOJI[type],
        stats: buildStats(fields)
    };
}

/**
 * Map a full set of Airtable records.
 *
 * Records are keyed by printing rather than by card, so two rows sharing a
 * passcode with different serials are both kept. Deduplication would lose a
 * printing from the collection.
 *
 * @param {{id: string, fields: object}[]} records - raw Airtable records
 * @returns {{cards: object[], skipped: number}} mapped cards and a skip count
 */
export function mapRecords(records) {
    if (!Array.isArray(records)) {
        throw new Error('Airtable records must be an array');
    }

    const cards = records.map(mapRecord).filter(Boolean);

    return { cards, skipped: records.length - cards.length };
}

/**
 * Confirm no private column leaked into the published output.
 *
 * A guard rather than a formality: the repo is public, so a mapping mistake
 * would publish inventory data permanently.
 *
 * @param {object[]} cards - mapped cards
 * @throws {Error} when a private field name appears on any card
 */
export function assertNoPrivateFields(cards) {
    const lowered = PRIVATE_FIELDS.map(f => f.toLowerCase());

    for (const card of cards) {
        for (const key of Object.keys(card)) {
            if (lowered.includes(key.toLowerCase())) {
                throw new Error(`Private field "${key}" must not be published to data/cards.json`);
            }
        }
    }
}
