import type { Position } from './types';

/** The trainee is not a position; it is the root the lineage hangs off. */
export type Member = Position | 'T';

/**
 * How a slot is named to a human.
 *
 * `position_id` is master.mdb's vocabulary (10, 20, 11, 12, 21, 22) and it
 * reaches a reader as a bare number that means nothing: 11 and 12 are parent
 * one's two parents, 21 and 22 are parent two's, and nothing about the digits
 * says so. GP<parent>-<n> does.
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
  11: 'GP1-1',
  12: 'GP1-2',
  21: 'GP2-1',
  22: 'GP2-2',
};

export const positionLabel = (member: Member): string => POSITION_LABEL[member];
