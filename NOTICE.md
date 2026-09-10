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
