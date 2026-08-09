# CLAUDE.md

Project context and working agreement for the Yu-Gi-Oh! card collection site.
Read this first in every session.

---

## 1. Project

A lightweight **static site on GitHub Pages** that displays a personal Yu-Gi-Oh! card
collection. Card data lives in **Airtable** and is pulled into the repo at build time.

- **Repo:** `TechCabana/YuGiOhCardCollection` (`origin`, branch `main`) — **public**
- **Live site:** https://techcabana.github.io/YuGiOhCardCollection/
- **Trello board:** https://trello.com/b/l9T2n1MM/yugioh
- **Owner:** Ankhit Sharma (Trello `@ankhitsharma1`, timezone `Europe/London`)

The repo is public. This is precisely why the Airtable token must never reach client-side
code — see §3.

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

Labels are named as of 2026-08-08. The MCP cannot rename them — use the REST API
(`PUT /1/labels/{id}` with a `name` param). Trello labels have no description field, only
a name and colour. Every card also states its domain on the first line of its description.

| Colour | Label name | Cards |
|---|---|---|
| Blue | Data & Airtable | 5 |
| Red | Bugs & Correctness | 8 |
| Yellow | Responsive & Layout | 3 |
| Purple | Accessibility | 4 |
| Orange | UI Design System | 5 |
| Green | Repo & Tooling | 6 |

Every new card must carry exactly one domain label. Cards created by `audit project` follow
the same rule.

**Gating cards** — these unblock others, do them early:
1. Extract card data to `data/cards.json`
2. Escape all rendered output (must land before the Airtable sync goes live)
3. Define Airtable schema + passcode column (**manual, owner-only**)
21. Build the design token layer (foundation for all other design work)

---

## 6. Workflow — trigger commands

Three commands drive the board. Each is explicit; never run one unprompted.

### `process To Do`
Works a **batch** of up to three cards onto one branch, so the owner reviews a related set
in one pass rather than card by card.

1. Read every card in **To Do**.
2. Evaluate and plan all of them first. **Present the plan before touching code**, naming
   which cards are in the batch and why the batch stops where it does.
3. Create one branch for the batch, named after the first card (§6.1 rule 7).
4. Work the cards **in dependency order, one at a time**, moving each to **In-Progress** as
   it starts and leaving it there until the batch reaches Review.
5. **One commit per card**, each a self-contained Conventional Commit naming what it changed.
   Never squash two cards into one commit — the per-card history is what makes the batch
   reviewable and what lets a single card be revised later.
6. Stop and hand over when any of these is true (§6.1 rule 2):
   - three cards are done
   - the next card depends on something not yet merged
   - the next card needs an owner decision
   - the diff has grown too large to review well
7. Run the Fable review gate (§6.2) over the whole batch, open **one PR**, then move every
   card in the batch to **Review**.
8. If anything is unclear or ambiguous: **stop and ask. Never assume.** Raise the question on
   that card (§7), leave it in To Do, and carry on with the next card in the batch.

### `process In-Progress`
1. Read the owner's answers on each In-Progress card.
2. Resume development from where it stopped.
3. Finish the card, including unit tests.
4. Commit, push a branch, and open a PR.
5. **Run the Fable review gate (§6.2) before the card moves.** Only after it passes does the
   card go to **Review**.

### `process Review`
Approval is **per card**, merging is **per batch**.

1. Check each card in **Review** for a verdict from the owner.
2. **Approval** is the word `approve` / `approved` / `Approved`, any casing.
3. Group the cards by the PR they belong to.
4. Merge a PR only when **every card in that batch is approved**. Merging triggers the Pages
   deploy. Move all of the batch's cards to **Done**.
5. If any card in a batch has a **changes-requested** verdict, **hold the entire PR** — do not
   merge, do not split the branch. Follow §6.1 rule 1 for that card only.
6. If some cards are approved and others have no verdict yet, do nothing and say which cards
   are still waiting.
7. Cards in a batch that is on hold stay in Review, except the one being reworked.

### `process data`
Runs the data pipeline. Manages the collection, not the code — no cards, no PRs, no merges.

