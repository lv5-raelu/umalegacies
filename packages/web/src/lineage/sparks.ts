import type { SparkKind } from '../api/types';

/**
 * A spark's hue is category identity, never decoration, and it appears only as
 * a 3px tick and a bar. DESIGN.md: colour is never a fill.
 */
export const SPARK_COLOR: Readonly<Record<SparkKind, string>> = {
  blue: 'var(--spark-blue)',
  pink: 'var(--spark-pink)',
  green: 'var(--spark-green)',
  white_skill: 'var(--spark-white)',
  white_race: 'var(--spark-white)',
  white_scenario: 'var(--spark-white)',
};

/** The three whites share one hue, so their tick is outlined rather than filled. */
export const isWhite = (kind: SparkKind): boolean => kind.startsWith('white');

export const SPARK_GROUP_LABEL: Readonly<Record<SparkKind, string>> = {
  blue: 'blue · stat',
  pink: 'pink · aptitude',
  green: 'green · unique',
  white_race: 'white · race',
  white_skill: 'white · skill',
  white_scenario: 'white · scenario',
};

export const SPARK_KIND_ORDER: readonly SparkKind[] = [
  'blue',
  'pink',
  'green',
  'white_race',
  'white_skill',
  'white_scenario',
];

/**
 * Percentages are rounded to whole numbers, with one exception: anything above
 * zero but below half a percent prints `<1%` rather than `0%`. A rounded-away
 * chance and an impossible one are different facts.
 */
export function percent(p: number): string {
  if (p <= 0) return '0%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

/** The star count on a single spark. Lineage totals use the same glyph. */
export const stars = (n: number): string => `${n}★`;

/** Whites are a bare count on a node, and a count needs its plural. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
