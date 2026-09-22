import { describe, expect, it } from 'vitest';
import type { PackageSpark, ResolvedVeteran, SparkCriterion, SparkKind } from '@umalegacies/types';
import {
  filterVeterans,
  isLegalPair,
  isRequirement,
  matchesPair,
  starsInPair,
  matchesCriterion,
  maxStarsFor,
  pickBlock,
  starsInScope,
} from './filter.js';

const STAMINA = 2;

const veteran = (
  stars: [number, number, number],
  over: { index?: number; cardId?: number; charaId?: number | null } = {},
): ResolvedVeteran => ({
  index: over.index ?? 0,
  score: 1000,
  self: {
    cardId: over.cardId ?? 1,
    charaId: over.charaId === undefined ? 1 : over.charaId,
    name: 'A',
    costume: null,
    resolution: { ok: true },
  },
  parents: [null, null],
  sparks: [{ groupId: STAMINA, stars }] satisfies PackageSpark[],
  unknownFactorIds: [],
  ok: true,
});

const criterion = (over: Partial<SparkCriterion> = {}): SparkCriterion => ({
  groupId: STAMINA,
  minStars: 4,
  scope: 'package',
  ...over,
});

describe('scope decides which members of the package count', () => {
  const spark: PackageSpark = { groupId: STAMINA, stars: [3, 2, 1] };

  it.each([
    ['package', [3, 2, 1]],
    ['parent', [3]],
  ] as const)('%s reads %j', (scope, expected) => {
    expect(starsInScope(spark, scope)).toEqual(expected);
  });
});

describe('a scope sums its members', () => {
  it('adds the whole lineage up', () => {
    // 4 across the package, never more than 2 on one uma. The lineage scope
    // does not care which uma carries what.
    expect(matchesCriterion(veteran([2, 2, 0]), criterion({ minStars: 4 }))).toBe(true);
  });

  it('pins a requirement to the direct parent', () => {
    // A 2-star spark on a parent is worth materially more than the same spark on
    // a grandparent: parent individual affinity has median 138 against 36.
    const onGrandparents = veteran([0, 3, 3]);
    expect(matchesCriterion(onGrandparents, criterion({ scope: 'package', minStars: 6 }))).toBe(true);
    expect(matchesCriterion(onGrandparents, criterion({ scope: 'parent', minStars: 1 }))).toBe(false);
  });

  it('is what "on one uma alone" used to say, now said by the parent scope', () => {
    // The removed `split` dimension could ask for 3 stars concentrated on one
    // uma. A parent-scoped row asks the same thing and names WHICH uma.
    const spread = veteran([2, 2, 0]);
    const concentrated = veteran([3, 1, 0]);
    const onParent3 = criterion({ scope: 'parent', minStars: 3 });
    expect(matchesCriterion(concentrated, onParent3)).toBe(true);
    expect(matchesCriterion(spread, onParent3)).toBe(false);
  });
});

describe('the ceiling a scope can hold', () => {
  // The star selector offers exactly this range, which is how a requirement
  // nobody can satisfy stops being expressible instead of being warned about.
  //
  // All four corners, because the two axes are independent and the bug this
  // guards against is reading one of them off the wrong table: three stars per
  // uma, times the members the scope counts, times the halves the subject has.
  it.each([
    ['parent', 'package', 3],
    ['package', 'package', 9],
    ['parent', 'pair', 6],
    ['package', 'pair', 18],
  ] as const)('%s scope on a %s caps at %i stars', (scope, subject, expected) => {
    expect(maxStarsFor(scope, subject)).toBe(expected);
  });

  // The relationship, stated separately from the numbers. If someone ever
  // changes a ceiling, this says which of the two tables they meant to edit.
  it.each(['parent', 'package'] as const)('a pair holds twice a package, %s scope', (scope) => {
    expect(maxStarsFor(scope, 'pair')).toBe(maxStarsFor(scope, 'package') * 2);
  });

  // The design doc calls conflating the two a correctness trap, so the trap is
  // pinned: these must never be the same number.
  it('never reads the same ceiling for a package and a pair', () => {
    for (const scope of ['parent', 'package'] as const) {
      expect(maxStarsFor(scope, 'package')).not.toBe(maxStarsFor(scope, 'pair'));
    }
  });
});

