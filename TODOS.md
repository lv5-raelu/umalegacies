# TODOS

Work that was considered and deliberately deferred, with enough context that picking it up
later does not mean reconstructing the reasoning. Opened 2026-09-18 by the M7 engineering
review.

A deferral belongs here when it was genuinely weighed and set aside. Something nobody has
thought about yet is not a TODO, it is just absent.

Grouped by component, P0 first within each group; answered items sit under Completed at the
bottom. Reorganized into this layout on 2026-10-19; nothing was dropped.

---

## Search (M7)

### Per-veteran affinity memoisation in the sweep

**What:** In a 33,411-pair sweep each veteran appears in 258 pairs, and `explainLineage`
recomputes the trainee-side terms every time. The links involving only the trainee and one
package are independent of the other package, so that half could be computed 259 times
instead of 33,411.

**Why:** Measured 2.4s for the full sweep locally, 0.072ms per pair. Roughly half the work
plausibly factorises.

**Pros:** Could roughly halve the sweep with no change to the result, since it is pure
memoisation rather than approximation.

**Cons:** No problem to solve while the sweep meets its budget, and the whites-may-
hard-constrain decision (D4) means most real searches score far fewer than 33,411 pairs.
Optimising an engine nobody is waiting on is the definition of premature.

**Context:** The parent-to-parent cross term does NOT factorise, so this is a partial win,
not a rewrite. Revisit only if the Vercel spike (Implementation task T1) comes back slow,
or if the borrow pool makes candidate counts much larger. The 2026-09-24 rate-limit answer
(Completed, below) made it newly relevant: 259 own veterans against a 1,111-record
borrowed pool is 287,749 pairs, ~21s of scoring at 0.072 ms per pair.

**Effort:** M
**Priority:** P2
**Depends on / blocked by:** The Vercel platform measurement. Do not start this before
that number exists — it may be unnecessary or insufficient, and which one matters.

### A no-target search: "what should I breed?"

**What:** M7's search answers "given this trainee and these sparks, which pair is best".
It cannot answer "which trainee should I aim at", because every number it ranks by is
relative to a chosen trainee.

**Why:** Raised by the outside-voice review on 2026-09-18 and it is the sharpest product
observation of that session. All odds run through Individual Affinity, which is computed
against `traineeCharaId`; `App.tsx:407-410` builds every pair request around it. So the
search has an unstated precondition — pick who you are breeding first — and a real
question players ask is the one it structurally cannot take.

**Pros:** Answers a question no tool answers, and it is the natural next inversion after
M7 inverts "what do I get" into "what gets it".

**Cons:** Combinatorially much larger: every candidate trainee against every pair. And it
is a different feature wearing M7's clothes, not a missing piece of M7.

**Context:** Do not confuse this with M7. M7's shape is correct for the question it takes.
If this is ever built, the first thing to settle is whether "best" even means anything
without a target build, since the whole notion of a good spark depends on what you are
training toward.

**Effort:** XL
**Priority:** P3
**Depends on:** M7 release 1 shipping, so there is a working sweep to generalise.

---

## Roster (web)

### Rebuild a saved roster after a game patch instead of asking for data.json again

**What:** When a visit finds the saved roster was built from older game data, resend the
saved inputs to `/roster/resolve`, refetch the trainee list, store the result under the new
master hash, re-apply the saved selection, and say "The game data was updated, so your
roster was refreshed." Today `App.tsx`'s restore effect wipes the roster and the selection
and asks the user to load their file again.

