import { describe, expect, it } from 'vitest';
import type { SparkKind } from '@umalegacies/types';
import {
  ACQUISITION_BASE,
  ACQUISITION_STEP,
  MAX_LINEAGE_CARRIERS,
  acquisitionChance,
  hasAcquisitionRoll,
  inheritOnceInCareer,
  precondition,
} from './inherit.js';

/**
 * THE PUBLISHED TABLE, ASSERTED AS A TABLE.
 *
 * Written out rather than generated from the same two constants the
 * implementation uses, because a test that recomputes the formula only proves
 * arithmetic. These seven numbers are the community table this engine is
 * claiming to implement, so they are the thing worth pinning: change the base
 * or the step and this fails by naming the row that moved.
 */
const PUBLISHED: readonly [number, number][] = [
  [0, 0.2],
  [1, 0.225],
  [2, 0.25],
  [3, 0.275],
  [4, 0.3],
  [5, 0.325],
  [6, 0.35],
];

describe('the acquisition table', () => {
  it.each(PUBLISHED)('%i carriers gives %f', (carriers, expected) => {
    expect(acquisitionChance(carriers)).toBeCloseTo(expected, 10);
  });

  it('saturates rather than extrapolating past a full lineage', () => {
    // There is no seventh ancestor. A caller that miscounts should get the
    // table's last row, not a number the table never published.
    expect(acquisitionChance(7)).toBe(acquisitionChance(MAX_LINEAGE_CARRIERS));
    expect(acquisitionChance(99)).toBeCloseTo(0.35, 10);
  });

  it('treats a nonsense count as an empty lineage rather than throwing', () => {
    expect(acquisitionChance(-1)).toBe(ACQUISITION_BASE);
    expect(acquisitionChance(Number.NaN)).toBe(ACQUISITION_BASE);
  });

  it('is ADDITIVE, and on this row the multiplicative reading is indistinguishable', () => {
    for (const [carriers, expected] of PUBLISHED) {
      expect(expected).toBeCloseTo(ACQUISITION_BASE + ACQUISITION_STEP * carriers, 10);
    }
    // Worth stating rather than assuming, because the first draft of this test
    // asserted the opposite and failed. 2.5 points is exactly an eighth of 20,
    // so `20 + 2.5n` and `20 x (1 + n/8)` are the SAME NUMBER at every n. The
    // ambiguity is real and it is harmless here; it bites only on the upgraded
    // -skill row, which starts at 25% and where the two part company (40% vs
    // 43.75%). No factor this engine can be asked about uses that row -- all
    // 235 white-skill factor groups map to a plain white skill -- so the
    // engine is right under either reading.
    for (let n = 0; n <= MAX_LINEAGE_CARRIERS; n++) {
      expect(acquisitionChance(n)).toBeCloseTo(ACQUISITION_BASE * (1 + n / 8), 10);
    }
    expect(0.25 + 0.025 * 6).not.toBeCloseTo(0.25 * (1 + 6 / 8), 4);
  });
});

describe('which sparks are acquired this way at all', () => {
  const WHITE: SparkKind[] = ['white_skill', 'white_race', 'white_scenario'];
  const OWN: SparkKind[] = ['blue', 'pink', 'green'];

  it.each(WHITE)('%s rolls against the lineage', (kind) => {
    expect(hasAcquisitionRoll(kind)).toBe(true);
    expect(precondition(kind)).not.toBeNull();
  });

  it.each(OWN)('%s comes from the trainee, so the lineage count cannot move it', (kind) => {
    // Blue is drawn from the trainee's own final stats, pink from their own
    // aptitudes, and green IS their unique skill. Reporting a chance here would
    // be inventing one.
    expect(hasAcquisitionRoll(kind)).toBe(false);
    expect(precondition(kind)).toBeNull();
  });
});

describe('the end-to-end figure', () => {
  it('composes only for skill sparks, because only they have a route we model', () => {
    // 40% to fire across the career, 25% to stick with two carriers.
    expect(inheritOnceInCareer('white_skill', 0.4, 2)).toBeCloseTo(0.1, 10);
  });

  it.each(['white_race', 'white_scenario', 'blue', 'pink', 'green'] as SparkKind[])(
    'refuses to compose %s',
    (kind) => {
      // Winning a G1 and clearing a scenario are not lineage properties. An
      // engine that guessed at them would turn an exact number into a made-up
      // one, so the honest return is nothing at all.
      expect(inheritOnceInCareer(kind, 0.4, 2)).toBeNull();
    },
  );

  it('is always below the activation chance it is built from', () => {
    // The whole reason the feature exists: having the skill is not having the
    // spark, so the second number can never flatter the first.
    for (let carriers = 0; carriers <= 6; carriers++) {
      const composed = inheritOnceInCareer('white_skill', 0.8, carriers);
      expect(composed).not.toBeNull();
      expect(composed as number).toBeLessThan(0.8);
    }
  });
});
