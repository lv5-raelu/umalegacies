# Changelog

What changed, and what each change was measured against. Entries are grouped by the
work they belong to rather than by date, and every PR number is a link back to the
reasoning — the commit messages carry the arguments, this file carries the shape.

---

## M7 — the inverse query

**2026-09-21 → 2026-09-24 · PRs #18–#38 · 110 files, +9,649 / −1,017**

Everything before M7 answered *"I picked these two parents, what do I get?"*. M7 adds
the question the game actually leaves you with: *"I want these sparks, which two
parents get them?"* — and then, at the end, the question nobody was answering at all:
*"will my trainee still be carrying them when the career ends?"*

### Release 1 — search your own roster (shipped 2026-09-23)

#### Planning, from measurements rather than recollection

- **The M7 plan was rebuilt around four spikes, and every number it rested on was
  wrong** (#18). The sweep costs **2.4s locally for 33,411 pairs**, not the
  "milliseconds" the section claimed — off by roughly 1000×. On Vercel it is
  **5.2–9.3s**, with **1.8× variance between two instances doing identical work**, and
  a cold start that ran *faster* than a warm one. The conclusion the old numbers
  supported (no index, no solver) survived and got stronger; the architecture did not.
  `TODOS.md` opened in the same pass, so deferrals stopped living in chat transcripts.
- **The T1–T16 execution order was written into the repo** (#24), and re-reading the
  code rather than the notes caught two drifts: **T8 (`POST /search/pairs`) was dead**
  — the sweep had moved to the browser — and T13/T15 existed only as its replacements.
  Without the file, someone would have built the endpoint.

#### Architecture

- **`@umalegacies/core`**, a workspace both runtimes import (#22). The engine, the
  spark math, `MasterData`, the rule citations and `DomainError` now exist in **one
  copy**, so a figure cannot change depending on whether it was reached by searching or
  by clicking. `MasterData` takes plain rows rather than a database handle, which is
  what later let the same class be built from SQLite on the server and from JSON in the
  browser. Measured: **0.045 ms per lineage in a browser against 0.154–0.279 ms on
  Vercel**.
- **`ParentPick` became a union** — `own` or `borrowed` — before anything needed it
  (#19). A borrowed veteran has no roster index, and borrowing is release 2; widening
  the type early kept a structural change out of the commit that will add the
  behaviour. Release 1 emits nothing but `own`.
- **The two shared predicates moved into core** (#25). The claim that the roster filter
  and the pair search "agree by construction" is only true when there is one copy of
  each.

#### The rules the sweep is built from

- **Star ceilings take a subject** (#26). A package is three umas and a pair is six, so
  every ceiling doubles: **3 and 9** for the roster list, **6 and 18** for the search.
  One `SparkCriterion` type drives both surfaces, so `maxStarsFor(scope, subject)`
  computes all four from one place and the argument is required — a caller cannot
  silently read a package's limit for a pair.
- **`isLegalPair`** (#27), the pair predicate the sweep needs 33,411 times, reading the
  same two rules `pickBlock` reads: a parent cannot be the trainee, and two parents
  cannot be the same character.
- **Whites rank until promoted** (#28). `mustHave` is per-criterion and off by default.
  Hard constraints are the only thing that prunes, and a whites-only search is the
  common case, so the unpruned sweep was the normal path rather than the tail. The
  lever was built here and measured once there was a sweep to measure it on — see
  below.
- **`matchesPair` sums the halves** (#29), which is the difference the search exists
  for: a pair holding 6 Stamina as 3+3 has six of them although neither half has more
  than three. A half lacking the spark contributes **zero, not a failure** — the trap a
  predicate built out of `matchesCriterion` falls into with no type to catch it.

#### The sweep

- **`sweepPairs`** (#31), composed entirely from the pieces above plus the same
  `explainLineage` and `jointOdds` the compare pane calls. Prune before score, progress
  every 512 legal pairs, and a **total** comparator so a re-sweep cannot reshuffle ties.
- **What promoting a white is worth**, measured here on the real roster: four whites
  promoted to requirements took a sweep from **18,996 scored pairs to 2,930** and from
  **1,128 ms to 205 ms**, without moving the top result.
- **The search space, measured with `isLegalPair`**: 259 veterans give 33,411
  combinations, but **2,603 pair two cards of one character and are illegal before
  anything is scored**, leaving **30,808**. Choosing a trainee prunes far harder —
  Oguri Cap, with 21 cards on the roster, leaves **19,738**.
- **The game data ships to the browser** (#32). `master.json` is generated from the
  committed SQL extract and is **provably the same data** — a test regenerates it and
  compares bytes. Columnar encoding was chosen after measuring, not before:
  **390,307 B raw / 42,134 gzipped as rows-of-objects → 120,641 B / 28,264 gzipped
  columnar**.
- **The sweep moved off the main thread** (#33). Measured in a real browser through the
  real worker: a **1,179 ms worst-case sweep** during which the main thread rendered
  **141 animation frames with a longest gap of 9.4 ms**. On the main thread the same
  sweep is a 1.2-second freeze with a spinner that cannot spin.
- **A picked pair is explained locally** (#34): **0.375 ms against 35.3 ms** for the
  route it replaced — 94×, and that was to localhost. The two outputs were compared as
  whole JSON documents rather than spot-checked, and the game data was already
  downloaded for the search, so the local path costs nothing extra.

#### The screen

- **A wireframe on real rows first** (#23), because the identification problem is
  invisible against invented data: **255 of 259 veterans share a character name with
  another**, 29 distinct names cover 259 rows, and one character appears 54 times. A
  ranked *pair* row doubles that exposure at half the width, eighty rows deep.
- **The compare pane's spark list became chips** (#21) after a real user said he did not
  read it. He was right not to: 53 sparks at 28px each is **1,644 px of content in a
  132 px window** — twelve and a half screens in a 380 px column. Chips wrap, so the
  same content is **867 px, a 47% cut with nothing removed**. Filtered sparks are
  highlighted in place rather than listed a second time.
- **The wireframe became the search** (#35). Its layout survived review, so it was kept
  rather than redrawn: `fakePairSearch` and the "every number below is invented" banner
  went, `#wireframe/pair-search` became `#search`, and the screen took the app's own
  trainee and criteria instead of keeping copies.
- **Navigation across three screens** — Roster / Optimize Parents / Breakdown — with a
  blocked route *shown and given a reason* rather than hidden, matching how the roster
  list already treats a veteran that cannot be picked right now.
- **A picked pair opens in a modal** rather than navigating away, so two candidates can
  be compared without re-running the journey, and the search keeps its place in eighty
  ranked rows.

#### Fixed

- **Two local-only scripts had been dead for eight days with nothing able to report it**
  (#30). The `packages/core` extraction moved the engine out from under
  `check-roster.mjs` — the strongest correctness check this project has — and
  `build-fixtures.ts`. Neither is imported, compiled or run by CI, because both need
  data files that are not committed. A test now asserts every `scripts/` import
  resolves; it caught a second break within seconds of being written. The oracle passes
  **1,036 comparisons across 259 lineages**.

---

### After release 1

- **Game data rebuilt from the 2026-09-24 `master.mdb`** (#36). Nakayama Festa and
  Wonder Acute join the roster with their affinity-group memberships and green sparks;
  two placeholder cards that nobody can train were dropped from the trainee picker.

- **uma.moe's rate limit, measured: there isn't one to find** (#37), closing a `TODOS.md`
  item open since 2026-09-18. About **140 requests** against the endpoint release 2
  actually uses, escalating to 8-way concurrency, **all 200**, with **latency flat under
  concurrency** — the signature of no throttle rather than a generous one. What does
  bind turned out to be elsewhere: `limit` caps at 100, `total: "over 10000"` is a
  display cap that paging walks straight past, and server-side filters cut a realistic
  search to **1,111 records in 12 pages**. So a borrowed half is a **filtered sweep**,
  settled. The measurement also moved the bottleneck onto us — 259 own against 1,111
  borrowed is 287,749 pairs, ~21 s at the measured 0.072 ms each — which makes
  per-veteran affinity memoisation (`TODOS.md` #2) newly relevant.

- **Activating a spark is not inheriting it** (#38). The word had been covering two
  mechanics and the engine only computed one. A spark that fires during a run hands the
  trainee a **skill hint**; whether they *finish the career carrying it* is a separate
  roll, **not scaled by affinity**, that rises with how many of the six ancestors
  already carry it:

  | ancestors carrying it | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|---|
  | plain white skill | 20% | 22.5% | 25% | 27.5% | 30% | 32.5% | 35% |
  | gold version | 40% | 45% | 50% | 55% | 60% | 65% | 70% |

  On fixture 5531, `Uma Stan` fires **85.9%** of careers and sticks **32.5%** of the
  time: **27.9% end to end.** Whites only — blue comes from the trainee's own stats,
  pink from their aptitudes, green *is* their unique skill.

  **Checked against 2,800 real lineages** rather than taken on trust. Race factors are
  the natural experiment, because a uma.moe record says which G1s the veteran actually
  *won*, so conditioning on the win isolates this roll. Across **45,755 conditioned
  observations** the rate ran **23.5% / 26.3% / 27.6%** for 0 / 1 / 2 observed carriers
  against a documented 20 / 22.5 / 25 — monotone, right slope, and **flat across rating
  bands** exactly as documented. The level sits ~3.5 points high, which is what a pool
  listing only lendable veterans and unable to show four grandparents would do. Shape
  confirmed, documented table shipped, discrepancy recorded beside it.

  Shipped with it:
  - a per-criterion **gold** toggle beside "must have", on white skills only;
  - the figure on **every surface that explains a pair** — search row, modal, roster
    side pane, breakdown — with the tier following the pick so the screens cannot
    disagree;
  - a **sort control**, activation or inheritance, which re-sorts results already in
    hand rather than re-running a 2.4 s sweep;
  - three words used strictly — **activate**, **inherit**, **combined** — and "retire"
    removed from 27 places, because finishing a career is not retiring.

  Three bugs found and fixed in the same work: the inherit ranking was **inverted**
  (a pair carrying one of six wanted skills outscored a pair carrying all six, 0.0125
  against 0.000080) and ranking now goes **coverage first, product second**; the `gold`
  flag was **dropped on every reload** by a criterion rebuild whose own comment had
  warned that exactly this would happen; and clicking Search rendered **one frame of
  mismatched rows**, the old sweep drawn against the new criteria.

  Two reversals, both recorded with the reasoning they replaced: the joint now **skips
  sparks the pair does not carry** and labels its own scope ("8 of 9 activate"), because
  zeroing on any miss made every row read 0% on a realistic whites-only search; and
  joint figures print **four significant figures** rather than ten.

---

## Still open

- **M7 release 2** — the uma.moe borrow source. The adapter is cheap because it reuses
  release 1's sweep and scoring unchanged; `ParentPick` has had the `borrowed` arm since
  #19.
- **Two wireframe questions T10 deliberately did not settle**: 80 rows is ~24.5 screens,
  and spark-kind grouping is not visually legible inside a row.
- **`TODOS.md` #1 and #2** — a no-target "what should I breed?" search, and per-veteran
  affinity memoisation, the second now gated on release 2 rather than on nothing.
- **M7 has no "passes when" criterion** in the design doc, unlike M1 and M3.
- **The uma.moe API key** at `~/.umalegacies-uma-moe-key` was pasted into a chat
  transcript on 2026-09-18 and should be rotated.
