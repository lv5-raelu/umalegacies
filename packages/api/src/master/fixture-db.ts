import Database from 'better-sqlite3';

/**
 * An in-memory master.mdb stand-in carrying the schema and the specific rows
 * the boot checks assert on. Lets the whole boot path be tested in CI with no
 * 16 MB user file present.
 */
export function fixtureDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE succession_relation (relation_type INTEGER NOT NULL PRIMARY KEY, relation_point INTEGER NOT NULL);
    CREATE TABLE succession_relation_member (id INTEGER NOT NULL PRIMARY KEY, relation_type INTEGER NOT NULL, chara_id INTEGER NOT NULL);
    CREATE TABLE succession_relation_rank (relation_rank INTEGER NOT NULL PRIMARY KEY, rank_value_min INTEGER NOT NULL, rank_value_max INTEGER NOT NULL);
    CREATE TABLE single_mode_wins_saddle (id INTEGER NOT NULL PRIMARY KEY, group_id INTEGER NOT NULL, win_saddle_type INTEGER NOT NULL);
    CREATE TABLE card_data (id INTEGER NOT NULL PRIMARY KEY, chara_id INTEGER NOT NULL);
    CREATE TABLE text_data (id INTEGER NOT NULL, category INTEGER NOT NULL, "index" INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (category, "index"));

    INSERT INTO succession_relation_rank VALUES (1, 0, 50), (2, 51, 150), (3, 151, 9999);

    -- The two cards that break card_id / 100. See Domain Model Correction 4.
    INSERT INTO card_data VALUES (101601, 1016), (9100101, 1001), (9101101, 1011);

    INSERT INTO text_data VALUES (1, 6, 1016, 'Narita Brian');
  `);
  return db;
}
