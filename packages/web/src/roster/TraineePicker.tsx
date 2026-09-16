import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraineeOption } from '@umalegacies/types';
import { Portrait } from '../lineage/Portrait';
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLUListElement>(null);

  const current = trainees.find((t) => t.cardId === chosen) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return trainees;
    // Matches the costume too: "ashen" should find Oguri Cap [Ashen Miracle]
    // without typing the character's name first.
    return trainees.filter((t) =>
      `${t.name} ${t.costume ?? ''}`.toLowerCase().includes(needle),
    );
  }, [trainees, query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    // Open on the current choice rather than at the top, so reopening the list
    // shows where you already are in 105 options.
    const at = matches.findIndex((t) => t.cardId === chosen);
    setActive(at >= 0 ? at : 0);
  }, [open, chosen, matches]);

  // Click-away and Escape both close. A popup that can only be dismissed by
  // choosing something traps the user in a decision they opened to look at.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', onDown);
    return () => removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (option: TraineeOption): void => {
    onChoose(option.cardId);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        const clamped = Math.max(0, Math.min(matches.length - 1, next));
        listbox.current?.children[clamped]?.scrollIntoView({ block: 'nearest' });
        return clamped;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const option = matches[active];
      if (option) choose(option);
    }
  };

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
          onClick={() => setOpen((o) => !o)}
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
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            {matches.length === 0 ? (
              <p className={styles.none}>No trainee matches “{query}”.</p>
            ) : (
              <ul className={styles.options} role="listbox" ref={listbox}>
                {matches.map((option, i) => (
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
