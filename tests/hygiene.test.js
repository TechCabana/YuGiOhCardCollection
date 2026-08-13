import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, relative } from 'node:path';

/**
 * Guards the repo's hygiene files and the conventions they declare.
 *
 * .editorconfig is only a suggestion to an editor — nothing enforces it, and
 * an editor that ignores it fails silently. These tests are the enforcement:
 * the settings are read out of the file and checked against the source that is
 * actually committed, so the two cannot drift apart.
 */

const path = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const REPO_ROOT = path('../');

const read = (relativePath) => readFileSync(path(`../${relativePath}`), 'utf8');

/** Source files the conventions apply to, excluding generated and vendor trees. */
const SOURCE_EXTENSIONS = ['.js', '.mjs', '.css', '.html'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'assets/cards', 'assets/fonts', '.pipeline']);

function sourceFiles(directory = REPO_ROOT) {
    const found = [];

    for (const entry of readdirSync(directory)) {
        const absolute = join(directory, entry);
        const relativePath = relative(REPO_ROOT, absolute).replace(/\\/g, '/');

        if (SKIP_DIRECTORIES.has(relativePath) || entry.startsWith('.')) continue;

        if (statSync(absolute).isDirectory()) {
            found.push(...sourceFiles(absolute));
        } else if (SOURCE_EXTENSIONS.includes(extname(entry))) {
            found.push(relativePath);
        }
    }

    return found;
}

const files = sourceFiles();

describe('the hygiene files exist', () => {
    it('finds source files to check, so the assertions below are not vacuous', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    // Pages runs Jekyll unless told not to, and Jekyll drops files and folders
    // whose names begin with an underscore without reporting anything.
    it('ships .nojekyll', () => {
        expect(existsSync(path('../.nojekyll'))).toBe(true);
    });

    it('ships .editorconfig, .gitignore and 404.html', () => {
        expect(existsSync(path('../.editorconfig'))).toBe(true);
        expect(existsSync(path('../.gitignore'))).toBe(true);
        expect(existsSync(path('../404.html'))).toBe(true);
    });

    it('ignores the secrets and the run artefacts', () => {
        const gitignore = read('.gitignore');
        for (const entry of ['.env', 'node_modules/', '.pipeline/']) {
            expect(gitignore).toContain(entry);
        }
    });
});

describe('the .editorconfig settings hold in the committed source', () => {
    const editorconfig = read('.editorconfig');

    it('declares spaces, a final newline and no trailing whitespace', () => {
        expect(editorconfig).toMatch(/indent_style\s*=\s*space/);
        expect(editorconfig).toMatch(/insert_final_newline\s*=\s*true/);
        expect(editorconfig).toMatch(/trim_trailing_whitespace\s*=\s*true/);
    });

    it.each(files)('%s indents with spaces', (file) => {
        expect(read(file).split('\n').filter((line) => /^\t/.test(line))).toEqual([]);
    });

    it.each(files)('%s ends with a newline', (file) => {
        expect(read(file).endsWith('\n')).toBe(true);
    });

    it.each(files)('%s carries no trailing whitespace', (file) => {
        // \r is stripped first: core.autocrlf gives the working copy CRLF on
        // Windows, and that is a checkout artefact rather than committed bytes.
        const offenders = read(file)
            .split('\n')
            .map((line) => line.replace(/\r$/, ''))
            .filter((line) => /[ \t]+$/.test(line));

        expect(offenders).toEqual([]);
    });
});

describe('404.html', () => {
    const notFound = read('404.html');

    it('is not indexable', () => {
        expect(notFound).toMatch(/<meta name="robots" content="noindex">/);
    });

    it('wears the site, loading the same two stylesheets in the same order', () => {
        const sheets = [...notFound.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
        expect(sheets).toEqual(['assets/css/tokens.css', 'styles.css']);
    });

    // Pages serves 404.html for an unmatched path at any depth, so relative
    // asset paths would resolve against that path rather than the site root.
    it('pins a <base> to the Pages path, matching the repository name', () => {
        const base = notFound.match(/<base href="([^"]+)">/)?.[1];
        const repository = JSON.parse(read('package.json')).repository.url;
        const name = repository.match(/\/([^/]+)\.git$/)[1];

        expect(base).toBe(`/${name}/`);
    });

    it('offers a way back to the collection', () => {
        expect(notFound).toMatch(/<a class="empty-state-action" href="\.\/">/);
    });

    it('reuses the empty-state classes rather than inventing 404-only ones', () => {
        for (const className of ['empty-state', 'empty-state-title', 'empty-state-hint']) {
            expect(notFound).toContain(`class="${className}"`);
            expect(read('styles.css')).toContain(`.${className} {`);
        }
    });

    it('carries no inline style or script', () => {
        expect(notFound).not.toMatch(/<style|<script|style="/);
    });
});
