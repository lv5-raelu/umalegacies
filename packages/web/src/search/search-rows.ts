import type { PairSearchResult, PairSweep } from '@umalegacies/core';
import { starsInScope } from '@umalegacies/core';
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
   * Stars each half contributes to each criterion, in criteria order.
   *
   * SPLIT, not summed, and the split is the point: a pair holding 6 Stamina as
   * 6+0 is a different proposition from one holding it as 3+3, and the band
   * under each row is where that shows. `matchesPair` only had to answer
   * whether the total cleared the bar.
   */
  stars: Array<readonly [number, number]>;
  perSpark: (number | null)[];
  joint: number | null;
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

/** Stars one half carries for one criterion. A half without the spark is a zero. */
function halfStars(veteran: ResolvedVeteran, criterion: SparkCriterion): number {
  const spark = veteran.sparks.find((s) => s.groupId === criterion.groupId);
  if (spark === undefined) return 0;
  return starsInScope(spark, criterion.scope).reduce((total, n) => total + n, 0);
}

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
): PairSearchView {
  const shown = sweep.results.slice(0, limit);
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
    stars: criteria.map((c) => [halfStars(a, c), halfStars(b, c)] as const),
    perSpark: result.perSpark,
    joint: result.joint,
    pairTotal: result.pairTotal,
    relationRank: result.relationRank,
  };
}
