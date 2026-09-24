/**
 * Regenerates packages/api/data/master-extract.sql from the game's master.mdb.
 *
 *   npm run build:master --workspace @umalegacies/api
 *
 * WHY AN EXTRACT AND NOT master.mdb ITSELF
 *
 * The app reads 6 of master.mdb's 416 tables, and 291 of text_data's 54,234
 * rows. The extract is 158x smaller than the 16 MB original.
 *
 * It is SQL TEXT rather than a .mdb file on purpose. Measured on this data:
 * text is 314 KB and git stores it in ~31 KB; the equivalent binary is 104 KB
 * and git stores it in ~42 KB. Text is both smaller in history AND diffable,
 * so a game patch produces a reviewable line-by-line change instead of an
 * opaque blob. SQLite reorganises pages on write, so binary versions delta
 * badly: only 24% of bytes matched at the same offset between two consecutive
 * extractions of the real file.
 *
 * RUN THIS AFTER EVERY GAME UPDATE, then re-run the fixture build and the
 * tests. If an affinity rule's inputs moved, the golden boot check fails loudly
 * rather than quietly serving different numbers.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const masterPath = process.env.MASTER_DB_PATH ?? resolve(repoRoot, 'master.mdb');
const outPath = resolve(here, '../data/master-extract.sql');

if (!existsSync(masterPath)) {
  console.error(
    `missing ${masterPath}\n` +
      `Extract master.mdb from your game install (Steam local files) and put it ` +
      `at the repository root, or set MASTER_DB_PATH.`,
  );
  process.exit(1);
}

/**
 * Every table the app reads, with the rows it needs.
 *
 * GROWING THIS LIST is a one-line change plus a regeneration. M5 (spark odds)
 * will want succession_factor, whose `rarity` column is the star count.
 * text_data is filtered because it holds every string in the game: only the
 * four categories named on the entry below are read.
 */
const TABLES = [
  { name: 'succession_relation', where: null },
  { name: 'succession_relation_member', where: null },
  { name: 'succession_relation_rank', where: null },
  { name: 'single_mode_wins_saddle', where: null },
  { name: 'card_data', where: null },
  // The 98 career rank tiers, as rank_score ranges. The save carries a `rank`
  // field and it agrees with this table on all 259 veterans in the builder's
  // roster, so the tier is DERIVED from the score here rather than trusted from
  // the upload -- one less save field on the wire, and it can be checked.
  // The LABELS (A, SS, SS+, UG, UG2...) are not in master.mdb at all; they live
  // in the game client. See rank-labels.ts.
  { name: 'single_mode_rank', where: null },
  // Sparks. factor_type is the colour (1 blue, 2 pink, 3 green, 4/5/6 white
  // skill/race/scenario) and rarity is the star count 1-3, NOT a rarity tier.
  { name: 'succession_factor', where: null },
  // Per-character metadata: birth date, physical attributes, and each uma's
  // brand colours. Nothing reads it yet -- the tree uses portraits, not colours,
  // and relation labelling was dropped -- but it is 7 KB and the roster screens
  // in M3 are the likely first consumer.
  { name: 'chara_data', where: null },
  // 5 costume labels, 6 chara names, 111 win-saddle epithets, 147 spark names.
  // 147 names 100% of the 663 factor ids a real roster surfaces;
  // succession_factor without it is star counts with nothing to call them.
  // Category 5 is keyed by CARD id and holds the bracketed costume alone
  // ("[Special Dreamer]"); category 4 is the same label with the character
  // name already appended, which would force splitting a string to get either
  // half back. All 107 cards have a row in 5, and 74 of them belong to a
  // character with more than one card, so without this the trainee picker
  // lists "Oguri Cap" three times identically.
  // Category 172 holds spark DESCRIPTIONS ("A Spark that increases Guts and max
  // Guts value."). Left out deliberately: 10.7 KB in git and nothing reads it.
  // Add it to this list when a tooltip actually needs it.
  { name: 'text_data', where: 'WHERE category IN (5, 6, 111, 147)' },
  // WHICH SKILL A SPARK HINTS AT. `value_1` is the skill id and `value_2` the
  // hint level 1-5, so one factor group has five rows saying the same thing
  // about the same skill; `distinct` collapses them to the mapping itself.
  // target_type 41 is the skill-hint effect -- the only one this app reads.
  {
    name: 'succession_factor_effect',
    columns: ['factor_group_id', 'value_1'],
    where: 'WHERE target_type = 41',
    distinct: true,
  },
  // THE GAME'S OWN GROUPING OF SKILLS BY WHEN THEY FIRE. `skill_category` is
  // 0 passive, 1 early-race, 2 mid-race, 3 late-race, 4 anytime, 5 unique --
  // the same five headings the pre-race screen shows, verified against it.
  //
  // PROJECTED, because the real table is 78 columns of race-simulation
  // parameters and 726 rows: dumping it whole would roughly double the extract
  // to carry two integers per skill. `rarity` rides along because it is the
  // one other column this app has a use for (1 white, 2 gold, 3-5 unique and
  // evolved), and it is free once the row is being written.
  { name: 'skill_data', columns: ['id', 'skill_category', 'rarity'] },
  // EACH CARD'S TEN APTITUDES, which decide what the career-start pink grant
  // is worth: raising Oguri Cap's End Closer from D takes 7 stars, and from C
  // it would take 4. The columns are the game's own names -- nige/senko/
  // sashi/oikomi are the four running styles -- and the values are 1-8 for
  // G through S.
  //
  // PROJECTED AND DEDUPLICATED. The table has one row per card per rarity, 340
  // in all, and the aptitudes are identical across a card's rarities: 105 cards
  // give exactly 105 distinct rows, checked. Carrying the stat-growth columns
  // beside them would be 17 more per row for nothing that is read.
  {
    name: 'card_rarity_data',
    columns: [
      'card_id',
      'proper_distance_short',
      'proper_distance_mile',
      'proper_distance_middle',
      'proper_distance_long',
      'proper_running_style_nige',
      'proper_running_style_senko',
      'proper_running_style_sashi',
      'proper_running_style_oikomi',
      'proper_ground_turf',
      'proper_ground_dirt',
    ],
    distinct: true,
  },
];

