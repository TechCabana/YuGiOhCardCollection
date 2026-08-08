import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../assets/js/debounce.js';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('delays invocation until after the wait elapses', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 150);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(149);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('collapses rapid repeated calls into a single invocation', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 150);

        debounced();
        vi.advanceTimersByTime(50);
        debounced();
        vi.advanceTimersByTime(50);
        debounced();
        vi.advanceTimersByTime(149);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes through the arguments from the most recent call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 150);

        debounced('first');
        debounced('second');
        debounced('third');

        vi.advanceTimersByTime(150);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('third');
    });

    it('runs again as a separate invocation after the wait elapses', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 150);

        debounced('a');
        vi.advanceTimersByTime(150);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenLastCalledWith('a');

        debounced('b');
        vi.advanceTimersByTime(150);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('b');
    });
});
