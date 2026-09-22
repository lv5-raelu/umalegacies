/// <reference lib="webworker" />
import { runSweep } from './run-sweep';
import type { SweepReply, SweepRequest } from './sweep-protocol';

/**
 * THE SWEEP, OFF THE MAIN THREAD.
 *
 * All six lines of it. Everything worth testing is in `run-sweep.ts`; this file
 * exists because `self.onmessage` cannot be imported into a Node test.
 *
 * WHY A WORKER AT ALL. The sweep is a synchronous CPU loop measured at 1.5
 * seconds in its worst case on a real roster. On the main thread that is 1.5
 * seconds of frozen scrolling, dead buttons and a spinner that cannot spin --
 * the page would be lying about being alive. Here the page stays responsive and
 * the progress figure is real.
 *
 * NO CANCELLATION MESSAGE. To abandon a search the client TERMINATES the
 * worker, which is the only way to stop a synchronous loop that is already
 * running: a `cancel` message would sit in the queue until the loop it means to
 * stop had finished. The cost is rebuilding `MasterData` on the next search,
 * measured at 1.9 ms including the fetch, which is not worth a cooperative
 * cancellation protocol the loop would have to check.
 */

const post = (reply: SweepReply): void => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};

self.onmessage = (event: MessageEvent<SweepRequest>) => {
  const request = event.data;
  runSweep(request, (considered, total) => post({ type: 'progress', id: request.id, considered, total }))
    .then((sweep) => post({ type: 'done', id: request.id, sweep }))
    .catch((error: unknown) => {
      post({
        type: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
