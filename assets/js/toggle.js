/**
 * Toggle-button state.
 *
 * A filter pill and a view button both say "I am on" twice: once visually
 * through the `.active` class, and once to assistive technology through
 * `aria-pressed`. Two statements of the same fact drift apart the moment one
 * call site updates only the class it can see, and the version that drifts is
 * always the invisible one — nobody notices a wrong `aria-pressed` by looking.
 *
 * So neither is set directly anywhere. Both go through here.
 *
 * Takes any object with `classList` and `setAttribute`, which keeps it
 * testable without a DOM.
 */

/** The class the stylesheet uses for an engaged toggle. */
export const ACTIVE_CLASS = 'active';

/**
 * Set a toggle's visual and announced state together.
 *
 * @param {{classList: {toggle: Function}, setAttribute: Function}} element - the toggle
 * @param {boolean} isActive - whether the toggle is engaged
 * @returns {void}
 */
export function setToggleState(element, isActive) {
    if (!element) return;

    // Coerced rather than trusted: aria-pressed is a string enum, and
    // aria-pressed="undefined" is not a valid value — it reads as mixed or is
    // dropped entirely, depending on the screen reader.
    const active = isActive === true;

    element.classList.toggle(ACTIVE_CLASS, active);
    element.setAttribute('aria-pressed', String(active));
}

/**
 * Set the state of every toggle in a group, engaging at most one.
 *
 * Used by the view switch, where the buttons are mutually exclusive.
 *
 * @param {Iterable<object>} elements - the toggles in the group
 * @param {object} activeElement - the one to engage, or null for none
 * @returns {void}
 */
export function setExclusiveToggle(elements, activeElement) {
    for (const element of elements) {
        setToggleState(element, element === activeElement);
    }
}
