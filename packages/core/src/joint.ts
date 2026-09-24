/**
 * The chance every filtered spark THIS PAIR CARRIES arrives, not just one of them.
 *
 * This is usually the question. A filter naming four whites is a build --
 * "After-School Stroll, Uma Stan, Nimble Navigator and Racing Spirit: Stamina"
 * is one plan, not four independent wishes -- and four rows of encouraging
 * per-spark odds add up to something much smaller than any of them. Four sparks
 * at 40% each is 2.6%, and nothing on the screen said so.
 *
 * WHY A PRODUCT. Under the model this tool already uses, every (carrier, spark)
 * pair rolls on its own: a spark activates at `base rate x (1 + IA/100)` and
 * nothing couples one spark's roll to another's, not even when the same
 * ancestor carries both. Two different sparks therefore depend on disjoint sets
 * of rolls, and their career outcomes multiply. This adds no assumption the
 * per-spark odds were not already making.
 *
 * A SPARK THE PAIR DOES NOT CARRY IS SKIPPED. REVERSED 2026-09-24, on the
 * builder's call, and the original rule is worth stating because it was right
 * at the time.
 *
 * It used to return 0 the moment any requirement came back null, on the
 * grounds that skipping it would answer "how likely are the ones that are
 * present" -- a different and much more flattering question. That reasoning
 * assumed the joint was the only thing ordering the list and the only thing
 * saying how complete a match was. Neither is true any more:
 *
 *   - the sweep now ranks on COVERAGE first and the product second, so a pair
 *     missing a spark already sorts below every pair that has it, whatever
 *     this returns;
 *   - the band prints an em dash against each spark the pair lacks, so the
 *     gap is visible in the row itself;
 *   - the label beside this figure names its scope -- "5 of 6 activate"
 *     rather than "all 6 activate" -- so it cannot be read as a claim about
 *     the whole filter.
 *
 * With all three in place, zeroing produced a column of 0% on every realistic
 * whites-only search: true, useless, and impossible to tell two rows apart by.
 * Skipping produces a number that discriminates, and the three things above
 * stop it flattering anyone.
 *
 * A term that is PRESENT and zero still zeroes the product. That is a real
 * impossibility rather than an absence, and the two must not be confused.
 */

/**
 * @param perSpark one figure per requirement, in the order they were asked for.
 *                 `null` where the pair carries none of that spark, which is an
 *                 absence and is left out rather than counted as a failure.
 * @returns the joint chance over the terms that are present, or null when there
 *          is no joint worth stating.
 *
 * NULL FOR FEWER THAN TWO PRESENT TERMS. With one the joint IS that
 * requirement, and printing the same percentage twice under two different
 * labels invites the reader to look for the difference. With none there is
 * nothing to combine.
 */
export function jointOdds(perSpark: readonly (number | null)[]): number | null {
  const present = perSpark.filter((p): p is number => p !== null);
  if (present.length < 2) return null;

  let product = 1;
  for (const p of present) {
    // Not NaN and not Infinity: `percent()` has no NaN branch and would print
    // the string "NaN%". A non-finite term is a bug upstream, and a zero here
    // is the honest way to surface it rather than propagate it.
    if (!Number.isFinite(p) || p <= 0) return 0;
    product *= p > 1 ? 1 : p;
  }
  return product;
}

/**
 * How many of the requirements the pair actually carries.
 *
 * The denominator for the label beside `jointOdds`. Kept here so the two can
 * never disagree about what "present" means.
 */
export function carriedCount(perSpark: readonly (number | null)[]): number {
  let n = 0;
  for (const p of perSpark) if (p !== null) n++;
  return n;
}
