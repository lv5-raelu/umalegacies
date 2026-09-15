import type { Position } from './types';

/** The trainee is not a position; it is the root the lineage hangs off. */
export type Member = Position | 'T';

/**
 * How a slot is named to a human.
 *
 * `position_id` is master.mdb's vocabulary (10, 20, 11, 12, 21, 22) and it
 * reaches a reader as a bare number that means nothing.
 *
 * The grandparents are numbered flat, GP1 to GP4, left to right as the tree
 * draws them: GP1 and GP2 sit under P1, GP3 and GP4 under P2. A nested
 * GP<parent>-<n> spelled the relationship out but cost five characters in a
 * column that repeats six times per row, and the tree already shows which
 * parent each one hangs from.
 *
 * These labels are also what makes a link label UNIQUE. One lineage can hold
 * the same character in several slots, so fixture 5531 emits
 * `El Condor Pasa <-> Inari One` twice, for two different links, with two
 * different values. Naming the position disambiguates them.
 */
export const POSITION_LABEL: Readonly<Record<Member, string>> = {
  T: 'Trainee',
  10: 'P1',
  20: 'P2',
  11: 'GP1',
  12: 'GP2',
  21: 'GP3',
  22: 'GP4',
};

export const positionLabel = (member: Member): string => POSITION_LABEL[member];
