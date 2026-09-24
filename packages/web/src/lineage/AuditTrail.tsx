import type { SparkSummaryRow } from '@umalegacies/types';
import {
  acquisitionChance,
  hasAcquisitionRoll,
  inheritOnceInCareer,
  type SkillTier,
} from '@umalegacies/core';
import { ALL_POSITIONS } from './positions';
import { positionLabel } from './positions';
import {
  SPARK_COLOR,
  SPARK_GROUP_ORDER,
  groupKeyOf,
  groupLabelOf,
  isWhite,
  percent,
  percentPrecise,
} from './sparks';
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
/*
 * The two figures, at the tier the reader planned rather than the row's default.
 *
 * `SparkSummaryRow` carries the WHITE-tier answer, which is the floor for a
 * reader who has said nothing. Saying something happens on the search filter,
 * so the tier arrives here as a set of group ids and the figures are recomputed
 * rather than read off.
 */
const tierOf = (groupId: number, gold: ReadonlySet<number>): SkillTier =>
  gold.has(groupId) ? 'gold' : 'white';

const keepsOf = (row: SparkSummaryRow, gold: ReadonlySet<number>): number | null =>
  hasAcquisitionRoll(row.kind)
    ? acquisitionChance(row.lineageCarriers, tierOf(row.groupId, gold))
    : null;

const inheritsOf = (row: SparkSummaryRow, gold: ReadonlySet<number>): number | null =>
  inheritOnceInCareer(
    row.kind,
    row.onceInCareer,
    row.lineageCarriers,
    tierOf(row.groupId, gold),
  );

/**
 * Hints a direct parent's unique hands over at career start, or null.
 *
 * Greens only, and PARENT slots only: `PARENT_POSITIONS` is 10 and 20, and a
 * grandparent's unique has to be inspired for. Two parents can carry different
 * uniques but never the same one -- they are different characters by the pair
 * rules -- so this is a single carrier's stars rather than a sum.
 */
const startGrant = (row: SparkSummaryRow): number | null => {
  if (row.kind !== 'green') return null;
  const onParent = row.carriers.find((c) => c.position === 10 || c.position === 20);
  return onParent?.stars ?? null;
};

