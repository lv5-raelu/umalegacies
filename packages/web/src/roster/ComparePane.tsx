import { useState } from 'react';
import type {
  LineageResponse,
  ParentPick,
  RosterSparkOption,
  SparkCriterion,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';
import { jointOdds } from '../lineage/joint';
import { pairTotalOf, rankGlyph } from '../lineage/pair-total';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER, isWhite, percent } from '../lineage/sparks';
import { resolutionText } from '../lineage/resolution';
import styles from './ComparePane.module.css';

/**
 * The number you are choosing against, kept on screen while the list moves.
 *
 * Sticky because comparing IS the job: a single column would put this above the
 * fold at first and nowhere at all by row 40, which turns a comparison into a
 * memory test.
 *
 * THE LARGE NUMBER IS THE PAIR TOTAL. What the user is optimising is spark
 * inheritance rather than affinity, so the odds below are the payoff -- but with
 * no filter set there are no desired sparks to quote odds for, and a headline
 * that shows nothing most of the time is not a headline.
 */
/**
 * Which window the odds columns report.
 *
 * Inspiration fires TWICE per career, which is what separates the first two:
 *
 *   inspiration   P(>=1) when a SINGLE inspiration fires
 *   once          P(>=1) across the career, so across both firings
 *   twice         P(>=2) across the career, which is the doubled spark
 *
 * The first answers "will this land on the next inspiration"; the second
 * answers "will this land at all"; the third is the one worth planning a pair
 * around, because a doubled spark stacks.
 */
export type OddsView = 'inspiration' | 'once' | 'twice';

const VIEW_LABEL: Readonly<Record<OddsView, string>> = {
  inspiration: '1 inspiration',
  once: 'at least once',
  twice: 'at least twice',
};

/** The long form, for the line that says what the column means. */
const VIEW_RUBRIC: Readonly<Record<OddsView, string>> = {
  inspiration: 'chance of inheriting when one inspiration fires',
  once: 'chance of inheriting at least once across a career',
  twice: 'chance of inheriting at least twice across a career',
};

/**
 * Everything the pane can be showing, as one closed set.
 *
 * Named rather than inlined on the prop because `paneState` below returns it.
 * It used to be spelled `Parameters<typeof ComparePane>[0]['state']` at the one
 * call site, which is a way of reading a type off a component that stops
 * working the moment anything else needs to name the same thing.
 */
export type PaneState =
  | { kind: 'need-trainee' }
  | { kind: 'need-picks'; picked: number }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; lineage: LineageResponse };

/**
 * Which of those the app's state adds up to. ORDER IS THE RULE.
 *
 * A precondition beats a failure: with no trainee chosen there is nothing to
 * have failed yet, and a stale error from the previous pair must not outrank
 * "pick two veterans". Then the error, then loading -- so a re-explain shows
 * the spinner rather than the old lineage under a new pair.
 *
 * Lives beside the pane rather than in `App` because it is the pane's own
 * contract, and because it is the only thing between a `ParentPick` and what
 * the user reads. It takes the picks themselves, not a count, so that the
 * borrow release changes this file rather than discovering that the pane was
 * handed a number derived somewhere else.
 */
export function paneState(
  traineeCardId: number | null,
  picks: readonly ParentPick[],
  loading: boolean,
  error: string | null,
  lineage: LineageResponse | null,
): PaneState {
  if (traineeCardId === null) return { kind: 'need-trainee' };
  if (picks.length !== 2) return { kind: 'need-picks', picked: picks.length };
  if (error) return { kind: 'error', message: error };
  if (loading || !lineage) return { kind: 'loading' };
  return { kind: 'ok', lineage };
}

const valueFor = (row: SparkSummaryRow, view: OddsView): number =>
  view === 'inspiration'
    ? row.withinOneInspiration
    : view === 'once'
      ? row.onceInCareer
      : row.twiceInCareer;

