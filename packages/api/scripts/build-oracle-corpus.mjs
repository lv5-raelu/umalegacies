/**
 * Builds packages/api/fixtures/oracle-corpus.json: real three-generation
 * packages from uma.moe, for the hakuraku oracle test to pair into lineages.
 *
 *   npm run build:oracle-corpus --workspace @umalegacies/api
 *
 * Needs the uma.moe API key (see src/borrow/api-key.ts). Run it rarely: the
 * corpus does not go stale when the game patches, because the test scores it
 * against whatever game data is current. Re-run it when a patch adds characters
 * and you want them covered.
 *
 * WHY uma.moe AND NOT data.json. The oracle comparison is the strongest
 * correctness check this project has, and it used to run only on the builder's
 * machine because it read their save. These are other players' veterans,
 * listed publicly on uma.moe to be borrowed, so a corpus built from them can
 * be committed and run in CI.
 *
 * WHAT IS KEPT: card ids and race wins, for the veteran and its two parents.
 * Those are the only fields Individual Affinity reads. Everything that names
 * or describes a person -- account id, trainer name, follower count, view and
 * copy counts, timestamps, the record id -- is never read out of the response,
 * and neither are sparks, which affinity does not use. The same treatment as
 * src/borrow/fixture.ts.
 *
 * DIVERSITY OVER VOLUME. Six differently ordered queries are pooled, then a
 * greedy pass keeps the packages that add the most characters and G1 wins not
 * yet covered. A corpus of 120 near-identical top-affinity veterans would test
 * the same few relation sets over and over.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchBorrowable } from '../dist/borrow/client.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../fixtures/oracle-corpus.json');
const KEEP = 120;

/*
 * Six orderings of the same pool. The default sorts by uma.moe's affinity to a
 * trainee, so passing different trainees surfaces different veterans; the two
 * explicit sorts reach records the affinity order never puts first.
 */
const QUERIES = [
  { label: 'default order', params: {} },
  { label: 'affinity to Special Week', params: { player_chara_id: '1001' } },
  { label: 'affinity to Oguri Cap', params: { player_chara_id: '1006' } },
  { label: 'affinity to Haru Urara', params: { player_chara_id: '1052' } },
  { label: 'most white stars', params: { sort_by: 'white_stars_sum', sort_order: 'desc' } },
  { label: 'oldest updates', params: { sort_by: 'last_updated', sort_order: 'asc' } },
];

/** The two fields affinity reads. Nothing else leaves this function. */
const ancestor = (ref) => (ref ? { cardId: ref.cardId, winSaddleIds: [...ref.winSaddleIds].sort((a, b) => a - b) } : null);

const pool = new Map();
for (const { label, params } of QUERIES) {
  const result = await searchBorrowable({ params: new URLSearchParams(params), maxRecords: 200 });
  let added = 0;
  for (const pkg of result.packages) {
    const kept = { self: ancestor(pkg.self), parents: [ancestor(pkg.parents[0]), ancestor(pkg.parents[1])] };
    const key = JSON.stringify(kept);
    if (!pool.has(key)) {
      pool.set(key, kept);
      added++;
    }
  }
  console.log(`  ${label.padEnd(26)} ${result.packages.length} fetched, ${added} new`);
}

/*
 * Greedy coverage: repeatedly take the package that adds the most not-yet-seen
 * (character-ish card, G1-ish win) features. Cards and wins stand in for
 * relation sets and race overlaps, which is what affinity actually exercises.
 */
const features = (pkg) => {
  const f = new Set();
  for (const a of [pkg.self, ...pkg.parents]) {
    if (!a) continue;
    f.add(`card:${a.cardId}`);
    for (const w of a.winSaddleIds) f.add(`win:${w}`);
  }
  // Which character sits under which: the pairings relation sets depend on.
  const [p1, p2] = pkg.parents;
  if (p1) f.add(`pair:${pkg.self.cardId}/${p1.cardId}`);
  if (p2) f.add(`pair:${pkg.self.cardId}/${p2.cardId}`);
  return f;
};

const candidates = [...pool.values()];
const seen = new Set();
const chosen = [];
while (chosen.length < KEEP && candidates.length > 0) {
  let best = 0;
  let bestGain = -1;
  candidates.forEach((pkg, i) => {
    let gain = 0;
    for (const f of features(pkg)) if (!seen.has(f)) gain++;
    if (gain > bestGain) [best, bestGain] = [i, gain];
  });
  const [pkg] = candidates.splice(best, 1);
  for (const f of features(pkg)) seen.add(f);
  chosen.push(pkg);
}

const cards = new Set(chosen.flatMap((p) => [p.self, ...p.parents]).filter(Boolean).map((a) => a.cardId));
const corpus = {
  generatedBy: 'packages/api/scripts/build-oracle-corpus.mjs -- regenerate, do not edit by hand',
  source: 'uma.moe /api/v3/search, borrowable inheritance records',
  fetched: new Date().toISOString().slice(0, 10),
  kept: 'card ids and race wins only, for each veteran and its two parents',
  packages: chosen,
};
// One package per line: a re-run is then a diff of whole packages added and
// removed rather than a single changed line 60 KB long.
const { packages, ...header } = corpus;
const text =
  JSON.stringify(header, null, 2).replace(/\n}$/, ',\n  "packages": [\n') +
  packages.map((p) => `    ${JSON.stringify(p)}`).join(',\n') +
  '\n  ]\n}\n';
JSON.parse(text); // refuse to write anything that does not read back
writeFileSync(outPath, text);
console.log(
  `wrote ${outPath}\n  ${chosen.length} packages from a pool of ${pool.size}, ` +
    `${cards.size} distinct cards, ${seen.size} features covered`,
);
