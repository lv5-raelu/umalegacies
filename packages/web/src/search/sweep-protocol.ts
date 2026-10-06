import type { ResolvedVeteran, RosterVeteranInput, SparkCriterion, SparkKind } from '@umalegacies/types';
import type { PairSweep } from '@umalegacies/core';

/**
 * WHAT CROSSES THE WORKER BOUNDARY.
 *
 * Kept in its own module, away from anything that touches `self` or `Worker`,
 * so both sides import the same types and the sweep-running half stays callable
 * from a test that has no worker at all.
 *
 * EVERYTHING HERE IS STRUCTURED-CLONEABLE. postMessage copies by the structured
 * clone algorithm, which carries plain objects and arrays and refuses functions
 * and class instances. That rules out two things the sweep's own input takes:
 * `kindOf`, which is a closure, and `MasterData`, which is a class holding
 * Maps. The worker rebuilds both on its side -- the kinds from a plain
 * `[groupId, kind]` list, and `MasterData` from the JSON it fetched itself.
 */

export interface SweepRequest {
  /** Matches the reply, so a stale worker's answer can be discarded rather than shown. */
  id: number;
  veterans: ResolvedVeteran[];
  packages: RosterVeteranInput[];
  traineeCharaId: number;
  traineeCardId?: number;
  criteria: SparkCriterion[];
  /**
   * The cards shortlisted for each slot, meaning ANY of them.
   *
   * Composition rather than sparks: these narrow which pairs the sweep builds
   * and touch no figure it reports. Plain number arrays, so they cross the
   * worker boundary without ceremony.
   */
  requireParentCards?: number[];
  /** The OTHER parent seat: with both lists, one veteran from each. */
  requireOtherParentCards?: number[];
  requireGrandparentCards?: number[];
  /**
   * The catalogue, flattened.
   *
   * `sweepPairs` wants a `kindOf` function and a function cannot be cloned, so
   * the pairs travel and the worker closes over a Map built from them. Sending
   * the whole `RosterSparkOption[]` would carry names and counts the sweep
   * never reads.
   */
  kinds: Array<[groupId: number, kind: SparkKind]>;
  /**
   * The extract the ROSTER was resolved against.
   *
   * The worker refuses to sweep if its own `master.json` came from a different
   * extract. Otherwise the names beside a number would come from one version of
   * the game data and the number from another, and nothing on screen would say
   * so. This is the same check `explain-pair` makes server-side, moved to
   * wherever the computation now happens.
   */
  masterHash: string;
}

export type SweepReply =
  | { type: 'progress'; id: number; considered: number; total: number }
  | { type: 'done'; id: number; sweep: PairSweep }
  | { type: 'error'; id: number; message: string };