**Why:** Game data now updates unattended (PR #57), on patch day, roughly every one to two
weeks going by Sep 24, Oct 7, Oct 18 and Oct 27. Every one of those makes every user
re-upload data.json, for data the browser already holds.

**Pros:** No re-upload, ever, for a patch. Nothing new leaves the browser: the saved
`veterans` are exactly the slimmed payload `loadFile` sent on upload (score, card ids,
spark ids, race wins). It also makes the narrower fix unnecessary -- the extract hash
covers the whole file, header included, so a patch that changes master.mdb but none of the
12 tables we read still changes it; with a cheap rebuild that stops mattering.

**Cons:** The optimistic restore shows the old roster before `/master/meta` answers, so on
patch day the old numbers show for a moment and are then replaced, where today they are
replaced by the drop zone. Judged acceptable: the check is a 440-byte, CDN-cached request,
and holding every reload on it would slow all visits to protect one.

**Context:** Looked into on 2026-11-06 and deferred by the builder. What makes it
possible, all in the IndexedDB record (`CachedRoster`, `roster/cache-policy.ts`):
- `veterans` is `RosterVeteranInput[]`, the `/roster/resolve` request body.
- `skipped` and `fileName` come from parsing the file, not from game data, so they stay
  valid.
- `restoreSelection()` already re-checks every stored choice against whatever roster it
  is given and drops only what no longer checks out.

The plan:
1. On `stale-master`, rebuild as above rather than clear.
2. If the rebuild fails (offline, 5xx), hide the roster but KEEP the stored record, so the
   next visit tries again. Never show the old numbers as current.
3. A tab left open across a patch still needs a reload (its `master.json` is the old one).
   Change the "Load the file again" message and the `masterChanged` banner to offer a
   Reload button; step 1 does the rest after the reload.
4. The web package has no jsdom, so put the decision (use, rebuild, hide) in a pure
   function beside `inspectCache` and test every branch there; check the wiring in the
   browser.

**Effort:** M (mostly `App.tsx`, plus `cache-policy.ts` and its tests)
**Priority:** P2
**Depends on:** None

---

## Completed

### uma.moe's rate limit under real load

**What:** Unmeasured. The 2026-09-18 spike ran 20 sequential calls, all 200, and found no
`X-RateLimit` or `Retry-After` headers advertised.

**Why:** The borrow release (M7 release 2) pages a pool that reports `total: "over 10000"`.
If there is a ceiling, it decides whether borrowing is a sweep or a shortlist, and that is
a shape decision rather than a tuning one.

**Pros:** Cheap to answer and the answer is durable.

**Cons:** Hammering someone's API to find their limit is rude; this needs to be a careful,
slow probe, not a load test.

**Context:** The integration is sanctioned: `GET /api/v1` returns "Bots, scripts, and
integrations should use an API key instead", and the OpenAPI spec calls `X-API-Key` "API
key for server-to-server access and usage tracking". The key lives at
`~/.umalegacies-uma-moe-key`, outside the repo, mode 600. It was pasted into a chat
transcript on 2026-09-18. (Rotation was later judged unnecessary; see below.)

**Depends on:** Nothing. Can be answered any time before release 2 starts.

**ANSWERED 2026-09-24. No rate limit is reachable at any pressure this project would
ever apply, and the ceiling that matters turns out to be somewhere else.**

Probed `GET /api/v3/search`, the endpoint release 2 actually uses, at escalating pressure.
Every call returned 200. Nothing was refused, deferred or slowed:

```
  15 requests at 1/s                      15 x 200,  median 0.33s
  20 requests back-to-back (serial)       20 x 200,  10s total  -> 2.0 req/s
  5 batches x 4 concurrent                20 x 200,  3s total
  4 batches x 8 concurrent                32 x 200,  3s total   -> ~10.7 req/s
  12 full pages (limit=100) serial        12 x 200,  13s        -> 92 records/s
  8 full pages at concurrency 4            8 x 200,  3s         -> 267 records/s
```

About 140 requests in total across the session, deliberately bounded and aborting on the
first refusal, which never came. **Latency did not move under concurrency**: full pages
took ~1.0s each whether fetched one at a time or four at a time, which is the signature of
no throttle rather than a generous one. No `X-RateLimit`, `Retry-After` or quota header
appears on any response, and the OpenAPI spec at `/api/docs/openapi.yaml` documents no
limit either -- it describes the protection as a gate on *who* may call
(`X-API-Key` or `X-Browser-Proof`), not on how often.

**The real constraints are three other numbers, and they are the ones that decide release
2's shape.**

1. **`limit` caps at 100.** The spec says `maximum: 100` and the server silently clamps:
   `limit=500` returns 100 items and the same 205 KB. A record is ~2 KB, so a page is
   ~205 KB.
2. **`total: "over 10000"` is a display cap, not the pool.** `total_pages` is
   `ceil(cap / limit)` -- 101 at `limit=100`, 10001 at `limit=1` -- so it carries no
   information about the real size. Paging does not stop there: `page=200` returns 100
   items, distinct from pages 1, 50, 100 and 101 (500 fetched, 500 distinct account ids).
   Ordering is stable, so paging is safe to parallelise.
3. **Server-side filters narrow it hard, and the total becomes exact below 10,000.**

```
  (no filter)                                             over 10000
  blue_sparks=203                                         over 10000
  blue_sparks=203 & pink_sparks=1202                           5,866
  ... & min_white_stars_sum=40                                 1,111
  white_sparks=1002402 & white_sparks=2005002                  7,114
```

**So borrowing is a FILTERED SWEEP.** Not a shortlist, because the API will happily serve
whatever is asked for; and not a whole-pool pull, because that is 10,000+ records and
~21 MB for a question the server can answer in one query. A realistic filtered pool of
1,111 records is 12 pages, ~2.4 MB, ~13s serial or ~4s at concurrency 4. That is a
progress bar, not an architecture.

**What now binds is our own sweep, not their API.** 259 own veterans against 1,111
borrowed is 287,749 pairs, and at the measured 0.072 ms per pair that is ~21s of scoring.
The API hands over its half in 4 seconds and then we spend twenty on it. So the
open performance question for release 2 is the sweep, which makes the per-veteran affinity
memoisation item (Search, above) newly relevant -- it was parked on "no problem to solve
while the sweep meets its budget", and this is the first credible way that budget breaks.

**Politeness note for whoever runs this again.** The probe escalated and aborted on the
first refusal by construction; it is `uma-moe-probe`-shaped, not a load test. There is no
reason to re-run it. If release 2 ever does see a 429, the answer is already known to be
absent from the headers, so back off on the status code alone.

**Rotation, decided 2026-11-05: not needed.** The key at `~/.umalegacies-uma-moe-key` was
pasted into a chat transcript on 2026-09-18, and was to be rotated. The builder decided
against it, so the item that tracked it (Borrow, "Rotate the uma.moe API key") is gone. The
key stays outside the repo, mode 600, and server-side only.

**Completed:** answered 2026-09-24 (no version; this repo does not version releases)

### Can a veteran you own twice fill both halves of a pair?

**What:** Carried over unresolved from the original M7 section. If two roster entries are
the same character, the pair is illegal by the same-uma rule. But two entries can be
genuinely different veterans of the same character with different parents and sparks.

**Why:** `pickBlock` compares by `charaId`, never `cardId`, deliberately: two costumes of
one character are still one character. That is correct for the game rule. The open
question is whether the game actually forbids it, or only forbids the same *card*.

**Pros:** If it is allowed, the candidate set grows and some strong pairs are currently
being excluded from every search.

**Cons:** Getting this wrong in the permissive direction produces pairs the game will
refuse, which is worse than missing some.

**Context:** This project has a hard-won rule about exactly this class of question:
`umalegacies-ask-the-tools-before-asking-memory` (10/10, 2026-09-10). The G1 matching rule
was adjudicated three times from recollection and was wrong all three times; one empirical
test against breeding-optimizer settled it in a message. Do the same here. Design the test
so competing readings predict different numbers, and include a control where they agree.

**Depends on:** Nothing. Answer it before M7 release 1 ships, since it changes which pairs
the sweep is allowed to generate.

**ANSWERED 2026-09-21, empirically, and the existing rule is correct.** Tested against
2,500 unique real inheritance records from uma.moe covering 66 distinct characters:

```
  two parents, same CARD                         0   (0.000%)
  two parents, same CHARACTER                    0   (0.000%)
  control: uma's own parent is its own character 0   (0.000%)
```

Random pairing across 66 characters would give roughly 38 same-character pairs and 75
control hits. Both are zero. The control is the informative half: the constraint is
general to the DIRECT parent relationship rather than peculiar to the two-parents slot.
That squares with what this project already verified independently -- fixture 5774 has the
trainee's character appearing as a GRANDPARENT, modelled deliberately -- so a character may
repeat at distance 2 and never at distance 1.

`pickBlock` compares by `charaId` and refuses two parents of the same character. That
matches 2,500 real records with zero counterexamples. No change to the sweep's legality.

Honest caveat: observational absence is not proof of an engine constraint. It is equally
consistent with "possible but universally avoided". The zero control and the known
distance-2 positive are what make the forbidden reading the better-supported one. Method
followed [[umalegacies-ask-the-tools-before-asking-memory]]: 2,500 records beat asking
anyone to recall a rule.

**Completed:** answered 2026-09-21 (no version; this repo does not version releases)

### Game-data counts quoted by hand in comments drift between patches

**What:** Either stop quoting exact game-data counts (characters, playable cards, ambiguous
cards, multi-costume characters, rarity rows) in code comments, or add a test that checks
the quoted figures against values computed from the extract.

**Why:** The counts are copied into about a dozen comments across README, core, types, api
scripts, web and tests, and only the `roster.test.ts` assertions are checked. The
2026-10-18 refresh updated 16 such lines, 9 of which had already gone stale through earlier
patches (`35 of 68`, `105 cards`, `340 in all`), so each patch silently leaves some behind.

**Context:** Raised by the maintainability reviewer during /ship of game-data-2026-10-18
and deferred by the builder rather than changed inside a data PR. A guard test would grep
phrases like "N of M characters" and compare them to `traineeOptions(extractMaster())`;
the alternative keeps exact numbers only in the asserting tests and the README's
"After a game update" section. Start by listing every quoted count with
`git grep -nE '[0-9]+ of (the )?[0-9]+ (characters|cards)|[0-9]+ (playable )?cards'`.

**Completed:** solved 2026-11-05 by the automated game-data work (PR #57), by the first
alternative rather than the guard test. The exact counts are no longer quoted by hand:
`packages/api/data/master-meta.json` holds them, computed in SQL from the extract on every
`build:master`, and `roster.test.ts` asserts against that file. Comments say "most cards",
"over half", "every card but two". Nothing needs updating per patch, which matters now that
patches land unattended.
