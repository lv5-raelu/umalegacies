/**
 * Fills the portrait cache from gametora.
 *
 *   node scripts/fetch-portraits.mjs [--force] [--concurrency N]
 *
 * Writes packages/api/data/portraits/<card_id>.png, which is GITIGNORED and
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

/**
 * `Number(args[indexOf(flag) + 1]) || 4` had three faults: absent the flag,
 * indexOf returns -1 and it read args[0], so `fetch-portraits.mjs 8` silently
 * set 8; `--concurrency 0` became 4 through the `||`; and `--concurrency -1`
 * survived, producing a zero-length worker pool that fetched nothing and still
 * exited 0 reporting success.
 */
function intFlag(name, fallback, { min, max }) {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`${name} must be an integer between ${min} and ${max}`);
    process.exit(2);
  }
  return value;
}
const concurrency = intFlag('--concurrency', 4, { min: 1, max: 16 });

/** One hung connection must not park a worker forever. */
const REQUEST_TIMEOUT_MS = 20_000;
/** A thumbnail is ~7 KB. Anything past this is not the file we asked for. */
const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024;

if (!existsSync(extractPath)) {
  console.error(`missing ${extractPath}. Run: npm run build:master --workspace @umalegacies/api`);
  process.exit(1);
}

const db = new Database(':memory:');
db.exec(readFileSync(extractPath, 'utf8'));

/**
 * One portrait per CARD, not per character.
 *
 * A card is a costume, and costumes are not cosmetic here: 35 of the 66
 * characters have more than one card, and a card carries its own unique skill,
 * which IS the green spark. Measured on a real roster, 15 characters appear
 * with two different greens -- Oguri Cap 100601 is "Triumphant Pulse" and
 * 100602 is "Festive Miracle". Keying portraits by chara_id therefore drew one
 * costume's face directly above another costume's unique skill on the same
 * node. gametora's filename carries both ids, so the correct image was always
 * one join away.
 */
const picks = new Map();
for (const row of db.prepare('SELECT id, chara_id FROM card_data ORDER BY id').all()) {
  // SQLite is dynamically typed and this extract is generated text, so assert
  // rather than assume. Both values are interpolated into a URL and a filename;
  // a non-integer would be an arbitrary-path write.
  if (!Number.isInteger(row.chara_id) || !Number.isInteger(row.id)) {
    console.error(`card_data row has non-integer ids: ${JSON.stringify(row)}`);
    process.exit(2);
  }
  picks.set(row.id, row.chara_id);
}

mkdirSync(outDir, { recursive: true });

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const wanted = [...picks].filter(
  ([cardId]) => force || !existsSync(resolve(outDir, `${cardId}.png`)),
);

if (wanted.length === 0) {
  console.log(`cache is warm: ${picks.size} portraits already in ${outDir}`);
  process.exit(0);
}

console.log(`fetching ${wanted.length} of ${picks.size} portraits into ${outDir}`);

const failures = [];
let done = 0;

async function fetchOne([cardId, charaId]) {
  const url =
    `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${charaId}_${cardId}.png`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      failures.push(`${cardId}: HTTP ${response.status}`);
      return;
    }
    // Check the advertised length before buffering, so a hostile or
    // misconfigured response cannot be read wholly into memory just to be
    // rejected by the magic-byte test below.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PORTRAIT_BYTES) {
      failures.push(`${cardId}: ${declared} bytes, over the ${MAX_PORTRAIT_BYTES} cap`);
      return;
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_PORTRAIT_BYTES) {
      failures.push(`${cardId}: ${body.length} bytes, over the ${MAX_PORTRAIT_BYTES} cap`);
      return;
    }
    // A 404 page served as 200 is HTML, and writing it as a .png produces a
    // broken image that looks like a layout bug three days later.
    if (!body.subarray(0, 4).equals(PNG_MAGIC)) {
      failures.push(`${cardId}: not a PNG (${body.length} bytes)`);
      return;
    }
    writeFileSync(resolve(outDir, `${cardId}.png`), body);
    done++;
  } catch (error) {
    failures.push(`${cardId}: ${error instanceof Error ? error.message : String(error)}`);
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
  // A run where every fetch failed must not look like success to a caller. The
  // cache is optional, so a PARTIAL failure is not fatal; a total one is.
  if (done === 0) {
    console.error('\nevery fetch failed; the cache was not filled');
    process.exit(1);
  }
}
