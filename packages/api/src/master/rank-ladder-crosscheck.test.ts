import { describe, expect, it } from 'vitest';
// The ladder itself, and nothing else from the web package. `rank-ladder.ts` is
// a bare tuple table with no imports of its own, so it carries no React types
// into a package whose tsconfig is `types: ["node"]`. Its neighbour
// `rank-labels.ts` DOES reference React.CSSProperties -- do not import it here.
import { RANK_LADDER } from '../../../web/src/roster/rank-ladder.js';
import { extractDatabase, extractMaster } from './master-extract.js';

/**
 * Does the transcribed rank ladder still agree with the game's own bands?
 *
 * THIS TEST LIVES HERE, not beside its subject in packages/web, and that is
 * deliberate. It is the only cross-check that needs the master extract, and
 * reaching for the extract from a web test dragged `better-sqlite3` into the web
 * package's typecheck graph. That resolved locally -- npm hoists the dependency
 * to the repository root -- and failed on Vercel, which installs each service in
 * isolation:
 *
 *   ../api/src/master/master-data.ts(1,31): error TS2307:
 *     Cannot find module 'better-sqlite3'
 *
 * The invariant that broke: one package's BUILD must not depend on another
 * package's devDependencies. packages/api excludes `**\/*.test.ts` from its
 * build, so the import in the other direction -- an api TEST reading a web data
 * table -- costs the web build nothing.
 *
 * The four assertions that need no database (ordering, sprite bounds, threshold
 * off-by-ones, refusal to place an impossible score) stay in
 * packages/web/src/roster/rank-ladder.test.ts, beside the code they describe.
 */
describe('the rank ladder against master.mdb', () => {
  /**
   * master.mdb carries the same bands with no names, so where the two overlap
   * they must agree exactly -- and where they do not, this records precisely how
   * far the agreement runs.
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

    // Every band the two DO share must resolve to a row in the ladder. Looked up
    // by score, the same way rankFor does it, rather than by index.
    for (const t of tiers) {
      if (!ladderMins.has(t.min_value)) continue;
      const row = [...RANK_LADDER].reverse().find((r) => t.min_value >= r[0]);
      expect(row?.[1], `no label at ${t.min_value}`).toBeTruthy();
    }
  });

  /**
   * The extract still bands a real score. Nothing on the wire carries the tier
   * -- the label comes from the score and the ladder -- so this is what pins the
   * master data's own banding to a number a roster actually contains.
   */
  it('bands a real roster score the same way it always has', () => {
    expect(extractMaster().careerRankTier(24_575)).toBe(30);
  });
});
