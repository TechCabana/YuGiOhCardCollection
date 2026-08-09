# Yu-Gi-Oh! Card Collection

A lightweight static site that displays a personal Yu-Gi-Oh! card collection.
No framework, no build step, no runtime backend — plain HTML, CSS and ES modules
served from GitHub Pages.

**Live site:** https://techcabana.github.io/YuGiOhCardCollection/

Card data lives in Airtable. A scheduled GitHub Action enriches each row from
YGOPRODeck, writes the result back into Airtable, regenerates `data/cards.json`,
commits it, and deploys. The Airtable token never leaves CI.

> **Screenshot:** pending — will be added once the design-token and card-image
> work lands, so the image does not go stale immediately.

---

## Contents

- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Running it locally](#running-it-locally)
- [Adding a card](#adding-a-card)
- [The data pipeline](#the-data-pipeline)
- [Data schema](#data-schema)
- [Secrets](#secrets)
- [Tests](#tests)
- [Licence and credits](#licence-and-credits)

---

## How it works

```
Airtable (you type a Serial)
    │
    ├─ enrich-airtable.mjs ── YGOPRODeck lookup ──> PATCH machine-owned fields back into Airtable
    │
    ├─ sync-airtable.mjs ────────────────────────> data/cards.json (committed)
    │
    └─ actions/deploy-pages ─────────────────────> GitHub Pages
```

The browser only ever fetches the static `data/cards.json`. It never talks to
Airtable.

**Why build-time and not client-side:** Airtable has no read-only public API
key. A personal access token shipped in client-side JavaScript on a public repo
grants **read and write** on the base to anyone who views source. Fetching at
build time keeps the token in GitHub Secrets and ships a plain file.

---

## Repository layout

```
index.html               page shell
script.js                app entry — wires the DOM to the modules below
styles.css               all styles

assets/js/
  data.js                fetches and validates data/cards.json
  filters.js             pure filter / search / pagination / carousel-slot logic
  render.js              card markup, escaped
  debounce.js            search input debounce
  keyboard.js            text-entry target detection for global shortcuts

scripts/
  ygoprodeck-client.mjs  YGOPRODeck API client (db.ygoprodeck.com/api/v7)
  enrich-ygoprodeck.mjs  pure mapping: YGOPRODeck response -> Airtable fields
  enrich-airtable.mjs    resolves unprocessed rows and PATCHes them back
  map-airtable.mjs       pure mapping: Airtable record -> renderable card
  sync-airtable.mjs      fetches the table and writes data/cards.json

data/cards.json          generated, committed, served
tests/                   Vitest suites, one per module

.github/workflows/
  process-data.yml       enrich -> sync -> commit -> deploy (manual + daily cron)
  pages.yml              Pages deploy on push to main
  ci.yml                 test gate on pull requests
```

---

## Running it locally

A plain `file://` open will **not** work — `data.js` uses `fetch()` for
`data/cards.json`, and `file://` requests fail CORS. Serve the directory over
HTTP:

```bash
git clone https://github.com/TechCabana/YuGiOhCardCollection.git
cd YuGiOhCardCollection
npx serve .          # or: python -m http.server 8000
```

Then open the printed URL. No `npm install` is needed to view the site — the
only dependency is Vitest, and that is for the tests.

```bash
npm install          # only needed to run the test suite
```

---

## Adding a card

Everything except your own inventory data is fetched, not typed.

1. Open the Airtable base and add a row.
2. Fill in **three fields only**:
   - `Serial` — the set code, e.g. `SDJ-017`. This is the lookup key.
   - `Quantity` — how many copies you own.
   - `Condition` — your grading.
3. Leave `IsProcessed` **unticked**.
4. Run the pipeline (below), or wait for the daily sweep at 06:00 UTC.

The serial is the key rather than the name because it identifies a single
printing, which is how the collection is actually kept. Name lookup needs an
exact match and punctuation makes it fragile — `Blue Eyes White Dragon` without
the hyphens returns "No card matching your query".

### Field ownership

A sync overwrites machine-owned fields freely and never touches the rest.

| Machine-owned — do not type these | Human-owned — never overwritten |
| --- | --- |
| Name, Passcode, Rarity, Type, Card Type, Card Sign, Summon Type, HasEffect, IsPendulum, Attack, Defense, Level, Set Name, Set Price | **Serial, Quantity, Condition** |

`Quantity`, `Condition` and `Set Price` are also **private**: they are held in
Airtable but stripped before `data/cards.json` is written, because this repo is
public and those are inventory data. `sync-airtable.mjs` asserts this on every
run and fails rather than publishing them.

### When a row is blocked

An unmapped single-select value blocks that row and is reported with the field,
the value, and the current options. Select options are **never created
automatically** — Airtable's field-update endpoint accepts only `name` and
`description`, so adding one is necessarily a manual step in the UI.

A blocked row does not stop the others: enrichment is `continue-on-error`, the
sync and commit still run, and the job fails at the end so the problem is
visible without holding up good data.

---

## The data pipeline

### Running it

```bash
gh workflow run process-data.yml
gh run watch
```

Or use the **Actions → Process Data → Run workflow** button. It also runs daily
at 06:00 UTC as a safety net.

### What it does

| Step | Behaviour |
| --- | --- |
| Enrich | Resolves every row with `IsProcessed` unticked against YGOPRODeck, PATCHes machine-owned fields back in batches of 10, and ticks `IsProcessed`. `continue-on-error`. |
| Sync | Fetches the whole table (paginated at 100/request) and writes `data/cards.json`. |
| Verify | Rejects a non-array, empty, field-incomplete, or private-field-leaking result **before** it is committed. |
| Commit | Only when `data/cards.json` actually changed. |
| Deploy | Uploads `index.html`, `styles.css`, `script.js`, `assets/` and `data/` as the Pages artifact. |
| Fail if blocked | Runs last, so good rows are already live, and turns the run red if anything was blocked. |

The workflow deploys Pages itself rather than relying on its own commit to wake
`pages.yml`: GitHub deliberately does not let a push made with `GITHUB_TOKEN`
trigger further workflow runs, so that commit would otherwise land and never
publish.

### Running a script by hand

```bash
node scripts/enrich-airtable.mjs --dry-run   # prints the payload, sends nothing
node scripts/enrich-airtable.mjs             # LIVE — real PATCH requests
node scripts/enrich-airtable.mjs --limit 5   # cap how many rows are processed
node scripts/sync-airtable.mjs               # regenerate data/cards.json only
```

These read `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE_ID` from the
environment. Use `--dry-run` first.

---

## Data schema

`data/cards.json` is an array of card objects, one per **printing**. Two rows
sharing a passcode with different serials are both kept — deduplicating would
lose a printing from the collection.

```json
{
  "id": "rec0iHhQomPWtKsMw",
  "name": "Man-Eater Bug",
  "type": "monster",
  "rarity": "common",
  "passcode": "54652250",
  "serial": "SDP-015",
  "cardType": "Insect / Effect",
  "summonType": null,
  "attribute": "Earth",
  "atk": 450,
  "def": 600,
  "level": 2,
  "gradient": "linear-gradient(135deg, #c9954f 0%, #8a5a2b 100%)",
  "emoji": "⚔️",
  "stats": [
    { "label": "ATK",   "value": "450"  },
    { "label": "DEF",   "value": "600"  },
    { "label": "Level", "value": "⭐2" }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | The Airtable record id. |
| `name` | string | **Required.** A record without it is dropped. |
| `type` | string | **Required.** `monster` / `spell` / `trap`. |
| `rarity` | string | **Required.** `common` / `rare` / `super` / `ultra` / `secret`. |
| `passcode` | string | 8 digits, stored as text — leading zeros are significant. Drives the card image URL. |
| `serial` | string | Set code, trimmed. `Serial` is a multiline field in Airtable, so a pasted value can carry an invisible trailing newline that URL-encodes to `%0A` and breaks the lookup. |
| `cardType` | string | e.g. `Insect / Effect`. |
| `summonType` | string \| null | Fusion / Synchro / XYZ / Ritual / Link, or `null`. |
| `attribute` | string \| null | Earth, Fire, … |
| `atk`, `def`, `level` | number \| null | `null` for spells and traps. |
| `gradient`, `emoji` | string | **Placeholders.** Both are slated for removal once real card art and the card-frame colour system land. |
| `stats` | array | Three pre-built display rows; monster and spell/trap cards use different labels. |

`Pendulum` is a boolean in Airtable, not a summon type — a card can be both
Pendulum and Fusion, so a single-select could only ever record one facet.

---

## Secrets

CI reads these from **GitHub Secrets**. They are not in `.env` for CI purposes,
and are only mirrored locally when a sync needs to be run by hand.

| Secret | Purpose |
| --- | --- |
| `AIRTABLE_TOKEN` | Airtable personal access token. |
| `AIRTABLE_BASE_ID` | The base to read and write. |
| `AIRTABLE_TABLE_ID` | The table within that base. |

**Required token scopes:** `schema.bases:read`, `data.records:read`,
`data.records:write`. Grant access to the Yu-Gi-Oh base only.

Write scope is required because enrichment runs in the Action, not inside
Airtable — Airtable scripting needs a Team plan and the code would live outside
the repo with no tests or review.

`.env` is gitignored and must never be committed. If a token is ever exposed,
**revoke it immediately** at https://airtable.com/create/tokens — removing the
commit is not sufficient.

---

## Tests

[Vitest](https://vitest.dev/). Pure logic is deliberately extracted out of the
DOM handlers so it is testable without a browser.

```bash
npm test          # single run
npm run test:watch
```

Every behavioural change ships with tests. Pull requests targeting `main` are
gated on `ci.yml` running this suite.

---

## Licence and credits

Licensed under **GPL-3.0** — see [`LICENSE`](LICENSE). The licence covers **this
repository's code only**.

- Card images and data come from [YGOPRODeck](https://ygoprodeck.com/). Images
  are mirrored at sync time rather than hotlinked per page view, per their
  request.
- *Yu-Gi-Oh!* and all card names, artwork and related marks are trademarks of
  **Konami**. This is an unaffiliated personal project with no endorsement from
  or association with Konami.
