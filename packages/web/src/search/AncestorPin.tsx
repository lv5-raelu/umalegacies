import { useCallback } from 'react';
import { Portrait } from '../lineage/Portrait';
import { useCombobox } from '../roster/useCombobox';
import styles from '../roster/Combobox.module.css';

/**
 * WHO HAS TO BE IN THE PAIR, regardless of what they carry.
 *
 * Reported by a reader: wanting a particular uma as a parent meant inventing a
 * spark criterion she happens to carry -- and that criterion then entered the
 * joint, so every row's odds described a build they were not asking about. A
 * pin narrows which pairs EXIST and touches no figure at all.
 *
 * TWO OF THESE, one per slot kind, rather than one "somewhere in the lineage".
 * The two are different questions: a direct parent is who you are training off
 * and carries four of the seven affinity links, while a grandparent is a third
 * of the star totals and one link. A reader who wants Seiun's affinity is not
 * asking the same thing as one who wants her sparks at distance.
 *
 * BY CHARACTER, not by card. Three Oguri Caps are one entry here and the
 * ranking decides which of them wins; a grandparent slot in particular is a
 * card the reader never chose and may not recognise.
 */

export interface PinOption {
  charaId: number;
  name: string;
  /**
   * A card of that character, for the portrait alone.
   *
   * The pin matches by CHARACTER, so which card this is does not affect the
   * search; it is here because an option with a face is recognised faster than
   * one with a name, and the trainee picker beside it has faces.
   */
  cardId: number;
}

type Choice = PinOption | null;

export function AncestorPin({
  label,
  options,
  chosen,
  onChoose,
}: {
  label: string;
  options: readonly PinOption[];
  chosen: number | null;
  onChoose: (charaId: number | null) => void;
}) {
  const current = options.find((o) => o.charaId === chosen) ?? null;

  const { items, open, setOpen, query, onSearch, active, setActive, wrap, search, listbox, onKeyDown, choose } =
    useCombobox<Choice>({
      filter: useCallback(
        (q: string) => {
          const needle = q.trim().toLowerCase();
          const matched = needle
            ? options.filter((o) => o.name.toLowerCase().includes(needle))
            : options;
          // The clear row lives IN the list rather than beside it, so undoing a
          // pin is the same gesture as making one.
          return [null, ...matched];
        },
        [options],
      ),
      // Reopen ON the current pin rather than at the top, the same as every
      // other combobox here: a list of 68 characters should show you where you
      // already are.
      activeIndexOf: useCallback(
        (items: readonly Choice[]) => items.findIndex((o) => (o?.charaId ?? null) === chosen),
        [chosen],
      ),
      onChoose: useCallback((choice: Choice) => onChoose(choice?.charaId ?? null), [onChoose]),
    });

  return (
    <div className={styles.wrap} ref={wrap}>
      {/*
        THE SAME OBJECT AS THE TRAINEE PICKER, class for class.

        The first cut invented its own names -- `control`, `panel`, `list` --
        which exist in no stylesheet, so the control rendered as raw browser
        chrome next to a designed one. Two comboboxes on one screen that do the
        same job must be the same object; DESIGN.md settles that a control is
        recognised by its shape here, since the interface has no brand colour to
        recognise it by.
      */}
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        {current ? (
          <>
            <span className={styles.triggerPortrait}>
              <Portrait cardId={current.cardId} name={current.name} />
            </span>
            <span className={styles.triggerText}>{current.name}</span>
          </>
        ) : (
          <span className={`${styles.triggerText} ${styles.placeholder}`}>anyone</span>
        )}
        <span className={styles.caret}>{open ? '\u25b2' : '\u25bc'}</span>
      </button>

      {open && (
        <div className={styles.popup}>
          <input
            ref={search}
            className={styles.search}
            type="text"
            value={query}
            placeholder="Search by name…"
            aria-label={`Search ${label}`}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {items.length === 0 ? (
            <p className={styles.none}>No one matches “{query}”.</p>
          ) : (
            <ul className={styles.options} role="listbox" ref={listbox}>
              {items.map((item, i) => (
                <li
                  key={item === null ? 'none' : item.charaId}
                  role="option"
                  aria-selected={(item?.charaId ?? null) === chosen}
                  className={`${styles.option} ${i === active ? styles.active : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  {item === null ? (
                    <span className={`${styles.optionText} ${styles.placeholder}`}>anyone</span>
                  ) : (
                    <>
                      <span className={styles.optionPortrait}>
                        <Portrait cardId={item.cardId} name={item.name} />
                      </span>
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>{item.name}</span>
                      </span>
                    </>
                  )}
                  {(item?.charaId ?? null) === chosen && <span className={styles.chosen}>✓</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