export function ComparePane({
  state,
  criteria,
  sparkOptions,
  pickedCount,
  onClearPicks,
  onOpenTree,
}: {
  state: PaneState;
  criteria: readonly SparkCriterion[];
  /** Only for naming a requirement this pair misses. */
  sparkOptions: readonly RosterSparkOption[];
  /** How many veterans are picked, whether or not the filter shows them. */
  pickedCount: number;
  onClearPicks: () => void;
  onOpenTree: () => void;
}) {
  // THE VIEW LIVES HERE, not in `Result`. `Result` unmounts every time a pair
  // is re-explained -- a new pick, a changed trainee -- and state held there
  // would silently snap back to the default mid-comparison.
  const [view, setView] = useState<OddsView>('once');

  return (
    <aside className={styles.pane}>
      <h2 className={styles.rubric}>The pair</h2>
      {state.kind === 'need-trainee' && (
        <p className={styles.hint}>Choose who you are training, then pick two veterans.</p>
      )}
      {state.kind === 'need-picks' && (
        <p className={styles.hint}>
          {state.picked === 0
            ? 'Pick two veterans.'
            : 'Pick one more.'}
        </p>
      )}

      {/*
        CLEARING LIVES HERE, not in the list, because the list is exactly where
        it stops working. A filter can hide both picks -- narrow on a spark
        neither of them carries and every remaining card is locked "two are
        already picked", with nothing on screen to unselect. The pane always
        names what is picked and is always visible, so this is the one place the
        way out cannot itself be filtered away.
      */}
      {pickedCount > 0 && (
        <button type="button" className={styles.clearPicks} onClick={onClearPicks}>
          Clear {pickedCount === 1 ? 'pick' : 'both picks'}
        </button>
      )}
      {state.kind === 'loading' && <p className={styles.quiet}>Explaining…</p>}
      {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}
      {state.kind === 'ok' && (
        <Result
          lineage={state.lineage}
          criteria={criteria}
          sparkOptions={sparkOptions}
          view={view}
          onView={setView}
          onOpenTree={onOpenTree}
        />
      )}
    </aside>
  );
}

