/**
 * The chance EVERY filtered spark arrives, not just one of them.
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
 * The one way it could be wrong is if the game couples sparks in a way the
 * model does not know about -- a hidden cap on how many fire per inspiration
 * would make these numbers optimistic. Nothing in the community research this
 * project is built on describes such a cap, and no fixture shows one.
 */

/**
 * @param perSpark one figure per requirement, in the order they were asked for.
 *                 `null` for a requirement this lineage cannot meet at all,
 *                 which is a certainty of failure rather than a missing number.
 * @returns the joint chance, or null when there is no joint worth stating.
 *
 * NULL FOR FEWER THAN TWO. With one requirement the joint IS that requirement,
 * and printing the same percentage twice under two different labels invites the
 * reader to look for the difference. With none there is nothing to combine.
 */
export function jointOdds(perSpark: readonly (number | null)[]): number | null {
  if (perSpark.length < 2) return null;

  let product = 1;
  for (const p of perSpark) {
    // A spark the lineage does not carry is a zero, not a gap to skip over.
    // Skipping it would answer "how likely are the ones that are present",
    // which is a different and much more flattering question.
    if (p === null || !Number.isFinite(p) || p <= 0) return 0;
    product *= p > 1 ? 1 : p;
  }
  return product;
}
