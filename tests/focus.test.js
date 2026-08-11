import { describe, it, expect } from 'vitest';
import { focusIndexAfterRemoval } from '../assets/js/focus.js';

/**
 * Covers the index arithmetic behind the chip-tray and facet-panel focus fix.
 *
 * The failure this prevents is invisible in a click test but real for a
 * keyboard or screen-reader user: replacing a focused element's parent's
 * children drops focus to <body>, and every one of these values decides
 * where it should land instead.
 */

describe('focusIndexAfterRemoval', () => {
    it('keeps the same index when a later item took its place', () => {
        // Three chips, middle one (index 1) removed: two remain, and the item
        // that was at index 2 now sits at index 1.
        expect(focusIndexAfterRemoval(1, 2)).toBe(1);
    });

    it('falls back to the new last index when the removed item was last', () => {
        expect(focusIndexAfterRemoval(2, 2)).toBe(1);
    });

    it('returns -1 once the list is empty, so the caller falls back elsewhere', () => {
        expect(focusIndexAfterRemoval(0, 0)).toBe(-1);
    });

    it('returns -1 when nothing was focused to begin with', () => {
        expect(focusIndexAfterRemoval(-1, 5)).toBe(-1);
    });

    it('never returns an index outside the new list', () => {
        for (let oldIndex = 0; oldIndex < 5; oldIndex++) {
            for (let newLength = 0; newLength <= 5; newLength++) {
                const result = focusIndexAfterRemoval(oldIndex, newLength);
                expect(result).toBeGreaterThanOrEqual(-1);
                expect(result).toBeLessThan(newLength || Infinity);
            }
        }
    });
});
