import { useCallback } from 'react';
import { Portrait } from '../lineage/Portrait';
import { pinSummary, togglePin } from './pin-list';
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
 * MANY PER SLOT, MEANING "ANY OF THESE". Shortlisting three umas for a slot is
 * one question, and the answer is a ranking across all three -- which three
 * separate searches could not give, because their results cannot be compared.
 * The list therefore stays open while choices accumulate, and the query
 * survives a pick so narrowing to "oguri" and taking two of her costumes is
 * one search rather than two.
 *
 * BY CARD, because a costume is not a skin. Cards of one character carry
 * different unique skills and so different GREEN sparks, and a direct parent's
 * unique is handed to the trainee at career start -- so "Oguri Cap" without a
 * costume would not say which green the run opens with. Aptitudes can differ
 * too: Haru Urara's two cards are a step apart on Mile.
 */

export interface PinOption {
  /** The exact card, which is both the identity and the thing pinned. */
  cardId: number;
  name: string;
  /** The bracketed costume label. Null when the character has only one card. */
  costume: string | null;
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
  chosen: readonly number[];
  onChoose: (cardIds: number[]) => void;
}) {
  const picked = new Set(chosen);
  const current = options.filter((o) => picked.has(o.cardId));

  const { items, open, setOpen, query, onSearch, active, setActive, wrap, search, listbox, onKeyDown, choose } =
    useCombobox<Choice>({
      filter: useCallback(
        (q: string) => {
          const needle = q.trim().toLowerCase();
          // Costume too: "starlight" should find Oguri Cap [Starlight Beat],
          // which is the whole reason the costumes are listed separately.
          const matched = needle
            ? options.filter((o) =>
                `${o.name} ${o.costume ?? ''}`.toLowerCase().includes(needle),
              )
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
        (items: readonly Choice[]) => items.findIndex((o) => o !== null && picked.has(o.cardId)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chosen.join(',')],
      ),
      // Null is the clear row; anything else toggles. Toggling rather than
      // adding, so the way to remove one is the way you added it.
      onChoose: useCallback(
        (choice: Choice) => onChoose(choice === null ? [] : togglePin(chosen, choice.cardId)),
        [onChoose, chosen],
      ),
      keepOpen: true,
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
        {/* ONE is named with its face, because that is the case where the
            costume matters and there is room to show it. SEVERAL is a count:
            three names would not fit, and a truncated first name reads as the
            only choice. NONE says "anyone", which is what no pin means. */}
        {current.length === 1 && current[0] !== undefined ? (
          <>
            <span className={styles.triggerPortrait}>
              <Portrait cardId={current[0].cardId} name={current[0].name} />
            </span>
            <span className={styles.triggerText}>
              {current[0].name}
              {current[0].costume ? ` ${current[0].costume}` : ''}
            </span>
          </>
        ) : (
          <span
            className={
              current.length === 0 ? `${styles.triggerText} ${styles.placeholder}` : styles.triggerText
            }
          >
            {pinSummary(current.map((o) => o.name))}
          </span>
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
                  key={item === null ? 'none' : item.cardId}
                  role="option"
                  aria-selected={item === null ? chosen.length === 0 : picked.has(item.cardId)}
                  className={`${styles.option} ${i === active ? styles.active : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  {item === null ? (
                    <span className={`${styles.optionText} ${styles.placeholder}`}>
                      anyone {chosen.length > 0 ? '— clear the list' : ''}
                    </span>
                  ) : (
                    <>
                      <span className={styles.optionPortrait}>
                        <Portrait cardId={item.cardId} name={item.name} />
                      </span>
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>{item.name}</span>
                        {item.costume ? (
                          <span className={styles.optionCostume}>{item.costume}</span>
                        ) : null}
                      </span>
                    </>
                  )}
                  {(item === null ? chosen.length === 0 : picked.has(item.cardId)) && (
                    <span className={styles.chosen}>✓</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
