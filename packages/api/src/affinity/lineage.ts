import type { MasterData } from '../master/master-data';
import { ancestorSparks, emptySparkSet, summariseSparks } from '../sparks/sparks';
import type { AncestorSparkSet, SparkSummaryRow } from '../sparks/spark-types';
import { explain } from './engine';
import {
  GRANDPARENT_POSITIONS,
  PARENT_POSITIONS,
  type AncestorRef,
  type ExplainRequest,
  type ExplainResponse,
  type Position,
  type Resolution,
} from './types';

/**
 * Who sits in one slot, and what it can pass down.
 *
 * The affinity engine deliberately does not carry this: it computes numbers and
 * cites rows, and a portrait is neither. But a screen of seven link values with
 * no names on them cannot be read, and fixture 5531's six slots hold only three
 * distinct characters, so `El Condor Pasa <-> Inari One` appears twice with
 * different values. Position in the tree disambiguates; the name is what makes
 * position legible.
 */
export interface AncestorIdentity {
  position: Position;
  cardId: number;
  /** null when card_data has no such card; `resolution` then says so. */
  charaId: number | null;
  name: string;
  /** Portraits are keyed by chara_id, so a card with no chara has no portrait. */
  sparks: AncestorSparkSet;
  resolution: Resolution;
}

export interface LineageResponse extends ExplainResponse {
  trainee: { charaId: number; name: string };
  /**
   * Keyed by position_id, and ALWAYS carrying all six keys. An absent slot is
   * `null`, not a missing key, so the tree keeps six slots and never reflows
   * between one lineage and the next.
   */
  ancestors: Record<number, AncestorIdentity | null>;
  /** One row per distinct spark across the whole lineage, likeliest first. */
  sparks: SparkSummaryRow[];
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
  const sparksByPosition = new Map<number, AncestorSparkSet>();

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
    },
    ancestors,
    sparks: summariseSparks(sparksByPosition, ia),
  };
}