function Result({
  lineage,
  criteria,
  sparkOptions,
  view,
  onView,
  onOpenTree,
}: {
  lineage: LineageResponse;
  criteria: readonly SparkCriterion[];
  sparkOptions: readonly RosterSparkOption[];
  view: OddsView;
  onView: (view: OddsView) => void;
  onOpenTree: () => void;
}) {
  const { total, base, bonus, addendsAgree, traineeUnresolved } = pairTotalOf(lineage);
  // One entry per required spark, in the order they were asked for, each
  // paired with what this lineage actually carries of it -- or null when it
  // carries none. Kept as a list rather than filtered down, so a requirement
  // the pair misses is SHOWN as missed instead of silently disappearing from a
  // panel headed "your filtered sparks".
  const wanted = criteria.map((c) => ({
    groupId: c.groupId,
    row: lineage.sparks.find((s) => s.groupId === c.groupId) ?? null,
  }));

  // The chance the whole filter lands, in whichever window is selected. A
  // requirement the pair misses is a null rather than a gap, so it takes the
  // joint to zero instead of being quietly left out of the product.
  const joint = jointOdds(wanted.map(({ row }) => (row ? valueFor(row, view) : null)));

  return (
    <>
      <div className={styles.total}>{traineeUnresolved ? '—' : total}</div>
      <div className={styles.addends}>
        {traineeUnresolved ? (
          <span className={styles.disagree}>{resolutionText(lineage.trainee.resolution)}</span>
        ) : addendsAgree ? (
          `${base} base + ${bonus} bonus`
        ) : (
          <span className={styles.disagree}>
            addends disagree: {base} base + {bonus} bonus ≠ {total}
          </span>
        )}
      </div>

      {!traineeUnresolved && (
        <div className={styles.rank}>
          {rankGlyph(lineage.relationRank.value)} rank {lineage.relationRank.value}
        </div>
      )}

      <p className={styles.pair}>
        {lineage.trainee.name}
        <span className={styles.slot}>
          <span className={styles.slotLabel}>P1</span>
          {lineage.ancestors[10]?.name ?? '—'}
        </span>
        <span className={styles.slot}>
          <span className={styles.slotLabel}>P2</span>
          {lineage.ancestors[20]?.name ?? '—'}
        </span>
      </p>

      <div className={styles.odds}>
        {/*
          ONE SWITCH FOR EVERY NUMBER BELOW IT. The three windows are different
          questions about the same lineage, so a per-row control would invite
          reading a column whose rows answer different questions.
        */}
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
        <p className={styles.viewRubric}>{VIEW_RUBRIC[view]}</p>

        {/* The filtered sparks first, because they are the ones the user asked
            about.

            EVERY requirement gets a line, including the ones this pair misses.
            The filter matched each veteran's own package; the composed lineage
            is a different set of six ancestors, so a spark can pass the filter
            and still be absent here. Dropping those rows would answer a
            narrower question than the one on screen. */}
        {wanted.length > 0 && (
          <div className={styles.filtered}>
            <p className={styles.oddsRubric}>
              {wanted.length === 1 ? 'Your filtered spark' : `Your ${wanted.length} filtered sparks`}
            </p>
            {/*
              THE AGGREGATE FIRST, ITS ADDENDS BENEATH, like the pair total.
              A filter naming four sparks is one build rather than four separate
              wishes, so "all four" is the number being chosen against and the
              per-spark rows are the working. Four sparks at 40% each is 2.6%,
              and until this line existed nothing on the screen said so.
            */}
            {joint !== null && (
              <div className={styles.joint}>
                <span className={styles.jointLabel}>
                  {wanted.length === 2 ? 'both together' : `all ${wanted.length} together`}
                </span>
                <span className={styles.jointValue}>{percent(joint)}</span>
              </div>
            )}
            {wanted.map(({ groupId, row }) =>
              row ? (
                <Odds key={groupId} row={row} view={view} />
              ) : (
                // Say so rather than printing 0% and letting it read as a
                // computed answer.
                <p key={groupId} className={styles.quiet}>
                  This pair carries none of{' '}
                  {sparkOptions.find((o) => o.groupId === groupId)?.name ?? 'that spark'}.
                </p>
              ),
            )}
          </div>
        )}

        {/*
          EVERY spark this pair can pass down, whites included.
          A white is the largest group by far -- 231 distinct types across the
          roster against 5 blue and 10 pink -- and its odds are the whole reason
          to prefer one pair over another once affinity is close. Showing only
          blue, pink and green answered the easy question and hid the one that
          actually decides the pick.

          Scrolls inside the pane rather than lengthening it, so the total and
          the rank stay pinned while the list moves.
        */}
        <p className={styles.oddsRubric}>
          Everything this pair can pass down{' '}
          <span className={styles.oddsCount}>({lineage.sparks.length})</span>
        </p>
        <div className={styles.oddsScroll}>
          {byKind(lineage.sparks).map(([kind, rows]) => (
            <div key={kind} className={styles.group}>
              <p className={styles.groupLabel}>{SPARK_GROUP_LABEL[kind]}</p>
              {rows.map((row) => (
                <Odds key={row.groupId} row={row} view={view} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <button type="button" className={styles.open} onClick={onOpenTree}>
        Show the working
      </button>
    </>
  );
}

/**
 * One spark's line: what it is, how many stars the lineage carries, and its
 * chance under whichever window is selected.
 *
 * ONE NUMBER PER ROW. An earlier version printed a second "at least twice" line
 * under each filtered spark, which doubled the pane's height and still could not
 * show the third window. The switch above the list does that job for every row
 * at once, so a row is a row again.
 */
function Odds({ row, view }: { row: SparkSummaryRow; view: OddsView }) {
  return (
    <div className={styles.oddsRow}>
      <span
        className={styles.tick}
        style={
          isWhite(row.kind)
            ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[row.kind]}` }
            : { background: SPARK_COLOR[row.kind] }
        }
      />
      <span className={styles.oddsName} title={row.name}>
        {row.name}
      </span>
      <span className={styles.oddsStars}>{row.stars}★</span>
      <span className={styles.oddsValue}>{percent(valueFor(row, view))}</span>
    </div>
  );
}

/**
 * The pair's sparks, grouped in render order and likeliest first within a group.
 *
 * `lineage.sparks` already arrives sorted that way from the engine, so this only
 * partitions it -- it never re-sorts, which would let the pane and the audit
 * trail on the tree page disagree about what "most likely" means.
 */
function byKind(sparks: readonly SparkSummaryRow[]): Array<[SparkKind, SparkSummaryRow[]]> {
  return SPARK_KIND_ORDER.map(
    (kind) => [kind, sparks.filter((row) => row.kind === kind)] as [SparkKind, SparkSummaryRow[]],
  ).filter(([, rows]) => rows.length > 0);
}
