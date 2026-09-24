/**
 * WHAT THE CAREER-START PINK GRANT IS ACTUALLY WORTH.
 *
 * Pinks are the one spark kind whose main question is not a probability. When a
 * career begins the trainee's aptitudes are raised by the lineage's pink stars,
 * DETERMINISTICALLY, by up to four steps -- and the tool was answering "will
 * Medium fire" with 14% when the reader was asking "does this pair get me to A",
 * which the same data answers exactly.
 *
 * The thresholds are cumulative star totals across all six ancestors:
 *
 *   1 star  -> +1 step      7 stars -> +3 steps
 *   4 stars -> +2 steps    10 stars -> +4 steps
 *
 * AND IT STOPS AT A. The start grant cannot produce S however many stars are
 * behind it; S needs one of the two April inspirations, which is what the
 * percentage beside this figure is for. Source: uma.guide's Sparks page, whose
 * table this reproduces -- start at D with 7 stars and you open at A, which is
 * the worked example a reader gave back unprompted.
 */

import type { AptitudeGrade, AptitudeLift } from '@umalegacies/types';

export type { AptitudeGrade, AptitudeLift };

/** The game's 1-8, G through S. `card_rarity_data.proper_*` uses this. */
export const APTITUDE_GRADES: readonly AptitudeGrade[] = [
  'G',
  'F',
  'E',
  'D',
  'C',
  'B',
  'A',
  'S',
];

/** A is index 6. The start grant cannot go past it. */
const A_GRADE = 6;

/** Star totals at which the start grant gains another step. */
export const APTITUDE_THRESHOLDS = [1, 4, 7, 10] as const;

/** The ten pink factor groups, each naming the aptitude it raises. */
export const APTITUDE_BY_PINK_GROUP: Readonly<Record<number, AptitudeKey>> = {
  11: 'turf',
  12: 'dirt',
  21: 'frontRunner',
  22: 'paceChaser',
  23: 'lateSurger',
  24: 'endCloser',
  31: 'sprint',
  32: 'mile',
  33: 'medium',
  34: 'long',
};

export type AptitudeKey =
  | 'turf'
  | 'dirt'
  | 'frontRunner'
  | 'paceChaser'
  | 'lateSurger'
  | 'endCloser'
  | 'sprint'
  | 'mile'
  | 'medium'
  | 'long';

/** One card's ten aptitudes, as grade indices 0-7. */
export type CardAptitudes = Readonly<Record<AptitudeKey, number>>;

/**
 * How many steps this many stars buys at the start of a career, 0-4.
 *
 * Counting thresholds rather than interpolating: the table is four rows and a
 * formula fitted to it would be a guess about the fifth.
 */
export function stepsFromStars(stars: number): number {
  let steps = 0;
  for (const threshold of APTITUDE_THRESHOLDS) if (stars >= threshold) steps++;
  return steps;
}

/**
 * What the lineage's pinks do to one aptitude at the start of the career.
 *
 * Null when the trainee's card is unknown -- an aptitude nobody can name is not
 * a lift anybody can predict, and guessing at a base grade would put a
 * confident wrong letter on the screen.
 */
export function aptitudeLift(
  base: number | null,
  stars: number,
): AptitudeLift | null {
  if (base === null || !Number.isInteger(base) || base < 0 || base >= APTITUDE_GRADES.length) {
    return null;
  }
  const wanted = stepsFromStars(stars);
  // `Math.max(base, ...)` is not redundant: a trainee already ABOVE the ceiling
  // would otherwise be dragged down to it. No card in the current extract has
  // an S aptitude, so this is future game data rather than present data -- and
  // a grant that silently demoted somebody would be a hard thing to notice.
  const lifted = Math.max(base, Math.min(base + wanted, A_GRADE));
  // Already at A or better: the grant has nothing left to give, so the steps it
  // WOULD have bought are not steps this trainee gets.
  const steps = Math.max(0, lifted - base);
  return {
    from: APTITUDE_GRADES[base] as AptitudeGrade,
    to: APTITUDE_GRADES[lifted] as AptitudeGrade,
    steps,
    cappedAtA: wanted > steps,
  };
}
