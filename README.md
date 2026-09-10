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
  api/    NestJS. Reads master.mdb, resolves IDs to names, computes affinity.
  web/    React + Vite + TypeScript. All UI.
```

**Why a backend at all:** because it is the version worth writing, not because a static
build is impossible. A slim extract of `master.mdb` would fit in a browser — other tools in
this space ship one at around 80 KB — so this is a preference, and it is recorded as one in
`docs/designs/`. The API owns the database and the web app asks questions of it.

**Data flow:** you export your trained characters as `data.json` and upload it. The API
resolves the raw IDs into names, skills, sparks and race wins. The web app caches the
resolved roster locally and never re-uploads it.

### Domain model

Two inputs, both user-provided and both gitignored:

- **`master.mdb`** — the game's master database. Character names, cards, skills,
  succession factors, succession relations, race definitions, win saddles.
- **`data.json`** — your trained-character export. Each entry carries its own sparks
  plus its two parents' sparks and race wins, so one veteran describes a three-generation
  subtree.

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

Base rates by star level (1★/2★/3★): blue 70/80/90%, pink 1/3/5%, green 5/10/15%,
race 1/2/3%, other whites 3/6/9%.

## Getting started

Requires Node 20.19+. Nothing else: the master data the API needs is committed.
(`better-sqlite3` allows 20.x, but Vite 7 requires `^20.19.0 || >=22.12.0`,
and that is the higher floor.)

```bash
npm install
npm run dev:api     # http://localhost:3000
npm run dev:web     # http://localhost:5173
```

Open the web app and upload your `data.json`.

### The two data files

**`master.mdb` is not in the repository, and is not needed to run the app.**
`packages/api/data/master-extract.sql` is, and the API serves from it by default.
The extract holds 6 of `master.mdb`'s 416 tables and 291 of `text_data`'s 54,234
rows: 315 KB of SQL text against a 16 MB binary, which git stores in ~31 KB.

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

## Gotchas

- **The API's CORS allowlist is explicit.** If Vite falls back to a port that is not on it,
  every request fails with a bare `Failed to fetch` that looks like the API is down. Check
  the port before debugging anything else.
- **`succession_factor.rarity` is the star count**, 1–3. It is not a rarity tier.
- **`group_id` looks like a matching key and is not.** `single_mode_wins_saddle` has 7
  `group_id`s holding more than one G1 row — the same race at a different racecourse (not a
  different year: Arima Kinen runs twice per career and has one id, while Classic-only
  Satsuki Sho has two). Those are different wins. Deduplicating within one ancestor's wins is
  also a no-op — no ancestor holds two ids from one group. `group_id` is useful for grouping
  in a UI and for nothing in the affinity math.
- **`win_saddle_type`** is `0` for epithets requiring a set of G1 wins (Triple Crown and
  friends), `3` for a single G1, `2` for G2, `1` for G3. Race grade `100/200/300` maps to
  G1/G2/G3.

## Design docs

`docs/designs/` records how this project arrived at its direction, including the verified
domain model, the two golden fixtures with expected values, and the open questions.
Read `planner-that-shows-its-work.md` before implementing anything.

## Credits

Affinity mechanics adapted from community research, in particular Crazyfellow's parenting
and gene guide. Base inspiration rates from
[@BourBon_Polaris](https://x.com/BourBon_Polaris/status/1952727338547814695).

**[ayaliz/hakuraku](https://github.com/ayaliz/hakuraku)** (MIT), and its ancestor
[SSHZ-ORG/hakuraku](https://github.com/SSHZ-ORG/hakuraku), are the reference implementation
of the affinity engine and the correctness oracle this project tests against. Any ported
code ships their `LICENSE` and copyright notice.
