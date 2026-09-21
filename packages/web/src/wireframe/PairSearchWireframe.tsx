import { memo, useMemo, useState } from 'react';
import type {
  ResolvedMember,
  ResolvedVeteran,
  RosterResolveResponse,
  SparkCriterion,
  SparkKind,
  TraineeOption,
} from '@umalegacies/types';
import { Portrait } from '../lineage/Portrait';
import { rankGlyph } from '../lineage/pair-total';
import { SPARK_COLOR, isWhite, percent } from '../lineage/sparks';
import { catalogueOf, type Catalogue } from '../roster/catalogue';
import { rankLabel } from '../roster/rank-labels';
import { SparkFilter } from '../roster/SparkFilter';
import { TraineePicker } from '../roster/TraineePicker';
import { fakePairSearch, type FakePairRow } from './fake-scores';
import styles from './PairSearchWireframe.module.css';

/**
 * ============================================================================
 * WIREFRAME, FOR DESIGN REVIEW ONLY. NOT THE M7 RESULTS SCREEN.
 * Reached at `#wireframe/pair-search`; nothing in the app links to it outside
 * development. Every odds figure, pair total and rank glyph below is invented
 * (see fake-scores.ts). Delete this directory when M7's real results UI lands.
 * ============================================================================
 *
 * WHAT IT IS FOR. One question, and it is not "is this pretty": can a reader
 * tell WHICH two umas a ranked row names? The roster list already had to solve
 * this once -- 255 of the builder's 259 veterans share a character name with
 * another, there are 29 distinct names across 259 rows and one character
 * appears 54 times -- and it solved it with a card that leads on the portrait
 * of the exact costume, the score, the sparks and the veteran's own two
 * parents, which is a 166-distinct package. A ranked PAIR row has to do that
 * TWICE in roughly half the width each, fifty rows deep, and the two halves are
 * always different characters (`isLegalPair` excludes a same-character pair),
 * so the problem is "which Oguri Cap is this" twice per row rather than two
 * identical umas in one row.
 *
 * WHAT IS REAL: the veterans, their costumes, their parents, their sparks, the
 * star counts, and which pairs the game allows. WHAT IS FAKE: every
 * probability, every pair total, every rank glyph.
 *
 * THE ROW IS THE CARD, and the two halves inside it are not. DESIGN.md allows a
 * card only for "a discrete entity you can point at", and in a search the thing
 * you point at is the PAIR -- picking half a result is not a move. Nesting two
 * veteran cards inside a result card would invent a second meaning for the
 * border and a nesting level the product does not have anywhere else.
 */
