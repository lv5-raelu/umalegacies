import type { MasterData } from '../master/master-data';
import { ancestorSparks, emptySparkSet, summariseSparks } from '../sparks/sparks';
import type { AncestorSparkSet, SparkSummaryRow } from '../sparks/spark-types';
import { explain } from './engine';
import type { AncestorIdentity, LineageResponse } from '@umalegacies/types';
import {
  GRANDPARENT_POSITIONS,
  PARENT_POSITIONS,
  type AncestorRef,
  type ExplainRequest,
  type ExplainResponse,
  type Position,
  type Resolution,
} from './types';

export type { AncestorIdentity, LineageResponse } from '@umalegacies/types';

/**
 * Three states, not two: known with relations, known with none, and never heard
 * of. `unknown_chara` existed in the Resolution union and was emitted nowhere,
 * while the case it was named for was being reported as `no_relation_rows`.
 */
function traineeResolution(charaId: number, master: MasterData): Resolution {
  if (master.hasChara(charaId)) return { ok: true };
  if (!master.knowsChara(charaId)) return { ok: false, reason: 'unknown_chara', id: charaId };
  return { ok: false, reason: 'no_relation_rows', id: charaId };
}

function identify(
  position: Position,
  ref: AncestorRef,
  master: MasterData,
): AncestorIdentity {
  const charaId = master.charaIdFor(ref.cardId);
  return {
    position,
    cardId: ref.cardId,
    charaId,
    name: charaId === null ? `card ${ref.cardId}` : master.charaName(charaId),
    // An unresolved card still gets a spark set: its factor ids are the save's
    // and master.mdb knows them regardless of whether it knows the card.
    sparks: ancestorSparks(ref, master),
    resolution:
      charaId === null ? { ok: false, reason: 'unknown_card', id: ref.cardId } : { ok: true },
  };
}

/**
 * The whole screen in one response: the affinity tree, who each slot is, and
 * what the lineage can pass down with what odds.
 *
 * Composed rather than merged into `explain()` so the engine's golden tests
 * keep asserting against an affinity-only shape, and so a lineage with no
 * `factorIds` anywhere still returns every affinity number.
 */
export function explainLineage(
  request: ExplainRequest,
  master: MasterData,
  masterHash: string,
): LineageResponse {
  const affinity = explain(request, master, masterHash);

  const ancestors: Record<number, AncestorIdentity | null> = {};
  const sparksByPosition = new Map<Position, AncestorSparkSet>();

  for (const [i, position] of PARENT_POSITIONS.entries()) {
    const identity = identify(position, request.parents[i] as AncestorRef, master);
    ancestors[position] = identity;
    sparksByPosition.set(position, identity.sparks);
  }
  for (const [i, position] of GRANDPARENT_POSITIONS.entries()) {
    const ref = request.grandparents[i] ?? null;
    if (!ref) {
      ancestors[position] = null;
      sparksByPosition.set(position, emptySparkSet());
      continue;
    }
    const identity = identify(position, ref, master);
    ancestors[position] = identity;
    sparksByPosition.set(position, identity.sparks);
  }

  const ia = new Map<number, number>(
    Object.entries(affinity.individualAffinity).map(([position, node]) => [
      Number(position),
      node.value,
    ]),
  );

  return {
    ...affinity,
    trainee: {
      charaId: request.traineeCharaId,
      name: master.charaName(request.traineeCharaId),
      portraitCardId: master.baseCardFor(request.traineeCharaId),
      resolution: traineeResolution(request.traineeCharaId, master),
    },
    ancestors,
    sparks: summariseSparks(sparksByPosition, ia),
  };
}
