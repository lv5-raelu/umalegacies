import { useCallback, useEffect, useReducer, useState } from 'react';
import type { RosterResolveResponse, RosterVeteranInput, TraineeOption } from '@umalegacies/types';
import { explainPairLocally } from '../lineage/explain-local';
import { runColumns, type ColumnResult } from './run-columns';
import { pairKey, type TrayPair } from './tray';

/**
 * THE KEYED RESULTS, and the effect that fills only what is missing.
 *
 *   key = masterHash | trainee card | P1 pick | P2 pick   (ORDERED; see pairKey)
 *
 *   tray pair --key--> results Map --hit----> that column's result
 *                                  --miss---> 'loading', and the effect explains it
 *
 * KEYED, NOT POSITIONAL. Results used to be imagined as an array beside the
 * tray, and an array shifts: remove A and B's numbers would land under C. A
 * column whose key has no entry renders loading, never another pair's numbers,
 * and adding or removing one pair leaves every other column's numbers on
 * screen with no "Explaining…" flash.
 *
 * THE MAP OUTLIVES THE PAGE (App owns it), so a return to /compare with the
 * same trainee draws its numbers on the first render and the saved scroll has
 * a settled layout to land in.
 *
 * AND IT IS BOUNDED. One explained pair is ~150KB, so a Map that only grew
 * would add four of them on every trainee switch. Every run first prunes it to
 * the current trainee x the slots on the page -- live pairs and the ones held
 * by "Removed · undo" -- which is at most four keys.
 */
export const columnKey = (masterHash: string, traineeCardId: number, pair: TrayPair): string =>
  `${masterHash}|${traineeCardId}|${pairKey(pair)}`;

/** Drop every result whose key is not in `keep`. */
export function pruneResults(results: Map<string, ColumnResult>, keep: Iterable<string>): void {
  const wanted = new Set(keep);
  for (const key of [...results.keys()]) if (!wanted.has(key)) results.delete(key);
}

export function useCompareColumns({
  results,
  live,
  held,
  trainee,
  roster,
  veterans,
  onStale,
}: {
  results: Map<string, ColumnResult>;
  /** The pairs on screen, to explain. */
  live: readonly TrayPair[];
  /** Pairs held by "Removed · undo": kept in the Map, never explained. */
  held: readonly TrayPair[];
  trainee: TraineeOption | null;
  roster: RosterResolveResponse;
  veterans: readonly RosterVeteranInput[];
  onStale: () => void;
}): { resultOf: (pair: TrayPair) => ColumnResult; retry: (pair: TrayPair) => void } {
  const [, landed] = useReducer((n: number) => n + 1, 0);
  const [attempt, setAttempt] = useState(0);
  // The effect's real inputs are the pairs' KEYS; the arrays are new on every render.
  const liveKeys = live.map(pairKey).join(',');
  const heldKeys = held.map(pairKey).join(',');

  useEffect(() => {
    if (trainee === null) return;
    const keyOf = (pair: TrayPair) => columnKey(roster.masterHash, trainee.cardId, pair);
    pruneResults(results, [...live, ...held].map(keyOf));

    const jobs = live.filter((pair) => !results.has(keyOf(pair))).map((pair) => ({ key: keyOf(pair), pair }));
    if (jobs.length === 0) return;
    let cancelled = false;
    void runColumns(jobs, {
      trainee,
      roster,
      veterans,
      explain: (request) => explainPairLocally(request, roster.masterHash),
      isCancelled: () => cancelled,
      onResult: (key, result) => {
        results.set(key, result);
        landed();
      },
      onStale,
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, trainee, roster, veterans, liveKeys, heldKeys, attempt]);

  const resultOf = useCallback(
    (pair: TrayPair): ColumnResult =>
      trainee === null
        ? { kind: 'loading' }
        : (results.get(columnKey(roster.masterHash, trainee.cardId, pair)) ?? { kind: 'loading' }),
    [results, trainee, roster],
  );

  const retry = useCallback(
    (pair: TrayPair) => {
      if (trainee === null) return;
      results.delete(columnKey(roster.masterHash, trainee.cardId, pair));
      setAttempt((n) => n + 1);
    },
    [results, trainee, roster],
  );

  return { resultOf, retry };
}
