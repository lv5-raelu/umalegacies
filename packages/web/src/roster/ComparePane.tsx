import { useState } from 'react';
import type {
  LineageResponse,
  ParentPick,
  RosterSparkOption,
  SparkCriterion,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';
import {
  acquisitionChance,
  carriedCount,
  hasAcquisitionRoll,
  inheritOnceInCareer,
  jointOdds,
} from '@umalegacies/core';
import { pairTotalOf, rankGlyph } from '../lineage/pair-total';
import {
  SPARK_COLOR,
  SPARK_GROUP_ORDER,
  groupKeyOf,
  groupLabelOf,
  type SparkGroupKey,
  isWhite,
  percent,
  percentJoint,
  percentPrecise,
  scopeLabel,
} from '../lineage/sparks';
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
/**
 * Which window the odds columns report.
 *
 * Inspiration fires TWICE per career, which is what separates the first two:
 *
 *   inspiration   P(>=1) when a SINGLE inspiration fires
 *   once          P(>=1) across the career, so across both firings
 *   twice         P(>=2) across the career, which is the doubled spark
 *
 * The first answers "will this land on the next inspiration"; the second
 * answers "will this land at all"; the third is the one worth planning a pair
 * around, because a doubled spark stacks.
 */
export type OddsView = 'inspiration' | 'once' | 'twice';

const VIEW_LABEL: Readonly<Record<OddsView, string>> = {
  inspiration: '1 inspiration',
  once: 'at least once',
  twice: 'at least twice',
};

/** The long form, for the line that says what the column means. */
const VIEW_RUBRIC: Readonly<Record<OddsView, string>> = {
  inspiration: 'chance of activating when one inspiration fires',
  once: 'chance of activating at least once across a career',
  twice: 'chance of activating at least twice across a career',
};

/**
 * Everything the pane can be showing, as one closed set.
 *
 * Named rather than inlined on the prop because `paneState` below returns it.
 * It used to be spelled `Parameters<typeof ComparePane>[0]['state']` at the one
 * call site, which is a way of reading a type off a component that stops
 * working the moment anything else needs to name the same thing.
 */
export type PaneState =
  | { kind: 'need-trainee' }
  | { kind: 'need-picks'; picked: number }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; lineage: LineageResponse };

/**
 * Which of those the app's state adds up to. ORDER IS THE RULE.
 *
 * A precondition beats a failure: with no trainee chosen there is nothing to
 * have failed yet, and a stale error from the previous pair must not outrank
 * "pick two veterans". Then the error, then loading -- so a re-explain shows
 * the spinner rather than the old lineage under a new pair.
 *
 * Lives beside the pane rather than in `App` because it is the pane's own
 * contract, and because it is the only thing between a `ParentPick` and what
 * the user reads. It takes the picks themselves, not a count, so that the
 * borrow release changes this file rather than discovering that the pane was
 * handed a number derived somewhere else.
 */
export function paneState(
  traineeCardId: number | null,
  picks: readonly ParentPick[],
  loading: boolean,
  error: string | null,
  lineage: LineageResponse | null,
): PaneState {
  if (traineeCardId === null) return { kind: 'need-trainee' };
  if (picks.length !== 2) return { kind: 'need-picks', picked: picks.length };
  if (error) return { kind: 'error', message: error };
  if (loading || !lineage) return { kind: 'loading' };
  return { kind: 'ok', lineage };
}

const valueFor = (row: SparkSummaryRow, view: OddsView): number =>
  view === 'inspiration'
    ? row.withinOneInspiration
    : view === 'once'
      ? row.onceInCareer
      : row.twiceInCareer;

