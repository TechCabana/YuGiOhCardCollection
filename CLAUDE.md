# CLAUDE.md

Project context and working agreement for the Yu-Gi-Oh! card collection site.
Read this first in every session.

---

## 1. Project

A lightweight **static site on GitHub Pages** that displays a personal Yu-Gi-Oh! card
collection. Card data lives in **Airtable** and is pulled into the repo at build time.

- **Repo:** `TechCabana/YuGiOhCardCollection` (`origin`, branch `main`)
- **Trello board:** https://trello.com/b/l9T2n1MM/yugioh
- **Owner:** Ankhit Sharma (Trello `@ankhitsharma1`, timezone `Europe/London`)

**Goals, in priority order**
1. Stays genuinely lightweight and static — no runtime backend, no framework
2. Data flows from Airtable without ever exposing a token
3. Dark theme that reads **hand-built, not AI-generated** (see §4)
4. Accessible and usable on mobile

---

## 2. Current state

Audited 2026-08-05. At that point the repo was 5 files, ~780 lines of hand-written code,
with everything hardcoded. **No code from the audit has been written yet** — the full
remediation plan lives as 31 cards in the Trello Backlog.

```
index.html   72 lines   no semantic tags, no aria, no meta beyond charset/viewport/title
script.js   219 lines   12-card array hardcoded at :2-15, all rendering via innerHTML
styles.css  487 lines   zero @media rules, zero CSS variables, transition:all x9
README.md     1 line
LICENSE               GPL-3 (under review, see the licence card)
```

**Blocker-severity findings** (each has a Trello card):
- `#searchInput` has no listener — search is a dead feature
- Zero `@media` rules — the site is desktop-only
- Carousel duplicates cards whenever the filtered set is under 5
- All card fields rendered via unescaped `innerHTML` — inert today, an XSS hole the
  moment Airtable becomes the data source

Full findings are in the card descriptions, each with `file:line` references.

---

## 3. Architecture decisions (settled — do not relitigate)

**Airtable sync = build-time GitHub Action.**
A cron + `workflow_dispatch` workflow fetches Airtable, writes `data/cards.json`, commits,
and Pages redeploys. The token lives in GitHub Secrets.
*Why:* Airtable has no read-only public API key. Any PAT shipped in client-side JS on a
public repo grants **read AND write** on the base to anyone who views source.
**Never propose client-side Airtable fetching.**

**Card art = YGOPRODeck, keyed by passcode.**
An 8-digit passcode per card in Airtable; images mirrored into the repo at sync time.
Do not hotlink per page view. Do not use Airtable attachment URLs directly — they expire.

**Design = full visual system rebuild**, not a patch of the existing styles.

**Target structure**
```
index.html  404.html
assets/css/   tokens.css, base.css, components.css
assets/js/    data.js, filters.js, render.js, main.js
assets/fonts/
data/cards.json          <- Airtable output, committed
scripts/sync-airtable.mjs
tests/
.github/workflows/       sync-airtable.yml, pages.yml
```

---

## 4. Design rules

The owner's explicit brief: dark theme that **does not look AI-generated**.

**Never use** (these are the tells):
- Diagonal navy→indigo body gradients (`#1a1a2e → #16213e` at 135deg and relatives)
- Gradient-clipped heading text via `background-clip: text`
- Blanket `rgba(255,255,255,0.1)` glassmorphism on every surface
- Emoji as UI chrome
- uiGradients-style rainbow pastel gradients on a dark ground
- A uniform 20-25px pill radius on every element
- Accent-coloured glow shadows
- Idle infinite float animations
- The `Segoe UI` system stack, or the `Inter + Space Grotesk` pairing

**Do instead:**
- Flat near-black layered surface tokens with hairline borders; depth from layering, not glow
- **One** restrained interaction accent (active, selection, focus ring)
- **Colour as data:** map card type to the real Yu-Gi-Oh card-frame palette (Normal tan,
  Effect orange, Spell teal-green, Trap magenta, Ritual blue, Fusion purple, Synchro white,
  XYZ black). Colour must carry meaning, never decoration.
