import type {
  ExplainPairRequest,
  ExplainRequest,
  GrandparentTuple,
  VeteranPackage,
} from '@umalegacies/types';

/**
 * Two chosen veterans composed into one lineage.
 *
 * THE SLOT MAPPING IS THE WHOLE FUNCTION, and it is the part a refactor breaks
 * silently. Picking a veteran as a parent also fixes that veteran's own two
 * parents as the grandparents beneath it: a veteran is an indivisible package of
 * three umas, not one. So
 *
 *     veteranA.self       -> position 10   (P1)
 *     veteranA.parents[0] -> position 11   (GP1, under P1)
 *     veteranA.parents[1] -> position 12   (GP2, under P1)
 *     veteranB.self       -> position 20   (P2)
 *     veteranB.parents[0] -> position 21   (GP3, under P2)
 *     veteranB.parents[1] -> position 22   (GP4, under P2)
 *
 * and `grandparents` is ordered [11, 12, 21, 22] to match. Interleaving A and B
 * there, or swapping a pair, still produces a well-formed request that computes
 * a plausible total from the right six umas placed wrongly. Nothing downstream
 * can notice. `pair.test.ts` carries a deliberately asymmetric pair whose
 * numbers move if any of these six assignments changes.
 *
 * A missing parent slot composes as `null` rather than throwing. The engine
 * already models an absent ancestor deliberately -- `base.absent_ancestor`, the
 * dashed empty-slot node -- so refusing a veteran for an empty slot would
 * contradict the engine and reject data it can handle.
 */
export function lineageFromPair(request: ExplainPairRequest): ExplainRequest {
  const composed: ExplainRequest = {
    traineeCharaId: request.traineeCharaId,
    parents: [request.veteranA.self, request.veteranB.self],
    grandparents: [
      ...ownParents(request.veteranA),
      ...ownParents(request.veteranB),
    ] as GrandparentTuple,
  };
  // Copied through rather than defaulted: `undefined` and "absent" mean the same
  // thing to every reader downstream, and an explicit `traineeCardId: undefined`
  // would survive JSON.stringify as a missing key anyway.
  if (request.traineeCardId !== undefined) composed.traineeCardId = request.traineeCardId;
  if (request.masterHash !== undefined) composed.masterHash = request.masterHash;
  return composed;
}

const ownParents = (veteran: VeteranPackage) => [veteran.parents[0], veteran.parents[1]];
