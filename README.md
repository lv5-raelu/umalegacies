# Uma Legacies

A companion tool for **Umamusume: Pretty Derby** that reads your own trained-character
roster and helps you plan the next career run.

The game gives you almost no help deciding which two veterans to inherit from. It shows a
◎/〇/△ icon, which is the *pair total* bucketed by `succession_relation_rank` (◎ starts at
151), and it never shows the number itself. It also never shows Individual Affinity, a
different per-member quantity that is what actually drives spark rates, nor the odds that
any given spark fires during inspiration. This tool computes all of it from the game's own
data, and shows which rows produced each number.

## Goals

1. **Answer questions the game refuses to.** Exact affinity numbers, per-spark
   activation odds, and what changes if you swap a parent.
2. **Work off your real roster.** Existing calculators make you hand-enter every uma.
   This reads your export, so it knows what you actually own.
3. **Show the reasoning, not just a verdict.** Every number is traceable back to the
   relations and race wins that produced it.

## Architecture

An npm-workspaces monorepo.

```
packages/
  types/  The wire types both sides read. Types only; emits no JavaScript.
  api/    NestJS. Reads master.mdb, resolves IDs to names, computes affinity.
  web/    React + Vite + TypeScript. All UI.
```

**`packages/types` has no build step**, and that is what makes it affordable. Every import
of it is an `import type`, which erases, so neither workspace gains a build-order dependency
on it and `tsc`, Vite and Vitest all read it as plain source. The rule that keeps this true
is that nothing in it may emit a runtime value -- no `const`, no `enum`, no function -- and
`packages/api/src/types-package.test.ts` enforces that, because the failure mode is invisible
until the built API tries to `require` a `.ts` file at startup. Runtime tables that describe
these shapes (position tuples, spark base rates, render order) stay in the workspace that
owns the behaviour. It replaced a 158-line hand-mirrored copy in the web app.

**Why a backend at all:** because it is the version worth writing, not because a static
build is impossible. A slim extract of `master.mdb` would fit in a browser — other tools in
this space ship one at around 80 KB — so this is a preference, and it is recorded as one in
`docs/designs/`. The API owns the database and the web app asks questions of it.