const db = new DatabaseSync(masterPath, { readOnly: true });
const sourceHash = createHash('sha256').update(readFileSync(masterPath)).digest('hex');

const literal = (v) => {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const body = [];
const counts = [];
for (const { name, where, columns, distinct } of TABLES) {
  const ddl = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  if (!ddl) {
    console.error(`master.mdb has no table '${name}'`);
    process.exit(1);
  }
  /*
   * A PROJECTED TABLE GETS A DDL OF ITS OWN, written from the columns asked
   * for rather than copied from master.mdb. Copying the original would declare
   * 78 NOT NULL columns and then insert two values into them, which fails on
   * load -- loudly, but only after someone has regenerated and committed.
   *
   * Types are read back from the source DDL so a projection cannot quietly
   * change one. No primary key is carried over: a projection may drop the
   * column it was declared on, and nothing here queries by key.
   */
  let create = `${ddl.sql.replace('IF NOT EXISTS ', '')};`;
  if (columns) {
    const typeOf = (col) => {
      const m = create.match(new RegExp(`'${col}'\\s+([A-Z]+)`));
      if (!m) {
        console.error(`${name}.${col} not found in master.mdb's schema`);
        process.exit(1);
      }
      return m[1];
    };
    create = `CREATE TABLE '${name}' (${columns.map((c) => `'${c}' ${typeOf(c)} NOT NULL`).join(', ')});`;
  }
  // Drop IF NOT EXISTS so a duplicated load fails loudly instead of silently
  // merging two extractions.
  body.push('', `-- ${name}`, create);
  const picked = columns ? columns.map((c) => `"${c}"`).join(', ') : '*';
  const rows = db
    .prepare(`SELECT ${distinct ? 'DISTINCT ' : ''}${picked} FROM ${name} ${where ?? ''}`)
    .all();
  counts.push(`${name}: ${rows.length.toLocaleString()}`);
  for (const row of rows) {
    body.push(`INSERT INTO ${name} VALUES (${Object.values(row).map(literal).join(',')});`);
  }
}

const header = [
  '-- GENERATED by scripts/build-master-extract.mjs. Do not edit by hand.',
  '--',
  "-- The rows of the game's master.mdb that this app reads: 12 of its 416",
  '-- tables, and 291 of text_data\'s 54,234 rows. Public game data, extracted',
  '-- from the Steam build\'s local files.',
  '--',
  '-- REGENERATE AFTER EVERY GAME UPDATE:',
  '--   npm run build:master   --workspace @umalegacies/api',
  '--   npm run build:fixtures --workspace @umalegacies/api',
  '--   npm test',
  '--',
  `-- source master.mdb sha256: ${sourceHash}`,
  `-- extracted: ${new Date().toISOString().slice(0, 10)}`,
  `-- rows: ${counts.join(', ')}`,
];

const sql = header.join('\n') + '\n' + body.join('\n') + '\n';
writeFileSync(outPath, sql);

const bytes = Buffer.byteLength(sql);
console.log(
  `wrote data/master-extract.sql: ${(bytes / 1024).toFixed(0)} KB, ` +
    `${sql.split('\n').length.toLocaleString()} lines\n  ${counts.join('\n  ')}\n` +
    `  source master.mdb ${sourceHash.slice(0, 12)}`,
);
