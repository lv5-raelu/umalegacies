/**
 * Affinity wire types, plus the position vocabulary the engine iterates.
 *
 * The SHAPES live in @umalegacies/types so the web app reads the same
 * declarations instead of a hand-kept copy. What stays here is the runtime:
 * the position tuples and the grandparent-to-parent map, which are behaviour
 * this package owns and which a types-only package cannot hold.
 */
export type {
  AncestorRef,
  Citation,
  ExplainNode,
  ExplainPairRequest,
  ExplainRequest,
  ExplainResponse,
  GrandparentTuple,
  MasterRef,
  Position,
  Resolution,
  RuleId,
  VeteranPackage,
} from '@umalegacies/types';

import type { Position } from '@umalegacies/types';

/** position_id values, in the order the tree renders them. */
export const PARENT_POSITIONS = [10, 20] as const satisfies readonly Position[];
export const GRANDPARENT_POSITIONS = [11, 12, 21, 22] as const satisfies readonly Position[];
export const ALL_POSITIONS = [10, 20, 11, 12, 21, 22] as const satisfies readonly Position[];

type ParentPosition = (typeof PARENT_POSITIONS)[number];
type GrandparentPosition = (typeof GRANDPARENT_POSITIONS)[number];

/** Which parent each grandparent slot sits under. */
export const PARENT_OF: Record<GrandparentPosition, ParentPosition> = {
  11: 10,
  12: 10,
  21: 20,
  22: 20,
};
