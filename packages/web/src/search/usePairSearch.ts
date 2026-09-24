import { useEffect, useMemo, useRef, useState } from 'react';
import type { PairSweep } from '@umalegacies/core';
import type { RosterResolveResponse, RosterVeteranInput, SparkCriterion } from '@umalegacies/types';
import { SweepClient, type SweepProgress } from './sweep-client';

/**
 * THE SEARCH, AS A PIECE OF REACT STATE.
 *
 * One `SweepClient` per mount, kept in a ref, so the worker and its game data
 * survive every re-render and every changed filter. Building a new one per
 * render would refetch `master.json` and rebuild the Maps on each keystroke.
 *
 * THE SWEEP RE-RUNS ON EVERY CHANGE, with no debounce, and that is a decision
 * rather than an omission. The controls here are a dropdown and a star
 * selector -- discrete choices, not typing -- so a change is a deliberate act
 * and there is no keystroke storm to smooth out. `SweepClient` already
 * abandons a search when the next one starts, which is the behaviour a debounce
 * would be approximating.
 */

export type SearchStatus =
  /** No trainee yet: every figure a search ranks by is relative to one. */
  | { kind: 'idle' }
  | { kind: 'running'; progress: SweepProgress | null }
  /**
   * The sweep, AND the criteria it was swept for.
   *
   * Carried together because the screen renders one against the other: a row's
   * star totals and its labels come from the criteria while its odds come from
   * the sweep, and the two must describe the same search. Reading the criteria
   * from a separate piece of state let them disagree for exactly one frame --
   * the one between "Search" being clicked and this effect running -- which the
   * builder saw as the list flickering before "Searching..." appeared.
   */
  | { kind: 'done'; sweep: PairSweep; criteria: readonly SparkCriterion[] }
  | { kind: 'failed'; message: string };

export function usePairSearch(
  roster: RosterResolveResponse,
  packages: readonly RosterVeteranInput[],
  traineeCharaId: number | null,
  traineeCardId: number | null,
  criteria: readonly SparkCriterion[],
  /** Characters pinned into a slot. Composition, not sparks; see `SweepRequest`. */
  pins: { parent: number | null; grandparent: number | null },
): SearchStatus {
  const clientRef = useRef<SweepClient | null>(null);
  const [status, setStatus] = useState<SearchStatus>({ kind: 'idle' });

  clientRef.current ??= new SweepClient();

  // The catalogue as the worker wants it: a function cannot be cloned across
  // postMessage, so kinds travel as pairs. Memoised on the roster because it
  // is the same list for every search against it.
  const kinds = useMemo(
    () => roster.sparkOptions.map((o) => [o.groupId, o.kind] as [number, typeof o.kind]),
    [roster],
  );

  useEffect(() => {
    const client = clientRef.current;
    if (client === null) return;
    if (traineeCharaId === null) {
      client.cancel();
      setStatus({ kind: 'idle' });
      return;
    }

    let live = true;
    setStatus({ kind: 'running', progress: null });

    client
      .search(
        {
          veterans: roster.veterans,
          packages: [...packages],
          traineeCharaId,
          ...(traineeCardId === null ? {} : { traineeCardId }),
          criteria: [...criteria],
          ...(pins.parent === null ? {} : { requireParentChara: pins.parent }),
          ...(pins.grandparent === null ? {} : { requireGrandparentChara: pins.grandparent }),
          kinds,
          masterHash: roster.masterHash,
        },
        (progress) => {
          if (live) setStatus({ kind: 'running', progress });
        },
      )
      .then((sweep) => {
        if (live) setStatus({ kind: 'done', sweep, criteria });
      })
      .catch((error: unknown) => {
        if (live) {
          setStatus({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      // The effect is re-running, so this search is about a filter the user has
      // already changed. `live` stops its result landing; the client's own
      // cancel-on-next-search stops the work.
      live = false;
    };
    // `pins` is an object literal at the call site, so its identity changes on
    // every render; the two numbers inside it are what the sweep depends on.
  }, [roster, packages, traineeCharaId, traineeCardId, criteria, kinds, pins.parent, pins.grandparent]);

  // The worker outlives every search but not the screen.
  useEffect(() => () => clientRef.current?.cancel(), []);

  return status;
}
