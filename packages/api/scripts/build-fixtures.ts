/**
 * Regenerates packages/api/fixtures/ from the builder's own master.mdb and
 * data.json. Needs both user files, so it runs locally and never in CI; its
 * OUTPUT is committed and that is what CI reads.
 *
 *   node scripts/build-fixtures.mjs
 *
 * What it writes:
 *   verify-oguri.json  Oguri Cap trainee over a hand-picked pair, for
 *                      side-by-side checking against breeding-optimizer
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
import { lineageFromPair } from '../src/affinity/pair.js';
import type { AncestorRef, ExplainPairRequest, VeteranPackage } from '@umalegacies/types';

// TypeScript, run through ts-node, so it can import the SAME lineageFromPair the
// API serves rather than keeping a second copy of the slot mapping. It used to
// carry its own, which meant the golden fixtures and the endpoint could disagree
// about which grandparent sits under which parent and every test would still
// pass.
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
const roster: any[] = JSON.parse(readFileSync(dataPath, 'utf8'));
const byTrainedId = new Map<number, any>(roster.map((e: any) => [e.trained_chara_id, e]));
const charaIdByCard = new Map<number, number>(
  (db.prepare('SELECT id, chara_id FROM card_data').all() as any[]).map((r) => [
    r.id,
    r.chara_id,
  ]),
);

/**
 * Ancestors carry personal data. Take the three public game fields and nothing
 * else: card_id, the win list, and the spark list. All three are ids into
 * master.mdb that describe the character, not the player who trained them.
 * Deliberately NOT taken: owner_viewer_id (another player's 12-digit trainer
 * id), rank, rarity and talent_level.
 *
 * factor_info_array's sibling `level` field is 0 on all 1,554 ancestor slots in
 * the roster, so only the ids are carried.
 */
function ancestorRef(slot: any): AncestorRef {
  return {
    cardId: slot.card_id,
    factorIds: slot.factor_info_array.map((f: any) => f.factor_id),
    winSaddleIds: [...slot.win_saddle_id_array],
  };
}

function lineageOf(trainedCharaId: number) {
  const entry = byTrainedId.get(trainedCharaId);
  if (!entry) throw new Error(`no roster entry ${trainedCharaId}`);
  const slots = new Map<number, any>(entry.succession_chara_array.map((a: any) => [a.position_id, a]));
  const need = (p: number) => {
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

/** A top-level roster entry carries the same three public fields as a slot. */
function veteranRef(entry: any): AncestorRef {
  return {
    cardId: entry.card_id,
    factorIds: entry.factor_info_array.map((f: any) => f.factor_id),
    winSaddleIds: [...entry.win_saddle_id_array],
  };
}

/** The one veteran of this character with this rank_score. Fails loudly otherwise. */
function veteran(charaId: number, rankScore: number) {
  const hits = roster.filter(
    (e: any) => charaIdByCard.get(e.card_id) === charaId && e.rank_score === rankScore,
  );
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly 1 veteran of chara ${charaId} with rank_score ${rankScore}, ` +
        `found ${hits.length}`,
    );
  }
  return hits[0];
}

/**
 * The one veteran with this card, this score and these two parent cards.
 *
 * `veteran(chara, score)` is not a unique key: the roster holds two Gold Ships
 * at rank_score 16329 whose card ids also match, differing only in their own
 * parents. Selecting a fixture by an ambiguous key silently picks whichever came
 * first in the file, which is a fixture that changes meaning when the save is
 * re-exported. The package IS the identity, so select on it.
 *
 * Selects on public game fields only. `trained_chara_id` would be a shorter key
 * and is deliberately not used: it must not travel into a committed file.
 */
function veteranWithParents(cardId: number, rankScore: number, parentCardIds: [number, number]) {
  const key = (e: any) =>
    JSON.stringify(
      e.succession_chara_array
        .filter((s: any) => s.position_id === 10 || s.position_id === 20)
        .sort((a: any, b: any) => a.position_id - b.position_id)
        .map((s: any) => s.card_id),
    );
  const want = JSON.stringify(parentCardIds);
  const hits = roster.filter(
    (e: any) => e.card_id === cardId && e.rank_score === rankScore && key(e) === want,
  );
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly 1 veteran with card ${cardId}, rank_score ${rankScore} and ` +
        `parents ${want}, found ${hits.length}`,
    );
  }
  return hits[0];
}

/**
 * One roster entry as the indivisible three-uma package the user actually picks:
 * itself, plus its own slots 10 and 20, which become the grandparents beneath it.
 *
 * Composing the package into a lineage is NOT done here any more. That is
 * `lineageFromPair` in src/affinity/pair.ts, which is what the endpoint calls,
 * so the fixtures and the running server cannot disagree about slot order.
 */