**Data flow:** you export your trained characters as `data.json` with
[UmaExtractor](https://github.com/xancia/UmaExtractor) and open it here. The browser
parses it and **slims it to three public fields per uma** (card id, win-saddle ids, spark
factor ids) before anything is sent; the API resolves those raw ids into names, costumes and
sparks, and retains nothing. Personal fields -- `owner_viewer_id`, which is other players'
12-digit trainer ids, plus nicknames, timestamps, stats, skills and race history -- have no
wire representation at all, so the promise that the save stays on your machine is enforced
by the request shape rather than by server policy. The resolved roster is then kept in
this browser's IndexedDB, so a reload restores it instead of sending you back to the file
picker.

### Domain model

Two inputs, both user-provided and both gitignored:

- **`master.mdb`** — the game's master database. Character names, cards, skills,
  succession factors, succession relations, race definitions, win saddles.
- **`data.json`** — your trained-character export, produced by
  [UmaExtractor](https://github.com/xancia/UmaExtractor). The game exports nothing itself,
  so that tool is the only way to get one. Each entry carries its own sparks plus its two
  parents' sparks and race wins, so one veteran describes a three-generation subtree.

### How affinity works

A legacy has seven links between the trainee and their ancestors, decomposing into twelve
variables — seven Base Affinities and five Bonus Affinities.

- **Base Affinity** comes from succession relations both (or all three) members share.
  Trainee↔parent and parent↔parent are two-way. Parent↔grandparent is three-way: the
  trainee, the parent and the grandparent must *all* share the relation.
- **Bonus Affinity** comes from overlapping G1 wins. Each shared G1 is worth +3 to both
  members. **Match on the raw `single_mode_wins_saddle.id`. Do NOT normalise to `group_id`.**
  Some races are stored under several ids sharing one `group_id`, differing by racecourse —
  Takarazuka Kinen is `14` at Hanshin and `147` at Kyoto, JBC Classic has four. Those are
  **different wins** and do not count as shared. Verified 2026-09-10 against
  `breeding-optimizer` on a lineage where the two readings predicted different per-grandparent
  Individual Affinity; it reported the raw-id values on both discriminators and matched on
  both controls.
- **Individual Affinity** is the sum of the links feeding one member: four links for a
  parent, one for a grandparent. This is the number that drives spark rates.

A spark activates at `base rate × (1 + Individual Affinity / 100)`, capped at 100%.
Inspiration fires twice per career run, so the odds of at least one activation are
`1 - (1 - p)²`.

Nothing couples one spark's roll to another's, not even when the same ancestor carries
both, so the chance that EVERY spark in a filter arrives is the product of their
individual chances. That is usually the question being asked: a filter naming four whites
is one build rather than four separate wishes, and four sparks at 40% each is 2.6%.

The product runs over the sparks a pair **actually carries**, and the label beside it says
so -- "5 of 6 activate" rather than "all 6". It used to zero the moment a pair missed
anything, which was true and useless: whites rank rather than exclude, so on a realistic
whites-only search every row read 0% and none could be told from another. What keeps that
honest now is that the search ranks on COVERAGE before the product, so a pair missing a
spark already sorts below every pair that has it, and the row prints an em dash against
whatever it lacks.

Base rates by star level (1★/2★/3★): blue 70/80/90%, pink 1/3/5%, green 5/10/15%,
race 1/2/3%, other whites 3/6/9%.

### Activating a spark is not inheriting it

Everything above is about the RUN: a spark that activates during an inspiration hands the
trainee a skill hint they can buy with SP. **It does not hand them the spark.** Whether the
trainee *finishes the career carrying* it -- which is what makes them useful as somebody
else's parent -- is decided by a separate roll at the end of the career, and that roll is
not scaled by affinity at all. It rises with how many of the six ancestors already carry
the spark, and doubles if the trainee learns the skill's **gold** version:

| ancestors carrying it | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| plain white skill | 20% | 22.5% | 25% | 27.5% | 30% | 32.5% | 35% |
| **gold version** | 40% | 45% | 50% | 55% | 60% | 65% | 70% |

The gold form is a different skill with the same factor -- only the white version of a
skill has one -- so learning it changes the odds and nothing else. Which version the
trainee will learn is a *plan* rather than a fact about the lineage, so it is a per-spark
toggle on the search filter and defaults to white, which is the floor.

**Whites only.** The trainee's blue comes from their own final stats, their pink from their
own A-or-better aptitudes, and their green IS their own unique skill. Nothing an ancestor
carries moves those three, so the tool prints an em dash rather than a number.

**The roll needs a precondition, and it differs by kind.** A skill spark needs the skill
learned, a race spark needs that G1 won, a scenario spark needs the scenario cleared. Only
the first has a route this tool models, so `COMBINED` -- activation × inherit -- exists for
skill sparks alone. Read it as a floor: it assumes the hint gets bought, and it counts only
the inspiration route, so the same skill learned off a support card falls outside it.

**Three words, used strictly.** *Activate* is the spark firing during a run, which is the
only thing the odds tables above describe. *Inherit* is the end-of-career roll that turns a
learned skill into one of the trainee's own sparks. *Combined* is the two multiplied. The
word "inherit" used to cover both halves in this codebase and no longer does.

**It is additive, 2.5 points per ancestor, and one plausible misreading is invisible here.**
2.5 is exactly an eighth of 20, so `20 + 2.5n` and `20 × (1 + n/8)` are the same number at
every n. They part company on the gold row, which starts at 40% and ends at 70% rather than
the 78.75% a multiplicative reading would give. A secondary source quoting the upgraded-skill
row as ending at 44% is the rounded `25 × 1.75`, and it is what would have produced that
wrong model.

Like the activation rates, this is community research rather than anything `master.mdb`
publishes. Unlike them, it has been checked here against 2,800 real lineages -- see
`docs/designs/planner-that-shows-its-work.md`.

## Getting started

Requires Node 24+. Nothing else: the master data the API needs is committed,
and there is no native module to compile.

The floor is 24 because the API reads SQLite through Node's built-in
`node:sqlite` rather than a compiled addon, and the `iterate()` it uses is only
available unflagged from 23.4. Vercel's function runtime is `nodejs24.x`, so
local and deployed agree.

```bash
npm install
npm run dev:api     # the API, on :3000
npm run dev:web     # the app, on :5173  <- open this one
```

**Open `http://localhost:5173` and nothing else.** Vite forwards `/api` to the
API on :3000, so the browser only ever talks to one origin -- which is exactly
what a deployment does, where a rewrite sends `/api/*` to the function and
everything else to the static build. That is why `API_BASE` in
`packages/web/src/api/client.ts` is the relative path `/api` and why there is no
CORS configuration anywhere: there is no cross-origin request to allow, in
either place.

Hitting `http://localhost:3000` directly still works and is useful for curling
the API, but it is not how the app runs.

`npm run dev:api` compiles and watches, because the API is ESM and NestJS needs
`emitDecoratorMetadata`: `ts-node/register` is CommonJS-only, `ts-node`'s ESM
loader will not map `.js` specifiers back to `.ts` on Node 24, and Node's own
type stripping cannot emit decorator metadata. So it runs `tsc --watch`
alongside `node --watch dist/main.js`.

`vercel dev` is NOT the local story, despite the deployment being a Vercel
project. It compiles the API's TypeScript itself with a compiler that drops
decorator metadata, so every injected dependency arrives `undefined`; setting
`devCommand` does not override it.

Portraits and the rank atlas are committed, so a clone already has them. After a
game patch adds cards, fetch the new ones (existing files are skipped) and commit
them:

```bash
npm run fetch:portraits --workspace @umalegacies/api
npm run fetch:rank-icons --workspace @umalegacies/api
```

Open the web app. It renders one committed fixture lineage, picked from the
selector at the top right; `data.json` upload is M3 and does not exist yet.

### The roster is remembered, in your browser only

After a file is read, the slimmed roster and the resolved names, sparks and odds are stored
in IndexedDB under `umalegacies`. A reload brings them back without another trip to the file
picker. **Forget this roster** beside the file name deletes the record; loading a different
file replaces it.

What is stored is what was already sent: card ids, win-saddle ids and spark ids, plus the
names and odds the API resolved from them. `owner_viewer_id` -- the 12-digit trainer ids of
everyone you have borrowed from -- along with nicknames, timestamps, stats, skills and race
history, are stripped by `slimSave` in the browser *before* anything is sent or stored, so
the raw save never reaches the cache. The server still retains nothing; this is a client-side
convenience and changes no promise the API makes.

The record is keyed to the master extract it was computed from. If the extract is rebuilt --
a game patch -- the stored roster is discarded on the next visit and says so, rather than
showing numbers derived from game data that has since moved. It is also discarded when the
app's own cache format changes, or when the record does not read back intact.

Storage failures are not errors: a private window, blocked site data or a full quota all fall
back to the behaviour above, which is reading the file each time.

### Portraits are committed

`packages/web/public/portraits/<card_id>.png` is **committed**, and so is the rank
atlas in `packages/web/public/rank-icons/`. Both used to be gitignored, because they
are Cygames' artwork and gametora and daftuyda.moe rehost it without being able to
grant redistribution rights. That was reversed on 2026-09-18, by the builder, because
it made every automated build ship with no artwork at all. A deployment only sees
committed files, and a missing portrait looks exactly like the designed initials
fallback, so nothing flagged it. `NOTICE.md` records the reversal and the rights
position.

So after a game patch, run `fetch:portraits` and commit whatever it writes. A new
card with no committed portrait deploys as initials.

**Keyed by card, not by character.** A card is a costume, and a costume carries
its own unique skill, which IS the green spark. 35 of the 68 characters have
more than one card, and on a real roster 15 appear with two different greens:
Oguri Cap `100601` is *Triumphant Pulse*, `100602` is *Festive Miracle*. Keying
by `chara_id` drew one costume's face directly above another costume's spark.

`scripts/fetch-portraits.mjs` reads `card_data` from the committed extract,
verifies PNG magic bytes rather than trusting a 200, and skips anything already
on disk, so a re-run after a patch fetches only what is new. 105 of 107 cards,
about 900 KB. The two misses are `9100101` and `9101101` — the same pair the
`card_id / 100` gotcha below calls out. gametora does not host them because they are
not real costumes: both have `default_rarity` 0 and no skill set, so nobody can train
them. `MasterData` still resolves them to a character but never offers them as a card,
which keeps them out of the trainee picker. Before that, each one showed up as a
second, portrait-less copy of a real costume.

### The two data files

**`master.mdb` is not in the repository, and is not needed to run the app.**
`packages/api/data/master-extract.sql` is, and the API serves from it by default.
The extract holds 12 of `master.mdb`'s 416 tables and 1,775 of `text_data`'s 54,234
rows, against a 16 MB binary.

Three of those tables are **projected to the columns this app reads** rather than copied
whole: `skill_data` is 78 columns of race-simulation parameters and only `id`,
`skill_category` and `rarity` are used, and `succession_factor_effect` collapses to the
factor-to-skill mapping once its five hint-level rows per factor are deduplicated.
`card_rarity_data` is both projected and deduplicated: it stores one row per card per
rarity and the ten aptitudes are identical across them, so 340 rows become 105.

A projected table gets a `CREATE TABLE` written from the columns asked for, with types
read back from the source schema so a projection cannot quietly change one.

It is text rather than a `.mdb` on purpose. A game patch produces a reviewable
line-by-line diff instead of an opaque blob, and it is *smaller in history* than
the equivalent binary (~31 KB versus ~42 KB), because SQLite reorganises pages on
write and consecutive extractions of the real file share only 24% of their bytes
at the same offset.

**`data.json` is yours and stays out.** It is your own save export, and it also
carries the 12-digit trainer IDs of everyone you have borrowed an ancestor from.
`.gitignore` covers it, and both files are globbed so patch-day backups
(`.old`, `.bak`) are caught too.

### After a game update

Put the new `master.mdb` at the repository root, then:

```bash
npm run build:master   --workspace @umalegacies/api   # regenerate the extract
npm run build:fixtures --workspace @umalegacies/api   # regenerate the fixtures
npm run build:master-json --workspace @umalegacies/api # regenerate web/public/master.json
npm run fetch:portraits --workspace @umalegacies/api  # new cards' portraits; commit them
npm test
```

If a patch moved anything the affinity rules read, the golden boot check fails
loudly rather than quietly serving different numbers. To run the API against the
full `master.mdb` instead of the extract, set `MASTER_DB_PATH`.

## Conventions

**Styling — no Tailwind.** Plain CSS Modules, one file per component, colocated and named
after it: `VeteranPicker.tsx` is styled by `VeteranPicker.module.css` sitting beside it and
nothing else. A component's styles never live in another component's file or in a page-level
stylesheet. Only design tokens (colors, spacing, typography) and a minimal reset belong in
the global stylesheet.

**Domain logic lives in the API.** The web app renders and inputs. Anything that reads
master data or computes affinity belongs in a NestJS service, so the rules exist in one
place and can be tested without a browser.

**Validate at the boundary.** Request bodies are shape-checked before use. A malformed
request should be a 400 with a message naming the problem, never a 500 from a destructured
`undefined`.

**Client storage is IndexedDB, not localStorage.** A resolved roster runs to several MB of
UTF-16, past the ~5 MB per-origin localStorage quota. Treat the cache as disposable: it can
always be rebuilt from a re-upload, so prefer resetting it over wedging the app.

**Comments explain why.** The affinity rules and the master-data quirks are not guessable
from the code. Where a line encodes a non-obvious game rule, say which rule and why.

**Read `DESIGN.md` before writing markup.** It holds every colour, typeface, spacing and
shape decision, with the reasoning and the overrides. The web app's global stylesheet is
`packages/web/src/styles/tokens.css` and every value in it traces to a line there.

**The UI develops against the same fixtures the tests assert on.** `GET /affinity/fixtures`
serves the committed `ExplainRequest`s and the screen POSTs one to `/affinity/explain`, so a
UI bug and a test failure cannot disagree about what the data is. A screen built against
hand-typed numbers drifts from the engine within one edit; this project has been bitten by
that twice.

## Gotchas

- **Open :5173, not :3000.** The app is served by Vite, which proxies `/api` to the API.
  Opening the API's port directly gives you an app-less API, and opening a Vite that
  fell back to another port gives you a tab that is not the one being hot-reloaded --
  which is why `vite.config.ts` sets `strictPort` and fails instead of drifting.
- **`setGlobalPrefix` does not move `app.use()` mounts.** It moves Nest ROUTES. Express
  middleware mounted on a path keeps that path, so the oversized-body parser for
  `/api/roster/resolve` has to be mounted at the prefixed path by hand. Get this wrong
  and the 256 KB global parser silently takes over; `route-contract.test.ts` guards it.
- **The roster body limit must stay under 4.5 MB.** Vercel rejects larger bodies at the
  platform edge, before any code runs, so `error.filter.ts` never sees them and the
  client gets an HTML error page instead of an `ErrorResponse`.
- **`node:sqlite` prints an ExperimentalWarning on boot.** It is expected and the API is
  not experimental about it: every query this app makes (`prepare`, `all`, `get`,
  `iterate`) is covered by the 228-test suite running against the real extract.
- **`succession_factor.rarity` is the star count**, 1–3. It is not a rarity tier.
- - **White skills are grouped by WHEN THEY FIRE, and the game supplies the grouping.**
  `skill_data.skill_category` is the field the pre-race screen groups by: 0 passive,
  1 early-race, 2 mid-race, 3 late-race, 4 anytime, 5 unique. Verified against that
  screen and against named examples — Summer Runner and Restraint, which fire at the
  start with no wit check, are category 0. Do NOT parse `condition_1` for `phase==N`
  to derive this: that was tried, and it classifies only 119 of 235 white skills while
  leaving 116 in a bucket that answers nothing. Category 5 is the unique skills, which
  are the green spark and keep their own group; a race spark grants a skill hint too,
  so it has a category and must not be filed under it.

- **An aptitude belongs to the COSTUME, not the character.** `card_rarity_data.proper_*`
  is keyed by `card_id`, values 1-8 for G through S, and Haru Urara's two cards already
  differ: `[Bestest Prize ♪]` is Mile B and `[New Year ♪ New Urara!]` is Mile A. So
  anything reading an aptitude must use the trainee's actual card and must return nothing
  when no card was named. `traineePortrait` falls back to a character's base card on
  purpose -- any face of the right character beats none -- and copying that fallback here
  would print another costume's grades with total confidence.
- **A pink's real question is a letter, not a percentage.** The career-start grant raises
  an aptitude by one step at 1 lineage star, two at 4, three at 7 and four at 10,
  deterministically, and **can never reach S**. S needs one of the two April inspirations,
  which is what a pink's percentage is about.

**Spark names are `text_data` category 147, keyed by `factor_id`** — not by
  `factor_group_id`. The 1/2/3-star variants of one spark are three `factor_id`s sharing a
  `factor_group_id`, and all three carry the same name (0 of 392 groups disagree). Summarise
  per group; look names up per factor.
- **`factor_info_array[].level` is always 0** across all 1,554 ancestor slots in the
  builder's roster. The star count comes from `succession_factor.rarity`, not from there.
- **A costume is not a skin.** Cards of one `chara_id` have different unique
  skills, so they have different green sparks. Anything identifying an ancestor
  visually must key on `card_id`. Only the trainee falls back to a character's
  base card, because the request carries no trainee card — and the trainee shows
  no sparks, so no number depends on it.
- **`group_id` looks like a matching key and is not.** `single_mode_wins_saddle` has 7
  `group_id`s holding more than one G1 row — the same race at a different racecourse (not a
  different year: Arima Kinen runs twice per career and has one id, while Classic-only
  Satsuki Sho has two). Those are different wins. Deduplicating within one ancestor's wins is
  also a no-op — no ancestor holds two ids from one group. `group_id` is useful for grouping
  in a UI and for nothing in the affinity math.
- **`win_saddle_type`** is `0` for epithets requiring a set of G1 wins (Triple Crown and
  friends), `3` for a single G1, `2` for G2, `1` for G3. Race grade `100/200/300` maps to
  G1/G2/G3.
- **Artwork is static, not an API route.** Portraits and the rank atlas are files in
  `packages/web/public/`, served by the CDN. The API used to serve them from a
  possibly-absent directory, which needed a path-traversal guard on a user-supplied
  card id, a descriptor opened before any header was written, and a `no-store` on
  misses so a 404 could not outlive the next `fetch:portraits`. Static files need
  none of that: a missing file is a CDN 404, and `Portrait.tsx` already renders
  initials for it.

## Design docs

`docs/designs/` records how this project arrived at its direction, including the verified
domain model, the two golden fixtures with expected values, and the open questions.
Read `planner-that-shows-its-work.md` before implementing anything.

## Credits

Affinity mechanics adapted from community research, in particular Crazyfellow's parenting
and gene guide. Base inspiration rates from
[@BourBon_Polaris](https://x.com/BourBon_Polaris/status/1952727338547814695).

**[xancia/UmaExtractor](https://github.com/xancia/UmaExtractor)** produces the `data.json`
this tool reads. Without it there is no input and no product.

**[ayaliz/hakuraku](https://github.com/ayaliz/hakuraku)** (MIT), and its ancestor
[SSHZ-ORG/hakuraku](https://github.com/SSHZ-ORG/hakuraku), are the reference implementation
of the affinity engine and the correctness oracle this project tests against. Any ported
code ships their `LICENSE` and copyright notice.
