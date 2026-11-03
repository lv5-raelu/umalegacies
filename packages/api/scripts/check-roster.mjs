/**
 * Local correctness harness over YOUR roster. Needs BOTH user files, so it
 * never runs in CI. CI runs the same oracle comparison over a committed public
 * corpus instead (src/affinity/oracle.test.ts), alongside the golden fixtures.
 *
 *   npm run check:roster --workspace @umalegacies/api
 *
 * Three checks over every lineage in data.json:
 *
 *   1. ORACLE. Compares all six of this project's Individual Affinities --
 *      both parents and all four grandparents -- against a transcription of
 *      hakuraku's own affinity functions (src/affinity/hakuraku-oracle.ts).
 *      hakuraku is an independent implementation whose displayed numbers the
 *      builder verified against the running game. The same comparison runs in
 *      CI over a public uma.moe corpus (src/affinity/oracle.test.ts); this is
 *      that check over YOUR roster, which only your machine has.
 *
 *   2. IDENTITY. sum(individualAffinity) === 2*pairTotal - base(T,10) - base(T,20).
 *      An accounting TAUTOLOGY, not a correctness test: both sides derive from
 *      the same twelve link values. It catches wiring, never a wrong rule.
 *
 *   3. INVARIANT. Every node's value equals the sum of its children.
 *
 * The hakuraku transcription, its MIT notice and its two deliberate
 * differences live in src/affinity/hakuraku-oracle.ts, shared with the CI test,
 * so the two cannot drift apart.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The engine lives in @umalegacies/core since PR #22; these used to point at
// `../dist/affinity/engine.js` and `../dist/master/master-data.js` and silently
// rotted there, because this script needs both user files and so never runs in
// CI. `scripts-resolve.test.ts` now fails if either specifier stops resolving.
import { explain, MasterData } from '@umalegacies/core';
// Still the API's, because reading the SQL extract is a node:sqlite job and
// nothing in core may name a Node API.
import { readTables } from '../dist/master/master-extract.js';
import { HakurakuOracle } from '../dist/affinity/hakuraku-oracle.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const masterPath = resolve(repoRoot, 'master.mdb');
const dataPath = resolve(repoRoot, 'data.json');

for (const p of [masterPath, dataPath, resolve(here, '../dist/master/master-extract.js')]) {
  if (!existsSync(p)) {
    console.error(`missing ${p}`);
    if (p.endsWith('.js')) console.error('run: npm run build --workspace @umalegacies/api');
    process.exit(1);
  }
}

const db = new DatabaseSync(masterPath, { readOnly: true });
// `MasterData` takes plain rows rather than a database handle since T14, so that
// the same class can run in the browser where node:sqlite does not exist.
const master = new MasterData(readTables(db));
const roster = JSON.parse(readFileSync(dataPath, 'utf8'));

// ------------------------------------------------------------- the oracle
const all = (sql) => db.prepare(sql).all();
const oracle = new HakurakuOracle({
  succession_relation: all('SELECT relation_type, relation_point FROM succession_relation'),
  succession_relation_member: all('SELECT relation_type, chara_id FROM succession_relation_member'),
  single_mode_wins_saddle: all('SELECT id, win_saddle_type FROM single_mode_wins_saddle'),
  card_data: all('SELECT id, chara_id FROM card_data'),
});

// ------------------------------------------------------------------- run
const GRANDPARENTS = [11, 12, 21, 22];
const SLOTS = [10, 11, 12, 20, 21, 22];

let checked = 0, skipped = 0;
const oracleMismatches = [];
const identityFailures = [];
const invariantFailures = [];

const sumViolations = (node, path = 'root') => {
  const out = [];
  if (node.children.length > 0) {
    const s = node.children.reduce((t, c) => t + c.value, 0);
    if (s !== node.value) out.push(`${path}: ${node.value} != ${s}`);
  }
  node.children.forEach((c, i) => out.push(...sumViolations(c, `${path}/${c.ruleId}[${i}]`)));
  return out;
};

for (const entry of roster) {
  const traineeCharaId = master.charaIdFor(entry.card_id);
  const slots = new Map(entry.succession_chara_array.map((a) => [a.position_id, a]));
  if (traineeCharaId === null || !slots.has(10) || !slots.has(20)) { skipped++; continue; }

  const ref = (p) => {
    const s = slots.get(p);
    return s ? { cardId: s.card_id, winSaddleIds: s.win_saddle_id_array ?? [] } : null;
  };
  const result = explain(
    {
      traineeCharaId,
      parents: [ref(10), ref(20)],
      grandparents: GRANDPARENTS.map(ref),
    },
    master,
    'local-check',
  );
  checked++;

  // 1. oracle, all six slots
  const want = oracle.individualAffinities(
    traineeCharaId,
    { ...ref(10), parents: [ref(11), ref(12)] },
    { ...ref(20), parents: [ref(21), ref(22)] },
  );
  for (const slot of SLOTS) {
    const got = result.individualAffinity[slot]?.value ?? 0;
    if (want[slot] !== got) {
      oracleMismatches.push(
        `lineage ${entry.trained_chara_id} slot ${slot}: ours ${got}, hakuraku ${want[slot]}`,
      );
    }
  }

  // 2. identity
  const sumIA = Object.values(result.individualAffinity).reduce((t, n) => t + n.value, 0);
  const traineeBase = result.pairTotal.children.slice(0, 2).reduce((t, l) => t + l.value, 0);
  if (sumIA !== 2 * result.pairTotal.value - traineeBase) {
    identityFailures.push(`lineage ${entry.trained_chara_id}`);
  }

  // 3. invariant
  const v = sumViolations(result.pairTotal);
  if (v.length) invariantFailures.push(`lineage ${entry.trained_chara_id}: ${v[0]}`);
}

const report = (label, failures) => {
  if (failures.length === 0) { console.log(`  PASS  ${label}`); return 0; }
  console.log(`  FAIL  ${label}: ${failures.length}`);
  for (const f of failures.slice(0, 5)) console.log(`          ${f}`);
  if (failures.length > 5) console.log(`          ... and ${failures.length - 5} more`);
  return 1;
};

console.log(`\n${checked} lineages checked, ${skipped} skipped\n`);
let bad = 0;
bad += report(`oracle: all six affinities match hakuraku (${checked * 6} comparisons)`, oracleMismatches);
bad += report('identity: sum(IA) === 2*pairTotal - trainee base terms', identityFailures);
bad += report('invariant: every node value === sum of its children', invariantFailures);
console.log();
process.exit(bad === 0 ? 0 : 1);
