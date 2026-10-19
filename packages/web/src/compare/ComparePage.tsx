import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  LineageResponse,
  ResolvedVeteran,
  RosterResolveResponse,
  RosterVeteranInput,
  SkillTiming,
  SparkCriterion,
  TraineeOption,
} from '@umalegacies/types';
import { VIEW_LABEL, type OddsView } from '../lineage/odds';
import { loadMaster } from '../lineage/master-source';
import { catalogueOf } from '../roster/catalogue';
import { TraineePicker } from '../roster/TraineePicker';
import { ROSTER, SEARCH, followLink } from '../route';
import { usePublishedTop } from '../usePublishedTop';
import { compareModel, type ModelColumn } from './compare-model';
import { CompareTable, type Slot } from './CompareTable';
import { LETTERS, TRAY_CAP, dedupeKey, pairKey, type TrayPair } from './tray';
import { useCompareColumns } from './useCompareColumns';
import type { ColumnResult } from './run-columns';
import styles from './ComparePage.module.css';

/**
 * WHERE THE READER WAS, kept in App memory for the round trip.
 *
 * Not IndexedDB: a reload starts at the top with every row closed. Everything
 * that shapes the row layout is here -- open rows AND both filters -- because
 * a scroll offset restored into a different set of rows is a different place
 * (eng re-review, Codex #7). The window lives in App beside this, shared with
 * the roster pane and the search's detail.
 */
export interface CompareMemory {
  open: ReadonlySet<number>;
  hideIdentical: boolean;
  onlyFiltered: boolean;
  scroll: { regime: 'page' | 'box'; top: number; left: number } | null;
}

export const FRESH_COMPARE: CompareMemory = {
  open: new Set(),
  hideIdentical: true,
  onlyFiltered: false,
  scroll: null,
};

/** One position on the page this visit: a pair, or one removed and still undoable. */
interface SlotState {
  pair: TrayPair;
  removed: boolean;
}

/** The narrow regime starts below this: four 200px columns + the 200px names. */
const WIDE = '(min-width: 1080px)';

/**
 * /compare: up to four pairs, side by side, with no verdict.
 *
 * The page owns the visit -- which slots exist, which were removed -- and
 * hands everything else to pure code: `compareModel` decides every row and
 * cell, `useCompareColumns` decides which pairs still need explaining.
 *
 * LETTERS ARE SLOT POSITIONS, left to right (design review D26). A removal
 * holds its letters still for the rest of the visit, with an undo in place;
 * the next visit closes them up.
 */
