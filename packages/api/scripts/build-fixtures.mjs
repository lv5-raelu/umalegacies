/**
 * Regenerates packages/api/fixtures/ from the builder's own master.mdb and
 * data.json. Needs both user files, so it runs locally and never in CI; its
 * OUTPUT is committed and that is what CI reads.
 *
 *   node scripts/build-fixtures.mjs
 *
 * What it writes:
 *   5531.json          Gold Ship trainee, the plain path
 *   5774.json          Oguri Cap trainee, whose grandparents at 12 and 22 ARE
 *                      the trainee: the self-link rule's signature
 *   synthetic-*.json   cases no lineage in the roster reaches
 *
 * Expected values in the golden fixtures are NOT computed by this project's
 * engine. They were read off hakuraku and breeding-optimizer and confirmed
 * against the game's own rank icon. Regenerating must never overwrite them.
 */
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../fixtures');

const masterPath = resolve(repoRoot, 'master.mdb');
const dataPath = resolve(repoRoot, 'data.json');
for (const p of [masterPath, dataPath]) {
  if (!existsSync(p)) {
    console.error(`missing ${p}. This script needs both user files; CI reads the committed output instead.`);
    process.exit(1);
  }
}

const db = new Database(masterPath, { readonly: true, fileMustExist: true });
const roster = JSON.parse(readFileSync(dataPath, 'utf8'));
const byTrainedId = new Map(roster.map((e) => [e.trained_chara_id, e]));
const charaIdByCard = new Map(
  db.prepare('SELECT id, chara_id FROM card_data').all().map((r) => [r.id, r.chara_id]),
);

/** Ancestors carry personal data. Take the two public game fields and nothing else. */
function ancestorRef(slot) {
  return { cardId: slot.card_id, winSaddleIds: [...slot.win_saddle_id_array] };
}

function lineageOf(trainedCharaId) {
  const entry = byTrainedId.get(trainedCharaId);
  if (!entry) throw new Error(`no roster entry ${trainedCharaId}`);
  const slots = new Map(entry.succession_chara_array.map((a) => [a.position_id, a]));
  const need = (p) => {
    const slot = slots.get(p);
    if (!slot) throw new Error(`lineage ${trainedCharaId} has no slot ${p}`);
    return ancestorRef(slot);
  };
  return {
    traineeCharaId: charaIdByCard.get(entry.card_id),
    parents: [need(10), need(20)],
    grandparents: [need(11), need(12), need(21), need(22)],
  };
}

// ---------------------------------------------------------------- fixtures

const f5531 = {
  name: '5531',
  description:
    'Gold Ship trainee. The plain path: no suppressed terms, no absent ' +
    'ancestors. Every base and bonus node is non-zero.',
  provenance:
    "Lineage from the builder's own roster (trained_chara_id 5531). Expected " +
    'values read off hakuraku and breeding-optimizer, 2026-09-10.',
  request: lineageOf(5531),
  expected: {
    pairTotal: 447,
    baseTotal: 135,
    bonusTotal: 312,
    relationRank: 3,
    individualAffinity: { 10: 254, 20: 274, 11: 78, 12: 76, 21: 78, 22: 80 },
  },
};

const f5774 = {
  name: '5774',
  description:
    'Oguri Cap trainee over the SAME six ancestors as 5531. The grandparents ' +
    'in slots 12 and 22 are Oguri Cap, i.e. the trainee, so their base terms ' +
    'are suppressed and their bonus terms survive. That asymmetry is the ' +
    'self-link rule and this is the only fixture that catches it.',
  provenance:
    "Lineage from the builder's own roster (trained_chara_id 5774). Expected " +
    'values read off hakuraku and breeding-optimizer, 2026-09-10. Scoring the ' +
    'self-link as an ordinary three-way gives 443; zeroing the whole link ' +
    'instead of only its base gives less still.',
  request: lineageOf(5774),
  expected: {
    pairTotal: 410,
    baseTotal: 98,
    bonusTotal: 312,
    relationRank: 3,
    individualAffinity: { 10: 243, 20: 248, 11: 78, 12: 60, 21: 78, 22: 63 },
    selfLinkSlots: [12, 22],
  },
};

