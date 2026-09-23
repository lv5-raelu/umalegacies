# M7 implementation

The execution order for the pair search. The *design* lives in
`planner-that-shows-its-work.md` under **M7 — The pair search**, and that file is the
source of truth for what each of these builds and why. This one only records what is done,
what is next, and what depends on what.

Written down 2026-09-22 because the breakdown existed only in a chat transcript. Two of the
corrections below were discovered by re-reading the code rather than the notes, which is the
argument for the file.

---

## Status

| | task | where | state |
|---|---|---|---|
| T1 | Spike the sweep on Vercel, cold and warm | infra | **done** — and its result reversed the architecture, see below |
| T2 | Create `packages/core`, move both predicates | workspace | **partly done** — see T2b |
| T2b | Move `filter.ts` and `joint.ts` into core | core | done (#25) |
| T3 | `maxStarsFor(scope, subject)` + pair ceilings | core | done **[REGRESSION]** — guard is the required arg |
| T4 | `isLegalPair`, `pickBlock` re-expressed over it | core | done |
| T5 | `matchesPair` over two packages | core | done — verified against the real roster |
| T6 | Per-criterion must-have flag | core | done |
| T7 | The sweep: generate, prune, score, rank | core | done — measured on the real roster |
| T8 | `POST /search/pairs` + its own body limit | api | **dead** — see below |
| T9 | Widen `Pick` to a union | web | done (#19) |
| T10 | The search surface | web | done — **M7 release 1 is complete** |
| T11 | Settle the own-twice question empirically | domain | done — `TODOS.md` #4 |
| T12 | Wireframe for the design review | web | done (#23) |
| T13 | Generate the master JSON from the SQL extract, as a build step | build | done — 28 KB gzipped, parity proven |
| T14 | `MasterData` takes plain rows, not a `DatabaseSync` | core | done, shipped inside #22 |
| T15 | Run the sweep in a web worker | web | done — verified in a real browser |
| T16 | Decide what `explain-pair` is for once the sweep is local | web | done — the pair is explained in the tab |

## Two corrections the original list does not carry

**T8 is dead and T7 changed runtime.** The eng review of 2026-09-18 planned a server sweep:
T7 was an API task and T8 was its route. The 2026-09-21 measurement moved the sweep into the
browser, and the design doc's *What this deletes* is explicit — no search endpoint, no roster
upload per search, no top-N truncation, no cursor, no re-sweep past row 200. T13 and T15 exist
only because of that decision: they are the browser's replacements for the route. Do not
resurrect T8 from the old list.

**T2 was recorded done with its second half unbuilt.** It read "create `packages/core`, move
both predicates". The workspace exists and the engine moved, but `matchesCriterion` and
`jointOdds` are still in `packages/web` (`roster/filter.ts`, `lineage/joint.ts`, seven
importers between them). The design doc's claim that the list filter and the pair search
"agree by construction" holds only when there is one copy of each, so this is a prerequisite
rather than tidying. It is tracked here as T2b.

## Order

```
  T2b ─→ T3 ─→ T4 ─→ T6 ─→ T5 ─→ T7 sweep ─→ T15 worker ─→ T10 surface
  done  done  done  done  done    done         done          ^^^
  T13  master JSON ─→ done.  Only the UI is left, plus T16's decision.

  T10 AND T15 COULD NOT BE PARALLELISED. T10 calls the client T15 builds, in
  the same package; building it against an interface that did not exist yet
  would have meant inventing it twice. T16 is independent but it is a DECISION
  rather than an implementation, so it belongs in front of the builder.

  independent of the chain:
   T16  explain-pair decision
```

**T3 left one thing for T10.** `maxStarsFor` answers `'pair'` now (6 and 18), but
`SparkFilter` still asks it for `'package'`, because threading a subject through
that component is surface work. The gap is one prop rather than a missing
function. `restoreCriteria` in `selection.ts` carries the same note: a stored
criterion has no field saying which surface wrote it, so a pair's `12 across the
lineage` would be dropped as out of range today. Both are commented in place.

`packages/core` gates everything in the chain, and `filter.ts` is claimed by three tasks at
once, so the chain is genuinely sequential. T13 is the only thing that can run beside it.

**T4 pinned a boundary between two questions.** `pickBlock` gates a CLICK and
`isLegalPair` judges a PAIR, and they are not interchangeable: `pickBlock`
validates only the card being clicked, trusting that whatever is already picked
was checked when it went in. Switch the trainee to an already-picked uma and that
invariant breaks — the pair is illegal, `isLegalPair` says so, and `pickBlock`
still reports the other card as clickable. The app handles it downstream (the
lineage goes null and the tree closes), so it is a boundary rather than a bug,
and `filter.test.ts` now asserts both the agreement and the exception.

**T6 settled what the flag means on each surface, and it is not the same thing.**
The sweep reads `isRequirement(criterion, kind)`: blue, pink and green always
prune, whites only rank until promoted. `filterVeterans` deliberately does NOT
read it — a list has nothing to rank with, so an un-promoted white must still
filter or the roster filter loses its main use. So a `SparkCriterion` means two
things depending on the reader, exactly as `minStars` already does across the two
ceilings. T10 decides whether the search's control and the list's control are
even the same control.

**T5 checked the plan's own arithmetic against the roster, and corrected it.** With
`isLegalPair` and `matchesPair` both in place, the design doc's "25 of 33,411
pairs meet Stamina >=12 AND Medium >=4" became testable. It reproduces *exactly*
at 25 when pair legality is ignored, which is good evidence `matchesPair` is
right — and three of those 25 are same-character pairs the game refuses, so the
real figure is **22 of 30,808**. The 33,411 quoted throughout the design is the
size of the space, not of the search: 2,603 combinations are illegal before
anything is scored, and choosing a trainee cuts it to ~20,000. Every latency
number in the design was measured against 33,411 and is therefore conservative.
Both figures are now corrected in `planner-that-shows-its-work.md`.

**Both local-only scripts were broken by PR #22, and both are fixed.** The
`packages/core` extraction moved the engine out from under
`scripts/check-roster.mjs` (the oracle harness, which compares every
per-grandparent affinity against a transcription of hakuraku) and
`scripts/build-fixtures.ts` (which generates the golden fixtures CI reads).
Neither is imported, compiled or run by anything in CI — both need `master.mdb`
and `data.json` — so both were dead for eight days with nothing to report it.

After the fix: the oracle passes **1,036 comparisons across 259 lineages**, and
regenerating the fixtures produces all 7 byte-identical, so the committed
expected values are exactly reproducible from the current engine.

`src/scripts-resolve.test.ts` is the guard. It checks every import specifier in
`scripts/` against the source tree, and it found the second breakage within
seconds of being written. It does NOT catch type-level drift — `MasterData`'s
constructor also changed shape, and a `.mjs` file gets no typechecking from any
config here.

**T7's measurement, on the real roster (259 veterans, Gold Ship as trainee, Node).**
`sweepPairs` lives in `packages/core`; it runs in Node today, which is how these
were taken. T13 and T15 are what let it run in a browser.

```
  no criteria (worst case)      legal 24,958   scored 24,958   1,534 ms
  4 filters, whites soft        legal 24,958   scored 18,996   1,128 ms
  4 filters, whites PROMOTED    legal 24,958   scored  2,930     205 ms
  Stamina >=12 AND Medium >=4   legal 24,958   scored     13       7 ms
```

**0.061 ms per scored pair**, against the 0.066 ms/pair the 2026-09-18 spike
measured for Node — so the composition costs nothing over the engine it wraps.

**The prune is ~240x cheaper than the score, which is the number T6 was built
for.** The last row prunes 24,958 pairs and scores 13 in 7 ms total, so the
prune pass is roughly 0.25 microseconds per pair against 61 for a score.
Promoting four whites from preferences to requirements cuts the work 6.5x
(18,996 scored to 2,930) and the wall time 5.5x.

**Promotion changes what is scored, not how it ranks.** The top result is
identical (joint 0.17070613) whether the four whites prune or merely rank, which
is the correctness property that makes the lever safe to offer: the best pair
already met the requirement, so it survives either way.

One row is not what it looks like: "4 filters, whites soft" scores 18,996 rather
than all 24,958, because one of those four is Medium, which is PINK and so a
requirement whatever the flag says.

**T13 shipped the game data to the browser, and proved it is the same data.**
`packages/web/public/master.json` is generated from the committed SQL extract and
committed alongside it, so the web build stays standalone and a clean clone can
`npm run dev`. `master-json.test.ts` regenerates and compares, so drift is a red
build rather than a browser sweeping against last patch's data.

```
  master.json        121,319 bytes raw    28,310 gzipped
  parse + decode         0.8 ms
  build MasterData       1.1 ms
```

**Columnar, and measured before choosing.** Rows-as-objects repeat every key on
every row; keys once plus parallel value arrays came to 390,307 raw / 42,134
gzipped against 120,641 / 28,264. A third off the wire, and a third of the bytes
to parse -- the half gzip cannot help with. It also beats the 2026-09-18 spike's
projected 33 KB, which was measured on pre-built Maps rather than raw tables.

**Parity is proven, not assumed.** A full sweep driven by a `MasterData` built
from the JSON returns results byte-identical to one built from `node:sqlite` --
same 2,930 scored pairs, same top joint `0.17070613945720706`, same ordering.

**T15 put the sweep in a worker, and the reason was measured in a real browser.**

```
  worst-case sweep      1,179 ms   (24,958 legal pairs, all scored)
  main thread meanwhile   141 animation frames, longest gap 9.4 ms
```

Roughly 60fps throughout. On the main thread that same sweep is a 1.2-second
freeze with a spinner that cannot spin.

Driven against the real roster through the real worker, the numbers agree with
every other path: legal 24,958, scored 2,930, top joint `0.17070613945720706` --
bit-identical to the Node sweep (T7) and the JSON-backed one (T13). A second
search took 184 ms against the first's 251 ms, which is the worker being reused
rather than rebuilding its `MasterData`. A deliberately wrong `masterHash` was
refused.

**Two bugs in the client, both found by tests before the browser saw them.**
Posting the bare query left every reply carrying `id: undefined`, so no reply
ever matched and the promise never settled -- a hang with no error. And
`search()` cancelled unconditionally, killing the idle worker and rebuilding its
`MasterData` every time, while a comment three lines above claimed the opposite.
Both are pinned by tests that were re-run against the broken versions to confirm
they fail.

**The worker builds for production, checked rather than assumed.** Nothing
imports the client yet, so Vite tree-shakes the worker out entirely and the
`new Worker(new URL(...), { type: 'module' })` idiom was unverified. Temporarily
importing it produced a separate 15,184-byte chunk, so T10 will not discover a
bundler problem.

**T16: the pair is explained in the tab, and the route survives anyway.**
Measured in a browser against the real roster:

```
  explainLineage LOCAL    0.375 ms
  explain-pair REMOTE    35.3   ms   (to LOCALHOST, 153,571 bytes back)
  identical JSON         true
```

94x, to localhost -- the ratio only widens over a real network with a cold
function at the other end. Nothing is traded for it: the outputs were compared
as whole JSON documents, not spot-checked. The game data was already downloaded
for the search, so the local path costs nothing extra.

`POST /affinity/explain-pair` is UNCHANGED and still served. It is what the
golden fixtures are generated and checked through, and release 2 needs a server
regardless, since uma.moe authenticates with a key that cannot ship to a
browser. What was deleted is a client wrapper with no remaining callers.

**The staleness check moved with the computation.** The route answered `409
STALE_MASTER_HASH` when the caller's extract was not the server's; the page now
compares `master.json`'s hash against the hash its roster was resolved with and
raises `StaleMasterError`, which drives the same banner.

**THE BIGGER FINDING, DELIBERATELY NOT ACTED ON.** Every route the web calls
could run in the browser: `roster.ts`, `validate.ts` and `roster-validate.ts`
import only `@umalegacies/types` and `@umalegacies/core`, and `master.json`
carries the 1,775 `textData` rows that hold the names. Going fully client-side
would turn parse-and-discard from a server promise into a structural fact and
remove a 157 KB roster upload per load. The builder scoped T16 to the pair only;
the rest is a milestone of its own, not a task.

**THE TWO SURFACES DO NOT SHARE A REQUIREMENT LIST, and the first cut of T10
did.** Reported by the builder: pick a pair from the search, go back, and the two
parents are not in the roster list. The cause is a category error --
`matchesCriterion` asks whether ONE veteran meets the whole requirement,
`matchesPair` asks what six ancestors carry between them -- so a requirement
authored for a pair was applied to single veterans. Measured on the real roster:

```
  "End Closer >= 7 across the lineage"
    search found                  103 pairs
    roster list showed              0 of 259 veterans
    best pair held 8 stars as 3 + 5; neither half cleared 7 alone
```

Worse than the symptom suggested: the list went entirely EMPTY, not merely
missing the picked pair, and above 9 stars that is guaranteed because no single
package can hold more. The builder chose separation over the alternatives, so
`Selection` now carries `criteria` (the roster list, ceilings 3 and 9) and
`searchCriteria` (the search, ceilings 6 and 18). Each is restored against its
own ceiling, which closes the note T3 left in `selection.ts` for T10: a stored
`12 across the lineage` is kept for the search and refused for the list, and
which KEY it was stored under is what says which it is.

Verified after the fix: same search, 103 pairs, pick the top row, and the roster
list behind it holds all 259 cards with both halves present.

**T10 turned the wireframe into the surface, and M7 release 1 is complete.**
The wireframe was never a mock-up to be re-drawn: its layout survived review, so
T10 kept it and replaced `fakePairSearch` with the real sweep. `fake-scores.ts`
and the "every number below is invented" banner are gone.

Verified in the browser, against the real roster, end to end:

```
  trainee + filters shared with the roster screen   yes (persisted, survives Back)
  star ceiling offered by the filter                18   (T3's pair ceiling, was 9)
  must-have toggle on a white                       shown
  Uma Stan as a preference                          24,958 of 24,958 scored
  Uma Stan promoted                                 18,774 of 24,958 scored
  pick the top row -> compare pane                  Gold Ship / El Condor Pasa / Mayano Top Gun
  search row said                                   437 and rank 3
  compare pane said                                 437 = 146 base + 291 bonus, rank 3
```

That last pair of lines is the product's central claim, checked rather than
argued: **the figure the search ranks by is the figure the pane shows**, because
both come from the same `packages/core` functions.

The whole row is the pick control, as a `button`, so eighty results are
reachable from a keyboard in reading order.

## Open design questions, from the wireframe

Neither blocks the chain; both land on T10, which is the last UI task.

1. **80 rows is 24.5 screens.** Showing every spark per half is what makes a row worth
   reading and also what makes the list long. Paging, density modes and collapsing are all
   still open.
2. **Kind grouping is not visually legible inside a row.** Blue runs into pink with only the
   tick colour separating them.

## Deferred, with reasons

`TODOS.md` carries the four: a no-target "what should I breed" mode, per-veteran affinity
memoisation, uma.moe's rate limit under load, and (answered) the own-twice question. Release 2
is the uma.moe borrow source, which reuses release 1's sweep and scoring unchanged.
