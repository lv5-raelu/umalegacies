import { useState } from 'react';
import { portraitUrl } from '../api/client';
import styles from './Portrait.module.css';

/**
 * A portrait, or the initials of whoever should be in it.
 *
 * Portraits are committed static files, but a card can still have none: a
 * newly-patched uma shows initials until its portrait is fetched and committed,
 * and so do the two placeholder cards gametora never hosts. So the no-image
 * state has to be a designed one rather than a broken image icon.
 *
 * Brand colours from `chara_data` were prototyped for this disc and rejected:
 * 17 of 96 fall below 3:1 on the dark ground (Manhattan Cafe #3D3935 at
 * 1.34:1), so colour cannot carry identity here.
 */
export function Portrait({
  cardId,
  name,
}: {
  /** The CARD, i.e. the costume. Null when the card could not be resolved. */
  cardId: number | null;
  name: string;
}) {
  // Remember WHICH card failed, not that one did: the pickers reuse one Portrait
  // as the selection changes, and a boolean kept every later pick on initials.
  const [failedId, setFailedId] = useState<number | null>(null);
  const showImage = cardId !== null && failedId !== cardId;

  // Sized by `--portrait-size` from the card, not an inline width: the card
  // shrinks it on narrow viewports, and an inline style could only have been
  // beaten with !important.
  return (
    <span className={styles.disc} aria-hidden="true">
      {showImage ? (
        <img
          className={styles.image}
          src={portraitUrl(cardId)}
          alt=""
          // The tree shows seven of these; the roster shows 259. Lazy is the
          // difference between one request per visible card and 259 on load,
          // and the initials disc is already the designed state for one that
          // has not arrived.
          loading="lazy"
          decoding="async"
          onError={() => setFailedId(cardId)}
        />
      ) : (
        <span className={styles.initials}>{initials(name)}</span>
      )}
    </span>
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => (w[0] as string).toUpperCase())
    .join('');
}
