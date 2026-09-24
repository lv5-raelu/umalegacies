import type {
  ExplainPairRequest,
  ResolvedVeteran,
  RosterVeteranInput,
  SparkCriterion,
  SparkKind,
  VeteranPackage,
} from '@umalegacies/types';
import { isLegalPair, isRequirement, matchesPair } from './filter.js';
import { inheritOnceInCareer } from './inherit.js';
import { jointOdds } from './joint.js';
import { lineageFromPair } from './pair.js';
import { explainLineage } from './lineage.js';
import type { MasterData } from './master-data.js';

/**
 * THE INVERSE QUERY. Given a trainee and a set of wanted sparks, which pair of
 * the user's veterans delivers them?
 *
 * Everything here is composition. `isLegalPair` (T4) decides which pairs the
 * game allows, `isRequirement` (T6) decides which criteria may exclude,
 * `matchesPair` (T5) applies them, and `explainLineage` plus `jointOdds` are the
 * same functions the compare pane calls after a result is picked. Nothing about
 * a number changes because it was reached by searching rather than by clicking;
 * that is the point of the whole `packages/core` extraction.
 *
 * PRUNE BEFORE SCORING, which is the only performance decision in this file and
 * the reason T6 exists. `matchesPair` reads two arrays; `explainLineage` builds
 * a whole lineage, resolves six ancestors and summarises ~50 sparks. Every pair
 * a requirement excludes is a pair that never reaches the expensive half.
 *
 * THIS RUNS IN THE BROWSER. Decided 2026-09-21 on measured grounds: the sweep is
 * a synchronous CPU loop, and a single Node process running it serves nobody
 * else while it does, so one person's search would freeze the app for everyone.
 * Every user brings their own CPU instead. Nothing in this file may name a Node
 * API -- `packages/core/tsconfig.json` sets `"types": []` so that is a compile
 * error rather than a surprise in a Vite build. T15 moves the call into a
 * worker so the page stays responsive; that is a hosting concern and none of
 * this changes for it.
 */

/** One scored pair. Deliberately small: a roster of 259 produces 30,808 of these. */
export interface PairSearchResult {
  /**
   * Indices into BOTH input arrays, always `a < b`.
   *
   * The pair is unordered, so a canonical order is what stops "Oguri x Gold
   * Ship" and "Gold Ship x Oguri" being two results. It is also the join back
   * to the roster: `ResolvedVeteran.index` is a position in the request array
   * and the packages are in that same order.
   */
  a: number;
  b: number;
  /**
   * The chance EVERY wanted spark arrives at least once across the career, or
   * null when there is no joint to state -- fewer than two requirements, which
   * is `jointOdds`' own rule rather than a special case here.
   */
  joint: number | null;
  /** One figure per criterion, in the order asked. null where the pair carries none. */
  perSpark: (number | null)[];
  /**
   * One INHERIT figure per criterion, in the same order: the chance the trainee
   * finishes a career carrying that spark, by way of the lineage.
   *
   * Null wherever the chain is not ours to compute -- the pair carries none of
   * it, or the criterion names anything other than a white skill, because a
   * race spark needs the trainee to win that G1 and a scenario spark needs the
   * scenario cleared. Computed here rather than on the screen because the
   * carrier count comes from the composed lineage, which only exists inside
   * this loop.
   */
  perSparkInherit: (number | null)[];
  /**
   * The chance EVERY wanted SKILL is inherited, or null when fewer than two of
   * the criteria produce a figure.
   *
   * A narrower claim than `joint`, over a subset of the same criteria, which is
   * why the surface that shows both says which sparks each one covers.
   */
  jointInherit: number | null;
  /** 7 base + 5 bonus, the figure the compare pane leads on. Breaks ranking ties. */
  pairTotal: number;
  /** The icon verdict, 1-9. Carried so a row can show it without re-explaining. */
  relationRank: number;
}

