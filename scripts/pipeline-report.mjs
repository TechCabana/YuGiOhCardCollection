#!/usr/bin/env node
/**
 * Turn the pipeline's own machine-readable reports into the message the run
 * fails with.
 *
 * The enrich and sync steps each drop a small JSON report into REPORT_DIR.
 * This reads them, works out which of the three distinct failure classes
 * actually occurred, and prints a message that names that class — rather than
 * the single fixed string the workflow used to print, which described a
 * blocked row no matter what had really gone wrong.
 *
 * The three classes are genuinely different pieces of work for the owner:
 *
 *   blocked-option   a value is missing from an Airtable single-select's
 *                    options. Fix by hand in the Airtable UI — the API's
 *                    field-update endpoint accepts only name and description,
 *                    so an option cannot be added programmatically.
 *   blocked-unmapped a required field could not be derived from the
 *                    YGOPRODeck payload (usually a card type deriveType does
 *                    not know). Fix in the mapping code, not in Airtable.
 *   skipped          the Serial did not resolve at YGOPRODeck at all. Fix the
 *                    Serial on that row; nothing needs adding to any field.
 *
 * Usage:
 *   node scripts/pipeline-report.mjs        # reads .pipeline/, exits 1 on any problem
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

/** Where the enrich and sync steps leave their reports. Gitignored. */
export const REPORT_DIR = process.env.PIPELINE_REPORT_DIR || '.pipeline';

export const ENRICH_REPORT = 'enrich.json';
export const SYNC_REPORT = 'sync.json';

/**
 * Write one report file, creating the directory on first use.
 *
 * Deliberately not swallowed on failure: a report that cannot be written is
 * how the run loses its ability to explain itself, so the caller should hear
 * about it rather than fail later with a vaguer message.
 *
 * @param {string} fileName - ENRICH_REPORT or SYNC_REPORT
 * @param {object} payload - the report body
 * @returns {string} the path written
 */
export function writeReport(fileName, payload) {
    mkdirSync(REPORT_DIR, { recursive: true });
    const path = join(REPORT_DIR, fileName);
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return path;
}

/**
 * Read one report file, or null when the step never got far enough to write it.
 *
 * @param {string} fileName - ENRICH_REPORT or SYNC_REPORT
 * @returns {object|null} the parsed report, or null when absent
 */