1. Trigger the **Process Data** workflow (`gh workflow run process-data.yml`).
2. Watch the run and report the real outcome — enriched, skipped and blocked counts.
3. If any row was **blocked**, say which serial, which field, and which value is missing
   from the Airtable options. Never add a select option automatically — the owner keeps the
   vocabulary deliberate. Airtable's API cannot add select options anyway: its field-update
   endpoint accepts only `name` and `description`, so this is a manual step in the UI.
4. Confirm the deploy finished and the live site reflects the change.

The chain is enrich → sync → commit → deploy. A blocked row does **not** stop the others:
enrichment is `continue-on-error`, the sync and commit still run, and the job fails at the
end so the problem is visible without holding up good data.

Rows are enriched only when `IsProcessed` is unticked, so a processed row is never re-fetched.
The same workflow also runs on a daily schedule as a safety net.

### `audit project`
Run by **Fable**. A standing health check of scope versus delivery — it writes cards, never code.

1. Read the current repo state, the merged PRs, and every card across all five lists.
2. Evaluate delivered work against the project goals (§1), the architecture decisions (§3)
   and the design rules (§4).
3. Identify gaps: scope in the goals with no card covering it, decisions that have drifted,
   regressions, dropped follow-ups, missing tests, and anything a merged PR promised but did
   not actually deliver.
4. For each real gap, create a card in **Backlog** with a domain label (§5), a description
   carrying `file:line` evidence, and a `**Done when:**` line.
5. Do **not** duplicate an existing card — check all five lists first, and extend the
   existing card instead where one already covers the ground.
6. Report a summary in chat: what is on track, what has drifted, which cards were created.

Creates cards only. Never edits code, never moves cards between lists, never merges.

---

## 6.1 Decided workflow rules

These are settled. Follow them without asking.

**1. Changes-requested path.**
Any verdict on a Review card that is *not* an approval is treated as changes requested.
On `process Review`:
- Move **that card only** back to **In-Progress**. The rest of its batch stays in Review.
- **Hold the whole PR.** Do not merge it, even if every other card in the batch is approved,
  and never rebase or split the rejected card out — the batch stays atomic.
- Leave the branch and PR **open** — never close or delete them. Follow-up work is new
  commits on the same branch, so the PR history and the owner's review threads survive.
- Record the requested changes in the card description under a `## 🔄 CHANGES REQUESTED`
  heading, so the ask survives across sessions.
- The next `process In-Progress` addresses the feedback, pushes to the same branch, re-runs
  the Fable gate, and moves the card back to **Review**.
- The owner then approves that card, and the full batch merges together.
- A card may cycle Review ↔ In-Progress any number of times.

**2. Batch size: a hard cap of three cards per PR.**
`process To Do` batches up to three cards onto one branch so a related set is reviewed
together. Never exceed three, even when the cards look small.

Stop short of three whenever the next card depends on something unmerged, needs an owner
decision, or would push the diff past what can be reviewed carefully. State where the batch
stops, and why, in the plan before starting.

Cards are still built **one at a time in dependency order**, with **one commit per card**.
A blocked card does not consume a batch slot — leave it in To Do with a question comment and
move to the next card.

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

## 6.2 Model assignment

Different stages run on different models. Delegate with the `Agent` tool, passing the
`model` parameter.

| Stage | Model | Why |
|---|---|---|
| Planning, architecture, tricky refactors, design system work | **Opus 5**, high effort | Judgement-heavy, cross-file reasoning |
| Well-specified single-card implementation, mechanical refactors, test writing | **Sonnet 5**, high effort | Faster on bounded work with a clear spec |
| Review gate and `audit project` | **Fable** | Independent reviewer; must not be the model that wrote the code |

Choose Opus vs Sonnet per task. Default to Opus when the card is ambiguous, spans several
files, or involves a design decision; Sonnet when the card reads like a spec and the diff is
predictable. State which model was used in the PR body.

### The Fable review gate

Runs when a card is finished and its PR is open, **before** the card moves to Review.
Fable must not be the model that wrote the code — the point is an independent pass.

Fable's remit:
1. Run the test suite and report the real result — never assume green.
2. Audit the PR against the card's `**Done when:**` line, against §3, §4 and §8 of this file,
   and against the repo's own conventions.
