import type { ResolvedVeteran, SparkCriterion, SparkKind } from '@umalegacies/types';
import { isRequirement, starsInScope } from '@umalegacies/core';

/**
 * THE READER'S FILTER, IN uma.moe's VOCABULARY -- AND ONLY AS MUCH OF IT AS IS
 * PROVABLY SAFE TO SEND.
 *
 * WHY ANY OF THIS. The borrow pool is 10,000+ records. Pulling it whole is
 * ~21 MB for a question their server can answer in one query, and sweeping it
 * whole is 259 own veterans x 10,000 borrowed = 2.6M pairs. So the filter has
 * to travel. The danger is that it travels WRONG.
 *
 * ======================================================================
 * THE SOUNDNESS ARGUMENT, WHICH IS THE ENTIRE DESIGN
 * ======================================================================
 *
 * A criterion describes a PAIR -- six ancestors. uma.moe filters ONE borrowed
 * veteran -- three. Those are different questions, and the naive translation
 * answers the wrong one.
 *
 * "Stamina >= 12 across the lineage" is a pair requirement. A borrowed half
 * carries at most 9, so sending `>= 12` to their server asks for something no
 * single record can have and returns nothing. Sending `>= 12` is not merely
 * over-tight, it is WRONG in the direction that cannot be noticed: the pool
 * comes back small or empty and the reader is told no pair exists, when the
 * pairs were there and we declined to ask for them.
 *
 * So a server-side filter may only ever express a NECESSARY condition: a
 * borrowed half that fails it cannot appear in any qualifying pair. Every
 * borrowed half that survives this filter is then scored locally by the SAME
 * `matchesPair` the own-roster sweep uses, which is what actually decides. This
 * is a prefilter, never the answer.
 *
 * THE BOUND, PER SCOPE. The pair is one own veteran and one borrowed one.
 *
 *   'package' (across the lineage), combines by SUM across the pair.
 *       pair = own + borrowed >= N, and own is at most the best any veteran in
 *       THIS roster actually carries. So borrowed >= N - maxOwn.
 *       Not N - 9: using the roster's real best is both sound and tighter,
 *       because a roster with no Stamina at all makes the filter the full N.
 *
 *   'parent' (on the direct parent), also SUM, but over one uma per half.
 *       borrowed_self >= N - maxOwnSelf, ceiling 3.
 *
 *   'one-parent' (on ONE parent), combines by MAX.
 *       max(own_self, borrowed_self) >= N. If ANY own veteran already reaches N
 *       alone, every borrowed half is admissible and NOTHING may be sent --
 *       this is the scope where the obvious translation is unsound, because a
 *       max is satisfied by either side and a filter on one side assumes both.
 *
 * WHITES THAT ONLY RANK ARE NOT SENT AT ALL. `isRequirement` is the same gate
 * the local sweep prunes on: a white without `mustHave` is a preference, and a
 * pair that lacks it still qualifies. Pushing it would delete candidates the
 * local sweep would have kept and ranked, which is the same silent loss in a
 * different costume. Read through `isRequirement` rather than reimplemented, so
 * the two cannot drift.
 *
 * `excludeFromOdds` IS IGNORED HERE, deliberately. It changes what the row
 * reports, never what qualifies -- so a criterion the reader excluded from the
 * odds still filters, here exactly as locally.
 *
 * ======================================================================
 * THEIR VOCABULARY, MEASURED 2026-09-29
 * ======================================================================
 *
 * Their spark ids are `groupId * 100 + stars`, and a filter value is an EXACT
 * match on that sum, not a minimum -- counts are not monotone in the star
 * digit, because 3+3+3 is what people build:
 *
 *     blue_sparks=207  289      blue_sparks=208  366      blue_sparks=209  542
 *
 * A comma-separated list is OR and an exactly additive one; a repeated key is
 * AND:
 *
 *     blue_sparks=207,209              831   == 289 + 542
 *     blue_sparks=207&blue_sparks=209    0   an impossible conjunction
 *
 * So `>= m` is the OR list `m..ceiling`, and several criteria are several
 * repeated keys. The same holds on the main-parent fields: 102 + 244 + 266 =
 * 612, checked.
 *
 * ======================================================================
 * THE PREFILTER IS WEAK ON A STRONG ROSTER, AND ORDER IS WHAT CARRIES IT
 * ======================================================================
 *
 * Measured on the builder's real 260-veteran roster, asking for Stamina >= 12,
 * Medium >= 6 and a must-have Uma Stan >= 6: two of the three criteria dropped
 * out as `own-roster-covers-it` and the third came down to "the borrowed half
 * needs 3 Stamina". The pool stayed at "over 10000".
 *
 * That is not a bug in the bound, it is the bound being honest. A strong roster
 * can supply most of any requirement itself, so very little is NECESSARILY
 * demanded of the borrowed half -- and a prefilter may only ever express what
 * is necessary. The tightest sound single query is the per-criterion maximum
 * over the roster, and on a good roster that is close to no filter at all.
 *
 * So the pool stays large and we take a slice. WHICH slice turned out to matter
 * far more than the filter did. Same filter, same 1,000 records fetched, four
 * orderings:
 *
 *     arbitrary (sort_by=last_updated asc)      26 qualifying pairs, best 352
 *     their default order                      221 qualifying pairs, best 428
 *     default + player_chara_id = our trainee  337 qualifying pairs, best 428
 *     sort_by=white_stars_sum desc             247 qualifying pairs, best 417
 *
 * Thirteen times as many usable pairs from the same number of records. Their
 * default sort is `affinity_score` descending, and `player_chara_id` makes that
 * score relative to OUR trainee instead of nobody, so it is set here always.
 *
 * THEIR AFFINITY IS NOT OUR NUMBER and is never treated as one. Ours is base
 * plus bonus over seven links including grandparents, with a derivation the
 * compare pane can show; theirs is a single figure we do not compute. It is
 * used for exactly one thing -- deciding what to look at FIRST -- and every
 * record fetched is then scored by our own engine, which is what ranks.
 *
 * `optional_white_sparks` IS NOT USABLE. The spec calls it "Preferred white
 * sparks (soft filter)", which is precisely the whites-that-rank case. It
 * returns 0 results for any value, alone or in a list, against a query that
 * otherwise returns "over 10000". Documented here so the next reader does not
 * spend the afternoon finding it again.
 */

