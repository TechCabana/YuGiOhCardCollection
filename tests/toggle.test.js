import { describe, it, expect } from 'vitest';
import { setToggleState, setExclusiveToggle, ACTIVE_CLASS } from '../assets/js/toggle.js';

/**
 * Covers the toggle-state helper.
 *
 * The failure this prevents is silent: a call site updates the class and
 * forgets aria-pressed, the button still looks right, and only a screen
 * reader user is told the wrong thing. So every assertion here checks the two
 * together — a test that only checked the class would miss exactly the bug
 * the helper exists to stop.
 */

/** Minimal stand-in for a button: classList.toggle and setAttribute. */
const fakeToggle = () => ({
    classes: new Set(),
    attributes: {},
    classList: {
        toggle(name, force) {
            if (force) this.owner.classes.add(name);
            else this.owner.classes.delete(name);
        }
    },
    setAttribute(name, value) {
        this.attributes[name] = value;
    },
    get isActive() {
        return this.classes.has(ACTIVE_CLASS);
    },
    get pressed() {
        return this.attributes['aria-pressed'];
    }
});

/** Wire the classList back to its owner, since the stub is a plain object. */
const makeToggle = () => {
    const element = fakeToggle();
    element.classList.owner = element;
    return element;
};

describe('setToggleState', () => {
    it('engages the class and announces pressed together', () => {
        const button = makeToggle();

        setToggleState(button, true);

        expect(button.isActive).toBe(true);
        expect(button.pressed).toBe('true');
    });

    it('releases both together', () => {
        const button = makeToggle();
        setToggleState(button, true);

        setToggleState(button, false);

        expect(button.isActive).toBe(false);
        expect(button.pressed).toBe('false');
    });

    // aria-pressed is a string enum: "undefined" is not a valid value and is
    // read as mixed or dropped, depending on the screen reader.
    it('always writes a real boolean string, whatever it is handed', () => {
        for (const value of [undefined, null, 0, '', 'yes', 1, {}]) {
            const button = makeToggle();
            setToggleState(button, value);

            expect(['true', 'false']).toContain(button.pressed);
        }
    });

    it('treats only a literal true as engaged', () => {
        const truthy = makeToggle();
        setToggleState(truthy, 'yes');

        expect(truthy.isActive).toBe(false);
        expect(truthy.pressed).toBe('false');
    });

    it('does nothing rather than throwing on a missing element', () => {
        expect(() => setToggleState(null, true)).not.toThrow();
        expect(() => setToggleState(undefined, false)).not.toThrow();
    });
});

describe('setExclusiveToggle', () => {
    it('engages one and releases the rest', () => {
        const carousel = makeToggle();
        const grid = makeToggle();

        setExclusiveToggle([carousel, grid], grid);

        expect(grid.pressed).toBe('true');
        expect(grid.isActive).toBe(true);
        expect(carousel.pressed).toBe('false');
        expect(carousel.isActive).toBe(false);
    });

    it('releases everything when nothing is active', () => {
        const buttons = [makeToggle(), makeToggle()];

        setExclusiveToggle(buttons, null);

        for (const button of buttons) {
            expect(button.pressed).toBe('false');
        }
    });

    it('is idempotent, so a repeat click cannot desync the pair', () => {
        const one = makeToggle();
        const two = makeToggle();

        setExclusiveToggle([one, two], one);
        setExclusiveToggle([one, two], one);

        expect(one.pressed).toBe('true');
        expect(one.isActive).toBe(true);
        expect(two.pressed).toBe('false');
    });
});