- Self-hosted `woff2` fonts; hierarchy from weight, size and tracking
- True card aspect ratio `59 / 86`
- Motion: 120-200ms `ease-out` for state, ~350ms for view transitions, `transform`/`opacity`
  only, all wrapped in `prefers-reduced-motion`

---

## 5. Trello board

Lists: **Backlog → To Do → In-Progress → Review → Done**

All 31 cards start in Backlog, ordered by build sequence (position 1 → 31).
Dependencies point backwards only, so pulling from the top never blocks.

Labels are colour-only (the Trello MCP cannot rename labels). Each card also states its
domain on the first line of its description, which is the authoritative mapping:

| Colour | Domain | Cards |
|---|---|---|
| Blue | Data & Airtable | 5 |
| Red | Bugs & Correctness | 8 |
| Yellow | Responsive & Layout | 3 |
| Purple | Accessibility | 4 |
| Orange | UI Design System | 5 |
| Green | Repo & Tooling | 6 |

**Gating cards** — these unblock others, do them early:
1. Extract card data to `data/cards.json`
2. Escape all rendered output (must land before the Airtable sync goes live)
3. Define Airtable schema + passcode column (**manual, owner-only**)
21. Build the design token layer (foundation for all other design work)

---

## 6. Workflow — trigger commands

Three commands drive the board. Each is explicit; never run one unprompted.

### `process To Do`
1. Read every card in **To Do**.
2. Evaluate and plan all of them first. Present the plan before touching code.
3. Execute **one card at a time**, in dependency order.
4. Move a card to **In-Progress** when work on it starts — one card in In-Progress at a
   time unless told otherwise.
5. If anything is unclear or ambiguous: **stop and ask. Never assume.**
   Raise the question on the card (see §7) and move to the next card rather than guessing.

### `process In-Progress`
1. Read the owner's answers on each In-Progress card.
2. Resume development from where it stopped.
3. Finish the card, including unit tests.
4. Move the card to **Review**, commit, push a branch, and open a PR.

### `process Review`
1. Check each card in **Review** for a verdict from the owner.
2. **Approval** is the word `approve` / `approved` / `Approved` in any casing.
3. For approved cards only: merge the branch into `main`, which triggers the Pages deploy.
4. Move the card to **Done**.
5. Leave cards with no verdict in Review, untouched.
6. Cards with a **changes-requested** verdict follow §6.1 rule 1.

---

## 6.1 Decided workflow rules

These are settled. Follow them without asking.

**1. Changes-requested path.**
Any verdict on a Review card that is *not* an approval is treated as changes requested.
On `process Review`:
- Move the card back to **In-Progress**
- Leave the branch and PR **open** — never close or delete them, push follow-up commits
  to the same branch so the PR history stays intact
- Record the requested changes in the card description under a `## 🔄 CHANGES REQUESTED`
  heading, so the ask survives across sessions
- The card is then picked up by the next `process In-Progress`, which addresses the
  feedback, pushes to the same branch, and moves the card back to **Review**
- A card may cycle Review ↔ In-Progress any number of times

**2. WIP limit: one card in In-Progress at a time.**
`process To Do` plans every card in To Do but executes them strictly one at a time.
Finish or block the current card before starting the next. Blocked cards do not count
against the limit — a card awaiting an answer parks in In-Progress and the next card starts.

**3. Test harness comes first.**
The Vitest harness card is promoted ahead of the bug fixes it validates. Until it exists,
"ships with unit tests" is impossible, so no behavioural card is worked before it.

**4. CI gate is trusted-until-built.**
Until the CI workflow card lands, PRs merge without automated checks. During that window,
run the test suite locally before moving a card to Review and state the result in the PR
body. Once CI exists, a red build blocks the merge in `process Review` regardless of an
approval.

**5. `main` is protected.**
Never commit or push directly to `main`. Every change reaches `main` through a PR merge,
including trivial ones. The only exception is this file and other pure-documentation
changes, and only when the owner explicitly asks for a direct commit.