3. Look for missed cases, absent tests, silent error paths, accessibility regressions,
   security issues, and scope that crept in or fell out.
4. **Fix any gap that does not need an owner decision** — missing tests, weak edge-case
   handling, convention drift, doc gaps — and push to the same branch so the PR arrives ready
   to merge.
5. Anything that *does* need an owner decision becomes a Trello comment tagging
   `@ankhitsharma1`, per §7. Never guess.
6. Report findings in chat: what was checked, what was fixed, what still needs the owner.

Only once the gate passes does the card move to Review. A PR reaching Review has already been
tested and audited — the owner's review is the final check, not the first.

---

## 7. Asking questions on a card

Comments work via the **Trello REST API**, not the MCP — the MCP has no comment support.
Credentials come from `.env` (see §9). Verified working end to end on 2026-08-08.

**To raise a question**, post a comment on the card:

```bash
curl -s -X POST "https://api.trello.com/1/cards/$CARD_ID/actions/comments?key=$KEY&token=$TOKEN" \
  --data-urlencode "text=@ankhitsharma1 BLOCKED — Q1. <question>  Q2. <question>"
```

Then move on to the next card and say in chat which cards are blocked and why.

**To read answers:**

```bash
curl -s "https://api.trello.com/1/cards/$CARD_ID/actions?filter=commentCard&key=$KEY&token=$TOKEN"
```

Returns newest first. Each entry has `data.text`, `memberCreator.username`, and `date`.

**Card IDs:** the REST API takes the **raw 24-character id**, not the MCP's ARI. Strip the
`ari:cloud:trello::card/workspace/<workspaceId>/` prefix — the trailing segment is the id.

**Account note:** the API token is authorised as **`techcabana`**, so comments posted by
this workflow appear under that account. The owner is **`@ankhitsharma1`** — always mention
that handle, never `techcabana`, or the notification goes to the wrong account.

**Never assume. Never proceed on a guess.** A blocked card stays blocked until answered.

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

**PRs:** one **batch** per PR, up to three cards (§6.1 rule 2). The body carries a section per
card — what changed, why, how it was tested — and links every Trello card in the batch. Write
the PR URL back into each card's description so the link survives the session. Name which
model did the work (§6.2).

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

## 9. Tooling status

**✅ Trello comments — working.** Resolved 2026-08-08. The MCP cannot do comments, so the
REST API is used instead, with credentials from `.env`. Post, read and delete were all
verified against a live card. Use the MCP for cards, lists, labels and moves; use REST only
for comments. §6 and §7 work exactly as specified.

**✅ `gh` CLI — installed and authenticated.** v2.97.0 at `C:\Program Files\GitHub CLI\gh.exe`.
Account `TechCabana`, permission `ADMIN`, scopes `gist`, `read:org`, `repo`, `workflow`.
The token lives in the **Windows keyring**, not `hosts.yml` — that file does not exist and its
absence proves nothing. Always check with `gh auth status`, never by looking for the file.

**✅ GitHub Pages — enabled** 2026-08-08. Source: branch `main`, path `/`, HTTPS enforced,
`build_type: legacy`. Serving at https://techcabana.github.io/YuGiOhCardCollection/
When the Actions-based deploy workflow lands, switch `build_type` to `workflow`.

**✅ Branch protection on `main` — enabled** 2026-08-08:

| Setting | Value | Why |
|---|---|---|
| Require a PR before merging | yes | enforces §6.1 rule 5 |
| Required approving reviews | **0** | GitHub forbids self-approval and `TechCabana` is the only account; requiring 1 would deadlock every PR. Approval lives in Trello, not GitHub. |
| Enforce for admins | **false** | prevents lockout; admins can bypass in an emergency |
| Force pushes / deletions | blocked | protects history, supports the revert-based rollback in rule 6 |
| Conversation resolution | required | review threads must be resolved before merge |
| Required status checks | none yet | add once the CI workflow exists — see §6.1 rule 4 |

**Environment:** Node v24.16.0, npm 11.13.0. No test runner installed yet — the Vitest
harness is the first card in To Do.

**Nothing is blocking work.** Trello comments, PR creation, git, Pages and branch protection
are all functional as of 2026-08-08.

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
