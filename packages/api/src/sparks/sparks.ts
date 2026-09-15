import type { MasterData } from '../master/master-data';
import type { AncestorRef } from '../affinity/types';
import {
  BASE_RATES,
  SPARK_KIND_ORDER,
  type AncestorSpark,
  type AncestorSparkSet,
  type SparkCarrier,
  type SparkSummaryRow,
} from './spark-types';

/** An empty set, so an absent or unresolved slot still renders six uniform nodes. */
export function emptySparkSet(): AncestorSparkSet {
  return { blue: null, pink: null, green: null, whites: [], unknownFactorIds: [] };
}

/**
 * Sorts one ancestor's factor ids into the three named slots and the bag.
 *
 * A second blue on one ancestor has never been observed in 1,554 slots. If a
 * patch introduces one it lands in `whites` rather than silently replacing the
 * first, because losing a spark is worse than showing it in the wrong group.
 */
export function ancestorSparks(ref: AncestorRef, data: MasterData): AncestorSparkSet {
  const set = emptySparkSet();
  for (const factorId of ref.factorIds ?? []) {
    const factor = data.factor(factorId);
    if (!factor) {
      set.unknownFactorIds.push(factorId);
      continue;
    }
    const spark: AncestorSpark = {
      factorId: factor.factorId,
      groupId: factor.groupId,
      kind: factor.kind,
      name: factor.name,
      stars: factor.stars,
    };
    if (spark.kind === 'blue' && !set.blue) set.blue = spark;
    else if (spark.kind === 'pink' && !set.pink) set.pink = spark;
    else if (spark.kind === 'green' && !set.green) set.green = spark;
    else set.whites.push(spark);
  }
  set.whites.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
  return set;
}

/** All of one ancestor's sparks in one list, named slots first. */
function allSparks(set: AncestorSparkSet): AncestorSpark[] {
  const named = [set.blue, set.pink, set.green].filter((s): s is AncestorSpark => s !== null);
  return [...named, ...set.whites];
}

/**
 * P(at least 1) and P(at least 2) activations across a career.
 *
 * Inspiration fires ONCE per event and TWICE per career, and within one event
 * every carrier of the spark rolls independently. So the count within one
 * inspiration is a Poisson-binomial over the carriers, and the career is that
 * distribution convolved with itself.
 *
 * Computed as an exact DP over the carriers rather than the closed form
 * `p1 = 2 * p0 * sum(p/(1-p))`. The two agree to 1e-16, but the closed form
 * divides by `1 - p` and a blue spark on a parent is capped at exactly 1.0,
 * which makes that division 0/0. The DP has no such hole.
 */
export function careerOdds(perInspiration: number[]): { once: number; twice: number } {
  // Distribution of how many carriers fire within ONE inspiration.
  let dist = [1];
  for (const raw of perInspiration) {
    // The HTTP boundary caps and dedupes carriers, but this function has callers
    // that never pass through it (build-fixtures.mjs, and M3's own roster path),
    // so the invariant lives here too rather than only at the edge.
    const p = clamp01(raw);
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      const weight = dist[k] as number;
      next[k] = (next[k] as number) + weight * (1 - p);
      next[k + 1] = (next[k + 1] as number) + weight * p;
    }
    dist = next;
  }
  // Two inspirations. Only the first two buckets of the convolution are needed.
  const none = (dist[0] ?? 0) * (dist[0] ?? 0);
  const exactlyOne = 2 * (dist[0] ?? 0) * (dist[1] ?? 0);
  const once = 1 - none;
  const twice = 1 - none - exactlyOne;
  // Floating point can leave a -1e-17 here, and a negative probability printed
  // as "-0%" is worse than the rounding it came from.
  return { once: clamp01(once), twice: clamp01(twice) };
}

function clamp01(n: number): number {
  // NaN first: both comparisons below are false for NaN, so without this the
  // "guard" that exists to stop a -0% reaching the screen happily passes NaN
  // through, and the web app's percent() has no NaN branch either -- it prints
  // the string "NaN%". A rate this code cannot compute is 0, not a glyph.
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Builds the lineage-wide summary: one row per distinct spark, whoever carries
 * it and however many stars each carrier has.
 *
 * `individualAffinity` is keyed by position_id and comes from the affinity
 * engine. For a parent it is the four-link figure (trainee-parent, parent-parent
 * and the two three-way grandparent terms), which is the quantity hakuraku's
 * SparkProcModal feeds into its own rate calculation. breeding-optimizer
 * displays a different, also-legitimate figure that omits the parent-parent
 * link; do not switch to it here.
 */
export function summariseSparks(
  sparksByPosition: ReadonlyMap<number, AncestorSparkSet>,
  individualAffinity: ReadonlyMap<number, number>,
): SparkSummaryRow[] {
  const rows = new Map<number, SparkSummaryRow>();

  for (const [position, set] of sparksByPosition) {
    const ia = individualAffinity.get(position) ?? 0;
    for (const spark of allSparks(set)) {
      const baseRate = BASE_RATES[spark.kind][spark.stars - 1] ?? 0;
      const carrier: SparkCarrier = {
        position,
        stars: spark.stars,
        individualAffinity: ia,
        baseRate,
        perInspiration: clamp01(baseRate * (1 + ia / 100)),
      };
      const existing = rows.get(spark.groupId);
      if (existing) {
        existing.stars += spark.stars;
        existing.carriers.push(carrier);
      } else {
        rows.set(spark.groupId, {
          groupId: spark.groupId,
          kind: spark.kind,
          name: spark.name,
          stars: spark.stars,
          carriers: [carrier],
          onceInCareer: 0,
          twiceInCareer: 0,
        });
      }
    }
  }

  const out = [...rows.values()];
  for (const row of out) {
    const odds = careerOdds(row.carriers.map((c) => c.perInspiration));
    row.onceInCareer = odds.once;
    row.twiceInCareer = odds.twice;
    row.carriers.sort((a, b) => b.perInspiration - a.perInspiration || a.position - b.position);
  }
  // Group order first, then likeliest within a group: the table reads top-down
  // as "what is this lineage most going to give me".
  out.sort(
    (a, b) =>
      SPARK_KIND_ORDER.indexOf(a.kind) - SPARK_KIND_ORDER.indexOf(b.kind) ||
      b.onceInCareer - a.onceInCareer ||
      b.stars - a.stars ||
      a.name.localeCompare(b.name),
  );
  return out;
}
