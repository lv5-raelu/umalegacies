import type {
  FilterScope,
  PackageSpark,
  ResolvedVeteran,
  SparkCriterion,
} from '@umalegacies/types';

/**
 * Which members of a package a scope looks at, as indices into
 * `PackageSpark.stars` -- [the veteran itself, its slot 10, its slot 20].
 *
 * These are uma.moe's own scopes. Their selector reads All / Main Parent /
 * Great Parent 1 / Great Parent 2, and the two that matter are the same two this
 * project's M7 section specified independently: lineage-wide totals versus a
 * requirement pinned to the direct parent. The two great-parent slots are merged
 * into one `grandparents` scope here because which of a veteran's own parents is
 * "first" is an accident of the save's ordering, not something a user chooses.
 *
 * Why the direct parent is worth its own scope: a parent's spark is far likelier
 * to be inherited than a grandparent's. Measured across the builder's roster,
 * parent Individual Affinity has median 138 against a grandparent median of 36,
 * and the activation rate is base x (1 + IA/100).
 */
const SCOPE_MEMBERS: Readonly<Record<FilterScope, readonly number[]>> = {
  package: [0, 1, 2],
  parent: [0],
  grandparents: [1, 2],
};

/** Stars this package carries for one spark, within one scope. */
export function starsInScope(spark: PackageSpark, scope: FilterScope): number[] {
  return SCOPE_MEMBERS[scope].map((i) => spark.stars[i] ?? 0);
}

/**
 * Does one veteran satisfy one criterion?
 *
 * SPLIT is the second dimension and it is not cosmetic. "6 stars of Stamina"
 * met by the package summing is a different requirement from 6 stars met by one
 * uma alone, and a spark caps at 3 stars per uma, so `single` with a threshold
 * above 3 is unsatisfiable by anyone. The UI is responsible for not offering it.
 */
export function matchesCriterion(veteran: ResolvedVeteran, criterion: SparkCriterion): boolean {
  const spark = veteran.sparks.find((s) => s.groupId === criterion.groupId);
  if (!spark) return false;
  const stars = starsInScope(spark, criterion.scope);
  const measured = criterion.split === 'sum' ? sum(stars) : Math.max(...stars, 0);
  return measured >= criterion.minStars;
}

export const filterVeterans = (
  veterans: readonly ResolvedVeteran[],
  criterion: SparkCriterion | null,
): ResolvedVeteran[] =>
  criterion === null ? [...veterans] : veterans.filter((v) => matchesCriterion(v, criterion));

const sum = (ns: readonly number[]): number => ns.reduce((total, n) => total + n, 0);

/**
 * The most stars any ONE uma can carry of one spark. The game's cap, and the
 * reason a `single` criterion above it can never be met.
 */
export const MAX_STARS_PER_UMA = 3;

/**
 * Why a veteran cannot be picked right now, or null if it can.
 *
 * Two rules, and the second is a rule of the GAME rather than of this screen:
 *
 * 1. Two parents is the whole lineage. A third pick is refused rather than
 *    silently evicting one, so swapping is unselect-then-select.
 * 2. **The two parents cannot be the same uma**, whatever costume each is
 *    wearing. Oguri Cap [Starlight Beat] and Oguri Cap [Ashen Miracle] are two
 *    cards of one character, so they cannot fill both parent slots -- the
 *    comparison is by `charaId`, never by `cardId`, because card equality would
 *    wave the pair through on a costume change.
 *
 * An unresolved member has a null `charaId`. It is never blocked by this rule:
 * we cannot show it is the same character, and refusing a pick on a lookup
 * failure would punish the user for a stale master extract.
 */
export type PickBlock = 'pair-full' | 'same-uma';

export function pickBlock(
  veteran: ResolvedVeteran,
  picked: readonly ResolvedVeteran[],
): PickBlock | null {
  if (picked.some((p) => p.index === veteran.index)) return null;
  if (picked.some((p) => sameUma(p, veteran))) return 'same-uma';
  if (picked.length >= 2) return 'pair-full';
  return null;
}

const sameUma = (a: ResolvedVeteran, b: ResolvedVeteran): boolean =>
  a.self.charaId !== null && a.self.charaId === b.self.charaId;
