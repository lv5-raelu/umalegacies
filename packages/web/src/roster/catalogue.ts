import type { RosterSparkOption } from '@umalegacies/types';

/**
 * groupId -> the spark's name and kind.
 *
 * `PackageSpark` carries only `{groupId, stars}`, because repeating 297 names
 * across 259 veterans made the roster response 1.5 MB. This is the lookup that
 * gives them back.
 *
 * Its own module rather than a second export from VeteranList.tsx: a file that
 * exports both a component and a plain value cannot Fast Refresh, and the stale
 * module that results surfaces as a React error inside the component, which is
 * a confusing way to be told about a build-tool constraint.
 */
export type Catalogue = ReadonlyMap<number, RosterSparkOption>;

export const catalogueOf = (options: readonly RosterSparkOption[]): Catalogue =>
  new Map(options.map((o) => [o.groupId, o]));