describe('filterVeterans', () => {
  const roster = [veteran([3, 3, 3]), veteran([1, 0, 0]), veteran([0, 0, 0])];

  it('returns everything when no criterion is set', () => {
    expect(filterVeterans(roster, [])).toHaveLength(3);
  });

  it('keeps only the packages that satisfy the criterion', () => {
    expect(filterVeterans(roster, [criterion({ minStars: 9 })])).toHaveLength(1);
  });

  it('treats a spark the package does not carry at all as a miss, not a zero', () => {
    const other = { ...veteran([3, 3, 3]), sparks: [] };
    expect(matchesCriterion(other, criterion({ minStars: 1 }))).toBe(false);
  });

  it('does not mutate the roster it was given', () => {
    const copy = [...roster];
    filterVeterans(roster, [criterion()]);
    expect(roster).toEqual(copy);
  });
});

/**
 * More than one criterion at a time.
 *
 * AND is the whole point: "who can give me the blue I need AND a decent pink"
 * is the question a pair is chosen to answer. An OR over the same rows is the
 * weaker query, already available by filtering one spark at a time.
 */
describe('several criteria at once', () => {
  const SPEED = 1;

  /** Stars per spark, so a package can satisfy one requirement and miss another. */
  const pkg = (stamina: [number, number, number], speed: [number, number, number], index: number) => ({
    ...veteran(stamina, { index }),
    sparks: [
      { groupId: STAMINA, stars: stamina },
      { groupId: SPEED, stars: speed },
    ] satisfies PackageSpark[],
  });

  const both = pkg([3, 3, 3], [3, 3, 3], 0); // 9 stamina, 9 speed
  const staminaOnly = pkg([3, 3, 3], [1, 0, 0], 1); // 9 stamina, 1 speed
  const speedOnly = pkg([1, 0, 0], [3, 3, 3], 2); // 1 stamina, 9 speed
  const roster = [both, staminaOnly, speedOnly];

  const wantStamina = criterion({ groupId: STAMINA, minStars: 6 });
  const wantSpeed = criterion({ groupId: SPEED, minStars: 6 });

  it('keeps only the packages that satisfy EVERY criterion', () => {
    const kept = filterVeterans(roster, [wantStamina, wantSpeed]);
    expect(kept.map((v) => v.index)).toEqual([0]);
  });

  it('is narrower than either criterion alone, which is the point', () => {
    expect(filterVeterans(roster, [wantStamina])).toHaveLength(2);
    expect(filterVeterans(roster, [wantSpeed])).toHaveLength(2);
    expect(filterVeterans(roster, [wantStamina, wantSpeed])).toHaveLength(1);
  });

  it('does not OR them, which would keep everything here', () => {
    // Every package in this roster satisfies at least one of the two. If the
    // combination were OR, all three would survive and the filter would be
    // answering a question nobody asked.
    expect(filterVeterans(roster, [wantStamina, wantSpeed])).not.toHaveLength(3);
  });

  it('returns nothing when the requirements cannot all be met together', () => {
    const impossible = criterion({ groupId: SPEED, minStars: 99 });
    expect(filterVeterans(roster, [wantStamina, impossible])).toEqual([]);
  });

  it('applies each row its own scope', () => {
    // Stamina pinned to the direct parent (3 there), speed summed across the
    // package (9). Only `both` clears both readings.
    const parentStamina = criterion({ groupId: STAMINA, minStars: 3, scope: 'parent' });
    const packageSpeed = criterion({ groupId: SPEED, minStars: 6, scope: 'package' });
    expect(filterVeterans(roster, [parentStamina, packageSpeed]).map((v) => v.index)).toEqual([0]);
  });

  it('is order-independent', () => {
    const a = filterVeterans(roster, [wantStamina, wantSpeed]).map((v) => v.index);
    const b = filterVeterans(roster, [wantSpeed, wantStamina]).map((v) => v.index);
    expect(a).toEqual(b);
  });

  it('treats the same spark twice as two requirements, the stricter one deciding', () => {
    // Not prevented at this layer: the UI keeps a spark from being added twice,
    // but the predicate must still be coherent if it ever happens.
    const loose = criterion({ groupId: STAMINA, minStars: 1 });
    const strict = criterion({ groupId: STAMINA, minStars: 9 });
    expect(filterVeterans(roster, [loose, strict]).map((v) => v.index)).toEqual([0, 1]);
  });
});

