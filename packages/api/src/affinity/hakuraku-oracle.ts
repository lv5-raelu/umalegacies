/**
 * AN INDEPENDENT SECOND OPINION ON EVERY INDIVIDUAL AFFINITY.
 *
 * Transcribed from ayaliz/hakuraku's src/data/VeteransHelper.ts:
 * calculateGrandparentAffinity, calculateIndividualParentAffinity and the
 * helpers they call (calculateAffinity, calculatePairAffinity,
 * calculateRaceBonus, sumSharedRelationPoints, calculateSharedG1RaceAffinity).
 *
 *   MIT License. Copyright (c) 2021 SSHZ.ORG
 *   Full text: NOTICE.md at the repository root.
 *
 * WHY IT EXISTS. hakuraku is a separate implementation of the same game rules
 * whose displayed numbers the builder checked against the running game. Ours
 * and theirs share no code, so agreement across many lineages is evidence both
 * read the rules the same way, and a disagreement is a bug in one of them.
 *
 * WHY A DIFFERENTIAL CHECK AND NOT MORE GOLDEN VALUES. The golden fixtures hold
 * numbers read off hakuraku and breeding-optimizer once, in September. If a
 * game patch changed a relation's points, those frozen numbers would be wrong
 * and only a person re-reading the tools could fix them. This computes from
 * whatever game data is CURRENT, so a patch that moves the numbers moves both
 * sides together, and the check fails only when the two implementations
 * disagree. That is what lets it run unattended after every patch.
 *
 * WHAT AGREEMENT DOES NOT PROVE: that either matches the game. Two
 * implementations can share a misreading. The golden fixtures, whose values
 * were confirmed against the game's own rank icon, remain the anchor.
 *
 * INDEPENDENT OF OUR ENGINE ON PURPOSE. It reads raw table rows, not
 * `MasterData`, and joins card_id to chara_id itself. Sharing our lookups would
 * let one bug pass on both sides.
 *
 * Two deliberate differences from hakuraku, both recorded in NOTICE.md:
 *   - card_id -> chara_id joins card_data; hakuraku divides by 100, which is
 *     wrong for the two placeholder cards 9100101 and 9101101.
 *   - the G1 saddle set is win_saddle_type = 3; hakuraku derives it as "exactly
 *     one race instance, in the 100xxx range". Verified 2026-09-10 to select
 *     the identical 47 saddles.
 *
 * Previously inline in scripts/check-roster.mjs, where it could only run on the
 * builder's machine because that script reads data.json. Here it runs in CI.
 */

/** One ancestor: the two public game fields affinity reads. */
export interface OracleAncestor {
  cardId: number;
  winSaddleIds: readonly number[];
}

/** A parent, with its own parents -- the grandparents beneath it. */
export interface OracleParent extends OracleAncestor {
  parents: readonly [OracleAncestor | null, OracleAncestor | null];
}

/** The raw rows the oracle needs, straight from the tables. */
export interface OracleTables {
  succession_relation: ReadonlyArray<{ relation_type: number; relation_point: number }>;
  succession_relation_member: ReadonlyArray<{ relation_type: number; chara_id: number }>;
  single_mode_wins_saddle: ReadonlyArray<{ id: number; win_saddle_type: number }>;
  card_data: ReadonlyArray<{ id: number; chara_id: number }>;
}

/** Each shared G1 win is worth this much. hakuraku's G1_RACE_AFFINITY_VALUE. */
const G1_RACE_AFFINITY_VALUE = 3;

export class HakurakuOracle {
  private readonly relationPoints = new Map<number, number>();
  private readonly charaRelationTypes = new Map<number, Set<number>>();
  private readonly g1Saddles = new Set<number>();
  private readonly charaByCard = new Map<number, number>();

  constructor(tables: OracleTables) {
    for (const r of tables.succession_relation) this.relationPoints.set(r.relation_type, r.relation_point);
    for (const r of tables.succession_relation_member) {
      let set = this.charaRelationTypes.get(r.chara_id);
      if (!set) this.charaRelationTypes.set(r.chara_id, (set = new Set()));
      set.add(r.relation_type);
    }
    for (const r of tables.single_mode_wins_saddle) if (r.win_saddle_type === 3) this.g1Saddles.add(r.id);
    for (const r of tables.card_data) this.charaByCard.set(r.id, r.chara_id);
  }

  private chara(cardId: number): number | null {
    return this.charaByCard.get(cardId) ?? null;
  }

  private relations(charaId: number | null): Set<number> {
    return (charaId !== null && this.charaRelationTypes.get(charaId)) || new Set();
  }

