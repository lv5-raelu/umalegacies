import type { AncestorRef, VeteranPackage } from '@umalegacies/types';

/**
 * ONE uma.moe INHERITANCE RECORD IS ONE `VeteranPackage`, AND THAT IS THE WHOLE
 * INTEGRATION.
 *
 * A borrowable veteran on uma.moe arrives as a complete three-generation
 * package: the uma itself and its two parents, each with its own card id, its
 * own win saddles and its own sparks. That is exactly the shape
 * `packages/core` already composes a pair out of -- `self` plus two parents,
 * six ancestors across a pair -- so nothing about the engine changes. The
 * borrow release adds a SOURCE, not a second code path.
 *
 * THE LIVE RECORD IS RICHER THAN THE PUBLISHED SPEC, and the difference is what
 * makes this possible. `/api/docs/openapi.yaml` documents `Inheritance` with
 * four flat spark arrays and three ids. The live response also carries the
 * per-slot decomposition -- `main_*`, `left_*`, `right_*` for every spark kind,
 * plus a win-saddle array per slot -- without which a record would be a bag of
 * sparks with no way to say WHICH uma holds them, and affinity is entirely
 * about which uma holds what. Typed against the live shape, therefore, with the
 * spec-only fields marked.
 *
 * THE THREE SLOTS, NAMED THE WAY THEY ACTUALLY WORK, and measured rather than
 * assumed. A green spark IS a card's own unique skill, so a slot's green group
 * id has to equal that slot's card id. Across 500 live records, 1,487 of the
 * 1,500 slots carried a resolvable green and every one of them lined up:
 *
 *   green group == that slot's own card id     1487/1487
 *   matched a DIFFERENT slot's card id               0
 *
 * So `main_` is the veteran you would borrow and `left_`/`right_` are its
 * parents. That is the reading the field names suggest, but not the only one
 * they allow -- `main_parent_id` could as easily have meant "this record's
 * main parent" -- and getting it backwards would seat a grandparent as a
 * parent and return a confident wrong number, with the parent/grandparent
 * affinity gap (median IA 138 against 36) making it a large one.
 *
 * WHAT IS DELIBERATELY DROPPED. `account_id`, `trainer_name` and
 * `follower_num` identify a PERSON, and none of them is an input to any number
 * this tool computes. They stop at this boundary: nothing downstream of
 * `packageFromRecord` can leak what it never received, which is the same
 * parse-and-discard reasoning the save upload already runs on. `affinity_score`
 * is dropped for a different reason -- it is uma.moe's own figure for their own
 * chosen trainee, and this project's entire claim is that the number it ranks
 * by is the number it can show the derivation of.
 */

/** The `inheritance` block of a live `/api/v3/search` record. */
export interface UmaMoeInheritance {
  /** uma.moe's own row id. Read only to deduplicate; see `recordKey`. */
  inheritance_id?: number;
  /** The veteran itself: card id, not chara id. */
  main_parent_id: number;
  /** Its two parents, which become the grandparents of any pair it joins. */
  parent_left_id: number;
  parent_right_id: number;

  /*
   * ONE FACTOR ID PER SLOT for the three named kinds, an ARRAY for whites.
   *
   * Singular despite the plural names, and the plural is what misleads: the
   * spec calls `min_main_blue_factors` a "count", so `main_blue_factors` reads
   * as a count too. It is not. A live record carries `main_blue_factors: 203`,
   * which is Stamina at 3 stars -- a `succession_factor.factor_id`, the same id
   * space the save's own sparks arrive in. Every uma has exactly one blue, one
   * pink and one green, so one id per slot is all there is to carry.
   */
  main_blue_factors: number;
  main_pink_factors: number;
  main_green_factors: number;
  main_white_factors: number[];
  left_blue_factors: number;
  left_pink_factors: number;
  left_green_factors: number;
  left_white_factors: number[];
  right_blue_factors: number;
  right_pink_factors: number;
  right_green_factors: number;
  right_white_factors: number[];

  /**
   * G1 wins per slot, as `single_mode_wins_saddle.id`.
   *
   * MATCHED ON THESE RAW IDS, never normalised to `group_id`: the same race at
   * a different racecourse is a different win. `AncestorRef` carries the same
   * warning and for the same reason.
   */
  main_win_saddles: number[];
  left_win_saddles: number[];
  right_win_saddles: number[];