describe('matchesPair: what the six ancestors carry between them', () => {
  // [the veteran itself, its slot 10, its slot 20].
  const half = (stars: [number, number, number], index: number) => veteran(stars, { index });
  const none = (index: number): ResolvedVeteran => ({
    ...veteran([0, 0, 0], { index }),
    sparks: [],
  });

  describe('the two halves sum', () => {
    it('adds a pair holding 6 as 3+3', () => {
      expect(starsInPair(half([3, 0, 0], 0), half([3, 0, 0], 1), STAMINA, 'package')).toBe(6);
    });

    it('adds a pair holding 6 as 6+0 to the same total', () => {
      // Different propositions, identical total. The search ranks them apart by
      // odds, not by refusing one of them here.
      expect(starsInPair(half([3, 3, 0], 0), none(1), STAMINA, 'package')).toBe(6);
    });

    it('counts every member of both packages under the lineage scope', () => {
      expect(starsInPair(half([3, 2, 1], 0), half([1, 2, 3], 1), STAMINA, 'package')).toBe(12);
    });

    it('counts only the two direct parents under the parent scope', () => {
      // Slots 10 and 20. The grandparents' stars are real and simply not asked
      // about here.
      expect(starsInPair(half([3, 2, 1], 0), half([1, 2, 3], 1), STAMINA, 'parent')).toBe(4);
    });
  });

  describe('a half that lacks the spark is a zero, not a failure', () => {
    // The bug a pair predicate built out of `matchesCriterion` would have had.
    it('accepts a threshold one half meets alone', () => {
      expect(matchesPair(half([3, 3, 0], 0), none(1), criterion({ minStars: 6 }))).toBe(true);
    });

    it('accepts a threshold NEITHER half meets alone', () => {
      const a = half([3, 0, 0], 0);
      const b = half([3, 0, 0], 1);
      const asked = criterion({ minStars: 6 });
      expect(matchesCriterion(a, asked)).toBe(false);
      expect(matchesCriterion(b, asked)).toBe(false);
      // AND would have refused this pair; OR would have accepted a 3+0 one.
      expect(matchesPair(a, b, asked)).toBe(true);
    });

    it('still refuses a pair where the spark is absent from both', () => {
      expect(matchesPair(none(0), none(1), criterion({ minStars: 1 }))).toBe(false);
    });
  });

  it('meets a threshold exactly, and misses it by one', () => {
    const a = half([2, 1, 0], 0);
    const b = half([1, 0, 0], 1);
    expect(matchesPair(a, b, criterion({ minStars: 4 }))).toBe(true);
    expect(matchesPair(a, b, criterion({ minStars: 5 }))).toBe(false);
  });

  it('is symmetric: a pair is unordered', () => {
    const a = half([3, 1, 0], 0);
    const b = half([0, 2, 1], 1);
    const asked = criterion({ minStars: 7 });
    expect(starsInPair(a, b, STAMINA, 'package')).toBe(starsInPair(b, a, STAMINA, 'package'));
    expect(matchesPair(a, b, asked)).toBe(matchesPair(b, a, asked));
  });

  it('never reports more than the ceiling T3 offers for a pair', () => {
    // Ties the predicate to the selector: the star control cannot express a
    // threshold above `maxStarsFor(scope, 'pair')`, and this is why that is the
    // right ceiling rather than a guess.
    const maxed = half([3, 3, 3], 0);
    const other = half([3, 3, 3], 1);
    for (const scope of ['parent', 'package'] as const) {
      expect(starsInPair(maxed, other, STAMINA, scope)).toBe(maxStarsFor(scope, 'pair'));
    }
  });
});

