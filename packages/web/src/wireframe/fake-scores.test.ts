import type { ResolvedMember, ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import { describe, expect, it } from 'vitest';
import { fakePairSearch } from './fake-scores';

/**
 * The wireframe's numbers are invented, so there is nothing to assert about
 * them. What IS worth pinning is everything around them, because each of these
 * is a way the wireframe could quietly stop showing the thing it exists to
 * show:
 *
 *  - illegal pairs, which would make the review judge rows the game refuses;
 *  - a shuffling order, which makes scrolling and repetition unjudgeable;
 *  - star counts that are not the roster's, which is the half of the row that
 *    is supposed to be real.
 */

const member = (charaId: number, name: string, costume: string | null = null): ResolvedMember => ({
  cardId: charaId * 100 + 1,
  charaId,
  name,
  costume,
  resolution: { ok: true },
});

/** stars is [the veteran itself, its slot 10, its slot 20]. */
function veteran(
  index: number,
  charaId: number,
  sparks: Array<{ groupId: number; stars: [number, number, number] }>,
): ResolvedVeteran {
  return {
    index,
    score: 10_000 + index * 137,
    self: member(charaId, `Chara ${charaId}`),
    parents: [member(900 + charaId, 'Dam'), member(800 + charaId, 'Sire')],
    sparks,
    unknownFactorIds: [],
    ok: true,
  };
}

const ROSTER: ResolvedVeteran[] = [
  // Two entries of ONE character, which is the illegal-pair case.
  veteran(0, 1, [{ groupId: 10, stars: [3, 2, 0] }]),
  veteran(1, 1, [{ groupId: 10, stars: [1, 0, 0] }]),
  veteran(2, 2, [{ groupId: 10, stars: [2, 1, 1] }]),
  veteran(3, 3, [{ groupId: 10, stars: [0, 0, 0] }]),
  veteran(4, 4, []),
];

describe('the wireframe pair generator', () => {
  it('never composes a pair the game refuses', () => {
    const { rows, legalPairs } = fakePairSearch(ROSTER, null, []);

    // 5 veterans give 10 unordered pairs; the two entries of chara 1 are one
    // of them and are excluded, so 9.
    expect(legalPairs).toBe(9);
    expect(rows).toHaveLength(9);
    for (const row of rows) expect(row.a.self.charaId).not.toBe(row.b.self.charaId);
  });

  it('leaves the trainee out of both halves', () => {
    // Chara 2 is being trained: you are not your own parent. That removes the
    // one veteran of chara 2 and every pair it was in, leaving 4 veterans --
    // 6 unordered pairs, less the one that is chara 1 against itself.
    const { rows, legalPairs } = fakePairSearch(ROSTER, 2, []);

    expect(legalPairs).toBe(5);
    for (const row of rows) {
      expect(row.a.self.charaId).not.toBe(2);
      expect(row.b.self.charaId).not.toBe(2);
    }
  });

  it('draws the same figures for the same pair every time', () => {
    // The whole point of hashing the indices rather than calling Math.random:
    // a list that reshuffles on every keystroke cannot be reviewed for
    // scrolling or repetition.
    const first = fakePairSearch(ROSTER, null, []);
    const second = fakePairSearch(ROSTER, null, []);

    expect(second.rows.map((r) => [r.a.index, r.b.index, r.pairTotal, r.relationRank])).toEqual(
      first.rows.map((r) => [r.a.index, r.b.index, r.pairTotal, r.relationRank]),
    );
  });

  it('counts stars across the whole pair, per half, off the real roster', () => {
    // `package` scope reads all three slots of each half: veteran 0 carries
    // 3+2+0 = 5 and veteran 2 carries 2+1+1 = 4, so that pair holds 9.
    const criteria: SparkCriterion[] = [{ groupId: 10, minStars: 9, scope: 'package' }];
    const { rows, matchingPairs, legalPairs } = fakePairSearch(ROSTER, null, criteria);

    expect(legalPairs).toBe(9);
    expect(matchingPairs).toBe(1);
    const only = rows[0];
    expect([only?.a.index, only?.b.index]).toEqual([0, 2]);
    expect(only?.stars[0]).toEqual([5, 4]);
  });

  it('reads the parent scope as the two direct parents only', () => {
    // `parent` scope reads stars[0] of each half: 3 on veteran 0 and 2 on
    // veteran 2, so 5 -- and nothing else in the roster reaches it.
    const criteria: SparkCriterion[] = [{ groupId: 10, minStars: 5, scope: 'parent' }];
    const { rows, matchingPairs } = fakePairSearch(ROSTER, null, criteria);

    expect(matchingPairs).toBe(1);
    expect(rows[0]?.stars[0]).toEqual([3, 2]);
  });

  it('states no joint below two requirements, and a real one above', () => {
    const one: SparkCriterion[] = [{ groupId: 10, minStars: 1, scope: 'package' }];
    expect(fakePairSearch(ROSTER, null, one).rows[0]?.joint).toBeNull();

    // Two requirements on the same spark are not expressible through the
    // filter, so the second one names a spark nobody carries -- which is
    // exactly the case that must take the joint to zero rather than be
    // skipped over.
    const two: SparkCriterion[] = [
      { groupId: 10, minStars: 1, scope: 'package' },
      { groupId: 11, minStars: 1, scope: 'package' },
    ];
    expect(fakePairSearch(ROSTER, null, two).matchingPairs).toBe(0);
  });

  it('ranks by the figure the headline prints, descending', () => {
    const criteria: SparkCriterion[] = [{ groupId: 10, minStars: 1, scope: 'package' }];
    const { rows } = fakePairSearch(ROSTER, null, criteria);

    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i - 1] as { order: number }).order).toBeGreaterThanOrEqual(
        (rows[i] as { order: number }).order,
      );
    }
  });

  it('counts the veterans that appear in at least one matching pair', () => {
    // The filter region states its result in veterans, and this is the honest
    // veteran figure for a search whose real result is a count of pairs.
    const criteria: SparkCriterion[] = [{ groupId: 10, minStars: 9, scope: 'package' }];
    expect(fakePairSearch(ROSTER, null, criteria).candidates).toBe(2);
  });
});
