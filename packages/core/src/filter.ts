import type {
  FilterScope,
  PackageSpark,
  ResolvedVeteran,
  SparkCriterion,
  SparkKind,
} from '@umalegacies/types';
import { isWhite } from './spark-types.js';

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
  'one-parent': [0],
};

/**
 * How a scope's members combine, and how the two halves of a pair combine.
 *
 * ONE ANSWER FOR BOTH, deliberately. `package` and `parent` add up, within a
 * half and across the pair. `one-parent` takes the better, within a half and
 * across the pair -- which on a pair means the better of the two direct
 * parents, and is the whole reason the scope exists: summing cannot ask for
 * three stars on a SINGLE uma, because 3+0 and 2+1 look identical to it.
 */
const SCOPE_COMBINE: Readonly<Record<FilterScope, 'sum' | 'max'>> = {
  package: 'sum',
  parent: 'sum',
  'one-parent': 'max',
};

const combine = (scope: FilterScope, values: readonly number[]): number =>
  SCOPE_COMBINE[scope] === 'max'
    ? values.reduce((best, n) => (n > best ? n : best), 0)
    : values.reduce((total, n) => total + n, 0);

/**
 * What a criterion is being asked about: ONE veteran's package, or a PAIR of
 * them. A package is three umas and a pair is six, so every ceiling doubles.
 *
 * Two axes, and they are not the same one. `scope` says which members of a half
 * are counted -- the direct parent only, or all three. `subject` says how many
 * halves there are. `scope: 'package'` and `subject: 'package'` share a word and
 * mean different things: `maxStarsFor('package', 'package')` is "the lineage
 * scope, on one veteran" and reads 9.
 */
export type StarSubject = 'package' | 'pair';

const SUBJECT_HALVES: Readonly<Record<StarSubject, number>> = {
  package: 1,
  pair: 2,
};

/**
 * The most stars a criterion can possibly ask for: three per uma, times the
 * members the scope counts, times the halves the subject has.
 *
 * ```
 *                 subject: package   subject: pair
 *   scope parent               3               6
 *   scope package              9              18
 * ```
 *
 * It is the ceiling the star selector offers, which is how a requirement nobody
 * can meet stops being expressible at all rather than being warned about after
 * the fact.
 *
 * `subject` IS REQUIRED ON PURPOSE. One `SparkCriterion` type drives both the
 * roster list and the pair search, so the same stored `minStars` means different
 * things depending on which surface reads it -- and a caller that forgot which
 * one it was would silently read a ceiling half or double the right size, with
 * nothing on screen to say so. A default would make that a runtime bug; a
 * required argument makes it `TS2554` at the call site.
 */
export const maxStarsFor = (scope: FilterScope, subject: StarSubject): number => {
  const perHalf = SCOPE_MEMBERS[scope].length * MAX_STARS_PER_UMA;
  // A `max` scope does not grow with the subject: the better of two parents is
  // still one uma, and one uma carries three stars of a spark at most. Only a
  // summing scope doubles when the subject is a pair.
  return SCOPE_COMBINE[scope] === 'max' ? perHalf : perHalf * SUBJECT_HALVES[subject];
};

/**
 * Does this criterion have to be MET, or does it only rank?
 *
 * THE LEVER THAT MAKES THE SWEEP AFFORDABLE. Hard constraints are what prune:
 * on the builder's roster "Stamina >= 12 AND Medium >= 4" leaves 25 of 33,411
 * pairs, 0.07%. A criterion that only ranks prunes nothing, so a whites-only
 * search -- the builder's own stated target is four whites and no blues or
 * pinks -- scores the whole space. That made the full sweep the normal path
 * rather than the tail, and it is why the user gets a per-criterion toggle
 * rather than the tool guessing.
 *
 * BLUE, PINK AND GREEN IGNORE THE FLAG. Every ancestor carries exactly one of
 * each, so naming one is always a claim that can be checked and always worth
 * pruning on. `mustHave` on a blue is redundant, not wrong, and this function
 * is the reason no caller has to remember that.
 *
 * WHITES DEFAULT TO RANKING. There are 231 distinct white types on a real
 * roster; requiring all of them at once returns nothing almost always. The
 * original rule was that whites can NEVER be requirements, and it was reversed
 * on 2026-09-18 for the latency reason above -- but the rationale behind it is
 * exactly why the promotion is per-criterion and off by default.
 *
 * The kind comes from the catalogue (`RosterSparkOption.kind`), not from the
 * criterion: a criterion is a groupId and a threshold, and denormalising the
 * kind onto it would put a second copy of the catalogue in the persisted
 * selection.
 */
