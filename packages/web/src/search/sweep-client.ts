import type { PairSweep } from '@umalegacies/core';
import type { SweepReply, SweepRequest } from './sweep-protocol';

/**
 * The main thread's handle on the sweep worker.
 *
 * ONE WORKER, REUSED. Spawning costs a module load and a `master.json` fetch,
 * and a user narrowing a filter searches three or four times in a row. The
 * worker keeps its `MasterData` between searches; a fresh one would rebuild it
 * every time for no reason.
 *
 * ONE SEARCH AT A TIME, and the second one wins. Starting a search while
 * another is running abandons the first: its answer is about a filter the user
 * has already moved on from, and a sweep that cannot be stopped mid-loop would
 * otherwise deliver it after the newer one and overwrite the right answer with
 * a stale one.
 *
 * ABANDONING MEANS TERMINATING. A synchronous loop cannot be interrupted by a
 * message -- a `cancel` would queue behind the very loop it means to stop -- so
 * an ABANDONED worker is killed and the next search spawns a fresh one.
 * Measured at 1.9 ms to reload the game data, against a sweep of up to 1,500
 * ms. A worker that merely FINISHED is kept, which is the case that matters:
 * finishing is the common path and cancelling is not.
 *
 * REQUEST IDS ARE BELT AND BRACES. Terminating should make a stale reply
 * impossible, but a reply already in flight when `terminate()` lands is a race
 * nobody should have to reason about, so every reply is checked against the
 * request it claims to answer and a mismatch is dropped.
 */

export interface SweepProgress {
  considered: number;
  total: number;
}

/** What a caller passes; `id` is the client's business. */
export type SweepQuery = Omit<SweepRequest, 'id'>;

type Pending = {
  id: number;
  resolve: (sweep: PairSweep) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: SweepProgress) => void;
};

/** Injectable so a test can drive a fake worker without a bundler. */
export type WorkerFactory = () => Worker;

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' });

export class SweepClient {
  #worker: Worker | null = null;
  #pending: Pending | null = null;
  #nextId = 1;

  constructor(private readonly factory: WorkerFactory = defaultFactory) {}

  search(query: SweepQuery, onProgress?: (progress: SweepProgress) => void): Promise<PairSweep> {
    // ONLY an IN-FLIGHT search is abandoned. Terminating unconditionally here
    // would kill the idle worker too and rebuild its MasterData on every
    // search, which is exactly the cost keeping the worker was meant to avoid.
    if (this.#pending !== null) this.cancel();

    const id = this.#nextId++;
    const worker = this.#worker ?? this.factory();
    this.#worker = worker;

    return new Promise<PairSweep>((resolve, reject) => {
      const pending: Pending = onProgress === undefined
        ? { id, resolve, reject }
        : { id, resolve, reject, onProgress };
      this.#pending = pending;

      worker.onmessage = (event: MessageEvent<SweepReply>) => {
        const reply = event.data;
        // Not ours: a reply that crossed a terminate. Dropping it is the whole
        // reason the id travels.
        if (this.#pending?.id !== reply.id) return;
        if (reply.type === 'progress') {
          pending.onProgress?.({ considered: reply.considered, total: reply.total });
          return;
        }
        this.#settle();
        if (reply.type === 'done') resolve(reply.sweep);
        else reject(new Error(reply.message));
      };

      worker.onerror = (event: ErrorEvent) => {
        if (this.#pending?.id !== id) return;
        this.#settle();
        // `event.message` is empty for a module that failed to load, which is
        // the likeliest failure here and the least self-explanatory.
        reject(new Error(event.message || 'The search worker failed to start.'));
      };

      // The id must travel WITH the query. Posting the bare query left every
      // reply carrying `id: undefined`, which matched no pending request, so
      // the promise never settled and the search hung forever.
      const request: SweepRequest = { ...query, id };
      worker.postMessage(request);
    });
  }

  /**
   * Abandon whatever is running. Safe to call when nothing is.
   *
   * The pending promise is left UNSETTLED on purpose: the caller asked for this
   * search to stop mattering, and rejecting would make every call site handle a
   * cancellation it deliberately caused. `search` settles it instead, by being
   * the next thing the caller awaits.
   */
  cancel(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#pending = null;
  }

  #settle(): void {
    this.#pending = null;
    // The worker stays ALIVE after a search completes, holding its MasterData
    // for the next one. Only cancellation kills it.
  }
}
