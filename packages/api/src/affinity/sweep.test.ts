import { describe, expect, it } from 'vitest';
import type { RosterMemberInput, RosterVeteranInput, SparkCriterion } from '@umalegacies/types';
import { sweepPairs, type PairSearchResult } from '@umalegacies/core';
import { extractHash, extractMaster } from '../master/master-extract.js';
import { resolveRoster } from '../roster/roster.js';

/**
 * M7's sweep, over a real `MasterData` built from the committed SQL extract.
 *
 * IN `packages/api` RATHER THAN BESIDE THE CODE, for the same reason
 * `engine.test.ts` is: the sweep lives in `packages/core`, which may not name a
 * Node API, and a meaningful test of it needs game data that arrives through
 * `node:sqlite`. Core keeps the pure unit tests; the ones that need the extract
 * live here.
 *
 * The roster is synthetic and tiny. The point is the sweep's own decisions --
 * which pairs it refuses, which it prunes, what order it returns -- and those
 * are visible on six veterans in a way they are not on 259.
 */

const master = extractMaster();
const hash = extractHash();

const OGURI_STARLIGHT = 100601;
const OGURI_ASHEN = 100602; // Same CHARACTER as above, different card.
const SUZUKA = 100201;
const GOLD_SHIP = 100901;
const VODKA = 100401;
const DAIWA = 100501;

const SPEED = 1;
const STAMINA = 2;
const SPEED_3 = 103; // group 1, 3 stars
const STAMINA_3 = 203; // group 2, 3 stars
const STAMINA_1 = 201;
/** A real white: "Right-Handed circle", group 20001. Whites only rank by default. */
const RIGHT_HANDED = 20001;
const RIGHT_HANDED_3 = 2000103;

const member = (cardId: number, factorIds: number[] = []): RosterMemberInput => ({
  cardId,
  winSaddleIds: [],
  factorIds,
});

const veteran = (
  self: RosterMemberInput,
  parents: [RosterMemberInput | null, RosterMemberInput | null] = [null, null],
): RosterVeteranInput => ({ score: 10000, self, parents });

/** Every veteran carries 3 stars of Stamina unless a case says otherwise. */
const packages: RosterVeteranInput[] = [
  veteran(member(OGURI_STARLIGHT, [STAMINA_3]), [member(SUZUKA), member(VODKA)]),
  veteran(member(OGURI_ASHEN, [STAMINA_3]), [member(DAIWA), member(GOLD_SHIP)]),
  veteran(member(GOLD_SHIP, [STAMINA_3]), [member(VODKA), member(DAIWA)]),
  veteran(member(SUZUKA, [STAMINA_3]), [member(GOLD_SHIP), member(VODKA)]),
  veteran(member(VODKA, [STAMINA_1]), [member(SUZUKA), member(DAIWA)]),
  // The only carriers of the white, so most pairs carry none of it at all.
  veteran(member(DAIWA, [SPEED_3, RIGHT_HANDED_3]), [member(VODKA), member(GOLD_SHIP)]),
];

const { veterans, sparkOptions } = resolveRoster(packages, master);
const kindOf = (groupId: number) => sparkOptions.find((o) => o.groupId === groupId)?.kind;

const sweep = (criteria: SparkCriterion[], traineeCharaId = 1002 /* Silence Suzuka */) =>
  sweepPairs({ veterans, packages, traineeCharaId, criteria, kindOf, master, masterHash: hash });

const names = (r: PairSearchResult): string =>
  `${veterans[r.a]?.self.name}[${r.a}] x ${veterans[r.b]?.self.name}[${r.b}]`;

describe('what the sweep refuses before it scores anything', () => {
  it('never returns a pair the game would not allow', () => {
    const { results } = sweep([]);
    for (const r of results) {
      const a = veterans[r.a]!;
      const b = veterans[r.b]!;
      expect(a.self.charaId, names(r)).not.toBe(b.self.charaId);
      expect(a.self.charaId, names(r)).not.toBe(1002);
      expect(b.self.charaId, names(r)).not.toBe(1002);
    }
  });

  it('excludes BOTH cards of the trainee, not just the one being trained', () => {
    // Oguri Cap is in this roster twice, as two costumes. Training either one
    // must remove both, or the sweep offers a pair the game refuses.
    const { results } = sweep([], 1006 /* Oguri Cap */);
    const appearing = new Set(results.flatMap((r) => [r.a, r.b]));
    expect(appearing.has(0)).toBe(false);
    expect(appearing.has(1)).toBe(false);
  });

  it('counts the legal pairs it considered, not the combinations', () => {
    // 6 veterans give 15 combinations. Suzuka is the trainee, so its one card
    // is out (5 pairs), and the two Oguris cannot meet each other (1 more).
    const { legal } = sweep([]);
    expect(legal).toBe(15 - 5 - 1);
  });

  it('always reports a < b, so a pair appears once', () => {
    const { results } = sweep([]);
    expect(results.every((r) => r.a < r.b)).toBe(true);
    const seen = new Set(results.map((r) => `${r.a}:${r.b}`));
    expect(seen.size).toBe(results.length);
  });
});