describe('isRequirement: which criteria may prune', () => {
  const NAMED = ['blue', 'pink', 'green'] as const;
  const WHITES = ['white_skill', 'white_race', 'white_scenario'] as const;

  it.each(NAMED)('%s is a requirement without being asked', (kind) => {
    expect(isRequirement(criterion(), kind)).toBe(true);
  });

  it.each(NAMED)('%s stays a requirement even if mustHave says otherwise', (kind) => {
    // Every ancestor carries exactly one of each, so naming one is always a
    // claim worth pruning on. The flag is redundant here, not obeyed.
    expect(isRequirement(criterion({ mustHave: false }), kind)).toBe(true);
  });

  it.each(WHITES)('%s only ranks by default', (kind) => {
    expect(isRequirement(criterion(), kind)).toBe(false);
    expect(isRequirement(criterion({ mustHave: false }), kind)).toBe(false);
  });

  it.each(WHITES)('%s prunes once promoted', (kind) => {
    expect(isRequirement(criterion({ mustHave: true }), kind)).toBe(true);
  });

  it('is the only thing that changes between two whites in one search', () => {
    // The toggle is PER-CRITERION, which is the whole point: 231 distinct white
    // types means requiring them all at once returns nothing almost always.
    const asked = criterion({ groupId: 10, mustHave: true });
    const preferred = criterion({ groupId: 11 });
    expect(isRequirement(asked, 'white_skill')).toBe(true);
    expect(isRequirement(preferred, 'white_skill')).toBe(false);
  });

  it('never leaves a criterion neither pruning nor ranking', () => {
    // A total function over every kind, so a new SparkKind cannot quietly land
    // in a third state that no caller handles.
    const kinds: SparkKind[] = [...NAMED, ...WHITES];
    for (const kind of kinds) {
      for (const mustHave of [undefined, true, false]) {
        expect(typeof isRequirement(criterion({ mustHave }), kind)).toBe('boolean');
      }
    }
  });
});

describe('the roster list treats every criterion as a requirement', () => {
  // filterVeterans deliberately does NOT consult isRequirement: a list has
  // nothing to rank with, so an un-promoted white must still filter or the
  // roster filter loses its main use.
  it('filters on an un-promoted white exactly as on a promoted one', () => {
    const has = veteran([3, 0, 0], { index: 0 });
    const lacks = veteran([0, 0, 0], { index: 1 });
    const roster = [has, lacks];
    const soft = criterion({ minStars: 1 });
    const hard = criterion({ minStars: 1, mustHave: true });

    expect(filterVeterans(roster, [soft])).toEqual([has]);
    expect(filterVeterans(roster, [hard])).toEqual([has]);
  });
});

