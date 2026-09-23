import { describe, expect, it } from 'vitest';
import { starsInPair, type PairSweep } from '@umalegacies/core';
import type { PackageSpark, ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import { viewOf } from './search-rows';

/**
 * THE BAND SHOWS THE FIGURE THE REQUIREMENT WAS TESTED AGAINST.
 *
 * It used to recompose it by adding the two halves together, which is right for
 * a summing scope and wrong for a maximum: under `one-parent` a pair meeting
 * "3 stars on one parent" was displayed as carrying 6. The builder reported the
 * gentler version first -- a band reading 5 beside chips reading 4 and 2 -- and
 * this is the guard for both.
 */

const MEDIUM = 33;

const veteran = (stars: [number, number, number], index: number): ResolvedVeteran => ({
  index,
  score: 10000,
  self: { cardId: 100000 + index, charaId: 1000 + index, name: `V${index}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks: [{ groupId: MEDIUM, stars }] satisfies PackageSpark[],
  unknownFactorIds: [],
  ok: true,
});

const criterion = (scope: SparkCriterion['scope']): SparkCriterion => ({
  groupId: MEDIUM,
  minStars: 1,
  scope,
});

const sweep = (): PairSweep => ({
  results: [{ a: 0, b: 1, joint: null, perSpark: [0.5], pairTotal: 100, relationRank: 3 }],
  legal: 1,
  scored: 1,
});

/** Half A holds 3 on its parent and 4 on its grandparents; half B holds 2 and 6. */
const veterans = [veteran([3, 2, 2], 0), veteran([2, 3, 3], 1)];

describe('what the band is handed', () => {
  it.each([
    // scope          expected   why
    ['package', 15, 'all six ancestors: 7 + 8'],
    ['parent', 5, 'the two direct parents only: 3 + 2'],
    ['one-parent', 3, 'the BETTER direct parent, not both added: max(3, 2)'],
  ] as const)('%s reads %i (%s)', (scope, expected, _why) => {
    const [row] = viewOf(sweep(), veterans, [criterion(scope)], 10).rows;
    expect(row?.inScope[0]).toBe(expected);
  });

  it('never differs from what matchesPair measured', () => {
    // The point of the fix: one function decides the number, not two. A band
    // that recomputes can disagree with the predicate that admitted the row.
    for (const scope of ['package', 'parent', 'one-parent'] as const) {
      const [row] = viewOf(sweep(), veterans, [criterion(scope)], 10).rows;
      expect(row?.inScope[0]).toBe(
        starsInPair(veterans[0] as ResolvedVeteran, veterans[1] as ResolvedVeteran, MEDIUM, scope),
      );
    }
  });

  it('does not add the halves together under a maximum scope', () => {
    // The exact regression. Two halves holding 3 and 2 on their parents satisfy
    // "3 on one parent" at 3; displaying 5 would claim the pair clears a
    // threshold it only just meets.
    const [row] = viewOf(sweep(), veterans, [criterion('one-parent')], 10).rows;
    expect(row?.inScope[0]).not.toBe(5);
    expect(row?.inScope[0]).toBe(3);
  });

  it('keeps one figure per criterion, in the order asked', () => {
    const [row] = viewOf(
      sweep(),
      veterans,
      [criterion('one-parent'), criterion('package'), criterion('parent')],
      10,
    ).rows;
    expect(row?.inScope).toEqual([3, 15, 5]);
  });
});

describe('what the counts describe', () => {
  it('counts candidates across the whole sweep, not just the page', () => {
    // "31 of 259 veterans" must not change when the reader asks for more rows.
    const wide: PairSweep = {
      results: [
        { a: 0, b: 1, joint: null, perSpark: [1], pairTotal: 100, relationRank: 3 },
        { a: 0, b: 2, joint: null, perSpark: [1], pairTotal: 90, relationRank: 3 },
      ],
      legal: 2,
      scored: 2,
    };
    const all = [...veterans, veteran([1, 1, 1], 2)];
    const paged = viewOf(wide, all, [criterion('package')], 1);

    expect(paged.rows).toHaveLength(1);
    expect(paged.matchingPairs).toBe(2);
    expect(paged.candidates).toBe(3);
  });
});
