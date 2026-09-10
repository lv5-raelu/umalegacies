/**
 * Local-only correctness harness. Needs BOTH user files, so it never runs in
 * CI; the committed golden fixtures are what CI checks.
 *
 *   npm run check:roster --workspace @umalegacies/api
 *
 * Three checks over every lineage in data.json:
 *
 *   1. ORACLE. Compares this project's per-grandparent Individual Affinity
 *      against a transcription of hakuraku's own affinity functions. This is
 *      the real correctness test: hakuraku is an independent implementation
 *      whose displayed numbers the builder verified against the running game.
 *
 *   2. IDENTITY. sum(individualAffinity) === 2*pairTotal - base(T,10) - base(T,20).
 *      An accounting TAUTOLOGY, not a correctness test: both sides derive from
 *      the same twelve link values. It catches wiring, never a wrong rule.
 *
 *   3. INVARIANT. Every node's value equals the sum of its children.
 *
 * ---------------------------------------------------------------------------
 * The oracle below is transcribed from ayaliz/hakuraku's
 * src/data/VeteransHelper.ts (calculateGrandparentAffinity,
 * sumSharedRelationPoints, calculateSharedG1RaceAffinity).
 *
 *   MIT License. Copyright (c) 2021 SSHZ.ORG
 *   Full text: NOTICE.md at the repository root.
 *
 * Transcribed rather than imported because hakuraku is a React application
 * whose data layer loads a protobuf UMDatabase, not a library. Two deliberate
 * differences, both documented in docs/designs/:
 *   - card_id -> chara_id joins card_data here; hakuraku uses card_id/100,
 *     which is wrong for 9100101 and 9101101.
 *   - the G1 saddle set is win_saddle_type = 3 here; hakuraku derives it as
 *     "exactly one race instance, and that race has grade 100". Verified
 *     2026-09-10 to select the identical 47 saddles.
 * ---------------------------------------------------------------------------
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explain } from '../dist/affinity/engine.js';
import { MasterData } from '../dist/master/master-data.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const masterPath = resolve(repoRoot, 'master.mdb');
const dataPath = resolve(repoRoot, 'data.json');

for (const p of [masterPath, dataPath, resolve(here, '../dist/affinity/engine.js')]) {
  if (!existsSync(p)) {
    console.error(`missing ${p}`);
    if (p.endsWith('engine.js')) console.error('run: npm run build --workspace @umalegacies/api');
    process.exit(1);
  }
}

const db = new Database(masterPath, { readonly: true, fileMustExist: true });
const master = new MasterData(db);
const roster = JSON.parse(readFileSync(dataPath, 'utf8'));

// ------------------------------------------------- the oracle (see notice above)
const relationPoints = new Map(
  db.prepare('SELECT relation_type, relation_point FROM succession_relation').all()
    .map((r) => [r.relation_type, r.relation_point]),
);
const charaRelationTypes = new Map();
for (const r of db.prepare('SELECT relation_type, chara_id FROM succession_relation_member').all()) {
  if (!charaRelationTypes.has(r.chara_id)) charaRelationTypes.set(r.chara_id, new Set());
  charaRelationTypes.get(r.chara_id).add(r.relation_type);
}
const g1Saddles = new Set(
  db.prepare('SELECT id FROM single_mode_wins_saddle WHERE win_saddle_type = 3').all().map((r) => r.id),
);
const G1_RACE_AFFINITY_VALUE = 3;

const sumSharedRelationPoints = (setA, setB, setC) => {
  let total = 0;
  for (const rt of setA) {
    if (setB.has(rt) && (setC === undefined || setC.has(rt))) {
      total += relationPoints.get(rt) ?? 0;
    }
  }
  return total;
};

const sharedG1RaceAffinity = (winsA, winsB) => {
  const b = new Set(winsB ?? []);
  let shared = 0;
  for (const id of new Set(winsA ?? [])) {
    if (g1Saddles.has(id) && b.has(id)) shared++;
  }
  return shared * G1_RACE_AFFINITY_VALUE;
};

/** hakuraku's calculateGrandparentAffinity, transcribed. */
const oracleGrandparentAffinity = (gp, parent, targetCharaId) => {
  if (!gp) return 0;
  const gpCharaId = master.charaIdFor(gp.card_id);
  const parentCharaId = master.charaIdFor(parent.card_id);
  const targetRelations = charaRelationTypes.get(targetCharaId) ?? new Set();
  const parentRelations = charaRelationTypes.get(parentCharaId) ?? new Set();
  // The self-link: an empty relation set when the grandparent IS the trainee,
  // which zeroes the base term and leaves the race bonus untouched.
  const gpRelations =
    gpCharaId && gpCharaId !== targetCharaId
      ? (charaRelationTypes.get(gpCharaId) ?? new Set())
      : new Set();
  const treeBase = sumSharedRelationPoints(targetRelations, parentRelations, gpRelations);
  const raceBonus = sharedG1RaceAffinity(parent.win_saddle_id_array, gp.win_saddle_id_array);
  return treeBase + raceBonus;
};

// ------------------------------------------------------------------- run
const GRANDPARENTS = [11, 12, 21, 22];
const PARENT_OF = { 11: 10, 12: 10, 21: 20, 22: 20 };

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

  // 1. oracle
  for (const gp of GRANDPARENTS) {
    const slot = slots.get(gp);
    if (!slot) continue;
    const want = oracleGrandparentAffinity(slot, slots.get(PARENT_OF[gp]), traineeCharaId);
    const got = result.individualAffinity[gp].value;
    if (want !== got) {
      oracleMismatches.push(
        `lineage ${entry.trained_chara_id} slot ${gp}: ours ${got}, hakuraku ${want}`,
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
bad += report(`oracle: per-grandparent affinity matches hakuraku (${checked * 4} comparisons)`, oracleMismatches);
bad += report('identity: sum(IA) === 2*pairTotal - trainee base terms', identityFailures);
bad += report('invariant: every node value === sum of its children', invariantFailures);
console.log();
process.exit(bad === 0 ? 0 : 1);
