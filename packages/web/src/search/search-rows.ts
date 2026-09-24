import type { PairSearchResult, PairSweep } from '@umalegacies/core';
import { compareByInherit, starsInPair } from '@umalegacies/core';
import type { ResolvedVeteran, SparkCriterion } from '@umalegacies/types';

/**
 * A scored pair, as a ROW knows it.
 *
 * `PairSearchResult` carries indices, because 30,808 of them cross a worker
 * boundary and sending two whole veterans per row would be sending the roster
 * back a hundred times over. The screen wants the veterans. This is the join,
 * and the only place that knows the indices point into `roster.veterans`.
 */
export interface PairRowData {
  a: ResolvedVeteran;
  b: ResolvedVeteran;
  /**
   * Stars this pair carries of each wanted spark, across ALL SIX ancestors.
   *
   * ALWAYS THE WHOLE LINEAGE, whatever scope the criterion was written in.
   * The band answers "what does this pair give me"; the criterion's scope is
   * how the reader FOUND the pair, not what the pair carries. A cut that showed
   * the scoped figure instead was correct arithmetic answering the wrong
   * question, and it read as a discrepancy -- chips saying 4 and 2 beside a
   * band saying 5, because that criterion counted only the direct parents.
   *
   * So this always equals the two chips above it added together, and can be
   * checked by eye against them. Who holds the stars is said by the chips and
   * their parent-share marks, which is the right place for it.
   */
  lineageStars: number[];
  perSpark: (number | null)[];
  /**
   * One INHERIT figure per criterion: the chance the trainee finishes a career carrying
   * that spark. Null where the chain is not ours to compute -- anything other
   * than a white skill, or a spark the pair does not carry.
   */
  perSparkInherit: (number | null)[];
  joint: number | null;
  /** The chance every wanted SKILL is inherited. Null with fewer than two. */
  jointInherit: number | null;
  pairTotal: number;
  relationRank: number;
}

export interface PairSearchView {
  rows: PairRowData[];
  /** Pairs the game allows at all, before any requirement. */
  legalPairs: number;
  /** Of those, how many met every requirement. */
  matchingPairs: number;
  /**
   * How many veterans appear in at least one matching pair.
   *
   * The count the shared filter control can honestly show, because it states
   * its result in VETERANS ("31 of 259"). The pair count is the number the
   * search is really about and the control has nowhere to put it, so it is
   * stated beside the list instead.
   */
  candidates: number;
}

/**
 * Which question the list is ordered by.
 *
 * `activate` is the sweep's own order -- whether every wanted spark FIRES --
 * and `inherit` is whether the trainee ends up CARRYING them. The two rank
 * differently because the end-of-career roll is not scaled by affinity, so a pair
 * that fires best is not always the one that passes most on.
 */
export type SortBy = 'activate' | 'inherit';

export function viewOf(
  sweep: PairSweep,
  veterans: readonly ResolvedVeteran[],
  criteria: readonly SparkCriterion[],
  /**
   * How many rows to build.
   *
   * The sweep is COMPLETE -- all 30,808 pairs are scored and ranked -- and only
   * the list is paged. Building a `PairRowData` for every one of them would
   * allocate two references and a star array per criterion, 30,808 times, to
   * render eighty. The count of matches still comes from the sweep, so the
   * screen never understates what it found.
   */
  limit: number,
  sortBy: SortBy = 'activate',
): PairSearchView {
  /*
   * RE-SORTED HERE, NOT RE-SWEPT. The sweep is complete -- every legal pair is
   * already scored on both axes -- so changing the question the list is ordered
   * by is a sort of an array we hold, not 2.4 seconds of work again. Sorting a
   * copy leaves the sweep's own order intact for the other setting, and
   * `compareByInherit` is total in the same way `compare` is, so toggling back
   * and forth is stable rather than reshuffling ties.
   */
  const ranked =
    sortBy === 'inherit' ? [...sweep.results].sort(compareByInherit) : sweep.results;
  const shown = ranked.slice(0, limit);
  const rows = shown.map((result) => rowOf(result, veterans, criteria));

  // Across the WHOLE sweep, not just the page: "31 of 259 veterans" must not
  // change when the reader asks for more rows.
  const seen = new Set<number>();
  for (const result of sweep.results) {
    seen.add(result.a);
    seen.add(result.b);
  }

  return {
    rows,
    legalPairs: sweep.legal,
    matchingPairs: sweep.scored,
    candidates: seen.size,
  };
}

function rowOf(
  result: PairSearchResult,
  veterans: readonly ResolvedVeteran[],
  criteria: readonly SparkCriterion[],
): PairRowData {
  const a = veterans[result.a];
  const b = veterans[result.b];
  if (a === undefined || b === undefined) {
    // The sweep indexes the array it was handed. If that array has changed
    // underneath the results, every row names the wrong umas, which is worse
    // than an empty screen.
    throw new Error(`pair search: no veteran at index ${a === undefined ? result.a : result.b}`);
  }
  return {
    a,
    b,
    // `'package'` unconditionally: every ancestor of both halves, which is what
    // the chips show and what the reader is asking the band.
    lineageStars: criteria.map((c) => starsInPair(a, b, c.groupId, 'package')),
    perSpark: result.perSpark,
    perSparkInherit: result.perSparkInherit,
    joint: result.joint,
    jointInherit: result.jointInherit,
    pairTotal: result.pairTotal,
    relationRank: result.relationRank,
  };
}
