import { describe, expect, it } from 'vitest';
import type { PairSearchResult } from './sweep.js';
import { compareByInherit } from './sweep.js';

/**
 * HOW THE LIST IS ORDERED WHEN THE FILTER IS NOT MET, which is the ordinary
 * case rather than the tail.
 *
 * Whites RANK rather than exclude unless promoted to "must have", so a
 * six-white filter scores essentially every pair at a joint of exactly 0 --
 * `jointOdds` zeroes on any spark the pair misses, correctly, because a filter
 * is one build rather than six separate wishes. A comparator that reads only
 * the joint therefore cannot order the list it is asked to order.
 */

const pair = (
  perSparkInherit: (number | null)[],
  extra: Partial<PairSearchResult> = {},
): PairSearchResult => ({
  a: 0,
  b: 1,
  joint: 0,
  perSpark: perSparkInherit,
  perSparkInherit,
  jointInherit: 0,
  pairTotal: 100,
  relationRank: 3,
  ...extra,
});

/** Best first, the way the screen sorts. */
const order = (rows: PairSearchResult[]): PairSearchResult[] => [...rows].sort(compareByInherit);

describe('ranking by inheritance', () => {
  it('puts more of the wanted sparks above fewer, however good the fewer are', () => {
    // THE REGRESSION. The first cut dropped a missing white skill instead of
    // zeroing it, then fell back to a single spark's own figure whenever fewer
    // than two survived. A pair carrying ONE wanted skill at 28% outscored a
    // pair carrying all six, so "by inheritance" put the emptiest row on top --
    // which is exactly what it looked like on screen.
    const one = pair([null, null, 0.28, null, null, null].map((v) => (v === null ? 0 : v)));
    const six = pair([0.05, 0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(order([one, six])[0]).toBe(six);
  });

  it('breaks a coverage tie on the product over what is carried', () => {
    const better = pair([0.3, 0.3, 0, 0]);
    const worse = pair([0.1, 0.1, 0, 0]);
    expect(order([worse, better])[0]).toBe(better);
  });

  it('reduces to the plain joint when every pair meets the whole filter', () => {
    // The case the old key handled. Coverage ties, so the product decides, and
    // the product over a fully covered filter IS the joint.
    const strong = pair([0.5, 0.5]);
    const weak = pair([0.4, 0.5]);
    expect(order([weak, strong])[0]).toBe(strong);
  });

  it('ignores criteria that no pair can ever have an inherit figure for', () => {
    // A blue or a race criterion is null for every pair, so it must not count
    // against coverage -- otherwise adding a blue to the filter would flatten
    // the ordering of the skills beside it.
    const withBlue = pair([null, 0.3, 0.3]);
    const withoutBlue = pair([0.3, 0.3]);
    expect(withBlue.perSparkInherit.filter((v) => v !== null)).toHaveLength(2);
    expect(compareByInherit(withBlue, withoutBlue)).toBe(0);
  });

  it('is a TOTAL order, so a re-sort cannot reshuffle equal rows', () => {
    // Pagination depends on this: two pairs that score identically must keep a
    // stable relative order across a re-sweep or a toggle back and forth.
    const x = pair([0.2, 0.2], { a: 1, b: 5 });
    const y = pair([0.2, 0.2], { a: 1, b: 4 });
    expect(compareByInherit(x, y)).toBeGreaterThan(0);
    expect(compareByInherit(y, x)).toBeLessThan(0);
    expect(compareByInherit(x, x)).toBe(0);
  });

  it('falls through to the pair total before the indices', () => {
    const rich = pair([0.2, 0.2], { pairTotal: 250, a: 3, b: 9 });
    const poor = pair([0.2, 0.2], { pairTotal: 100, a: 0, b: 1 });
    expect(order([poor, rich])[0]).toBe(rich);
  });
});
