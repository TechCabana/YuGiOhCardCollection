import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the GitHub Actions pins.
 *
 * The Node 20 runtime is deprecated, and an action pinned to a major that
 * still targets it only keeps working while the runner's compatibility shim
 * survives. Nothing in CI fails when a pin slips backwards, so these read the
 * workflow files as text and assert the floor directly.
 *
 * Text, not YAML: the properties under test are the literal `uses:` and
 * `node-version:` values, and adding a YAML parser as a dependency to read
 * two lines would cost more than it explains.
 */

const workflow_dir = fileURLToPath(new URL('../.github/workflows/', import.meta.url));

/** Read every workflow file as { name, text }. */
const read_workflows = () =>
    readdirSync(workflow_dir)
        .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
        .map((file) => ({ name: file, text: readFileSync(workflow_dir + file, 'utf8') }));

const workflows = read_workflows();

/**
 * Every `uses: owner/repo@vN` reference in a workflow, as {action, major}.
 *
 * @param {string} text - workflow file contents
 * @returns {{action: string, major: number}[]}
 */
const used_actions = (text) =>
    [...text.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v(\d+)/g)].map((match) => ({
        action: match[1],
        major: Number(match[2])
    }));

/** Lowest major of each action that still runs on the Node 24 runtime. */
const minimum_majors = {
    'actions/checkout': 7,
    'actions/setup-node': 7,
    'actions/configure-pages': 6,
    'actions/upload-pages-artifact': 5,
    'actions/deploy-pages': 5
};

/** The Node version the repo is developed and tested against. */
const expected_node_version = '24';

describe('workflow action pins', () => {
    it('finds the three workflows', () => {
        expect(workflows.map((workflow) => workflow.name).sort()).toEqual([
            'ci.yml',
            'pages.yml',
            'process-data.yml'
        ]);
    });

    it.each(workflows)('pins every known action at or above its Node 24 floor in $name', ({ text }) => {
        const behind = used_actions(text).filter(
            ({ action, major }) => action in minimum_majors && major < minimum_majors[action]
        );
        expect(behind).toEqual([]);
    });

    it.each(workflows)('pins every action to a major version in $name', ({ name, text }) => {
        // A bare `uses: actions/checkout` with no ref would silently track the
        // default branch, so the floor above could not be enforced at all.
        const unpinned = [...text.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)(@\S+)?/g)]
            .filter((match) => !match[2])
            .map((match) => `${name}: ${match[1]}`);
        expect(unpinned).toEqual([]);
    });

    it('keeps upload-pages-artifact and deploy-pages on the same major', () => {
        // v5 of deploy-pages expects the artifact format v5 of the upload
        // action produces. A split pair deploys nothing and reports success
        // right up until the download step.
        const majors_of = (action) =>
            workflows.flatMap(({ text }) =>
                used_actions(text)
                    .filter((used) => used.action === action)
                    .map((used) => used.major)
            );

        const upload = majors_of('actions/upload-pages-artifact');
        const deploy = majors_of('actions/deploy-pages');

        expect(upload.length).toBeGreaterThan(0);
        expect(deploy.length).toBeGreaterThan(0);
        expect(new Set([...upload, ...deploy]).size).toBe(1);
    });
});

describe('workflow Node version', () => {
    it.each(workflows)('pins node-version to the developed-against version in $name', ({ text }) => {
        const versions = [...text.matchAll(/node-version:\s*'?([\d.x]+)'?/g)].map((match) => match[1]);
        for (const version of versions) {
            expect(version).toBe(expected_node_version);
        }
    });

    it('sets a node-version wherever setup-node is used', () => {
        // setup-node without a version falls back to whatever the runner
        // happens to ship, which is exactly the drift this card removes.
        for (const { name, text } of workflows) {
            const setup_node_count = used_actions(text).filter(
                (used) => used.action === 'actions/setup-node'
            ).length;
            const version_count = [...text.matchAll(/node-version:/g)].length;
            expect(`${name}: ${version_count}`).toBe(`${name}: ${setup_node_count}`);
        }
    });
});
