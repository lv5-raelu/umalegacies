import { MasterData, decodeMasterJson, sweepPairs, type MasterJson, type PairSweep } from '@umalegacies/core';
import { MASTER_JSON_URL, StaleMasterError, type SweepRequest } from './sweep-protocol';

/**
 * The worker's actual work, with no worker in it.
 *
 * `sweep.worker.ts` is the six lines that wire `self.onmessage` to this. Keeping
 * them apart is what makes the sweep testable: vitest runs in Node, spinning up
 * a real `Worker` there is a fight, and the interesting behaviour -- the
 * staleness refusal, the catalogue rebuild, caching the master data across
 * searches -- has nothing to do with message passing.
 */

/**
 * Built ONCE and kept, across every search this worker serves.
 *
 * Measured: 0.8 ms to parse the JSON and 1.1 ms to build the Maps. Small, and
 * still worth not repeating -- a user narrowing a filter runs this three or
 * four times in a row, and there is nothing to gain by rebuilding identical
 * Maps each time. The promise is cached, not the value, so two searches racing
 * on a cold worker share one fetch instead of making two.
 */
let masterPromise: Promise<{ hash: string; master: MasterData }> | null = null;

export function loadMaster(fetchImpl: typeof fetch = fetch): Promise<{ hash: string; master: MasterData }> {
  masterPromise ??= (async () => {
    const response = await fetchImpl(MASTER_JSON_URL);
    if (!response.ok) {
      throw new Error(`Could not load the game data (${response.status} from ${MASTER_JSON_URL}).`);
    }
    const doc = (await response.json()) as MasterJson;
    const { hash, tables } = decodeMasterJson(doc);
    return { hash, master: new MasterData(tables) };
  })().catch((error: unknown) => {
    // A failed load must not be cached as a permanent failure: the next search
    // should be allowed to try again, since the likeliest cause is a dropped
    // connection rather than a broken file.
    masterPromise = null;
    throw error;
  });
  return masterPromise;
}

/** Test seam. The cache is module state, and a test that fills it poisons the next one. */
export function forgetMaster(): void {
  masterPromise = null;
}

export async function runSweep(
  request: SweepRequest,
  onProgress: (considered: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<PairSweep> {
  const { hash, master } = await loadMaster(fetchImpl);

  // REFUSED, NOT RECONCILED. The roster's names and star counts came from the
  // server's copy of the extract; these numbers would come from this one. If
  // they differ, every row would pair a name from one version of the game with
  // a number from another, and the disagreement is invisible by construction.
  if (hash !== request.masterHash) throw new StaleMasterError(request.masterHash, hash);

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
