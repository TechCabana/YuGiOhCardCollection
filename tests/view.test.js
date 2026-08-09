import { describe, it, expect } from 'vitest';
import {
    VIEW_CAROUSEL,
    VIEW_GRID,
    VIEWS,
    isValidView,
    normaliseView,
    getViewVisibility
} from '../assets/js/view.js';

describe('isValidView', () => {
    it('accepts the two views the toolbar can select', () => {
        expect(isValidView(VIEW_CAROUSEL)).toBe(true);
        expect(isValidView(VIEW_GRID)).toBe(true);
    });

    it('rejects anything else, including near misses', () => {
        expect(isValidView('Carousel')).toBe(false);
        expect(isValidView('list')).toBe(false);
        expect(isValidView('')).toBe(false);
    });

    it('rejects a missing or malformed value without throwing', () => {
        expect(isValidView(null)).toBe(false);
        expect(isValidView(undefined)).toBe(false);
        expect(isValidView({})).toBe(false);
    });
});

describe('normaliseView', () => {
    it('leaves a known view alone', () => {
        expect(normaliseView(VIEW_CAROUSEL)).toBe(VIEW_CAROUSEL);
        expect(normaliseView(VIEW_GRID)).toBe(VIEW_GRID);
    });

    it('falls back to the carousel for an unknown view, so the page is never blank', () => {
        expect(normaliseView('list')).toBe(VIEW_CAROUSEL);
        expect(normaliseView(undefined)).toBe(VIEW_CAROUSEL);
        expect(normaliseView(null)).toBe(VIEW_CAROUSEL);
    });
});

describe('getViewVisibility', () => {
    it('hides both views until the data has resolved', () => {
        expect(getViewVisibility(VIEW_CAROUSEL, false)).toEqual({ carousel: false, grid: false });
        expect(getViewVisibility(VIEW_GRID, false)).toEqual({ carousel: false, grid: false });
    });

    it('shows only the carousel when the carousel is selected', () => {
        expect(getViewVisibility(VIEW_CAROUSEL, true)).toEqual({ carousel: true, grid: false });
    });

    it('shows only the grid when the grid is selected', () => {
        expect(getViewVisibility(VIEW_GRID, true)).toEqual({ carousel: false, grid: true });
    });

    it('never shows both views at once', () => {
        for (const view of [...VIEWS, 'list', undefined]) {
            const visibility = getViewVisibility(view, true);
            expect(visibility.carousel && visibility.grid).toBe(false);
        }
    });

    it('shows exactly one view once ready, whatever the selection', () => {
        for (const view of [...VIEWS, 'list', undefined, null]) {
            const visibility = getViewVisibility(view, true);
            expect(visibility.carousel || visibility.grid).toBe(true);
        }
    });

    it('falls back to the carousel for an unknown view rather than hiding everything', () => {
        expect(getViewVisibility('list', true)).toEqual({ carousel: true, grid: false });
    });

    it('treats a missing readiness flag as not ready', () => {
        expect(getViewVisibility(VIEW_CAROUSEL, undefined)).toEqual({ carousel: false, grid: false });
    });
});
