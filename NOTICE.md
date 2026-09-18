# Third-party notices

## ayaliz/hakuraku

`packages/api/scripts/check-roster.mjs` contains a transcription of the affinity
functions in `src/data/VeteransHelper.ts` from
[ayaliz/hakuraku](https://github.com/ayaliz/hakuraku) — specifically
`calculateGrandparentAffinity`, `sumSharedRelationPoints` and
`calculateSharedG1RaceAffinity`. It is used as a correctness oracle: this
project's engine is checked against it across the whole roster.

hakuraku descends from [SSHZ-ORG/hakuraku](https://github.com/SSHZ-ORG/hakuraku).

```
MIT License

Copyright (c) 2021 SSHZ.ORG

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Where this project deliberately differs

Both differences are documented in `docs/designs/planner-that-shows-its-work.md`.

- **`card_id` -> `chara_id`.** hakuraku uses `Math.floor(card_id / 100)` in
  several functions. That is wrong for `9100101` (-> `1001`) and `9101101`
  (-> `1011`). This project joins `card_data` through a single `charaIdFor()`.
- **The G1 saddle set.** hakuraku derives it as "exactly one race instance, and
  that race has grade 100". This project uses `win_saddle_type = 3`. Verified
  2026-09-10 that the two derivations select the identical 47 saddles.

## daftuyda.moe (UmaTools)

`packages/web/src/roster/rank-ladder.ts` is a transcription of the career rank
ladder published at [daftuyda.moe/rank-breakdown](https://daftuyda.moe/rank-breakdown):
298 tiers from G to LS24, each with its score threshold and the sprite rectangle
of its badge. The ladder is not in `master.mdb` -- `single_mode_rank` carries the
score bands and no names for them -- so this is the one piece of game vocabulary
in the project that is transcribed rather than extracted.

Cross-checked against the builder's own `master.mdb`: 92 of its 98 band minimums
appear in the ladder exactly. The six that do not are all at or above 66,000,
where the extract predates the game growing its ladder from 98 tiers to 298.
`packages/web/src/roster/rank-ladder.test.ts` pins that agreement.

The badge artwork itself (`Rank_tex.webp`) is fetched by
`packages/api/scripts/fetch-rank-icons.mjs` into
`packages/web/public/rank-icons/` and **is committed**. It is Cygames' artwork;
daftuyda.moe rehosts it and cannot grant redistribution rights it does not hold.

Earlier versions of this file said the cache was gitignored so the repository
would not redistribute it. That position was reversed deliberately on
2026-09-18, by the builder, so that a deployment built from a clone is complete:
a gitignored cache means every automated build ships a site with no artwork and
no signal that anything is missing. This project remains an unofficial,
non-commercial companion tool with no claim to the artwork it displays, and the
MIT licence in `package.json` covers this project's own code, not Cygames'
assets.

## gametora

`packages/api/scripts/fetch-portraits.mjs` fills
`packages/web/public/portraits/` from [gametora](https://gametora.com), and
those files are committed. Same reasoning as above, and the same reversal:
Cygames' character art, rehosted by a site that cannot grant redistribution
rights, displayed here by an unofficial non-commercial tool that claims no
rights to it.

## Umamusume: Pretty Derby

`master.mdb` and `data.json` are the game's own data files, supplied by the
person running this tool from their own installation. Neither is committed.
Umamusume: Pretty Derby is Cygames' work; this project is an unofficial,
non-commercial companion tool and is not affiliated with or endorsed by Cygames.
