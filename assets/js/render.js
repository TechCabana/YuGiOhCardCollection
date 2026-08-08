/**
 * Card markup construction.
 *
 * Every value that reaches the DOM passes through escapeHtml first. Card data
 * comes from Airtable, which is user-editable, so all of it is untrusted — a
 * card named `<img src=x onerror=...>` must render as text, not execute.
 *
 * Functions here return strings and touch no DOM, so the escaping behaviour is
 * directly testable.
 */

import { escapeHtml } from './filters.js';

/** Human-readable labels for the rarity values used in the data. */
export const RARITY_LABELS = {
    common: 'Common',
    rare: 'Rare',
    super: 'Super Rare',
    ultra: 'Ultra Rare',
    secret: 'Secret Rare'
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
            ${escapeHtml(card.emoji)}
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