export interface PairSweepInput {
  /** Resolved for identity and stars. Index-aligned with `packages`. */
  veterans: readonly ResolvedVeteran[];
  /**
   * The slimmed save the browser still holds. Index-aligned with `veterans`.
   *
   * TWO ARRAYS RATHER THAN ONE OBJECT, because they carry different things and
   * the server deliberately does not echo the second: `ResolvedVeteran` has
   * names, charaIds and per-spark star counts but NOT `factorIds` or
   * `winSaddleIds`, since returning those for 777 umas made the resolve
   * response five times larger. The engine needs exactly the fields that were
   * left out.
   */
  packages: readonly RosterVeteranInput[];
  traineeCharaId: number;
  /** The costume being trained. Decides the portrait; changes no number. */
  traineeCardId?: number;
  /** In the order the user asked for them; `perSpark` comes back in that order. */
  criteria: readonly SparkCriterion[];
  /**
   * Keep only pairs that seat this uma in one of the two PARENT slots.
   *
   * A composition filter, not a spark one, and that distinction is the whole
   * point of it existing. Wanting Seiun Sky as a parent used to mean inventing
   * a spark criterion she happens to carry -- and that criterion then entered
   * the joint, so the odds on every row described a build the reader was not
   * asking about. This narrows which pairs EXIST and touches no figure.
   *
   * BY CARD, because a costume is not a skin. Cards of one `chara_id` carry
   * different unique skills and so different GREEN sparks, and a direct
   * parent's unique is handed to the trainee at career start -- so pinning
   * "Oguri Cap" without saying which costume would not answer which green the
   * run opens with. Aptitudes can differ too: Haru Urara's two cards are a step
   * apart on Mile.
   */
  requireParentCard?: number | null;
  /** The same, for the four GRANDPARENT slots. */
  requireGrandparentCard?: number | null;
  /**
   * The catalogue lookup. A criterion is a groupId and a threshold; whether it
   * may EXCLUDE depends on its kind, which lives in `RosterSparkOption`.
   *
   * An unknown groupId is treated as a white, i.e. the most permissive reading.
   * Excluding on a spark we cannot classify would silently shrink the user's
   * search because of a stale catalogue, which is the same reasoning that keeps
   * an unresolved card out of the identity rules.
   */
  kindOf: (groupId: number) => SparkKind | undefined;
  master: MasterData;
  masterHash: string;
  /**
   * Called every `PROGRESS_EVERY` legal pairs with how far along the sweep is.
   *
   * ADDED FOR T15, NOT BEFORE IT. T7 deliberately shipped without progress
   * because nothing consumed it; the worker is the first caller that does, and
   * a 1.5-second worst case behind a spinner with no movement is the thing it
   * exists to avoid.
   *
   * `considered` counts LEGAL pairs rather than scored ones, because scored is
   * a number nobody can predict in advance -- it depends on how much the
   * requirements prune -- and a progress bar needs a denominator. `total` is
   * the combination count, which is known before the loop starts.
   */
  onProgress?: (considered: number, total: number) => void;
}

/**
 * How often progress is reported, in legal pairs.
 *
 * A call per pair would dominate the loop it measures; 30,000 pairs at this
 * interval is about 60 calls, which is more than enough to move a bar smoothly
 * and few enough to disappear into the noise.
 */
const PROGRESS_EVERY = 512;

export interface PairSweep {
  /** Ranked best first. */
  results: PairSearchResult[];
  /** Pairs the game allows, before any criterion is applied. */
  legal: number;
  /** Of those, how many met every requirement and were scored. */
  scored: number;
}

