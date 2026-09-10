import type { Database } from 'better-sqlite3';

/**
 * Every read of master.mdb the affinity rules need, loaded once into memory.
 *
 * This is a plain class over a Database rather than a Nest provider so the
 * engine can be tested against the committed fixture slice with no NestJS
 * container and no 16 MB user file present.
 */
export class MasterData {
  /** relation_type -> relation_point. The number a shared relation is worth. */
  private readonly relationPoints = new Map<number, number>();
  /** chara_id -> the relation_types they belong to. */
  private readonly relationTypesByChara = new Map<number, Set<number>>();
  /** card_id -> chara_id. */
  private readonly charaIdByCardId = new Map<number, number>();
  /** single_mode_wins_saddle ids whose win_saddle_type is 3, i.e. a single G1. */
  private readonly g1SaddleIds = new Set<number>();
  /** saddle id -> its group_id, kept for UI grouping and for NOTHING in the math. */
  private readonly groupIdBySaddle = new Map<number, number>();
  private readonly rankRows: Array<{
    relation_rank: number;
    rank_value_min: number;
    rank_value_max: number;
  }> = [];
  private readonly charaNames = new Map<number, string>();
  private readonly saddleNames = new Map<number, string>();

  constructor(db: Database) {
    for (const r of db
      .prepare('SELECT relation_type, relation_point FROM succession_relation')
      .iterate() as Iterable<{ relation_type: number; relation_point: number }>) {
      this.relationPoints.set(r.relation_type, r.relation_point);
    }

    for (const r of db
      .prepare('SELECT relation_type, chara_id FROM succession_relation_member')
      .iterate() as Iterable<{ relation_type: number; chara_id: number }>) {
      let set = this.relationTypesByChara.get(r.chara_id);
      if (!set) {
        set = new Set<number>();
        this.relationTypesByChara.set(r.chara_id, set);
      }
      set.add(r.relation_type);
    }

    for (const r of db
      .prepare('SELECT id, chara_id FROM card_data')
      .iterate() as Iterable<{ id: number; chara_id: number }>) {
      this.charaIdByCardId.set(r.id, r.chara_id);
    }

    for (const r of db
      .prepare('SELECT id, group_id, win_saddle_type FROM single_mode_wins_saddle')
      .iterate() as Iterable<{
      id: number;
      group_id: number;
      win_saddle_type: number;
    }>) {
      this.groupIdBySaddle.set(r.id, r.group_id);
      // win_saddle_type 3 is a single G1. 0 is an epithet requiring a SET of G1
      // wins (Triple Crown and friends) and is not itself a race; 2 is G2 and
      // 1 is G3. Only 3 feeds bonus affinity.
      if (r.win_saddle_type === 3) this.g1SaddleIds.add(r.id);
    }

    this.rankRows = db
      .prepare(
        'SELECT relation_rank, rank_value_min, rank_value_max ' +
          'FROM succession_relation_rank ORDER BY rank_value_min',
      )
      .all() as typeof this.rankRows;

    // text_data's key column is literally named `index`, a SQL reserved word
    // that must be quoted in every query. category 6 is chara names.
    for (const r of db
      .prepare('SELECT "index" AS idx, text FROM text_data WHERE category = 6')
      .iterate() as Iterable<{ idx: number; text: string }>) {
      this.charaNames.set(r.idx, r.text);
    }
    // category 111 is win-saddle names. They are epithets ("Classic Triple
    // Crown"), not race names, so they read oddly next to a single G1 win.
    for (const r of db
      .prepare('SELECT "index" AS idx, text FROM text_data WHERE category = 111')
      .iterate() as Iterable<{ idx: number; text: string }>) {
      this.saddleNames.set(r.idx, r.text);
    }
  }

  /**
   * The ONE place card_id becomes chara_id.
   *
   * The roster and every ancestor carry card_id (101601); succession relations
   * key on chara_id (1016). `card_id / 100` holds for 103 of 105 cards and
   * fails on 9100101 -> 1001 and 9101101 -> 1011. hakuraku inlines the division
   * in at least three functions, which means fixing it means fixing it three
   * times and missing the third. Join, do not divide.
   *
   * Returns null for an unknown card so callers emit a resolution failure
   * rather than a bare 0.
   */
  charaIdFor(cardId: number): number | null {
    return this.charaIdByCardId.get(cardId) ?? null;
  }

  hasChara(charaId: number): boolean {
    return this.relationTypesByChara.has(charaId);
  }

  relationTypesOf(charaId: number): ReadonlySet<number> {
    return this.relationTypesByChara.get(charaId) ?? EMPTY;
  }

  relationPointOf(relationType: number): number {
    return this.relationPoints.get(relationType) ?? 0;
  }

  isG1(saddleId: number): boolean {
    return this.g1SaddleIds.has(saddleId);
  }

  knowsSaddle(saddleId: number): boolean {
    return this.groupIdBySaddle.has(saddleId);
  }

  groupIdOf(saddleId: number): number | null {
    return this.groupIdBySaddle.get(saddleId) ?? null;
  }

  charaName(charaId: number): string {
    return this.charaNames.get(charaId) ?? `chara ${charaId}`;
  }

  saddleName(saddleId: number): string {
    return this.saddleNames.get(saddleId) ?? `saddle ${saddleId}`;
  }

  /** The ◎/〇/△ bucket a pair total falls in. 151+ is ◎. */
  rankFor(pairTotal: number): {
    relation_rank: number;
    rank_value_min: number;
    rank_value_max: number;
  } {
    for (const row of this.rankRows) {
      if (pairTotal >= row.rank_value_min && pairTotal <= row.rank_value_max) {
        return row;
      }
    }
    // Above every bucket's max. Return the highest rather than inventing one.
    const highest = this.rankRows[this.rankRows.length - 1];
    if (!highest) throw new Error('succession_relation_rank is empty');
    return highest;
  }

  get charaCount(): number {
    return this.relationTypesByChara.size;
  }
}

const EMPTY: ReadonlySet<number> = new Set<number>();