  /*
   * THE LINEAGE TOTALS, WHICH ARE WHAT THEIR FILTERS MATCH ON.
   *
   * `blue_sparks` and friends are NOT a slot's sparks and not a union either:
   * each entry is `groupId * 100 + (stars summed over the three slots)`. A
   * record whose three umas each carry Stamina 3 reports `blue_sparks: [209]`,
   * one entry at nine stars, and `blue_stars_sum: 9`.
   *
   * VERIFIED, 500 live records, 4 kinds each: rebuilding these arrays from the
   * per-slot factor ids above reproduced them exactly, 500/500, and so did all
   * four `*_stars_sum` figures. That is what licenses the filter translation,
   * which has to speak in these summed ids rather than in ours.
   *
   * Not read by the adapter -- the per-slot fields carry strictly more -- but
   * typed, because they are the only fields a filter can be checked against.
   */
  blue_sparks: number[];
  pink_sparks: number[];
  green_sparks: number[];
  white_sparks: number[];
  blue_stars_sum: number;
  pink_stars_sum: number;
  green_stars_sum: number;
  white_stars_sum: number;

  /** Their own affinity figure, for their own chosen trainee. Never used here. */
  affinity_score?: number | null;
}

/** One `/api/v3/search` item. The fields that name a person are not modelled. */
export interface UmaMoeRecord {
  inheritance?: UmaMoeInheritance | null;
}

/**
 * uma.moe's own row id for a record, used for one thing: not listing the same
 * borrowable veteran twice.
 *
 * Their paging is documented as stably ordered and was measured to be, so a
 * duplicate across two pages should not arise -- and "should not" is exactly
 * how a ranked list ends up with the same row at 4 and at 71. It identifies a
 * RECORD rather than a person, and like every other field here it stops at
 * this boundary: the client is handed a `VeteranPackage`, which carries card
 * ids, win saddles and spark ids and nothing else.
 */
export const recordKey = (record: UmaMoeRecord): number | null =>
  record.inheritance?.inheritance_id ?? null;

/** One `/api/v3/search` response. */
export interface UmaMoeSearchResponse {
  items?: UmaMoeRecord[] | null;
  /** A numeric string, or the literal `"over 10000"` display cap. */
  total?: string;
  page?: number;
  limit?: number;
  total_pages?: number;
}

/**
 * The three slots, in the order `VeteranPackage` wants them.
 *
 * `left` becomes grandparent slot 11 and `right` slot 12 (or 21 and 22 on the
 * B side). WHICH WAY ROUND DOES NOT CHANGE A NUMBER -- two grandparents under
 * the same parent are symmetric in every affinity link -- but it must be
 * STABLE, or the same borrowed veteran would draw its tree differently between
 * two searches.
 */
const SLOTS = ['main', 'left', 'right'] as const;

const CARD_ID_FIELD = {
  main: 'main_parent_id',
  left: 'parent_left_id',
  right: 'parent_right_id',
} as const;

/** One slot's sparks, named kinds first, exactly as a save-sourced ref carries them. */
function factorIdsOf(inheritance: UmaMoeInheritance, slot: (typeof SLOTS)[number]): number[] {
  const singles = [
    inheritance[`${slot}_blue_factors`],
    inheritance[`${slot}_pink_factors`],
    inheritance[`${slot}_green_factors`],
  ];
  return [...singles, ...(inheritance[`${slot}_white_factors`] ?? [])].filter(
    // A slot with no blue reports 0, not null. Zero is not a factor id, and
    // `MasterData.factor` would report it as unknown and surface it to the
    // reader as "a spark your extract does not know", which is a different and
    // alarming claim.
    (id): id is number => typeof id === 'number' && id > 0,
  );
}

function refFor(inheritance: UmaMoeInheritance, slot: (typeof SLOTS)[number]): AncestorRef {
  return {
    cardId: inheritance[CARD_ID_FIELD[slot]],
    winSaddleIds: [...(inheritance[`${slot}_win_saddles`] ?? [])],
    factorIds: factorIdsOf(inheritance, slot),
  };
}

/**
 * One borrowable veteran, in the shape the engine already composes pairs from.
 *
 * @returns null when the record cannot be a package at all -- no `inheritance`
 *   block, or a veteran with no card id. A ROW-LEVEL failure, never a
 *   request-level one: one malformed record out of a page of a hundred must not
 *   cost the reader the other ninety-nine, which is the same rule
 *   `ResolvedVeteran.ok` follows for the save.
 *
 *   A MISSING PARENT IS NOT A FAILURE. `parents` is
 *   `[AncestorRef | null, AncestorRef | null]` precisely because a veteran can
 *   have fewer than two known parents, and the engine already renders an empty
 *   slot for one. A record reporting `parent_left_id: 0` yields null there and
 *   scores as the three-uma lineage it actually is.
 */
export function packageFromRecord(record: UmaMoeRecord | null | undefined): VeteranPackage | null {
  const inheritance = record?.inheritance;
  if (!inheritance) return null;
  if (!(inheritance.main_parent_id > 0)) return null;

  const parent = (slot: 'left' | 'right'): AncestorRef | null =>
    inheritance[CARD_ID_FIELD[slot]] > 0 ? refFor(inheritance, slot) : null;

  return {
    self: refFor(inheritance, 'main'),
    parents: [parent('left'), parent('right')],
  };
}
