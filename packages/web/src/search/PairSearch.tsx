import { memo, useMemo, useState, type ReactNode } from 'react';
import type {
  LineageResponse,
  ResolvedMember,
  ResolvedVeteran,
  RosterResolveResponse,
  RosterVeteranInput,
  SparkCriterion,
  SparkKind,
  TraineeOption,
} from '@umalegacies/types';
import { carriedCount, countsTowardOdds } from '@umalegacies/core';
import { AncestorPin, type PinOption } from './AncestorPin';
import { Portrait } from '../lineage/Portrait';
import { rankGlyph } from '../lineage/pair-total';
import {
  SPARK_COLOR,
  SPARK_KIND_ORDER,
  isWhite,
  percent,
  percentJoint,
  scopeLabel,
} from '../lineage/sparks';
import { catalogueOf, type Catalogue } from '../roster/catalogue';
import { RankBadge } from '../roster/RankBadge';
import { SparkFilter } from '../roster/SparkFilter';
import { TraineePicker } from '../roster/TraineePicker';
import { usePairSearch, type SearchStatus } from './usePairSearch';
import { viewOf, type PairRowData, type SortBy } from './search-rows';
import { PairDetail, usePairDetail } from './PairDetail';
import type { OddsView } from '../lineage/odds';
import { CompareToggle, type CompareStatus } from '../compare/CompareToggle';
import styles from './PairSearch.module.css';

/**
 * THE INVERSE QUERY, AS A SCREEN. "Given what I want, which pair gets it?"
 *
 * Grew out of the wireframe this replaces, which existed to answer one
 * question: can a reader tell WHICH two umas a ranked row names? The roster
 * list had to solve that once -- 255 of the builder's 259 veterans share a
 * character name with another, 29 distinct names cover 259 rows, one character
 * appears 54 times -- and solved it with a card leading on the portrait of the
 * exact costume, the score, the sparks and the veteran's own two parents, a
 * 166-distinct package. A ranked PAIR row does that TWICE in half the width
 * each, eighty rows deep. The layout below is what survived that review.
 *
 * EVERY NUMBER IS REAL NOW. The wireframe invented the probabilities, the pair
 * totals and the rank glyphs; `sweepPairs` computes them from the same
 * `packages/core` functions the compare pane uses, so a figure does not change
 * because it was reached by searching rather than by clicking.
 *
 * THE ROW IS THE CARD, and the two halves inside it are not. DESIGN.md allows a
 * card only for "a discrete entity you can point at", and in a search the thing
 * you point at is the PAIR -- picking half a result is not a move. Nesting two
 * veteran cards inside a result card would invent a second meaning for the
 * border and a nesting level the product does not have anywhere else.
 */
