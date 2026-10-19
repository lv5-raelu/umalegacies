import type { ResolvedVeteran, SparkKind } from '@umalegacies/types';
import { Portrait } from '../lineage/Portrait';
import { pairTotalOf, rankGlyph } from '../lineage/pair-total';
import { SPARK_COLOR } from '../lineage/sparks';
import type { Catalogue } from '../roster/catalogue';
import { RankBadge } from '../roster/RankBadge';
import type { ModelColumn } from './compare-model';
import styles from './PairHeader.module.css';

/**
 * ONE PAIR'S IDENTITY, the same in every column.
 *
 * Names cannot tell loop versions apart -- three Oguri Caps out of Inari One x
 * Mayano Top Gun read identically -- so what DOES differ leads, in ink: each
 * half's score and its own blue, pink and green. What they share is quiet:
 * the name muted, the grandparents faint (the veteran card's rule, design
 * review 1B). Identically styled in every column: nothing here is larger,
 * bolder or more coloured for one pair than another.
 *
 * The identity comes from the ROSTER and is always shown; only the pair total,
 * its addends and the rank depend on the trainee, and those become skeletons
 * while the column explains -- never the previous trainee's figures.
 */
export function PairHeader({
  column,
  shared,
  catalogue,
  onRemove,
  onShowBreakdown,
}: {
  column: ModelColumn;
  shared: readonly [string | null, string | null];
  catalogue: Catalogue;
  onRemove: () => void;
  /** Absent on a column with nothing to break down: blocked, loading or failed. */
  onShowBreakdown: (() => void) | null;
}) {
  return (
    <div className={styles.header}>
      <Totals column={column} />
      {column.halves.map((half, side) => (
        <Half
          key={side}
          slot={side === 0 ? 'P1' : 'P2'}
          veteran={half}
          shared={shared[side] ?? null}
          catalogue={catalogue}
        />
      ))}
      <div className={styles.actions}>
        {onShowBreakdown !== null && (
          <button type="button" className={styles.breakdown} onClick={onShowBreakdown}>
            Show breakdown
          </button>
        )}
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Remove pair ${column.letter}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** "A 284 131 base + 153 bonus ◎ rank 3", or skeletons, or nothing. */
function Totals({ column }: { column: ModelColumn }) {
  const { result } = column;
  const figures = result.kind === 'ok' ? pairTotalOf(result.lineage) : null;
  return (
    <div className={styles.totals}>
      <span className={styles.letter}>{column.letter}</span>
      {figures !== null && result.kind === 'ok' ? (
        <>
          <span className={styles.total}>{figures.traineeUnresolved ? '—' : figures.total}</span>
          {!figures.traineeUnresolved && (
            <span className={styles.addends}>
              {figures.base} base + {figures.bonus} bonus
            </span>
          )}
          {!figures.traineeUnresolved && (
            <span className={styles.rank}>
              {rankGlyph(result.lineage.relationRank.value)} rank {result.lineage.relationRank.value}
            </span>
          )}
        </>
      ) : result.kind === 'loading' ? (
        <>
          <span className={styles.skeleton} style={{ width: '3ch' }} />
          <span className={styles.skeleton} style={{ width: '16ch' }} />
        </>
      ) : null}
    </div>
  );
}

const NAMED: readonly SparkKind[] = ['blue', 'pink', 'green'];

function Half({
  slot,
  veteran,
  shared,
  catalogue,
}: {
  slot: 'P1' | 'P2';
  veteran: ResolvedVeteran | null;
  shared: string | null;
  catalogue: Catalogue;
}) {
  if (veteran === null) {
    return (
      <div className={styles.half}>
        <span className={styles.slot}>{slot}</span>
        <span className={styles.name}>No longer in your roster</span>
      </div>
    );
  }
  // The veteran's OWN sparks: stars[0] is the veteran, [1] and [2] its parents.
  const own = NAMED.flatMap((kind) => {
    const spark = veteran.sparks.find(
      (s) => (s.stars[0] ?? 0) > 0 && catalogue.get(s.groupId)?.kind === kind,
    );
    return spark ? [{ kind, spark }] : [];
  });
  const [p10, p20] = veteran.parents;
  return (
    <div className={styles.half}>
      <span className={styles.portrait}>
        <Portrait cardId={veteran.self.cardId} name={veteran.self.name} />
      </span>
      <div className={styles.identity}>
        <div className={styles.line}>
          <span className={styles.slot}>{slot}</span>
          <RankBadge score={veteran.score} size={20} />
          <span className={styles.score}>{veteran.score}</span>
          <span className={styles.name}>{veteran.self.name}</span>
        </div>
        <div className={styles.sparks}>
          {own.map(({ kind, spark }) => (
            <span key={kind} className={styles.spark}>
              <span className={styles.tick} style={{ background: SPARK_COLOR[kind] }} />
              {catalogue.get(spark.groupId)?.name}{' '}
              <span className={styles.stars}>{spark.stars[0]}★</span>
            </span>
          ))}
        </div>
        <div className={styles.grandparents}>
          {p10?.name ?? '—'} × {p20?.name ?? '—'}
        </div>
        {shared !== null && <div className={styles.shared}>{shared}</div>}
      </div>
    </div>
  );
}

/**
 * THE COMPACT STRIP, the one line per column that pins below 600px.
 *
 * The whole identity block pinned at a phone's width took ~340px of a ~430px
 * box and left three rows to read. This keeps what says which column is which
 * -- the letter, the total and the two scores -- and lets the rest scroll away.
 */
export function PairStrip({ column }: { column: ModelColumn }) {
  const [a, b] = column.halves;
  const { result } = column;
  return (
    <span className={styles.strip}>
      <span className={styles.letter}>{column.letter}</span>
      {result.kind === 'ok' ? (
        <span className={styles.stripTotal}>{pairTotalOf(result.lineage).total}</span>
      ) : result.kind === 'loading' ? (
        <span className={styles.skeleton} style={{ width: '3ch' }} />
      ) : null}
      <span className={styles.stripScores}>
        {a?.score ?? '—'} × {b?.score ?? '—'}
      </span>
    </span>
  );
}
