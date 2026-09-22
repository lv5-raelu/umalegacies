import type {
  ExplainPairRequest,
  ResolvedVeteran,
  RosterVeteranInput,
  SparkCriterion,
  SparkKind,
  VeteranPackage,
} from '@umalegacies/types';
import { isLegalPair, isRequirement, matchesPair } from './filter.js';
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
}

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

  // Split once, not 30,808 times. Whites that only rank still get measured --
  // they just cannot exclude, so they have no business in the inner loop's
  // prune step.
  const requirements = criteria.filter((c) => {
    const kind = kindOf(c.groupId);
    return kind !== undefined && isRequirement(c, kind);
  });

  const results: PairSearchResult[] = [];
  let legal = 0;
  let scored = 0;

  for (let i = 0; i < veterans.length; i++) {
    const a = veterans[i] as ResolvedVeteran;
    for (let j = i + 1; j < veterans.length; j++) {
      const b = veterans[j] as ResolvedVeteran;

      if (!isLegalPair(a, b, traineeCharaId)) continue;
      legal++;

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

      results.push({
        a: i,
        b: j,
        joint: jointOdds(perSpark),
        perSpark,
        pairTotal: lineage.pairTotal.value,
        relationRank: lineage.relationRank.value,
      });
    }
  }

  results.sort(compare);
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
const compare = (x: PairSearchResult, y: PairSearchResult): number =>
  rankKey(y) - rankKey(x) || y.pairTotal - x.pairTotal || x.a - y.a || x.b - y.b;

const rankKey = (r: PairSearchResult): number => r.joint ?? r.perSpark[0] ?? 0;

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
