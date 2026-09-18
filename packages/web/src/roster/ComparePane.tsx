import type {
  LineageResponse,
  RosterSparkOption,
  SparkCriterion,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';
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
export function ComparePane({
  state,
  criteria,
  sparkOptions,
  pickedCount,
  onClearPicks,
  onOpenTree,
}: {
  state:
    | { kind: 'need-trainee' }
    | { kind: 'need-picks'; picked: number }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; lineage: LineageResponse };
  criteria: readonly SparkCriterion[];
  /** Only for naming a requirement this pair misses. */
  sparkOptions: readonly RosterSparkOption[];
  /** How many veterans are picked, whether or not the filter shows them. */
  pickedCount: number;
  onClearPicks: () => void;
  onOpenTree: () => void;
}) {
  return (
    <aside className={styles.pane}>
      <h2 className={styles.rubric}>The pair</h2>
      {state.kind === 'need-trainee' && (
        <p className={styles.hint}>Choose who you are training, then pick two veterans.</p>
      )}
      {state.kind === 'need-picks' && (
        <p className={styles.hint}>
          {state.picked === 0
            ? 'Pick two veterans from the list. They become the two parents.'
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
  onOpenTree,
}: {
  lineage: LineageResponse;
  criteria: readonly SparkCriterion[];
  sparkOptions: readonly RosterSparkOption[];
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
        {/* The filtered sparks first and in full, because they are the ones
            the user asked about and a doubled spark stacks.

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
            {wanted.map(({ groupId, row }) =>
              row ? (
                <Odds key={groupId} row={row} twice />
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
                <Odds key={row.groupId} row={row} />
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
 * One spark's chance of firing at least once in a career.
 *
 * `twice` is only shown for the spark the user actually asked about: a doubled
 * spark stacks, so it is worth its own line there, but printing it for five
 * default rows would double the pane's height for a number nobody asked for.
 */
function Odds({ row, twice = false }: { row: SparkSummaryRow; twice?: boolean }) {
  return (
    <>
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
        <span className={styles.oddsValue}>{percent(row.onceInCareer)}</span>
      </div>
      {twice && (
        <div className={styles.oddsRow}>
          <span className={styles.oddsName}>
            <span className={styles.oddsStars}>at least twice</span>
          </span>
          <span className={styles.oddsValue}>{percent(row.twiceInCareer)}</span>
        </div>
      )}
    </>
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
