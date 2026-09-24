import { describe, expect, it } from 'vitest';
import { carriedCount, jointOdds } from './joint.js';

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

describe('a spark the pair does not carry', () => {
  /*
   * REVERSED 2026-09-24. This block used to assert the opposite -- that a null
   * zeroes the whole product -- and the reasoning was that skipping it answers
   * "how likely are the ones that are present", a more flattering question.
   *
   * What changed is that two other things now carry that weight. The sweep
   * ranks on COVERAGE before the product, so a pair missing a spark sorts below
   * every pair that has it whatever this returns; and the label beside the
   * figure names its own scope, "5 of 6 activate" rather than "all 6". Zeroing
   * meanwhile produced a column of 0% on every realistic whites-only search:
   * true, useless, and impossible to tell two rows apart by.
   */
  it('is left out of the product rather than failing it', () => {
    expect(jointOdds([0.9, 0.5, null])).toBeCloseTo(0.45, 12);
  });

  it('is not a joint at all when it leaves fewer than two terms', () => {
    // One present term IS that term; printing it twice under two labels invites
    // a hunt for a difference that is not there.
    expect(jointOdds([0.9, null])).toBeNull();
    expect(jointOdds([null, null])).toBeNull();
  });

  it('is counted, so the label can say how much it covered', () => {
    // The denominator lives beside the figure or the number reads as a claim
    // about the whole filter.
    expect(carriedCount([0.9, 0.5, null])).toBe(2);
    expect(carriedCount([null, null])).toBe(0);
    expect(carriedCount([0.9, 0.5])).toBe(2);
  });
});

describe('a term that is present and hopeless', () => {
  it('is zero, because that is an impossibility rather than an absence', () => {
    // The distinction the whole reversal turns on: "the pair has none of this
    // spark" is a gap, "the pair has it and it cannot fire" is a failure.
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
    ['one requirement the pair does not carry', [null]],
    ['two requirements, only one of them carried', [0.42, null]],
  ])('says nothing about %s', (_label, terms) => {
    expect(jointOdds(terms as readonly (number | null)[])).toBeNull();
  });
});
