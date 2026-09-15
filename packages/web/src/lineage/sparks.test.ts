import { describe, expect, it } from 'vitest';
import { SPARK_COLOR, SPARK_KIND_ORDER, isWhite, percent, plural, stars } from './sparks';

describe('percent', () => {
  it('rounds to whole numbers', () => {
    expect(percent(0.4334)).toBe('43%');
    expect(percent(0.995)).toBe('100%');
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
