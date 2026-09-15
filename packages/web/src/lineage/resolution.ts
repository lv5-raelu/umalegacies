import type { Resolution } from '../api/types';

/**
 * The one sentence this app uses to report a failed lookup.
 *
 * Three call sites rendered it independently -- the tree node, the headline and
 * the provenance panel -- and one of them used `replace('_', ' ')`, which
 * replaces only the FIRST underscore, so `no_relation_rows` reached the screen
 * as "no relation_rows". Same union, same sentence, one implementation.
 */
export function resolutionText(resolution: Resolution): string | null {
  if (resolution.ok) return null;
  return `could not resolve ${resolution.reason.replace(/_/g, ' ')} ${resolution.id}`;
}
