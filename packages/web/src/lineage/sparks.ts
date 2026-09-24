import type { SparkKind } from '@umalegacies/types';

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

/*
 * `isWhite` tells this screen the three whites share one hue, so their tick is
 * outlined rather than filled.
 *
 * It and `SPARK_KIND_ORDER` are re-exported from core, not redefined here.
 * Both were duplicated -- byte-identical, so nothing was broken yet -- and both
 * are read by the sweep as well as by this screen. A second copy of the kind
 * ordering is how two surfaces start listing sparks in different orders while
 * every test still passes.
 */
export { SPARK_KIND_ORDER, isWhite } from '@umalegacies/core';

export const SPARK_GROUP_LABEL: Readonly<Record<SparkKind, string>> = {
  blue: 'blue · stat',
  pink: 'pink · aptitude',
  green: 'green · unique',
  white_race: 'white · race',
  white_skill: 'white · skill',
  white_scenario: 'white · scenario',
};

/**
 * Percentages round to whole numbers, with an exception at EACH end.
 *
 * A rounded-away chance and an impossible one are different facts, so anything
 * above zero but below half a percent prints `<1%`. The same is true at the top
 * and was missed: `Math.round` turns 99.6% into `100%`, claiming certainty for a
 * spark that fails one career in 250. That asymmetry mattered more than it
 * looks, because the audit trail now correctly KEEPS a 1-star blue at
 * individual affinity 39-42 (career 99.93% to 99.996%) and would then have
 * printed `100%` next to it anyway.
 *
 * NaN is neither: it means the odds could not be computed, and printing the
 * string `NaN%` in a column of probabilities is the worst available answer.
 */
export function percent(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p <= 0) return '0%';
  if (p < 0.005) return '<1%';
  if (p >= 1) return '100%';
  // >=, not >. Math.round(p * 100) reaches 100 at exactly 0.995, so a strict
  // `>` let that single value through to print certainty for a spark that
  // fails one career in 200 -- the one value in the whole range that claims
  // something false.
  if (p >= 0.995) return '>99%';
  return `${Math.round(p * 100)}%`;
}

/**
 * The same figure as `percent`, but keeping the digits that tell rows apart.
 *
 * WHY THIS EXISTS. The joint chance that every filtered spark arrives is a
 * product, so it collapses fast: four sparks at 40% each is 2.6%, and a ranked
 * list of them reads "2%, 2%, 1%, 1%, 1%..." under `percent`. The ordering is
 * real and the rounding hides it. Only used where rows are COMPARED; a lone
 * figure on a pane does not need eleven digits to be understood.
 *
 * Trailing zeros are trimmed, so a round 48% reads `48%` rather than
 * `48.0000000000%`.
 *
 * A CAVEAT WORTH KNOWING: the base activation rates underneath are community
 * research carrying about two significant figures, so digits past the fourth
 * or so are arithmetic, not measurement. They still order the list correctly,
 * which is what they are here for -- they are not a claim about accuracy.
 */
/**
 * A joint figure, at enough precision to tell two pairs apart and no more.
 *
 * `percent` rounds to whole points, which collapses the exact discrimination a
 * ranked list exists to make: four sparks at 40% each is 2.6%, and two pairs a
 * long way apart both read "3%". So the joint has always been printed with
 * `percentPrecise`, whose default is TEN decimals.
 *
 * Ten was survivable while there was one joint on a row. There are two now --
 * what fires and what is kept -- and `1.5662010062%` beside `0.0141728955%` is
 * 24 characters of digits that no reader is comparing. Significant figures fix
 * both ends at once: a figure near 1% keeps its decimals and a figure near
 * 0.01% keeps its, without either being padded to a fixed width.
 */
export function percentJoint(p: number, significant = 4): string {
  if (!Number.isFinite(p)) return '\u2014';
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  const n = p * 100;
  // toPrecision gives exponential notation below 1e-6; a joint that small is
  // not a number anybody reads, so it becomes a bound rather than "1.0e-5%".
  if (n < 0.0001) return '<0.0001%';
  const trimmed = Number(n.toPrecision(significant)).toString();
  return `${trimmed}%`;
}

export function percentPrecise(p: number, maxDecimals = 10): string {
  if (!Number.isFinite(p)) return '\u2014';
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  const trimmed = (p * 100).toFixed(maxDecimals).replace(/\.?0+$/, '');
  return `${trimmed}%`;
}

/** The star count on a single spark. Lineage totals use the same glyph. */
export const stars = (n: number): string => `${n}★`;

/** Whites are a bare count on a node, and a count needs its plural. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * What a joint figure actually covered, said out loud.
 *
 * The figure skips any spark the pair does not carry, so the label has to carry
 * the denominator or the number reads as a claim about the whole filter. Two
 * forms rather than one: "all 6 activate" when nothing is missing, because a
 * reader should not have to do arithmetic to learn that the answer is
 * everything, and "5 of 6 activate" when something is.
 */
export function scopeLabel(carried: number, total: number, verb: string, noun?: string): string {
  const what = noun === undefined ? '' : ` ${noun}`;
  if (carried >= total) {
    // "both" reads better than "all 2" and is the commonest filter size.
    if (noun === undefined && total === 2) return `both ${verb}`;
    return `all${noun === undefined ? ` ${total}` : what} ${verb}`;
  }
  return `${carried} of ${total}${what} ${verb}`;
}
