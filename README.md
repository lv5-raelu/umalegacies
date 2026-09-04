# Uma Legacies

A companion tool for **Umamusume: Pretty Derby** that reads your own trained-character
roster and helps you plan the next career run.

The game gives you almost no help deciding which two veterans to inherit from. Affinity
is hidden behind a ◎/〇/△ icon, and the odds that any given spark actually fires during
inspiration are never shown at all. This tool computes both from the game's own data.

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

**Why a backend at all:** the game's master database is a 16 MB SQLite file. Shipping it
to the browser is not viable, so the API owns it and the web app asks questions of it.

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
  members. Deduplicate on the win saddle's `group_id` — the master data ships several
  rows for the same race, and counting them separately inflates the result.
- **Individual Affinity** is the sum of the links feeding one member: four links for a
  parent, one for a grandparent. This is the number that drives spark rates.

A spark activates at `base rate × (1 + Individual Affinity / 100)`, capped at 100%.
Inspiration fires twice per career run, so the odds of at least one activation are
`1 - (1 - p)²`.

Base rates by star level (1★/2★/3★): blue 70/80/90%, pink 1/3/5%, green 5/10/15%,
race 1/2/3%, other whites 3/6/9%.

## Getting started

Requires Node 20+ and both data files placed in the repository root.

```bash
npm install
npm run dev:api     # http://localhost:3000
npm run dev:web     # http://localhost:5173
```

Open the web app and upload your `data.json`.

### Providing the data files

Neither file is in the repository. `master.mdb` is extracted from your game install.
`data.json` is your own save export. Both are personal or large enough that committing
them would be wrong, so `.gitignore` covers them explicitly.

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
- **`win_saddle_type`** is `0` for epithets requiring a set of G1 wins (Triple Crown and
  friends), `3` for a single G1, `2` for G2, `1` for G3. Race grade `100/200/300` maps to
  G1/G2/G3.

## Credits

Affinity mechanics adapted from community research, in particular Crazyfellow's parenting
and gene guide. Base inspiration rates from
[@BourBon_Polaris](https://x.com/BourBon_Polaris/status/1952727338547814695).
