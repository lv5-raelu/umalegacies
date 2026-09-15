import type { Position } from '../affinity/types';

/**
 * The spark taxonomy and the wire types for the lineage spark summary.
 *
 * Kept separate from affinity/types.ts because nothing here feeds an affinity
 * rule: sparks are what the affinity numbers are FOR. The one dependency runs
 * the other way, since a spark's activation rate is scaled by the Individual
 * Affinity of the ancestor carrying it.
 */

export type SparkKind =
  | 'blue'
  | 'pink'
  | 'green'
  | 'white_skill'
  | 'white_race'
  | 'white_scenario';

/**
 * succession_factor.factor_type. Verified against the extract 2026-09-15: the
 * 1/2/3-star variants of one spark are three factor_ids under one
 * factor_group_id, and every group's three rows carry the same name (0 of 392
 * groups disagree).
 *
 * A type outside this map is a mechanic added by a patch. Such a factor is
 * dropped rather than guessed at, which is why this is a lookup and not a cast.
 */
export const SPARK_KIND_BY_FACTOR_TYPE: Readonly<Record<number, SparkKind>> = {
  1: 'blue',
  2: 'pink',
  3: 'green',
  4: 'white_skill',
  5: 'white_race',
  6: 'white_scenario',
};

/**
 * Activation rate at 0 Individual Affinity, indexed by star count 1-3.
 * README: blue 70/80/90%, pink 1/3/5%, green 5/10/15%, race 1/2/3%, other
 * whites 3/6/9%.
 *
 * NOT from master.mdb. The game does not publish these; they are community
 * research and this project has not verified them in-game. Every percentage
 * this product prints inherits that caveat, which is why the odds column says
 * where it came from.
 */
export const BASE_RATES: Readonly<Record<SparkKind, readonly [number, number, number]>> = {
  blue: [0.7, 0.8, 0.9],
  pink: [0.01, 0.03, 0.05],
  green: [0.05, 0.1, 0.15],
  white_race: [0.01, 0.02, 0.03],
  white_skill: [0.03, 0.06, 0.09],
  white_scenario: [0.03, 0.06, 0.09],
};

/** The order the audit trail renders its groups in. Structural first, bag last. */
export const SPARK_KIND_ORDER: readonly SparkKind[] = [
  'blue',
  'pink',
  'green',
  'white_race',
  'white_skill',
  'white_scenario',
];

/** One spark on one ancestor. */
export interface AncestorSpark {
  factorId: number;
  groupId: number;
  kind: SparkKind;
  name: string;
  /** succession_factor.rarity, 1-3. */
  stars: number;
}

/**
 * Every ancestor carries exactly one blue, one pink and one green, and 12-19
 * whites. Measured across all 1,554 ancestor slots in the builder's roster:
 * type 1 1,554, type 2 1,554, type 3 1,514, types 4/5/6 14,184. The three
 * named slots are nullable only because a slot can be empty or unresolved.
 */
export interface AncestorSparkSet {
  blue: AncestorSpark | null;
  pink: AncestorSpark | null;
  green: AncestorSpark | null;
  /** The bag. The tree node shows its length; the detail panel shows its contents. */
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
  /** Activation rate before affinity, straight from BASE_RATES. */
  baseRate: number;
  /** baseRate x (1 + IA/100), capped at 1. One inspiration, this carrier alone. */
  perInspiration: number;
}

/**
 * One distinct spark across the whole lineage. The decision is about the
 * lineage, not about one ancestor: measured on fixture 5531, 52 distinct
 * sparks sit across the six ancestors and 30 of them are on more than one.
 */
export interface SparkSummaryRow {
  groupId: number;
  kind: SparkKind;
  name: string;
  /**
   * Lineage TOTAL of stars, not a maximum across carriers. A maximum carries no
   * meaning and would disagree with M7's filter unit.
   */
  stars: number;
  carriers: SparkCarrier[];
  /** P(at least one activation) across the two inspirations a career gives. */
  onceInCareer: number;
  /** P(at least two). A doubled spark stacks, so it is worth its own column. */
  twiceInCareer: number;
}
