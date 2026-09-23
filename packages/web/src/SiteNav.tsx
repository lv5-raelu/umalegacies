import styles from './SiteNav.module.css';

/**
 * THE THREE SCREENS, NAMED IN ONE PLACE.
 *
 * Each screen used to carry its own way out: the roster had a one-way "find a
 * pair →" link, the search and the tree each had a "Back to the roster" button.
 * So the roster reached the search but not the tree, the tree reached the
 * roster but not the search, and nothing told the reader how many screens there
 * were or which one they were on. Three ad-hoc exits are not navigation.
 *
 * A ROUTE THE READER CANNOT USE IS SHOWN, NOT HIDDEN, and says why. "Optimize
 * Parents" before a roster is loaded and "Breakdown" before a pair is picked are
 * both preconditions rather than absences, and a menu that grows items as you
 * go gives no sense of the whole. They are `aria-disabled` and titled with what
 * is missing -- the same treatment the roster list already gives a veteran that
 * cannot be picked right now, which DESIGN.md settles as "a card is information
 * whether or not it can be selected".
 *
 * Achromatic, like every other control here. DESIGN.md: the interface has no
 * brand colour, and a coloured control would read as a datum. The current
 * screen separates by ink and a rule beneath it, not by a hue.
 */

export interface NavTarget {
  hash: string;
  label: string;
  /** Null when reachable; otherwise what the reader has to do first. */
  blocked: string | null;
}

export function SiteNav({ current, targets }: { current: string; targets: readonly NavTarget[] }) {
  return (
    <nav className={styles.nav} aria-label="Screens">
      {targets.map((target) => {
        const here = target.hash === current;
        if (target.blocked !== null) {
          return (
            <span key={target.hash} className={styles.blocked} aria-disabled title={target.blocked}>
              {target.label}
            </span>
          );
        }
        return (
          <a
            key={target.hash}
            className={here ? styles.here : styles.link}
            href={target.hash === '' ? '#' : target.hash}
            aria-current={here ? 'page' : undefined}
          >
            {target.label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * What each screen needs before it can be reached.
 *
 * In one place rather than three, because the answer has to be the same on
 * every screen: a route that is reachable from the roster and dead from the
 * tree would be a bug nobody could see from either.
 */
export function navTargets({
  hasRoster,
  hasLineage,
}: {
  hasRoster: boolean;
  hasLineage: boolean;
}): NavTarget[] {
  return [
    { hash: '', label: 'Roster', blocked: null },
    {
      hash: '#search',
      label: 'Optimize Parents',
      blocked: hasRoster ? null : 'Load your veteran data first',
    },
    {
      hash: '#tree',
      label: 'Breakdown',
      blocked: hasLineage ? null : 'Pick a trainee and two parents first',
    },
  ];
}
