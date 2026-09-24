import type { AptitudeKey, CardAptitudes } from './aptitude.js';
import type { SkillTiming, SparkKind } from './spark-types.js';
import { SKILL_TIMING_BY_CATEGORY, SPARK_KIND_BY_FACTOR_TYPE } from './spark-types.js';

/** One succession_factor row, joined to its name. */
export interface Factor {
  factorId: number;
  groupId: number;
  /** succession_factor.rarity, the star count 1-3. Not a rarity tier. */
  stars: number;
  kind: SparkKind;
  name: string;
  /**
   * When the hinted skill fires, for a white SKILL spark.
   *
   * Null for every other kind, and for a skill whose category the game has
   * added since this extract was built -- a heading nobody can name is worse
   * than no heading.
   */
  timing: SkillTiming | null;
}

/**
 * Every read of master.mdb the affinity rules need, loaded once into memory.
 *
 * This is a plain class over a Database rather than a Nest provider so the
 * engine can be tested against the committed master extract with no NestJS
 * container and no 16 MB user file present.
 */
/**
 * The master rows this engine reads, as plain data.
 *
 * WHY THIS EXISTS RATHER THAN A DATABASE HANDLE. The constructor used to take a
 * `node:sqlite` DatabaseSync and run eleven queries. That tied the engine to
 * Node, and the engine now runs in the browser too: the M7 pair sweep is 33,411
 * lineages, measured at 0.045 ms each on a laptop against 0.154-0.279 on the
 * server, so it belongs on the machine the user already owns.
 *
 * Every query moved out to whoever has the data. The API runs them against the
 * committed SQL extract; the browser receives the same rows as JSON generated
 * from that same extract at build time, so the two cannot drift. What stayed
 * here is every loop body: the validation, the dedup and the reasons, which are
 * the parts worth keeping in one place.
 *
 * ORDER IS PART OF THE CONTRACT, and two fields depend on it. `cardData` must
 * ascend by id, because the first card seen for a character is taken as its base
 * costume. `careerRank` and `relationRank` must ascend by their lower bound,
 * because both are scanned for the first row a score falls into.
 */
export interface MasterTables {
  successionRelation: ReadonlyArray<{ relation_type: number; relation_point: number }>;
  successionRelationMember: ReadonlyArray<{ relation_type: number; chara_id: number }>;
  /**
   * Ascending by id. See above: the ordering is load-bearing. `default_rarity`
   * is 0 on exactly two rows, 9100101 and 9101101: placeholder cards with no
   * skill set that nobody can train. See `isPlayable`.
   */
  cardData: ReadonlyArray<{ id: number; chara_id: number; default_rarity: number }>;
  winsSaddle: ReadonlyArray<{ id: number; group_id: number; win_saddle_type: number }>;
  /** Ascending by min_value. */
  careerRank: ReadonlyArray<{ id: number; min_value: number; max_value: number }>;
  /** Ascending by rank_value_min. */
  relationRank: ReadonlyArray<{
    relation_rank: number;
    rank_value_min: number;
    rank_value_max: number;
  }>;
  /**
   * Every text_data row this engine reads, categories mixed. Four are used: 6 is
   * character names, 5 is the costume label alone, 111 is win-saddle epithets
   * and 147 is spark names, whose `index` IS the factor_id. The column is
   * literally named `index`, a SQL reserved word, which is why it arrives here
   * renamed.
   */
  textData: ReadonlyArray<{ category: number; idx: number; text: string }>;
  successionFactor: ReadonlyArray<{
    factor_id: number;
    factor_group_id: number;
    rarity: number;
    factor_type: number;
  }>;
  /**
   * Which skill a spark hints at: one row per factor group, `value_1` being the
   * skill id. The source table repeats each mapping once per hint level 1-5 and
   * the extract collapses that, so this is the mapping itself.
   */
  factorSkill: ReadonlyArray<{ factor_group_id: number; value_1: number }>;
  /**
   * Skills, projected to the two columns this engine reads.
   *
   * `skill_category` is the GAME'S OWN grouping by when a skill fires -- the
   * same headings the pre-race screen shows -- and `rarity` separates a plain
   * white skill from its gold form.
   */
  skillData: ReadonlyArray<{ id: number; skill_category: number; rarity: number }>;
  /**
   * Each card's ten aptitudes, 1-8 for G through S.
   *
   * One row per CARD: the source table repeats a card per rarity and the
   * aptitudes are identical across them, so the extract deduplicates. The
   * column names are the game's -- nige, senko, sashi and oikomi are the four
   * running styles, in the order Front Runner, Pace Chaser, Late Surger, End
   * Closer.
   */
  cardAptitudes: ReadonlyArray<{
    card_id: number;
    proper_distance_short: number;
    proper_distance_mile: number;
    proper_distance_middle: number;
    proper_distance_long: number;
    proper_running_style_nige: number;
    proper_running_style_senko: number;
    proper_running_style_sashi: number;
    proper_running_style_oikomi: number;
    proper_ground_turf: number;
    proper_ground_dirt: number;
  }>;
}

