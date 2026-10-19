import type { MouseEvent } from 'react';
import { COMPARE } from '../route';
import styles from './CompareToggle.module.css';

/** Where a pair stands in the compare tray. */
export type CompareStatus =
  | { kind: 'add' }
  /** In the tray, either order, at this slot. */
  | { kind: 'in'; letter: string }
  /** Four pairs already, and this is not one of them. */
  | { kind: 'full' };

/**
 * THE ONE "ADD TO COMPARE" CONTROL, on search rows, in a pair's detail and on
 * the roster pane, and it shows its own state (design review 2D):
 *
 *   not in the tray     "Add to compare"         a button
 *   in it, either order "In compare · C"         a link to THAT pair on /compare
 *   tray full           "Compare full · 4 of 4"  a link to /compare
 *
 * So a duplicate add cannot happen and needs no message, and a full tray never
 * silently replaces a pair. The nav's count changes on the same click, which
 * is the confirmation.
 *
 * Every click stops here: the control sits inside a search row that opens its
 * pair on a click, and adding a pair is not opening it.
 */
export function CompareToggle({
  status,
  onAdd,
  onOpen,
}: {
  status: CompareStatus;
  onAdd: () => void;
  /** Open /compare at this pair (or at the top, when full). */
  onOpen: () => void;
}) {
  if (status.kind === 'add') {
    return (
      <button
        type="button"
        className={styles.toggle}
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
      >
        Add to compare
      </button>
    );
  }
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    // A new tab, a new window, a download: the browser's, as for every link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen();
  };
  return (
    <a className={styles.toggle} href={COMPARE} onClick={open}>
      {status.kind === 'in' ? `In compare · ${status.letter}` : 'Compare full · 4 of 4'}
    </a>
  );
}
