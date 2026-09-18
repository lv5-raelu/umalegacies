import { describe, expect, it } from 'vitest';
import { RANK_LADDER, RANK_SPRITE } from './rank-ladder';
import { rankFor, rankLabel } from './rank-labels';

/**
 * The ladder is transcribed from daftuyda.moe, not extracted from master.mdb,
 * which makes it the one piece of game vocabulary here with no committed source
 * of its own.
 *
 * The cross-check against master.mdb's own bands lives in
 * packages/api/src/master/rank-ladder-crosscheck.test.ts, because it needs the
 * extract and reaching for it from here pulled better-sqlite3 into this
 * package's typecheck graph -- which resolved locally through npm hoisting and
 * failed on Vercel, where each service installs in isolation.
 *
 * What stays here is everything that describes the ladder on its own terms.
 */
describe('the rank ladder', () => {
  it('is ascending, unique and complete', () => {
    expect(RANK_LADDER.length).toBe(298);
    for (let i = 1; i < RANK_LADDER.length; i++) {
      expect(RANK_LADDER[i]![0]).toBeGreaterThan(RANK_LADDER[i - 1]![0]);
    }
    expect(new Set(RANK_LADDER.map((r) => r[1])).size).toBe(RANK_LADDER.length);
    for (const [min, label, x, y, w, h] of RANK_LADDER) {
      expect(Number.isInteger(min)).toBe(true);
      expect(label).not.toBe('');
      // Every rect must lie inside the atlas, or the badge crops onto empty
      // space and renders as a blank box rather than as an obvious failure.
      expect(x + w).toBeLessThanOrEqual(RANK_SPRITE.width);
      expect(y + h).toBeLessThanOrEqual(RANK_SPRITE.height);
    }
  });

  it('starts at G on zero and tops out at LS24', () => {
    expect(rankLabel(0)).toBe('G');
    expect(rankLabel(190_400)).toBe('LS24');
    expect(rankLabel(999_999)).toBe('LS24');
  });

  it('puts a score in the band that contains it, not the one after', () => {
    // G is 0-299 and G+ starts at 300. An off-by-one here would mislabel every
    // veteran sitting exactly on a threshold, which is where they cluster.
    expect(rankLabel(299)).toBe('G');
    expect(rankLabel(300)).toBe('G+');
    expect(rankLabel(19_199)).toBe('SS');
    expect(rankLabel(19_200)).toBe('SS+');
  });

  it('refuses a score it cannot place rather than guessing', () => {
    expect(rankFor(-1)).toBeNull();
    expect(rankFor(Number.NaN)).toBeNull();
  });
});