describe('requirements prune, preferences do not', () => {
  const stamina = (minStars: number, mustHave?: boolean): SparkCriterion => ({
    groupId: STAMINA,
    minStars,
    scope: 'package',
    ...(mustHave === undefined ? {} : { mustHave }),
  });

  it('scores every legal pair when nothing can exclude', () => {
    const { legal, scored } = sweep([]);
    expect(scored).toBe(legal);
  });

  it('scores fewer pairs once a blue has to be met', () => {
    // Stamina is blue, so it is a requirement without being asked. Vodka
    // carries 1 star and Daiwa none, so pairs leaning on them fall away.
    const wide = sweep([stamina(1)]);
    const narrow = sweep([stamina(6)]);
    expect(narrow.scored).toBeLessThan(wide.scored);
    expect(narrow.legal).toBe(wide.legal);
  });

  it('leaves a white ranking without excluding, until it is promoted', () => {
    // THE LEVER T6 EXISTS FOR, end to end. The same criterion, one flag apart:
    // as a preference it scores every legal pair, as a requirement it prunes.
    const asked: SparkCriterion = { groupId: RIGHT_HANDED, minStars: 3, scope: 'package' };
    const ranking = sweep([asked]);
    const required = sweep([{ ...asked, mustHave: true }]);

    expect(ranking.scored).toBe(ranking.legal);
    expect(required.scored).toBeLessThan(ranking.scored);
    expect(required.scored).toBeGreaterThan(0);
    // Same legal space either way: the flag changes what is SCORED, never what
    // the game allows.
    expect(required.legal).toBe(ranking.legal);
  });

  it('returns nothing when a requirement cannot be met, rather than falling back', () => {
    // The design doc calls the empty result the main path, not an error state.
    const { results, legal } = sweep([stamina(18)]);
    expect(legal).toBeGreaterThan(0);
    expect(results).toEqual([]);
  });
});

describe('what it reports per pair', () => {
  it('returns one figure per criterion, in the order asked', () => {
    const criteria: SparkCriterion[] = [
      { groupId: STAMINA, minStars: 1, scope: 'package' },
      { groupId: SPEED, minStars: 1, scope: 'package' },
    ];
    const { results } = sweep(criteria);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.perSpark).toHaveLength(2);
  });

  it('reports null for a spark the pair does not carry at all', () => {
    // It has to be a WHITE to observe this. A blue with `minStars: 1` is a
    // requirement, so it prunes away every pair that would have shown a null --
    // the first cut of this test asked for Speed and could never fail.
    // A null, not a zero: "cannot happen" and "measured at zero" are different
    // facts, and `jointOdds` treats them the same only because both end the
    // product at zero.
    const { results } = sweep([{ groupId: RIGHT_HANDED, minStars: 1, scope: 'package' }]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.perSpark[0] === null)).toBe(true);
    expect(results.some((r) => r.perSpark[0] !== null)).toBe(true);
  });

  it('carries the same pair total the compare pane would show', () => {
    const { results } = sweep([]);
    for (const r of results) {
      expect(Number.isInteger(r.pairTotal)).toBe(true);
      expect(r.pairTotal).toBeGreaterThan(0);
      expect(r.relationRank).toBeGreaterThanOrEqual(1);
      expect(r.relationRank).toBeLessThanOrEqual(9);
    }
  });
});

