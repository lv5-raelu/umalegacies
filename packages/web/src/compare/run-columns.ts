import type {
  ExplainPairRequest,
  LineageResponse,
  ResolvedVeteran,
  RosterResolveResponse,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';
import { isLegalPair, pickBlock } from '@umalegacies/core';
import { explainPairRequest, ownVeterans } from '../roster/picks';
import { explainFailure } from '../lineage/explain-local';
import type { TrayPair } from './tray';

/**
 * What one compare column is showing. Every column is exactly one of these.
 *
 * `loading` is never stored: a column whose key has no result IS loading, so a
 * column can never show another pair's numbers while it waits for its own.
 */
export type ColumnResult =
  | { kind: 'ok'; lineage: LineageResponse }
  | { kind: 'blocked'; reason: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

/** One pair to explain, under the key its result is stored at. */
export interface ColumnJob {
  key: string;
  pair: TrayPair;
}

/**
 * Why the trainee makes this pair impossible, in the words a card would use,
 * or null if it is a legal pair.
 *
 * `isLegalPair` DECIDES and `pickBlock` only WORDS it: `pickBlock` returns null
 * early for the same veteran on both sides, because on the roster that case is
 * "unselect", not a rule.
 */
export function blockReason(
  a: ResolvedVeteran,
  b: ResolvedVeteran,
  traineeCharaId: number,
): string | null {
  if (isLegalPair(a, b, traineeCharaId)) return null;
  if (pickBlock(a, [], traineeCharaId) === 'is-trainee') return 'P1 is the trainee';
  if (pickBlock(b, [], traineeCharaId) === 'is-trainee') return 'P2 is the trainee';
  if (a.index === b.index) return 'P1 and P2 are the same veteran';
  return 'P1 and P2 are the same uma';
}

/**
 * Explain each job, writing each result as it lands.
 *
 * Every column on its own: a load failure belongs to the column it happened in
 * and nothing else on the page changes. A STALE extract is the exception -- it
 * is the whole page's problem, so it goes to `onStale` once and to no column,
 * rather than as four copies of one message.
 *
 * `isCancelled` is asked after every await, exactly as App's own effect does, so
 * a slow result for the previous trainee or tray can never paint over the
 * current one. A blocked pair never reaches `explain`.
 */
export async function runColumns(
  jobs: readonly ColumnJob[],
  deps: {
    trainee: TraineeOption;
    roster: RosterResolveResponse;
    veterans: readonly RosterVeteranInput[];
    explain: (request: ExplainPairRequest) => Promise<LineageResponse>;
    isCancelled: () => boolean;
    onResult: (key: string, result: ColumnResult) => void;
    onStale: () => void;
  },
): Promise<void> {
  let staleReported = false;
  await Promise.all(
    jobs.map(async ({ key, pair }) => {
      const [a, b] = ownVeterans(pair, deps.roster);
      // The tray is validated on restore and cleared with the roster, so a
      // missing half means the roster moved underneath it: say so, in place.
      if (!a || !b) {
        deps.onResult(key, { kind: 'error', message: 'This pair is no longer in your roster.' });
        return;
      }
      const reason = blockReason(a, b, deps.trainee.charaId);
      if (reason !== null) {
        deps.onResult(key, { kind: 'blocked', reason });
        return;
      }
      const request = explainPairRequest(deps.trainee, pair, deps.veterans);
      if (!request) return;
      try {
        const lineage = await deps.explain(request);
        if (deps.isCancelled()) return;
        deps.onResult(key, { kind: 'ok', lineage });
      } catch (error) {
        if (deps.isCancelled()) return;
        const failure = explainFailure(error);
        if (failure.stale) {
          if (!staleReported) deps.onStale();
          staleReported = true;
          return;
        }
        deps.onResult(key, { kind: 'error', message: failure.message });
      }
    }),
  );
}
