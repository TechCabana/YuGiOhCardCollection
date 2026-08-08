/**
 * Keyboard helpers.
 *
 * Kept DOM-free — these take a plain element-like object — so the rules are
 * unit testable without a browser.
 */

/** Elements whose own keyboard behaviour must not be hijacked. */
const TEXT_ENTRY_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/**
 * Whether an event target is somewhere the user is entering text.
 *
 * Global shortcuts must stand down for these, otherwise pressing Left in the
 * search box moves the text cursor and the carousel at the same time.
 *
 * @param {{tagName?: string, isContentEditable?: boolean}|null} target - event target
 * @returns {boolean} true when the target accepts text input
 */
export function isTextEntryTarget(target) {
    if (!target) return false;

    // Covers any element made editable, not just form controls.
    if (target.isContentEditable === true) return true;

    const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
    return TEXT_ENTRY_TAGS.includes(tag);
}