describe('the order it returns them in', () => {
  const two: SparkCriterion[] = [
    { groupId: STAMINA, minStars: 1, scope: 'package' },
    { groupId: SPEED, minStars: 0 + 1, scope: 'package' },
  ];

  it('states a joint only when there are two requirements to combine', () => {
    expect(sweep([]).results.every((r) => r.joint === null)).toBe(true);
    expect(
      sweep([{ groupId: STAMINA, minStars: 1, scope: 'package' }]).results.every(
        (r) => r.joint === null,
      ),
    ).toBe(true);
    // With two, every scored pair has one -- zero included, which is a real
    // answer rather than a missing one.
    expect(sweep(two).results.every((r) => r.joint !== null)).toBe(true);
  });

  it('is sorted best first and never leaves two rows unordered', () => {
    const { results } = sweep(two);
    const key = (r: PairSearchResult) => r.joint ?? r.perSpark[0] ?? 0;
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1]!;
      const here = results[i]!;
      const ordered =
        key(prev) > key(here) ||
        (key(prev) === key(here) &&
          (prev.pairTotal > here.pairTotal ||
            (prev.pairTotal === here.pairTotal && (prev.a < here.a || (prev.a === here.a && prev.b < here.b)))));
      expect(ordered, `${names(prev)} then ${names(here)}`).toBe(true);
    }
  });

  it('falls back to pair total when there is nothing to rank by', () => {
    // Said out loud in the design doc: with no requirements the list is NOT
    // doing what the search is for, and this is the order it uses instead.
    const { results } = sweep([]);
    const totals = results.map((r) => r.pairTotal);
    expect([...totals].sort((x, y) => y - x)).toEqual(totals);
  });

  it('is reproducible: the same input twice gives the same order', () => {
    // Pagination re-runs the sweep, so an unstable comparator would reshuffle
    // rows that scored identically and the user would see a row twice.
    const first = sweep(two).results.map((r) => `${r.a}:${r.b}`);
    const second = sweep(two).results.map((r) => `${r.a}:${r.b}`);
    expect(second).toEqual(first);
  });
});

/**
 * PINNING A CHARACTER INTO A SLOT, which is a filter on COMPOSITION.
 *
 * Reported by a reader: wanting a particular uma as a parent meant inventing a
 * spark criterion she happens to carry, and that criterion then entered the
 * joint -- so every row's odds described a build nobody had asked about. These
 * pin the two things that makes true: the pair set narrows, and no figure moves.
 */
describe('pinning a character into a slot', () => {
  const GOLD_SHIP_CHARA = 1009;
  const VODKA_CHARA = 1004;

  const pinned = (pins: { requireParentChara?: number; requireGrandparentChara?: number }) =>
    sweepPairs({
      veterans,
      packages,
      traineeCharaId: 1002,
      criteria: [],
      kindOf,
      master,
      masterHash: hash,
      ...pins,
    });

  const asParent = (r: PairSearchResult, chara: number) =>
    veterans[r.a]?.self.charaId === chara || veterans[r.b]?.self.charaId === chara;

  const asGrandparent = (r: PairSearchResult, chara: number) =>
    [veterans[r.a], veterans[r.b]].some((v) =>
      v?.parents.some((member) => member?.charaId === chara),
    );

  it('keeps only pairs seating the character as a PARENT', () => {
    const { results, legal } = pinned({ requireParentChara: GOLD_SHIP_CHARA });
    expect(results.length).toBeGreaterThan(0);
    expect(legal).toBeLessThan(sweep([]).legal);
    for (const r of results) expect(asParent(r, GOLD_SHIP_CHARA), names(r)).toBe(true);
  });

  it('keeps only pairs seating the character as a GRANDPARENT', () => {
    const { results, legal } = pinned({ requireGrandparentChara: VODKA_CHARA });
    expect(results.length).toBeGreaterThan(0);
    expect(legal).toBeLessThan(sweep([]).legal);
    for (const r of results) expect(asGrandparent(r, VODKA_CHARA), names(r)).toBe(true);
  });

  it('reads the two slots separately rather than as one "somewhere" pin', () => {
    // Gold Ship is BOTH a veteran and somebody's parent in this roster, so the
    // two pins select overlapping but different sets. A single "anywhere" pin
    // could not tell "I want to train off her" from "I want her affinity".
    const parents = pinned({ requireParentChara: GOLD_SHIP_CHARA }).results.map(names).sort();
    const grands = pinned({ requireGrandparentChara: GOLD_SHIP_CHARA }).results.map(names).sort();
    expect(parents).not.toEqual(grands);
  });

  it('is a filter on composition, so a surviving pair scores EXACTLY as before', () => {
    // The whole reason the pin exists. If any figure moved, the reader would be
    // back to reading odds for a build they did not ask about.
    const before = sweep([]).results;
    for (const after of pinned({ requireParentChara: GOLD_SHIP_CHARA }).results) {
      const match = before.find((r) => r.a === after.a && r.b === after.b);
      expect(match, names(after)).toEqual(after);
    }
  });

  it('cannot be satisfied by a slot master.mdb could not resolve', () => {
    // A null charaId is an unresolved card, not a wildcard. 9999 is nobody.
    expect(pinned({ requireParentChara: 9999 }).legal).toBe(0);
    expect(pinned({ requireGrandparentChara: 9999 }).legal).toBe(0);
  });
});
