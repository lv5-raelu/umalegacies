import type { Citation, RuleId } from './types.js';

/**
 * Why each rule is the rule. These are shown next to the number, so they
 * record how the project knows, not merely what it believes.
 *
 * Deliberately quote-only where the finding is this project's own empirical
 * verification, since there is no public URL for it. Open Question 1 in the
 * design doc is whether these should link out instead.
 */
export const RULE_CITATIONS: Partial<Record<RuleId, Citation>> = {
  'base.two_way': {
    label: 'Base affinity, two-way',
    quote:
      'A link between two members is worth the relation_point of every ' +
      'succession relation both belong to.',
  },
  'base.three_way': {
    label: 'Base affinity, three-way',
    quote:
      'A parent-grandparent link counts a relation only when the trainee, ' +
      'the parent AND the grandparent all belong to it. Scoring it two-way ' +
      'inflates every grandparent.',
  },
  'base.self_link': {
    label: 'Self-link rule, verified 2026-09-10',
    quote:
      'A grandparent who is the same character as the trainee loses this ' +
      'base term. The G1 bonus on the same link survives. Verified against ' +
      'hakuraku and breeding-optimizer on fixture 5774.',
  },
  'bonus.shared_g1': {
    label: 'Bonus affinity, raw saddle id, verified 2026-09-10',
    quote:
      'Each G1 win both members share is worth +3. Match on the raw ' +
      'single_mode_wins_saddle.id and do NOT normalise to group_id: the same ' +
      'race at a different racecourse is a different win.',
  },
  'base.absent_ancestor': {
    label: 'Absent ancestor',
    quote: 'An empty grandparent slot contributes no base affinity.',
  },
  'bonus.absent_ancestor': {
    label: 'Absent ancestor',
    quote: 'An empty grandparent slot contributes no bonus affinity.',
  },
};