// Takarazuka Kinen is id 14 at Hanshin and id 147 at Kyoto, one group_id (24).
// Those are DIFFERENT wins. An engine that normalises to group_id scores this
// pair as one shared G1 (+3); the correct answer is 0. No roster lineage
// reaches this case, so it is synthetic.
// win_saddle_type 3 is a single G1. Type 0 is an epithet awarded for a SET of
// G1 wins (Triple Crown and friends) and is not a race, so it feeds no bonus.
const ARIMA_KINEN = 10;
const TRIPLE_CROWN_EPITHET = 1;
const TAKARAZUKA_HANSHIN = 14;
const TAKARAZUKA_KYOTO = 147;
const f_group = {
  name: 'synthetic-group-id',
  description:
    'Two parents whose only G1 wins are Takarazuka Kinen at different ' +
    'racecourses (ids 14 and 147, group_id 24). Raw-id matching scores 0 ' +
    'shared. group_id normalisation scores 1 shared, worth +3. Regression ' +
    'guard for the rule this project got wrong three times.',
  provenance: 'Synthetic. Verified 2026-09-10 against breeding-optimizer.',
  request: {
    traineeCharaId: 1007,
    parents: [
      { cardId: 101401, winSaddleIds: [TAKARAZUKA_HANSHIN] },
      { cardId: 103401, winSaddleIds: [TAKARAZUKA_KYOTO] },
    ],
    grandparents: [null, null, null, null],
  },
  expected: {
    sharedG1BetweenParents: 0,
    bonusTotal: 0,
    forbiddenSaddleIds: [TAKARAZUKA_HANSHIN, TAKARAZUKA_KYOTO],
  },
};

const f_absent = {
  name: 'synthetic-absent-ancestor',
  description:
    'A lineage with every grandparent slot empty. Each absent slot kills a ' +
    'base AND a bonus term, so it contributes two zero nodes and the sum ' +
    'invariant still holds. individualAffinity still emits keys 11/12/21/22 ' +
    'so box browse can render a uniform six-slot tree.',
  provenance:
    'Synthetic. All 259 lineages in the builder\'s roster are six-member ' +
    'complete, so this case has no natural test.',
  request: {
    traineeCharaId: 1007,
    parents: [
      { cardId: 101401, winSaddleIds: [ARIMA_KINEN, 11, 12] },
      { cardId: 103401, winSaddleIds: [ARIMA_KINEN, 11, 13] },
    ],
    grandparents: [null, null, null, null],
  },
  expected: { absentSlots: [11, 12, 21, 22] },
};

const f_unresolved = {
  name: 'synthetic-unresolved',
  description:
    'An ancestor whose card_id is not in card_data, and a win saddle id ' +
    'master.mdb has never heard of. Both must surface as resolution.ok === ' +
    'false rather than as a bare 0: this product\'s claim is that a number ' +
    'opens, and an unexplained 0 opening onto an empty drawer inverts it.',
  provenance: 'Synthetic. CEO review Issue 1.',
  request: {
    traineeCharaId: 1007,
    parents: [
      { cardId: 999999, winSaddleIds: [ARIMA_KINEN, TRIPLE_CROWN_EPITHET, 888888] },
      { cardId: 103401, winSaddleIds: [ARIMA_KINEN, TRIPLE_CROWN_EPITHET, 888888] },
    ],
    grandparents: [null, null, null, null],
  },
  expected: {
    unknownCardId: 999999,
    unknownSaddleId: 888888,
    // Both parents also share saddle 1, Classic Triple Crown. That is an
    // EPITHET awarded for a set of G1 wins (win_saddle_type 0), not a race,
    // and it must not be worth +3 on its own.
    sharedEpithetId: TRIPLE_CROWN_EPITHET,
    sharedKnownG1: [ARIMA_KINEN],
    expectedBonusBetweenParents: 3,
  },
};

const fixtures = [f5531, f5774, f_group, f_absent, f_unresolved];

// Fixtures are derived from a personal save. Assert what leaves this script
// rather than trust it: an ancestor may carry the two public game fields and
// nothing else. data.json's slots also hold owner_viewer_id (another player's
// 12-digit trainer id), rank, rarity, talent_level and factor_info_array, and
// none of those may reach a committed file.
const ALLOWED_ANCESTOR_KEYS = ['cardId', 'winSaddleIds'];
for (const f of fixtures) {
  for (const a of [...f.request.parents, ...f.request.grandparents]) {
    if (!a) continue;
    const keys = Object.keys(a).sort();
    if (keys.join() !== ALLOWED_ANCESTOR_KEYS.join()) {
      throw new Error(`fixture ${f.name}: ancestor has keys [${keys}], expected [${ALLOWED_ANCESTOR_KEYS}]`);
    }
    if (!Number.isInteger(a.cardId) || !a.winSaddleIds.every(Number.isInteger)) {
      throw new Error(`fixture ${f.name}: ancestor fields must be integers`);
    }
  }
  // The request is the only part built from the save. Nothing personal may
  // appear anywhere in it, under any key.
  const leak = /owner_viewer_id|nickname|viewer_id/i;
  if (leak.test(JSON.stringify(f.request))) {
    throw new Error(`fixture ${f.name}: request carries a personal field`);
  }
}

console.log(`wrote ${fixtures.length} fixtures to ${outDir}`);
