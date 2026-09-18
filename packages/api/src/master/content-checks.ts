import type { Database } from 'better-sqlite3';
import { explain } from '../affinity/engine.js';
import { loadFixture } from '../affinity/fixtures.js';
import { MasterData } from './master-data.js';
import { MasterContentError } from './master.errors.js';

/**
 * A boot-time assertion that the opened database says what we believe it says.
 * Schema presence (check 2) proves the tables exist; these prove the rows in
 * them still mean what the affinity rules assume.
 */
interface ContentCheck {
  readonly name: string;
  run(db: Database): void;
}

/**
 * The ◎ threshold and the three rank buckets. Every icon verdict this product
 * renders is a lookup against these three rows, so a patch that re-buckets
 * them changes user-visible output silently.
 * Verified against master.mdb extracted 2026-09-10.
 */
const rankBuckets: ContentCheck = {
  name: 'rank_buckets',
  run(db) {
    const expected = [
      { relation_rank: 1, rank_value_min: 0, rank_value_max: 50 },
      { relation_rank: 2, rank_value_min: 51, rank_value_max: 150 },
      { relation_rank: 3, rank_value_min: 151, rank_value_max: 9999 },
    ];
    const rows = db
      .prepare(
        'SELECT relation_rank, rank_value_min, rank_value_max ' +
          'FROM succession_relation_rank ORDER BY relation_rank',
      )
      .all() as Array<Record<string, number>>;

    if (rows.length !== expected.length) {
      throw new MasterContentError(
        this.name,
        `expected ${expected.length} rank rows, found ${rows.length}`,
      );
    }
    for (const [i, want] of expected.entries()) {
      const got = rows[i];
      for (const [column, value] of Object.entries(want)) {
        if (got?.[column] !== value) {
          throw new MasterContentError(
            this.name,
            `rank row ${i}: expected ${column}=${value}, found ${got?.[column]}`,
          );
        }
      }
    }
  },
};

/**
 * `card_id -> chara_id` is a join, never `id / 100`. Two cards break the
 * division (9100101 -> 1001 and 9101101 -> 1011) and they are the reason
 * charaIdFor() exists. If they ever vanish from card_data the join is still
 * correct, but the assumption behind the test suite has moved and we want to
 * be told at boot rather than discover it in a wrong affinity number.
 * See Domain Model Correction 4 in docs/designs/planner-that-shows-its-work.md.
 */
const cardJoinExceptions: ContentCheck = {
  name: 'card_join_exceptions',
  run(db) {
    const rows = db
      .prepare('SELECT id, chara_id FROM card_data WHERE chara_id <> id / 100')
      .all() as Array<{ id: number; chara_id: number }>;

    const found = new Map(rows.map((r) => [r.id, r.chara_id]));
    for (const [cardId, charaId] of [
      [9100101, 1001],
      [9101101, 1011],
    ] as const) {
      if (found.get(cardId) !== charaId) {
        throw new MasterContentError(
          this.name,
          `card_data no longer maps ${cardId} -> ${charaId}; the card_id/100 ` +
            `shortcut may have changed shape`,
        );
      }
    }
  },
};

/**
 * `text_data.index` is a SQL reserved word and must be quoted in every query.
 * An unquoted one is a syntax error at call time, not at boot; this check runs
 * the quoted form once so a rename is caught here instead.
 */
const nameLookup: ContentCheck = {
  name: 'name_lookup',
  run(db) {
    const row = db
      .prepare('SELECT text FROM text_data WHERE category = 6 AND "index" = ?')
      .get(1016) as { text?: string } | undefined;
    if (!row?.text) {
      throw new MasterContentError(
        this.name,
        'text_data category 6 has no name for chara_id 1016',
      );
    }
  },
};

/**
 * The end-to-end check: run a real lineage through the real engine against
 * this master.mdb and assert the externally verified answer.
 *
 * Fixture 5774 rather than 5531 because it guards BOTH disputed rules at once.
 * Its grandparents in slots 12 and 22 are the trainee, so:
 *   - scoring the self-link as an ordinary three-way gives 443, not 410
 *   - zeroing the whole self-link instead of only its base gives less than 410
 *   - normalising shared G1 wins to group_id moves the bonus off 312
 * 5531 alone would miss the self-link rule entirely.
 *
 * This catches a master.mdb whose rows parse and whose schema is intact but
 * whose CONTENT has moved under the rules, which is the failure the other
 * three checks cannot see.
 */
const goldenLineage: ContentCheck = {
  name: 'golden_lineage_5774',
  run(db) {
    const fixture = loadFixture('5774');
    const expected = (fixture.expected as { pairTotal: number }).pairTotal;
    let actual: number;
    try {
      actual = explain(fixture.request, new MasterData(db), 'boot-check').pairTotal.value;
    } catch (cause) {
      throw new MasterContentError(
        this.name,
        `the engine threw on fixture 5774: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
    if (actual !== expected) {
      throw new MasterContentError(
        this.name,
        `fixture 5774 produced ${actual}, expected ${expected}. Either this ` +
          `master.mdb is not the extraction the fixture was verified against, ` +
          `or an affinity rule has regressed.`,
      );
    }
  },
};

/** Checks that run at every boot, cheapest first. */
export const contentChecks: readonly ContentCheck[] = [
  rankBuckets,
  cardJoinExceptions,
  nameLookup,
  goldenLineage,
];
