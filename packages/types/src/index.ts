/**
 * The wire types both workspaces read.
 *
 * TYPES ONLY. Nothing in this package may emit JavaScript -- no `const`, no
 * `enum`, no function. The package is consumed straight from TypeScript source
 * with no build step, which works only because every import of it is an
 * `import type` that erases. A runtime export here would compile, pass every
 * test, and then crash the built API at startup on `require('@umalegacies/types')`
 * resolving to a `.ts` file Node cannot run. `types-are-types.test.ts` in the API
 * enforces this, because the failure is invisible until production.
 *
 * Runtime constants that describe these shapes (position tuples, base rates,
 * kind ordering) stay in the workspace that owns the behaviour.
 *
 * This replaces the hand-mirrored copy that used to live in
 * packages/web/src/api/types.ts, and reverses the README's position that a
 * shared package was a build-order dependency not worth paying. It is not a
 * build-order dependency: there is no build.
 */

// ---------------------------------------------------------------- provenance

export type RuleId =
  | 'total.pair'
  | 'individual.member'
  | 'link.pair'
  | 'base.two_way'
  | 'base.three_way'
  /**
   * A self-linked base is a THIRD kind of zero: the rule suppressed it, as
   * opposed to "they share nothing" or "I could not resolve this". Without its
   * own id the 5774 fixture's diagnostic signature is invisible in the UI.
   */
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
   * `succession_relation_member.id` is an arbitrary surrogate and master.mdb has
   * no version table, so a cited rowId silently rots when a patch renumbers rows.
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

/** position_id values: 10 and 20 are parents, 11/12/21/22 grandparents. */
export type Position = 10 | 20 | 11 | 12 | 21 | 22;

// ---------------------------------------------------------------- affinity

