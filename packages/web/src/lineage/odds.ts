import type { RosterSparkOption, SparkCriterion, SparkSummaryRow } from '@umalegacies/types';
import {
  acquisitionChance,
  carriedCount,
  countsTowardOdds,
  hasAcquisitionRoll,
  inheritOnceInCareer,
  jointOdds,
} from '@umalegacies/core';
import { percent, percentPrecise, scopeLabel } from './sparks';

/**
 * The odds a pair is read by, shared by every screen that prints them.
 *
 * These lived privately in the roster's pair pane, and the compare page has to
 * print the same numbers for the same pair. Two copies of a window rule or a
 * gold rule drift, and then the pane and /compare disagree about one pair with
 * nothing on screen to say which is right. One copy makes "the pane and
 * /compare show the same number" true by construction.
 */

/**
 * Which window the odds columns report.
 *
 * Inspiration fires TWICE per career, which is what separates the first two:
 *
 *   inspiration   P(>=1) when a SINGLE inspiration fires
 *   once          P(>=1) across the career, so across both firings
 *   twice         P(>=2) across the career, which is the doubled spark
 *
 * The first answers "will this land on the next inspiration"; the second
 * answers "will this land at all"; the third is the one worth planning a pair
 * around, because a doubled spark stacks.
 */
export type OddsView = 'inspiration' | 'once' | 'twice';

export const VIEW_LABEL: Readonly<Record<OddsView, string>> = {
  inspiration: '1 inspiration',
  once: 'at least once',
  twice: 'at least twice',
};

/** The long form, for the line that says what the column means. */
export const VIEW_RUBRIC: Readonly<Record<OddsView, string>> = {
  inspiration: 'chance of activating when one inspiration fires',
  once: 'chance of activating at least once across a career',
  twice: 'chance of activating at least twice across a career',
};

export const valueFor = (row: SparkSummaryRow, view: OddsView): number =>
  view === 'inspiration'
    ? row.withinOneInspiration
    : view === 'once'
      ? row.onceInCareer
      : row.twiceInCareer;

/** Which of the reader's criteria asked for the gold version, by group. */
export const goldGroupsOf = (criteria: readonly SparkCriterion[]): Set<number> =>
  new Set(criteria.filter((c) => c.gold === true).map((c) => c.groupId));

/**
 * THE END-OF-CAREER ROLL, AND THE CHAIN IT FINISHES.
 *
 * Recomputed rather than read off the row, because the row carries the
 * WHITE-tier figure -- the floor a reader gets for saying nothing -- and the
 * tier is a plan that lives on their criterion. Null for everything but a
 * white skill, so races, scenarios and the three named slots keep the single
 * figure they have always had.
 *
 * ALWAYS CAREER ACTIVATION, whatever window is selected: the roll is taken once,
 * at the end of a career, on whether the skill was learned at all.
 */
export const cellInherit = (row: SparkSummaryRow, gold: boolean): number | null =>
  inheritOnceInCareer(row.kind, row.onceInCareer, row.lineageCarriers, gold ? 'gold' : 'white');

/** The roll on its own, for the sentence that shows the chain. Null where there is none. */
const keepChance = (row: SparkSummaryRow, gold: boolean): number | null =>
  hasAcquisitionRoll(row.kind) ? acquisitionChance(row.lineageCarriers, gold ? 'gold' : 'white') : null;

/**
 * One "together" figure and what it covered.
 *
 * `value` is the product when two or more terms are present, the one term's own
 * figure when exactly one is, and null when none are. `jointOdds` alone returns
 * null below two, which is right for the pane -- with one term "together" IS
 * that requirement, already on its chip -- but a column on /compare that
 * carries one of two sparks still owes the reader a number in that row, and an
 * empty cell there would read as "not carried". So the three cases are named
 * here and each caller decides what it shows.
 */
export interface JointFigure {
  value: number | null;
  /** How many of `total` have a figure. */
  present: number;
  total: number;
  /** "both activate", "1 of 2 activate", "all skills inherited". */
  scope: string;
}

const figure = (
  terms: readonly (number | null)[],
  total: number,
  verb: string,
  noun?: string,
): JointFigure => {
  const present = carriedCount(terms);
  const value =
    present >= 2 ? jointOdds(terms) : present === 1 ? terms.find((t) => t !== null) ?? null : null;
  return { value, present, total, scope: scopeLabel(present, total, verb, noun) };
};

