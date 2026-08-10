/**
 * Card frame derivation.
 *
 * Yu-Gi-Oh already has a colour system: the card frame. A Ritual monster is
 * blue, a Spell is teal-green, a Trap is magenta, and a player reads that
 * before they read the name. Using it here means colour carries the card's
 * type rather than decorating it — which is why the random pastel gradient
 * this replaces could be deleted outright rather than restyled.
 *
 * Derived at render time from fields the data already has, so the frame is
 * never stored: a card cannot end up with a colour that disagrees with its own
 * type, and nothing needs regenerating when the mapping changes.
 *
 * Pure and DOM-free, so every branch is directly testable.
 */

/** Every frame key, in the order the palette is documented. */
export const FRAME_KEYS = [
    'normal',
    'effect',
    'ritual',
    'fusion',
    'synchro',
    'xyz',
    'link',
    'spell',
    'trap',
    'token'
];

/** Short label shown on the type chip. */
export const FRAME_LABELS = {
    normal: 'Normal',
    effect: 'Effect',
    ritual: 'Ritual',
    fusion: 'Fusion',
    synchro: 'Synchro',
    xyz: 'XYZ',
    link: 'Link',
    spell: 'Spell',
    trap: 'Trap',
    token: 'Token'
};

/**
 * Airtable Summon Type to its frame, keyed lowercase.
 *
 * A summon type outranks the effect flag because that is how the real card is
 * printed: a Fusion monster with an effect has a purple frame, not an orange
 * one.
 */
const SUMMON_FRAMES = {
    fusion: 'fusion',
    synchro: 'synchro',
    xyz: 'xyz',
    ritual: 'ritual',
    link: 'link'
};

/** Airtable Type to its frame, for everything that is not a monster. */
const TYPE_FRAMES = {
    spell: 'spell',
    trap: 'trap',
    token: 'token'
};

/**
 * Work out which card frame a card belongs to.
 *
 * Returns null rather than guessing when the type is unknown — a new Airtable
 * Type would otherwise be shown in some other frame's colour, which is worse
 * than showing it in none. The caller falls back to a neutral surface.
 *
 * @param {object} card - a card record from data/cards.json
 * @returns {string|null} a key from FRAME_KEYS, or null when undeterminable
 */
export function cardFrame(card) {
    const type = typeof card?.type === 'string' ? card.type.trim().toLowerCase() : '';

    if (type in TYPE_FRAMES) return TYPE_FRAMES[type];
    if (type !== 'monster') return null;

    const summon = typeof card?.summonType === 'string' ? card.summonType.trim().toLowerCase() : '';
    if (summon in SUMMON_FRAMES) return SUMMON_FRAMES[summon];

    // cardType is the composed line, e.g. "Spellcaster / Effect". A monster
    // with no effect is a Normal monster, which is a frame in its own right,
    // so the absence of the word is meaningful rather than a missing value.
    const cardType = typeof card?.cardType === 'string' ? card.cardType : '';
    return /\bEffect\b/i.test(cardType) ? 'effect' : 'normal';
}

/**
 * Human-readable label for a frame.
 *
 * @param {string|null} frame - a frame key
 * @returns {string} the label, or an empty string for an unknown frame
 */
export function frameLabel(frame) {
    return FRAME_LABELS[frame] ?? '';
}
