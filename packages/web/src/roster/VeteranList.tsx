import type {
  PackageSpark,
  ResolvedMember,
  ResolvedVeteran,
  SparkKind,
} from '@umalegacies/types';
import { Portrait } from '../lineage/Portrait';
import type { Catalogue } from './catalogue';
import { pickBlock, type PickBlock } from './filter';
import { RankBadge } from './RankBadge';
import { SPARK_COLOR, isWhite } from '../lineage/sparks';
import styles from './VeteranList.module.css';

/**
 * The roster, as cards that can be told apart.
 *
 * Identity is the hard problem here and the name does not solve it: measured on
 * the builder's save, 255 of 259 veterans share a character name with another,
 * there are 29 distinct names in total, and one character appears 54 times. So a
 * card carries four things that do separate them -- the portrait of the exact
 * costume, the score, every spark it can pass down, and the two parents it comes
 * out of, which is a 166-distinct package.
 */
export function VeteranList({
  veterans,
  pickedVeterans,
  catalogue,
  picked,
  traineeCharaId,
  onPick,
  onClearFilter,
}: {
  veterans: readonly ResolvedVeteran[];
  /** The picked veterans themselves, which may be filtered out of `veterans`. */
  pickedVeterans: readonly ResolvedVeteran[];
  catalogue: Catalogue;
  picked: readonly number[];
  /** Who is being trained. A parent cannot be the same uma. */
  traineeCharaId: number | null;
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
          <Card
            veteran={veteran}
            catalogue={catalogue}
            pickedAt={picked.indexOf(veteran.index)}
            block={pickBlock(veteran, pickedVeterans, traineeCharaId)}
            onPick={() => onPick(veteran.index)}
          />
        </li>
      ))}
    </ul>
  );
}

const BLOCK_REASON: Readonly<Record<PickBlock, string>> = {
  'is-trainee': 'This is the uma you are training. A parent cannot be the trainee.',
  'same-uma':
    'Already picked as the other parent. The two parents cannot be the same uma, whatever costume each wears.',
  'pair-full': 'Two are already picked. Unselect one to swap it.',
};

/** Said in place as well as in the tooltip, for the reasons a reader can act on. */
const BLOCK_NOTE: Readonly<Partial<Record<PickBlock, string>>> = {
  'is-trainee': 'this is the uma you are training — a parent cannot be the trainee',
  'same-uma': 'already picked as the other parent — the two parents must be different umas',
};

function Card({
  veteran,
  catalogue,
  pickedAt,
  block,
  onPick,
}: {
  veteran: ResolvedVeteran;
  catalogue: Catalogue;
  pickedAt: number;
  block: PickBlock | null;
  onPick: () => void;
}) {
  const locked = block !== null;
  // The veteran's OWN sparks are the entries whose first star count is non-zero:
  // stars is [the veteran, its slot 10, its slot 20]. Reading the card off the
  // same list the filter reads means the two cannot disagree.
  const own = veteran.sparks.filter((s) => (s.stars[0] ?? 0) > 0);
  const kindOf = (spark: PackageSpark): SparkKind | undefined =>
    catalogue.get(spark.groupId)?.kind;
  const named = (kind: SparkKind) => own.find((s) => kindOf(s) === kind);
  const whites = own
    .filter((s) => {
      const kind = kindOf(s);
      return kind !== undefined && isWhite(kind);
    })
    .sort(
      (a, b) =>
        (b.stars[0] ?? 0) - (a.stars[0] ?? 0) ||
        (catalogue.get(a.groupId)?.name ?? '').localeCompare(
          catalogue.get(b.groupId)?.name ?? '',
        ),
    );

  return (
    <button
      type="button"
      className={[
        styles.card,
        pickedAt >= 0 ? styles.picked : '',
        locked ? styles.locked : '',
        veteran.ok ? '' : styles.unresolved,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        if (!locked) onPick();
      }}
      title={block ? BLOCK_REASON[block] : undefined}
      aria-pressed={pickedAt >= 0}
      // Not `disabled`: the card is still worth reading and worth reaching with
      // a keyboard when the pair is full. It just cannot be selected.
      aria-disabled={locked || undefined}
    >
      <span className={styles.head}>
        <span className={styles.portrait}>
          <Portrait cardId={veteran.self.cardId} name={veteran.self.name} />
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>
            {veteran.self.name}
            {veteran.self.costume && (
              <span className={styles.costume}> {veteran.self.costume}</span>
            )}
          </span>
          <span className={styles.package}>out of {packageLine(veteran)}</span>
        </span>
        <span className={styles.scoreBlock}>
          <span className={styles.scoreLabel}>SCORE</span>
          <span className={styles.score}>{veteran.score.toLocaleString()}</span>
          {/* The rank the game shows, beside the number it is banded from. */}
          <span className={styles.rankRow}>
            <RankBadge score={veteran.score} />
          </span>
          {pickedAt >= 0 && (
            <span className={styles.pickMark}>{pickedAt === 0 ? 'A' : 'B'}</span>
          )}
        </span>
      </span>

      <span className={styles.named}>
        {(['blue', 'pink', 'green'] as const).map((kind) => {
          const spark = named(kind);
          return spark ? (
            <Spark key={kind} spark={spark} kind={kind} catalogue={catalogue} />
          ) : null;
        })}
      </span>

      {/* Every white named, not a count. "+7 whites" said how many there were
          and nothing about whether one of them was the one you wanted. */}
      <span className={styles.whites}>
        {whites.length === 0 ? (
          <span className={styles.noWhites}>no white sparks</span>
        ) : (
          whites.map((spark) => (
            <span key={spark.groupId} className={styles.white}>
              <span
                className={styles.whiteTick}
                style={{ boxShadow: `inset 0 0 0 1px ${SPARK_COLOR.white_skill}` }}
              />
              {catalogue.get(spark.groupId)?.name ?? `spark ${spark.groupId}`}
              <span className={styles.stars}>{spark.stars[0]}★</span>
            </span>
          ))
        )}
      </span>

      {block && BLOCK_NOTE[block] && (
        // A card that refuses a click explains itself where the click happened,
        // not only in a tooltip nobody hovers for.
        <span className={styles.blockNote}>{BLOCK_NOTE[block]}</span>
      )}

      {!veteran.ok && (
        <span className={styles.unresolvedNote}>
          {unresolvedNote(veteran)}
        </span>
      )}
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
  const name = catalogue.get(spark.groupId)?.name ?? `spark ${spark.groupId}`;
  return (
    <span className={`${styles.spark} ${styles[kind] ?? ''}`}>
      <span className={styles.tick} style={{ background: SPARK_COLOR[kind] }} />
      {/* title, because the longest unique skill is 35 characters. */}
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
 * is a different thing from one whose second parent failed to render, and the
 * engine treats the absence as real data.
 */
function packageLine(veteran: ResolvedVeteran): string {
  const name = (member: ResolvedMember | null): string =>
    member === null ? 'no parent' : member.name + (member.costume ? ` ${member.costume}` : '');
  return `${name(veteran.parents[0])} × ${name(veteran.parents[1])}`;
}

/** Names which member failed, because "unresolved" alone is not actionable. */
function unresolvedNote(veteran: ResolvedVeteran): string {
  const broken = [veteran.self, ...veteran.parents]
    .filter((m): m is ResolvedMember => m !== null && !m.resolution.ok)
    .map((m) => m.name);
  return `could not identify ${broken.join(', ')} — rebuild the master extract`;
}
