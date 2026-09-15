import type { AncestorIdentity, AncestorSpark, ExplainNode } from '../api/types';
import { Portrait } from './Portrait';
import { SPARK_COLOR, isWhite, plural, stars } from './sparks';
import styles from './NodeCard.module.css';

/**
 * One tree node. The only card in the system, because a node is a discrete
 * entity and the 1px border is what makes it read as one: surface and paper
 * separate at 1.10:1, so the border is load-bearing.
 *
 * Every node renders the same four spark lines -- blue, pink, green, then the
 * whites as a bare count -- so the pattern is learned once and thereafter only
 * the values change. Competing tools render ~15 sparks as one uniform list,
 * which hides that three of them are structural and guaranteed.
 */
export function NodeCard({
  identity,
  affinity,
  caption,
  portraitCard,
  variant = 'ancestor',
  selected,
  onSelect,
}: {
  /** null is an empty slot: calm, not an error. */
  identity: AncestorIdentity | null;
  /** The headline number on the card. Individual affinity, or the pair total. */
  affinity: ExplainNode | null;
  caption: string;
  /** The card whose art to show. For an ancestor this is its own card. */
  portraitCard: number | null;
  variant?: 'ancestor' | 'trainee';
  selected: boolean;
  onSelect: () => void;
}) {
  if (!identity) {
    return (
      <div className={`${styles.card} ${styles.empty}`}>
        <div className={styles.name}>&nbsp;</div>
        <div className={styles.affinity}>&mdash;</div>
        <div className={styles.caption}>empty slot</div>
      </div>
    );
  }

  const unresolved = identity.resolution.ok === false;
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
          name={identity.name}
          size={size}
        />
      </span>
      <div className={styles.name}>{identity.name}</div>
      {/* An unresolved lookup shows an em dash, never a 0: a 0 would be a
          claim about the data rather than about the lookup. */}
      <div className={styles.affinity}>{unresolved ? '—' : (affinity?.value ?? '—')}</div>
      <div className={styles.caption}>
        {unresolved && identity.resolution.ok === false
          ? `could not resolve ${identity.resolution.reason.replace('_', ' ')} ${identity.resolution.id}`
          : caption}
      </div>

      {/* The trainee has not been trained yet, so it carries no sparks at all.
          Four "no blue spark" placeholders would be a claim about missing data
          rather than a fact about the game. */}
      {variant === 'ancestor' && !carriesNoSparks(identity) && (
        <div className={styles.sparks}>
          <SparkLine spark={identity.sparks.blue} placeholder="no blue spark" />
          <SparkLine spark={identity.sparks.pink} placeholder="no pink spark" />
          <SparkLine spark={identity.sparks.green} placeholder="no green spark" />
          <div className={styles.sparkLine}>
            <i className={`${styles.tick} ${styles.outlined}`} />
            <span className={styles.sparkName}>
              {plural(identity.sparks.whites.length, 'white spark')}
            </span>
          </div>
        </div>
      )}

      {/* A request that carried no factorIds at all is a different fact from an
          ancestor missing its blue: nothing is known, rather than something is
          absent. Four negatives would state the stronger claim. */}
      {variant === 'ancestor' && carriesNoSparks(identity) && (
        <div className={`${styles.sparkLine} ${styles.absent}`}>
          <i className={`${styles.tick} ${styles.outlined}`} />
          <span className={styles.sparkName}>no spark data</span>
        </div>
      )}
    </button>
  );
}

function carriesNoSparks(identity: AncestorIdentity): boolean {
  const { blue, pink, green, whites } = identity.sparks;
  return !blue && !pink && !green && whites.length === 0;
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
      <div className={`${styles.sparkLine} ${styles.absent}`}>
        <i className={`${styles.tick} ${styles.outlined}`} />
        <span className={styles.sparkName}>{placeholder}</span>
      </div>
    );
  }
  return (
    <div className={styles.sparkLine}>
      <i
        className={`${styles.tick} ${isWhite(spark.kind) ? styles.outlined : ''}`}
        style={isWhite(spark.kind) ? undefined : { background: SPARK_COLOR[spark.kind] }}
      />
      <span className={styles.sparkName}>{spark.name}</span>
      <span className={styles.sparkStars}>{stars(spark.stars)}</span>
    </div>
  );
}