export function sweepPairs(input: PairSweepInput): PairSweep {
  const { veterans, packages, traineeCharaId, criteria, kindOf, master, masterHash } = input;
  const requireParentCard = input.requireParentCard ?? null;
  const requireGrandparentCard = input.requireGrandparentCard ?? null;

  // Split once, not 30,808 times. Whites that only rank still get measured --
  // they just cannot exclude, so they have no business in the inner loop's
  // prune step.
  const requirements = criteria.filter((c) => {
    const kind = kindOf(c.groupId);
    return kind !== undefined && isRequirement(c, kind);
  });

  /*
   * Which criteria can produce an inherit figure at all, computed once.
   *
   * Only `white_skill` can: a race spark needs the trainee to win that G1 and a
   * scenario spark needs the scenario cleared, and a blue, pink or green comes
   * from the trainee's own stats, aptitudes and unique skill. None of those is
   * something the six ancestors decide, so they are null for every pair and
   * dropping them compares like with like.
   */
  const inheritable = criteria.map((c) => kindOf(c.groupId) === 'white_skill');

  /*
   * Which criteria the COMBINED figures count, computed once.
   *
   * A criterion the reader excluded still filters and still reports its own
   * percentage; it simply leaves the product. See `SparkCriterion.excludeFromOdds`.
   */
  const counted = criteria.map((c) => c.excludeFromOdds !== true);

  const results: PairSearchResult[] = [];
  let legal = 0;
  let scored = 0;
  const total = (veterans.length * (veterans.length - 1)) / 2;

  for (let i = 0; i < veterans.length; i++) {
    const a = veterans[i] as ResolvedVeteran;
    for (let j = i + 1; j < veterans.length; j++) {
      const b = veterans[j] as ResolvedVeteran;

      if (!isLegalPair(a, b, traineeCharaId)) continue;
      // BEFORE `legal` is counted, because a pin says which pairs exist for
      // this search rather than which of them are any good -- the same thing
      // choosing a trainee does. Counting pinned-out pairs as legal would make
      // "258 of 30,808" describe two different populations.
      if (!seats(a, b, requireParentCard, requireGrandparentCard)) continue;
      legal++;
      if (input.onProgress !== undefined && legal % PROGRESS_EVERY === 0) {
        input.onProgress(legal, total);
      }

      let meets = true;
      for (const requirement of requirements) {
        if (!matchesPair(a, b, requirement)) {
          meets = false;
          break;
        }
      }
      if (!meets) continue;
      scored++;

      const request: ExplainPairRequest = {
        traineeCharaId,
        veteranA: packageAt(packages, i),
        veteranB: packageAt(packages, j),
      };
      if (input.traineeCardId !== undefined) request.traineeCardId = input.traineeCardId;
      const lineage = explainLineage(lineageFromPair(request), master, masterHash);

      // `onceInCareer` is the window this ranks by: "will this spark land at
      // all", across the two inspirations a career gives. The compare pane can
      // switch between three windows after a pick; a ranked list has to choose
      // one, and this is the one the row type itself calls the natural key.
      const perSpark = criteria.map((c) => {
        const row = lineage.sparks.find((s) => s.groupId === c.groupId);
        return row === undefined ? null : row.onceInCareer;
      });

      // The second axis. The end-of-career roll is not scaled by affinity, so a
      // pair can rank well on `perSpark` and poorly here; that gap is the
      // reason the two are carried separately rather than multiplied into one
      // ranking key. The tier comes from the criterion because which version
      // of a skill the trainee learns is the reader's plan, not a fact about
      // these six ancestors.
      //
      // TWO KINDS OF ABSENCE, AND THEY DIFFER IN WHAT THEY ARE COUNTED AGAINST.
      // A criterion naming a blue, a race or a scenario spark has no inherit
      // figure for ANY pair, so `inheritable` drops it before the joint and it
      // never reaches the denominator. A criterion naming a white skill THIS
      // pair does not carry stays in the array as a null: it is skipped by the
      // product, it does not count toward coverage, and it IS counted in the
      // "3 of 4 skills" the label prints.
      //
      // Collapsing the two was a real bug: both came back null, both were
      // filtered out, and a pair carrying one of six wanted skills scored that
      // skill's own 28% while a pair carrying all six scored the product of six
      // numbers -- so carrying LESS ranked HIGHER, and "by inheritance" put a
      // pair holding one wanted spark at the top of the list. Coverage-first
      // ranking is what settles it now; see `rank`.
      const perSparkInherit = criteria.map((c, k) => {
        if (!inheritable[k]) return null;
        const row = lineage.sparks.find((s) => s.groupId === c.groupId);
        if (row === undefined) return null;
        return inheritOnceInCareer(
          row.kind,
          row.onceInCareer,
          row.lineageCarriers,
          c.gold === true ? 'gold' : 'white',
        );
      });

      results.push({
        a: i,
        b: j,
        joint: jointOdds(perSpark.filter((_, i) => counted[i])),
        perSpark,
        perSparkInherit,
        // Over the criteria that HAVE an inherit figure, so a filter of three
        // skills and one blue states the joint for the three. `jointOdds`
        // treats a null as a zeroed factor, which would be a different and
        // wrong claim here: a blue has no inherit figure because the mechanic
        // does not reach it, not because the pair fails at it.
        // Over the criteria that CAN produce a figure at all. `jointOdds` then
        // skips the ones this pair happens to miss, and the label beside it
        // says how many of the two counts it covered.
        jointInherit: jointOdds(perSparkInherit.filter((_, i) => inheritable[i] && counted[i])),
        pairTotal: lineage.pairTotal.value,
        relationRank: lineage.relationRank.value,
      });
    }
  }

  results.sort(compare);
  // One final call, so a consumer always ends at a settled number rather than
  // wherever the last multiple of 512 happened to land.
  input.onProgress?.(legal, total);
  return { results, legal, scored };
}

