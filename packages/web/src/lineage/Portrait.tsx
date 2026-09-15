import { useState } from 'react';
import styles from './Portrait.module.css';

/**
 * A portrait, or the initials of whoever should be in it.
 *
 * Portraits live at `/portraits/<chara_id>.png` and the repository ships none
 * yet, so today every node shows initials. That is deliberate rather than
 * unfinished: it is exactly what a fresh clone looks like, and what every
 * newly-patched uma looks like until its portrait is added, so the state has to
 * be a designed one rather than a broken image icon.
 *
 * Brand colours from `chara_data` were prototyped for this disc and rejected:
 * 17 of 96 fall below 3:1 on the dark ground (Manhattan Cafe #3D3935 at
 * 1.34:1), so colour cannot carry identity here.
 */
export function Portrait({
  charaId,
  name,
  size = 48,
}: {
  charaId: number | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = charaId !== null && !failed;

  return (
    <span className={styles.disc} style={{ width: size, height: size }} aria-hidden="true">
      {showImage ? (
        <img
          className={styles.image}
          src={`/portraits/${charaId}.png`}
          alt=""
          onError={() => setFailed(true)}
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
