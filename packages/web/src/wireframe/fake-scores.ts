import type { ResolvedVeteran, SparkCriterion } from '@umalegacies/types';
import { jointOdds } from '../lineage/joint';
import { pickBlock, starsInScope } from '../roster/filter';

/**
 * ============================================================================
 * THROWAWAY. EVERY PROBABILITY AND EVERY AFFINITY NUMBER IN THIS FILE IS MADE
 * UP. Nothing here computes anything, calls the engine or is meant to survive
 * M7. It exists so a ranked PAIR list can be judged on real rows before the
 * real results UI is designed; delete it with the wireframe.
 * ============================================================================
 *
 * What IS real, and deliberately so: the veterans, their costumes, their two
 * parents, which sparks each package carries and how many stars of each, and
 * which pairs are legal. DESIGN.md: "render any screen that shows derived data
 * from the derivation itself, INCLUDING THROWAWAY PREVIEWS" -- a wireframe on
 * hand-typed umas would answer a question about a roster nobody owns, and the
 * measured fact this wireframe exists to expose (255 of 259 veterans share a
 * character name, 29 distinct names in total, one character 54 times) only
 * shows up on the real thing.
 *
 * So the split is: identity and star counts are read off the roster, the
 * probabilities and the pair total are invented, and the code says which is
 * which at every point.
 */

export interface FakePairRow {
  a: ResolvedVeteran;
  b: ResolvedVeteran;
  /** REAL. Stars each half contributes to each criterion, in criteria order. */
  stars: Array<readonly [number, number]>;
  /** FAKE. One invented chance per criterion, in criteria order. */
  perSpark: number[];
  /**
   * FAKE, but composed by the REAL `jointOdds`, so the aggregate and the
   * addends printed under it cannot disagree in the way the real screen must
   * not. Null below two requirements, where the joint IS the single figure.
   */
  joint: number | null;
  /** FAKE. The pair total a relation rank is banded from. */
  pairTotal: number;
  /** FAKE. 3/2/1, which `rankGlyph` renders as ◎/〇/△. */
  relationRank: number;
  /** What the list is sorted on. See `orderOf`. */
  order: number;
}

export interface FakePairSearch {
  rows: FakePairRow[];
  /** How many pairs of these veterans the game would allow at all. */
  legalPairs: number;
  /** How many of those satisfy every stated requirement. */
  matchingPairs: number;
  /**
   * How many veterans turn up in at least one matching pair.
   *
   * The count a pair search can honestly hand to the filter region, which
   * states its result in VETERANS ("31 of 259"). "25 of 33,411 pairs" is the
   * number the search is really about and the region has nowhere to put it.
   */
  candidates: number;
}

/**
 * Every legal pair, filtered by the stated requirements, ranked by an invented
 * score.
 *
 * LEGALITY IS THE REAL RULE, via `pickBlock` -- the same predicate a click in
 * the roster list goes through, so this wireframe cannot show a pair the app
 * would refuse to compose. M7 replaces it with `isLegalPair(a, b, trainee)`,
 * which is `pickBlock` minus the `pair-full` branch that can never fire inside
 * a sweep; until that exists, calling the one implementation that does beats
 * writing a second one here.
 *
 * Unordered pairs, so `j` starts past `i`: A×B and B×A are one pair and the two
 * halves are interchangeable. 259 veterans give 33,411 of them.
 */
