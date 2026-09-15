import type { AncestorSpark, AncestorSparkSet, ExplainNode, Resolution } from '../api/types';
import { Portrait } from './Portrait';
import { resolutionText } from './resolution';
import { SPARK_COLOR, isWhite, plural, stars } from './sparks';
import styles from './NodeCard.module.css';

/**
 * One tree node. The only card in the system, because a node is a discrete
 * entity and the 1px border is what makes it read as one: surface and paper
 * separate at 1.10:1, so the border is load-bearing.
 *
 * Every ANCESTOR node renders the same four spark lines -- blue, pink, green,
 * then the whites as a bare count -- so the pattern is learned once and
 * thereafter only the values change. Competing tools render ~15 sparks as one
 * uniform list, which hides that three of them are structural and guaranteed.
 *
 * Two deliberate exceptions: the trainee passes `sparks: null` and renders no
 * spark block at all, and an ancestor whose set is empty gets one "no spark
 * data" line rather than four negatives. Nothing known is not something absent.
 */
/**
 * What a node displays. Deliberately NOT the wire type: the trainee is not an
 * ancestor and has no slot, no card and no sparks, and forging an
 * AncestorIdentity for it meant inventing `position: 0, cardId: 0` -- values the
 * API's own Position union forbids and the server never sends. That widened the
 * web's copy of the wire type to accommodate a local sentinel.
 */
export interface NodeSubject {
  name: string;
  resolution: Resolution;
  /** null for the trainee, which has not been trained and so carries nothing. */
  sparks: AncestorSparkSet | null;
}

export function NodeCard({
  subject,
  affinity,
  caption,
  portraitCard,
  variant = 'ancestor',
  selected,
  onSelect,
}: {
  /** null is an empty slot: calm, not an error. */
  subject: NodeSubject | null;
  /** The headline number on the card. Individual affinity, or the pair total. */
  affinity: ExplainNode | null;
  caption: string;
  /** The card whose art to show. For an ancestor this is its own card. */
  portraitCard: number | null;
  variant?: 'ancestor' | 'trainee';
  selected: boolean;
  onSelect: () => void;
}) {
  if (!subject) {
    return (
      <div className={`${styles.card} ${styles.empty}`}>
        <span className={styles.name}>&nbsp;</span>
        <span className={styles.affinity}>&mdash;</span>
        <span className={styles.caption}>empty slot</span>
      </div>
    );
  }

  const unresolved = subject.resolution.ok === false;
  const size = variant === 'trainee' ? 54 : 48;
  // An unresolved card has no portrait to fetch, so fall straight to initials
  // rather than asking the API for an id it just told us it does not know.
  const portraitCardId = unresolved ? null : portraitCard;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        styles.card,
        styles.button,
        variant === 'trainee' ? styles.trainee : '',
        selected ? styles.selected : '',
        unresolved ? styles.unresolved : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.portrait}>
        {/* The ancestor's own CARD, not its character: a costume carries its
            own unique skill, which is the green spark three lines below this
            image. Keying by chara drew Oguri Cap's base face above "Festive
            Miracle", which belongs to her other costume.

            key= so React REMOUNTS on a change. Portrait holds a `failed` flag
            from the image's error event, and these cards are keyed by slot, so
            the instance survives a lineage switch: a slot that 404'd once would
            keep showing initials for the next costume in it, even a cached one.
            That is the ordinary state after a patch adds an uma the cache has
            not been refilled for. */}
        <Portrait
          key={portraitCardId ?? 'unresolved'}
          cardId={portraitCardId}
          name={subject.name}
          size={size}
        />
      </span>
      <span className={styles.name}>{subject.name}</span>
      {/* An unresolved lookup shows an em dash, never a 0: a 0 would be a
          claim about the data rather than about the lookup. */}
      <span className={styles.affinity}>{unresolved ? '—' : (affinity?.value ?? '—')}</span>
      <span className={styles.caption}>
        {resolutionText(subject.resolution) ?? caption}
      </span>

      {/* The trainee passes sparks: null -- it has not been trained, so it
          carries nothing at all, and four "no blue spark" placeholders would be
          a claim about missing data rather than a fact about the game. */}
      {subject.sparks && !isEmpty(subject.sparks) && (
        <span className={styles.sparks}>
          <SparkLine spark={subject.sparks.blue} placeholder="no blue spark" />
          <SparkLine spark={subject.sparks.pink} placeholder="no pink spark" />
          <SparkLine spark={subject.sparks.green} placeholder="no green spark" />
          <span className={styles.sparkLine}>
            <i className={`${styles.tick} ${styles.outlined}`} />
            <span className={styles.sparkName}>
              {plural(subject.sparks.whites.length, 'white spark')}
            </span>
          </span>
        </span>
      )}

      {/* A request that carried no factorIds at all is a different fact from an
          ancestor missing its blue: nothing is known, rather than something is
          absent. Four negatives would state the stronger claim. */}
      {subject.sparks && isEmpty(subject.sparks) && (
        <span className={`${styles.sparkLine} ${styles.absent}`}>
          <i className={`${styles.tick} ${styles.outlined}`} />
          <span className={styles.sparkName}>no spark data</span>
        </span>
      )}
    </button>
  );
}

/** Nothing known, as opposed to something absent. */
function isEmpty(sparks: AncestorSparkSet): boolean {
  return !sparks.blue && !sparks.pink && !sparks.green && sparks.whites.length === 0;
}

/**
 * The blue, pink and green slots are always present and always in that order,
 * because every ancestor carries exactly one of each: measured across all 1,554
 * ancestor slots in the roster, type 1 appears 1,554 times and type 2 1,554.
 * A missing one is therefore worth saying out loud rather than collapsing the
 * row and shifting everything under it.
 */
function SparkLine({ spark, placeholder }: { spark: AncestorSpark | null; placeholder: string }) {
  if (!spark) {
    return (
      <span className={`${styles.sparkLine} ${styles.absent}`}>
        <i className={`${styles.tick} ${styles.outlined}`} />
        <span className={styles.sparkName}>{placeholder}</span>
      </span>
    );
  }
  return (
    <span className={styles.sparkLine}>
      {/* Called only with the blue, pink and green slots, never a white. */}
      <i className={styles.tick} style={{ background: SPARK_COLOR[spark.kind] }} />
      <span className={styles.sparkName}>{spark.name}</span>
      <span className={styles.sparkStars}>{stars(spark.stars)}</span>
    </span>
  );
}