describe('pickBlock: what the pair will not accept', () => {
  const OGURI = 1006;
  const GOLD_SHIP = 1007;
  const SUZUKA = 1002;
  // Two CARDS of one character. This is the case the identity rules exist for:
  // different costumes, different unique skills, same uma.
  const oguriStarlight = veteran([0, 0, 0], { index: 0, cardId: 100601, charaId: OGURI });
  const oguriAshen = veteran([0, 0, 0], { index: 1, cardId: 100602, charaId: OGURI });
  const goldShip = veteran([0, 0, 0], { index: 2, cardId: 100701, charaId: GOLD_SHIP });
  const suzuka = veteran([0, 0, 0], { index: 3, cardId: 100201, charaId: SUZUKA });

  it('accepts anything when nothing is picked and no trainee is chosen', () => {
    expect(pickBlock(oguriStarlight, [], null)).toBeNull();
  });

  describe('a parent cannot be the trainee', () => {
    it('blocks the trainee itself', () => {
      expect(pickBlock(oguriStarlight, [], OGURI)).toBe('is-trainee');
    });

    it('blocks a DIFFERENT costume of the trainee', () => {
      // The whole point of comparing by charaId: the user trains one card and
      // owns another of the same character, and they are still one uma.
      expect(pickBlock(oguriAshen, [], OGURI)).toBe('is-trainee');
    });

    it('leaves every other uma alone', () => {
      expect(pickBlock(goldShip, [], OGURI)).toBeNull();
    });

    it('is reported ahead of the other reasons, being the least recoverable', () => {
      // "Unselect one to swap it" is useless advice for a card that can never be
      // a parent of this trainee at all.
      expect(pickBlock(oguriAshen, [goldShip, suzuka], OGURI)).toBe('is-trainee');
    });
  });

  describe('the two parents cannot be the same uma', () => {
    it('refuses the same uma in the other slot, across costumes', () => {
      expect(pickBlock(oguriAshen, [oguriStarlight], null)).toBe('same-uma');
    });

    it('still accepts a different uma while one slot is open', () => {
      expect(pickBlock(goldShip, [oguriStarlight], null)).toBeNull();
    });
  });

  it('never blocks the already-picked card, so it can be unselected', () => {
    expect(pickBlock(oguriStarlight, [oguriStarlight], null)).toBeNull();
    expect(pickBlock(oguriStarlight, [oguriStarlight, goldShip], null)).toBeNull();
    // Even when the trainee changed underneath it: the card has to remain
    // unselectable-away, or the pair would be stuck in a state the rules forbid.
    expect(pickBlock(oguriStarlight, [oguriStarlight], OGURI)).toBeNull();
  });

  it('refuses a third pick once two are chosen', () => {
    expect(pickBlock(suzuka, [oguriStarlight, goldShip], null)).toBe('pair-full');
  });

  it('does not block an unresolved card, whose character is unknown', () => {
    // charaId is null when master.mdb has no such card. We cannot show it is the
    // same uma, and refusing the pick would punish the user for a stale extract.
    const unknownA = veteran([0, 0, 0], { index: 4, cardId: 999998, charaId: null });
    const unknownB = veteran([0, 0, 0], { index: 5, cardId: 999999, charaId: null });
    expect(pickBlock(unknownB, [unknownA], null)).toBeNull();
    expect(pickBlock(unknownB, [], OGURI)).toBeNull();
  });
});