function veteranPackage(entry: any): VeteranPackage {
  const own = (position: number): AncestorRef | null => {
    const slot = entry.succession_chara_array.find((s: any) => s.position_id === position);
    return slot ? ancestorRef(slot) : null;
  };
  return { self: veteranRef(entry), parents: [own(10), own(20)] };
}

const MEJIRO_DOBER = 1059;
const NARITA_BRIAN = 1016;
const OGURI_CAP = 1006;

/**
 * A fixture carries the PAIR as well as the composed lineage.
 *
 * The pair is what M3's screen actually sends, and it is built here straight
 * from the two roster entries, independently of `lineageFromPair`. The composed
 * `request` is then produced BY `lineageFromPair`. That asymmetry is the point:
 * a test that fed the composed request back through an inverse mapping would
 * cancel out any error in the mapping and pass regardless.
 */
function pairOf(traineeCharaId: number, a: any, b: any): ExplainPairRequest {
  return {
    traineeCharaId,
    veteranA: veteranPackage(a),
    veteranB: veteranPackage(b),
  };
}

const oguriPair = pairOf(
  OGURI_CAP,
  veteran(MEJIRO_DOBER, 18998),
  veteran(NARITA_BRIAN, 17666),
);

const fOguri = {
  name: 'verify-oguri',
  description:
    'Oguri Cap trainee; parents Mejiro Dober (rank_score 18998) and Narita ' +
    'Brian (17666), each bringing its own parents as the grandparents beneath ' +
    'it. Both pairs are Inari One and Gold Ship, so a per-slot discrepancy ' +
    'cannot hide behind a different name. No self-link: Oguri Cap appears ' +
    'nowhere among the six.',
  provenance:
    "Builder's own roster, chosen 2026-09-11 for side-by-side checking against " +
    'breeding-optimizer. Public game fields only.',
  pair: oguriPair,
  request: lineageFromPair(oguriPair),
  expected: {
    pairTotal: 352,
    baseTotal: 151,
    bonusTotal: 201,
    relationRank: 3,
    // 186 and 225 are the four-link parent figures. breeding-optimizer shows
    // 127 and 166 for the same lineage; both differences are exactly 59, the
    // parent-parent link (base 26 + bonus 33), which it omits. hakuraku
    // computes both and feeds the four-link figure into its spark odds, so
    // this is the right quantity here. Do not "fix" it to match.
    individualAffinity: { 10: 186, 20: 225, 11: 50, 12: 47, 21: 68, 22: 69 },
  },
};

const asymmetricPair = pairOf(
  OGURI_CAP,
  // Sakura Bakushin O out of Maruzensky x Taiki Shuttle.
  veteranWithParents(104101, 12976, [100402, 101001]),
  // Gold Ship out of Inari One x El Condor Pasa. Card and score alone match two
  // different veterans here; the parents are what tell them apart.
  veteranWithParents(100701, 16329, [103401, 101401]),
);

/**
 * The slot-mapping DISCRIMINATOR. verify-oguri is the control that pins the
 * numbers; this is the fixture that notices when they are pinned to the wrong
 * slots.
 *
 * verify-oguri deliberately puts the same two characters behind both parents,
 * which makes it strong against a wrong VALUE and weak against a wrong
 * PLACEMENT. This pair is the opposite: six distinct characters, and all six
 * individual-affinity figures distinct (46, 8, 17, 194, 80, 79), so moving any
 * ancestor to any other slot changes the response.
 *
 * Two specific corruptions it catches, both of which a lift-and-reuse refactor
 * produces and neither of which is otherwise visible:
 *   - swapping veteranA and veteranB leaves pairTotal UNCHANGED at 228, because
 *     the multiset of links is the same. Only the position-keyed individual
 *     affinities move, which is why this fixture asserts the whole IA map and
 *     not just the total.
 *   - interleaving the grandparents as [A1, B1, A2, B2] instead of
 *     [A1, A2, B1, B2] drops the total from 228 to 166, because a three-way
 *     term pairs each grandparent with the parent it actually sits under.
 *
 * PROVENANCE, AND ITS LIMIT: unlike verify-oguri these numbers were NOT read
 * off breeding-optimizer. They are this engine's own output, recorded to detect
 * CHANGE. They are a regression guard, not an oracle, and they must never be
 * cited as independent confirmation that the engine is right.
 */
