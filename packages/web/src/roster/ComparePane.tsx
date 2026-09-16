import type { LineageResponse, SparkCriterion, SparkSummaryRow } from '@umalegacies/types';
import { sumByRulePrefix } from '../lineage/explain-node';
import { SPARK_COLOR, isWhite, percent } from '../lineage/sparks';
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
  criterion,
  onOpenTree,
}: {
  state:
    | { kind: 'need-trainee' }
    | { kind: 'need-picks'; picked: number }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; lineage: LineageResponse };
  criterion: SparkCriterion | null;
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
            : 'Pick one more. A third pick replaces the older of the two.'}
        </p>
      )}
      {state.kind === 'loading' && <p className={styles.quiet}>Explaining…</p>}
      {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}
      {state.kind === 'ok' && (
        <Result lineage={state.lineage} criterion={criterion} onOpenTree={onOpenTree} />
      )}
    </aside>
  );
}

function Result({
  lineage,
  criterion,
  onOpenTree,
}: {
  lineage: LineageResponse;
  criterion: SparkCriterion | null;
  onOpenTree: () => void;
}) {
  // Both halves are SUMMED, never one subtracted from the total: subtraction
  // absorbs any discrepancy into bonus and shows two numbers for one quantity.
  const base = sumByRulePrefix(lineage.pairTotal, 'base.');
  const bonus = sumByRulePrefix(lineage.pairTotal, 'bonus.');
  const agree = base + bonus === lineage.pairTotal.value;
  // An unresolvable trainee collapses every base term that touches it, so the
  // total is not merely uncertain, it is wrong by a large margin and silently so.
  const unresolved = lineage.trainee.resolution.ok === false;
  const wanted = criterion
    ? lineage.sparks.find((row) => row.groupId === criterion.groupId)
    : undefined;

  return (
    <>
      <div className={styles.total}>{unresolved ? '—' : lineage.pairTotal.value}</div>
      <div className={styles.addends}>
        {unresolved ? (
          <span className={styles.disagree}>{resolutionText(lineage.trainee.resolution)}</span>
        ) : agree ? (
          `${base} base + ${bonus} bonus`
        ) : (
          <span className={styles.disagree}>
            addends disagree: {base} base + {bonus} bonus ≠ {lineage.pairTotal.value}
          </span>
        )}
      </div>

      {!unresolved && (
        <div className={styles.rank}>
          {'◎〇△'[3 - lineage.relationRank.value] ?? '·'} rank {lineage.relationRank.value}
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
        {criterion === null ? (
          // No filter set, so there is no "desired spark" to quote odds for. The
          // pane still answers the question the screen exists for -- what does
          // this pair actually give me -- with the likeliest few. Without this
          // the pane sits nearly empty beside a list 259 rows long.
          <>
            <p className={styles.oddsRubric}>Most likely to pass down</p>
            {lineage.sparks.slice(0, 5).map((row) => (
              <Odds key={row.groupId} row={row} />
            ))}
            <p className={styles.hint}>
              Filter by a spark above to see this pair&rsquo;s odds for it.
            </p>
          </>
        ) : wanted ? (
          <>
            <p className={styles.oddsRubric}>Your filtered spark</p>
            <Odds row={wanted} twice />
          </>
        ) : (
          // The filter matched the veteran's package, but the composed lineage
          // carries no such spark: say so rather than printing 0% and letting it
          // read as a computed answer.
          <p className={styles.quiet}>This pair carries none of that spark.</p>
        )}
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
