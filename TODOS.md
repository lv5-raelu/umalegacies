# TODOS

Work that was considered and deliberately deferred, with enough context that picking it up
later does not mean reconstructing the reasoning. Opened 2026-09-18 by the M7 engineering
review.

A deferral belongs here when it was genuinely weighed and set aside. Something nobody has
thought about yet is not a TODO, it is just absent.

---

## 1. A no-target search: "what should I breed?"

**What.** M7's search answers "given this trainee and these sparks, which pair is best".
It cannot answer "which trainee should I aim at", because every number it ranks by is
relative to a chosen trainee.

**Why.** Raised by the outside-voice review on 2026-09-18 and it is the sharpest product
observation of that session. All odds run through Individual Affinity, which is computed
against `traineeCharaId`; `App.tsx:407-410` builds every pair request around it. So the
search has an unstated precondition — pick who you are breeding first — and a real
question players ask is the one it structurally cannot take.

**Pros.** Answers a question no tool answers, and it is the natural next inversion after
M7 inverts "what do I get" into "what gets it".

**Cons.** Combinatorially much larger: every candidate trainee against every pair. And it
is a different feature wearing M7's clothes, not a missing piece of M7.

**Context.** Do not confuse this with M7. M7's shape is correct for the question it takes.
If this is ever built, the first thing to settle is whether "best" even means anything
without a target build, since the whole notion of a good spark depends on what you are
training toward.

**Depends on.** M7 release 1 shipping, so there is a working sweep to generalise.

---

## 2. Per-veteran affinity memoisation in the sweep

**What.** In a 33,411-pair sweep each veteran appears in 258 pairs, and `explainLineage`
recomputes the trainee-side terms every time. The links involving only the trainee and one
package are independent of the other package, so that half could be computed 259 times
instead of 33,411.

**Why.** Measured 2.4s for the full sweep locally, 0.072ms per pair. Roughly half the work
plausibly factorises.

**Pros.** Could roughly halve the sweep with no change to the result, since it is pure
memoisation rather than approximation.

**Cons.** No problem to solve while the sweep meets its budget, and the whites-may-
hard-constrain decision (D4) means most real searches score far fewer than 33,411 pairs.
Optimising an engine nobody is waiting on is the definition of premature.

**Context.** The parent-to-parent cross term does NOT factorise, so this is a partial win,
not a rewrite. Revisit only if the Vercel spike (Implementation task T1) comes back slow,
or if the borrow pool makes candidate counts much larger.

**Depends on / blocked by.** The Vercel platform measurement. Do not start this before
that number exists — it may be unnecessary or insufficient, and which one matters.

---

## 3. uma.moe's rate limit under real load

**What.** Unmeasured. The 2026-09-18 spike ran 20 sequential calls, all 200, and found no
`X-RateLimit` or `Retry-After` headers advertised.

**Why.** The borrow release (M7 release 2) pages a pool that reports `total: "over 10000"`.
If there is a ceiling, it decides whether borrowing is a sweep or a shortlist, and that is
a shape decision rather than a tuning one.

**Pros.** Cheap to answer and the answer is durable.

**Cons.** Hammering someone's API to find their limit is rude; this needs to be a careful,
slow probe, not a load test.

**Context.** The integration is sanctioned: `GET /api/v1` returns "Bots, scripts, and
integrations should use an API key instead", and the OpenAPI spec calls `X-API-Key` "API
key for server-to-server access and usage tracking". The key lives at
`~/.umalegacies-uma-moe-key`, outside the repo, mode 600. It was pasted into a chat
transcript on 2026-09-18 and should be rotated.

**Depends on.** Nothing. Can be answered any time before release 2 starts.

---

## 4. Can a veteran you own twice fill both halves of a pair?

**What.** Carried over unresolved from the original M7 section. If two roster entries are
the same character, the pair is illegal by the same-uma rule. But two entries can be
genuinely different veterans of the same character with different parents and sparks.

**Why.** `pickBlock` compares by `charaId`, never `cardId`, deliberately: two costumes of
one character are still one character. That is correct for the game rule. The open
question is whether the game actually forbids it, or only forbids the same *card*.

**Pros.** If it is allowed, the candidate set grows and some strong pairs are currently
being excluded from every search.

**Cons.** Getting this wrong in the permissive direction produces pairs the game will
refuse, which is worse than missing some.

**Context.** This project has a hard-won rule about exactly this class of question:
`umalegacies-ask-the-tools-before-asking-memory` (10/10, 2026-09-10). The G1 matching rule
was adjudicated three times from recollection and was wrong all three times; one empirical
test against breeding-optimizer settled it in a message. Do the same here. Design the test
so competing readings predict different numbers, and include a control where they agree.

**Depends on.** Nothing. Answer it before M7 release 1 ships, since it changes which pairs
the sweep is allowed to generate.