export function fakePairSearch(
  veterans: readonly ResolvedVeteran[],
  traineeCharaId: number | null,
  criteria: readonly SparkCriterion[],
): FakePairSearch {
  // Stars per veteran per criterion, computed once rather than 33,411 times.
  // `starsInScope` is the list filter's own scope table: `package` reads all
  // three slots of a half, `parent` reads the veteran itself. Across a PAIR
  // that makes the two scopes six ancestors and two ancestors respectively,
  // which is exactly what the design doc specifies for the search.
  const starsFor = veterans.map((veteran) =>
    criteria.map((criterion) => {
      const spark = veteran.sparks.find((s) => s.groupId === criterion.groupId);
      if (!spark) return 0;
      return starsInScope(spark, criterion.scope).reduce((total, n) => total + n, 0);
    }),
  );

  const rows: FakePairRow[] = [];
  const candidates = new Set<number>();
  let legalPairs = 0;
  const NOTHING_PICKED: readonly ResolvedVeteran[] = [];

  for (let i = 0; i < veterans.length; i++) {
    const a = veterans[i] as ResolvedVeteran;
    // The trainee cannot be a parent, so it is out of both halves. Hoisted: it
    // is a fact about A alone and would otherwise be re-decided 258 times.
    if (pickBlock(a, NOTHING_PICKED, traineeCharaId) !== null) continue;
    const pickedA = [a];
    const starsA = starsFor[i] as number[];

    for (let j = i + 1; j < veterans.length; j++) {
      const b = veterans[j] as ResolvedVeteran;
      if (pickBlock(b, pickedA, traineeCharaId) !== null) continue;
      legalPairs++;

      const starsB = starsFor[j] as number[];
      // A requirement is met across the PAIR, not by either half: "12 Stamina
      // across the lineage" is twelve stars anywhere in six ancestors.
      let meets = true;
      for (let c = 0; c < criteria.length; c++) {
        const wanted = (criteria[c] as SparkCriterion).minStars;
        if ((starsA[c] as number) + (starsB[c] as number) < wanted) {
          meets = false;
          break;
        }
      }
      if (!meets) continue;

      const perSpark = criteria.map((_, c) =>
        fakeSparkOdds(a.index, b.index, c, (starsA[c] as number) + (starsB[c] as number)),
      );
      const { pairTotal, relationRank } = fakeAffinity(a.index, b.index);
      const joint = jointOdds(perSpark);
      candidates.add(a.index);
      candidates.add(b.index);

      rows.push({
        a,
        b,
        stars: criteria.map((_, c) => [starsA[c] as number, starsB[c] as number] as const),
        perSpark,
        joint,
        pairTotal,
        relationRank,
        order: orderOf(perSpark, joint, pairTotal),
      });
    }
  }

  // The design doc's ranking: the joint chance that every wanted spark arrives,
  // with the pair total breaking ties. The tiebreak is not cosmetic -- ties are
  // common once values round, and without a deterministic order a re-ranked
  // list reshuffles rows that scored identically. Indices break the last tie
  // for the same reason.
  rows.sort(
    (x, y) =>
      y.order - x.order ||
      y.pairTotal - x.pairTotal ||
      x.a.index - y.a.index ||
      x.b.index - y.b.index,
  );

  return { rows, legalPairs, matchingPairs: rows.length, candidates: candidates.size };
}

/**
 * What ranks a row, and it is a different quantity at each of three counts.
 *
 * With two or more requirements it is the joint chance, which is the real
 * search's answer. With one, the joint IS that one figure and `jointOdds`
 * correctly refuses to restate it. WITH NONE THERE ARE NO ODDS AT ALL, so the
 * list falls back to the pair total -- and the screen has to say so, because
 * ranking by affinity is NOT what the real search does and a silent fallback
 * would teach the wrong thing about the feature.
 */
function orderOf(perSpark: readonly number[], joint: number | null, pairTotal: number): number {
  if (joint !== null) return joint;
  return perSpark.length === 1 ? (perSpark[0] as number) : pairTotal;
}

/**
 * FAKE. An invented chance for one spark on one pair.
 *
 * Shaped rather than uniform, for two reasons that both matter to a layout
 * review. Skewed low (`u ** 1.7`) because real career odds are: a long tail of
 * near-nothing under a handful of strong rows is what the column has to look
 * like, and a flat 0-100% spread would make every row look equally good and
 * hide whether the ranking reads at all. Nudged upward by the star count
 * because a row printing "Stamina 9★ · 4%" beside "Stamina 2★ · 78%" would send
 * a reviewer hunting for a bug in a wireframe that has no model to have one in.
 *
 * That nudge is a DRAWING CHOICE, not a claim about the game. The real number
 * is `base x (1 + Individual Affinity / 100)` compounded over two inspirations
 * and does not read off a star total at all.
 */
function fakeSparkOdds(indexA: number, indexB: number, slot: number, stars: number): number {
  const shaped = hash(indexA, indexB, 101 + slot) ** 1.7;
  const lift = Math.min(stars, 12) / 12;
  return clamp(0.01 + shaped * 0.72 + lift * 0.24 * hash(indexA, indexB, 211 + slot), 0.002, 0.97);
}

/**
 * FAKE. A pair total and the relation rank it is banded into.
 *
 * ONE DOCUMENTED BOUNDARY IS HONOURED: ◎ starts at 151 (README). The 〇
 * boundary used here is invented and exists only so all three glyphs appear in
 * a list long enough to judge; do not read it as a threshold. Ranks are drawn
 * rare-first so the top of the list is a mix rather than a column of ◎, which
 * is what makes the glyph worth looking at during review.
 */
function fakeAffinity(indexA: number, indexB: number): { pairTotal: number; relationRank: number } {
  const u = hash(indexA, indexB, 7);
  const spread = hash(indexA, indexB, 13);
  if (u < 0.12) return { pairTotal: 151 + Math.round(spread * 250), relationRank: 3 };
  if (u < 0.45) return { pairTotal: 51 + Math.round(spread * 99), relationRank: 2 };
  return { pairTotal: Math.round(spread * 50), relationRank: 1 };
}

/**
 * A deterministic [0, 1) from a pair and a salt.
 *
 * DETERMINISTIC ON PURPOSE. `Math.random()` here would reshuffle the whole list
 * on every keystroke in the filter and on every re-render, which makes a
 * scrolling and repetition review impossible: the reviewer would never see the
 * same row twice. Keyed on the roster indices, so one pair always draws the
 * same figures.
 */
function hash(a: number, b: number, salt: number): number {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));