export function ComparePane({
  state,
  criteria,
  sparkOptions,
  pickedCount,
  embedded = false,
  onClearPicks,
  onOpenTree,
}: {
  state: PaneState;
  criteria: readonly SparkCriterion[];
  /** Only for naming a requirement this pair misses. */
  sparkOptions: readonly RosterSparkOption[];
  /** How many veterans are picked, whether or not the filter shows them. */
  pickedCount: number;
  /**
   * Something else owns the frame.
   *
   * On the roster screen this is a standing region, so it names itself and
   * carries the way out of a pick. Inside the search's detail it is content in
   * a dialog that already has a title and a close button, and repeating both
   * gave the reader two headings and a "Clear both picks" that did not clear
   * any picks -- nothing is picked yet there, since inspecting a pair is not
   * choosing it.
   */
  embedded?: boolean;
  onClearPicks: () => void;
  onOpenTree: () => void;
}) {
  // THE VIEW LIVES HERE, not in `Result`. `Result` unmounts every time a pair
  // is re-explained -- a new pick, a changed trainee -- and state held there
  // would silently snap back to the default mid-comparison.
  const [view, setView] = useState<OddsView>('once');

  return (
    <aside className={embedded ? styles.embedded : styles.pane}>
      {!embedded && <h2 className={styles.rubric}>The pair</h2>}
      {state.kind === 'need-trainee' && (
        <p className={styles.hint}>Choose who you are training, then pick two veterans.</p>
      )}
      {state.kind === 'need-picks' && (
        <p className={styles.hint}>
          {state.picked === 0
            ? 'Pick two veterans.'
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
      {!embedded && pickedCount > 0 && (
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
          view={view}
          onView={setView}
          embedded={embedded}
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
  view,
  onView,
  embedded,
  onOpenTree,
}: {
  lineage: LineageResponse;
  criteria: readonly SparkCriterion[];
  sparkOptions: readonly RosterSparkOption[];
  view: OddsView;
  onView: (view: OddsView) => void;
  /** The dialog puts this button in its own action bar; see below. */
  embedded: boolean;
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

  // The chance the whole filter lands, in whichever window is selected. A
  // requirement the pair misses is a null rather than a gap, so it takes the
  // joint to zero instead of being quietly left out of the product.
  const joint = jointOdds(wanted.map(({ row }) => (row ? valueFor(row, view) : null)));

  /*
   * The second joint, over the criteria that HAVE an inherit figure.
   *
   * Nulls are dropped here rather than zeroing the product, which is the
   * opposite of what the line above does and is right for the opposite reason:
   * a missed requirement really does take the activation joint to zero, but a
   * blue has no inherit figure because the mechanic does not reach it, not
   * because the pair fails at it. Including it would state a loss that has not
   * happened.
   *
   * The tier rides on the criterion, so a reader who ticked "gold" in the
   * search sees the gold number here on the pair they picked.
   */
  const inheritValues = criteria
    .map((c) => {
      const row = lineage.sparks.find((s) => s.groupId === c.groupId);
      if (row === undefined) {
        // The pair carries none of it. Whether that is a ZERO or a gap depends
        // on what the criterion names, and the catalogue is what knows: a
        // wanted white SKILL the pair misses is a failure like any other, and
        // anything else has no inherit figure for any pair at all.
        return sparkOptions.find((o) => o.groupId === c.groupId)?.kind === 'white_skill'
          ? 0
          : null;
      }
      return inheritOnceInCareer(
        row.kind,
        row.onceInCareer,
        row.lineageCarriers,
        c.gold === true ? 'gold' : 'white',
      );
    })
    .filter((v) => v !== null);
  const jointInherit = jointOdds(inheritValues);
  const skillCriteria = criteria.filter(
    (c) => sparkOptions.find((o) => o.groupId === c.groupId)?.kind === 'white_skill',
  ).length;

  /* Which of the reader's criteria asked for the gold version, by group. */
  const goldGroups = new Set(criteria.filter((c) => c.gold === true).map((c) => c.groupId));

  // Which sparks to light up, and which the pair does not carry at all. A
  // Set because the list asks this question once per spark, 53 times.
  const asked = new Set(criteria.map((c) => c.groupId));
  const missing = wanted.filter(({ row }) => row === null).map(({ groupId }) => groupId);

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
        {/*
          ONE SWITCH FOR EVERY NUMBER BELOW IT. The three windows are different
          questions about the same lineage, so a per-row control would invite
          reading a column whose rows answer different questions.
        */}
        <div className={styles.views} role="group" aria-label="Which window the odds report">
          {(Object.keys(VIEW_LABEL) as OddsView[]).map((option) => (
            <button
              key={option}
              type="button"
              className={option === view ? `${styles.view} ${styles.viewOn}` : styles.view}
              aria-pressed={option === view}
              onClick={() => onView(option)}
            >
              {VIEW_LABEL[option]}
            </button>
          ))}
        </div>
        <p className={styles.viewRubric}>{VIEW_RUBRIC[view]}</p>

        {/*
          THE FILTERED SPARKS ARE NO LONGER LISTED SEPARATELY, they are
          highlighted in the list below.

          They used to get their own block above the list, which meant every
          filtered spark appeared twice on a pane whose list already needed 12.5
          screens of scrolling to read. Highlighting says the same thing in no
          height at all, and says it in place -- where the spark sits among its
          own kind -- rather than in a panel that answered the narrower question.

          What CANNOT be highlighted stays: the joint figure, which belongs to
          no single spark, and a requirement the pair misses entirely, which has
          nothing in the list to highlight. The filter matched each veteran's own
          package; the composed lineage is a different set of six ancestors, so a
          spark can pass the filter and still be absent here.
        */}
        {joint !== null && (
          <div className={styles.joint}>
            {/* A VERB, because there are two of these now -- "both together"
                was unambiguous only while it was the only figure on the pane --
                and a SCOPE, because the figure skips any spark this pair does
                not carry. "all 6 activate" beside a pair holding five of them
                would be false; "5 of 6" is the same number told truthfully. */}
            <span className={styles.jointLabel}>
              {scopeLabel(
                carriedCount(wanted.map(({ row }) => (row ? valueFor(row, view) : null))),
                wanted.length,
                'activate',
              )}
            </span>
            {/* The digits, not the rounding. Same figure the pair search ranks
                by, and it collapses the same way: four sparks at 40% each is
                2.6%, and two pairs a long way apart both read "2%". Comparing
                here means picking one, reading, picking another -- the same
                discrimination problem a list has, spread over time. */}
            <span className={styles.jointValue}>{percentJoint(joint)}</span>
          </div>
        )}
        {/* Counted over the SKILL criteria only: nothing else has an inherit
            figure for any pair, so borrowing the filter's number would claim a
            wider scope than this has. */}
        {jointInherit !== null && (
          <div className={styles.joint}>
            <span className={styles.jointLabel}>
              {scopeLabel(carriedCount(inheritValues), skillCriteria, 'inherited', 'skills')}
            </span>
            <span className={styles.jointValue}>{percentJoint(jointInherit)}</span>
          </div>
        )}
        {missing.length > 0 && (
          <p className={styles.quiet}>
            This pair carries none of{' '}
            {missing
              .map((groupId) => sparkOptions.find((o) => o.groupId === groupId)?.name ?? 'a spark')
              .join(', ')}
            .
          </p>
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
          {byKind(lineage.sparks).map(([key, rows]) => (
            <div key={key} className={styles.group}>
              <p className={styles.groupLabel}>{groupLabelOf(key)}</p>
              {rows.map((row) => (
                <Odds
                  key={row.groupId}
                  row={row}
                  view={view}
                  asked={asked.has(row.groupId)}
                  gold={goldGroups.has(row.groupId)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* NOT INSIDE THE DIALOG, which carries this as its own action, pinned
          below the scrolling content. Rendering it here as well put the same
          button twice on one surface, once halfway down a scroll and once at
          the bottom. */}
      {!embedded && (
        <button type="button" className={styles.open} onClick={onOpenTree}>
          Show breakdown
        </button>
      )}
    </>
  );
}

/**
 * One spark, as a chip.
 *
 * A CHIP RATHER THAN A ROW, and the difference is the whole point. One spark
 * per line put 53 sparks into 1,644px of a 132px window -- 12.5 screens, in a
 * 380px column -- and a real user said plainly that he did not bother reading
 * it. Chips wrap, so the same 53 sparks take the height of however many lines
 * they fill rather than 53 lines. No information was removed to achieve that.
 *
 * `asked` is the spark the user filtered for. It is emphasis, not colour:
 * DESIGN.md gives amber to "added" and red to "unresolved" and says the accent
 * budget is spent, and a filter is a choice the reader made rather than a fact
 * about the game. So the chosen ones take ink and a fill while the rest recede,
 * which in a dark interface reads faster than a hue would anyway.
 */
function Odds({
  row,
  view,
  asked = false,
  gold = false,
}: {
  row: SparkSummaryRow;
  view: OddsView;
  asked?: boolean;
  /** The reader said they will learn this skill's gold version. */
  gold?: boolean;
}) {
  /*
   * THE END-OF-CAREER ROLL, AND THE CHAIN IT FINISHES.
   *
   * Recomputed here rather than read off the row, because the row carries the
   * WHITE-tier figure -- the floor a reader gets for saying nothing -- and the
   * tier is a plan that lives on their criterion. Null for everything but a
   * white skill, so races, scenarios and the three named slots keep the single
   * figure they have always had.
   */
  const keeps = hasAcquisitionRoll(row.kind)
    ? acquisitionChance(row.lineageCarriers, gold ? 'gold' : 'white')
    : null;
  const inherits = inheritOnceInCareer(
    row.kind,
    row.onceInCareer,
    row.lineageCarriers,
    gold ? 'gold' : 'white',
  );
  return (
    <span
      className={asked ? `${styles.chip} ${styles.chipAsked}` : styles.chip}
      /*
       * THE WHOLE CHAIN, ON HOVER, because the chip shows only its two ends.
       * The middle term is the one nobody can reconstruct by eye: it depends
       * on how many of the six ancestors carry the spark and on whether the
       * gold version is planned, neither of which is on the chip.
       */
      title={
        inherits === null
          ? `${row.name} ${row.stars}★ — ${percent(valueFor(row, view))} to activate` +
            (keeps === null
              ? ''
              : `, then ${percentPrecise(keeps, 1)} to inherit if the trainee earns it`)
          : `${row.name} ${row.stars}★ — ${percent(valueFor(row, view))} to activate × ` +
            `${percentPrecise(keeps as number, 1)} to inherit = ${percent(inherits)} combined`
      }
    >
      <span
        className={styles.tick}
        style={
          isWhite(row.kind)
            ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[row.kind]}` }
            : { background: SPARK_COLOR[row.kind] }
        }
      />
      <span className={styles.chipName}>{row.name}</span>
      <span className={styles.chipStars}>{row.stars}★</span>
      <span className={styles.chipValue}>{percent(valueFor(row, view))}</span>
      {/*
        TWO NUMBERS, THE SAME TWO THE SEARCH ROW SHOWS.

        A third was built here first -- the inherit roll itself, labelled
        "keeps" -- and the label had to carry two ideas it could not: that the
        figure is conditional on the trainee learning the skill, and that it
        multiplies the number beside it rather than competing with it. Nobody
        reads that off a word. It lives in the hover and in the breakdown's own
        column, where there is room to say it, and a chip in a 380px pane keeps
        its width instead.
      */}
      {inherits !== null && (
        <span className={styles.chipInherit}>({percent(inherits)})</span>
      )}
    </span>
  );
}

/**
 * The pair's sparks, grouped in render order and likeliest first within a group.
 *
 * `lineage.sparks` already arrives sorted that way from the engine, so this only
 * partitions it -- it never re-sorts, which would let the pane and the audit
 * trail on the tree page disagree about what "most likely" means.
 */
function byKind(sparks: readonly SparkSummaryRow[]): Array<[SparkGroupKey, SparkSummaryRow[]]> {
  return SPARK_GROUP_ORDER.map(
    (key) =>
      [key, sparks.filter((row) => groupKeyOf(row) === key)] as [
        SparkGroupKey,
        SparkSummaryRow[],
      ],
  ).filter(([, rows]) => rows.length > 0);
}
