import type { Database } from 'better-sqlite3';
import type { SparkKind } from '../sparks/spark-types';
import { SPARK_KIND_BY_FACTOR_TYPE } from '../sparks/spark-types';

/** One succession_factor row, joined to its name. */
export interface Factor {
  factorId: number;
  groupId: number;
  /** succession_factor.rarity, the star count 1-3. Not a rarity tier. */
  stars: number;
  kind: SparkKind;
  name: string;
}

/**
 * Every read of master.mdb the affinity rules need, loaded once into memory.
 *
 * This is a plain class over a Database rather than a Nest provider so the
 * engine can be tested against the committed master extract with no NestJS
 * container and no 16 MB user file present.
 */
export class MasterData {
  /** relation_type -> relation_point. The number a shared relation is worth. */
  private readonly relationPoints = new Map<number, number>();
  /** chara_id -> the relation_types they belong to. */
  private readonly relationTypesByChara = new Map<number, Set<number>>();
  /** card_id -> chara_id. */
  private readonly charaIdByCardId = new Map<number, number>();
  /** chara_id -> its lowest card_id, i.e. the base costume. */
  private readonly baseCardByCharaId = new Map<number, number>();
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
  /** factor_id -> the succession_factor row, joined to its category 147 name. */
  private readonly factors = new Map<number, Factor>();

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
      .prepare('SELECT id, chara_id FROM card_data ORDER BY id')
      .iterate() as Iterable<{ id: number; chara_id: number }>) {
      this.charaIdByCardId.set(r.id, r.chara_id);
      // Ordered by id, so the first card seen for a chara is the lowest: the
      // base costume. Only the TRAINEE needs this, because the request carries
      // traineeCharaId and never a card. Every ancestor already arrives as a
      // card_id and must use it -- a card is a costume, and a costume carries
      // its own unique skill, which is the green spark.
      if (!this.baseCardByCharaId.has(r.chara_id)) {
        this.baseCardByCharaId.set(r.chara_id, r.id);
      }
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

    // Sparks. category 147 is the spark name and its `index` IS the factor_id,
    // so the join is direct. Every one of the 663 factor ids a real roster
    // surfaces has a row in both, verified 2026-09-15.
    const factorNames = new Map<number, string>();
    for (const r of db
      .prepare('SELECT "index" AS idx, text FROM text_data WHERE category = 147')
      .iterate() as Iterable<{ idx: number; text: string }>) {
      factorNames.set(r.idx, r.text);
    }
    for (const r of db
      .prepare(
        'SELECT factor_id, factor_group_id, rarity, factor_type FROM succession_factor',
      )
      .iterate() as Iterable<{
      factor_id: number;
      factor_group_id: number;
      rarity: number;
      factor_type: number;
    }>) {
      const kind = SPARK_KIND_BY_FACTOR_TYPE[r.factor_type];
      // An unknown factor_type is a new game mechanic, not a spark this tool
      // knows: the live extract already carries type 7 ("Carnival Bonus"). An
      // out-of-range rarity is the same class of problem, and it is the more
      // dangerous one, because BASE_RATES is indexed by `rarity - 1` and an
      // out-of-range index yields a real-looking spark with a silent 0% rate.
      // Drop both rather than serve a number this build cannot stand behind.
      if (!kind) continue;
      if (!Number.isInteger(r.rarity) || r.rarity < 1 || r.rarity > 3) continue;
      this.factors.set(r.factor_id, {
        factorId: r.factor_id,
        // The 1/2/3-star variants of one spark are three factor_ids sharing a
        // factor_group_id. Summarising per group is what makes "6 stars of
        // Medium across the lineage" a sentence rather than three rows.
        groupId: r.factor_group_id,
        stars: r.rarity,
        kind,
        name: factorNames.get(r.factor_id) ?? `factor ${r.factor_id}`,
      });
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

  /**
   * The base costume's card for a character, or null if the character has none.
   *
   * ONLY for the trainee, whose costume the request does not carry. The trainee
   * shows no sparks, so the approximation is invisible in every number; it is
   * only a face. An ancestor must never come through here -- it has a real
   * card_id and its costume decides its green spark.
   */
  baseCardFor(charaId: number): number | null {
    return this.baseCardByCharaId.get(charaId) ?? null;
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

  /** Null for a factor id master.mdb has never heard of, so callers can say so. */
  factor(factorId: number): Factor | null {
    return this.factors.get(factorId) ?? null;
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
}

const EMPTY: ReadonlySet<number> = new Set<number>();
