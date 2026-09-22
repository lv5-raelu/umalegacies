import { describe, expect, it } from 'vitest';
import {
  SPARK_COLOR,
  SPARK_KIND_ORDER,
  isWhite,
  percent,
  percentPrecise,
  plural,
  stars,
} from './sparks';

describe('percent', () => {
  it('rounds to whole numbers', () => {
    expect(percent(0.4334)).toBe('43%');
    expect(percent(0.99)).toBe('99%');
  });

  it('distinguishes a rounded-away certainty from a real one', () => {
    // The mirror of the <1% rule, and it was missing. Math.round turned 99.6%
    // into "100%" for a spark that fails one career in 250 -- next to an audit
    // trail that had just been fixed to KEEP exactly those rows.
    expect(percent(1)).toBe('100%');
    // 0.995 is the exact boundary Math.round takes to 100. An earlier test in
    // this file asserted it printed "100%", which locked the defect in: the
    // correct behaviour would have read as a regression.
    expect(percent(0.995)).toBe('>99%');
    expect(percent(0.9949)).toBe('99%');
    expect(percent(0.996)).toBe('>99%');
    expect(percent(0.99927)).toBe('>99%');
    expect(percent(0.99)).toBe('99%');
  });

  it('refuses to print a number it does not have', () => {
    expect(percent(NaN)).toBe('—');
    expect(percent(Infinity)).toBe('—');
  });

  it('distinguishes a rounded-away chance from an impossible one', () => {
    // 0% is a claim that it cannot happen. Anything above zero says so.
    expect(percent(0)).toBe('0%');
    expect(percent(0.0001)).toBe('<1%');
    expect(percent(0.004)).toBe('<1%');
    expect(percent(0.005)).toBe('1%');
  });
});

describe('plural', () => {
  it('agrees with its count', () => {
    expect(plural(1, 'white spark')).toBe('1 white spark');
    expect(plural(13, 'white spark')).toBe('13 white sparks');
    expect(plural(0, 'white spark')).toBe('0 white sparks');
  });

  it('takes an irregular plural', () => {
    expect(plural(2, 'relation is', 'relations are')).toBe('2 relations are');
  });
});

describe('the spark taxonomy', () => {
  it('treats all three white types as white', () => {
    expect(isWhite('white_skill')).toBe(true);
    expect(isWhite('white_race')).toBe(true);
    expect(isWhite('white_scenario')).toBe(true);
    expect(isWhite('blue')).toBe(false);
  });

  it('gives every kind a colour and a place in the order', () => {
    for (const kind of SPARK_KIND_ORDER) {
      expect(SPARK_COLOR[kind]).toMatch(/^var\(--spark-/);
    }
    expect(SPARK_KIND_ORDER).toHaveLength(6);
    // Structural first, the bag last: blue, pink and green are guaranteed on
    // every ancestor and the whites are where all the variance lives.
    expect(SPARK_KIND_ORDER.slice(0, 3)).toEqual(['blue', 'pink', 'green']);
  });
});

describe('stars', () => {
  it('reads as a count, whether one spark or a lineage total', () => {
    expect(stars(3)).toBe('3★');
    expect(stars(12)).toBe('12★');
  });
});

describe('percentPrecise', () => {
  // The joint chance is a product and collapses fast: under percent() a ranked
  // list reads "2%, 2%, 1%, 1%" and the ordering that is really there is lost.
  it('keeps the digits that tell two rows apart', () => {
    expect(percentPrecise(0.0123456789012)).toBe('1.2345678901%');
    // Two joints a hair apart still read differently, which is the point:
    // percent() prints both as "1%".
    expect(percentPrecise(0.012345678902)).toBe('1.2345678902%');
    expect(percent(0.0123456789012)).toBe(percent(0.012345678902));
  });

  it('has a ceiling, and it is ten decimals OF THE PERCENTAGE', () => {
    // Which is twelve of the fraction. Two values differing past that collide,
    // and no amount of formatting recovers them -- worth knowing before anyone
    // reads the last digit as meaningful.
    expect(percentPrecise(0.0123456789012)).toBe(percentPrecise(0.0123456789013));
  });

  it('trims trailing zeros, so a round figure stays round', () => {
    expect(percentPrecise(0.48)).toBe('48%');
    expect(percentPrecise(0.105)).toBe('10.5%');
  });

  it('keeps percent()`s three honest endpoints', () => {
    expect(percentPrecise(0)).toBe('0%');
    expect(percentPrecise(1)).toBe('100%');
    expect(percentPrecise(Number.NaN)).toBe('—');
  });

  it('does not round a tiny value away to nothing', () => {
    // percent() prints "<1%" here, which is correct for a lone figure and
    // useless for ranking eighty of them.
    expect(percentPrecise(0.0000001234)).toBe('0.00001234%');
  });
});