export function PairSearch({
  roster,
  packages,
  trainees,
  traineeCardId,
  criteria,
  shown,
  onTrainee,
  onCriteria,
  onShowMore,
  onPick,
  oddsView,
  onOddsView,
  compareStatus,
  onCompareAdd,
  onCompareOpen,
  nav,
}: {
  roster: RosterResolveResponse;
  /** The slimmed save the engine reads. Index-aligned with `roster.veterans`. */
  packages: readonly RosterVeteranInput[];
  trainees: readonly TraineeOption[];
  /**
   * THE APP'S TRAINEE AND THE APP'S CRITERIA, not this screen's.
   *
   * The wireframe kept its own on purpose, because App persists all three to
   * IndexedDB on every change and a throwaway surface must not rewrite the
   * user's saved selection while they poke at it. This one IS the surface, so
   * sharing is the point: a filter set here is the filter set on the roster
   * screen, and going back does not lose it.
   */
  traineeCardId: number | null;
  criteria: readonly SparkCriterion[];
  shown: number;
  onTrainee: (cardId: number) => void;
  onCriteria: (next: SparkCriterion[]) => void;
  onShowMore: () => void;
  /** Take this pair, picked, to its breakdown. */
  onPick: (a: number, b: number, lineage: LineageResponse | null) => void;
  /** App's odds window, for the detail's embedded pane. */
  oddsView: OddsView;
  onOddsView: (view: OddsView) => void;
  /** Where the pair of roster rows `a` x `b` stands in the compare tray. */
  compareStatus: (a: number, b: number) => CompareStatus;
  onCompareAdd: (a: number, b: number) => void;
  /** Open /compare at this pair. */
  onCompareOpen: (a: number, b: number) => void;
  /**
   * Rendered by `App`, which is the only place that knows whether the OTHER
   * screens are reachable. A screen that worked out its own navigation could
   * disagree with its neighbours about what exists.
   */
  nav: ReactNode;
}) {
  const trainee = useMemo(
    () => trainees.find((t) => t.cardId === traineeCardId) ?? null,
    [trainees, traineeCardId],
  );

  /** The row being inspected, or null. Inspecting does NOT change the app's pair. */
  const [inspecting, setInspecting] = useState<PairRowData | null>(null);

  /*
   * THE REQUIREMENTS THE RESULTS BELOW ARE ABOUT, which is not the same list as
   * the one in the control above.
   *
   * The sweep used to re-run on every edit. Adding four requirements meant four
   * sweeps, three of them about a question nobody had finished asking -- and on
   * a whites-only filter each is over a second of a worker's time. Worse, the
   * intermediate answers are misleading rather than merely wasteful: a reader
   * part-way through building "Stamina AND Medium" is shown the far larger
   * result for Stamina alone.
   *
   * So editing is free and searching is deliberate. Seeded from the persisted
   * list, so returning to this screen shows the results it last had rather than
   * an empty page with a button on it.
   */
  const [applied, setApplied] = useState<readonly SparkCriterion[]>(criteria);
  const [sortBy, setSortBy] = useState<SortBy>('activate');
  /*
   * WHO HAS TO BE IN THE PAIR, by card, side by side.
   *
   * Edited freely and APPLIED by the Search button, like the spark criteria
   * beside them: a pin re-runs the sweep, so it belongs on the same commit as
   * everything else rather than firing on selection.
   */
  const [pins, setPins] = useState<Pins>(NO_PINS);
  const [appliedPins, setAppliedPins] = useState<Pins>(NO_PINS);
  const detail = usePairDetail(
    packages,
    trainee?.charaId ?? null,
    traineeCardId,
    roster.masterHash,
    inspecting,
  );

  const catalogue = useMemo(() => catalogueOf(roster.sparkOptions), [roster]);

  /*
   * WHO CAN BE PINNED WHERE, read off the roster rather than off the game.
   *
   * Offering every character in master.mdb would let a reader pin somebody they
   * do not own and get a confident empty list. These are the characters that
   * actually sit in each slot kind: a veteran's SELF becomes a direct parent,
   * and a veteran's own two parents become the grandparents.
   *
   * Deduplicated by character, because that is what the pin matches: three
   * Oguri Caps are one entry, and the ranking decides which of them wins.
   */
  const pinOptions = useMemo(() => {
    /*
     * CARDS. A costume is not a skin: cards of one character carry different
     * unique skills, so a direct parent's costume decides which green the
     * trainee opens the career with, and Haru Urara's two cards differ on Mile
     * as well. An earlier cut listed characters and lost that distinction.
     *
     * Deduplicated by card, not by character -- five veterans of one costume
     * are one row and the ranking decides between them.
     */
    const collect = (members: Iterable<ResolvedMember | null>) => {
      const byCard = new Map<number, PinOption>();
      for (const member of members) {
        if (member?.charaId == null || byCard.has(member.cardId)) continue;
        byCard.set(member.cardId, {
          cardId: member.cardId,
          name: member.name,
          costume: member.costume,
        });
      }
      return [...byCard.values()].sort(
        (x, y) =>
          x.name.localeCompare(y.name) || (x.costume ?? '').localeCompare(y.costume ?? ''),
      );
    };
    return {
      parent: collect(roster.veterans.map((v) => v.self)),
      grandparent: collect(roster.veterans.flatMap((v) => v.parents)),
    };
  }, [roster]);

  /*
   * THE SWEEP RUNS IN A WORKER, and this is the only place that waits on it.
   * Measured on the real roster: 1,179 ms worst case with the main thread still
   * turning over 141 animation frames, longest gap 9.4 ms. On this thread the
   * same work is a 1.2-second freeze.
   */
  const status = usePairSearch(
    roster,
    packages,
    trainee?.charaId ?? null,
    traineeCardId,
    applied,
    appliedPins,
  );

  /*
   * Rows are built for the PAGE, counts come from the whole sweep.
   *
   * All 30,808 pairs are scored and ranked before anything renders; only the
   * list is paged. Building a row object for every one of them to show eighty
   * would be 30,000 allocations nobody reads, and the counts beside the list
   * would be identical either way.
   */
  /*
   * The sort offers `inherit` only when a criterion can produce one.
   *
   * Every inherit figure comes from a white SKILL, so a filter of blues and
   * races would give a control that sorts on a column of nulls -- a control
   * that lies about having done something. Tied to the APPLIED criteria rather
   * than the edited ones, so it appears alongside the results it describes.
   * The fallback matters as much as the gate: a reader who sorts by
   * inheritance and then filters it away must not be left with a list claiming
   * an order it no longer has.
   */
  /*
   * THE CRITERIA THE VISIBLE RESULTS WERE SWEPT FOR, which is not always the
   * ones the filter currently holds. `applied` changes the instant Search is
   * clicked; the sweep that answers it lands later. Rendering the old sweep
   * against the new criteria produced one frame of mismatched rows -- star
   * totals for the new filter beside odds for the old one, and an em dash
   * wherever the new list was longer -- before the running state replaced
   * them. Reading both from the same status makes that frame impossible.
   */
  const searched = status.kind === 'done' ? status.criteria : applied;

  const canSortByInherit = searched.some(
    (c) => catalogue.get(c.groupId)?.kind === 'white_skill',
  );
  const activeSort: SortBy = canSortByInherit ? sortBy : 'activate';

  const view = useMemo(
    () =>
      status.kind === 'done'
        ? viewOf(status.sweep, roster.veterans, status.criteria, shown, activeSort)
        : null,
    [status, roster, shown, activeSort],
  );


  const headline = HEADLINE[Math.min(searched.length, 2) as 0 | 1 | 2];

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
        {nav}
      </header>

      <TraineePicker trainees={trainees} chosen={traineeCardId} onChoose={onTrainee} />

      {/*
        BEFORE A TRAINEE THERE IS NO SEARCH, and the screen says so in one line
        rather than showing an empty or disabled list.

        The roster screen makes its list simply ABSENT under an unused picker
        and lets the empty space speak. Here the precondition is harder to see:
        on the roster screen the trainee decides which veterans are legal, which
        a reader can work out; here it decides every NUMBER in the ranking,
        because the odds run through Individual Affinity and that is computed
        against the trainee. An absent list would read as "loading".
      */}
      {trainee === null ? (
        <p className={styles.precondition}>
          Choose who you are training first. Every figure this search ranks by is relative to
          them.
        </p>
      ) : (
        <>
          {/*
            The same control the roster list uses, told it is asking about a
            PAIR. That changes the ceilings it offers -- 6 on the parents and 18
            across the lineage, against a package's 3 and 9 -- so half the
            requirements this search exists for stop being inexpressible.

            It states its result in VETERANS ("31 of 259") because that is what
            it can honestly say about a roster; the pair count is the number the
            search is really about and is stated beside the list, where there is
            room for it.
          */}
          <SparkFilter
            options={roster.sparkOptions}
            criteria={criteria}
            subject="pair"
            matching={view?.candidates ?? roster.veterans.length}
            total={roster.veterans.length}
            onChange={onCriteria}
          />

          {/*
            SEARCHING IS A DELIBERATE ACT, and this is where it is asked for --
            attached to the requirements it will run, rather than floating over
            the results it will replace.

            One label, one appearance, and nothing explaining itself beside it.
            It stays clickable when nothing has changed, because a reader who
            wants the same search again should get it rather than a dead control
            they have to work out.
          */}
          {/*
            WHO, BEFORE WHAT. A pin says which pairs exist; the spark filter
            says which of those are good. Reading them in that order matches
            the order the sweep applies them, and keeps the two ideas apart --
            the reason the pin exists at all is that they had been collapsed
            into one control and the odds paid for it.
          */}
          <div className={styles.pins}>
            <span className={styles.pinsLabel}>MUST INCLUDE</span>
            {/*
              TWO SIDES, EACH A SMALL FAMILY TREE: a parent, and the two umas
              that parent was bred from.

              It used to be one parent list and one grandparent list, each
              meaning "any of these, anywhere", and readers hit the wall twice.
              Maruzensky and Mihono Bourbon in the parent list came back as
              "either of them beside anyone", and a grandparent could not be put
              under a particular parent. A side answers both by being filled in.

              The sides are interchangeable -- the game does not label its two
              parent slots -- so a result may show either side as half A.
              Anything left empty is "anyone", so filling only one side's parent
              is the old single pin.
            */}
            <div className={styles.pinSides}>
              {pins.map((side, i) => (
                <PinSideFields
                  key={i}
                  side={side}
                  which={i === 0 ? 'first' : 'second'}
                  options={pinOptions}
                  onChange={(next) =>
                    setPins((p) => (i === 0 ? [next, p[1]] : [p[0], next]))
                  }
                />
              ))}
            </div>
          </div>

          <div className={styles.searchRow}>
            <button
              type="button"
              className={styles.searchNow}
              // Paging needs no reset here: `onCriteria` already returns the
              // list to its first page on every edit, so it is there by the
              // time this is reachable.
              onClick={() => {
                setApplied(criteria);
                setAppliedPins(pins);
              }}
            >
              Search
            </button>
          </div>

          {status.kind === 'failed' ? (
            <p className={styles.empty}>{status.message}</p>
          ) : status.kind !== 'done' || view === null ? (
            <SearchProgress status={status} />
          ) : (
            <>
              <div className={styles.listHead}>
                <h2 className={styles.rubric}>Pairs for {trainee.name}</h2>
                <span className={styles.count}>
                  {searched.length === 0
                    ? `${view.legalPairs.toLocaleString()} legal pairs`
                    : `${view.matchingPairs.toLocaleString()} of ${view.legalPairs.toLocaleString()} pairs`}
                </span>
                {/*
                  TWO QUESTIONS, SO TWO ORDERS.

                  The end-of-career roll is not scaled by affinity, so the pair
                  that fires a spark most reliably is not always the one that
                  passes it on most often. Which of those a reader is
                  optimising for is theirs to say, and the alternative -- a key
                  that switches itself when the filter changes shape -- would
                  reorder the list without being asked.

                  Absent when no applied criterion is a white skill, because
                  nothing else has an inherit figure to rank on.
                */}
                {canSortByInherit && (
                  <div
                    className={styles.sort}
                    role="group"
                    aria-label="What the list is ordered by"
                  >
                    {(['activate', 'inherit'] as SortBy[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={
                          option === activeSort ? `${styles.sortOn}` : styles.sortOption
                        }
                        aria-pressed={option === activeSort}
                        onClick={() => setSortBy(option)}
                      >
                        {option === 'activate' ? 'by activation' : 'by inheritance'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className={styles.headlineRubric}>{headline.rubric(searched.length)}</p>

              {/* Column rubrics, on the page ground. A header ROW inside the
                  list would make the first card look like a different kind of
                  card. */}
              <div className={styles.columns} aria-hidden="true">
                <span />
                <span>Half A</span>
                <span />
                <span>Half B</span>
                <span className={styles.columnRight}>Pair total</span>
              </div>

              {view.matchingPairs === 0 ? (
                <p className={styles.empty}>
                  No legal pair of your veterans meets all {searched.length} requirements. Relax
                  one and search again — on the builder&rsquo;s roster, &ldquo;Stamina ≥ 12 AND
                  Medium ≥ 4&rdquo; is met by 22 of 30,808 legal pairs, so this is the ordinary
                  path rather than an error.
                </p>
              ) : (
                <>
                  <ol className={styles.list}>
                    {view.rows.map((row, at) => (
                      <li key={`${row.a.index}-${row.b.index}`}>
                        <PairRow
                          row={row}
                          at={at + 1}
                          criteria={searched}
                          catalogue={catalogue}
                          onPick={setInspecting}
                          compare={statusKey(compareStatus(row.a.index, row.b.index))}
                          onCompareAdd={onCompareAdd}
                          onCompareOpen={onCompareOpen}
                        />
                      </li>
                    ))}
                  </ol>
                  {view.rows.length < view.matchingPairs && (
                    <button type="button" className={styles.more} onClick={onShowMore}>
                      Show {Math.min(PAGE, view.matchingPairs - view.rows.length)} more of{' '}
                      {(view.matchingPairs - view.rows.length).toLocaleString()}
                    </button>
                  )}
                  {inspecting !== null && (
                    <PairDetail
                      state={detail}
                      row={inspecting}
                      criteria={searched}
                      sparkOptions={roster.sparkOptions}
                      view={oddsView}
                      onView={onOddsView}
                      compare={
                        <CompareToggle
                          status={compareStatus(inspecting.a.index, inspecting.b.index)}
                          onAdd={() => onCompareAdd(inspecting.a.index, inspecting.b.index)}
                          onOpen={() => onCompareOpen(inspecting.a.index, inspecting.b.index)}
                        />
                      }
                      onClose={() => setInspecting(null)}
                      onChoose={() => {
                        // The detail already explained this pair locally, so
                        // hand the lineage over rather than make the breakdown
                        // recompute it -- and rather than let it arrive with
                        // nothing to draw, which the tree guard bounces.
                        onPick(
                          inspecting.a.index,
                          inspecting.b.index,
                          detail.kind === 'ok' ? detail.lineage : null,
                        );
                        setInspecting(null);
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

/**
 * WHAT A 1.2-SECOND WAIT LOOKS LIKE.
 *
 * The figure is real and it moves: the worker reports every 512 legal pairs,
 * about 60 times across a full sweep. A spinner would be honest about waiting
 * and say nothing about progress, and this wait is long enough for the
 * difference to matter -- it is also the only place in this product where the
 * user waits on a computation rather than on a network.
 *
 * It states PAIRS CONSIDERED, not pairs found. How many will match is unknown
 * until the sweep ends, so a "found so far" figure would climb and then stop
 * for reasons the reader cannot see.
 */
function SearchProgress({ status }: { status: SearchStatus }) {
  if (status.kind !== 'running') return <p className={styles.precondition}>Ready to search.</p>;
  const { progress } = status;
  return (
    <p className={styles.precondition}>
      {progress === null
        ? 'Searching every legal pair of your roster…'
        : `Searching… ${progress.considered.toLocaleString()} of ${progress.total.toLocaleString()} pairs considered.`}
    </p>
  );
}


/**
 * How many rows a page adds.
 *
 * 80 rather than everything: at ~110px a row, 30,808 of them is a 3.4km
 * document and the browser's own scroll thumb stops being a usable control long
 * before that. The SWEEP is complete either way -- every pair is scored and
 * ranked before a row renders -- so this paces the DOM, not the search, and
 * "show 80 more" costs a slice rather than a re-sweep.
 */
/**
 * The cards shortlisted for each seat, by side. Empty is "anyone".
 *
 * A list rather than one card: shortlisting three umas for a seat is one
 * question, and its answer is a ranking across all three. Mutable copies of
 * core's `PinnedSide`, because this is the state the pickers edit.
 */
interface SidePins {
  parent: number[];
  grandparents: [number[], number[]];
}
type Pins = [SidePins, SidePins];

const NO_SIDE: SidePins = { parent: [], grandparents: [[], []] };
const NO_PINS: Pins = [NO_SIDE, NO_SIDE];

/**
 * One side of the pair: "parent [ ]", then "grandparents [ ] and [ ]" --
 * the two umas that parent was bred from.
 *
 * The words sit BESIDE the pickers as spans, never wrapping them in a
 * `<label>`. A label forwards any click inside it to its first labelable
 * descendant, and a `<button>` is labelable -- so every click on an option in
 * the popup was ALSO a click on the trigger, which toggled the list shut and
 * made picking a second uma impossible. `AncestorPin` names itself with an
 * `aria-label` instead.
 */
function PinSideFields({
  side,
  which,
  options,
  onChange,
}: {
  side: SidePins;
  which: 'first' | 'second';
  options: { parent: readonly PinOption[]; grandparent: readonly PinOption[] };
  onChange: (side: SidePins) => void;
}) {
  const [first, second] = side.grandparents;
  return (
    <div className={styles.pinSide}>
      <span className={styles.pinSlot}>parent</span>
      <span className={styles.pinField}>
        <AncestorPin
          label={`Parent on the ${which} side`}
          options={options.parent}
          chosen={side.parent}
          onChoose={(parent) => onChange({ ...side, parent })}
        />
      </span>
      <span className={`${styles.pinSlot} ${styles.pinGrandparents}`}>grandparents</span>
      <span className={styles.pinField}>
        <AncestorPin
          label={`One grandparent on the ${which} side`}
          options={options.grandparent}
          chosen={first}
          onChoose={(cards) => onChange({ ...side, grandparents: [cards, second] })}
        />
      </span>
      <span className={`${styles.pinSlot} ${styles.pinAnd}`}>and</span>
      <span className={styles.pinField}>
        <AncestorPin
          label={`The other grandparent on the ${which} side`}
          options={options.grandparent}
          chosen={second}
          onChoose={(cards) => onChange({ ...side, grandparents: [first, cards] })}
        />
      </span>
    </div>
  );
}

export const PAGE = 80;

/**
 * What the right-hand figure IS, which changes with how many sparks were asked
 * for -- and the screen has to say which, because all three are percentages
 * except the one that is not.
 */
type Headline = { rubric: (n: number) => string };

const HEADLINE: Readonly<Record<0 | 1 | 2, Headline>> = {
  // No requirements: there are no odds to rank by at all, so the list falls
  // back to affinity. Said out loud, because the real search never ranks this
  // way and a silent fallback would teach the wrong thing about the feature.
  0: {
    rubric: () =>
      'No sparks requested, so there is nothing to rank by — these are ordered by pair total, which is NOT what the search does.',
  },
  1: {
    rubric: () =>
      'Chance that spark ACTIVATES at least once across a career, with the chance the trainee inherits it in brackets.',
  },
  2: {
    rubric: (n) =>
      `Chance that all ${n} ACTIVATE at least once across a career, with each spark's own figure beside it and the chance the trainee inherits it in brackets.`,
  },
};

/**
 * One ranked pair.
 *
 * THE IDENTIFICATION PROBLEM, TWICE. Each half carries the four things that
 * separate veterans on the roster screen, at the sizes a half-width column can
 * hold: the portrait of the exact costume at 32px, the name with its costume
 * tag, the package line (`out of A × B`, the 166-distinct unit), and ONE spark
 * -- the green.
 *
 * WHY THE GREEN AND NOT THE BLUE OR THE PINK. A card is a costume and a costume
 * carries its own unique skill, which IS the green spark, so the green is the
 * only one of the three that varies between two entries of the same character
 * in the same way the portrait does. Oguri Cap 100601 is Triumphant Pulse and
 * 100602 is Festive Miracle. Blue and pink would spend the same line saying
 * "Speed 3★" under half the rows.
 *
 * WHAT DOES NOT FIT, and this is the finding: the roster card names EVERY white
 * spark, because "+7 whites" answers how many and not whether the one you want
 * is in there. A veteran carries 12-19 of them. Two halves, eighty rows, half
 * the width each -- there is no version of that which fits. What replaces it is
 * the band below: the sparks the user ASKED FOR, and which half supplies them.
 * A search knows what is wanted; a roster list does not.
 *
 * Memoised for the same reason the roster card is: 80 of these render at once
 * and each derives its own green spark.
 */
const PairRow = memo(function PairRow({
  row,
  at,
  criteria,
  catalogue,
  onPick,
  compare,
  onCompareAdd,
  onCompareOpen,
}: {
  row: PairRowData;
  at: number;
  criteria: readonly SparkCriterion[];
  catalogue: Catalogue;
  /** Opens the detail. Inspecting a pair is not choosing it. */
  onPick: (row: PairRowData) => void;
  /** `statusKey` of where this pair stands in the compare tray: a string, so memo holds. */
  compare: string;
  onCompareAdd: (a: number, b: number) => void;
  onCompareOpen: (a: number, b: number) => void;
}) {
  // Built per row rather than per list, because PairRow is memoised on its
  // props and a Set rebuilt in the parent would defeat that for all 80 rows.
  const asked = new Set(criteria.map((c) => c.groupId));

  /*
   * THE ROW SHOWS ONLY WHAT THE READER LEFT IN.
   *
   * A criterion marked "exclude spark activation" still FILTERS -- it is still
   * why this pair is on the screen -- but on the row itself it is gone: no
   * chip, out of the product, and out of the product's denominator. All three
   * follow from one mask, which is the point: "5 of 6 activate" above six
   * chips would be the same lie the label was added to prevent, and the way to
   * be sure the label and the chips agree is to derive them from the same
   * predicate rather than to keep two in step.
   *
   * Positional: `perSpark` is index-aligned with `criteria`, so the mask has to
   * be applied by index rather than by filtering values.
   */
  const countedCriteria = criteria.filter(countsTowardOdds);
  const counted = <T,>(values: readonly T[]): T[] =>
    values.filter((_, i) => {
      const c = criteria[i];
      return c !== undefined && countsTowardOdds(c);
    });

  /*
   * THE WHOLE ROW OPENS THE PAIR, because the whole row is the thing you pick
   * -- and now it holds a control of its own, which a `role="button"` row
   * could not: a control nested in a button is invalid, unreachable by a
   * screen reader, and its click would open the pair as well.
   *
   * THE REDUNDANT-CLICK PATTERN (eng re-review, Codex #10). The keyboard and
   * screen-reader target is a real button, on the ordinal, named for the pair.
   * The ROW keeps a click for the mouse, so a click anywhere still opens it,
   * and ignores two clicks that are not that: one that ends a text selection,
   * and one that came from a nested control. A stretched invisible button was
   * considered and dropped: it would cover the chips, whose hover explanations
   * are the only place their arithmetic is written down.
   */
  const choose = (): void => onPick(row);

  return (
    <article
      className={styles.row}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input, label')) return;
        if ((window.getSelection?.()?.toString() ?? '') !== '') return;
        choose();
      }}
    >
      <button
        type="button"
        className={styles.open}
        aria-label={`Pick ${row.a.self.name} and ${row.b.self.name} as the parents`}
        onClick={choose}
      >
        {at}
      </button>

      <Half veteran={row.a} slot="A" catalogue={catalogue} asked={asked} />
      <span className={styles.times} aria-hidden="true">
        <span className={styles.timesGlyph}>×</span>
      </span>
      <Half veteran={row.b} slot="B" catalogue={catalogue} asked={asked} />

      {/*
        THE PAIR TOTAL, ALWAYS. The joint used to live here and changed meaning
        three times -- pair total with no filter, one spark's odds with one
        filter, the joint with more -- which is a column that cannot be read
        without first checking the filter. It moved to the end of the band, next
        to the sparks it is computed from, where it is also long enough to need
        the room. What stays is the one fact that means the same thing however
        the filter is set.
      */}
      <div className={styles.result}>
        <span className={styles.headline}>{row.pairTotal}</span>
        <span className={styles.addends}>
          {rankGlyph(row.relationRank)} rank {row.relationRank}
        </span>
        <span className={styles.compare}>
          <CompareToggle
            status={statusOf(compare)}
            onAdd={() => onCompareAdd(row.a.index, row.b.index)}
            onOpen={() => onCompareOpen(row.a.index, row.b.index)}
          />
        </span>
      </div>

      {/*
        THE BAND: every requirement, what the pair carries of it, and the odds.
        The odds are the only figure here that belongs to the PAIR rather than
        to either half, which is the whole reason the band survives now that
        each half lists its own sparks.

        THE `A5+B7` SPLIT IS GONE. It was the one thing a ranked list could not
        leave out -- a pair holding 6 Stamina as 6+0 is a different proposition
        from one holding it as 3+3 -- but it is now said better by the halves
        themselves: the spark appears in each half's list with that half's star
        count. The builder could not read the notation, which settles it: a
        notation that needs a legend is a puzzle.
      */}
      {countedCriteria.length > 0 && (
        <div className={styles.wants}>
          {/*
            THE TWO JOINTS, PINNED TOP RIGHT, WITH THE SPARKS FLOWING ROUND THEM.

            FIRST IN SOURCE ORDER because `.jointsEnd` is a right FLOAT, and a
            float only pushes the line boxes that come after it. Read out of
            order this looks backwards; it is exactly what makes the chips wrap
            around the block instead of being shoved below it.

            They used to sit apart, one mid-band and one hard right, reading as
            two unrelated facts rather than one claim answered two ways. Both
            carry a VERB now: "all 4" alone was the whole confusion, and with
            two figures it has to say which is which.
          */}
          {(row.joint !== null || row.jointInherit !== null) && (
            <span className={styles.jointsEnd}>
              {/* THE LABEL NAMES ITS OWN SCOPE, and has to, because the figure
                  beside it now skips the sparks this pair does not carry. "all
                  6 activate" against a pair holding five of them would be
                  false; "5 of 6 activate" is the same number told truthfully,
                  and the em dashes in the band say which one is missing. */}
              {row.joint !== null && (
                <span className={styles.joint}>
                  <span className={styles.jointLabel}>
                    {scopeLabel(carriedCount(counted(row.perSpark)), countedCriteria.length, 'activate')}
                  </span>
                  <span className={styles.jointValue}>{percentJoint(row.joint)}</span>
                </span>
              )}
              {/* Counted over the SKILL criteria only, because nothing else has
                  an inherit figure for any pair -- so a filter of three skills
                  and a blue says "3 skills", never "4". */}
              {row.jointInherit !== null && (
                <span className={styles.joint}>
                  <span className={styles.jointLabel}>
                    {scopeLabel(
                      carriedCount(counted(row.perSparkInherit)),
                      countedCriteria.filter(
                        (c) => catalogue.get(c.groupId)?.kind === 'white_skill',
                      ).length,
                      'inherited',
                      'skills',
                    )}
                  </span>
                  <span className={styles.jointValue}>{percentJoint(row.jointInherit)}</span>
                </span>
              )}
            </span>
          )}
          {/*
            THE SELECTOR'S ORDER, not the order the rows were added in. The
            spark picker lists blue, pink, green, then whites, and within a kind
            the game's own order -- so a Medium added after three whites belongs
            with the pinks here rather than wherever it was typed. Reported by
            the builder looking at a real filter.

            The ORIGINAL index travels with each criterion, because `row.stars`
            and `row.perSpark` are positional and sorting the display must not
            reorder the data behind it.
          */}
          {criteria
            .map((criterion, c) => ({ criterion, c }))
            /*
             * EXCLUDED MEANS GONE FROM HERE, not merely out of the product.
             *
             * Changed on the builder's call. The first cut kept the chip and
             * printed its percentage, on the reasoning that the reader was
             * "excluding it from a total, not hiding it". That reasoning misread
             * what the tick is FOR. Somebody who wants Oguri Cap at A in End
             * Closer already has it at career start; the activation figure
             * answers a question they have declared they are not asking, and
             * leaving it on the row invites exactly the arithmetic the label
             * was rewritten to prevent -- four chips above a figure computed
             * from three.
             *
             * It stays in the audit log, where the same pink carries the one
             * fact that makes excluding it worth doing: `B->A at start`. The
             * row band has no room for that and shows only the percentage, so
             * here there is nothing left to keep.
             *
             * The ORIGINAL index is captured above and travels through, because
             * `row.stars` and `row.perSpark` are positional and this filter must
             * not shift what each chip reads.
             */
            .filter(({ criterion }) => countsTowardOdds(criterion))
            .sort((x, y) => {
              const kx = catalogue.get(x.criterion.groupId)?.kind;
              const ky = catalogue.get(y.criterion.groupId)?.kind;
              return (
                SPARK_KIND_ORDER.indexOf(kx as SparkKind) -
                  SPARK_KIND_ORDER.indexOf(ky as SparkKind) ||
                x.criterion.groupId - y.criterion.groupId
              );
            })
            .map(({ criterion, c }) => {
            /*
             * THE WHOLE LINEAGE, ALWAYS -- every ancestor of both halves,
             * whatever scope this criterion happens to be written in.
             *
             * The band answers "what does this pair give me". A criterion's
             * scope is how the reader FOUND the pair; it is not a claim about
             * what the pair carries. A cut that printed the scoped figure was
             * correct arithmetic answering the wrong question, and it read as a
             * discrepancy: chips saying 4 and 2 beside a band saying 5, because
             * that criterion counted only the direct parents.
             *
             * So this always equals the two chips above it added together, and
             * a reader can check it by eye. WHO holds the stars is the chips'
             * job, via their parent-share marks.
             */
            return (
              <span key={criterion.groupId} className={styles.want}>
                <span
                  className={styles.tick}
                  style={tickStyle(catalogue.get(criterion.groupId)?.kind)}
                />
                <span className={styles.wantName}>
                  {catalogue.get(criterion.groupId)?.name ?? `spark ${criterion.groupId}`}
                </span>
                <span className={styles.wantStars}>{row.lineageStars[c]}★</span>
                <span className={styles.wantOdds}>{percent(row.perSpark[c] as number)}</span>
                {/* THE SECOND NUMBER IS A DIFFERENT QUESTION, not a second
                    opinion on the first. The left figure is whether the spark
                    FIRES during a run and hands over a skill hint; this one is
                    whether the trainee INHERITS it. Parenthesised
                    rather than arrowed because an arrow reads as a conversion
                    -- as though the first number became the second -- and the
                    relationship is a multiplication by a roll that has nothing
                    to do with affinity.

                    Absent on anything but a white skill. A race spark needs the
                    trainee to win that G1 and a scenario spark needs the
                    scenario cleared, so there is no chain here to finish. */}
                {row.perSparkInherit[c] !== null && (
                  <span className={styles.wantInherit}>
                    ({percent(row.perSparkInherit[c] as number)})
                  </span>
                )}
              </span>
              );
            })}
        </div>
      )}
    </article>
  );
});

/** One spark on one half. No percentage: the odds belong to the PAIR. */
/**
 * TWO MARKS, AND THEY MEAN DIFFERENT THINGS.
 *
 * `asked` says the reader ASKED for this spark: it is one of the criteria, and
 * the mark is the chip's own ground lifting, because it is a statement about
 * the whole chip.
 *
 * `onParent` says how many of these stars sit on the direct parent rather than
 * on a grandparent, and it is a statement about part of the number -- so it is
 * a separate segment inside the chip, not a treatment of the chip.
 *
 * Why it is worth the room. A player reading a result has to go and pick this
 * uma in the game, and what they select is the PARENT; the grandparents come
 * with it. "6 stars of Medium" where the parent holds 2 and "3 stars of Uma
 * Stan" where the parent holds all 3 are different propositions, and the total
 * alone cannot tell them apart. The parent's share is also the likelier half to
 * activate: measured on this roster, parent Individual Affinity has median
 * 138 against a grandparent's 36.
 *
 * ONE TREATMENT, NOT TWO. An earlier cut had a second, lighter style for the
 * case where the parent holds the whole spark, and it made the mark look like
 * it was saying different KINDS of thing on different chips -- especially
 * beside `asked`, whose own lift changed the ground underneath it. A mark
 * whose colour varies is read as a category; this is a quantity, so it gets one
 * appearance and the number carries the difference.
 *
 * Both marks can land on one chip, which is the common case for a filtered
 * spark, so neither may use the other's channel.
 */
function Chip({
  row,
  asked = false,
}: {
  row: { groupId: number; stars: number; onParent?: number; name?: string; kind?: SparkKind };
  asked?: boolean;
}) {
  const kind = row.kind as SparkKind;
  const onParent = row.onParent ?? 0;
  return (
    <span
      className={asked ? `${styles.chip} ${styles.chipAsked}` : styles.chip}
      title={
        onParent === 0
          ? `${row.name} ${row.stars}★, all of it on the grandparents`
          : `${row.name} ${row.stars}★, ${onParent}★ of it on the parent itself`
      }
    >
      <span
        className={styles.tick}
        style={
          isWhite(kind)
            ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[kind]}` }
            : { background: SPARK_COLOR[kind] }
        }
      />
      <span className={styles.chipName}>{row.name}</span>
      <span className={styles.chipStars}>{row.stars}★</span>
      {onParent > 0 && (
        <span className={styles.onParent} aria-hidden="true">
          {onParent}★
        </span>
      )}
    </span>
  );
}

function Half({
  veteran,
  slot,
  catalogue,
  asked,
}: {
  veteran: ResolvedVeteran;
  slot: 'A' | 'B';
  catalogue: Catalogue;
  /** The groupIds the reader filtered for, lit up in place. */
  asked: ReadonlySet<number>;
}) {
  // EVERY SPARK THIS HALF CARRIES, grouped the way the compare pane groups
  // them, with the reader's own filters lit.
  //
  // The earlier cut showed one identity spark per half -- the green, because a
  // costume's unique skill is the only named spark that varies between two
  // entries of the same character. That identified the uma and answered
  // nothing about whether it was worth picking. Asked for by the builder:
  // "i'm more zeroed in on giving the user as much information as needed for
  // them to make the most informed decision".
  //
  // The PACKAGE total, summing the veteran and its two parents, because that is
  // the unit the search filters on. `stars` is [self, slot 10, slot 20].
  //
  // This also retires the `A0+B5` notation the band used to carry, which the
  // builder could not read -- and a notation needing a legend is a puzzle, not
  // notation. Which half holds a spark is now structural: it appears in that
  // half's list and not the other's.
  const all = veteran.sparks
    .map((s) => ({
      groupId: s.groupId,
      stars: s.stars.reduce((sum, n) => sum + (n ?? 0), 0),
      // `stars` is [self, slot 10, slot 20], and in a PAIR this veteran IS the
      // direct parent. So index 0 is the share that sits one generation closer
      // than the rest, which is the share that matters most twice over: it is
      // far likelier to ACTIVATE (parent IA median 138 against a
      // grandparent's 36) and it is the uma the player actually has to select
      // in the game.
      onParent: s.stars[0] ?? 0,
      name: catalogue.get(s.groupId)?.name,
      kind: catalogue.get(s.groupId)?.kind,
    }))
    .filter((s) => s.stars > 0 && s.name !== undefined && s.kind !== undefined);

  // ORDER IS THE SAME WHETHER OR NOT ANYTHING IS FILTERED, and the filter only
  // changes how a chip LOOKS.
  //
  // An earlier cut pulled the asked sparks to a line of their own at the top,
  // because with ~71 chips in a row the lit ones landed on lines 6 and 9 of a
  // 10-line block. The builder rejected it on sight: a spark's place in the
  // list is itself information -- which kind it belongs to, how its stars
  // compare to its neighbours' -- and moving it to answer one question destroys
  // that while making the row rearrange itself every time a filter changes.
  //
  // Same rule as the compare pane and the audit trail, both of which highlight
  // in place and reorder nothing.
  const ordered = SPARK_KIND_ORDER.flatMap((kind) =>
    all
      .filter((s) => s.kind === kind)
      // Loudest first inside a kind: a scan meets the big numbers before the
      // 1-star noise.
      .sort((a, b) => b.stars - a.stars || (a.name as string).localeCompare(b.name as string)),
  );

  return (
    <div className={styles.half}>
      <span className={styles.slot} aria-hidden="true">
        {slot}
      </span>
      <Lineage veteran={veteran} />
      <span className={styles.identity}>
        <span className={styles.name}>
          {veteran.self.name}
          {veteran.self.costume && (
            <span className={styles.costume}> {veteran.self.costume}</span>
          )}
        </span>
        <span className={styles.sparks}>
          {ordered.map((row) => (
            <Chip key={row.groupId} row={row} asked={asked.has(row.groupId)} />
          ))}
        </span>
      </span>
      {/* Score, and the rank it bands into, as the game's OWN BADGE.
          An earlier cut used `rankLabel` text, reasoning that eighty rows want
          160 badges and the badge is taller than its line. Both halves of that
          are true and neither is a reason for text: `RankBadge` takes a size,
          so 20px fits the line, and the atlas is ONE image cropped in CSS, so
          160 of them cost no extra request. It also falls back to the text
          label by itself when the optional art cache is cold, which is the
          behaviour the roster card already relies on. */}
      <span className={styles.score}>
        <RankBadge score={veteran.score} size={20} />
        <span className={styles.scoreValue}>{veteran.score.toLocaleString()}</span>
      </span>
    </div>
  );
}

/**
 * THE PACKAGE, AS FACES.
 *
 * DESIGN.md's reason for leading the veteran card on portrait rather than name
 * is that names cannot identify these rows: 255 of 259 veterans share a
 * character name with another and only 29 distinct names exist, while "the
 * veteran plus its own two parents is 166-distinct and is the real unit of
 * choice". The row used to state that unit as text -- `out of Mejiro Dober
 * [Off the Line] x Narita Brian` -- which is the right unit in the wrong
 * medium: it clipped with an ellipsis at this column width, it cost a line of
 * height in eighty rows, and it made the reader parse two names and two
 * costume tags to answer a question a face answers at a glance.
 *
 * So the package is drawn the way uma.moe draws it and the way this product
 * already draws a lineage on the tree screen: the veteran, a connector, and
 * its two parents beneath. The names are not lost, they move to the tooltip.
 *
 * NO PER-ANCESTOR NUMBERS, unlike uma.moe, which prints an affinity under each
 * face. Those are real numbers there and would be invented ones here, and this
 * screen already carries a banner about how much of it is invented.
 */
function Lineage({ veteran }: { veteran: ResolvedVeteran }) {
  return (
    <span className={styles.lineage} title={`out of ${packageLine(veteran)}`}>
      <span className={styles.lineageSelf}>
        <Portrait cardId={veteran.self.cardId} name={veteran.self.name} />
      </span>
      <span className={styles.trunk} aria-hidden="true" />
      <span className={styles.fork} aria-hidden="true" />
      <span className={styles.parents}>
        {veteran.parents.map((parent, i) => (
          <span
            // Position, not identity: an empty slot has no id and two parents
            // can be the same CHARACTER at this depth (only the pair's two
            // halves are barred from that), so the slot index is the only
            // stable key here.
            key={i}
            className={styles.parentDisc}
            title={memberName(parent)}
          >
            {/* An empty slot keeps its disc rather than collapsing: a veteran
                out of one parent is a different thing from one whose second
                face failed to load, and the fork above would otherwise point
                at nothing. `Portrait` already draws the no-image state. */}
            <Portrait cardId={parent?.cardId ?? null} name={memberName(parent)} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Whites share one hue, so their tick is outlined rather than filled. */
function tickStyle(kind: SparkKind | undefined): React.CSSProperties {
  // A spark the catalogue has no row for gets the plain rule colour rather
  // than a guessed hue: a tick is a category claim, and this one has no
  // category to claim.
  if (kind === undefined) return { background: 'var(--rule-strong)' };
  return isWhite(kind)
    ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[kind]}` }
    : { background: SPARK_COLOR[kind] };
}

/**
 * "out of Mejiro Dober × Inari One". Lifted from the roster card, including the
 * rule that an empty slot says so rather than being skipped: a veteran out of
 * one parent is a different thing from one whose second parent failed to
 * render, and here it is also a distinguishing fact worth seeing.
 */
function packageLine(veteran: ResolvedVeteran): string {
  return `${memberName(veteran.parents[0])} × ${memberName(veteran.parents[1])}`;
}

function memberName(member: ResolvedMember | null): string {
  return member === null ? 'no parent' : member.name + (member.costume ? ` ${member.costume}` : '');
}

/** A `CompareStatus` as a string and back, so the memoised row compares it by value. */
const statusKey = (status: CompareStatus): string =>
  status.kind === 'in' ? `in:${status.letter}` : status.kind;
const statusOf = (key: string): CompareStatus =>
  key.startsWith('in:') ? { kind: 'in', letter: key.slice(3) } : key === 'full' ? { kind: 'full' } : { kind: 'add' };
