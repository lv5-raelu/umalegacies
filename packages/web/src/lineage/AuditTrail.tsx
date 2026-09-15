import type { SparkSummaryRow } from '../api/types';
import { ALL_POSITIONS } from '../api/types';
import { positionLabel } from './positions';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER, isWhite, percent } from './sparks';
import styles from './AuditTrail.module.css';

/**
 * Every spark this lineage can pass down, once, in one table.
 *
 * A per-node spark list cannot support the decision, because the decision is
 * about the lineage as a whole. Measured on fixture 5531: 52 distinct sparks
 * across the six ancestors, 30 of them on more than one ancestor, and
 * `Leap Forward` on all six. A per-node view shows that spark six separate
 * times and never answers "what can this lineage give me".
 */
export function AuditTrail({
  sparks,
  onSelect,
  selectedGroupId,
}: {
  sparks: SparkSummaryRow[];
  onSelect: (row: SparkSummaryRow) => void;
  selectedGroupId: number | null;
}) {
  // A guaranteed row is not information. Blue caps at 100% for every parent and
  // most grandparents, so those rows are dropped -- but a grandparent blue
  // below the cap is a real variable and stays. hakuraku drops category 1
  // unconditionally; this is strictly better.
  //
  // The test is EXACT equality with 1, not a 0.999 epsilon. A per-carrier rate
  // is clamped to 1 only when affinity actually caps it, and with no capped
  // carrier the product of (1 - p) is strictly positive, so `once === 1` holds
  // if and only if the spark is genuinely certain. A 0.999 threshold hid a
  // 1-star blue at individual affinity 39-42 (career 99.93% to 99.996%) under a
  // note claiming it computed to 100%, and that band sits inside the ordinary
  // grandparent range, whose median is 36.
  const shown = sparks.filter((row) => !(row.kind === 'blue' && row.onceInCareer >= 1));
  const certain = sparks.length - shown.length;

  if (sparks.length === 0) {
    return (
      <p className={styles.note}>
        This lineage carries no spark data. Ancestors bring their sparks from the save, so a
        request built by hand -- every synthetic fixture, for instance -- has affinity numbers and
        nothing to inherit.
      </p>
    );
  }

  return (
    <>
      {/* Seven columns do not fit a phone. The table scrolls sideways in its
          own region rather than dropping columns: every one of them is part of
          the audit, and the page body must never scroll horizontally. */}
      <div className={styles.scroll}>
        <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.tickCell} />
            <th>SPARK</th>
            <th>STARS</th>
            <th>CARRIERS</th>
            <th />
            <th className={styles.right}>ONCE</th>
            <th className={styles.right}>TWICE</th>
          </tr>
        </thead>
        <tbody>
          {SPARK_KIND_ORDER.flatMap((kind) => {
            const group = shown.filter((row) => row.kind === kind);
            if (group.length === 0) return [];
            return [
              <tr key={kind}>
                <td className={styles.groupTitle} colSpan={7}>
                  {SPARK_GROUP_LABEL[kind]} · {group.length}
                </td>
              </tr>,
              // Rows are the table's primary control -- ~50 of them, each
              // opening a spark's provenance -- so they must be reachable by
              // keyboard and must be able to take the global focus ring. A bare
              // <tr onClick> could do neither.
              ...group.map((row) => (
                <tr
                  key={row.groupId}
                  className={row.groupId === selectedGroupId ? styles.selected : undefined}
                  tabIndex={0}
                  role="button"
                  aria-pressed={row.groupId === selectedGroupId}
                  onClick={() => onSelect(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(row);
                    }
                  }}
                >
                  <td className={styles.tickCell}>
                    <span
                      className={isWhite(row.kind) ? styles.tickOutlined : styles.tick}
                      style={isWhite(row.kind) ? undefined : { background: SPARK_COLOR[row.kind] }}
                    />
                  </td>
                  <td className={styles.name}>{row.name}</td>
                  {/* The lineage TOTAL, not the best single spark, because that
                      total is the unit the borrow search will filter on and the
                      two must agree. */}
                  <td className={styles.figure}>{row.stars}★</td>
                  {/* A fixed six-slot grid so the column can still be scanned
                      downward, but NAMED: 11 and 12 are P1's parents and 21 and
                      22 are P2's, and nothing about the digits says so. */}
                  <td className={styles.carriers}>
                    {ALL_POSITIONS.map((position) => {
                      const carries = row.carriers.some((c) => c.position === position);
                      return (
                        <span
                          key={position}
                          className={carries ? styles.carrierOn : styles.carrierOff}
                        >
                          {carries ? positionLabel(position) : '·'}
                        </span>
                      );
                    })}
                  </td>
                  <td className={styles.barCell}>
                    <div className={styles.track}>
                      <span
                        className={styles.bar}
                        style={{
                          width: `${Math.round(row.onceInCareer * 100)}%`,
                          background: SPARK_COLOR[row.kind],
                        }}
                      />
                    </div>
                  </td>
                  <td className={styles.pct}>{percent(row.onceInCareer)}</td>
                  {/* percent() already separates 0% from <1% from an
                      uncomputable value. Collapsing all three to an em dash
                      threw that away AND collided with the em dash that means
                      "unresolved" elsewhere on the same screen. */}
                  <td className={styles.pctFaint}>{percent(row.twiceInCareer)}</td>
                </tr>
              )),
            ];
          })}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        <b>ONCE</b> is the chance of at least one activation across the two inspirations a career
        gives; <b>TWICE</b> is at least two, which is worth its own column because a doubled spark
        stacks.{' '}
        {certain > 0 && (
          <>
            {certain} blue {certain === 1 ? 'row is' : 'rows are'} omitted for computing to 100%: a
            guaranteed value is not information.{' '}
          </>
        )}
        Base activation rates are community research, not something{' '}
        <code>master.mdb</code> publishes, and this project has not verified them in game.
      </p>
    </>
  );
}
