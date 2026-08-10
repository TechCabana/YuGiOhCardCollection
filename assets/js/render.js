/**
 * Card markup construction.
 *
 * Every value that reaches the DOM passes through escapeHtml first. Card data
 * comes from Airtable, which is user-editable, so all of it is untrusted — a
 * card named `<img src=x onerror=...>` must render as text, not execute.
 *
 * Two values cannot be handled by escaping alone, because they end up inside an
 * attribute the browser acts on rather than displays: the gradient in a style
 * attribute and the art path in a src. Both go through an allowlist instead —
 * see safeGradient and safeImagePath.
 *
 * Functions here return strings and touch no DOM, so the escaping behaviour is
 * directly testable.
 */

import { escapeHtml } from './filters.js';

/**
 * Human-readable labels for the rarity values used in the data.
 * Keys mirror RARITY_ORDER in filters.js and the Airtable Rarity options.
 */
export const RARITY_LABELS = {
    common: 'Common',
    rare: 'Rare',
    super: 'Super Rare',
    ultra: 'Ultra Rare',
    ultimate: 'Ultimate Rare',
    secret: 'Secret Rare',
    prismatic: 'Prismatic Secret Rare',
    collector: "Collector's Rare",
    ghost: 'Ghost Rare',
    starlight: 'Starlight Rare'
};

/**
 * CSS gradients are injected into a style attribute, so they cannot simply be
 * escaped — a quote-free payload could still close the declaration and add
 * properties. Only this exact shape is allowed through.
 *
 * Matches: linear-gradient(<angle>deg, <colour> <pct>%, <colour> <pct>%)
 */
const SAFE_GRADIENT = /^linear-gradient\(\s*\d{1,3}deg\s*,\s*#[0-9a-f]{3,8}\s+\d{1,3}%\s*,\s*#[0-9a-f]{3,8}\s+\d{1,3}%\s*\)$/i;

/** Fallback used when a gradient is missing or fails validation. */
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

/**
 * Mirrored card art lives at assets/cards/<passcode>.jpg and nowhere else, so
 * the src is checked against that exact shape rather than merely escaped. A
 * path is not a text node: escaping stops attribute break-out but would still
 * happily emit `//evil.example/x.jpg` or a data: URI as a real request.
 *
 * The rule mirrors isValidPasscode in scripts/mirror-images.mjs. It is stated
 * twice on purpose — this half runs in the browser and cannot import a script
 * that pulls in node:fs.
 */
const SAFE_IMAGE_PATH = /^assets\/cards\/\d{1,10}\.jpg$/;

/**
 * Intrinsic size of a YGOPRODeck card face.
 *
 * Emitted as width/height attributes so the browser reserves the right box
 * before the image arrives. 421/614 is 0.6857 against the true card ratio of
 * 59/86 = 0.6860, so the reserved box and the CSS aspect-ratio agree and
 * nothing shifts on load.
 */
const IMAGE_WIDTH = 421;
const IMAGE_HEIGHT = 614;

/**
 * Return a gradient only if it matches the expected shape.
 *
 * Anything else falls back to the default, so a malicious or malformed value
 * can never reach the style attribute.
 *
 * @param {unknown} gradient - candidate CSS gradient
 * @returns {string} a gradient safe to interpolate into a style attribute
 */
export function safeGradient(gradient) {
    if (typeof gradient !== 'string') return DEFAULT_GRADIENT;
    return SAFE_GRADIENT.test(gradient.trim()) ? gradient.trim() : DEFAULT_GRADIENT;
}

/**
 * Return a card art path only if it points inside the mirror directory.
 *
 * @param {unknown} image - candidate image path from the data
 * @returns {string|null} a path safe to use as a src, or null
 */
export function safeImagePath(image) {
    if (typeof image !== 'string') return null;
    const trimmed = image.trim();
    return SAFE_IMAGE_PATH.test(trimmed) ? trimmed : null;
}

/**
 * Build the art element for a card.
 *
 * Returns an empty string when there is no usable image, which leaves the
 * type-coloured ground of .card-image-area showing on its own.
 *
 * A src that passes safeImagePath still is not a guarantee the file exists:
 * mirror-images.mjs assigns the path from the passcode alone at sync time,
 * before the download runs, and a single failed download is deliberately
 * non-fatal (mirror-images.mjs, process-data.yml) so the card's data still
 * ships. That leaves a real gap between "has a plausible path" and "has art
 * on disk" until the next sync retries it. The onerror handler closes that
 * gap client-side: it removes the broken <img> so the ground shows through
 * cleanly, the same placeholder treatment as a missing passcode gets. The
 * handler is a fixed string, not built from card data, so it carries none of
 * the injection risk escapeHtml/safeImagePath exist to prevent.
 *
 * The alt is deliberately empty: the card name is rendered as adjacent text in
 * .card-name, so a descriptive alt would make a screen reader announce the same
 * name twice.
 *
 * @param {object} card - a card record
 * @returns {string} an img tag, or an empty string
 */
export function buildCardImageHTML(card) {
    const src = safeImagePath(card?.image);
    if (!src) return '';

    return `<img class="card-image" src="${src}" alt="" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" loading="lazy" decoding="async" onerror="this.remove()">`;
}

/**
 * Map a rarity value to its display label.
 *
 * Unknown values are echoed back escaped rather than dropped, so a new Airtable
 * rarity shows up instead of silently vanishing.
 *
 * @param {unknown} rarity - rarity key from the data
 * @returns {string} escaped, human-readable label
 */
export function rarityLabel(rarity) {
    return escapeHtml(RARITY_LABELS[rarity] ?? rarity ?? '');
}

/**
 * Build the stat boxes shown beneath a card name.
 *
 * @param {{label: string, value: string}[]} stats - stat entries
 * @returns {string} escaped HTML for the stat grid
 */
export function buildStatsHTML(stats) {
    if (!Array.isArray(stats)) return '';

    return stats.map(stat => {
        const label = escapeHtml(stat?.label);
        const value = escapeHtml(stat?.value);
        // Serials are long, so they get a smaller type size.
        const style = stat?.label === 'Serial' ? ' style="font-size: 0.8rem;"' : '';

        return `
        <div class="stat-box">
            <div class="stat-label">${label}</div>
            <div class="stat-value"${style}>${value}</div>
        </div>
    `;
    }).join('');
}

/**
 * Build the inner markup for a single card.
 *
 * @param {object} card - a card record
 * @returns {string} escaped HTML, safe to assign to innerHTML
 */
export function buildCardHTML(card) {
    if (!card || typeof card !== 'object') return '';

    return `
        <div class="card-image-area" style="background: ${safeGradient(card.gradient)};">
            ${buildCardImageHTML(card)}
            <div class="rarity-badge">${rarityLabel(card.rarity)}</div>
        </div>
        <div class="card-info-area">
            <div class="card-name">${escapeHtml(card.name)}</div>
            <div class="card-type">${escapeHtml(card.cardType)}</div>
            <div class="card-stats-grid">
                ${buildStatsHTML(card.stats)}
            </div>
        </div>
    `;
}
