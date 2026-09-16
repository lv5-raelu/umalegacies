import { useRef, useState } from 'react';
import styles from './DropZone.module.css';

/**
 * Before a save is loaded this is the ONLY thing on the page.
 *
 * Not a disabled picker beside an empty list: DESIGN.md says a surface with
 * nothing to show yet is absent rather than disabled, because a disabled control
 * for data that does not exist yet invites a click that can never work.
 *
 * Two lines, and the second one is load-bearing. The promise that the file stays
 * on this machine is placed here, at the moment the user decides whether to hand
 * it over, rather than in a footer nobody reads before acting.
 */
export function DropZone({
  state,
  fileName,
  veteranCount,
  error,
  onFile,
}: {
  state: 'empty' | 'parsing' | 'loaded';
  fileName: string | null;
  veteranCount: number;
  error: string | null;
  onFile: (file: File) => void;
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
        {picker}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.zone} ${over ? styles.over : ''} ${
          state === 'parsing' ? styles.busy : ''
        }`}
        onClick={() => input.current?.click()}
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
        <p className={styles.headline}>Drop your data.json here, or click to choose it</p>
        {state === 'parsing' ? (
          <p className={styles.progress}>READING…</p>
        ) : (
          <p className={styles.local}>
            It is read in your browser. Only card ids, race wins and spark ids are sent to
            work out names and odds — never your trainer id, your friends&rsquo;, or anything
            else in the file.
          </p>
        )}
        {/* Named in place, and the zone stays usable: the next thing the user
            does after an error is pick a different file. */}
        {error && <p className={styles.error}>{error}</p>}
      </button>
      {picker}
    </>
  );
}
