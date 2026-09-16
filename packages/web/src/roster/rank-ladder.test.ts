import { describe, expect, it } from 'vitest';
import { extractDatabase, extractMaster } from '../../../api/src/master/master-extract';
import { RANK_LADDER, RANK_SPRITE } from './rank-ladder';
import { rankFor, rankLabel } from './rank-labels';

/**
 * The ladder is transcribed from daftuyda.moe, not extracted from master.mdb,
 * which makes it the one piece of game vocabulary here with no committed source
 * of its own. These bind it to the data that DOES have one.
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

  /**
   * THE CROSS-CHECK. master.mdb carries the same bands with no names, so where
   * the two overlap they must agree exactly -- and where they do not, this
   * records precisely how far the agreement runs.
   *
   * The extract is OLDER than the live ladder: the game grew from 98 tiers to
   * 298 and rebalanced the top. Measured 2026-09-16: 92 of the extract's 98 band
   * minimums are also ladder minimums, and the six that are not are all at or
   * above 66,000. Everything a real roster reaches is far below that.
   *
   * This is why labels are matched by SCORE and never by tier index: pairing
   * master id N with ladder row N would be wrong for every tier above the
   * divergence, and wrong silently.
   */
  it('agrees with master.mdb on every band below 66,000', () => {
    const master = extractMaster();
    const db = extractDatabase();
    const tiers = db
      .prepare('SELECT id, min_value FROM single_mode_rank ORDER BY min_value')
      .all() as Array<{ id: number; min_value: number }>;
    expect(tiers.length).toBe(98);

    const ladderMins = new Set(RANK_LADDER.map((r) => r[0]));
    const unmatched = tiers.filter((t) => !ladderMins.has(t.min_value));

    expect(tiers.length - unmatched.length).toBe(92);
    // Named individually rather than counted: if a future extract moves one of
    // these, the failure should say which.
    expect(unmatched.map((t) => t.min_value)).toEqual([66000, 66800, 68600, 69500, 70400, 71400]);
    for (const t of unmatched) expect(t.min_value).toBeGreaterThanOrEqual(66_000);

    // And every band the two DO share must resolve to a label there.
    for (const t of tiers) {
      if (!ladderMins.has(t.min_value)) continue;
      expect(rankLabel(t.min_value), `no label at ${t.min_value}`).not.toBeNull();
    }

    // The extract still bands a real score, which is what makes it a usable
    // cross-check even though nothing on the wire carries the tier: the label
    // comes from the score and the ladder, and this is what pins the two.
    expect(master.careerRankTier(24_575)).toBe(30);
  });
});
