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

**As of 2026-08-10, after PR #18.** Restate this section rather than trusting it once it is
more than a few PRs old — a stale briefing here causes real errors, not cosmetic drift.

17 PRs merged, 38 cards Done. The site is live, data comes from Airtable through the
build-time pipeline, every card renders its real art mirrored from YGOPRODeck, and card
colour now carries the card's type rather than decorating it.

```
index.html        77 lines   still all divs — no landmarks, no aria (a11y cards open)
script.js        383 lines   DOM wiring only; logic lives in assets/js/
styles.css       940 lines   responsive, tokenised colour, true 59:86 card geometry
assets/css/       1 file     tokens.css, the only place a colour value is written
assets/js/        7 files    data, filters, render, frames, view, debounce, keyboard
assets/cards/   111 files    mirrored card art, ~16 MB, committed by the pipeline
scripts/         7 files     enrich, sync, map, mirror, YGOPRODeck client, pipeline report
tests/          17 files     403 Vitest tests, all passing
.github/         3 workflows ci.yml, pages.yml, process-data.yml
data/cards.json 128 cards    generated from Airtable, committed, served
```

Roughly 3,800 lines of source, 3,400 of tests, 315 of workflow.

**What the 2026-08-05 audit found has been fixed**: search is wired, `@media` rules exist,
the carousel no longer duplicates cards, and every rendered field is escaped. Only one
allowlist remains, for the image src in `assets/js/render.js` — the style-attribute one
went with the gradient.

**Three things landed in PR #17 that change how the code reads:**

1. **Card colour is derived, never stored.** `assets/js/frames.js` maps a card to one of
   ten real card-frame keys from `type`, `summonType` and `cardType`; `styles.css` resolves
   the key to a colour. The `gradient` field is gone from the schema and from
   `data/cards.json`. Markup carries a key, not a colour, so no card data reaches a style
   attribute at all. Contrast is enforced by a test that computes the WCAG ratio of every
   frame ink rather than asserting one was checked.
2. **The pipeline names its own failures.** `scripts/pipeline-report.mjs` tells three causes
   apart — a missing Airtable select option, a field the mapping code cannot derive, and a
   serial that does not resolve at YGOPRODeck — and says which rows were left out of
   `data/cards.json` as a result. Enrich and sync write machine-readable reports into a
   gitignored `.pipeline/`; the workflow step reads them.
3. **Workflows run on Node 24** with every action bumped past the Node 20 runtime.
   `tests/workflows.test.js` enforces the pin floor, so a slip backwards fails CI.

**PR #18 added two more things worth knowing before reading the code:**

4. **Nothing animates on its own.** The `@keyframes float` bounce is deleted, and every
   transition names its own properties on one of two duration tokens — `--duration-state`
   for hover and focus, `--duration-view` for a carousel position change. There is no
   `transition: all` and no duration literal left in `styles.css`, and
   `tests/motion.test.js` enforces both.
5. **A card states its edition.** `isFirstEdition` is published to `data/cards.json` and
   rendered as a badge beside the rarity one. See §3 for why that field is published while
   `Quantity` and `Condition` are not.

**What is still open.** Six cards in To Do: self-hosted typography, two accessibility cards
(landmarks, and labelling controls for assistive technology), grid-first layout with sort, a
refresh button, and the licence decision. Backlog holds five more. Each has a Trello card
with `file:line` evidence.

**Not yet seen by a human**: the frame colour system, the badge layout and the motion pass
were all verified by tests, by measurement and by reading the CSS — never by eye or by
screenshot. Three merged PRs of visual change now rest on that.

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

### Airtable data model

Base `appjNtbcGFFAu0FIn`, table `tblsz5RrZGC7BnesJ`.

The owner types a **Serial** (set code, e.g. `SDJ-017`) plus their own `Quantity` and
`Condition`. Everything else is fetched from YGOPRODeck and written back.

The serial is the lookup key rather than the name: it identifies a single printing, which
is how the collection is actually kept, and name lookup needs an exact match that
punctuation makes fragile.

**Field ownership.** A sync writes only machine-owned fields:

| Machine-owned | Human-owned — never written |
|---|---|
| Name, Passcode, Rarity, Type, Card Type, Card Sign, Summon Type, HasEffect, IsPendulum, Attack, Defense, Level, Set Name, Set Price | **Serial, Quantity, Condition, IsFirstEdition** |

