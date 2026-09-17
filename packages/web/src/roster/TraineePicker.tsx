import { useCallback } from 'react';
import type { TraineeOption } from '@umalegacies/types';
import { Portrait } from '../lineage/Portrait';
import { useCombobox } from './useCombobox';
import styles from './Combobox.module.css';

/**
 * Who you are about to train.
 *
 * NOT a native <select>. An <option> can hold text and nothing else, and text is
 * exactly what fails here: 66 characters span 105 cards, so the list holds
 * "Oguri Cap" three times over, and the costume tag is the only thing telling
 * them apart. The costume is not cosmetic -- it carries its own unique skill,
 * which is the green spark this whole tool is about -- so the picture is the
 * fastest way to know which one you are choosing.
 *
 * Sourced from master.mdb rather than from the save: you can train a character
 * you have never trained before.
 *
 * The open/search/keyboard mechanics live in useCombobox, shared with the spark
 * filter. What stays here is what differs: the portrait, and matching on costume.
 */
export function TraineePicker({
  trainees,
  chosen,
  onChoose,
}: {
  trainees: readonly TraineeOption[];
  chosen: number | null;
  onChoose: (cardId: number) => void;
}) {
  const current = trainees.find((t) => t.cardId === chosen) ?? null;

  const { items, open, setOpen, query, onSearch, active, setActive, wrap, search, listbox, onKeyDown, choose } =
    useCombobox<TraineeOption>({
      filter: useCallback(
        (q: string) => {
          const needle = q.trim().toLowerCase();
          if (!needle) return trainees;
          // Matches the costume too: "ashen" finds Oguri Cap [Ashen Miracle]
          // without typing the character's name first.
          return trainees.filter((t) =>
            `${t.name} ${t.costume ?? ''}`.toLowerCase().includes(needle),
          );
        },
        [trainees],
      ),
      activeIndexOf: useCallback(
        (list: readonly TraineeOption[]) => list.findIndex((t) => t.cardId === chosen),
        [chosen],
      ),
      onChoose: useCallback((t: TraineeOption) => onChoose(t.cardId), [onChoose]),
    });

  return (
    <div className={styles.region}>
      <span className={styles.label} id="trainee-label">
        TRAINEE
      </span>
      <div className={styles.wrap} ref={wrap}>
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby="trainee-label"
          onClick={() => setOpen(!open)}
        >
          {current ? (
            <>
              <span className={styles.triggerPortrait}>
                <Portrait cardId={current.cardId} name={current.name} />
              </span>
              <span className={styles.triggerText}>
                {current.name}
                {current.costume ? ` ${current.costume}` : ''}
              </span>
            </>
          ) : (
            <span className={`${styles.triggerText} ${styles.placeholder}`}>
              Choose who you are training…
            </span>
          )}
          <span className={styles.caret}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className={styles.popup}>
            {/* 105 options is past the point where scanning beats typing. */}
            <input
              ref={search}
              className={styles.search}
              type="text"
              value={query}
              placeholder="Search by name or costume…"
              aria-label="Search trainees"
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {items.length === 0 ? (
              <p className={styles.none}>No trainee matches “{query}”.</p>
            ) : (
              <ul className={styles.options} role="listbox" ref={listbox}>
                {items.map((option, i) => (
                  <li key={option.cardId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.cardId === chosen}
                      className={`${styles.option} ${i === active ? styles.active : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(option)}
                    >
                      <span className={styles.optionPortrait}>
                        <Portrait cardId={option.cardId} name={option.name} />
                      </span>
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>{option.name}</span>
                        {/* Only where it is load-bearing: 74 of 105 cards. */}
                        {option.costume && (
                          <span className={styles.optionCostume}>{option.costume}</span>
                        )}
                      </span>
                      {option.cardId === chosen && <span className={styles.chosen}>✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