export function AuditTrail({
  sparks,
  onSelect,
  selectedGroupId,
  asked,
  gold,
}: {
  sparks: SparkSummaryRow[];
  onSelect: (row: SparkSummaryRow) => void;
  selectedGroupId: number | null;
  /**
   * The sparks the reader filtered for, lit up in place.
   *
   * NOT a filter. Every spark the lineage carries still appears: this table is
   * the audit, and hiding rows because a filter is set would make it audit a
   * narrower claim than the one on screen. It only says which rows the reader
   * came here for, in a table where ~50 of them look alike.
   *
   * TWO WEIGHTS OF ONE IDEA. `selected` already owns a fill plus an ink left
   * bar for the row whose provenance is open. Asked takes the same left bar at
   * a quieter weight, so the two read as related rather than as rival accents,
   * and a row that is both keeps the stronger one. No new colour: DESIGN.md
   * spends its whole accent budget on amber-means-added and red-means-
   * unresolved, and a filter is a choice the reader made rather than a fact
   * about the game.
   */
  asked: ReadonlySet<number>;
  /**
   * Of those, the ones the reader plans to learn the GOLD version of.
   *
   * Doubles the end-of-career roll's floor and step. Separate from `asked`
   * because a spark can be filtered for without the gold plan, and because
   * only `white_skill` has a gold form at all.
   */
  gold: ReadonlySet<number>;
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
  //
  // A SPARK THE READER ASKED FOR IS NEVER OMITTED, however certain it is.
  // Dropping it was right until filtering existed: found by the highlighting
  // work on 2026-09-21, where a filter naming Speed produced an audit trail
  // with no Speed row and a heading reading "4 guaranteed, omitted". For a
  // spark nobody asked about, certainty is noise. For one the reader came here
  // to check, "this is guaranteed" is the best answer the table can give, and
  // silence is the worst.
  const guaranteed = (row: SparkSummaryRow): boolean =>
    row.kind === 'blue' && row.onceInCareer >= 1;
  const shown = sparks.filter((row) => asked.has(row.groupId) || !guaranteed(row));
  const certain = sparks.length - shown.length;

  if (sparks.length === 0) {
    return (
      <p className={styles.note}>
        This lineage carries no spark data. Ancestors bring their sparks from the save, so a
        request built by hand -- every synthetic fixture, for instance -- has affinity numbers and
        no sparks to pass on.
      </p>
    );
  }

  return (
    <>
      {/* Nine columns do not fit a phone. The table scrolls sideways in its
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
            {/* Beside CARRIERS on purpose: INHERIT is a lookup of that column
                and nothing else, so the working is one glance wide. */}
            <th className={styles.right}>INHERIT</th>
            <th />
            <th className={styles.right}>ONCE</th>
            <th className={styles.right}>TWICE</th>
            <th className={styles.right}>COMBINED</th>
          </tr>
        </thead>
        <tbody>
          {SPARK_GROUP_ORDER.flatMap((key) => {
            const group = shown.filter((row) => groupKeyOf(row) === key);
            const omitted = sparks.filter(
              (row) => groupKeyOf(row) === key && !shown.includes(row),
            ).length;
            // A group whose rows were ALL dropped still gets its heading, and
            // the heading says why. Without this the category simply vanished:
            // a reader looking for blue found no rows, no header and no gap,
            // and the explanation sat at the foot of fifty rows.
            if (group.length === 0 && omitted === 0) return [];
            return [
              <tr key={key}>
                <td className={styles.groupTitle} colSpan={9}>
                  {groupLabelOf(key)}
                  {group.length > 0 && ` · ${group.length}`}
                  {omitted > 0 && (
                    <span className={styles.omitted}>
                      {` · ${omitted} guaranteed, omitted`}
                    </span>
                  )}
                </td>
              </tr>,
              // Rows are the table's primary control -- ~50 of them, each
              // opening a spark's provenance -- so they must be reachable by
              // keyboard and must be able to take the global focus ring. A bare
              // <tr onClick> could do neither.
              ...group.map((row) => (
                <tr
                  key={row.groupId}
                  className={
                    [
                      asked.has(row.groupId) ? styles.asked : '',
                      row.groupId === selectedGroupId ? styles.selected : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
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
                  {/*
                    A UNIQUE ON A DIRECT PARENT IS ALREADY YOURS.

                    The game hands it over at the start of the career, at a hint
                    level equal to its stars; only a GRANDPARENT's unique has to
                    wait for an inspiration. The odds column is therefore not
                    wrong -- it answers "will this fire in one of the two April
                    inspirations", which is exactly the question for the
                    grandparent copy and for the extra hints a re-fire gives --
                    but on its own it reads as the whole story, and for a row
                    like this one the whole story starts with "you have it".

                    So the fact is ADDED, not substituted. Collapsing the row to
                    "guaranteed" would throw away the grandparent odds, which
                    readers ask for by name.
                  */}
                  <td className={styles.name}>
                    {row.name}
                    {startGrant(row) !== null && (
                      <span className={styles.atStart} title="A direct parent's unique skill is acquired at the start of the career, guaranteed. The percentage beside it is the chance of it firing in an inspiration, which is what brings a grandparent's copy in and what adds further hints.">
                        +{startGrant(row)} at start
                      </span>
                    )}
                  </td>
                  {/* The lineage TOTAL, not the best single spark, because that
                      total is the unit the borrow search will filter on and the
                      two must agree. */}
                  <td className={styles.figure}>{row.stars}★</td>
                  {/*
                    A fixed six-slot grid so the column can still be scanned
                    downward, but NAMED: the raw position_ids say nothing, and
                    GP1..GP4 run left to right as the tree draws them.

                    EACH SLOT CARRIES ITS OWN STAR COUNT above the name. WHERE
                    the stars sit changes what the column answers: the total
                    beside the spark says a lineage holds eight, and only this
                    says whether that is 3+3+2 on the parents or eight ones
                    scattered over the grandparents. Those are different pairs
                    and the reader was having to open the row to tell them
                    apart.

                    Stars rather than a digit, because the row above already
                    prints "8★" and a column of digits beside it invites adding
                    the wrong two numbers. Three is the most an uma can carry,
                    so the line never grows past three glyphs.
                  */}
                  <td className={styles.carriers}>
                    {ALL_POSITIONS.map((position) => {
                      const carrier = row.carriers.find((c) => c.position === position);
                      return (
                        <span key={position} className={styles.slot}>
                          <span className={styles.slotStars}>
                            {carrier === undefined ? '' : '★'.repeat(carrier.stars)}
                          </span>
                          <span
                            className={carrier === undefined ? styles.carrierOff : styles.carrierOn}
                          >
                            {carrier === undefined ? '·' : positionLabel(position)}
                          </span>
                        </span>
                      );
                    })}
                  </td>
                  {/* The end-of-career roll. Exact for every white, and blank
                      for the three kinds it does not govern -- a trainee's
                      blue, pink and green come from their own stats,
                      aptitudes and unique skill, so no ancestor moves them.

                      percentPrecise, not percent, and it is the only column
                      here that needs it: the published table steps in halves,
                      so the rounding that is right for a computed odds turns
                      22.5% into 23% and makes the column disagree with the
                      table it is quoting. */}
                  <td className={styles.pct}>
                    {keepsOf(row, gold) === null ? (
                      <span className={styles.na}>&mdash;</span>
                    ) : (
                      percentPrecise(keepsOf(row, gold) as number, 1)
                    )}
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
                  {/* Skill sparks only. A race spark needs the trainee to win
                      that G1 and a scenario spark needs the scenario cleared,
                      and neither is something this lineage decides, so the
                      chain stops at KEEPS for them rather than being finished
                      with a guess. */}
                  <td className={styles.pct}>
                    {inheritsOf(row, gold) === null ? (
                      <span className={styles.na}>&mdash;</span>
                    ) : (
                      percent(inheritsOf(row, gold) as number)
                    )}
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
        stacks. Those two are about the RUN, and they are what the trainee can BUY with SP.{' '}
        <b>INHERIT</b> and <b>COMBINED</b> are about what the trainee walks away with, which is a
        different thing: a spark that fires hands over a skill hint, and only a separate roll at
        the end of the career turns that into a spark of the trainee&rsquo;s own.{' '}
        <b>INHERIT</b> is that roll. It starts at 20% and gains 2.5 points for each of the six
        ancestors already carrying the spark -- so it reads straight off the carriers beside it --
        and doubles to 40% and 5 points if the search says the gold version of the skill will be
        learned. Affinity does not enter into it at all, which is why a pair can be excellent in
        one of these columns and ordinary in the other.{' '}
        <b>COMBINED</b> multiplies the two, so it exists only for skill sparks: a race spark needs
        the trainee to win that G1 themselves and a scenario spark needs the scenario cleared,
        neither of which a lineage decides. Read it as a floor -- it assumes the hint gets bought,
        and it counts only the inspiration route, so a skill picked up from a support card lands
        outside it.{' '}
        A green marked <b>+N at start</b> is a unique carried by a DIRECT parent, which the
        trainee is given outright when the career begins, at N hints. Its percentage is not a
        correction to that: it is the chance of an inspiration firing the spark, which is what
        brings a grandparent&rsquo;s copy of the same unique in and what adds further hints.{' '}
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
