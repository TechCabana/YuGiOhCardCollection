import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the licensing statements.
 *
 * A licence is stated in four places that can disagree silently: the LICENSE
 * file, the `license` field npm reads, the README, and the licence bundled
 * with the font. Nothing breaks when they drift — the site runs identically
 * while telling three different stories about what anyone may do with it.
 */

const path = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const read = (relativePath) => readFileSync(path(relativePath), 'utf8');

const licence = read('../LICENSE');
const packageJson = JSON.parse(read('../package.json'));
const readme = read('../README.md');

describe('the LICENSE file', () => {
    it('is the MIT licence', () => {
        expect(licence).toMatch(/^MIT License/);
    });

    it('names a copyright holder and a year', () => {
        expect(licence).toMatch(/Copyright \(c\) \d{4}(-\d{4})? \S+/);
    });

    // The two clauses that make MIT what it is: the grant, and the condition
    // that the notice travels with any copy.
    it('carries the grant and the attribution condition', () => {
        expect(licence).toMatch(/without restriction/);
        expect(licence).toMatch(/shall be included in all\s+copies/);
        expect(licence).toMatch(/WITHOUT WARRANTY OF ANY KIND/);
    });

    it('no longer claims to be the GPL', () => {
        expect(licence).not.toMatch(/GNU GENERAL PUBLIC LICENSE/);
    });
});

describe('the stated licence agrees everywhere', () => {
    it('matches the package manifest', () => {
        expect(packageJson.license).toBe('MIT');
    });

    it('matches the README', () => {
        expect(readme).toMatch(/Released under the MIT licence/);
    });

    // The repo is a personal collection site; the licence covers the code and
    // cannot cover Konami's artwork or marks. Saying so is the point.
    it('states that the licence covers the code only', () => {
        expect(readme).toMatch(/covers \*\*the code in this repository only\*\*/);
    });

    it('keeps the unaffiliated-with-Konami statement', () => {
        expect(readme).toMatch(/unaffiliated personal project/);
        expect(readme).toMatch(/trademarks of\s+Konami/);
    });
});

describe('bundled third-party licences', () => {
    // MIT obliges anyone redistributing this to keep notices intact; the same
    // courtesy is owed to the font that ships inside the repo.
    it('ships the font licence beside the font', () => {
        expect(existsSync(path('../assets/fonts/OFL.txt'))).toBe(true);
        expect(read('../assets/fonts/OFL.txt')).toMatch(/SIL OPEN FONT LICENSE/i);
    });

    it('credits the font in the README', () => {
        expect(readme).toMatch(/Instrument Sans/);
        expect(readme).toMatch(/SIL Open Font License/);
    });
});
