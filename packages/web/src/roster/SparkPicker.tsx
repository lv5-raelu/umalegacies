import { useEffect, useMemo, useRef, useState } from 'react';
import type { RosterSparkOption } from '@umalegacies/types';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER, isWhite } from '../lineage/sparks';
import styles from './Combobox.module.css';

/**
 * Which spark to narrow by.
 *
 * Same reasoning as the trainee picker, for the same reason a native <select>
 * fails: an <option> holds text and nothing else, so it cannot carry the colour
 * tick that says what KIND a spark is, and it cannot be searched. There are 297
 * distinct spark groups in the builder's roster and 231 of them are whites --
 * scrolling that list to find "Homestretch Haste" is not a thing anyone should
 * have to do.
 *
 * SINGLE selection for now. The index behind this already carries everything a
 * multi-criterion filter needs (stars per member, so scope and split are both
 * answerable), and the plan reserves repeatable criterion rows for M7 on the
 * same index with no rebuild.
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLUListElement>(null);

  const current = options.find((o) => o.groupId === chosen) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? options.filter((o) => o.name.toLowerCase().includes(needle))
      : options;
    // Grouped in render order, so the five blues stay findable above the 231
    // whites however the list is filtered.
    return SPARK_KIND_ORDER.flatMap((kind) => filtered.filter((o) => o.kind === kind));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const at = matches.findIndex((o) => o.groupId === chosen);
    setActive(at >= 0 ? at : 0);
  }, [open, chosen, matches]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', onDown);
    return () => removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (groupId: number | null): void => {
    onChoose(groupId);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => {
        const next = Math.max(0, Math.min(matches.length - 1, e.key === 'ArrowDown' ? i + 1 : i - 1));
        listbox.current?.querySelectorAll('[role=option]')[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const option = matches[active];
      if (option) choose(option.groupId);
    }
  };

  // Where each kind's first entry falls, so a heading can be drawn above it.
  const headingAt = new Map<number, string>();
  let lastKind: string | null = null;
  matches.forEach((option, i) => {
    if (option.kind !== lastKind) {
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
        onClick={() => setOpen((o) => !o)}
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
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul className={styles.options} role="listbox" ref={listbox}>
            {/* Clearing is an option in the list, not a separate control: it is
                the same decision as choosing one. */}
            {query.trim() === '' && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen === null}
                  className={styles.option}
                  onClick={() => choose(null)}
                >
                  <span className={styles.optionText}>
                    <span className={styles.optionName}>No filter — show every veteran</span>
                  </span>
                  {chosen === null && <span className={styles.chosen}>✓</span>}
                </button>
              </li>
            )}
            {matches.length === 0 ? (
              <li>
                <p className={styles.none}>No spark matches “{query}”.</p>
              </li>
            ) : (
              matches.map((option, i) => (
                <li key={option.groupId}>
                  {headingAt.has(i) && (
                    <p className={styles.groupLabel}>{headingAt.get(i)}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.groupId === chosen}
                    className={`${styles.option} ${i === active ? styles.active : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(option.groupId)}
                  >
                    <Tick kind={option.kind} />
                    <span className={styles.optionText}>
                      <span className={styles.optionName}>{option.name}</span>
                    </span>
                    {/* How many packages carry it. The number that says whether
                        a criterion is worth setting at all. */}
                    <span className={styles.count}>{option.veterans}</span>
                    {option.groupId === chosen && <span className={styles.chosen}>✓</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
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