const fAsymmetric = {
  name: 'pair-asymmetric',
  description:
    'Oguri Cap trainee over Sakura Bakushin O (rank_score 12976) and Gold Ship ' +
    '(16329). Six distinct characters and six distinct individual affinities, ' +
    'so every slot is distinguishable from every other. The discriminator for ' +
    'pair composition: swapping the two veterans leaves the total at 228 and ' +
    'moves the whole affinity map, and interleaving the grandparents drops the ' +
    'total to 166.',
  provenance:
    "Builder's own roster. Chosen 2026-09-16 by searching all 33,411 pairs for " +
    'one with six distinct characters, six distinct individual affinities and a ' +
    'total that moves under interleaving. Expected values are THIS ENGINE\'s ' +
    'output, not an external oracle: a regression guard for slot mapping. ' +
    'verify-oguri remains the only externally verified fixture.',
  pair: asymmetricPair,
  request: lineageFromPair(asymmetricPair),
  expected: {
    pairTotal: 228,
    baseTotal: 90,
    bonusTotal: 138,
    relationRank: 3,
    individualAffinity: { 10: 46, 20: 194, 11: 8, 12: 17, 21: 80, 22: 79 },
    /** [10, 20, 11, 12, 21, 22] -- who must be where. */
    slotCharaNames: [
      'Sakura Bakushin O',
      'Gold Ship',
      'Maruzensky',
      'Taiki Shuttle',
      'Inari One',
      'El Condor Pasa',
    ],
    /** Grandparents mis-ordered as [A1, B1, A2, B2]. Must NOT equal pairTotal. */
    interleavedPairTotal: 166,
  },
};

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

const fixtures = [fOguri, fAsymmetric, f5531, f5774, f_group, f_absent, f_unresolved];

// Fixtures are derived from a personal save. Assert what leaves this script
// rather than trust it: an ancestor may carry the three public game fields
// (cardId, factorIds, winSaddleIds) and nothing else. Only the factor IDS
// travel, never the sibling `level`. data.json's slots also hold
// owner_viewer_id (another player's 12-digit trainer id), rank, rarity and
// talent_level, and none of those may reach a committed file.
// An allowlist, not an exact shape: the synthetic fixtures carry no sparks
// because no spark rule is under test there. What matters is that nothing
// OUTSIDE this set can ever reach a committed file.
const ALLOWED_ANCESTOR_KEYS = new Set(['cardId', 'factorIds', 'winSaddleIds']);
const REQUIRED_ANCESTOR_KEYS = ['cardId', 'winSaddleIds'];

/**
 * Every ancestor a fixture commits, from BOTH the composed request and the pair.
 *
 * `pair` is save-derived too, and it is the shape M3 actually sends. Checking
 * only `request` would have left the new field unguarded while looking like the
 * guard still covered the file.
 */
function committedAncestors(f: (typeof fixtures)[number]): (AncestorRef | null)[] {
  const fromRequest = [...f.request.parents, ...f.request.grandparents];
  const pair = (f as { pair?: ExplainPairRequest }).pair;
  if (!pair) return fromRequest;
  return [
    ...fromRequest,
    pair.veteranA.self,
    ...pair.veteranA.parents,
    pair.veteranB.self,
    ...pair.veteranB.parents,
  ];
}

for (const f of fixtures) {
  for (const a of committedAncestors(f)) {
    if (!a) continue;
    const keys = Object.keys(a).sort();
    const extra = keys.filter((k) => !ALLOWED_ANCESTOR_KEYS.has(k));
    if (extra.length) {
      throw new Error(`fixture ${f.name}: ancestor carries disallowed keys [${extra}]`);
    }
    const missing = REQUIRED_ANCESTOR_KEYS.filter((k) => !keys.includes(k));
    if (missing.length) {
      throw new Error(`fixture ${f.name}: ancestor is missing [${missing}]`);
    }
    if (
      !Number.isInteger(a.cardId) ||
      !a.winSaddleIds.every((id) => Number.isInteger(id)) ||
      !(a.factorIds ?? []).every((id) => Number.isInteger(id))
    ) {
      throw new Error(`fixture ${f.name}: ancestor fields must be integers`);
    }
  }
  // Nothing personal may appear anywhere in what gets written, under any key.
  // `trained_chara_id` is used above to SELECT veterans and must not travel with
  // them; `owner_viewer_id` is another player's 12-digit trainer id and there
  // are 184 distinct ones in this save.
  const leak = /owner_viewer_id|nickname|viewer_id|trained_chara_id|register_time|create_time/i;
  const written = JSON.stringify({ request: f.request, pair: (f as { pair?: unknown }).pair });
  if (leak.test(written)) {
    throw new Error(`fixture ${f.name}: carries a personal field`);
  }
}

for (const f of fixtures) {
  writeFileSync(resolve(outDir, `${f.name}.json`), `${JSON.stringify(f, null, 2)}\n`);
}

console.log(`wrote ${fixtures.length} fixtures to ${outDir}`);
