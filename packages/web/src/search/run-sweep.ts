import { sweepPairs, type PairSweep } from '@umalegacies/core';
import { loadMaster, requireFresh } from '../lineage/master-source';
import type { SweepRequest } from './sweep-protocol';

/**
 * The worker's actual work, with no worker in it.
 *
 * `sweep.worker.ts` is the handful of lines that wire `self.onmessage` to this.
 * Keeping them apart is what makes the sweep testable: vitest runs in Node,
 * spinning up a real `Worker` there is a fight, and the interesting behaviour --
 * the staleness refusal and the catalogue rebuild -- has nothing to do with
 * message passing.
 *
 * The game data comes from `master-source`, which the MAIN thread also uses now
 * that the compare pane explains a pair locally (T16). Same loader, two
 * contexts, one cached fetch each.
 */

export async function runSweep(
  request: SweepRequest,
  onProgress: (considered: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<PairSweep> {
  const source = await loadMaster(fetchImpl);
  // REFUSED, NOT RECONCILED. The roster's names and star counts came from the
  // server's copy of the extract; these numbers would come from this one.
  requireFresh(source, request.masterHash);
  const { hash, master } = source;

  // A function cannot cross postMessage, so the catalogue arrives as pairs and
  // the closure is rebuilt here. A Map because the sweep asks this once per
  // criterion per search, not once per pair.
  const kinds = new Map(request.kinds);

  const sweepInput = {
    veterans: request.veterans,
    packages: request.packages,
    traineeCharaId: request.traineeCharaId,
    criteria: request.criteria,
    kindOf: (groupId: number) => kinds.get(groupId),
    master,
    masterHash: hash,
    onProgress,
  };
  return request.traineeCardId === undefined
    ? sweepPairs(sweepInput)
    : sweepPairs({ ...sweepInput, traineeCardId: request.traineeCardId });
}
