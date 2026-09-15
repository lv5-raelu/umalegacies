/**
 * Fills the portrait cache from gametora.
 *
 *   node scripts/fetch-portraits.mjs [--force] [--concurrency N]
 *
 * Writes packages/api/data/portraits/<chara_id>.png, which is GITIGNORED and
 * deliberately so. The images are Cygames' character art; gametora rehosts them
 * and cannot grant redistribution rights it does not hold. Committing them would
 * put third-party artwork in git history permanently and serve it publicly the
 * moment the app is hosted. Caching them on the machine that runs the app is a
 * different act, and it is the one this project chose (2026-09-15).
 *
 * So this is a cache warmer, not a build step. Nothing depends on it: a clean
 * clone runs fine and every node shows initials, which is the designed
 * missing-image state rather than a broken one.
 *
 * Reads card_data from the committed extract, so it needs neither master.mdb
 * nor data.json.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const extractPath = resolve(packageRoot, 'data/master-extract.sql');
const outDir = resolve(packageRoot, 'data/portraits');

const args = process.argv.slice(2);
const force = args.includes('--force');
const concurrency = Number(args[args.indexOf('--concurrency') + 1]) || 4;

if (!existsSync(extractPath)) {
  console.error(`missing ${extractPath}. Run: npm run build:master --workspace @umalegacies/api`);
  process.exit(1);
}

const db = new Database(':memory:');
db.exec(readFileSync(extractPath, 'utf8'));

/**
 * One portrait per CHARACTER, not per card. gametora files are per card
 * (`chara_stand_<chara_id>_<card_id>.png`, one per outfit) while a tree node
 * identifies a character, so the lowest card id wins: that is the base outfit,
 * and it is the one a player recognises.
 */
const picks = new Map();
for (const row of db
  .prepare('SELECT id, chara_id FROM card_data ORDER BY chara_id, id')
  .all()) {
  if (!picks.has(row.chara_id)) picks.set(row.chara_id, row.id);
}

mkdirSync(outDir, { recursive: true });

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const wanted = [...picks].filter(
  ([charaId]) => force || !existsSync(resolve(outDir, `${charaId}.png`)),
);

if (wanted.length === 0) {
  console.log(`cache is warm: ${picks.size} portraits already in ${outDir}`);
  process.exit(0);
}

console.log(`fetching ${wanted.length} of ${picks.size} portraits into ${outDir}`);

const failures = [];
let done = 0;

async function fetchOne([charaId, cardId]) {
  const url =
    `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${charaId}_${cardId}.png`;
  try {
    const response = await fetch(url, {
      headers: {
        // A real UA and a referer, because this is a browser-facing CDN and an
        // unlabelled bulk fetch is the rude version of this request.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        referer: 'https://gametora.com/umamusume/characters',
        accept: 'image/png,image/*,*/*',
      },
    });
    if (!response.ok) {
      failures.push(`${charaId}: HTTP ${response.status}`);
      return;
    }
    const body = Buffer.from(await response.arrayBuffer());
    // A 404 page served as 200 is HTML, and writing it as a .png produces a
    // broken image that looks like a layout bug three days later.
    if (!body.subarray(0, 4).equals(PNG_MAGIC)) {
      failures.push(`${charaId}: not a PNG (${body.length} bytes)`);
      return;
    }
    writeFileSync(resolve(outDir, `${charaId}.png`), body);
    done++;
  } catch (error) {
    failures.push(`${charaId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A small pool with a pause between requests. 66 files is not a reason to hammer anyone. */
const queue = [...wanted];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      await fetchOne(queue.shift());
      await new Promise((r) => setTimeout(r, 150));
    }
  }),
);

console.log(`wrote ${done} portraits`);
if (failures.length > 0) {
  console.warn(`\n${failures.length} failed (those characters keep their initials):`);
  for (const f of failures) console.warn(`  ${f}`);
}
