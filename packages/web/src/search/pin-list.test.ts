import { describe, expect, it } from 'vitest';
import { pinSummary, togglePin } from './pin-list';

describe('building a shortlist', () => {
  it('adds a card that is not there', () => {
    expect(togglePin([], 100601)).toEqual([100601]);
    expect(togglePin([100601], 100901)).toEqual([100601, 100901]);
  });

  it('removes one that is', () => {
    // The same gesture both ways: a list of options has nowhere to put a
    // second control per row.
    expect(togglePin([100601, 100901], 100601)).toEqual([100901]);
    expect(togglePin([100601], 100601)).toEqual([]);
  });

  it('keeps the order the reader built', () => {
    // Re-adding does NOT move a card to the front. The list is rendered in this
    // order, so a jump would shift every row under the pointer.
    const built = [100601, 100901, 100201];
    expect(togglePin(togglePin(built, 100901), 100901)).toEqual([100601, 100201, 100901]);
    expect(togglePin(built, 100401)).toEqual([100601, 100901, 100201, 100401]);
  });

  it('never mutates what it was given', () => {
    const before = [100601, 100901];
    togglePin(before, 100601);
    togglePin(before, 100201);
    expect(before).toEqual([100601, 100901]);
  });
});

describe('what the collapsed control says', () => {
  it('says anyone when nothing is pinned', () => {
    // "anyone", not "nobody": an empty shortlist is no constraint.
    expect(pinSummary([])).toBe('anyone');
  });

  it('names a single pick, costume and all', () => {
    expect(pinSummary(['Oguri Cap [Starlight Beat]'])).toBe('Oguri Cap [Starlight Beat]');
  });

  it('counts several, because three names do not fit', () => {
    // And says "any of them", so a count is not read as "all three at once" --
    // which is a thing a pair of two parents could not do anyway.
    expect(pinSummary(['a', 'b'])).toBe('2 umas — any of them');
    expect(pinSummary(['a', 'b', 'c'])).toBe('3 umas — any of them');
  });
});