/** The most stars one uma can carry of one spark. */
const PER_UMA = 3;

/** ...so three umas, which is a borrowed half's whole lineage. */
const PER_PACKAGE = PER_UMA * 3;

/** Their lineage-wide fields. All three white kinds share one bucket. */
const LINEAGE_FIELD: Readonly<Record<SparkKind, string>> = {
  blue: 'blue_sparks',
  pink: 'pink_sparks',
  green: 'green_sparks',
  white_skill: 'white_sparks',
  white_race: 'white_sparks',
  white_scenario: 'white_sparks',
};

/**
 * Their direct-parent fields.
 *
 * `main_parent_white_sparks` and `main_white_factors` are aliases -- both
 * returned 323 on the same query -- and the first is used because it matches
 * the other three names.
 */
const MAIN_FIELD: Readonly<Record<SparkKind, string>> = {
  blue: 'main_parent_blue_sparks',
  pink: 'main_parent_pink_sparks',
  green: 'main_parent_green_sparks',
  white_skill: 'main_parent_white_sparks',
  white_race: 'main_parent_white_sparks',
  white_scenario: 'main_parent_white_sparks',
};

/** Why a criterion did not travel. Each is a reason the reader can be told. */
export type NotSentReason =
  /** A white the reader did not promote. It ranks; it does not require. */
  | 'ranks-only'
  /** The catalogue has no kind for this group, so no field can be chosen. */
  | 'unknown-spark'
  /** The roster's own best already meets it, so every borrowed half qualifies. */
  | 'own-roster-covers-it'
  /** A `one-parent` max that one of the reader's own veterans satisfies alone. */
  | 'either-half-can-satisfy-it';

export interface SentFilter {
  groupId: number;
  field: string;
  /** What the BORROWED half must carry, after the own roster's share. */
  minBorrowedStars: number;
  /** The reader's original threshold, for the pair. */
  pairMinStars: number;
  values: number[];
}

export interface BorrowQuery {
  params: URLSearchParams;
  /** What travelled, and what each one narrowed to. */
  sent: SentFilter[];
  /** What stayed home, with the reason. Not a failure: mostly it is correctness. */
  notSent: Array<{ groupId: number; reason: NotSentReason }>;
  /**
   * True when some criterion cannot be met by ANY pair: the roster's best plus
   * a perfect borrowed half still falls short. Worth saying before fetching a
   * pool that is guaranteed to disappoint.
   */
  impossible: boolean;
}

