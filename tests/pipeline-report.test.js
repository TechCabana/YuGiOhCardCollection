import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    classifyProblem,
    groupBlocked,
    buildPipelineReport,
    formatAnnotation,
    escapeProperty
} from '../scripts/pipeline-report.mjs';

/**
 * Covers the summary-to-message logic.
 *
 * The bug this replaces was not a crash — the run failed correctly, with the
 * wrong explanation. So the assertions are about which cause the text names,
 * and which it does not: a skip must never be described as a missing Airtable
 * select option, because that sends the owner to the wrong screen entirely.
 */

const optionProblem = {
    field: 'Card Type',
    value: 'Cyberse',
    allowed: ['Spellcaster', 'Warrior', 'Dragon']
};

const unmappedProblem = { field: 'Type', value: null, rawType: 'Skill Card' };

describe('classifyProblem', () => {
    it('reads an allowed list as a missing select option', () => {
        expect(classifyProblem(optionProblem)).toBe('blocked-option');
    });

    it('reads a problem with no allowed list as an underivable field', () => {
        expect(classifyProblem(unmappedProblem)).toBe('blocked-unmapped');
    });

    it('treats a malformed problem as underivable rather than throwing', () => {
        expect(classifyProblem(undefined)).toBe('blocked-unmapped');
        expect(classifyProblem({ field: 'Type', allowed: 'not an array' })).toBe('blocked-unmapped');
    });
});

describe('groupBlocked', () => {
    it('splits the two blocked classes apart', () => {
        const grouped = groupBlocked([
            { serial: 'SDJ-017', problems: [optionProblem] },
            { serial: 'LOB-001', problems: [unmappedProblem] }
        ]);

        expect(grouped.option.map((row) => row.serial)).toEqual(['SDJ-017']);
        expect(grouped.unmapped.map((row) => row.serial)).toEqual(['LOB-001']);
    });

    it('counts a row under both classes when it has both kinds of problem', () => {
        const grouped = groupBlocked([
            { serial: 'SDJ-017', problems: [optionProblem, unmappedProblem] }
        ]);

        expect(grouped.option).toHaveLength(1);
        expect(grouped.unmapped).toHaveLength(1);
        expect(grouped.option[0].problems).toEqual([optionProblem]);
        expect(grouped.unmapped[0].problems).toEqual([unmappedProblem]);
    });

    it('returns empty groups for no input', () => {
        expect(groupBlocked()).toEqual({ option: [], unmapped: [] });
        expect(groupBlocked([])).toEqual({ option: [], unmapped: [] });
    });
});