export function PairSearchWireframe({
  roster,
  trainees,
  onBack,
}: {
  roster: RosterResolveResponse;
  trainees: readonly TraineeOption[];
  onBack: () => void;
}) {
  /*
   * ITS OWN TRAINEE AND ITS OWN CRITERIA, not the app's.
   *
   * The real screen would share them. This one must not: App persists the
   * trainee, the filters and the pair to IndexedDB on every change, and a
   * throwaway surface that rewrites the user's saved selection while they poke
   * at it is a wireframe with side effects.
   */
  const [traineeCardId, setTraineeCardId] = useState<number | null>(null);
  const [criteria, setCriteria] = useState<SparkCriterion[]>([]);
  /** How many rows are rendered. The sweep is complete; the LIST is paged. */
  const [shown, setShown] = useState(FIRST_PAGE);

  const trainee = useMemo(
    () => trainees.find((t) => t.cardId === traineeCardId) ?? null,
    [trainees, traineeCardId],
  );

  const catalogue = useMemo(() => catalogueOf(roster.sparkOptions), [roster]);

  // 33,411 pairs on the builder's roster. Memoised on the three things that
  // change it, because it runs synchronously on the render thread -- which the
  // real search deliberately does not do: M7 puts the sweep in a web worker,
  // measured at 1.5s unthrottled and 13.4s at 8x CPU throttle. Here there is no
  // engine behind it, so the loop is arithmetic and lands in single-digit ms.
  const search = useMemo(
    () => fakePairSearch(roster.veterans, trainee?.charaId ?? null, criteria),
    [roster, trainee, criteria],
  );

  const headline = HEADLINE[Math.min(criteria.length, 2) as 0 | 1 | 2];

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
        <button type="button" className={styles.back} onClick={onBack}>
          Back to the roster
        </button>
      </header>

      {/*
        SAYS WHAT IT IS, AT THE TOP, IN CHROME COLOUR.
        `--warning` rather than `--bonus`, though they are the same hex: amber
        means "added" inside the data surface and this is a banner about the
        page, which DESIGN.md allows semantic colour for. It is a ruled region
        rather than a card, because it is not an entity you point at.
      */}
      <p className={styles.banner}>
        <strong className={styles.bannerLead}>WIREFRAME — FOR DESIGN REVIEW</strong>
        Every percentage, pair total and ◎/〇/△ below is <em>invented</em>. The umas, their
        costumes, their parents, their sparks and every star count are your real roster, and
        every pair shown is one the game would allow.
      </p>

      <TraineePicker trainees={trainees} chosen={traineeCardId} onChoose={setTraineeCardId} />

      {/*
        BEFORE A TRAINEE IS CHOSEN THERE IS NO SEARCH, and the screen says so in
        one line rather than showing an empty or disabled list.

        This is the one place this wireframe departs from the roster screen's
        precedent, which makes the list simply ABSENT under an unused picker and
        lets the empty space speak. The reason is that the precondition is
        harder to see here: on the roster screen the trainee decides which
        veterans are legal, which the reader can work out; here it decides every
        NUMBER in the ranking, because the odds run through Individual Affinity
        and that is computed against the trainee. An absent list would read as
        "loading". Which of the two treatments is right is a question FOR the
        review, not a settled matter.
      */}
      {trainee === null ? (
        <p className={styles.precondition}>
          Choose who you are training first. Every figure this search ranks by is relative to
          them.
        </p>
      ) : (
        <>
          {/*
            The list filter, reused unchanged, as the statement of what the user
            wants. TWO THINGS IT CANNOT SAY HERE, both worth the review's time:

            1. It states its result in VETERANS ("31 of 259"), and the result of
               a pair search is a count of PAIRS. It is given the honest veteran
               figure -- how many appear in at least one matching pair -- and the
               pair count is stated below, where there is room for it.
            2. Its star ceilings are a PACKAGE's: 3 on the parent, 9 across the
               lineage. A pair is six umas, so the real ceilings are 6 and 18.
               `maxStarsFor(scope)` becomes `maxStarsFor(scope, subject)` in M7;
               until then this filter cannot express half the requirements the
               search is for.
          */}
          <SparkFilter
            options={roster.sparkOptions}
            criteria={criteria}
            matching={search.candidates}
            total={roster.veterans.length}
            onChange={(next) => {
              setCriteria(next);
              setShown(FIRST_PAGE);
            }}
          />

          <div className={styles.listHead}>
            <h2 className={styles.rubric}>Pairs for {trainee.name}</h2>
            <span className={styles.count}>
              {criteria.length === 0
                ? `${search.legalPairs.toLocaleString()} legal pairs`
                : `${search.matchingPairs.toLocaleString()} of ${search.legalPairs.toLocaleString()} pairs`}
            </span>
          </div>

          <p className={styles.headlineRubric}>{headline.rubric(criteria.length)}</p>

          {/* Column rubrics, on the page ground. A header ROW inside the list
              would make the first card look like a different kind of card. */}
          <div className={styles.columns} aria-hidden="true">
            <span />
            <span>Half A</span>
            <span />
            <span>Half B</span>
            <span className={styles.columnRight}>{headline.label(criteria.length)}</span>
          </div>

          {search.matchingPairs === 0 ? (
            <p className={styles.empty}>
              No legal pair of your veterans meets all {criteria.length} requirements. Relax one
              and search again — on the builder&rsquo;s roster, &ldquo;Stamina ≥ 12 AND Medium ≥
              4&rdquo; is met by 25 of 33,411 pairs, so this is the ordinary path rather than an
              error.
            </p>
          ) : (
            <>
              <ol className={styles.list}>
                {search.rows.slice(0, shown).map((row, at) => (
                  <li key={`${row.a.index}-${row.b.index}`}>
                    <PairRow row={row} at={at + 1} criteria={criteria} catalogue={catalogue} />
                  </li>
                ))}
              </ol>
              {shown < search.matchingPairs && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => setShown((n) => n + FIRST_PAGE)}
                >
                  Show {Math.min(FIRST_PAGE, search.matchingPairs - shown)} more of{' '}
                  {(search.matchingPairs - shown).toLocaleString()}
                </button>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Enough rows to judge scrolling and repetition, and no more.
 *
 * 80 rather than everything: at ~110px a row, 33,411 of them is a 3.7km
 * document and the browser's own scroll thumb stops being a usable control long
 * before that. How the real screen pages 33,411 local results is a design
 * question this wireframe raises rather than answers.
 */
const FIRST_PAGE = 80;

/**
 * What the right-hand figure IS, which changes with how many sparks were asked
 * for -- and the screen has to say which, because all three are percentages
 * except the one that is not.
 */
type Headline = { label: (n: number) => string; rubric: (n: number) => string };

const HEADLINE: Readonly<Record<0 | 1 | 2, Headline>> = {
  // No requirements: there are no odds to rank by at all, so the list falls
  // back to affinity. Said out loud, because the real search never ranks this
  // way and a silent fallback would teach the wrong thing about the feature.
  0: {
    label: () => 'Pair total',
    rubric: () =>
      'No sparks requested, so there is nothing to rank by — these are ordered by pair total, which is NOT what the search does.',
  },
  1: {
    label: () => 'Chance',
    rubric: () => 'Invented chance of inheriting that spark at least once across a career.',
  },
  2: {
    label: (n) => `All ${n} together`,
    rubric: (n) =>
      `Invented chance that all ${n} arrive at least once across a career, with the per-spark figures beneath each row.`,
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
}: {
  row: FakePairRow;
  at: number;
  criteria: readonly SparkCriterion[];
  catalogue: Catalogue;
}) {
  return (
    <article className={styles.row}>
      <span className={styles.ordinal}>{at}</span>

      <Half veteran={row.a} slot="A" catalogue={catalogue} />
      <span className={styles.times} aria-hidden="true">
        ×
      </span>
      <Half veteran={row.b} slot="B" catalogue={catalogue} />

      <div className={styles.result}>
        {/* FAKE. The aggregate, with its addends beneath, in the shape
            DESIGN.md fixes for every aggregate in this product. Here the
            addends are the pair total and the rank it bands into, because the
            per-spark addends of the JOINT need a row of their own. */}
        <span className={styles.headline}>
          {criteria.length === 0 ? row.pairTotal : percent(row.joint ?? (row.perSpark[0] as number))}
        </span>
        <span className={styles.addends}>
          {criteria.length === 0
            ? `${rankGlyph(row.relationRank)} rank ${row.relationRank}`
            : `${rankGlyph(row.relationRank)} ${row.pairTotal}`}
        </span>
      </div>

      {/*
        THE BAND: every requirement, what the pair carries of it, and WHICH HALF
        carries it. The split is the part a ranked list cannot leave out -- a
        pair holding 6 Stamina as 6+0 and one holding it as 3+3 are different
        breeding propositions, and the per-spark odds do not say which is which.
        A requirement met entirely by one half also tells the reader that the
        other half is there for something else, which is half the reason to read
        the pair at all.
      */}
      {criteria.length > 0 && (
        <div className={styles.wants}>
          {criteria.map((criterion, c) => {
            const [starsA, starsB] = row.stars[c] as readonly [number, number];
            return (
              <span key={criterion.groupId} className={styles.want}>
                <span
                  className={styles.tick}
                  style={tickStyle(catalogue.get(criterion.groupId)?.kind)}
                />
                <span className={styles.wantName}>
                  {catalogue.get(criterion.groupId)?.name ?? `spark ${criterion.groupId}`}
                </span>
                <span className={styles.wantStars}>{starsA + starsB}★</span>
                {/* Real, and the reason the band exists. */}
                <span className={styles.wantSplit}>
                  A{starsA}+B{starsB}
                </span>
                {/* FAKE. */}
                <span className={styles.wantOdds}>{percent(row.perSpark[c] as number)}</span>
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
});

/** One veteran of the pair, identified without relying on its name. */
function Half({
  veteran,
  slot,
  catalogue,
}: {
  veteran: ResolvedVeteran;
  slot: 'A' | 'B';
  catalogue: Catalogue;
}) {
  // The veteran's OWN green: `stars[0]` non-zero means it carries the spark
  // itself rather than inheriting it from one of its parents. Same rule the
  // roster card reads by, off the same list, so the two cannot disagree.
  const green = veteran.sparks.find(
    (s) => (s.stars[0] ?? 0) > 0 && catalogue.get(s.groupId)?.kind === 'green',
  );

  return (
    <div className={styles.half}>
      <span className={styles.slot} aria-hidden="true">
        {slot}
      </span>
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
        {/* The 166-distinct unit, against the bare name's 29. */}
        <span className={styles.package}>out of {packageLine(veteran)}</span>
        {green && (
          <span className={styles.green}>
            <span className={styles.tick} style={{ background: SPARK_COLOR.green }} />
            <span className={styles.greenName} title={catalogue.get(green.groupId)?.name}>
              {catalogue.get(green.groupId)?.name ?? `spark ${green.groupId}`}
            </span>
            <span className={styles.wantStars}>{green.stars[0]}★</span>
          </span>
        )}
      </span>
      {/* Score, and the rank it bands into, as TEXT. The roster card uses the
          game's own badge art at 36px; eighty rows would need 160 of them and
          the badge is taller than the line it would sit on. The label carries
          the same fact. */}
      <span className={styles.score}>
        <span className={styles.scoreRank}>{rankLabel(veteran.score) ?? '—'}</span>
        <span className={styles.scoreValue}>{veteran.score.toLocaleString()}</span>
      </span>
    </div>
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
  const name = (member: ResolvedMember | null): string =>
    member === null ? 'no parent' : member.name + (member.costume ? ` ${member.costume}` : '');
  return `${name(veteran.parents[0])} × ${name(veteran.parents[1])}`;
}