`Set Price`, `Quantity` and `Condition` are in `PRIVATE_FIELDS` — held in Airtable but never
published to `data/cards.json`, because the repo is public and those are inventory data.

**Human-owned and private are different questions.** `IsFirstEdition` is owner-typed and is
never written by a sync — `assertNoHumanOwnedFields` throws if one tries — but it *is*
published, as the `isFirstEdition` boolean in `data/cards.json` (PR #18, at the owner's
request). The line is what the field describes: an edition describes the printing anyone is
looking at, while quantity, condition and price describe what the owner holds and what it is
worth. Only a literal `true` publishes as true, because an unticked Airtable checkbox arrives
as `undefined` and would otherwise serialise as a missing key rather than a published "no".
Reversing this would need a data regeneration, not just a code change.

**Pendulum is a boolean, not a Summon Type.** A card can be both Pendulum and Fusion
("Pendulum Effect Fusion Monster"), so a single-select could only record one facet.
`Summon Type` holds Fusion / Synchro / XYZ / Ritual / Link / None; `IsPendulum` is separate.

**Serials are trimmed before lookup.** `Serial` is a `multilineText` field, so a pasted
value can carry a trailing newline that is invisible in the Airtable UI but URL-encodes to
`%0A` and fails the lookup.

**Select options are never created automatically.** An unmapped value blocks that row and is
reported with the field, the value and the current options. Airtable's field-update endpoint
accepts only `name` and `description`, so adding an option is necessarily a manual UI step.

