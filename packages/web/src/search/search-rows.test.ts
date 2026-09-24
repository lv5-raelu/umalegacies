import { describe, expect, it } from 'vitest';
import type { PairSweep } from '@umalegacies/core';
import type { PackageSpark, ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import { viewOf } from './search-rows';

/**
 * THE BAND ALWAYS REPORTS THE WHOLE LINEAGE.
 *
 * It answers "what does this pair give me", so it counts every ancestor of both
 * halves whatever scope the criterion was written in. The scope is how the
 * reader FOUND the pair, not a claim about what the pair carries.
 *
 * Two cuts got this wrong in opposite directions. The first added the two
 * halves together in the criterion's scope, which under `one-parent` -- a
 * maximum -- displayed a pair meeting "3 on one parent" as carrying 6. The
 * second reported the scoped figure faithfully, which was correct arithmetic
 * answering the wrong question and read as a discrepancy: chips saying 4 and 2
 * beside a band saying 5.
 *
 * The invariant that settles both: the band equals the two chips added.
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
  results: [
    {
      a: 0,
      b: 1,
      joint: null,
      perSpark: [0.5],
      perSparkInherit: [0.125],
      jointInherit: null,
      pairTotal: 100,
      relationRank: 3,
    },
  ],
  legal: 1,
  scored: 1,
});

/** Half A holds 3 on its parent and 4 on its grandparents; half B holds 2 and 6. */
const veterans = [veteran([3, 2, 2], 0), veteran([2, 3, 3], 1)];

/** What a chip shows: everything one half holds, across its own three umas. */
const chipTotal = (veteran: ResolvedVeteran, groupId: number): number => {
  const spark = veteran.sparks.find((s) => s.groupId === groupId);
  return spark === undefined ? 0 : spark.stars.reduce((total, n) => total + (n ?? 0), 0);
};

describe('what the band is handed', () => {
  const EXPECTED = chipTotal(veterans[0] as ResolvedVeteran, MEDIUM) +
    chipTotal(veterans[1] as ResolvedVeteran, MEDIUM);

  it.each(['package', 'parent', 'one-parent'] as const)(
    'reads the whole lineage even when the criterion is scoped %s',
    (scope) => {
      const [row] = viewOf(sweep(), veterans, [criterion(scope)], 10).rows;
      expect(row?.lineageStars[0]).toBe(EXPECTED);
    },
  );

  it('equals the two chips added, which is how a reader checks it', () => {
    // The whole point. A number nobody can reconcile with what is above it is
    // a number that reads as a bug, whatever it is measuring.
    expect(EXPECTED).toBe(15);
    for (const scope of ['package', 'parent', 'one-parent'] as const) {
      const [row] = viewOf(sweep(), veterans, [criterion(scope)], 10).rows;
      expect(row?.lineageStars[0]).toBe(
        chipTotal(row?.a as ResolvedVeteran, MEDIUM) + chipTotal(row?.b as ResolvedVeteran, MEDIUM),
      );
    }
  });

  it('never reports a scoped figure, however the criteria are mixed', () => {
    // `parent` would read 5 here and `one-parent` 3. Neither may reach the band.
    const [row] = viewOf(
      sweep(),
      veterans,
      [criterion('one-parent'), criterion('package'), criterion('parent')],
      10,
    ).rows;
    expect(row?.lineageStars).toEqual([15, 15, 15]);
  });

  it('keeps one figure per criterion, in the order asked', () => {
    const [row] = viewOf(sweep(), veterans, [criterion('package'), criterion('parent')], 10).rows;
    expect(row?.lineageStars).toHaveLength(2);
  });
});

describe('what the counts describe', () => {
  it('counts candidates across the whole sweep, not just the page', () => {
    // "31 of 259 veterans" must not change when the reader asks for more rows.
    const wide: PairSweep = {
      results: [
        {
          a: 0,
          b: 1,
          joint: null,
          perSpark: [1],
          perSparkInherit: [0.25],
          jointInherit: null,
          pairTotal: 100,
          relationRank: 3,
        },
        {
          a: 0,
          b: 2,
          joint: null,
          perSpark: [1],
          perSparkInherit: [0.25],
          jointInherit: null,
          pairTotal: 90,
          relationRank: 3,
        },
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
