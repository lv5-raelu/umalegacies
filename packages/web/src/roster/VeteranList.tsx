import type { PackageSpark, ResolvedMember, ResolvedVeteran, RosterSparkOption, SparkKind } from '@umalegacies/types';
import { SPARK_COLOR, isWhite } from '../lineage/sparks';
import styles from './VeteranList.module.css';

export type Catalogue = ReadonlyMap<number, RosterSparkOption>;

export const catalogueOf = (options: readonly RosterSparkOption[]): Catalogue =>
  new Map(options.map((o) => [o.groupId, o]));

/**
 * The roster, as rows that can be told apart.
 *
 * The hard problem here is identity, and the name does not solve it: measured on
 * the builder's save, 255 of 259 veterans share a character name with another,
 * there are 29 distinct names in total, and one character appears 54 times. So
 * the row leads with score and with what the veteran passes down, and identifies
 * itself as the veteran PLUS ITS OWN TWO PARENTS -- that package is 166-distinct.
 */
export function VeteranList({
  veterans,
  catalogue,
  picked,
  onPick,
  onClearFilter,
}: {
  veterans: readonly ResolvedVeteran[];
  catalogue: Catalogue;
  picked: readonly number[];
  onPick: (index: number) => void;
  onClearFilter: () => void;
}) {
  if (veterans.length === 0) {
    return (
      <p className={styles.empty}>
        No veterans match that filter.{' '}
        <button type="button" className={styles.clear} onClick={onClearFilter}>
          Clear it
        </button>{' '}
        to see the whole roster again.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {veterans.map((veteran) => (
        <li key={veteran.index}>
          <Row
            veteran={veteran}
            catalogue={catalogue}
            pickedAt={picked.indexOf(veteran.index)}
            onPick={() => onPick(veteran.index)}
          />
        </li>
      ))}
    </ul>
  );
}

function Row({
  veteran,
  catalogue,
  pickedAt,
  onPick,
}: {
  veteran: ResolvedVeteran;
  catalogue: Catalogue;
  pickedAt: number;
  onPick: () => void;
}) {
  // The veteran's OWN sparks are the entries whose first star count is non-zero:
  // stars is [the veteran, its slot 10, its slot 20]. Reading the row off the
  // same list the filter reads means the two cannot disagree about what a
  // veteran carries.
  const own = veteran.sparks.filter((s) => (s.stars[0] ?? 0) > 0);
  const named = (kind: SparkKind) =>
    own.find((s) => catalogue.get(s.groupId)?.kind === kind);
  const whites = own.filter((s) => {
    const kind = catalogue.get(s.groupId)?.kind;
    return kind !== undefined && isWhite(kind);
  }).length;

  return (
    <button
      type="button"
      className={`${styles.row} ${pickedAt >= 0 ? styles.picked : ''} ${
        veteran.ok ? '' : styles.unresolved
      }`}
      onClick={onPick}
      aria-pressed={pickedAt >= 0}
    >
      <div className={styles.top}>
        <span className={styles.score}>{veteran.score.toLocaleString()}</span>
        <span className={styles.name}>
          {veteran.self.name}
          {veteran.self.costume && <span className={styles.costume}> {veteran.self.costume}</span>}
        </span>
        {pickedAt >= 0 && <span className={styles.pickMark}>{pickedAt === 0 ? 'A' : 'B'}</span>}
        <span className={styles.sparks}>
          {(['blue', 'pink', 'green'] as const).map((kind) => {
            const spark = named(kind);
            return spark ? (
              <Spark key={kind} spark={spark} kind={kind} catalogue={catalogue} />
            ) : null;
          })}
          <span className={styles.whites}>
            +{whites} white{whites === 1 ? '' : 's'}
          </span>
        </span>
      </div>
      <div className={styles.package}>out of {packageLine(veteran)}</div>
    </button>
  );
}

function Spark({
  spark,
  kind,
  catalogue,
}: {
  spark: PackageSpark;
  kind: SparkKind;
  catalogue: Catalogue;
}) {
  const entry = catalogue.get(spark.groupId);
  const name = entry?.name ?? `spark ${spark.groupId}`;
  return (
    <span className={`${styles.spark} ${styles[kind] ?? ''}`}>
      <span
        className={styles.tick}
        style={
          isWhite(kind)
            ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[kind]}` }
            : { background: SPARK_COLOR[kind] }
        }
      />
      {/* title, because the longest unique skill is 35 characters and the
          column is 21. The tree page shows it in full. */}
      <span className={styles.sparkName} title={name}>
        {name}
      </span>
      <span className={styles.stars}>{spark.stars[0]}★</span>
    </span>
  );
}

/**
 * "out of Mejiro Dober x Inari One".
 *
 * An empty slot says so rather than being skipped: a veteran out of one parent
 * is a different thing from a veteran whose second parent happened not to render,
 * and the engine treats the absence as real data.
 */
function packageLine(veteran: ResolvedVeteran): string {
  const name = (member: ResolvedMember | null): string =>
    member === null ? 'no parent' : member.name + (member.costume ? ` ${member.costume}` : '');
  return `${name(veteran.parents[0])} × ${name(veteran.parents[1])}`;
}
