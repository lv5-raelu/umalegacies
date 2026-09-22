import { describe, expect, it, vi } from 'vitest';
import type { PairSweep } from '@umalegacies/core';
import { SweepClient, type SweepQuery } from './sweep-client';
import type { SweepReply, SweepRequest } from './sweep-protocol';

/**
 * The client, against a fake worker.
 *
 * A REAL `Worker` IS NOT THE THING UNDER TEST. vitest runs in Node, and the
 * decisions worth pinning here are about message routing and lifetime: whose
 * reply is listened to, what happens to an abandoned search, and whether the
 * worker survives a completed one. Every one of those is observable through the
 * `WorkerFactory` seam without a bundler or a real thread.
 */

class FakeWorker {
  static built = 0;
  terminated = false;
  posted: SweepRequest[] = [];
  onmessage: ((event: MessageEvent<SweepReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    FakeWorker.built++;
  }

  postMessage(request: SweepRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Drive a reply as the worker would. */
  reply(reply: SweepReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<SweepReply>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const sweep = (scored: number): PairSweep => ({ results: [], legal: 100, scored });

const query: SweepQuery = {
  veterans: [],
  packages: [],
  traineeCharaId: 1006,
  criteria: [],
  kinds: [],
  masterHash: 'abc123',
};

function client(): { client: SweepClient; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const c = new SweepClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { client: c, workers };
}

describe('what the client sends', () => {
  it('sends the id ALONGSIDE the query, not just the query', async () => {
    // The first cut posted the bare query, so every reply came back with
    // `id: undefined`, matched no pending request, and the promise never
    // settled. The search hung with no error and no result.
    const { client: c, workers } = client();
    const promise = c.search(query);
    const sent = workers[0]!.posted[0]!;

    expect(sent.id).toBeTypeOf('number');
    expect(sent.masterHash).toBe('abc123');
    expect(sent.traineeCharaId).toBe(1006);

    workers[0]!.reply({ type: 'done', id: sent.id, sweep: sweep(7) });
    await expect(promise).resolves.toMatchObject({ scored: 7 });
  });

  it('omits traineeCardId rather than sending it as undefined', () => {
    const { client: c, workers } = client();
    void c.search(query);
    expect('traineeCardId' in workers[0]!.posted[0]!).toBe(false);
  });
});

describe('one search at a time, and the second one wins', () => {
  it('terminates the worker running an abandoned search', async () => {
    const { client: c, workers } = client();
    void c.search(query);
    const first = workers[0]!;
    void c.search(query);

    expect(first.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('ignores a reply from a search that was abandoned', async () => {
    // Terminating should make this impossible; a reply already in flight is
    // the race that makes the id worth carrying anyway.
    const { client: c, workers } = client();
    void c.search(query);
    const first = workers[0]!;
    const firstId = first.posted[0]!.id;

    const second = c.search(query);
    first.reply({ type: 'done', id: firstId, sweep: sweep(999) });

    const secondWorker = workers[1]!;
    secondWorker.reply({ type: 'done', id: secondWorker.posted[0]!.id, sweep: sweep(2) });
    await expect(second).resolves.toMatchObject({ scored: 2 });
  });

  it('leaves an abandoned promise unsettled rather than rejecting it', async () => {
    // Cancelling is something the CALLER did on purpose. Rejecting would make
    // every call site handle an error it caused itself.
    const { client: c } = client();
    const abandoned = c.search(query);
    const settled = vi.fn();
    void abandoned.then(settled, settled);

    c.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });
});

describe('the worker survives a search it finished', () => {
  it('reuses one worker across consecutive searches', async () => {
    // THE WHOLE REASON THE CLIENT HOLDS A WORKER. It keeps its MasterData --
    // 1.9 ms to rebuild -- and a user narrowing a filter searches repeatedly.
    // An earlier cut cancelled unconditionally on every search and rebuilt it
    // every time while claiming in a comment not to.
    const { client: c, workers } = client();

    const first = c.search(query);
    workers[0]!.reply({ type: 'done', id: workers[0]!.posted[0]!.id, sweep: sweep(1) });
    await first;

    const second = c.search(query);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
    expect(workers[0]!.posted).toHaveLength(2);

    workers[0]!.reply({ type: 'done', id: workers[0]!.posted[1]!.id, sweep: sweep(2) });
    await expect(second).resolves.toMatchObject({ scored: 2 });
  });

  it('gives each search a distinct id', async () => {
    const { client: c, workers } = client();
    const first = c.search(query);
    workers[0]!.reply({ type: 'done', id: workers[0]!.posted[0]!.id, sweep: sweep(1) });
    await first;
    void c.search(query);

    const [a, b] = workers[0]!.posted;
    expect(a!.id).not.toBe(b!.id);
  });
});

describe('progress and failure', () => {
  it('reports progress without settling the search', async () => {
    const { client: c, workers } = client();
    const seen: number[] = [];
    const promise = c.search(query, (p) => seen.push(p.considered));
    const id = workers[0]!.posted[0]!.id;

    workers[0]!.reply({ type: 'progress', id, considered: 512, total: 33411 });
    workers[0]!.reply({ type: 'progress', id, considered: 1024, total: 33411 });
    expect(seen).toEqual([512, 1024]);

    workers[0]!.reply({ type: 'done', id, sweep: sweep(3) });
    await expect(promise).resolves.toMatchObject({ scored: 3 });
  });

  it('rejects with the worker’s own message', async () => {
    const { client: c, workers } = client();
    const promise = c.search(query);
    workers[0]!.reply({
      type: 'error',
      id: workers[0]!.posted[0]!.id,
      message: 'The game data this page loaded (0451b16e) is not the one your roster was read with (deadbeef).',
    });
    await expect(promise).rejects.toThrow(/is not the one your roster was read with/);
  });

  it('names the failure when the worker will not start at all', async () => {
    // An ErrorEvent from a module that failed to load carries an empty message,
    // which is the least self-explanatory error a user could be shown.
    const { client: c, workers } = client();
    const promise = c.search(query);
    workers[0]!.fail('');
    await expect(promise).rejects.toThrow('The search worker failed to start.');
  });
});