export function isRequirement(criterion: SparkCriterion, kind: SparkKind): boolean {
  return !isWhite(kind) || criterion.mustHave === true;
}

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
  return combine(criterion.scope, starsInScope(spark, criterion.scope)) >= criterion.minStars;
}

/**
 * Stars a PAIR carries for one spark, within one scope.
 *
 * The two halves SUM. That is the whole difference from `starsInScope`, and it
 * is the difference the search exists for: a pair holding 6 Stamina as 3+3 has
 * six of them, even though neither half alone has more than three.
 *
 * A HALF THAT LACKS THE SPARK CONTRIBUTES ZERO, NOT A FAILURE. This is where a
 * pair predicate built out of `matchesCriterion` would have gone wrong in a way
 * no type could catch: that function answers "does this ONE package meet the
 * whole requirement" and returns false the moment the spark is absent. `&&` over
 * two halves would demand each half meet the full threshold; `||` would accept a
 * pair on one half's strength while ignoring the other's. Neither is the
 * question. The question is what the six ancestors carry between them.
 *
 * Scope still decides which members of each half count, so on a pair `parent`
 * reads slots 10 and 20 -- the two veterans themselves -- and `package` reads
 * all six ancestors.
 */
export function starsInPair(
  a: ResolvedVeteran,
  b: ResolvedVeteran,
  groupId: number,
  scope: FilterScope,
): number {
  return combine(scope, [starsInHalf(a, groupId, scope), starsInHalf(b, groupId, scope)]);
}

const starsInHalf = (veteran: ResolvedVeteran, groupId: number, scope: FilterScope): number => {
  const spark = veteran.sparks.find((s) => s.groupId === groupId);
  return spark === undefined ? 0 : combine(scope, starsInScope(spark, scope));
};

/**
 * Does this PAIR satisfy one criterion?
 *
 * The sweep's per-criterion test, and the pair-shaped twin of
 * `matchesCriterion`. Which criteria are even asked this question is
 * `isRequirement`'s call, not this one's: a white that only ranks is still
 * measured, it just does not exclude.
 */
