import { describe, it, expect } from 'vitest';
import { isTextEntryTarget } from '../assets/js/keyboard.js';

describe('isTextEntryTarget', () => {
    it('recognises the search input, so arrow keys are left to the cursor', () => {
        expect(isTextEntryTarget({ tagName: 'INPUT' })).toBe(true);
    });

    it('recognises textareas and selects', () => {
        expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
        expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(true);
    });

    it('recognises any contenteditable element', () => {
        expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    });

    it('matches the tag name regardless of case', () => {
        expect(isTextEntryTarget({ tagName: 'input' })).toBe(true);
    });

    it('lets shortcuts through for ordinary elements', () => {
        expect(isTextEntryTarget({ tagName: 'DIV' })).toBe(false);
        expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false);
        expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    });

    it('treats contenteditable="false" as not editable', () => {
        expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    });

    it('handles a missing or malformed target without throwing', () => {
        expect(isTextEntryTarget(null)).toBe(false);
        expect(isTextEntryTarget(undefined)).toBe(false);
        expect(isTextEntryTarget({})).toBe(false);
    });
});
