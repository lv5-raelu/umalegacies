import { MasterData, decodeMasterJson, type MasterJson } from '@umalegacies/core';

/**
 * THE GAME DATA, ONCE PER JAVASCRIPT CONTEXT.
 *
 * Shared by the search worker and the main thread, which are separate contexts
 * and so each hold their own copy. That is not waste: the browser serves the
 * second fetch from cache, and 0.8 ms of parsing plus 1.1 ms of Map building is
 * the entire cost of having the engine on both sides.
 *
 * The promise is cached rather than the value, so two callers racing on a cold
 * start share one fetch instead of making two.
 */

/** Where T13's generated game data is served from. */
export const MASTER_JSON_URL = '/master.json';

/**
 * The page's game data disagrees with the game data the roster was read with.
 *
 * Only reachable when the deployed `master.json` and the deployed API extract
 * have drifted apart, or when a long-lived tab outlives a release. Refused
 * rather than reconciled: the names in a row would come from one version of the
 * game and the numbers from another, and nothing on screen could say so.
 */
export class StaleMasterError extends Error {
  constructor(
    readonly rosterHash: string,
    readonly dataHash: string,
  ) {
    super(
      `The game data this page loaded (${dataHash.slice(0, 8)}) is not the one your roster ` +
        `was read with (${rosterHash.slice(0, 8)}). Reload to pick up the new data.`,
    );
    this.name = 'StaleMasterError';
  }
}

export interface MasterSource {
  hash: string;
  master: MasterData;
}

let pending: Promise<MasterSource> | null = null;

export function loadMaster(fetchImpl: typeof fetch = fetch): Promise<MasterSource> {
  pending ??= (async () => {
    const response = await fetchImpl(MASTER_JSON_URL);
    if (!response.ok) {
      throw new Error(`Could not load the game data (${response.status} from ${MASTER_JSON_URL}).`);
    }
    const { hash, tables } = decodeMasterJson((await response.json()) as MasterJson);
    return { hash, master: new MasterData(tables) };
  })().catch((error: unknown) => {
    // A failed load is not cached as a permanent failure. The likeliest cause is
    // a dropped connection, and the next attempt should be allowed to succeed.
    pending = null;
    throw error;
  });
  return pending;
}

/** Test seam: module state survives between tests and would poison the next one. */
export function forgetMaster(): void {
  pending = null;
}

/** Throws unless the page's game data is the one the roster was resolved against. */
export function requireFresh(source: MasterSource, rosterHash: string): void {
  if (source.hash !== rosterHash) throw new StaleMasterError(rosterHash, source.hash);
}
