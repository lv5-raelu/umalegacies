import { useState } from 'react';
import { rankAtlasUrl } from '../api/client';
import { rankBadgeStyle, rankFor } from './rank-labels';
import styles from './RankBadge.module.css';

/**
 * The rank badge the game shows, cropped out of a single atlas.
 *
 * One image for all 298 ranks, positioned in CSS from coordinates committed in
 * rank-ladder.ts, so a card's badge costs no request of its own.
 *
 * The atlas is an optional gitignored cache, exactly like the portraits. When it
 * is missing the label still renders as text -- the rank is a FACT derived from
 * the score, and it should not disappear because an image did.
 */
export function RankBadge({ score, size = 36 }: { score: number; size?: number }) {
  const [missing, setMissing] = useState(false);
  const row = rankFor(score);
  if (!row) return null;
  const label = row[1];

  if (missing) return <span className={styles.text}>{label}</span>;

  return (
    <span className={styles.wrap}>
      {/* A probe rather than a second copy of the atlas: <img> reports a 404 and
          browsers dedupe it against the CSS background, so the fallback costs
          one cached request and no extra bytes. */}
      <img
        className={styles.probe}
        src={rankAtlasUrl()}
        alt=""
        aria-hidden="true"
        onError={() => setMissing(true)}
      />
      <span
        className={styles.badge}
        style={rankBadgeStyle(row, size, rankAtlasUrl())}
        role="img"
        aria-label={`rank ${label}`}
        title={`rank ${label}`}
      />
    </span>
  );
}
