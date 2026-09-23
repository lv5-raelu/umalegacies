import { useEffect, useRef, useState } from 'react';
import type {
  LineageResponse,
  RosterSparkOption,
  RosterVeteranInput,
  SparkCriterion,
} from '@umalegacies/types';
import { ComparePane, type PaneState } from '../roster/ComparePane';
import { explainPairLocally } from '../lineage/explain-local';
import type { PairRowData } from './search-rows';
import styles from './PairDetail.module.css';

/**
 * A CHOSEN PAIR, EXPLAINED WITHOUT LEAVING THE SEARCH.
 *
 * Picking used to navigate back to the roster screen and let its side pane do
 * this. Two things were wrong with that, and only the first was reported: the
 * pane highlights the ROSTER's criteria, so a pair found by searching for "End
 * Closer >= 7 across the lineage" arrived at a pane that highlighted nothing --
 * the two surfaces stopped sharing a filter on purpose, and the continuity went
 * with it. The second is that picking cost the reader their place in eighty
 * ranked rows, so two candidates could not be compared without re-running the
 * journey.
 *
 * Here the criteria are the SEARCH's, because that is what produced the pair.
 * The pane never filters anything -- it takes criteria only to highlight asked
 * sparks and name missed requirements -- so pair-scoped criteria are exactly
 * the right input, and the category error that forced the two lists apart does
 * not exist on this side.
 */

export function usePairDetail(
  packages: readonly RosterVeteranInput[],
  traineeCharaId: number | null,
  traineeCardId: number | null,
  masterHash: string,
  row: PairRowData | null,
): PaneState {
  const [state, setState] = useState<PaneState>({ kind: 'need-picks', picked: 0 });

  useEffect(() => {
    if (row === null || traineeCharaId === null) {
      setState({ kind: 'need-picks', picked: 0 });
      return;
    }
    const a = packages[row.a.index];
    const b = packages[row.b.index];
    if (a === undefined || b === undefined) {
      setState({ kind: 'error', message: 'That pair is no longer in the loaded roster.' });
      return;
    }

    let live = true;
    setState({ kind: 'loading' });
    // Measured at 0.375 ms in a browser, against 35.3 ms for the route it
    // replaced, so there is no visible wait to design for -- the loading state
    // exists because the game data may still be arriving on a cold tab.
    explainPairLocally(
      {
        traineeCharaId,
        ...(traineeCardId === null ? {} : { traineeCardId }),
        veteranA: { self: a.self, parents: [a.parents[0], a.parents[1]] },
        veteranB: { self: b.self, parents: [b.parents[0], b.parents[1]] },
      },
      masterHash,
    )
      .then((lineage: LineageResponse) => {
        if (live) setState({ kind: 'ok', lineage });
      })
      .catch((error: unknown) => {
        if (live) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      live = false;
    };
  }, [packages, traineeCharaId, traineeCardId, masterHash, row]);

  return state;
}

export function PairDetail({
  state,
  row,
  criteria,
  sparkOptions,
  onClose,
  onChoose,
}: {
  state: PaneState;
  row: PairRowData;
  criteria: readonly SparkCriterion[];
  sparkOptions: readonly RosterSparkOption[];
  onClose: () => void;
  /**
   * Take this pair and open its breakdown.
   *
   * ONE ACTION, NOT TWO. There was a "Use this pair" beside this that committed
   * the pair and returned to the roster. It went on the builder's call: the
   * reason to open a result is to read it, and the breakdown is where it is
   * read. The pair is still committed either way, so the roster has it -- with
   * both halves pinned to the top of the list -- whenever the reader goes
   * there.
   */
  onChoose: () => void;
}) {
  const shell = useRef<HTMLDivElement>(null);

  /*
   * ESCAPE CLOSES IT. Obligatory for a dialog: it is the way out that does not
   * require finding anything on screen.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Focus moves into the detail, so a keyboard reader is where the content is. */
  useEffect(() => {
    shell.current?.focus();
  }, [row]);

  const body = (
    <div
      className={styles.shell}
      ref={shell}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label={`${row.a.self.name} and ${row.b.self.name}`}
    >
      <div className={styles.head}>
        <span className={styles.heading}>
          {row.a.self.name} <span className={styles.times}>×</span> {row.b.self.name}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <ComparePane
          state={state}
          criteria={criteria}
          sparkOptions={sparkOptions}
          pickedCount={2}
          embedded
          onClearPicks={onClose}
          onOpenTree={onChoose}
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.use} onClick={onChoose}>
          Show breakdown
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      {/* The click that closes belongs to the backdrop, so one inside the
          dialog must not reach it. */}
      <div className={styles.centred} onClick={(e) => e.stopPropagation()} role="presentation">
        {body}
      </div>
    </div>
  );
}
