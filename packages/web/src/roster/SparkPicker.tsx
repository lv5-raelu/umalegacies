import { useCallback } from 'react';
import type { RosterSparkOption } from '@umalegacies/types';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER, isWhite } from '../lineage/sparks';
import { useCombobox } from './useCombobox';
import styles from './Combobox.module.css';

/** null is the "no filter" row, which lives in the list rather than beside it. */
type Choice = RosterSparkOption | null;

/**
 * Which spark to narrow by.
 *
 * Same reason a native <select> fails here as in the trainee picker: an
 * <option> cannot carry the colour tick that says what KIND a spark is, and it
 * cannot be searched. There are 297 distinct spark groups in the builder's
 * roster and 231 of them are whites, so scrolling to find "Homestretch Haste"
 * is not a real option.
 *
 * SINGLE selection. The index behind it already carries what a multi-criterion
 * filter needs -- stars per package member, so scope and split are both
 * answerable -- and the plan reserves repeatable rows for M7 on that same index.
 */
export function SparkPicker({
  options,
  chosen,
  onChoose,
}: {
  options: readonly RosterSparkOption[];
  chosen: number | null;
  onChoose: (groupId: number | null) => void;
}) {
  const current = options.find((o) => o.groupId === chosen) ?? null;

  const { items, open, setOpen, query, onSearch, active, setActive, wrap, search, listbox, onKeyDown, choose } =
    useCombobox<Choice>({
      filter: useCallback(
        (q: string) => {
          const needle = q.trim().toLowerCase();
          const matched = needle
            ? options.filter((o) => o.name.toLowerCase().includes(needle))
            : options;
          // Grouped in render order, so the five blues stay findable above the
          // 231 whites however the list is filtered.
          const ordered = SPARK_KIND_ORDER.flatMap((kind) =>
            matched.filter((o) => o.kind === kind),
          );
          // Clearing is an option IN the list, not a control beside it: it is
          // the same decision as choosing one. Hidden while searching, where it
          // would never be what you meant.
          return needle ? ordered : [null, ...ordered];
        },
        [options],
      ),
      activeIndexOf: useCallback(
        (list: readonly Choice[]) => list.findIndex((o) => (o?.groupId ?? null) === chosen),
        [chosen],
      ),
      onChoose: useCallback((o: Choice) => onChoose(o?.groupId ?? null), [onChoose]),
    });

  // Where each kind's first entry falls, so a heading can be drawn above it.
  const headingAt = new Map<number, string>();
  let lastKind: string | null = null;
  items.forEach((option, i) => {
    if (option && option.kind !== lastKind) {
      headingAt.set(i, SPARK_GROUP_LABEL[option.kind]);
      lastKind = option.kind;
    }
  });

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current ? (
          <>
            <Tick kind={current.kind} />
            <span className={styles.triggerText}>{current.name}</span>
          </>
        ) : (
          <span className={`${styles.triggerText} ${styles.placeholder}`}>
            No filter — show every veteran
          </span>
        )}
        <span className={styles.caret}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.popup}>
          <input
            ref={search}
            className={styles.search}
            type="text"
            value={query}
            placeholder="Search sparks…"
            aria-label="Search sparks"
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {items.length === 0 ? (
            <p className={styles.none}>No spark matches “{query}”.</p>
          ) : (
            <ul className={styles.options} role="listbox" ref={listbox}>
              {items.map((option, i) => (
                <li key={option?.groupId ?? 'none'}>
                  {headingAt.has(i) && <p className={styles.groupLabel}>{headingAt.get(i)}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={(option?.groupId ?? null) === chosen}
                    className={`${styles.option} ${i === active ? styles.active : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(option)}
                  >
                    {option ? (
                      <>
                        <Tick kind={option.kind} />
                        <span className={styles.optionText}>
                          <span className={styles.optionName}>{option.name}</span>
                        </span>
                        {/* How many packages carry it: the number that says
                            whether a criterion is worth setting at all. */}
                        <span className={styles.count}>{option.veterans}</span>
                      </>
                    ) : (
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>No filter — show every veteran</span>
                      </span>
                    )}
                    {(option?.groupId ?? null) === chosen && (
                      <span className={styles.chosen}>✓</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Tick({ kind }: { kind: RosterSparkOption['kind'] }) {
  return (
    <span
      className={styles.optionTick}
      style={
        isWhite(kind)
          ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[kind]}` }
          : { background: SPARK_COLOR[kind] }
      }
    />
  );
}