export class MasterData {
  /** relation_type -> relation_point. The number a shared relation is worth. */
  private readonly relationPoints = new Map<number, number>();
  /** chara_id -> the relation_types they belong to. */
  private readonly relationTypesByChara = new Map<number, Set<number>>();
  /** card_id -> chara_id. */
  private readonly charaIdByCardId = new Map<number, number>();
  /** chara_id -> its lowest card_id, i.e. the base costume. */
  private readonly baseCardByCharaId = new Map<number, number>();
  /** Playable cards (default_rarity > 0), ascending by id, as card_data delivers them. */
  private readonly playableCards: Array<{ cardId: number; charaId: number }> = [];
  /** chara_id -> every playable card_id it has, ascending. 35 of 68 characters have more than one. */
  private readonly cardsByCharaId = new Map<number, number[]>();
  /** card_id -> its bracketed costume label, e.g. "[Special Dreamer]". */
  private readonly costumeByCardId = new Map<number, string>();
  /** single_mode_wins_saddle ids whose win_saddle_type is 3, i.e. a single G1. */
  private readonly g1SaddleIds = new Set<number>();
  /** saddle id -> its group_id, kept for UI grouping and for NOTHING in the math. */
  private readonly groupIdBySaddle = new Map<number, number>();
  /** The 98 career rank tiers, ascending by score. */
  private readonly careerRankRows: Array<{
    id: number;
    min_value: number;
    max_value: number;
  }> = [];
  private readonly rankRows: Array<{
    relation_rank: number;
    rank_value_min: number;
    rank_value_max: number;
  }> = [];
  private readonly charaNames = new Map<number, string>();
  private readonly saddleNames = new Map<number, string>();
  /** factor_id -> the succession_factor row, joined to its category 147 name. */
  private readonly factors = new Map<number, Factor>();
  private readonly aptitudes = new Map<number, CardAptitudes>();

