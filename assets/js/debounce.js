/**
 * Debounce a function so rapid, repeated calls collapse into a single
 * invocation after activity settles.
 *
 * Used to throttle the search input handler: without this, every keystroke
 * would re-filter and re-render the full collection.
 *
 * @param {Function} fn - the function to debounce
 * @param {number} wait - milliseconds to wait after the last call before invoking fn
 * @returns {Function} a debounced wrapper around fn
 */
export function debounce(fn, wait) {
    let timeoutId = null;

    return function debounced(...args) {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn.apply(this, args);
        }, wait);
    };
}
