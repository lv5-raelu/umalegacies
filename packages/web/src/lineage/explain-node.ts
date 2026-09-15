import type { ExplainNode } from '../api/types';

/**
 * Sums every node whose rule id starts with the given prefix, stopping at the
 * first match on each branch.
 *
 * One implementation because the headline and the provenance panel must never
 * disagree about what "151 base + 201 bonus" means. Two copies of this walk
 * existed briefly and that is exactly how the two numbers drift apart.
 */
export function sumByRulePrefix(node: ExplainNode, prefix: string): number {
  if (node.ruleId.startsWith(prefix)) return node.value;
  return node.children.reduce((total, child) => total + sumByRulePrefix(child, prefix), 0);
}