describe('isLegalPair: the sweep asks the same rules a different way', () => {
  const OGURI = 1006;
  const GOLD_SHIP = 1007;
  const SUZUKA = 1002;
  const oguriStarlight = veteran([0, 0, 0], { index: 0, cardId: 100601, charaId: OGURI });
  const oguriAshen = veteran([0, 0, 0], { index: 1, cardId: 100602, charaId: OGURI });
  const goldShip = veteran([0, 0, 0], { index: 2, cardId: 100701, charaId: GOLD_SHIP });
  const suzuka = veteran([0, 0, 0], { index: 3, cardId: 100201, charaId: SUZUKA });
  const unknownA = veteran([0, 0, 0], { index: 4, cardId: 999998, charaId: null });
  const unknownB = veteran([0, 0, 0], { index: 5, cardId: 999999, charaId: null });

  it('accepts two different characters', () => {
    expect(isLegalPair(goldShip, suzuka, null)).toBe(true);
  });

  it('refuses two COSTUMES of one character', () => {
    // The case every identity rule in this file exists for. Comparing by cardId
    // would wave this through, which is exactly the bug.
    expect(isLegalPair(oguriStarlight, oguriAshen, null)).toBe(false);
  });

  it('refuses either half being the trainee, in either position', () => {
    expect(isLegalPair(oguriAshen, goldShip, OGURI)).toBe(false);
    expect(isLegalPair(goldShip, oguriAshen, OGURI)).toBe(false);
  });

  it('leaves a pair alone when the trainee is neither of them', () => {
    expect(isLegalPair(goldShip, suzuka, OGURI)).toBe(true);
  });

  it('does not use the identity rules on an unresolved card', () => {
    // Two cards the extract cannot name are not shown to be one character, so
    // the pair stands. A stale extract must not silently shrink the search.
    expect(isLegalPair(unknownA, unknownB, null)).toBe(true);
    expect(isLegalPair(unknownA, goldShip, OGURI)).toBe(true);
  });

  it('refuses one veteran as BOTH parents, resolved or not', () => {
    // A sweep over unordered pairs never produces this, which is why the guard
    // looks unreachable. It is not: with a null charaId, rule 2 cannot see that
    // the two halves are the same uma, so nothing else would refuse it.
    expect(isLegalPair(goldShip, goldShip, null)).toBe(false);
    expect(isLegalPair(unknownA, unknownA, null)).toBe(false);
  });

  /**
   * THE POINT OF T4. `pickBlock` and `isLegalPair` answer different questions in
   * different shapes, and the claim is that they enforce ONE set of rules. This
   * is that claim, checked over every ordered pair of the fixtures rather than
   * asserted in a comment.
   *
   * TWO CONDITIONS ON THE PROPERTY, both of them real and neither cosmetic.
   *
   * Distinct veterans, because `pickBlock` deliberately returns null for a card
   * already in the picked list so it can be UNSELECTED -- a statement about
   * clicking, not about legality.
   *
   * And the already-picked half must itself still be a legal parent. `pickBlock`
   * validates only the card being CLICKED; it trusts that whatever is already
   * in the list was checked when it went in. That invariant can be broken from
   * outside, by switching the trainee to a picked uma, and then the two
   * functions genuinely differ -- see the test below, which pins the difference
   * rather than papering over it.
   */
  it('never disagrees with pickBlock about a pair', () => {
    const all = [oguriStarlight, oguriAshen, goldShip, suzuka, unknownA, unknownB];
    const trainees = [null, OGURI, GOLD_SHIP, SUZUKA];
    let checked = 0;

    for (const trainee of trainees) {
      for (const a of all) {
        // The invariant pickBlock assumes: the half already in the list was
        // legal when it was put there.
        if (pickBlock(a, [], trainee) !== null) continue;
        for (const b of all) {
          if (a.index === b.index) continue;
          expect({ a: a.index, b: b.index, trainee, legal: isLegalPair(a, b, trainee) }).toEqual({
            a: a.index,
            b: b.index,
            trainee,
            legal: pickBlock(b, [a], trainee) === null,
          });
          checked++;
        }
      }
    }

    // A guard on the guard: a loop whose filter quietly excluded everything
    // would still pass every assertion inside it.
    //
    // Legal first halves per trainee, out of six fixtures: `null` bars none, so
    // 6. GOLD_SHIP and SUZUKA bar their own card, so 5 each. OGURI bars TWO --
    // both Oguri costumes -- so 4, and that asymmetry is the entire reason
    // these fixtures include two cards of one character. Five second halves
    // each way.
    expect(checked).toBe((6 + 4 + 5 + 5) * 5);
  });

  /**
   * WHERE THE TWO DO DIFFER, on purpose.
   *
   * Pick two legal parents, then switch the trainee to one of them. The pair is
   * now illegal and `isLegalPair` says so, but `pickBlock` still reports the
   * OTHER card as clickable, because it gates the click rather than auditing the
   * list. The app handles this downstream instead: switching the trainee to a
   * picked uma nulls the lineage, so nothing is computed from the illegal pair
   * and the tree closes itself.
   *
   * Recorded here so the next person reads it as a boundary between two
   * questions rather than as a bug in whichever one they looked at second.
   */
  it('is stricter than pickBlock when the trainee changes under a live pick', () => {
    expect(isLegalPair(oguriStarlight, goldShip, OGURI)).toBe(false);
    expect(pickBlock(goldShip, [oguriStarlight], OGURI)).toBeNull();
    // And the picked half stays unselectable-away, which is what makes the
    // state recoverable at all.
    expect(pickBlock(oguriStarlight, [oguriStarlight], OGURI)).toBeNull();
  });
});
