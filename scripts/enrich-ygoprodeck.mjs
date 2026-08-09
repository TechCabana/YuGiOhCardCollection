/**
 * YGOPRODeck enrichment mapping.
 *
 * The owner types only a serial (set code). Everything else is fetched and
 * verified rather than typed, so the collection cannot drift from the real
 * card data.
 *
 * Pure functions only — no network, no Airtable. The fetching lives in
 * sync-airtable.mjs so these rules stay unit testable.
 */

/** Airtable's Type options. */
const TYPE_MONSTER = 'Monster';
const TYPE_SPELL = 'Spell';
const TYPE_TRAP = 'Trap';
const TYPE_TOKEN = 'Token';

/**
 * YGOPRODeck summon-type keywords, mapped to Airtable's Summon Type options.
 * Order matters: "Ritual Effect Monster" must match Ritual, so the longest
 * distinguishing keyword is checked first.
 */
const SUMMON_TYPES = [
    ['Fusion', 'Fusion'],
    ['Synchro', 'Synchro'],
    ['XYZ', 'XYZ'],
    ['Ritual', 'Ritual'],
    ['Link', 'Link']
];

/** Airtable field names this module writes. Everything else is human-owned. */
export const MACHINE_OWNED_FIELDS = [
    'Name',
    'Passcode',
    'Rarity',
    'Type',
    'Card Type',
    'Card Sign',
    'Summon Type',
    'HasEffect',
    'IsPendulum',
    'Attack',
    'Defense',
    'Level',
    'Set Name',
    'Set Price'
];

/** Fields the owner controls. A write must never include these. */
export const HUMAN_OWNED_FIELDS = ['Serial', 'Quantity', 'Condition'];

/**
 * Derive Airtable's Type from YGOPRODeck's `type` string.
 *
 * YGOPRODeck uses values like "Flip Effect Monster", "Spell Card", "Trap Card",
 * and plain "Token" for token cards (no Monster/Spell/Trap suffix at all).
 *
 * @param {string} ygoType - the `type` field from cardinfo
 * @returns {string|null} Monster, Spell, Trap, Token, or null when unrecognised
 */
export function deriveType(ygoType) {
    if (typeof ygoType !== 'string') return null;

    if (ygoType.includes('Token')) return TYPE_TOKEN;
    if (ygoType.includes('Monster')) return TYPE_MONSTER;
    if (ygoType.includes('Spell')) return TYPE_SPELL;
    if (ygoType.includes('Trap')) return TYPE_TRAP;

    return null;
}

/**
 * Derive the summon type from YGOPRODeck's `type` string.
 *
 * Anything without a special summon keyword is a main-deck monster, which
 * Airtable records as "None" rather than leaving blank.
 *
 * @param {string} ygoType - the `type` field from cardinfo
 * @returns {string} a Summon Type option; "None" for ordinary monsters
 */
export function deriveSummonType(ygoType) {
    if (typeof ygoType !== 'string') return 'None';

    for (const [keyword, option] of SUMMON_TYPES) {
        if (ygoType.includes(keyword)) return option;
    }

    return 'None';
}

/**
 * Whether a card has an effect.
 *
 * Covers "Effect Monster", "Flip Effect Monster", "Ritual Effect Monster" and
 * friends. Spells and traps always do something, but Airtable uses this flag
 * to distinguish Normal from Effect monsters, so they report false.
 *
 * @param {string} ygoType - the `type` field from cardinfo
 * @returns {boolean} true when the card is an effect monster
 */
export function hasEffect(ygoType) {
    if (typeof ygoType !== 'string') return false;
    return ygoType.includes('Monster') && ygoType.includes('Effect');
}

/**
 * Whether a card is a Pendulum monster.
 *
 * Pendulum is a separate flag rather than a Summon Type value because it is
 * not mutually exclusive with the others — "Pendulum Effect Fusion Monster"
 * is both Pendulum and Fusion, and a single-select could only record one.
 *
 * @param {string} ygoType - the `type` field from cardinfo
 * @returns {boolean} true when the card is a Pendulum monster
 */
export function isPendulum(ygoType) {
    if (typeof ygoType !== 'string') return false;
    return ygoType.includes('Pendulum');
}

/**
 * Convert YGOPRODeck's shouted attribute to Airtable's title case.
 *
 * YGOPRODeck returns LIGHT / DARK / WATER; Airtable stores Light / Dark / Water.
 *
 * @param {string} attribute - the `attribute` field from cardinfo
 * @returns {string|null} title-cased attribute, or null when absent
 */
