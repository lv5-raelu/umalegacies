import type { LineageResponse } from '@umalegacies/types';
import { sumByRulePrefix } from './explain-node';

/**
 * The headline numbers for a pair, computed once.
 *
 * Both the compare pane and the tree page print this, and each had its own copy
 * of the arithmetic AND of the reasoning comments below. Two copies of an
 * invariant is one copy too many: the rule about summing rather than
 * subtracting only holds if both sides remember it.
 *
 * The LAYOUT stays in each component, deliberately. The pane stacks these under
 * a sticky rubric; the tree page spreads them across a headline with rank
 * bounds. They are different surfaces showing the same facts, and forcing one
 * markup on both would be the wrong kind of sharing.
 */
export interface PairTotal {
  total: number;
  base: number;
  bonus: number;
  /**
   * Whether base + bonus actually reconstructs the total.
   *
   * Both halves are SUMMED, never one subtracted from the other. Subtraction
   * absorbs any discrepancy into bonus: a link child that is neither `base.*`
   * nor `bonus.*` would silently inflate the headline's bonus while a panel four
   * lines below showed the true one -- two numbers for one quantity on one
   * screen. If they ever disagree, say so instead of picking one.
   */
  addendsAgree: boolean;
  /**
   * The trainee could not be resolved, so the total is not merely uncertain: it
   * is wrong by a large margin and silently so. An unresolvable trainee
   * collapses every base term that touches it -- both trainee-parent links AND
   * all four three-way grandparent terms. DESIGN.md: unresolved shows an em dash
   * and names itself, never a number, and never a rank verdict derived from one.
   */
  traineeUnresolved: boolean;
}

export function pairTotalOf(lineage: LineageResponse): PairTotal {
  const base = sumByRulePrefix(lineage.pairTotal, 'base.');
  const bonus = sumByRulePrefix(lineage.pairTotal, 'bonus.');
  return {
    total: lineage.pairTotal.value,
    base,
    bonus,
    addendsAgree: base + bonus === lineage.pairTotal.value,
    traineeUnresolved: lineage.trainee.resolution.ok === false,
  };
}

/** The ◎/〇/△ the game shows for a rank. `·` when the rank is outside 1-3. */
export const rankGlyph = (relationRank: number): string =>
  '◎〇△'[3 - relationRank] ?? '·';
