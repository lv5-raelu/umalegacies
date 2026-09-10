import { describe, expect, it } from 'vitest';
import { contentChecks } from './content-checks';
import { fixtureDb } from './fixture-db';
import { MasterContentError } from './master.errors';

const byName = (name: string) => {
  const check = contentChecks.find((c) => c.name === name);
  if (!check) throw new Error(`no content check named ${name}`);
  return check;
};

describe('boot content checks', () => {
  it('all pass against a well-formed database', () => {
    const db = fixtureDb();
    for (const check of contentChecks) {
      expect(() => check.run(db), check.name).not.toThrow();
    }
  });

  it('rank_buckets rejects a moved 151 threshold', () => {
    const db = fixtureDb();
    db.prepare(
      'UPDATE succession_relation_rank SET rank_value_min = 160 WHERE relation_rank = 3',
    ).run();
    expect(() => byName('rank_buckets').run(db)).toThrow(MasterContentError);
  });

  it('rank_buckets rejects a missing bucket', () => {
    const db = fixtureDb();
    db.prepare('DELETE FROM succession_relation_rank WHERE relation_rank = 2').run();
    expect(() => byName('rank_buckets').run(db)).toThrow(/expected 3 rank rows/);
  });

  it('card_join_exceptions rejects a database where the two odd cards moved', () => {
    const db = fixtureDb();
    db.prepare('UPDATE card_data SET chara_id = 91001 WHERE id = 9100101').run();
    expect(() => byName('card_join_exceptions').run(db)).toThrow(
      /9100101 -> 1001/,
    );
  });

  it('name_lookup quotes the reserved word "index"', () => {
    // An unquoted `index` is a syntax error, so this passing at all is the
    // assertion: the query compiled and returned the row.
    const db = fixtureDb();
    expect(() => byName('name_lookup').run(db)).not.toThrow();
  });

  it('name_lookup rejects a database with no category-6 names', () => {
    const db = fixtureDb();
    db.prepare('DELETE FROM text_data WHERE category = 6').run();
    expect(() => byName('name_lookup').run(db)).toThrow(MasterContentError);
  });
});
