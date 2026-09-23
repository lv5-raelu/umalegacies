import type { PairSearchResult, PairSweep } from '@umalegacies/core';
import { starsInPair } from '@umalegacies/core';
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
   * What each criterion actually MEASURES on this pair, in criteria order.
   *
   * THE SAME FIGURE `matchesPair` COMPARED TO THE THRESHOLD, from the same
   * function, rather than one recomposed here. The band used to add the two
   * halves together, which was right for a summing scope and wrong for a
   * maximum: under `one-parent` a pair meeting "3 on one parent" was shown
   * carrying 6, double the number the requirement had tested. Reported by the
   * builder from the other direction -- a lineage-scoped chip reading 4 and 2
   * beside a parent-scoped band reading 5.
   *
   * It is NOT the same as adding up the two chips above it. A chip states what
   * a half holds across its whole three-uma package; this states what the
   * CRITERION looks at, which may be the two direct parents or the better of
   * them. `scopeNote` is what tells the reader which.
   */
  inScope: number[];
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
    inScope: criteria.map((c) => starsInPair(a, b, c.groupId, c.scope)),
    perSpark: result.perSpark,
    joint: result.joint,
    pairTotal: result.pairTotal,
    relationRank: result.relationRank,
  };
}
