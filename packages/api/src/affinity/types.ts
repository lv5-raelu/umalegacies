/**
 * The wire types for POST /affinity/explain.
 *
 * The keystone of this product is `ExplainNode`: every number the UI shows is
 * a node that opens onto the rows that produced it. See
 * docs/designs/planner-that-shows-its-work.md.
 */

export type RuleId =
  | 'total.pair'
  | 'individual.member'
  | 'link.pair'
  | 'base.two_way'
  | 'base.three_way'
  // DEVIATION from the design doc's ten rule ids, added deliberately. The doc
  // requires that a 0 from "they share nothing" never look like a 0 from "I
  // could not resolve this". A self-linked base is a THIRD zero: the rule
  // suppressed it. Without its own id the 5774 fixture's whole diagnostic
  // signature is invisible in the UI.
  | 'base.self_link'
  | 'bonus.shared_g1'
  | 'row.relation'
  | 'row.saddle'
  | 'base.absent_ancestor'
  | 'bonus.absent_ancestor';

/** Community research behind a rule: link out, quote inline, or both. */
export interface Citation {
  label: string;
  url?: string;
  quote?: string;
}

export interface MasterRef {
  table:
    | 'succession_relation'
    | 'succession_relation_member'
    | 'single_mode_wins_saddle'
    | 'succession_relation_rank'
    | 'card_data'
    | 'text_data';
  /**
   * The NATURAL key, e.g. { relation_type: 3, chara_id: 1016 }.
   * `succession_relation_member.id` is an arbitrary surrogate and master.mdb
   * has no version table, so a cited rowId silently rots when a patch
   * renumbers rows. Domain Model Correction 3.
   */
  key: Record<string, number>;
  columns: Record<string, number | string>;
}

/**
 * Present on leaves only, and only where a lookup actually happened. A 0 from
 * "they share nothing" and a 0 from "I could not resolve this id" must never
 * look alike: this product's whole claim is that a number opens, and an
 * unexplained 0 opening onto an empty drawer inverts it.
 */
export type Resolution =
  | { ok: true }
  | {
      ok: false;
      reason: 'unknown_chara' | 'unknown_card' | 'unknown_saddle' | 'no_relation_rows';
      id: number;
    };

export interface ExplainNode {
  /**
   * THE single discriminant. Kind and display text derive from it client-side,
   * so they cannot drift out of sync with the rule they describe.
   */
  ruleId: RuleId;
  label: string;
  value: number;
  citation?: Citation;
  sources: MasterRef[];
  /** INVARIANT: value === sum(children.value) when children is non-empty. */
  children: ExplainNode[];
  resolution?: Resolution;
}

export interface AncestorRef {
  /** Ancestors carry card_id only, never trained_chara_id. */
  cardId: number;
  /**
   * MATCH ON THESE RAW IDS. Do NOT normalise to group_id: the same race at a
   * different racecourse is a DIFFERENT win (JBC Classic, Takarazuka Kinen).
   * group_id looks like a matching key and is not. Verified 2026-09-10.
   */
  winSaddleIds: number[];
  /**
   * succession_factor.factor_id per spark this ancestor carries, from the save's
   * `factor_info_array`. Optional: no affinity rule reads it, and the engine
   * computes every number in ExplainResponse without it. Only the spark summary
   * needs it. The save's sibling `level` field is always 0 across all 1,554
   * ancestor slots in the builder's roster, so it is not carried.
   */
  factorIds?: number[];
}

/** Grandparent slots, in order: 11, 12 (under parent 10), 21, 22 (under parent 20). */
export type GrandparentTuple = [
  AncestorRef | null,
  AncestorRef | null,
  AncestorRef | null,
  AncestorRef | null,
];

export interface ExplainRequest {
  /** chara_id from card_data. The trainee has not raced, so carries no wins. */
  traineeCharaId: number;
  /** position_id 10 and 20. */
  parents: [AncestorRef, AncestorRef];
  grandparents: GrandparentTuple;
  /**
   * Optional echo of GET /master/meta. When present and NOT equal to the hash
   * the server is serving, the request is refused with 409 STALE_MASTER_HASH
   * rather than answered from different game data.
   */
  masterHash?: string;
}

export interface ExplainResponse {
  /** 7 base + 5 bonus. Drives the ◎/〇/△ icon via relationRank. */
  pairTotal: ExplainNode;
  /** Keyed by position_id. 4 links feed a parent, 1 feeds a grandparent. */
  individualAffinity: Record<number, ExplainNode>;
  /**
   * The icon verdict opens too, but it is a LOOKUP and not a sum, so it is
   * deliberately NOT an ExplainNode: a value of 3 with children summing to 337
   * would break the sum invariant every other node obeys.
   */
  relationRank: {
    value: number;
    ruleId: 'rank.lookup';
    sources: MasterRef[];
  };
  rankBounds: { min: number; max: number };
  /** Authoritative. The server owns master.mdb. */
  masterHash: string;
}

/** position_id values, in the order the tree renders them. */
export const PARENT_POSITIONS = [10, 20] as const;
export const GRANDPARENT_POSITIONS = [11, 12, 21, 22] as const;
export const ALL_POSITIONS = [10, 20, 11, 12, 21, 22] as const;

type ParentPosition = (typeof PARENT_POSITIONS)[number];
type GrandparentPosition = (typeof GRANDPARENT_POSITIONS)[number];
export type Position = (typeof ALL_POSITIONS)[number];

/** Which parent each grandparent slot sits under. */
export const PARENT_OF: Record<GrandparentPosition, ParentPosition> = {
  11: 10,
  12: 10,
  21: 20,
  22: 20,
};