  /** hakuraku's sumSharedRelationPoints. */
  private sumShared(a: Set<number>, b: Set<number>, c?: Set<number>): number {
    let total = 0;
    for (const rt of a) {
      if (b.has(rt) && (c === undefined || c.has(rt))) total += this.relationPoints.get(rt) ?? 0;
    }
    return total;
  }

  /** hakuraku's calculateSharedG1RaceAffinity. */
  private sharedG1(a: readonly number[], b: readonly number[]): number {
    const other = new Set(b);
    let shared = 0;
    for (const id of new Set(a)) if (this.g1Saddles.has(id) && other.has(id)) shared++;
    return shared * G1_RACE_AFFINITY_VALUE;
  }

  /**
   * A grandparent's relations, or nothing when it IS the trainee. The
   * self-link: its base term vanishes while its race bonus survives.
   */
  private grandparentRelations(gp: OracleAncestor | null, traineeCharaId: number): Set<number> {
    const charaId = gp ? this.chara(gp.cardId) : null;
    return charaId !== null && charaId !== traineeCharaId ? this.relations(charaId) : new Set();
  }

  /** hakuraku's calculateGrandparentAffinity. */
  grandparentAffinity(
    gp: OracleAncestor | null,
    parent: OracleAncestor,
    traineeCharaId: number,
  ): number {
    if (!gp) return 0;
    const treeBase = this.sumShared(
      this.relations(traineeCharaId),
      this.relations(this.chara(parent.cardId)),
      this.grandparentRelations(gp, traineeCharaId),
    );
    return treeBase + this.sharedG1(parent.winSaddleIds, gp.winSaddleIds);
  }

  /** hakuraku's calculateRaceBonus(...).total: the parent's G1s its parents also won. */
  private raceBonus(parent: OracleParent): number {
    const [gp1, gp2] = parent.parents;
    const gp1Races = new Set(gp1?.winSaddleIds ?? []);
    const gp2Races = new Set(gp2?.winSaddleIds ?? []);
    let total = 0;
    // Not deduplicated: hakuraku maps over the raw array, so a repeated win
    // would count twice there too. The save never repeats one.
    for (const id of parent.winSaddleIds) {
      if (!this.g1Saddles.has(id)) continue;
      total += ((gp1Races.has(id) ? 1 : 0) + (gp2Races.has(id) ? 1 : 0)) * G1_RACE_AFFINITY_VALUE;
    }
    return total;
  }

  /** hakuraku's calculateAffinity: a parent against the trainee, through its own parents. */
  private affinity(parent: OracleParent, traineeCharaId: number): number {
    const target = this.relations(traineeCharaId);
    const own = this.relations(this.chara(parent.cardId));
    const [gp1, gp2] = parent.parents;
    return (
      this.sumShared(target, own) +
      this.sumShared(target, own, this.grandparentRelations(gp1, traineeCharaId)) +
      this.sumShared(target, own, this.grandparentRelations(gp2, traineeCharaId)) +
      this.raceBonus(parent)
    );
  }

  /** hakuraku's calculatePairAffinity: the two parents against each other. */
  private pairAffinity(a: OracleAncestor, b: OracleAncestor): number {
    return (
      this.sumShared(this.relations(this.chara(a.cardId)), this.relations(this.chara(b.cardId))) +
      this.sharedG1(a.winSaddleIds, b.winSaddleIds)
    );
  }

  /** hakuraku's calculateIndividualParentAffinity. */
  parentAffinity(parent: OracleParent, otherParent: OracleParent, traineeCharaId: number): number {
    return this.affinity(parent, traineeCharaId) + this.pairAffinity(parent, otherParent);
  }

  /**
   * All six Individual Affinities for one lineage, keyed by position: parents
   * at 10 and 20, the grandparents beneath them at 11, 12 and 21, 22.
   */
  individualAffinities(
    traineeCharaId: number,
    a: OracleParent,
    b: OracleParent,
  ): Record<10 | 11 | 12 | 20 | 21 | 22, number> {
    return {
      10: this.parentAffinity(a, b, traineeCharaId),
      11: this.grandparentAffinity(a.parents[0], a, traineeCharaId),
      12: this.grandparentAffinity(a.parents[1], a, traineeCharaId),
      20: this.parentAffinity(b, a, traineeCharaId),
      21: this.grandparentAffinity(b.parents[0], b, traineeCharaId),
      22: this.grandparentAffinity(b.parents[1], b, traineeCharaId),
    };
  }
}
