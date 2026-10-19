import { describe, expect, it, vi } from 'vitest';
import type {
  LineageResponse,
  ParentPick,
  ResolvedVeteran,
  RosterResolveResponse,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';
import { StaleMasterError } from '../lineage/master-source';
import { runColumns, type ColumnResult } from './run-columns';
import type { TrayPair } from './tray';

const veteran = (index: number, cardId: number, charaId: number): ResolvedVeteran => ({
  index,
  score: 10_000,
  self: { cardId, charaId, name: `uma ${charaId}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks: [],
  unknownFactorIds: [],
  ok: true,
});

// Two Oguri Caps in different costumes, a Gold Ship and a Special Week.
const roster = {
  veterans: [
    veteran(0, 100601, 1006),
    veteran(1, 100602, 1006),
    veteran(2, 101401, 1014),
    veteran(3, 100101, 1001),
  ],
  sparkOptions: [],
  unresolvedCount: 0,
  masterHash: 'abc',
} as RosterResolveResponse;

const veterans: RosterVeteranInput[] = roster.veterans.map((v) => ({
  score: v.score,
  self: { cardId: v.self.cardId, factorIds: [], winSaddleIds: [] },
  parents: [null, null],
}));

const specialWeek: TraineeOption = {
  cardId: 100101,
  charaId: 1001,
  name: 'Special Week',
  costume: null,
  ambiguous: false,
};
const goldShip: TraineeOption = { ...specialWeek, cardId: 101401, charaId: 1014, name: 'Gold Ship' };

const own = (index: number): ParentPick => ({
  kind: 'own',
  index,
  cardId: roster.veterans[index]?.self.cardId ?? 0,
});
const pair = (a: number, b: number): TrayPair => [own(a), own(b)];
const lineage = { masterHash: 'abc' } as LineageResponse;

const run = async (
  jobs: Array<{ key: string; pair: TrayPair }>,
  over: {
    trainee?: TraineeOption;
    explain?: () => Promise<LineageResponse>;
    isCancelled?: () => boolean;
  } = {},
) => {
  const results = new Map<string, ColumnResult>();
  const onStale = vi.fn();
  const explain = vi.fn(over.explain ?? (() => Promise.resolve(lineage)));
  await runColumns(jobs, {
    trainee: over.trainee ?? goldShip,
    roster,
    veterans,
    explain,
    isCancelled: over.isCancelled ?? (() => false),
    onResult: (key, result) => results.set(key, result),
    onStale,
  });
  return { results, onStale, explain };
};

describe('runColumns', () => {
  it('explains a legal pair', async () => {
    const { results } = await run([{ key: 'k', pair: pair(0, 3) }]);
    expect(results.get('k')).toEqual({ kind: 'ok', lineage });
  });

  it('blocks a pair the trainee makes illegal, in words, and never explains it', async () => {
    const { results, explain } = await run([
      { key: 'p2', pair: pair(0, 2) },
      { key: 'p1', pair: pair(2, 0) },
      { key: 'same', pair: pair(0, 1) },
    ]);
    expect(results.get('p2')).toEqual({ kind: 'blocked', reason: 'P2 is the trainee' });
    expect(results.get('p1')).toEqual({ kind: 'blocked', reason: 'P1 is the trainee' });
    expect(results.get('same')).toEqual({ kind: 'blocked', reason: 'P1 and P2 are the same uma' });
    expect(explain).not.toHaveBeenCalled();
  });

  it('sends a stale extract to the banner once, and to no column', async () => {
    const { results, onStale } = await run(
      [
        { key: 'a', pair: pair(0, 3) },
        { key: 'b', pair: pair(2, 3) },
      ],
      { trainee: { ...specialWeek, charaId: 9999 }, explain: () => Promise.reject(new StaleMasterError('a', 'b')) },
    );
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(0);
  });

  it('keeps any other failure to its own column', async () => {
    let call = 0;
    const { results } = await run(
      [
        { key: 'a', pair: pair(0, 3) },
        { key: 'b', pair: pair(2, 3) },
      ],
      {
        trainee: { ...specialWeek, charaId: 9999 },
        explain: () =>
          call++ === 0 ? Promise.reject(new Error('Could not load the game data')) : Promise.resolve(lineage),
      },
    );
    expect(results.get('a')).toEqual({ kind: 'error', message: 'Could not load the game data' });
    expect(results.get('b')).toEqual({ kind: 'ok', lineage });
  });

  it('writes nothing once cancelled mid-flight', async () => {
    let cancelled = false;
    const { results } = await run([{ key: 'k', pair: pair(0, 3) }], {
      explain: () => {
        cancelled = true;
        return Promise.resolve(lineage);
      },
      isCancelled: () => cancelled,
    });
    expect(results.size).toBe(0);
  });
});