describe('buildPipelineReport', () => {
    it('reports a clean run as ok with no annotations', () => {
        const report = buildPipelineReport({ enriched: 46 });

        expect(report.ok).toBe(true);
        expect(report.annotations).toEqual([]);
        expect(report.lines.join('\n')).toContain('enriched 46');
    });

    it('defaults to a clean run when called with nothing', () => {
        expect(buildPipelineReport().ok).toBe(true);
    });

    // The exact case from run 31365178186: one unresolvable serial, nothing
    // blocked. The old message claimed a select option needed adding.
    describe('a skip with no blocks', () => {
        const report = buildPipelineReport({
            enriched: 46,
            skipped: [
                { serial: 'DBJ-EN056', reason: 'No YGOPRODeck match for set code "DBJ-EN056"' }
            ],
            dropped: [{ serial: 'DBJ-EN056', missing: ['Name', 'Type', 'Rarity'] }]
        });

        const text = report.lines.join('\n');

        it('fails the run', () => {
            expect(report.ok).toBe(false);
        });

        it('names the serial that did not resolve', () => {
            expect(text).toContain('DBJ-EN056');
            expect(text).toContain('No YGOPRODeck match for set code "DBJ-EN056"');
        });

        it('does not blame a missing Airtable select option', () => {
            expect(text).not.toContain('BLOCKED');
            expect(text).not.toMatch(/is not an option/);
            expect(text).toMatch(/Nothing needs adding to any Airtable select field/);
        });

        it('says the row is missing from the published collection', () => {
            expect(text).toContain('LEFT OUT OF data/cards.json');
            expect(text).toContain('missing Name, Type, Rarity');
        });

        it('states that the other rows still shipped', () => {
            expect(text).toContain('Every other row was enriched, synced and deployed.');
        });
    });

    describe('a blocked select option', () => {
        const report = buildPipelineReport({
            enriched: 45,
            blocked: [{ serial: 'SDJ-017', problems: [optionProblem] }]
        });

        const text = report.lines.join('\n');

        it('names the field, the value and the current options', () => {
            expect(text).toContain('field "Card Type" value "Cyberse"');
            expect(text).toContain('Spellcaster, Warrior, Dragon');
        });

        it('says the fix is a manual step in the Airtable UI', () => {
            expect(text).toContain('Add the option by hand in the Airtable UI');
        });

        it('does not describe it as an unresolvable serial', () => {
            expect(text).not.toContain('did not resolve at YGOPRODeck');
        });
    });

    describe('an underivable required field', () => {
        const report = buildPipelineReport({
            blocked: [{ serial: 'LOB-001', problems: [unmappedProblem] }]
        });

        const text = report.lines.join('\n');

        it('names the field and the raw YGOPRODeck type', () => {
            expect(text).toContain('"Type" could not be derived');
            expect(text).toContain('YGOPRODeck type "Skill Card"');
        });

        it('says explicitly that Airtable is not the place to fix it', () => {
            expect(text).toContain('Nothing to add in Airtable');
        });
    });

    it('reports every class at once without losing any', () => {
        const report = buildPipelineReport({
            enriched: 40,
            skipped: [{ serial: 'DBJ-EN056', reason: 'No YGOPRODeck match' }],
            blocked: [
                { serial: 'SDJ-017', problems: [optionProblem] },
                { serial: 'LOB-001', problems: [unmappedProblem] }
            ],
            dropped: [
                { serial: 'DBJ-EN056', missing: ['Name'] },
                { serial: 'SDJ-017', missing: ['Rarity'] }
            ]
        });

        expect(report.ok).toBe(false);
        expect(report.annotations).toHaveLength(4);
        expect(report.headline).toBe(
            'Pipeline finished with problems: 1 blocked on a select option, ' +
            '1 blocked on an underivable field, 1 skipped, 2 left out of data/cards.json.'
        );
    });

    it('names a row that has no Serial rather than printing an empty gap', () => {
        const report = buildPipelineReport({
            skipped: [{ serial: '', reason: 'Row has no Serial, so there is nothing to look up' }]
        });

        expect(report.lines.join('\n')).toContain('(row with no Serial)');
    });

    it('survives a blocked row whose problems are missing', () => {
        const report = buildPipelineReport({ blocked: [{ serial: 'SDJ-017' }] });

        // Counted as a problem, since the run did block on it, but it must not
        // throw its way out of reporting the classes that did parse.
        expect(report.ok).toBe(false);
        expect(report.headline).toContain('0 blocked on a select option');
    });
});

describe('formatAnnotation', () => {
    it('emits a workflow command with a title', () => {
        expect(formatAnnotation({ level: 'error', title: 'Blocked', message: 'one row' })).toBe(
            '::error title=Blocked::one row'
        );
    });

    it('flattens newlines, which would truncate the annotation', () => {
        const formatted = formatAnnotation({
            level: 'error',
            title: 'Skipped',
            message: 'first line\n   second line'
        });

        expect(formatted).toBe('::error title=Skipped::first line second line');
        expect(formatted).not.toContain('\n');
    });

    // A colon or comma in a title starts a new property as far as the runner's
    // parser is concerned, so the annotation would arrive cut in half.
    it('escapes the characters that delimit a property list', () => {
        expect(
            formatAnnotation({
                level: 'error',
                title: 'Skipped: serial not found, at YGOPRODeck',
                message: 'one row'
            })
        ).toBe('::error title=Skipped%3A serial not found%2C at YGOPRODeck::one row');
    });

    it('escapes a percent sign in the message so the escaping is not ambiguous', () => {
        expect(formatAnnotation({ level: 'error', title: 'x', message: '50% done' })).toBe(
            '::error title=x::50%25 done'
        );
    });
});

describe('escapeProperty', () => {
    it('escapes each delimiter the runner treats as structure', () => {
        expect(escapeProperty('a:b,c%d\re\nf')).toBe('a%3Ab%2Cc%25d%0De%0Af');
    });

    it('leaves an ordinary title untouched', () => {
        expect(escapeProperty('Blocked rows')).toBe('Blocked rows');
    });
});