  constructor(tables: MasterTables) {
    for (const r of tables.successionRelation) {
      this.relationPoints.set(r.relation_type, r.relation_point);
    }

    for (const r of tables.successionRelationMember) {
      let set = this.relationTypesByChara.get(r.chara_id);
      if (!set) {
        set = new Set<number>();
        this.relationTypesByChara.set(r.chara_id, set);
      }
      set.add(r.relation_type);
    }

    for (const r of tables.cardData) {
      // Every card resolves to its character, placeholders included: the
      // content checks pin 9100101 -> 1001, and a lookup is never where a
      // placeholder should fail. But a placeholder is not a costume, so it
      // stays out of everything below -- counted, it made Grass Wonder and
      // Special Week each show one card twice in the trainee picker.
      this.charaIdByCardId.set(r.id, r.chara_id);
      if (!(r.default_rarity > 0)) continue;
      this.playableCards.push({ cardId: r.id, charaId: r.chara_id });
      // Ordered by id, so the first card seen for a chara is the lowest: the
      // base costume. Only the TRAINEE needs this, because the request carries
      // traineeCharaId and never a card. Every ancestor already arrives as a
      // card_id and must use it -- a card is a costume, and a costume carries
      // its own unique skill, which is the green spark.
      if (!this.baseCardByCharaId.has(r.chara_id)) {
        this.baseCardByCharaId.set(r.chara_id, r.id);
      }
      const cards = this.cardsByCharaId.get(r.chara_id);
      if (cards) cards.push(r.id);
      else this.cardsByCharaId.set(r.chara_id, [r.id]);
    }

    for (const r of tables.winsSaddle) {
      this.groupIdBySaddle.set(r.id, r.group_id);
      // win_saddle_type 3 is a single G1. 0 is an epithet requiring a SET of G1
      // wins (Triple Crown and friends) and is not itself a race; 2 is G2 and
      // 1 is G3. Only 3 feeds bonus affinity.
      if (r.win_saddle_type === 3) this.g1SaddleIds.add(r.id);
    }

    this.careerRankRows = [...tables.careerRank];

    this.rankRows = [...tables.relationRank];

    // ONE PASS OVER text_data, not four filters over the same array. The
    // categories were four separate WHERE clauses when this read SQL; the rows
    // now arrive together, and 1,775 of them is one cheap loop.
    //
    // category 6   chara names
    // category 5   the costume label ALONE ("[Special Dreamer]"), keyed by CARD
    //              id. Category 4 is the same label with the character name
    //              already appended, which would mean splitting a string to get
    //              either half back.
    // category 111 win-saddle names. Epithets ("Classic Triple Crown") rather
    //              than race names, so they read oddly next to a single G1 win.
    // category 147 spark names, whose `index` IS the factor_id, so the join is
    //              direct. Every one of the 663 factor ids a real roster
    //              surfaces has a row in both, verified 2026-09-15.
    const factorNames = new Map<number, string>();
    for (const r of tables.textData) {
      switch (r.category) {
        case 6:
          this.charaNames.set(r.idx, r.text);
          break;
        case 5:
          this.costumeByCardId.set(r.idx, r.text);
          break;
        case 111:
          this.saddleNames.set(r.idx, r.text);
          break;
        case 147:
          factorNames.set(r.idx, r.text);
          break;
        default:
          break;
      }
    }
    /*
     * Card -> its ten aptitudes, as grade indices 0-7 rather than the game's
     * 1-8. Zero-based because `APTITUDE_GRADES` is an array and an off-by-one
     * here would print the wrong letter with total confidence.
     */
    for (const r of tables.cardAptitudes ?? []) {
      this.aptitudes.set(r.card_id, {
        sprint: r.proper_distance_short - 1,
        mile: r.proper_distance_mile - 1,
        medium: r.proper_distance_middle - 1,
        long: r.proper_distance_long - 1,
        frontRunner: r.proper_running_style_nige - 1,
        paceChaser: r.proper_running_style_senko - 1,
        lateSurger: r.proper_running_style_sashi - 1,
        endCloser: r.proper_running_style_oikomi - 1,
        turf: r.proper_ground_turf - 1,
        dirt: r.proper_ground_dirt - 1,
      });
    }

    /*
     * Factor group -> when its skill fires.
     *
     * Two hops: `succession_factor_effect` says which skill a spark hints at,
     * and `skill_data.skill_category` says when that skill fires. Built once
     * here rather than joined per lookup, because the audit trail asks this
     * question for every spark in a lineage.
     */
    const categoryBySkill = new Map<number, number>();
    for (const r of tables.skillData) categoryBySkill.set(r.id, r.skill_category);
    const timingByGroup = new Map<number, SkillTiming>();
    for (const r of tables.factorSkill) {
      const category = categoryBySkill.get(r.value_1);
      if (category === undefined) continue;
      const timing = SKILL_TIMING_BY_CATEGORY[category];
      // Category 5 is the unique skills, which are the green spark and have
      // their own group. An unmapped category is a new one; see `Factor.timing`.
      if (timing !== undefined) timingByGroup.set(r.factor_group_id, timing);
    }

    for (const r of tables.successionFactor) {
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
        // WHITE SKILLS ONLY. A race spark grants a skill hint too -- February
        // S. hands over Winter Runner -- so the join finds a category for it,
        // but a race spark's own group is "the G1 you have to win" and moving
        // it under Passive because of the skill it happens to teach would put
        // it in a heading that says nothing about it.
        timing: kind === 'white_skill' ? (timingByGroup.get(r.factor_group_id) ?? null) : null,
      });
    }
  }

  /**
   * The ONE place card_id becomes chara_id.
   *
   * The roster and every ancestor carry card_id (101601); succession relations
   * key on chara_id (1016). `card_id / 100` holds for 105 of 107 cards and
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

  /**
   * Does master.mdb know this character AT ALL?
   *
   * Distinct from hasChara, which asks whether it has succession-relation rows.
   * Collapsing the two reported a chara_id the extract has never heard of as
   * `no_relation_rows`, which reaches the screen as "could not resolve no
   * relation rows 999999" -- a statement about relations for a character that
   * does not exist. The realistic trigger is a patch adding an uma before the
   * extract is rebuilt, and that is `unknown_chara`.
   */
  knowsChara(charaId: number): boolean {
    return this.charaNames.has(charaId) || this.baseCardByCharaId.has(charaId);
  }

  /**
   * The costume label for a card, but ONLY where it is load-bearing.
   *
   * Returns null for a character with a single card, where a tag would be noise
   * on every row. 72 of 105 cards belong to a character with more than one, and
   * for those the tag is the only thing separating two otherwise identical rows
   * that carry DIFFERENT unique skills, i.e. different green sparks.
   */
  costumeLabel(cardId: number): string | null {
    const charaId = this.charaIdByCardId.get(cardId);
    if (charaId === undefined) return null;
    if ((this.cardsByCharaId.get(charaId)?.length ?? 0) < 2) return null;
    return this.costumeByCardId.get(cardId) ?? null;
  }

  /** True when this character has more than one card, i.e. a bare name is ambiguous. */
  hasMultipleCards(charaId: number): boolean {
    return (this.cardsByCharaId.get(charaId)?.length ?? 0) > 1;
  }

  /** Every playable card, ascending by id. The trainee picker's whole source. */
  allCards(): Array<{ cardId: number; charaId: number }> {
    return this.playableCards.map((c) => ({ ...c })).sort((a, b) => a.cardId - b.cardId);
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

  /**
   * The career rank TIER for a rank_score, 1-98, or null if it falls outside
   * every band.
   *
   * Nothing on the wire carries this: the web app labels a rank from the score
   * directly, against the committed ladder in rank-ladder.ts. What this exists
   * for is the CROSS-CHECK that binds that ladder to data with a committed
   * source -- 92 of these 98 band minimums appear in it exactly, and
   * rank-ladder.test.ts pins which six do not.
   *
   * This is the TIER, not its label. master.mdb has no labels: the ladder
   * (A, SS, SS+, UG, UG2...) lives in the game client.
   */
  careerRankTier(rankScore: number): number | null {
    const row = this.careerRankRows.find(
      (r) => rankScore >= r.min_value && rankScore <= r.max_value,
    );
    return row?.id ?? null;
  }

  /** Null for a factor id master.mdb has never heard of, so callers can say so. */
  /**
   * One aptitude of one card, as a grade index 0-7, or null.
   *
   * Null for a card the extract has no row for, which is the honest answer: a
   * base grade nobody can name cannot be lifted by a number anybody can trust.
   */
  aptitude(cardId: number | null, key: AptitudeKey): number | null {
    if (cardId === null) return null;
    return this.aptitudes.get(cardId)?.[key] ?? null;
  }

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
