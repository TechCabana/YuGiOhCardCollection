/**
 * Focus-restoration math for lists that get rebuilt in place.
 *
 * The facet panel and the chip tray both throw away and recreate their DOM
 * children on every filter change, including the change caused by the very
 * checkbox or chip the user just activated. Removing a focused element from
 * the document moves focus to <body> by default, so without this a keyboard
 * or screen-reader user loses their place after every tick or every chip
 * removed — the opposite of "individually removable" filters being usable.
 *
 * Pure and DOM-free, so the index arithmetic is testable without a browser;
 * the caller does the actual `.focus()` call once it has an index.
 */

/**
 * Work out which index should receive focus after a list shrinks by one.
 *
 * Removing the item at `oldIndex` means the item that followed it now sits at
 * `oldIndex`, so focusing that index keeps the cursor "in place" rather than
 * losing it. When the removed item was last, `oldIndex` no longer exists in
 * the new list, so the new last index is offered instead.
 *
 * @param {number} oldIndex - index of the item that held focus, or -1 if none did
 * @param {number} newLength - length of the rebuilt list
 * @returns {number} an index within the new list, or -1 when none applies
 */
export function focusIndexAfterRemoval(oldIndex, newLength) {
    if (oldIndex < 0 || newLength <= 0) return -1;
    return Math.min(oldIndex, newLength - 1);
}