/**
 * Best first, and TOTAL, which matters more than it looks.
 *
 * The design doc asks for the joint with the pair total breaking ties. Ties are
 * common once values round, and a comparator that leaves them unordered lets a
 * re-run reshuffle rows that scored identically -- so the pair's own indices
 * are the final key. They are unique by construction, which makes this a total
 * order and the sweep reproducible.
 *
 * THE RANKING FIGURE IS NOT ALWAYS THE JOINT. With one requirement `jointOdds`
 * returns null by design, because the joint IS that spark's figure; with none
 * there is nothing to combine and the list falls back to pair total, which is
 * NOT what the search is for and is why the surface says so out loud.
 */
const compare = (x: PairSearchResult, y: PairSearchResult): number => rank(x, y, (r) => r.perSpark);

/**
 * The same order, ranked on what the trainee INHERITS rather than what fires.
 *
 * Exported because the sort is a control on the screen and re-running a 2.4s
 * sweep to change a sort key would be absurd: the results are complete, so the
 * screen re-sorts the array it already has. Same comparator, same totality, so
 * toggling back and forth is stable.
 */
export const compareByInherit = (x: PairSearchResult, y: PairSearchResult): number =>
  rank(x, y, (r) => r.perSparkInherit);

/**
 * COVERAGE FIRST, THEN THE PRODUCT OVER WHAT IS COVERED.
 *
 * The joint alone cannot order this list, and the reason is the design's own
 * rule that whites RANK rather than exclude. `jointOdds` zeroes on any spark
 * the pair misses -- correctly, because a filter is one build rather than
 * several wishes -- so on a six-white filter with nothing promoted to "must
 * have", essentially every pair scores exactly 0 and the order collapses onto
 * the pair total. The reader is then told the list is ranked by something it is
 * visibly not ranked by.
 *
 * So the key is a pair: how many of the wanted sparks this pair carries at all,
 * and then the product over the ones it does. A pair carrying four of six sorts
 * above one carrying three however good the three are, which is the ordering
 * somebody scanning 27,613 rows for a partial match actually wants.
 *
 * IT CHANGES NOTHING WHEN THE FILTER IS MET. If every pair carries every wanted
 * spark, coverage ties and the product IS the joint, so this reduces exactly to
 * the old key. It only does work in the case the old key could not order.
 *
 * Ties still fall through to the pair total and then to the pair's own indices,
 * which are unique by construction -- so the order is total and a re-sweep or a
 * toggle back cannot reshuffle rows that scored identically.
 */
const rank = (
  x: PairSearchResult,
  y: PairSearchResult,
  pick: (r: PairSearchResult) => readonly (number | null)[],
): number =>
  coverage(pick(y)) - coverage(pick(x)) ||
  carried(pick(y)) - carried(pick(x)) ||
  y.pairTotal - x.pairTotal ||
  x.a - y.a ||
  x.b - y.b;

/** How many wanted sparks this pair carries at all. Nulls do not count against it. */
const coverage = (values: readonly (number | null)[]): number => {
  let n = 0;
  for (const v of values) if (v !== null && v > 0) n++;
  return n;
};

/** The product over the ones it carries. 1 when it carries none, which ties with itself. */
const carried = (values: readonly (number | null)[]): number => {
  let product = 1;
  for (const v of values) if (v !== null && v > 0) product *= v > 1 ? 1 : v;
  return product;
};

/**
 * Does this pair seat the pinned characters where the reader asked for them?
 *
 * A pair is six umas in two shapes: the two veterans themselves become the
 * direct PARENTS, and their own parents become the four GRANDPARENTS. So the
 * two pins read different fields, and pinning the same character in both is a
 * legitimate question -- "somewhere in this lineage twice" -- rather than a
 * contradiction.
 *
 * `charaId` is null on a member master.mdb has no card for. Such a member can
 * never satisfy a pin, which is right: an unresolved slot is not evidence.
 */
const seats = (
  a: ResolvedVeteran,
  b: ResolvedVeteran,
  parentCard: number | null,
  grandparentCard: number | null,
): boolean => {
  if (parentCard !== null && a.self.cardId !== parentCard && b.self.cardId !== parentCard) {
    return false;
  }
  if (grandparentCard === null) return true;
  for (const veteran of [a, b]) {
    for (const member of veteran.parents) {
      if (member?.cardId === grandparentCard) return true;
    }
  }
  return false;
};

const packageAt = (packages: readonly RosterVeteranInput[], index: number): VeteranPackage => {
  const veteran = packages[index];
  if (veteran === undefined) {
    // The two arrays are index-aligned by contract. If they are not, every
    // number downstream is about a different uma than the row claims, so this
    // fails loudly rather than scoring the wrong lineage.
    throw new Error(`sweepPairs: no package at index ${index}`);
  }
  return { self: veteran.self, parents: [veteran.parents[0], veteran.parents[1]] };
};