export function matchesPair(
  a: ResolvedVeteran,
  b: ResolvedVeteran,
  criterion: SparkCriterion,
): boolean {
  return starsInPair(a, b, criterion.groupId, criterion.scope) >= criterion.minStars;
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
 *
 * THIS DOES NOT CONSULT `isRequirement`, AND THAT IS DELIBERATE. Here every
 * criterion is a requirement, including an un-promoted white. `mustHave`
 * distinguishes pruning from ranking, and a LIST has nothing to rank with --
 * it either shows a row or it does not. Honouring the flag here would mean an
 * un-promoted white stopped filtering at all, which deletes the roster
 * filter's main use: a veteran carries 12-19 whites and the only question a
 * white answers is whether one of them is the one you want.
 *
 * So one `SparkCriterion` still means two things depending on who reads it,
 * the same way `minStars` does across the two ceilings. The sweep is the
 * surface where soft means something; T10 decides whether the search's control
 * and the list's control are even the same control.
 */
export const filterVeterans = (
  veterans: readonly ResolvedVeteran[],
  criteria: readonly SparkCriterion[],
): ResolvedVeteran[] =>
  criteria.length === 0
    ? [...veterans]
    : veterans.filter((v) => criteria.every((c) => matchesCriterion(v, c)));


/**
 * WHAT THE PAIR WILL NOT ACCEPT, in one place.
 *
 * Three rules, and only the first two are rules of the GAME. The third belongs
 * to the screen, which is the whole reason this section exists in this shape.
 *
 * 1. **A parent cannot be the trainee.** You are not your own parent. Note the
 *    narrowness: this blocks the PARENT slot only. The trainee's character may
 *    still appear as a grandparent -- fixture 5774 is exactly that, and the
 *    engine models it deliberately, suppressing the base term while the bonus
 *    survives. So a veteran whose own mother is the trainee is still a perfectly
 *    good parent; only the veteran itself is barred.
 * 2. **The two parents cannot be the same uma**, whatever costume each wears.
 *    Settled empirically against 2,500 real records -- see `TODOS.md` #4.
 * 3. Two parents is the whole lineage. A third pick is refused rather than
 *    silently evicting one, so swapping is unselect-then-select. THE GAME HAS
 *    NO OPINION ABOUT THIS ONE; it is about a list the UI accumulates, and it
 *    can never fire during a sweep.
 *
 * Every comparison is by `charaId`, never `cardId`: two costumes of one
 * character are still one character, and card equality would wave through
 * precisely the cases these rules exist for.
 *
 * An unresolved member has a null `charaId` and is never blocked by the identity
 * rules. We cannot show it is the same character, and refusing a pick on a
 * lookup failure would punish the user for a stale master extract.
 *
 * TWO READERS, ONE COPY OF THE RULES. `pickBlock` answers "why can the user not
 * click this card right now" and `isLegalPair` answers "may these two be the
 * parents". They cannot be one function -- one needs a reason for a tooltip,
 * the other needs a boolean it can run 33,411 times without allocating -- so
 * rules 1 and 2 are named below and both read them, with a test asserting the
 * two never disagree.
 */
export type PickBlock = 'is-trainee' | 'same-uma' | 'pair-full';

/** Rule 1: a parent cannot be the trainee. Compared by character, not card. */
const isTrainee = (veteran: ResolvedVeteran, traineeCharaId: number | null): boolean =>
  isChara(veteran, traineeCharaId);

/** Rule 2: the two parents cannot be the same character, whatever costume each wears. */
const sameCharacter = (a: ResolvedVeteran, b: ResolvedVeteran): boolean =>
  isChara(a, b.self.charaId);

/**
 * May these two veterans be the parents of this trainee?
 *
 * THE SWEEP'S PREDICATE. `pickBlock` answers a different question -- "why can
 * the user not click this card right now" -- and carries two branches that
 * belong to the screen rather than to the game: an already-picked card is left
 * clickable so it can be unselected, and a third pick is refused because the UI
 * holds an accumulating list. Neither can fire in a sweep, which has no list and
 * no clicks, and the review called that the wrong shape for 33,411 iterations.
 *
 * So this takes exactly two veterans, allocates nothing, and returns a boolean.
 *
 * THE INDEX CHECK IS NOT REDUNDANT. A sweep over unordered pairs never hands
 * the same entry in twice, so it looks unreachable -- but it is the only thing
 * standing between `isLegalPair(v, v, t)` and `true` when `v` is an UNRESOLVED
 * card. Two null `charaId`s are deliberately not "the same character" (see
 * below), so rule 2 waves that through. One veteran cannot be both parents
 * whether or not we managed to look it up, and a predicate that is only correct
 * for the inputs its current caller happens to produce is a trap for the next
 * caller.
 *
 * AN UNRESOLVED CARD IS NEVER BLOCKED BY THE IDENTITY RULES. `charaId` is null
 * when the master extract has no such card. We cannot SHOW that two such cards
 * are one character, and refusing a pair on a lookup failure would punish the
 * user for a stale extract rather than for anything about their roster.
 */
export function isLegalPair(
  a: ResolvedVeteran,
  b: ResolvedVeteran,
  traineeCharaId: number | null,
): boolean {
  if (a.index === b.index) return false;
  if (isTrainee(a, traineeCharaId) || isTrainee(b, traineeCharaId)) return false;
  return !sameCharacter(a, b);
}

/**
 * Why a veteran cannot be picked right now, or null if it can.
 *
 * Re-expressed over the rules above, so the screen and the sweep cannot drift.
 * What stays here is only what the SCREEN adds: an ordering chosen for how
 * actionable each reason is, and the two branches the game has no opinion about.
 */
export function pickBlock(
  veteran: ResolvedVeteran,
  picked: readonly ResolvedVeteran[],
  traineeCharaId: number | null,
): PickBlock | null {
  // Not a rule: the already-picked card stays clickable so it can be
  // unselected. It is reported first even when the trainee changed underneath
  // it, or the pair could be stuck in a state the rules forbid.
  if (picked.some((p) => p.index === veteran.index)) return null;
  // Ordered by how actionable the reason is. "Unselect one to swap it" is
  // useless advice for a card that can never be a parent at all.
  if (isTrainee(veteran, traineeCharaId)) return 'is-trainee';
  if (picked.some((p) => sameCharacter(veteran, p))) return 'same-uma';
  // Also not a rule: the game has no opinion about a third click, the UI does.
  if (picked.length >= 2) return 'pair-full';
  return null;
}

const isChara = (veteran: ResolvedVeteran, charaId: number | null): boolean =>
  charaId !== null && veteran.self.charaId === charaId;
