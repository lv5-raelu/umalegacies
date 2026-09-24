import type { SparkKind } from '@umalegacies/types';
import { isWhite } from './spark-types.js';

/**
 * WHETHER THE TRAINEE ENDS THE CAREER CARRYING THE SPARK ITSELF.
 *
 * A DIFFERENT QUESTION FROM EVERY OTHER NUMBER IN THIS ENGINE, and the
 * distinction is easy to lose because the word "inherit" has been used for both.
 * `sparks.ts` answers "will this spark FIRE during an inspiration", which hands
 * the trainee a skill hint they can buy with SP. That is a thing that happens
 * DURING the run. This file answers "will the trainee RETIRE carrying that spark
 * as one of their own factors", which is what makes them useful as somebody
 * else's parent, and it is decided at the END of the run by a separate roll.
 *
 * Having the skill does not give you the spark. That is the whole point.
 *
 * THE RULE. At retirement each white spark the trainee could generate rolls
 * independently, and the chance rises with HOW MANY OF THE SIX ANCESTORS -- two
 * parents and four grandparents -- already carry that spark:
 *
 *     carriers    0      1      2      3      4      5      6
 *     chance     20%   22.5%    25%   27.5%    30%   32.5%    35%
 *
 * So it is ADDITIVE, 2.5 percentage points per carrier, and it saturates at 35%
 * with a full lineage. A multiplicative reading fits too -- 20 x 1.75 = 35 --
 * and it is wrong. It comes from a secondary source quoting 25% -> 44% for the
 * upgraded-skill row, where 44 is suspiciously close to 25 x 1.75 = 43.75. The
 * primary table says that row ends at 40%, which is 25 + 6 x 2.5 and not a
 * multiple of anything. The two readings agree at the row this engine uses and
 * disagree elsewhere, which is exactly the kind of coincidence that survives
 * until it ships.
 *
 * NOT AFFINITY. Nothing here is scaled by Individual Affinity, and that is the
 * substantive difference from `BASE_RATES`. Affinity decides whether a spark
 * FIRES; the count of carriers decides whether it STICKS. A pair can be
 * excellent at one and poor at the other, which is the reason this number is
 * worth showing next to the other rather than folded into it.
 *
 * Sources: uma.guide's Sparks & Inheritance tables, which is the same body of
 * community research this project already cites for `BASE_RATES` -- the base
 * rate table there is byte-for-byte the one in `spark-types.ts` -- and the
 * Japanese write-up it footnotes. Like every rate in this engine, it is
 * community research rather than anything `master.mdb` publishes.
 *
 * MEASURED AGAINST 2,800 REAL LINEAGES, 2026-09-24, and the shape holds. See
 * `docs/designs/planner-that-shows-its-work.md` for the full working. In short:
 * race sparks are the one kind whose precondition is observable, because the
 * record says which G1s the veteran actually won, so conditioning on the win
 * isolates this roll from everything else. Across 45,755 such observations the
 * rate rose monotonically with the carrier count and was FLAT across the
 * veteran's own rating band, both as documented. The level ran about 3.5 points
 * high, which is unsurprising in a pool that only lists veterans good enough to
 * lend and that cannot show the four grandparents the game is also counting.
 * The documented table ships; the measurement is recorded beside it.
 */

/** Chance with no ancestor carrying the spark. */
export const ACQUISITION_BASE = 0.2;

/** Added per ancestor that carries it. Six of them reach 35%. */
export const ACQUISITION_STEP = 0.025;

/** Two parents and four grandparents. */
export const MAX_LINEAGE_CARRIERS = 6;

/**
 * Chance the trainee retires carrying this spark, GIVEN its precondition is met.
 *
 * The precondition is the caller's business and differs by kind -- see
 * `precondition()`. This function is only the roll.
 */
export function acquisitionChance(carriers: number): number {
  if (!Number.isFinite(carriers) || carriers < 0) return ACQUISITION_BASE;
  // Clamped rather than extrapolated. A seventh carrier cannot exist, but a
  // caller that miscounts should get the table's last row rather than 37.5%,
  // because a number off the end of a published table is not a prediction.
  const n = Math.min(Math.floor(carriers), MAX_LINEAGE_CARRIERS);
  return ACQUISITION_BASE + ACQUISITION_STEP * n;
}

/**
 * Does the carrier mechanic apply to this kind at all?
 *
 * WHITE ONLY. The trainee's blue spark is drawn from their own final stats,
 * their pink from their own A-or-better aptitudes, and their green IS their
 * own unique skill and is guaranteed. None of the three is influenced by what
 * the ancestors carry, so reporting a chance for them would be inventing one.
 */
export const hasAcquisitionRoll = (kind: SparkKind): boolean => isWhite(kind);

/** What the trainee must do before the roll above is even taken. */
export type Precondition =
  /** Learn the skill during the career. Inspiration is one route to it. */
  | 'learn-the-skill'
  /** Win that G1 during the career. Winning it twice does not help. */
  | 'win-the-race'
  /** Clear the scenario's own condition. */
  | 'finish-the-scenario'
  /** No roll: the kind is not acquired this way. */
  | null;

export function precondition(kind: SparkKind): Precondition {
  switch (kind) {
    case 'white_skill':
      return 'learn-the-skill';
    case 'white_race':
      return 'win-the-race';
    case 'white_scenario':
      return 'finish-the-scenario';
    default:
      return null;
  }
}

/**
 * The end-to-end chance, for the ONE kind where this engine can compute it.
 *
 * `white_skill` is the only kind whose precondition this tool already models:
 * an inspiration hands over the hint, and `onceInCareer` is the chance that
 * happens. Multiply, and the answer is "the chance the trainee retires carrying
 * this spark, by way of the lineage".
 *
 * TWO ASSUMPTIONS, BOTH REAL, and the UI says so rather than burying them.
 * It assumes the hint gets bought -- an SP decision no engine can make -- and
 * it counts ONLY the inspiration route, so a skill picked up from a support
 * card instead lands outside the number. That makes this a floor rather than an
 * estimate, which is the right direction for a figure someone plans around.
 *
 * Returns null where the chain is not ours to compute. A race spark needs the
 * trainee to win that G1 and a scenario spark needs the scenario cleared;
 * neither is a lineage property, and guessing at them would turn an exact
 * number into a fabricated one.
 */
export function inheritOnceInCareer(
  kind: SparkKind,
  onceInCareer: number,
  carriers: number,
): number | null {
  if (kind !== 'white_skill') return null;
  return onceInCareer * acquisitionChance(carriers);
}