/**
 * The chance the whole filter lands, twice: once to activate, once to inherit.
 *
 * The aggregates count only what the reader left in. A criterion marked
 * "exclude spark activation" still filters and still shows its own figure on
 * its chip; it is out of the product, and so out of the product's denominator.
 */
export function jointFigures(
  sparks: readonly SparkSummaryRow[],
  criteria: readonly SparkCriterion[],
  sparkOptions: readonly RosterSparkOption[],
  view: OddsView,
): { act: JointFigure; inh: JointFigure } {
  const counted = criteria.filter(countsTowardOdds);
  const rowOf = (c: SparkCriterion) => sparks.find((s) => s.groupId === c.groupId);
  const isSkill = (c: SparkCriterion) =>
    sparkOptions.find((o) => o.groupId === c.groupId)?.kind === 'white_skill';

  // In whichever window is selected. A requirement the pair misses is a null,
  // so the scope says "1 of 2" instead of the figure quietly covering less.
  const act = counted.map((c) => {
    const row = rowOf(c);
    return row ? valueFor(row, view) : null;
  });

  /*
   * The second joint, over the criteria that HAVE an inherit figure.
   *
   * Nulls are dropped here rather than counted missing, which is the opposite
   * of the activation joint and is right for the opposite reason: a blue has no
   * inherit figure because the mechanic does not reach it, not because the pair
   * fails at it. Including it would state a loss that has not happened.
   *
   * The tier rides on the criterion, so a reader who ticked "gold" in the
   * search sees the gold number here on the pair they picked.
   */
  const inh = counted
    .map((c) => {
      const row = rowOf(c);
      if (row === undefined) {
        // The pair carries none of it. Whether that is a ZERO or a gap depends
        // on what the criterion names, and the catalogue is what knows: a
        // wanted white SKILL the pair misses is a failure like any other, and
        // anything else has no inherit figure for any pair at all.
        return isSkill(c) ? 0 : null;
      }
      return cellInherit(row, c.gold === true);
    })
    .filter((v) => v !== null);

  return {
    act: figure(act, counted.length, 'activate'),
    // Counted over the SKILL criteria only: nothing else has an inherit figure
    // for any pair, so borrowing the filter's count would claim a wider scope.
    inh: figure(inh, counted.filter(isSkill).length, 'inherited', 'skills'),
  };
}

/** The selected window, said as a clause, for every window but the career one. */
const WINDOW_CLAUSE: Readonly<Record<Exclude<OddsView, 'once'>, string>> = {
  inspiration: 'in one inspiration',
  twice: 'to activate at least twice',
};

/**
 * THE WHOLE CHAIN, for a spark's hover, because a chip shows only its two ends.
 *
 * The middle term is the one nobody can reconstruct by eye: it depends on how
 * many of the six ancestors carry the spark and on whether the gold version is
 * planned, neither of which is on the chip.
 *
 * THE EQUATION IS ALWAYS THE CAREER ONE. It used to multiply the selected
 * window's activation by an inherit figure built from career activation, so
 * under "1 inspiration" or "at least twice" it printed 20% x 25% = 10%. The
 * window's own figure is stated first, on its own, and the arithmetic after it
 * is true in every window.
 */
export function sparkExplanation(row: SparkSummaryRow, view: OddsView, gold: boolean): string {
  const head = `${row.name} ${row.stars}★ — `;
  const keeps = keepChance(row, gold);
  const inherits = cellInherit(row, gold);
  if (inherits === null || keeps === null) {
    // No product to state: a race or scenario spark has the roll but its
    // precondition is not something activation decides, and the named slots
    // have no roll at all.
    return (
      `${head}${percent(valueFor(row, view))} to activate` +
      (keeps === null ? '' : `, then ${percentPrecise(keeps, 1)} to inherit if the trainee earns it`)
    );
  }
  const window = view === 'once' ? '' : `${percent(valueFor(row, view))} ${WINDOW_CLAUSE[view]}. `;
  return (
    `${head}${window}Career: ${percent(row.onceInCareer)} to activate × ` +
    `${percentPrecise(keeps, 1)} to inherit = ${percent(inherits)} combined.`
  );
}
