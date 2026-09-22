import { describe, expect, it } from 'vitest';
import type { PackageSpark, ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import {
  filterVeterans,
  isLegalPair,
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
