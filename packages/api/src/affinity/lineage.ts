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
  sparks: AncestorSparkSet;
  resolution: Resolution;
}

export interface LineageResponse extends ExplainResponse {
  /**
   * The trainee resolves or it does not, and this says which.
   *
   * Without it an unknown chara_id produced a CONFIDENT wrong answer: every
   * trainee-touching base term silently collapsed (both trainee-parent links and
   * all four three-way grandparent terms, which include the trainee), so a
   * lineage worth 352 printed 352 -> 227 under an unqualified headline and a
   * rank-3 verdict. types.ts says a zero from "they share nothing" and a zero
   * from "I could not resolve this" must never look alike; this is that rule
   * applied to the one member that had been exempt from it.
   *
   * The realistic trigger is not adversarial: a patch adds an uma, the extract
   * has not been rebuilt, the user picks her.
   */
  trainee: {
    charaId: number;
    name: string;
    /**
     * The base costume's card, for the portrait only. The request carries no
     * trainee card, and the trainee shows no sparks, so this affects no number.
     */
    portraitCardId: number | null;
    resolution: Resolution;
  };
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
      portraitCardId: master.baseCardFor(request.traineeCharaId),
      resolution: master.hasChara(request.traineeCharaId)
        ? { ok: true }
        : { ok: false, reason: 'no_relation_rows', id: request.traineeCharaId },
    },
    ancestors,
    sparks: summariseSparks(sparksByPosition, ia),
  };
}