export function ComparePage({
  roster,
  veterans,
  trainees,
  traineeCardId,
  onTrainee,
  tray,
  onTray,
  criteria,
  view,
  onView,
  memory,
  onMemory,
  results,
  onStale,
  onShowBreakdown,
  trayCleared,
  onTrayClearedSeen,
  target,
  onTargetUsed,
  nav,
}: {
  roster: RosterResolveResponse;
  veterans: readonly RosterVeteranInput[];
  trainees: readonly TraineeOption[];
  traineeCardId: number | null;
  onTrainee: (cardId: number) => void;
  tray: readonly TrayPair[];
  onTray: (next: TrayPair[]) => void;
  /** `pairCriteria`: the same set the roster pane and the tree read. */
  criteria: readonly SparkCriterion[];
  view: OddsView;
  onView: (view: OddsView) => void;
  memory: CompareMemory;
  onMemory: (update: (memory: CompareMemory) => CompareMemory) => void;
  /** App's keyed results; see `useCompareColumns`. */
  results: Map<string, ColumnResult>;
  onStale: () => void;
  /** `takePair`: this pair becomes the roster pair, and its breakdown opens. */
  onShowBreakdown: (pair: TrayPair, lineage: LineageResponse) => void;
  trayCleared: boolean;
  onTrayClearedSeen: () => void;
  /** A pair to bring into view on arrival (its dedupe key), set by "In compare · C". */
  target: string | null;
  onTargetUsed: () => void;
  nav: ReactNode;
}) {
  const trainee = trainees.find((t) => t.cardId === traineeCardId) ?? null;
  const catalogue = catalogueOf(roster.sparkOptions);
  const wide = useMatches(WIDE);

  const [slots, setSlots] = useState<SlotState[]>(() => tray.map((pair) => ({ pair, removed: false })));
  const live = slots.filter((s) => !s.removed).map((s) => s.pair);
  const held = slots.filter((s) => s.removed).map((s) => s.pair);

  // The tray changed from outside -- cleared with the roster -- so the visit's
  // slots no longer describe it. Every change made HERE updates both at once.
  const traySig = tray.map(dedupeKey).join(',');
  const liveSig = live.map(dedupeKey).join(',');
  useEffect(() => {
    if (traySig !== liveSig) setSlots(tray.map((pair) => ({ pair, removed: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traySig]);

  const { resultOf, retry } = useCompareColumns({
    results,
    live,
    held,
    trainee,
    roster,
    veterans,
    onStale,
  });

  // Which heading each white skill goes under, from the game data, so rows are
  // laid out once and never jump when a pair finishes explaining.
  const [timing, setTiming] = useState<{ of: (groupId: number) => SkillTiming | null } | null>(null);
  useEffect(() => {
    let live = true;
    loadMaster()
      .then((source) => {
        if (live) setTiming({ of: (groupId) => source.master.skillTiming(groupId) });
      })
      .catch(() => {
        // The columns say why the game data failed; the rows go untimed.
        if (live) setTiming({ of: () => null });
      });
    return () => {
      live = false;
    };
  }, []);

  const halvesOf = (pair: TrayPair): readonly [ResolvedVeteran | null, ResolvedVeteran | null] => {
    const side = (i: 0 | 1): ResolvedVeteran | null => {
      const pick = pair[i];
      if (pick.kind !== 'own') return null;
      const veteran = roster.veterans[pick.index];
      return veteran && veteran.self.cardId === pick.cardId ? veteran : null;
    };
    return [side(0), side(1)];
  };

  const remove = (at: number) => {
    const next = slots.map((s, i) => (i === at ? { ...s, removed: true } : s));
    setSlots(next);
    onTray(next.filter((s) => !s.removed).map((s) => s.pair));
  };
  const undo = (at: number) => {
    const next = slots.map((s, i) => (i === at ? { ...s, removed: false } : s));
    setSlots(next);
    onTray(next.filter((s) => !s.removed).map((s) => s.pair));
  };

  const views: Slot[] = slots.map((slot, i) => {
    const letter = LETTERS[i] ?? '?';
    if (slot.removed) return { kind: 'removed', letter, onUndo: () => undo(i) };
    const column: ModelColumn = {
      letter,
      pair: slot.pair,
      halves: halvesOf(slot.pair),
      result: resultOf(slot.pair),
    };
    return { kind: 'live', letter, column, key: pairKey(slot.pair) };
  });
  const columns = views.flatMap((v) => (v.kind === 'live' ? [v.column] : []));

  const model = compareModel({
    columns,
    criteria,
    sparkOptions: roster.sparkOptions,
    view,
    timingOf: timing?.of ?? (() => null),
    hideIdentical: memory.hideIdentical,
    onlyFiltered: memory.onlyFiltered,
    open: memory.open,
  });

  /* --- the place: scroll kept for the round trip, restored once settled -- */

  const publishTop = usePublishedTop('--compare-box-top');
  const box = useRef<HTMLDivElement | null>(null);
  const place = useRef<CompareMemory['scroll']>(null);
  const boxRef = useCallback(
    (element: HTMLDivElement | null) => {
      box.current = element;
      publishTop(element);
      if (element === null) return;
      element.addEventListener('scroll', () => {
        place.current = { regime: 'box', top: element.scrollTop, left: element.scrollLeft };
      });
    },
    [publishTop],
  );

  useEffect(() => {
    const onScroll = () => {
      if (window.matchMedia?.(WIDE).matches ?? true) {
        place.current = { regime: 'page', top: window.scrollY, left: 0 };
      }
    };
    addEventListener('scroll', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      // Leaving: remember where, unless the reader never scrolled this visit.
      const at = place.current;
      if (at !== null) onMemory((m) => ({ ...m, scroll: at }));
      onTrayClearedSeen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pinned header's height, so keyboard focus never lands under it.
  useLayoutEffect(() => {
    const head = box.current?.querySelector('thead');
    if (head && box.current) box.current.style.setProperty('--compare-head', `${head.offsetHeight}px`);
  });

  /*
   * RESTORED ONCE THE LAYOUT HAS SETTLED -- every column finished, the rows
   * laid out -- because an offset applied to a half-built table lands
   * somewhere else. Cached results make that the first render of a
   * same-trainee return. Into whichever scroller is active; if the regime
   * changed since, the page starts at the top. An explicit target ("In
   * compare · C") then wins horizontally and takes focus.
   */
  const settled = timing !== null && columns.every((c) => c.result.kind !== 'loading');
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !settled || trainee === null) return;
    restored.current = true;
    const saved = memory.scroll;
    if (saved !== null && saved.regime === (wide ? 'page' : 'box')) {
      if (saved.regime === 'page') window.scrollTo?.(0, saved.top);
      else if (box.current) {
        box.current.scrollTop = saved.top;
        box.current.scrollLeft = saved.left;
      }
    }
    if (target !== null) {
      const at = live.findIndex((pair) => dedupeKey(pair) === target);
      const key = at === -1 ? null : pairKey(live[at] as TrayPair);
      const head = [...(box.current?.querySelectorAll<HTMLElement>('[data-pair]') ?? [])].find(
        (th) => th.dataset.pair === key,
      );
      if (head && box.current && !wide) {
        const names = box.current.querySelector('col')?.getBoundingClientRect().width ?? 200;
        box.current.scrollLeft = Math.max(0, head.offsetLeft - names);
      }
      head?.focus({ preventScroll: true });
      onTargetUsed();
    }
  });

  const setMemory = (patch: Partial<CompareMemory>) => onMemory((m) => ({ ...m, ...patch }));
  const toggleRow = (groupId: number) =>
    onMemory((m) => {
      const open = new Set(m.open);
      if (open.has(groupId)) open.delete(groupId);
      else open.add(groupId);
      return { ...m, open };
    });

  const hidden = model.hidden.identical + model.hidden.filter;
  const addLink = !wide && live.length < TRAY_CAP && slots.length < TRAY_CAP;

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
        {nav}
      </header>

      <div className={styles.title}>
        <h2 className={styles.heading}>Compare pairs</h2>
        {slots.length > 0 && (
          <span className={styles.count}>
            {live.length} of {TRAY_CAP}
          </span>
        )}
        {slots.length > 0 && addLink && (
          <a className={styles.addLink} href={SEARCH} onClick={(e) => followLink(e, SEARCH)}>
            Add a pair
          </a>
        )}
      </div>

      {trayCleared && (
        <p className={styles.notice}>Your compare tray was cleared because the roster changed.</p>
      )}

      {slots.length === 0 ? (
        <p className={styles.empty}>
          Nothing to compare yet. Add pairs from{' '}
          <a href={SEARCH} onClick={(e) => followLink(e, SEARCH)}>
            Optimize Parents
          </a>
          , a pair&rsquo;s detail, or the{' '}
          <a href={ROSTER} onClick={(e) => followLink(e, ROSTER)}>
            roster pane
          </a>
          .
        </p>
      ) : (
        <>
          <div className={styles.controls}>
            <div className={styles.trainee}>
              <TraineePicker trainees={trainees} chosen={traineeCardId} onChoose={onTrainee} />
            </div>
            <div className={styles.views} role="group" aria-label="Which window the odds report">
              {(Object.keys(VIEW_LABEL) as OddsView[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === view ? `${styles.view} ${styles.viewOn}` : styles.view}
                  aria-pressed={option === view}
                  onClick={() => onView(option)}
                >
                  {VIEW_LABEL[option]}
                </button>
              ))}
            </div>
            {/* Absent, not disabled, when there is nothing to compare. They stay
                put while columns load, so no control jumps on a trainee switch. */}
            {trainee !== null && model.canCompare && (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={memory.hideIdentical}
                  onChange={(e) => setMemory({ hideIdentical: e.target.checked })}
                />
                Hide rows identical in every pair
              </label>
            )}
            {trainee !== null && model.canCompare && criteria.length > 0 && (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={memory.onlyFiltered}
                  onChange={(e) => setMemory({ onlyFiltered: e.target.checked })}
                />
                Only my filtered sparks
              </label>
            )}
          </div>

          {trainee !== null && hidden > 0 && (
            <p className={styles.hidden}>
              {hidden} {hidden === 1 ? 'row' : 'rows'} hidden:{' '}
              {[
                model.hidden.identical > 0 ? `${model.hidden.identical} identical in every pair` : null,
                model.hidden.filter > 0 ? `${model.hidden.filter} outside your filter` : null,
              ]
                .filter(Boolean)
                .join(', ')}{' '}
              ·{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => setMemory({ hideIdentical: false, onlyFiltered: false })}
              >
                show all
              </button>
            </p>
          )}

          {trainee !== null && live.length === 1 && (
            <p className={styles.hint}>Add one more pair to compare.</p>
          )}

          {trainee === null ? (
            <p className={styles.hint}>Choose who you are training.</p>
          ) : (
            <CompareTable
              traineeName={trainee.name}
              slots={views}
              model={model}
              catalogue={catalogue}
              view={view}
              open={memory.open}
              rowsReady={timing !== null}
              showAddSlot={wide && slots.length < TRAY_CAP}
              boxRef={boxRef}
              onToggle={toggleRow}
              onRemove={remove}
              onShowBreakdown={(column) => {
                if (column.result.kind === 'ok') onShowBreakdown(column.pair, column.result.lineage);
              }}
              onRetry={(column) => retry(column.pair)}
              onShowAll={() => setMemory({ hideIdentical: false, onlyFiltered: false })}
            />
          )}
        </>
      )}
    </main>
  );
}

/** Whether a media query matches, live. True where there is no `matchMedia` (tests). */
function useMatches(query: string): boolean {
  const read = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : true);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const sync = () => setMatches(list.matches);
    list.addEventListener('change', sync);
    return () => list.removeEventListener('change', sync);
  }, [query]);
  return matches;
}
