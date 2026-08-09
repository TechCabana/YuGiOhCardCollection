/**
 * Which card view belongs on screen.
 *
 * Visibility has two independent inputs: the view the user picked, and whether
 * the collection has finished loading. Those used to be expressed in three
 * different ways at once (a `.hidden` class on the carousel, an `.active` class
 * on the grid, and the `hidden` attribute on both during load), so the answer
 * depended on which mechanism ran last. Deciding it here, in one pure function,
 * gives the DOM code a single source of truth and makes the rules testable
 * without a browser.
 */

/** The carousel view identifier, as used by the toolbar's `data-view`. */
export const VIEW_CAROUSEL = 'carousel';

/** The grid view identifier, as used by the toolbar's `data-view`. */
export const VIEW_GRID = 'grid';

/** Every view the toolbar can select. */
export const VIEWS = [VIEW_CAROUSEL, VIEW_GRID];

/**
 * Whether a value names a view this app knows how to render.
 *
 * @param {unknown} view - candidate view identifier
 * @returns {boolean} true when the value is a known view
 */
export function isValidView(view) {
    return VIEWS.includes(view);
}

/**
 * Coerce any value to a usable view identifier.
 *
 * `data-view` comes from markup, so a typo or a missing attribute must not be
 * able to blank the page. Anything unrecognised falls back to the carousel,
 * which is the view the app opens on.
 *
 * @param {unknown} view - candidate view identifier
 * @returns {string} a known view identifier
 */
export function normaliseView(view) {
    return isValidView(view) ? view : VIEW_CAROUSEL;
}

/**
 * Work out which views should be visible.
 *
 * Exactly one view is ever shown, and only once the data has resolved. While
 * loading or after a failure both are hidden, so the page never flashes empty
 * controls over a blank stage.
 *
 * @param {unknown} view - the currently selected view identifier
 * @param {boolean} isDataReady - whether the collection has loaded
 * @returns {{carousel: boolean, grid: boolean}} visibility per view
 */
export function getViewVisibility(view, isDataReady) {
    if (!isDataReady) {
        return { carousel: false, grid: false };
    }

    const active = normaliseView(view);
    return {
        carousel: active === VIEW_CAROUSEL,
        grid: active === VIEW_GRID
    };
}
