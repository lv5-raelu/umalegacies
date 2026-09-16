import type { Position } from '@umalegacies/types';

/** Slot order as the tree renders it: parents, then grandparents left to right. */
export const ALL_POSITIONS = [10, 20, 11, 12, 21, 22] as const satisfies readonly Position[];

export type Member = Position | 'T';

/**
 * Mirrors POSITION_LABEL in packages/api/src/affinity/positions.ts, which is
 * what the engine bakes into every link label. contract.test.ts asserts the two
 * agree: if they drift, the tree's slot names stop matching the names inside
 * the provenance labels beside them.
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

/** Widest label, so a column of them can be padded to a stable width. */
export const POSITION_LABEL_WIDTH = Math.max(
  ...Object.values(POSITION_LABEL).map((l) => l.length),
);