**Target structure**
```
index.html  404.html
assets/css/   tokens.css, base.css, components.css
assets/js/    data.js, filters.js, render.js, frames.js, main.js
assets/fonts/
assets/cards/            <- mirrored card art, one JPEG per passcode, committed
data/cards.json          <- Airtable output, committed
scripts/                 sync-airtable.mjs, mirror-images.mjs, enrich-*.mjs,
                         map-airtable.mjs, pipeline-report.mjs
tests/
.github/workflows/       process-data.yml, pages.yml, ci.yml
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

Backlog is ordered by build sequence. Dependencies point backwards only, so pulling from
the top never blocks.

Labels are named as of 2026-08-08. The MCP cannot rename them — use the REST API
(`PUT /1/labels/{id}` with a `name` param). Trello labels have no description field, only
a name and colour. Every card also states its domain on the first line of its description.

**49 cards as of 2026-08-10**, split Backlog 5, To Do 6, In-Progress 0, Review 0, Done 38.
Read the board rather than this table for anything that matters — the count moves every
session, and the split below is a snapshot, not a source of truth.

| Colour | Label name | Cards |
|---|---|---|
| Blue | Data & Airtable | 15 |
| Red | Bugs & Correctness | 10 |
| Yellow | Responsive & Layout | 3 |
| Purple | Accessibility | 4 |
| Orange | UI Design System | 6 |
| Green | Repo & Tooling | 11 |

Every new card must carry exactly one domain label. Cards created by `audit project` follow
the same rule.

**Gating cards** — all four are now Done: `data/cards.json`, output escaping, the Airtable
schema, and the design token layer. Nothing on the board is blocked on an unbuilt
foundation; the remaining dependencies are ordinary Backlog ordering.

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

1. Load the audit skill set (§6.3) before reading anything.
2. Read the current repo state, the merged PRs, and every card across all five lists.
3. Evaluate delivered work against the project goals (§1), the architecture decisions (§3)
   and the design rules (§4).
4. Identify gaps: scope in the goals with no card covering it, decisions that have drifted,
   regressions, dropped follow-ups, missing tests, and anything a merged PR promised but did
   not actually deliver.
5. **Verify every finding before writing it down.** Run the suite, open the file, read the
   workflow run. A claim that was not checked is not a finding — it is a guess with a card
   number attached, and it costs more to disprove later than it saved now.
6. For each real gap, create a card in **Backlog** with a domain label (§5), a description
   carrying `file:line` evidence, and a `**Done when:**` line.
7. Do **not** duplicate an existing card — check all five lists first, and extend the
   existing card instead where one already covers the ground.
8. Report a summary in chat: what is on track, what has drifted, which cards were created,
   and which skills from §6.3 were actually loaded.

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

**5. Branch and open a PR. It is a working practice, not a gate.**
Default to a branch and a PR for every change. Not because GitHub forces it — it does not —
but because a PR is where the diff gets read, the Fable gate runs, and the Trello card gets
its link. It is what keeps the history reviewable.

**What GitHub actually enforces on `main`:** force pushes blocked, branch deletion blocked.
Nothing else. The pull-request requirement was removed on 2026-08-09.

*Why:* `github-actions[bot]` has to push `data/cards.json`, and **a personal repository cannot
grant a bot a bypass**. Confirmed three ways — classic protection's `bypass_pull_request_allowances`
and rulesets' `Integration` bypass actor are both organisation-only. So "require a PR" and
"the bot can commit data" were mutually exclusive. Moving the repo to an organisation would
lift that; until then, this is the trade.

**Skipping the PR is allowed when it genuinely adds nothing** — a one-line documentation fix,
or an urgent revert. Say so and why, rather than doing it quietly. When in doubt, open the PR;
it costs almost nothing.

The bot's own `data/cards.json` commits never use a PR by design.

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

Both Fable stages carry a named skill set, not a free choice: `audit project` loads the
subset in §6.3, and the review gate loads the two marked below.

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

The gate loads `superpowers:requesting-code-review` and
`superpowers:verification-before-completion` before it starts, and
`superpowers:systematic-debugging` if a test fails. It does **not** load the wider suite, for
the reason given in §6.3. Unlike the audit, the gate does write code, so
`superpowers:test-driven-development` is fair game when step 4 means adding a missing test.

Only once the gate passes does the card move to Review. A PR reaching Review has already been
tested and audited — the owner's review is the final check, not the first.

---

## 6.3 The audit skill set

The `superpowers` plugin is installed. Most of it is implementation tooling, so `audit project`
loads a **named subset** rather than the whole suite. Load these by name with the `Skill` tool
before step 2 of the audit.

| Skill | What it contributes |
|---|---|
| `superpowers:verification-before-completion` | Evidence before assertion. The audit's only value is that its claims were checked, so this is the one skill it cannot skip. |
| `superpowers:requesting-code-review` | The "does this actually meet the requirement" pass, run against each merged PR's `**Done when:**` line rather than against a diff. |
| `superpowers:systematic-debugging` | Only when a regression surfaces. Establish the cause before writing the card, so the card describes the fault rather than the symptom. |
| `superpowers:dispatching-parallel-agents` | Optional. Repo state, merged PRs and the five lists are independent reads. Use it only when a serial pass would be shallow, and never on a quiet board — the cost is real. |

**Deliberately not loaded:** `brainstorming`, `writing-plans`, `executing-plans`,
`test-driven-development`, `subagent-driven-development`, `using-git-worktrees`,
`finishing-a-development-branch`, `receiving-code-review`, `writing-skills`, and
`using-superpowers`.

*Why this is a subset and not "use superpowers".* Every excluded skill exists to produce or
land code, and the audit does neither — it writes cards. `brainstorming` and
`test-driven-development` are explicitly pre-implementation, so loading them pushes the
auditor toward designing the fix it is forbidden to write. A gap the audit spots becomes a
Backlog card; the skills for building it belong to whoever pulls that card, not to the audit.

**If a named skill is unavailable** in the session — the plugin is disabled, or a subagent
cannot see it — say so in the report and continue without it. Never claim a skill ran when it
did not. Same rule as the test suite: report the real result.

These skills inform the audit. They do not override §6 or §7. The audit still creates cards
only, still never moves a card between lists, and still asks rather than guesses.

---

## 7. Asking questions on a card

Comments work via the **Trello REST API**, not the MCP — the MCP has no comment support.
Credentials come from `.env` (see §9). Verified working end to end on 2026-08-08.

**To raise a question**, post a comment on the card. Use a JSON body — it is the only
form that cannot be double-encoded:

```bash
curl -s -X POST "https://api.trello.com/1/cards/$CARD_ID/actions/comments?key=$KEY&token=$TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @comment.json     # {"text": "Claude: @ankhitsharma1 BLOCKED — Q1. ..."}
```

Write `comment.json` with the Write tool, never with a shell heredoc or an inline
`-d '...'` string. A single quote inside the text breaks shell quoting and leaves
`'\''` in the comment body.

Then move on to the next card and say in chat which cards are blocked and why.

### Encoding: the one way to get this wrong

**Never percent-encode the text yourself.** On 2026-08-09 eleven comments across the
board had to be repaired because they were stored as literal escape sequences:

```
%3F%3F audit project %282026-08-08%29 %97 stale evidence%2C card still valid.
```

Two separate faults produced that:

1. **Double encoding.** The text was percent-encoded by hand and then encoded again by
   `--data-urlencode`. Trello stores whatever it receives, so the escapes became the
   comment.
2. **A cp1252 console.** The first pass ran through a Windows console that is not UTF-8,
   so `—` became `%97`, `§` became `%A7`, and emoji became `??`. `%97` is not valid
   UTF-8, so the text could not even be decoded back in one pass.

Rules that prevent both:

- Send a **JSON body**, as above. JSON escaping is handled by `JSON.stringify`, so no
  percent-encoding is involved at any point.
- If `--data-urlencode` is used instead, pass **raw UTF-8 text** and let curl encode it
  **exactly once**. Text that already contains `%28` or `%2C` is a bug, not input.
- Never pipe comment text through PowerShell. Use the Bash tool, or Node's `fetch` with
  a `JSON.stringify` body.
- **Verify after posting.** Read the comment back and check it for `%[0-9A-Fa-f]{2}`.
  Escapes in the stored text mean it was double-encoded and must be repaired.
- Prefer plain ASCII punctuation in comments. An em dash or an emoji is what turns a
  console-encoding problem into an unrecoverable one, because `??` cannot be decoded
  back to the character it replaced.

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

**Every comment written by the assistant MUST begin with `Claude:`.**

```
Claude: <the comment>
```

No exceptions, and no shorter form. It applies to every comment the assistant posts —
questions, status notes, merge records, gate results, scope changes, anything. Build the
prefix into the text before the request is made, so a comment cannot be posted without it.

Trello shows the account name, not who actually typed it, and the token authenticates as the
owner's own account. Without the prefix an assistant-written comment is indistinguishable
from one the owner typed — which matters most for approvals, since the approval gate would
otherwise be forgeable by the thing it is meant to gate. The owner's own comments carry no
prefix, so anything unprefixed is theirs.

**Never add the prefix to an existing unprefixed comment.** Unprefixed means the owner
wrote it, so relabelling one would falsify authorship — the exact failure the rule exists
to prevent. Assistant comments written before this rule was enforced stay as they are; only
comments being repaired for the encoding fault above are rewritten, because the percent
escapes prove a script wrote them.

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
`build_type: workflow` — the Actions deploy has landed, so both `pages.yml` and
`process-data.yml` publish through `actions/deploy-pages`. Serving at
https://techcabana.github.io/YuGiOhCardCollection/

**Branch protection on `main`** — verified against the API on 2026-08-10:

| Setting | Value | Why |
|---|---|---|
| Require a PR before merging | **no** | removed 2026-08-09. `github-actions[bot]` must push `data/cards.json` and `assets/cards/`, and a personal repository cannot grant a bot a bypass — see §6.1 rule 5 for the full reasoning. The PR remains the working practice; it is simply not enforced. |
| Required approving reviews | none | GitHub forbids self-approval and `TechCabana` is the only account. Approval lives in Trello, not GitHub. |
| Enforce for admins | **false** | prevents lockout; admins can bypass in an emergency |
| Force pushes / deletions | blocked | protects history, supports the revert-based rollback in rule 6 |
| Conversation resolution | not required | dropped with the PR requirement |
| Required status checks | none | `ci.yml` runs on pull requests but does not gate the merge. §6.1 rule 4 still applies: state the local test result in the PR body. |

**Environment:** Node v24.16.0, npm 11.13.0, Vitest ^4.1.10. `npm test` runs 403 tests
across 17 files; all pass as of 2026-08-10. The workflows pin Node 24 to match, and
`tests/workflows.test.js` fails if that pin or an action version slips backwards.

**Nothing is blocking work.** Trello comments, PR creation, git, Pages and the test harness
are all functional.

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
