import { APTITUDE_BY_PINK_GROUP, aptitudeLift } from './aptitude.js';
import { DomainError } from './error-response.js';
import type { MasterData } from './master-data.js';
import { ancestorSparks, emptySparkSet, summariseSparks } from './sparks.js';
import type { AncestorSparkSet, SparkSummaryRow } from './spark-types.js';
import { explain } from './engine.js';
import type { AncestorIdentity, LineageResponse } from '@umalegacies/types';
import {
  GRANDPARENT_POSITIONS,
  PARENT_POSITIONS,
  type AncestorRef,
  type ExplainRequest,
  type ExplainResponse,
  type Position,
  type Resolution,
} from './types.js';

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

/**
 * Which card's art goes above the trainee.
 *
 * Three cases, and the middle one is the only one that refuses to guess.
 *
 * 1. No `traineeCardId`: fall back to the character's lowest card, the base
 *    costume. An approximation, and a blessed one -- the trainee shows no sparks,
 *    so the wrong costume there changes no number, only a face.
 * 2. A `traineeCardId` belonging to a DIFFERENT character: reject. That is not an
 *    approximation, it is somebody else's face over this lineage's numbers, and
 *    it can only come from a client bug. Drawing card 100701's art above "Oguri
 *    Cap" is the exact failure that made portraits key on card_id rather than
 *    chara_id in the first place.
 * 3. A `traineeCardId` this extract has never heard of -- a patch added a costume
 *    and the extract has not been rebuilt: fall back to the base costume, same as
 *    case 1. The character is still who they say they are.
 */
function traineePortrait(request: ExplainRequest, master: MasterData): number | null {
  const { traineeCardId, traineeCharaId } = request;
  if (traineeCardId === undefined) return master.baseCardFor(traineeCharaId);
  const owner = master.charaIdFor(traineeCardId);
  if (owner === null) return master.baseCardFor(traineeCharaId);
  if (owner !== traineeCharaId) {
    throw new DomainError(
      'TRAINEE_CARD_MISMATCH',
      `traineeCardId ${traineeCardId} belongs to chara ${owner} ` +
        `(${master.charaName(owner)}), not to traineeCharaId ${traineeCharaId} ` +
        `(${master.charaName(traineeCharaId)}). A card is a costume, so this would ` +
        "draw one character's art above another character's affinity.",
      400,
      'traineeCardId',
    );
  }
  return traineeCardId;
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
/**
 * Fill in what each PINK does to the trainee's aptitude at career start.
 *
 * Done here rather than in `summariseSparks` because it needs two things that
 * function has no business knowing: who is being trained, and the game data
 * that says what their card's aptitudes are.
 *
 * THE CARD, NOT THE CHARACTER, and no fallback to the base costume. Aptitudes
 * belong to the costume: Haru Urara's [Bestest Prize] is Mile B and her
 * [New Year] is Mile A, one step apart, which is exactly one pink threshold.
 * `traineePortrait` falls back to a base card because any face of the right
 * character is better than none; doing the same here would print another
 * costume's grades with total confidence. A request with no card gets null.
 */
function withAptitudes(
  rows: SparkSummaryRow[],
  request: ExplainRequest,
  master: MasterData,
): SparkSummaryRow[] {
  const cardId = request.traineeCardId ?? null;
  for (const row of rows) {
    if (row.kind !== 'pink') continue;
    const key = APTITUDE_BY_PINK_GROUP[row.groupId];
    if (key === undefined) continue;
    row.aptitude = aptitudeLift(master.aptitude(cardId, key), row.stars);
  }
  return rows;
}

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
      portraitCardId: traineePortrait(request, master),
      resolution: traineeResolution(request.traineeCharaId, master),
    },
    ancestors,
    sparks: withAptitudes(summariseSparks(sparksByPosition, ia), request, master),
  };
}
