import type { Database } from 'better-sqlite3';
import { MasterContentError } from './master.errors';

/**
 * A boot-time assertion that the opened database says what we believe it says.
 * Schema presence (check 2) proves the tables exist; these prove the rows in
 * them still mean what the affinity rules assume.
 */
export interface ContentCheck {
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
 * Checks that run at every boot.
 *
 * M1 adds the check the design doc specifies: run fixture 5774 through the
 * affinity engine in-process and assert it produces 410. That check cannot
 * exist before the engine does, so M0 ships the assertions that need only the
 * database, and M1 appends the fixture check to this array.
 */
export const contentChecks: readonly ContentCheck[] = [
  rankBuckets,
  cardJoinExceptions,
  nameLookup,
];
