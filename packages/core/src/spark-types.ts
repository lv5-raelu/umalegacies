/**
 * The spark taxonomy and the runtime tables behind it.
 *
 * Kept separate from affinity/types.ts because nothing here feeds an affinity
 * rule: sparks are what the affinity numbers are FOR. The one dependency runs
 * the other way, since a spark's activation rate is scaled by the Individual
 * Affinity of the ancestor carrying it.
 *
 * The wire SHAPES live in @umalegacies/types and are re-exported here so the
 * import sites do not care which of the two files a name comes from. What stays
 * is the runtime: the factor_type map, the base rates, and the render order.
 */
export type {
  AncestorSpark,
  AncestorSparkSet,
  SparkCarrier,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';

import type { SparkKind } from '@umalegacies/types';

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
