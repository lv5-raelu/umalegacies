import { useRef, useState } from 'react';
import styles from './DropZone.module.css';

/** Where `data.json` comes from. There is no in-game export; this is the tool. */
const EXTRACTOR_URL = 'https://github.com/xancia/UmaExtractor';

/**
 * Before a save is loaded this is the ONLY thing on the page.
 *
 * Not a disabled picker beside an empty list: DESIGN.md says a surface with
 * nothing to show yet is absent rather than disabled, because a disabled control
 * for data that does not exist yet invites a click that can never work.
 *
 * Three lines, and two of them are load-bearing. The promise that the file stays
 * on this machine is placed here, at the moment the user decides whether to hand
 * it over, rather than in a footer nobody reads before acting. And a first-time
 * visitor has no `data.json` and no way to guess that one exists: the game does
 * not export one, UmaExtractor does, so the box names it.
 *
 * A DIV, NOT A BUTTON, and the button is inside it. The box used to be one
 * `<button>` wrapping every paragraph, which made its accessible name the whole
 * blob of text and left nowhere legal to put a link -- an `<a>` inside a
 * `<button>` is invalid, and its click would open the file picker on the way
 * past. Now the box is a drop target that happens to be clickable, the picker
 * has a real control with a short name, and the link is an ordinary link.
 */
export function DropZone({
  state,
  fileName,
  veteranCount,
  error,
  onFile,
  onForget,
}: {
  state: 'empty' | 'parsing' | 'loaded';
  fileName: string | null;
  veteranCount: number;
  error: string | null;
  onFile: (file: File) => void;
  /** Drop the roster this browser kept, and go back to the drop zone. */
  onForget: () => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept="application/json,.json"
      className={styles.hidden}
      onChange={(e) => {
        take(e.target.files);
        // Cleared so picking the SAME file again still fires a change event,
        // which is what a user does after fixing a bad export.
        e.target.value = '';
      }}
    />
  );

  if (state === 'loaded') {
    return (
      <div className={styles.summary}>
        <span className={styles.file}>{fileName}</span>
        <span className={styles.count}>
          {veteranCount} veteran{veteranCount === 1 ? '' : 's'}
        </span>
        <button type="button" className={styles.replace} onClick={() => input.current?.click()}>
          Load a different file
        </button>
        {/* The roster is kept in this browser so a reload does not cost a trip
            to the file picker. Whoever is given that has to be able to take it
            back, in the same place and without hunting through settings. */}
        <button type="button" className={styles.forget} onClick={onForget}>
          Forget this roster
        </button>
        {picker}
      </div>
    );
  }

  return (
    <>
      <div
        className={`${styles.zone} ${over ? styles.over : ''} ${
          state === 'parsing' ? styles.busy : ''
        }`}
        onClick={(e) => {
          // The link and the picker button handle their own clicks. Without
          // this, following the UmaExtractor link would also open a file dialog
          // on the way out of the page.
          if ((e.target as HTMLElement).closest('a, button')) return;
          input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <p className={styles.headline}>
          Drop your data.json here, or{' '}
          <button type="button" className={styles.choose} onClick={() => input.current?.click()}>
            click to choose it
          </button>
        </p>
        {state === 'parsing' ? (
          <p className={styles.progress}>READING…</p>
        ) : (
          <p className={styles.local}>
            It is read in your browser. Only card ids, race wins and spark ids are sent to
            work out names and odds — never your trainer id, your friends&rsquo;, or anything
            else in the file.
          </p>
        )}
        {/* The game exports nothing. Somebody arriving here without a data.json
            has no way to guess that one can exist, so the box says where it
            comes from rather than assuming they already know. */}
        <p className={styles.source}>
          data.json comes from{' '}
          <a href={EXTRACTOR_URL} target="_blank" rel="noreferrer">
            UmaExtractor
          </a>
          . Generate yours there first.
        </p>
        {/* Named in place, and the zone stays usable: the next thing the user
            does after an error is pick a different file. */}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      {picker}
    </>
  );
}
