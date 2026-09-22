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
| T4 | `isLegalPair`, `pickBlock` re-expressed over it | core | **TODO — next** |
| T5 | `matchesPair` over two packages | core | TODO |
| T6 | Per-criterion must-have flag | core | TODO |
| T7 | The sweep: generate, prune, score, rank | **web** (was api) | TODO |
| T8 | `POST /search/pairs` + its own body limit | api | **dead** — see below |
| T9 | Widen `Pick` to a union | web | done (#19) |
| T10 | The search surface | web | TODO |
| T11 | Settle the own-twice question empirically | domain | done — `TODOS.md` #4 |
| T12 | Wireframe for the design review | web | done (#23) |
| T13 | Generate the master JSON from the SQL extract, as a build step | build | TODO |
| T14 | `MasterData` takes plain rows, not a `DatabaseSync` | core | done, shipped inside #22 |
| T15 | Run the sweep in a web worker | web | TODO |
| T16 | Decide what `explain-pair` is for once the sweep is local | api | TODO |

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
  done  done   ^^^                     ↑
               (T4 and T6 still edit filter.ts -- one file, sequential)
  T13  master JSON build step ─────────┘   (T7 needs game data in the browser)

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
