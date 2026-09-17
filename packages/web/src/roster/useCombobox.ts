import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

/**
 * The mechanics both pickers share: open state, a search box, an active option,
 * click-away, and Escape / arrows / Enter.
 *
 * Extracted because the trainee picker and the spark picker had grown two
 * copies of it -- the click-away effect was byte-identical in both files. What
 * stays in each component is the part that actually differs: what an option
 * looks like (a portrait against a colour tick) and how the query matches it.
 *
 * A native <select> would have saved all of this and cannot be used: an
 * <option> holds text and nothing else, so it can carry neither the portrait
 * that tells two Oguri Cap costumes apart nor the tick that says what kind a
 * spark is, and it cannot be searched. With 105 trainee cards and 297 spark
 * groups, searching is not optional.
 */
export function useCombobox<T>({
  filter,
  activeIndexOf,
  onChoose,
}: {
  /**
   * Query to matching options. The hook owns the query, so the caller cannot be
   * handed `items` it needs the query to compute -- that circularity is why this
   * takes a function rather than a list.
   */
  filter: (query: string) => readonly T[];
  /** Where to put the highlight when the list opens. -1 for the top. */
  activeIndexOf: (items: readonly T[]) => number;
  onChoose: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(() => filter(query), [filter, query]);
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    // Open ON the current choice rather than at the top: reopening a list of
    // 105 options should show you where you already are.
    const at = activeIndexOf(items);
    setActive(at >= 0 ? at : 0);
  }, [open, items, activeIndexOf]);

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

  const choose = useCallback(
    (item: T): void => {
      onChoose(item);
      setOpen(false);
      setQuery('');
    },
    [onChoose],
  );

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => {
        const next = Math.max(
          0,
          Math.min(items.length - 1, e.key === 'ArrowDown' ? i + 1 : i - 1),
        );
        listbox.current
          ?.querySelectorAll('[role=option]')
          [next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item !== undefined) choose(item);
    }
  };

  const onSearch = (value: string): void => {
    setQuery(value);
    setActive(0);
  };

  return {
    items,
    open,
    setOpen,
    query,
    onSearch,
    active,
    setActive,
    wrap,
    search,
    listbox,
    onKeyDown,
    choose,
  };
}