export function readReport(fileName) {
    const path = join(REPORT_DIR, fileName);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Classify one blocked row's problem.
 *
 * `allowed` is present only on a select-option validation failure, which is
 * what separates "add an option in Airtable" from "the mapping code cannot
 * derive this field".
 *
 * @param {{field: string, value: unknown, allowed?: string[]}} problem - one blocked problem
 * @returns {'blocked-option'|'blocked-unmapped'} the failure class
 */
export function classifyProblem(problem) {
    return Array.isArray(problem?.allowed) ? 'blocked-option' : 'blocked-unmapped';
}

/**
 * Split blocked rows into the two blocked classes.
 *
 * A row is counted under a class once per class, not once per problem, so the
 * counts in the message match rows in Airtable rather than internal problem
 * objects.
 *
 * @param {{serial: string, problems: object[]}[]} blocked - blocked rows
 * @returns {{option: object[], unmapped: object[]}} rows grouped by class
 */
export function groupBlocked(blocked = []) {
    const option = [];
    const unmapped = [];

    for (const row of blocked) {
        const problems = Array.isArray(row?.problems) ? row.problems : [];
        const classes = new Set(problems.map(classifyProblem));

        if (classes.has('blocked-option')) {
            option.push({
                serial: row.serial,
                problems: problems.filter(p => classifyProblem(p) === 'blocked-option')
            });
        }
        if (classes.has('blocked-unmapped')) {
            unmapped.push({
                serial: row.serial,
                problems: problems.filter(p => classifyProblem(p) === 'blocked-unmapped')
            });
        }
    }

    return { option, unmapped };
}

/** Render a serial for display, naming the empty case rather than printing nothing. */
const displaySerial = (serial) => (serial ? serial : '(row with no Serial)');

/**
 * Build the full report from the enrich and sync results.
 *
 * Pure: takes plain data, returns plain data. The workflow-specific printing
 * lives in main() so this can be unit tested without a runner.
 *
 * @param {object} input
 * @param {number} [input.enriched] - rows successfully written back to Airtable
 * @param {{serial: string, reason: string}[]} [input.skipped] - rows whose Serial did not resolve
 * @param {{serial: string, problems: object[]}[]} [input.blocked] - rows that failed validation
 * @param {{serial: string, missing: string[]}[]} [input.dropped] - rows left out of data/cards.json
 * @returns {{ok: boolean, headline: string, lines: string[], annotations: {level: string, title: string, message: string}[]}}
 */
export function buildPipelineReport({ enriched = 0, skipped = [], blocked = [], dropped = [] } = {}) {
    const { option, unmapped } = groupBlocked(blocked);
    const lines = [];
    const annotations = [];

    const summary =
        `Summary: enriched ${enriched}, skipped ${skipped.length}, blocked ${blocked.length}, ` +
        `left out of data/cards.json ${dropped.length}.`;

    if (skipped.length === 0 && blocked.length === 0 && dropped.length === 0) {
        return {
            ok: true,
            headline: 'Pipeline clean.',
            lines: [summary],
            annotations: []
        };
    }

    lines.push(summary, '');

    if (option.length > 0) {
        lines.push(
            `BLOCKED - missing Airtable select option (${option.length} row(s)).`,
            'Add the option by hand in the Airtable UI. The API cannot create select options:',
            'its field-update endpoint accepts only name and description.'
        );
        for (const row of option) {
            for (const problem of row.problems) {
                lines.push(
                    `  ${displaySerial(row.serial)}: field "${problem.field}" value "${problem.value}" ` +
                    `is not an option. Current options: ${(problem.allowed ?? []).join(', ') || '(none)'}.`
                );
            }
        }
        lines.push('');
        annotations.push({
            level: 'error',
            title: 'Blocked: missing Airtable select option',
            message:
                `${option.length} row(s) blocked on a select option that does not exist yet: ` +
                `${option.map(row => displaySerial(row.serial)).join(', ')}. Add it in the Airtable UI.`
        });
    }

    if (unmapped.length > 0) {
        lines.push(
            `BLOCKED - required field could not be derived (${unmapped.length} row(s)).`,
            'Nothing to add in Airtable: the YGOPRODeck payload has a value the mapping',
            'code does not know, so the field was left empty rather than guessed.'
        );
        for (const row of unmapped) {
            for (const problem of row.problems) {
                const rawType = problem.rawType ? ` (YGOPRODeck type "${problem.rawType}")` : '';
                lines.push(`  ${displaySerial(row.serial)}: "${problem.field}" could not be derived${rawType}.`);
            }
        }
        lines.push('');
        annotations.push({
            level: 'error',
            title: 'Blocked: field could not be derived',
            message:
                `${unmapped.length} row(s) blocked because a required field could not be derived: ` +
                `${unmapped.map(row => displaySerial(row.serial)).join(', ')}. This is a mapping-code fix.`
        });
    }

    if (skipped.length > 0) {
        lines.push(
            `SKIPPED - serial did not resolve at YGOPRODeck (${skipped.length} row(s)).`,
            'Nothing needs adding to any Airtable select field. Correct the Serial on the row,',
            'or confirm the printing exists at YGOPRODeck:'
        );
        for (const row of skipped) {
            lines.push(`  ${displaySerial(row.serial)}: ${row.reason}`);
        }
        lines.push('');
        annotations.push({
            level: 'error',
            title: 'Skipped: serial not found at YGOPRODeck',
            message:
                `${skipped.length} row(s) skipped because the Serial did not resolve: ` +
                `${skipped.map(row => displaySerial(row.serial)).join(', ')}. ` +
                'Fix the Serial on the row - no Airtable field needs changing.'
        });
    }

    if (dropped.length > 0) {
        lines.push(
            `LEFT OUT OF data/cards.json (${dropped.length} row(s)).`,
            'A row that was never enriched has no Name, Type or Rarity, so the sync drops it.',
            'These cards are absent from the live site until the cause above is fixed and the',
            'pipeline runs again:'
        );
        for (const row of dropped) {
            const missing = (row.missing ?? []).join(', ') || 'required fields';
            lines.push(`  ${displaySerial(row.serial)}: missing ${missing}.`);
        }
        lines.push('');
        annotations.push({
            level: 'error',
            title: 'Rows missing from the published collection',
            message:
                `${dropped.length} row(s) are not in data/cards.json: ` +
                `${dropped.map(row => displaySerial(row.serial)).join(', ')}.`
        });
    }

    lines.push('Every other row was enriched, synced and deployed.');

    const headline =
        `Pipeline finished with problems: ${option.length} blocked on a select option, ` +
        `${unmapped.length} blocked on an underivable field, ${skipped.length} skipped, ` +
        `${dropped.length} left out of data/cards.json.`;

    return { ok: false, headline, lines, annotations };
}

/**
 * Escape a workflow-command property value.
 *
 * A property list is delimited by commas and each pair by a colon, so a title
 * containing either would be parsed as the start of another property and the
 * annotation would arrive truncated. GitHub's own toolkit escapes these four
 * characters, and this matches it.
 *
 * @param {string} value - the raw property value
 * @returns {string} the escaped value
 */
export function escapeProperty(value) {
    return String(value)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')
        .replace(/:/g, '%3A')
        .replace(/,/g, '%2C');
}

/**
 * Format one GitHub Actions annotation.
 *
 * Annotations are single-line by protocol, so the message is flattened rather
 * than allowed to carry newlines that would truncate it.
 *
 * @param {{level: string, title: string, message: string}} annotation - one annotation
 * @returns {string} the ::error:: workflow command
 */
export function formatAnnotation({ level, title, message }) {
    const flat = String(message).replace(/\s*\n\s*/g, ' ').trim().replace(/%/g, '%25');
    return `::${level} title=${escapeProperty(title)}::${flat}`;
}

function main() {
    const enrichReport = readReport(ENRICH_REPORT);
    const syncReport = readReport(SYNC_REPORT);

    // No enrich report at all means the step died before it could summarise —
    // a network failure, a bad token, a thrown assertion. Saying "no rows were
    // blocked" here would be the same class of wrong answer this script exists
    // to remove.
    if (enrichReport === null) {
        const outcome = process.env.ENRICH_OUTCOME ?? 'unknown';
        if (outcome === 'failure') {
            console.log(
                formatAnnotation({
                    level: 'error',
                    title: 'Enrichment failed before it could report',
                    message:
                        'The enrich step failed without writing a report, so no row-level cause is ' +
                        'available. Read the Enrich step log directly.'
                })
            );
            process.exitCode = 1;
            return;
        }
        console.log('No enrichment report found and the enrich step did not fail. Nothing to report.');
        return;
    }

    const report = buildPipelineReport({
        enriched: enrichReport.enriched,
        skipped: enrichReport.skipped,
        blocked: enrichReport.blocked,
        dropped: syncReport?.dropped
    });

    for (const line of report.lines) {
        console.log(line);
    }

    for (const annotation of report.annotations) {
        console.log(formatAnnotation(annotation));
    }

    if (!report.ok) {
        console.log(`::error title=Pipeline finished with problems::${report.headline}`);
        process.exitCode = 1;
    }
}

// Only run when executed directly, never on import — same guard as the other
// scripts, using pathToFileURL so Windows drive letters resolve correctly.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main();
}
