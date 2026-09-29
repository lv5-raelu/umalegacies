import type { UmaMoeInheritance } from './record.js';

/**
 * ONE REAL uma.moe RECORD, WITH EVERY TRACE OF THE PERSON REMOVED.
 *
 * Captured from `/api/v3/search` on 2026-09-29 and kept because an invented
 * record would only ever test the adapter against what its author already
 * believed. This one caught the thing an invented one would not have: a
 * lineage carrying TWO different blue types, so `blue_sparks` is
 * `[305, 503]` rather than one summed entry. An adapter that assumed one blue
 * per lineage would pass every hand-written fixture and drop half the blues
 * here.
 *
 * WHAT WAS STRIPPED, and why the list is short. `account_id`, `trainer_name`,
 * `follower_num`, `borrow_view_count`, `borrow_copy_count`, `last_updated`,
 * `inheritance_id`, `support_card`, `race_results` and `affinity_score` are
 * gone. The first six identify or describe a PERSON who never used this tool
 * and cannot consent to being in its repository -- the same reasoning that put
 * `data.json` behind a `.vercelignore` allowlist and made the save
 * parse-and-discard. What remains is card ids, race wins and spark ids: the
 * game's own data, the same three things this project already sends over the
 * wire to resolve a name.
 *
 * The numbers are otherwise UNTOUCHED, which is the point. `blue_stars_sum: 8`
 * and the summed `blue_sparks` above are this record's real figures, so a test
 * that rebuilds them from the per-slot factor ids is checking our reading of
 * their encoding against their own arithmetic rather than against ours.
 */
export const BORROWED_RECORD: UmaMoeInheritance = {
  main_parent_id: 105101,
  parent_left_id: 100501,
  parent_right_id: 101001,
  main_blue_factors: 303,
  main_pink_factors: 3103,
  main_green_factors: 10510102,
  main_white_factors: [
    1000202, 1001801, 2003601, 2004601, 2004901, 2005802, 2006501,
  ],
  left_blue_factors: 302,
  left_pink_factors: 3301,
  left_green_factors: 10050101,
  left_white_factors: [
    1000201, 1000402, 1000902, 1001301, 2001502, 2009701, 2010702, 2015302,
  ],
  right_blue_factors: 503,
  right_pink_factors: 1102,
  right_green_factors: 10100103,
  right_white_factors: [
    1001302, 1001701, 1001802, 2002301, 2004902, 2009902, 2010002, 2013102,
    2013402, 2015302, 2100602,
  ],
  main_win_saddles: [
    3, 7, 8, 11, 14, 15, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 34, 35, 47, 53,
    60, 65, 80, 83, 84, 93, 94, 114, 115, 125, 128, 132, 140,
  ],
  left_win_saddles: [
    3, 7, 8, 11, 14, 15, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 34, 35, 40, 42,
    43, 47, 49, 64, 82, 92, 114, 122, 124, 126, 128, 130, 132, 138,
  ],
  right_win_saddles: [
    3, 7, 8, 9, 11, 14, 15, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32,
    34, 35, 36, 42, 47, 49, 60, 64, 82, 93, 100, 122, 125, 126, 130, 132, 137,
  ],
  blue_sparks: [305, 503],
  pink_sparks: [3103, 3301, 1102],
  green_sparks: [10510102, 10050101, 10100103],
  white_sparks: [
    1000203, 1001803, 2003601, 2004601, 2004903, 2005802, 2006501, 1000402,
    1000902, 1001303, 2001502, 2009701, 2010702, 2015304, 1001701, 2002301,
    2009902, 2010002, 2013102, 2013402, 2100602,
  ],
  blue_stars_sum: 8,
  pink_stars_sum: 6,
  green_stars_sum: 6,
  white_stars_sum: 42,
};