export function deriveAttribute(attribute) {
    if (typeof attribute !== 'string' || attribute.trim() === '') return null;

    const lower = attribute.trim().toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Parse YGOPRODeck's price string into a number.
 *
 * Prices arrive as strings such as "1.92". A missing or unparseable value
 * becomes null rather than 0, so "unknown" is not confused with "free".
 *
 * @param {unknown} price - the `set_price` field from cardsetsinfo
 * @returns {number|null} the price, or null when unavailable
 */
export function parsePrice(price) {
    if (price === null || price === undefined) return null;

    const value = Number.parseFloat(price);
    return Number.isFinite(value) ? value : null;
}

/**
 * Build the Airtable field payload for one card.
 *
 * Emits only machine-owned fields. Values that YGOPRODeck did not supply are
 * omitted rather than written as null, so a partial response cannot blank a
 * field that already held a good value.
 *
 * @param {object} setInfo - a cardsetsinfo response
 * @param {object} cardInfo - a cardinfo `data[0]` entry
 * @returns {object} Airtable field names mapped to values
 */
export function buildEnrichedFields(setInfo, cardInfo) {
    const fields = {};

    if (setInfo?.name) fields['Name'] = setInfo.name;
    if (setInfo?.id !== undefined) fields['Passcode'] = String(setInfo.id);
    if (setInfo?.set_rarity) fields['Rarity'] = setInfo.set_rarity;
    if (setInfo?.set_name) fields['Set Name'] = setInfo.set_name;

    const price = parsePrice(setInfo?.set_price);
    if (price !== null) fields['Set Price'] = price;

    const type = deriveType(cardInfo?.type);
    if (type) fields['Type'] = type;

    if (cardInfo?.race) fields['Card Type'] = cardInfo.race;

    const attribute = deriveAttribute(cardInfo?.attribute);
    if (attribute) fields['Card Sign'] = attribute;

    if (type === TYPE_MONSTER) {
        fields['Summon Type'] = deriveSummonType(cardInfo?.type);
        fields['HasEffect'] = hasEffect(cardInfo?.type);
        fields['IsPendulum'] = isPendulum(cardInfo?.type);

        if (typeof cardInfo?.atk === 'number') fields['Attack'] = cardInfo.atk;
        if (typeof cardInfo?.def === 'number') fields['Defense'] = cardInfo.def;
        if (typeof cardInfo?.level === 'number') fields['Level'] = cardInfo.level;
    }

    return fields;
}

/**
 * Check a payload against the base's single-select options.
 *
 * Airtable rejects an unknown option outright, so this catches the problem
 * first and names it. The owner decides whether to add the option — options
 * are never created automatically, keeping the vocabulary deliberate.
 *
 * @param {object} fields - output of buildEnrichedFields
 * @param {Record<string, string[]>} selectOptions - field name to allowed values
 * @returns {{ok: boolean, problems: {field: string, value: string, allowed: string[]}[]}}
 */
export function validateSelectOptions(fields, selectOptions) {
    const problems = [];

    for (const [field, allowed] of Object.entries(selectOptions ?? {})) {
        const value = fields[field];
        if (value === undefined || value === null || value === '') continue;

        if (!allowed.includes(value)) {
            problems.push({ field, value, allowed });
        }
    }

    return { ok: problems.length === 0, problems };
}

/**
 * Confirm a payload touches nothing the owner controls.
 *
 * A sync that overwrote Quantity or Condition would destroy inventory data
 * that exists nowhere else.
 *
 * @param {object} fields - a payload about to be written
 * @throws {Error} when a human-owned field is present
 */
export function assertNoHumanOwnedFields(fields) {
    for (const field of Object.keys(fields ?? {})) {
        if (HUMAN_OWNED_FIELDS.includes(field)) {
            throw new Error(`Refusing to write human-owned field "${field}"`);
        }
    }
}

/**
 * Format an unmapped-option problem as an instruction the owner can act on.
 *
 * @param {string} serial - the row's serial, for locating it
 * @param {{field: string, value: string, allowed: string[]}} problem - a validation problem
 * @returns {string} a readable message
 */
export function describeProblem(serial, problem) {
    return `${serial}: "${problem.value}" is not an option for ${problem.field}. ` +
        `Add it in Airtable, or correct the serial. Current options: ${problem.allowed.join(', ')}.`;
}

/**
 * Fields the renderer and sync both depend on. A row missing any of these
 * must never be written — it would either fail to render or be silently
 * dropped later by sync-airtable.mjs's own "missing Name, Type or Rarity"
 * filter, but only after IsProcessed had already been set to true.
 */
export const REQUIRED_FIELDS = ['Name', 'Passcode', 'Rarity', 'Type'];

/**
 * Find which required fields a built payload is missing.
 *
 * The main case this catches is a `type` string deriveType cannot map (e.g.
 * an unreleased "Skill Card" or a new YGOPRODeck category): buildEnrichedFields
 * simply omits Type rather than guessing, and this is what turns that
 * omission into a blocking condition instead of a silent half-empty write.
 *
 * @param {object} fields - output of buildEnrichedFields
 * @returns {string[]} required field names absent (undefined, null or '') from the payload
 */
export function findMissingRequiredFields(fields) {
    return REQUIRED_FIELDS.filter(field => {
        const value = fields?.[field];
        return value === undefined || value === null || value === '';
    });
}

/**
 * Format a missing-required-field problem as an instruction the owner can act on.
 *
 * Named separately from describeProblem because the underlying problem is
 * different: not an option Airtable rejected, but a value that was never
 * derived in the first place, most often because deriveType did not
 * recognise YGOPRODeck's raw `type` string.
 *
 * @param {string} serial - the row's serial, for locating it
 * @param {string[]} missingFields - required field names absent from the payload
 * @param {string|undefined} rawType - the raw YGOPRODeck `type` value, for diagnosing an unmapped Type
 * @returns {string} a readable message
 */
export function describeMissingFields(serial, missingFields, rawType) {
    return `${serial}: missing required field(s) ${missingFields.join(', ')}. ` +
        `Raw YGOPRODeck type: "${rawType ?? 'unknown'}". Row left unprocessed for re-run.`;
}
