import { RANK_LADDER, RANK_SPRITE, type RankRow } from './rank-ladder';

/**
 * The rank a score falls in.
 *
 * Matched by SCORE against the ladder, not by the tier index master.mdb returns.
 * The two agree on 92 of the extract's 98 band minimums and diverge at and above
 * 66,000, where the extract predates the game growing its ladder from 98 tiers to
 * 298; pairing master id N with ladder row N would be wrong for exactly the tiers
 * where they disagree, and wrong silently.
 */
export function rankFor(score: number): RankRow | null {
  if (!Number.isFinite(score) || score < 0) return null;
  // Descending scan: the ladder is ascending by minimum, so the first row at or
  // below the score is its band. 298 rows, once per card; a binary search would
  // buy nothing measurable and cost a correctness argument.
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    const row = RANK_LADDER[i] as RankRow;
    if (score >= row[0]) return row;
  }
  return null;
}

export const rankLabel = (score: number): string | null => rankFor(score)?.[1] ?? null;

/**
 * The CSS that crops one badge out of the atlas, scaled to `size` px.
 *
 * The badges are 148-150px in the source, so each is scaled by its own width
 * rather than by a shared constant: a fixed divisor would leave the wider ones a
 * pixel or two short of their box and the edges visibly clipped.
 */
export function rankBadgeStyle(row: RankRow, size: number, url: string): React.CSSProperties {
  const [, , x, y, w, h] = row;
  const scale = size / w;
  return {
    width: `${size}px`,
    height: `${Math.round(h * scale)}px`,
    backgroundImage: `url(${url})`,
    backgroundSize: `${RANK_SPRITE.width * scale}px ${RANK_SPRITE.height * scale}px`,
    backgroundPosition: `-${x * scale}px -${y * scale}px`,
  };
}
