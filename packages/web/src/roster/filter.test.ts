import { describe, expect, it } from 'vitest';
import type { PackageSpark, ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import { filterVeterans, matchesCriterion, pickBlock, starsInScope } from './filter';

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
  split: 'sum',
  ...over,
});

describe('scope decides which members of the package count', () => {
  const spark: PackageSpark = { groupId: STAMINA, stars: [3, 2, 1] };

  it.each([
    ['package', [3, 2, 1]],
    ['parent', [3]],
    ['grandparents', [2, 1]],
  ] as const)('%s reads %j', (scope, expected) => {
    expect(starsInScope(spark, scope)).toEqual(expected);
  });
});

describe('split decides whether the scoped members add up or stand alone', () => {
  // The dimension that would have been destroyed by summing the index at build
  // time, and the one M7's borrow search needs.
  const spread = veteran([2, 2, 0]); // 4 across the package, never more than 2 on one uma

  it('sum counts the package together', () => {
    expect(matchesCriterion(spread, criterion({ split: 'sum', minStars: 4 }))).toBe(true);
  });

  it('single requires one uma to reach the threshold alone', () => {
    expect(matchesCriterion(spread, criterion({ split: 'single', minStars: 4 }))).toBe(false);
    expect(matchesCriterion(spread, criterion({ split: 'single', minStars: 2 }))).toBe(true);
  });

  it('distinguishes two packages that a summed index would call identical', () => {
    const concentrated = veteran([3, 1, 0]); // also 4 across the package
    const single3 = criterion({ split: 'single', minStars: 3 });
    expect(matchesCriterion(concentrated, single3)).toBe(true);
    expect(matchesCriterion(spread, single3)).toBe(false);
  });
});

describe('scope and split together', () => {
  it('pins a requirement to the direct parent', () => {
    // A 2-star spark on a parent is worth materially more than the same spark on
    // a grandparent: parent individual affinity has median 138 against 36.
    const onGrandparents = veteran([0, 3, 3]);
    expect(matchesCriterion(onGrandparents, criterion({ scope: 'package', minStars: 6 }))).toBe(true);
    expect(matchesCriterion(onGrandparents, criterion({ scope: 'parent', minStars: 1 }))).toBe(false);
  });
});

describe('filterVeterans', () => {
  const roster = [veteran([3, 3, 3]), veteran([1, 0, 0]), veteran([0, 0, 0])];

  it('returns everything when no criterion is set', () => {
    expect(filterVeterans(roster, null)).toHaveLength(3);
  });

  it('keeps only the packages that satisfy the criterion', () => {
    expect(filterVeterans(roster, criterion({ minStars: 9 }))).toHaveLength(1);
  });

  it('treats a spark the package does not carry at all as a miss, not a zero', () => {
    const other = { ...veteran([3, 3, 3]), sparks: [] };
    expect(matchesCriterion(other, criterion({ minStars: 1 }))).toBe(false);
  });

  it('does not mutate the roster it was given', () => {
    const copy = [...roster];
    filterVeterans(roster, criterion());
    expect(roster).toEqual(copy);
  });
});

describe('pickBlock: what the pair will not accept', () => {
  const OGURI = 1006;
  const GOLD_SHIP = 1007;
  // Two CARDS of one character. This is the case the rule exists for: different
  // costumes, different unique skills, same uma.
  const oguriStarlight = veteran([0, 0, 0], { index: 0, cardId: 100601, charaId: OGURI });
  const oguriAshen = veteran([0, 0, 0], { index: 1, cardId: 100602, charaId: OGURI });
  const goldShip = veteran([0, 0, 0], { index: 2, cardId: 100701, charaId: GOLD_SHIP });

  it('accepts anything when nothing is picked', () => {
    expect(pickBlock(oguriStarlight, [])).toBeNull();
  });

  it('refuses the same uma in the other parent slot, across costumes', () => {
    // Comparison is by charaId, never cardId: 100601 and 100602 are different
    // cards, and card equality would wave this pair straight through.
    expect(pickBlock(oguriAshen, [oguriStarlight])).toBe('same-uma');
  });

  it('still accepts a different uma while one slot is open', () => {
    expect(pickBlock(goldShip, [oguriStarlight])).toBeNull();
  });

  it('never blocks the already-picked card, so it can be unselected', () => {
    expect(pickBlock(oguriStarlight, [oguriStarlight])).toBeNull();
    expect(pickBlock(oguriStarlight, [oguriStarlight, goldShip])).toBeNull();
  });

  it('refuses a third pick once two are chosen', () => {
    const other = veteran([0, 0, 0], { index: 3, cardId: 100801, charaId: 1008 });
    expect(pickBlock(other, [oguriStarlight, goldShip])).toBe('pair-full');
  });

  it('reports same-uma ahead of pair-full, because that is the actionable reason', () => {
    // "Unselect one to swap it" is useless advice when the real problem is that
    // this card can never be the other parent.
    expect(pickBlock(oguriAshen, [oguriStarlight, goldShip])).toBe('same-uma');
  });

  it('does not block an unresolved card, whose character is unknown', () => {
    // charaId is null when master.mdb has no such card. We cannot show it is the
    // same uma, and refusing the pick would punish the user for a stale extract.
    const unknownA = veteran([0, 0, 0], { index: 4, cardId: 999998, charaId: null });
    const unknownB = veteran([0, 0, 0], { index: 5, cardId: 999999, charaId: null });
    expect(pickBlock(unknownB, [unknownA])).toBeNull();
  });
});
