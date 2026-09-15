/**
 * The wire shapes this app reads, mirrored from packages/api/src.
 *
 * Deliberately duplicated rather than imported. A shared types package is a
 * build-order dependency between the two workspaces, and these are six
 * interfaces. Revisit when the duplication actually costs something.
 */

export type RuleId =
  | 'total.pair'
  | 'individual.member'
  | 'link.pair'
  | 'base.two_way'
  | 'base.three_way'
  | 'base.self_link'
  | 'bonus.shared_g1'
  | 'row.relation'
  | 'row.saddle'
  | 'base.absent_ancestor'
  | 'bonus.absent_ancestor';

export interface Citation {
  label: string;
  url?: string;
  quote?: string;
}

export interface MasterRef {
  table: string;
  key: Record<string, number>;
  columns: Record<string, number | string>;
}

export type Resolution =
  | { ok: true }
  | {
      ok: false;
      reason: 'unknown_chara' | 'unknown_card' | 'unknown_saddle' | 'no_relation_rows';
      id: number;
    };

export interface ExplainNode {
  ruleId: RuleId;
  label: string;
  value: number;
  citation?: Citation;
  sources: MasterRef[];
  children: ExplainNode[];
  resolution?: Resolution;
}

export type SparkKind =
  | 'blue'
  | 'pink'
  | 'green'
  | 'white_skill'
  | 'white_race'
  | 'white_scenario';

export interface AncestorSpark {
  factorId: number;
  groupId: number;
  kind: SparkKind;
  name: string;
  stars: number;
}

export interface AncestorSparkSet {
  blue: AncestorSpark | null;
  pink: AncestorSpark | null;
  green: AncestorSpark | null;
  whites: AncestorSpark[];
  unknownFactorIds: number[];
}

export interface SparkCarrier {
  position: number;
  stars: number;
  individualAffinity: number;
  baseRate: number;
  perInspiration: number;
}

export interface SparkSummaryRow {
  groupId: number;
  kind: SparkKind;
  name: string;
  /** The LINEAGE total, not a maximum across carriers. */
  stars: number;
  carriers: SparkCarrier[];
  onceInCareer: number;
  twiceInCareer: number;
}

export interface AncestorIdentity {
  position: number;
  cardId: number;
  charaId: number | null;
  name: string;
  sparks: AncestorSparkSet;
  resolution: Resolution;
}

export interface LineageResponse {
  pairTotal: ExplainNode;
  individualAffinity: Record<number, ExplainNode>;
  relationRank: { value: number; ruleId: 'rank.lookup'; sources: MasterRef[] };
  rankBounds: { min: number; max: number };
  masterHash: string;
  /** `resolution` says whether the trainee's chara_id is one master.mdb knows. */
  trainee: {
    charaId: number;
    name: string;
    /** Base costume, for the portrait only. The request carries no trainee card. */
    portraitCardId: number | null;
    resolution: Resolution;
  };
  /** Always all six keys. `null` is an empty slot, and the tree keeps its shape. */
  ancestors: Record<number, AncestorIdentity | null>;
  sparks: SparkSummaryRow[];
}

export interface AncestorRef {
  cardId: number;
  winSaddleIds: number[];
  factorIds?: number[];
}

export interface ExplainRequest {
  traineeCharaId: number;
  parents: [AncestorRef, AncestorRef];
  grandparents: [
    AncestorRef | null,
    AncestorRef | null,
    AncestorRef | null,
    AncestorRef | null,
  ];
  masterHash?: string;
}

export interface FixtureSummary {
  name: string;
  description: string;
  request: ExplainRequest;
}

/** Slot order as the tree renders it: parents, then grandparents left to right. */
export const PARENT_POSITIONS = [10, 20] as const;
export const GRANDPARENT_POSITIONS = [11, 12, 21, 22] as const;
export const ALL_POSITIONS = [10, 20, 11, 12, 21, 22] as const;