**6. Merge is deploy; rollback is a revert.**
A merge to `main` triggers the Pages deploy — there is no separate release step. If a
deploy breaks production, the fix is `git revert` of the merge commit and a new PR, never
a force-push or a history rewrite. Tag known-good states once the site is live.

**7. Card ↔ branch ↔ PR linking is mandatory.**
- Branch: `<type>/<trello-shortlink>-<slug>` (e.g. `fix/CPaRGOYI-wire-up-search`)
- PR body links the Trello card URL
- The PR URL is written back into the card description under a `## 🔗 PR` heading
Nothing else connects a card to its code across sessions — if the link is missing, the
next session cannot find the work.

---

## 7. Asking questions on a card

> ⚠️ **Tooling gap:** the connected Trello MCP has **no comment capability** — there is no
> action to write a comment, and `trelloReadCard` does not return comments. Until this is
> resolved (see §9), questions and answers use the **card description** instead.

**To raise a question:** update the card description, appending:

```markdown
---
## ⛔ BLOCKED — awaiting @ankhitsharma1

**Q1.** <question>
**Q2.** <question>

### Answers
<!-- owner: write answers below this line -->
```

Then say in chat which cards are blocked and on what.

**To read answers:** re-read the card description under `### Answers`.
The owner may also answer directly in chat — treat either as authoritative.

**Never assume. Never proceed on a guess.** A blocked card stays blocked.

---

## 8. Code, commit and PR conventions

**Branches:** `<type>/<trello-shortlink>-<slug>` — e.g. `fix/CPaRGOYI-wire-up-search`.
The Trello short link makes the card ↔ branch mapping unambiguous.

**Commits:** [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
```
feat: add live search across name, type and serial
fix: guard modulo-by-zero in carousel navigation
refactor: extract filter logic into filters.js
test: cover filter group AND/OR combinations
chore: add .nojekyll and .gitignore
```

**PRs:** one card per PR. Body states what changed, why, how it was tested, and links the
Trello card. Write the PR URL back into the card description so the link survives the session.

**Testing is not optional.** Every behavioural change ships with unit tests (Vitest).
Extract pure logic out of DOM handlers so it is testable. Report test results honestly —
if something fails, say so with the output.

**General code rules** (these also come from the global CLAUDE.md):
- snake_case as the default naming convention
- Comment functions to explain purpose
- Handle errors and exceptions properly — no silent failures
- Keep code modular; use appropriate data structures
- Match the surrounding code's style

---

## 9. Known tooling gaps

Both of these block parts of §6 and need an owner decision.

**1. Trello comments are unavailable.**
The MCP exposes create / update / move / archive / mark_done / attach_label / detach_label —
no comment read or write. This affects the question flow and the approval detection.
*Fix:* provide a Trello API key + token as environment variables so the REST API can be
called directly (`POST /1/cards/{id}/actions/comments` and
`GET /1/cards/{id}/actions?filter=commentCard`), which makes §6 and §7 work exactly as
originally specified. Until then, use the description convention in §7.

**2. `gh` CLI is not installed.**
PR creation in `process In-Progress` cannot complete. Node v24.16.0 and npm 11.13.0 are
available; `gh` is not.
*Fix:* install the GitHub CLI, or supply a token so PRs can be opened via the REST API.
Fallback until then: push the branch and hand over the compare URL to open the PR manually.

### Credential handling

Secrets are read from `.env` in the repo root. That file is **gitignored and never
committed, never printed, and never pasted into chat**. Read values from the environment
at the point of use; do not echo them.

```
TRELLO_API_KEY=...
TRELLO_TOKEN=...
```

Airtable and GitHub credentials do **not** belong in `.env` for CI purposes — those live in
GitHub Secrets (`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`) and are only mirrored locally if a
sync needs to be run by hand.

If a secret is ever committed or exposed, rotate it immediately — removing the commit is
not sufficient.

---

## 10. Session defaults

- Caveman mode ON (full) and auto mode ON — set by the global CLAUDE.md
- Caveman applies to chat only. Code, commits, PR bodies and this file are written normally.
- Auto mode does **not** override §6 and §7: on a workflow card, always ask rather than assume.