/**
 * Covers main(), the CLI entry point the workflow actually runs.
 *
 * Everything above tests buildPipelineReport as pure data-in, data-out logic.
 * None of it exercises reading the report files, telling a crashed step from
 * one that legitimately never ran, or the process exit code the workflow's
 * pass/fail decision depends on — so this runs the real script as a
 * subprocess, the same way `node scripts/pipeline-report.mjs` runs in CI,
 * against a scratch PIPELINE_REPORT_DIR that never touches the real .pipeline/.
 */
describe('main() (CLI)', () => {
    const scriptPath = fileURLToPath(new URL('../scripts/pipeline-report.mjs', import.meta.url));
    let reportDir;

    afterEach(() => {
        if (reportDir) rmSync(reportDir, { recursive: true, force: true });
    });

    /**
     * Run the script as a real subprocess against a fresh scratch report dir,
     * optionally pre-seeded with enrich.json / sync.json.
     *
     * @param {object} [env] - extra environment variables, e.g. ENRICH_OUTCOME
     * @param {{enrich?: object, sync?: object}} [reports] - report bodies to write first
     * @returns {{status: number, stdout: string}} the process result
     */
    function runCli(env = {}, reports = {}) {
        reportDir = mkdtempSync(join(tmpdir(), 'pipeline-report-test-'));
        if (reports.enrich) writeFileSync(join(reportDir, 'enrich.json'), JSON.stringify(reports.enrich));
        if (reports.sync) writeFileSync(join(reportDir, 'sync.json'), JSON.stringify(reports.sync));

        const result = spawnSync(process.execPath, [scriptPath], {
            env: { ...process.env, PIPELINE_REPORT_DIR: reportDir, ...env },
            encoding: 'utf8'
        });
        return { status: result.status, stdout: result.stdout };
    }

    it('exits 0 and reports clean when enrich and sync both wrote clean reports', () => {
        const { status, stdout } = runCli(
            { ENRICH_OUTCOME: 'success', SYNC_OUTCOME: 'success' },
            { enrich: { enriched: 46, skipped: [], blocked: [] }, sync: { dropped: [] } }
        );

        expect(status).toBe(0);
        expect(stdout).toContain('enriched 46, skipped 0, blocked 0, left out of data/cards.json 0');
    });

    it('exits 1 and names enrichment when it crashed before writing a report', () => {
        const { status, stdout } = runCli({ ENRICH_OUTCOME: 'failure' });

        expect(status).toBe(1);
        expect(stdout).toContain('Enrichment failed before it could report');
    });

    it('exits 0 and stays silent when there is no enrich report and enrich did not fail', () => {
        // The state before the very first run: nothing has ever executed.
        const { status, stdout } = runCli({ ENRICH_OUTCOME: 'success' });

        expect(status).toBe(0);
        expect(stdout).toContain('Nothing to report');
    });

    // The exact gap this card's own review found: sync dying before it could
    // write which rows it dropped (a missing secret, a network failure) must
    // not be read as "0 dropped" and printed as a clean run.
    it('exits 1 and names sync when it crashed before writing a report, rather than claiming a clean run', () => {
        const { status, stdout } = runCli(
            { ENRICH_OUTCOME: 'success', SYNC_OUTCOME: 'failure' },
            { enrich: { enriched: 46, skipped: [], blocked: [] } } // no sync report — it died before writing one
        );

        expect(status).toBe(1);
        expect(stdout).toContain('Sync failed before it could report');
        expect(stdout).not.toContain('Pipeline clean');
    });

    it('reports blocked and skipped rows from the files on disk and exits 1', () => {
        const { status, stdout } = runCli(
            { ENRICH_OUTCOME: 'failure', SYNC_OUTCOME: 'success' },
            {
                enrich: {
                    enriched: 40,
                    skipped: [{ serial: 'DBJ-EN056', reason: 'No YGOPRODeck match' }],
                    blocked: []
                },
                sync: { dropped: [{ serial: 'DBJ-EN056', missing: ['Name'] }] }
            }
        );

        expect(status).toBe(1);
        expect(stdout).toContain('DBJ-EN056');
        expect(stdout).toContain('SKIPPED');
    });
});
