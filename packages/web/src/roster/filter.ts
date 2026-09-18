import type {
  FilterScope,
  PackageSpark,
  ResolvedVeteran,
  SparkCriterion,
} from '@umalegacies/types';

/** The most stars any ONE uma can carry of one spark. The game's cap. */
export const MAX_STARS_PER_UMA = 3;

/**
 * Which members of a package a scope looks at, as indices into
 * `PackageSpark.stars` -- [the veteran itself, its slot 10, its slot 20].
 *
 * Lineage-wide totals versus a requirement pinned to the direct parent, which is
 * what this project's M7 section specified. A grandparents-only scope existed
 * and was removed: two criteria express it better, since "3 on the parent AND 5
 * across the lineage" pins two stars onto the grandparents and says what the
 * parent must carry at the same time.
 */
const SCOPE_MEMBERS: Readonly<Record<FilterScope, readonly number[]>> = {
  package: [0, 1, 2],
  parent: [0],
};

/**
 * The most stars a scope can possibly hold: three per uma, and the lineage scope
 * spans three umas. It is the ceiling the star selector offers, which is how a
 * requirement nobody can meet stops being expressible at all.
 */
export const maxStarsFor = (scope: FilterScope): number =>
  SCOPE_MEMBERS[scope].length * MAX_STARS_PER_UMA;

/** Stars this package carries for one spark, within one scope. */
export function starsInScope(spark: PackageSpark, scope: FilterScope): number[] {
  return SCOPE_MEMBERS[scope].map((i) => spark.stars[i] ?? 0);
}

/**
 * Does one veteran satisfy one criterion?
 *
 * The scope's members always SUM. A separate "on one uma alone" split used to
 * sit beside the scope and is gone: under `parent` the scope is a single uma, so
 * sum and max were the same number, and under `package` the split re-asked the
 * scope's own question. What it could express -- "3 of these must be on one
 * uma" -- is now a second row with `parent` scope.
 */
export function matchesCriterion(veteran: ResolvedVeteran, criterion: SparkCriterion): boolean {
  const spark = veteran.sparks.find((s) => s.groupId === criterion.groupId);
  if (!spark) return false;
  return sum(starsInScope(spark, criterion.scope)) >= criterion.minStars;
}

/**
 * Every criterion must hold. AND, not OR, and that is the question people
 * actually ask: "who can give me the blue I need AND a decent pink". An OR over
 * the same rows is the weaker query you can already run by filtering one spark
 * at a time.
 *
 * It is also what the design doc specifies for M7's hard constraints --
 * "Stamina >= 12 AND Medium >= 4", satisfied by 25 of 33,411 own-pairs on the
 * builder's roster. Filtering the 259-veteran list is the same predicate
 * applied to one package instead of a pair, so the two agree by construction
 * rather than by coincidence.
 *
 * An empty list is not a filter. It returns everything rather than nothing,
 * because "no requirements" and "impossible requirements" are different
 * questions and only one of them is what an empty row set means.
 */
export const filterVeterans = (
  veterans: readonly ResolvedVeteran[],
  criteria: readonly SparkCriterion[],
): ResolvedVeteran[] =>
  criteria.length === 0
    ? [...veterans]
    : veterans.filter((v) => criteria.every((c) => matchesCriterion(v, c)));

const sum = (ns: readonly number[]): number => ns.reduce((total, n) => total + n, 0);

/**
 * Why a veteran cannot be picked right now, or null if it can.
 *
 * Three rules, and two of them are rules of the GAME rather than of this screen.
 *
 * 1. **A parent cannot be the trainee.** You are not your own parent. Note the
 *    narrowness: this blocks the PARENT slot only. The trainee's character may
 *    still appear as a grandparent -- fixture 5774 is exactly that, and the
 *    engine models it deliberately, suppressing the base term while the bonus
 *    survives. So a veteran whose own mother is the trainee is still a perfectly
 *    good parent; only the veteran itself is barred.
 * 2. **The two parents cannot be the same uma**, whatever costume each wears.
 * 3. Two parents is the whole lineage. A third pick is refused rather than
 *    silently evicting one, so swapping is unselect-then-select.
 *
 * Every comparison is by `charaId`, never `cardId`: two costumes of one
 * character are still one character, and card equality would wave through
 * precisely the cases these rules exist for.
 *
 * An unresolved member has a null `charaId` and is never blocked by the identity
 * rules. We cannot show it is the same character, and refusing a pick on a
 * lookup failure would punish the user for a stale master extract.
 */
export type PickBlock = 'is-trainee' | 'same-uma' | 'pair-full';

export function pickBlock(
  veteran: ResolvedVeteran,
  picked: readonly ResolvedVeteran[],
  traineeCharaId: number | null,
): PickBlock | null {
  if (picked.some((p) => p.index === veteran.index)) return null;
  // Ordered by how actionable the reason is. "Unselect one to swap it" is
  // useless advice for a card that can never be a parent at all.
  if (isChara(veteran, traineeCharaId)) return 'is-trainee';
  if (picked.some((p) => isChara(veteran, p.self.charaId))) return 'same-uma';
  if (picked.length >= 2) return 'pair-full';
  return null;
}

const isChara = (veteran: ResolvedVeteran, charaId: number | null): boolean =>
  charaId !== null && veteran.self.charaId === charaId;