/**
 * The most stars any ONE of the reader's veterans carries for this group, in
 * this scope. Zero when nobody has it, which makes the filter the full
 * threshold rather than weakening it.
 *
 * Read through `starsInScope` so "which members does a scope count" has exactly
 * one definition. A `parent` or `one-parent` scope yields a single member, so
 * summing is that member.
 */
function bestOwn(
  own: readonly ResolvedVeteran[],
  groupId: number,
  scope: SparkCriterion['scope'],
): number {
  let best = 0;
  for (const veteran of own) {
    const spark = veteran.sparks.find((s) => s.groupId === groupId);
    if (!spark) continue;
    const here = starsInScope(spark, scope).reduce((sum, n) => sum + n, 0);
    if (here > best) best = here;
  }
  return best;
}

/**
 * The reader's filter as a uma.moe query, plus an account of what was left out.
 *
 * @param own  the roster the borrowed half will be paired WITH. THE BOUND
 *   DEPENDS ON IT: a pair is one own veteran and one borrowed one, so how much
 *   the borrowed half must carry is whatever the reader's best cannot supply.
 *   An empty roster makes every filter the full threshold, which is sound and
 *   simply not narrow.
 * @param kindOf  from the catalogue, because a criterion is a group and a
 *   threshold and denormalising the kind onto it would put a second copy of the
 *   catalogue in the persisted selection.
 */
export function borrowQuery({
  criteria,
  own,
  kindOf,
  traineeCharaId,
}: {
  criteria: readonly SparkCriterion[];
  own: readonly ResolvedVeteran[];
  kindOf: (groupId: number) => SparkKind | undefined;
  /**
   * Who is being trained. Not a filter -- it changes nothing about which
   * records qualify -- but it reorders them, and on a pool that stays above
   * the display cap the order decides which slice we get to see at all.
   */
  traineeCharaId: number | null;
}): BorrowQuery {
  const params = new URLSearchParams();
  // Their default sort is affinity descending; this is what that affinity is
  // measured AGAINST. Without it the pool is ordered by a relevance to nobody.
  if (traineeCharaId !== null) params.set('player_chara_id', String(traineeCharaId));
  const sent: SentFilter[] = [];
  const notSent: BorrowQuery['notSent'] = [];
  let impossible = false;

  for (const criterion of criteria) {
    const kind = kindOf(criterion.groupId);
    if (kind === undefined) {
      notSent.push({ groupId: criterion.groupId, reason: 'unknown-spark' });
      continue;
    }
    // The same gate the local sweep prunes on, called rather than copied.
    if (!isRequirement(criterion, kind)) {
      notSent.push({ groupId: criterion.groupId, reason: 'ranks-only' });
      continue;
    }

    const lineage = criterion.scope === 'package';
    const ceiling = lineage ? PER_PACKAGE : PER_UMA;
    const field = (lineage ? LINEAGE_FIELD : MAIN_FIELD)[kind];
    const mine = bestOwn(own, criterion.groupId, criterion.scope);

    /*
     * A `max` scope is satisfied by EITHER half, so one own veteran reaching
     * the threshold alone admits every borrowed half there is. This is the one
     * case where the obvious subtraction is unsound rather than merely loose.
     */
    if (criterion.scope === 'one-parent' && mine >= criterion.minStars) {
      notSent.push({ groupId: criterion.groupId, reason: 'either-half-can-satisfy-it' });
      continue;
    }

    // A max scope takes nothing from the own half; a sum scope takes its best.
    const need = criterion.scope === 'one-parent'
      ? criterion.minStars
      : criterion.minStars - mine;

    if (need <= 0) {
      notSent.push({ groupId: criterion.groupId, reason: 'own-roster-covers-it' });
      continue;
    }
    if (need > ceiling) {
      // Even a perfect borrowed half falls short, so no pair can qualify. Said
      // rather than sent: an empty result would look like an empty pool.
      impossible = true;
      continue;
    }

    const values: number[] = [];
    for (let stars = need; stars <= ceiling; stars++) {
      values.push(criterion.groupId * 100 + stars);
    }
    // append, never set: a repeated key is their AND, and two criteria can
    // legitimately land on the same field.
    params.append(field, values.join(','));
    sent.push({
      groupId: criterion.groupId,
      field,
      minBorrowedStars: need,
      pairMinStars: criterion.minStars,
      values,
    });
  }

  return { params, sent, notSent, impossible };
}