export interface AncestorRef {
  /** Ancestors carry card_id only, never trained_chara_id. */
  cardId: number;
  /**
   * MATCH ON THESE RAW IDS. Do NOT normalise to group_id: the same race at a
   * different racecourse is a DIFFERENT win (JBC Classic, Takarazuka Kinen).
   * group_id looks like a matching key and is not.
   */
  winSaddleIds: number[];
  /**
   * succession_factor.factor_id per spark this ancestor carries. Optional: no
   * affinity rule reads it and every number in ExplainResponse is computed
   * without it. Only the spark summary needs it.
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
  /**
   * The COSTUME being trained. Optional, and it changes no computed number --
   * the trainee shows no sparks -- but a card is a costume and a costume carries
   * its own unique skill, so this is the difference between the tree drawing the
   * costume in front of you and the base one. Omitted, the server falls back to
   * the character's lowest card id.
   */
  traineeCardId?: number;
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
  /** 7 base + 5 bonus. Drives the rank icon via relationRank. */
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

// ---------------------------------------------------------------- sparks

export type SparkKind =
  | 'blue'
  | 'pink'
  | 'green'
  | 'white_skill'
  | 'white_race'
  | 'white_scenario';

/** One spark on one ancestor. */
export interface AncestorSpark {
  factorId: number;
  groupId: number;
  kind: SparkKind;
  name: string;
  /** succession_factor.rarity, the star count 1-3. Not a rarity tier. */
  stars: number;
}

/**
 * Every ancestor carries exactly one blue, one pink and one green, and 12-19
 * whites. The three named slots are nullable only because a slot can be empty
 * or unresolved.
 */
export interface AncestorSparkSet {
  blue: AncestorSpark | null;
  pink: AncestorSpark | null;
  green: AncestorSpark | null;
  /** The bag. A node shows its length; the detail panel shows its contents. */
  whites: AncestorSpark[];
  /** factor ids the save carried that master.mdb has no row for. Named, not swallowed. */
  unknownFactorIds: number[];
}

/** One ancestor's contribution to a summary row. */
export interface SparkCarrier {
  /** Always one of the six ancestor slots, never the trainee. */
  position: Position;
  stars: number;
  /** The Individual Affinity that scaled this carrier's rate. */
  individualAffinity: number;
  /** Activation rate before affinity. */
  baseRate: number;
  /** baseRate x (1 + IA/100), capped at 1. One inspiration, this carrier alone. */
  perInspiration: number;
}

/** One distinct spark across a whole composed lineage. */
export interface SparkSummaryRow {
  groupId: number;
  kind: SparkKind;
  name: string;
  /** Lineage TOTAL of stars, not a maximum across carriers. */
  stars: number;
  carriers: SparkCarrier[];
  /** P(at least one activation) across the two inspirations a career gives. */
  onceInCareer: number;
  /** P(at least two). A doubled spark stacks, so it is worth its own column. */
  twiceInCareer: number;
}

// ---------------------------------------------------------------- lineage

/** Who sits in one slot, and what it can pass down. */
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
  /** The trainee resolves or it does not, and this says which. */
  trainee: {
    charaId: number;
    name: string;
    /** The costume's card if the request named one, else the base costume's. */
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

export interface FixtureSummary {
  name: string;
  description: string;
  request: ExplainRequest;
}

// ---------------------------------------------------------------- roster (M3)

/**
 * One uma as it leaves the browser: the three public game fields and nothing
 * else. All three are ids into master.mdb that describe a character, never the
 * player who trained them.
 *
 * The save is slimmed to this shape ON THE CLIENT, before anything is sent. The
 * product's promise is that the file never leaves the machine in any meaningful
 * sense, and the strongest way to keep it is for the personal fields to have no
 * wire representation at all. `owner_viewer_id` alone is 184 distinct 12-digit
 * trainer ids belonging to OTHER players in the builder's own save; it, along
 * with nicknames, timestamps, stats, skills and race history, is dropped before
 * the request is built rather than dropped after it arrives.
 */
export interface RosterMemberInput {
  cardId: number;
  winSaddleIds: number[];
  factorIds: number[];
}

/**
 * A veteran as the user chooses it: THREE umas, not six. Itself, plus its own
 * slots 10 and 20, which become the grandparents beneath it when it is picked
 * as a parent. Picking a veteran fixes all three; the package is indivisible.
 */
export interface RosterVeteranInput {
  /** rank_score. The only save figure here that is not an id into master.mdb. */
  score: number;
  self: RosterMemberInput;
  /** The veteran's own slots 10 and 20. null when the save has no such slot. */
  parents: [RosterMemberInput | null, RosterMemberInput | null];
}

export interface RosterResolveRequest {
  veterans: RosterVeteranInput[];
  masterHash?: string;
}

export interface ResolvedMember {
  cardId: number;
  charaId: number | null;
  name: string;
  /**
   * The bracketed costume label, e.g. "[Special Dreamer]". null when this
   * character has only one card, where a tag would be noise. 74 of 105 cards
   * belong to a character with more than one.
   */
  costume: string | null;
  sparks: AncestorSparkSet;
  resolution: Resolution;
}

/**
 * One spark across one veteran's package, with stars kept PER MEMBER rather
 * than summed.
 *
 * Per-member is what lets a single index answer both filter dimensions without
 * a rebuild. SCOPE decides which entries count (the whole package, the direct
 * parent alone, or the two grandparents); SPLIT decides whether they are
 * compared one at a time or added together. Summing at build time would throw
 * the split dimension away, and it is the dimension M7's borrow search needs.
 */
export interface PackageSpark {
  groupId: number;
  kind: SparkKind;
  name: string;
  /** [the veteran itself, its slot 10, its slot 20]. 0 where that uma lacks it. */
  stars: [number, number, number];
}

export interface ResolvedVeteran {
  /**
   * Position in the request array. The client's handle for this veteran for the
   * life of one page load. NOT a game id and not derived from one: the save's
   * `trained_chara_id` never crosses the wire.
   */
  index: number;
  score: number;
  self: ResolvedMember;
  parents: [ResolvedMember | null, ResolvedMember | null];
  /** Every distinct spark in the package, for filtering. */
  sparks: PackageSpark[];
  /**
   * False when any of the three members failed to resolve. A row-level failure,
   * never an upload-level one: one unknown card_id after a game patch must not
   * brick the other 258 veterans during the window before re-extraction.
   */
  ok: boolean;
}

/** Every distinct spark present in the roster, for the filter's selector. */
export interface RosterSparkOption {
  groupId: number;
  kind: SparkKind;
  name: string;
  /** How many veteran packages carry it at all. Orders the selector by usefulness. */
  veterans: number;
}

export interface RosterResolveResponse {
  veterans: ResolvedVeteran[];
  sparkOptions: RosterSparkOption[];
  /** How many veterans have at least one unresolved member. Drives the banner. */
  unresolvedCount: number;
  masterHash: string;
}

/** Which members of a package a criterion looks at. Mirrors uma.moe's scope selector. */
export type FilterScope = 'package' | 'parent' | 'grandparents';

/**
 * Whether the threshold must be met by ONE uma or by the scoped members summing.
 * uma.moe calls this Split Sparks. Its exact in-game semantics are inferred from
 * the toggle label and have not been confirmed against behaviour.
 */
export type FilterSplit = 'sum' | 'single';

export interface SparkCriterion {
  groupId: number;
  minStars: number;
  scope: FilterScope;
  split: FilterSplit;
}

// ---------------------------------------------------------------- pair (M3)

/** A veteran's three-slot package, as the client hands it back to be composed. */
export interface VeteranPackage {
  self: AncestorRef;
  parents: [AncestorRef | null, AncestorRef | null];
}

/**
 * The server composes; the client never builds an ExplainRequest.
 *
 * Measured at 772 bytes against 5,745 for the composed ExplainRequest it turns
 * into, and it keeps slot mapping -- which grandparent sits under which parent
 * -- in one tested place instead of in the UI.
 */
export interface ExplainPairRequest {
  traineeCharaId: number;
  /** The costume being trained. Decides the portrait; changes no number. */
  traineeCardId?: number;
  veteranA: VeteranPackage;
  veteranB: VeteranPackage;
  masterHash?: string;
}

/** One selectable trainee: a CARD, because a card is a costume. */
export interface TraineeOption {
  cardId: number;
  charaId: number;
  name: string;
  costume: string | null;
  /**
   * True when this character has more than one card, i.e. the costume tag is
   * load-bearing rather than decorative. 74 of 105 cards.
   */
  ambiguous: boolean;
}

// ---------------------------------------------------------------- errors

export interface ErrorResponse {
  code: string;
  message: string;
  field?: string;
}
