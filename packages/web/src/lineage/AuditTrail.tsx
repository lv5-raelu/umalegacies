import type { SparkSummaryRow } from '../api/types';
import { ALL_POSITIONS } from '../api/types';
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
  const shown = sparks.filter((row) => !(row.kind === 'blue' && row.onceInCareer >= 0.999));
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
              ...group.map((row) => (
                <tr
                  key={row.groupId}
                  className={row.groupId === selectedGroupId ? styles.selected : undefined}
                  onClick={() => onSelect(row)}
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
                  <td className={styles.carriers}>
                    {ALL_POSITIONS.map((position) =>
                      row.carriers.some((c) => c.position === position)
                        ? String(position)
                        : '· ',
                    ).join(' ')}
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
                  <td className={styles.pctFaint}>
                    {row.twiceInCareer >= 0.005 ? percent(row.twiceInCareer) : '—'}
                  </td>
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
