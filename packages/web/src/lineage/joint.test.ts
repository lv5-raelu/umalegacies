import { describe, expect, it } from 'vitest';
import { jointOdds } from './joint';

/**
 * The number that turns four encouraging rows into one honest one.
 *
 * The failure this exists to prevent is not a wrong percentage, it is a reader
 * looking at four sparks at 40% and coming away believing the build is likely.
 */

describe('every requirement, together', () => {
  it('multiplies, because the rolls are independent under this model', () => {
    expect(jointOdds([0.5, 0.5])).toBeCloseTo(0.25, 12);
    expect(jointOdds([0.4, 0.4, 0.4, 0.4])).toBeCloseTo(0.0256, 12);
  });

  it('is never larger than its smallest term', () => {
    // The property that makes it worth showing: adding a requirement can only
    // make a build less likely, never more.
    const terms = [0.9, 0.62, 0.31, 0.88];
    const joint = jointOdds(terms) as number;
    expect(joint).toBeLessThanOrEqual(Math.min(...terms));
  });

  it('is exactly the other term when one of them is certain', () => {
    // A blue on a parent is capped at 1.0, so it contributes nothing to the
    // joint and must not round it away either.
    expect(jointOdds([1, 0.37])).toBeCloseTo(0.37, 12);
  });

  it('stays 1 when everything is certain', () => {
    expect(jointOdds([1, 1, 1])).toBe(1);
  });
});

describe('a requirement that cannot be met', () => {
  it('is zero, not a term to skip', () => {
    // `null` is "this pair carries none of that spark". Skipping it would
    // answer how likely the OTHER sparks are, which is a different and much
    // more flattering question than the one on screen.
    expect(jointOdds([0.9, null])).toBe(0);
    expect(jointOdds([null, null])).toBe(0);
  });

  it('is zero when a term is zero', () => {
    expect(jointOdds([0.9, 0])).toBe(0);
  });

  it('is zero rather than NaN when a term is not a number', () => {
    // percent() has no NaN branch and would print the string "NaN%".
    expect(jointOdds([0.5, Number.NaN])).toBe(0);
    expect(jointOdds([0.5, Number.POSITIVE_INFINITY])).toBe(0);
  });
});

describe('when there is no joint worth stating', () => {
  it.each([
    ['no requirements', []],
    ['one requirement', [0.42]],
    ['one requirement that cannot be met', [null]],
  ])('says nothing about %s', (_label, terms) => {
    expect(jointOdds(terms as readonly (number | null)[])).toBeNull();
  });
});
