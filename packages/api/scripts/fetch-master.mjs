/**
 * Downloads the current Global master.mdb from the game's own CDN.
 *
 *   npm run fetch:master --workspace @umalegacies/api [-- --force] [-- --resource-version N]
 *   npm run update:master      # from the repo root: this, then every rebuild step
 *
 * Writes master.mdb at the repository root -- where build:master has always
 * looked -- or at MASTER_DB_PATH. Nothing it writes is committed: `master.mdb*`
 * in .gitignore covers the database, its `.version` marker, the `.download` it
 * stages into and the `.old` it keeps, and .vercelignore is deny-by-default.
 *
 * WHY. Every game patch used to mean updating the Steam build on another
 * computer and copying master.mdb across by hand (PRs #51 and #52). The game
 * itself just downloads the file; see src/master/game-cdn.ts for the chain.
 *
 * WHAT IT CHECKS before replacing anything: that the download is a SQLite
 * database, that SQLite's own `quick_check` passes on it, and that it has the
 * cards and spark tables this app is built on. A failed check leaves the
 * existing master.mdb untouched. Table-by-table validation is build:master's
 * job, which already refuses a database missing anything the extract reads.
 *
 * THE VERSION comes from uma.moe's public `/api/ver`, which needs no key; it is
 * what uma.moe's own resource server polls for the same purpose. If that is
 * ever down, `--resource-version` takes the number directly.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMasterMdb, USER_AGENT } from '../dist/master/game-cdn.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const target = process.env.MASTER_DB_PATH ?? resolve(repoRoot, 'master.mdb');
const marker = `${target}.version`;
const staging = `${target}.download`;
const backup = `${target}.old`;

const VERSION_URL = 'https://uma.moe/api/ver';

const args = process.argv.slice(2);
const force = args.includes('--force');

/** `--resource-version 10008400`, or null. A bare number elsewhere is not read as one. */
function versionFlag() {
  const at = args.indexOf('--resource-version');
  if (at === -1) return null;
  const value = args[at + 1];
  if (!/^\d+$/.test(value ?? '')) {
    console.error('--resource-version must be a number, like 10008400');
    process.exit(2);
  }
  return value;
}

async function liveVersion() {
  const override = versionFlag();
  if (override) return { app_version: 'unknown', resource_version: override };

  let response;
  try {
    response = await fetch(VERSION_URL, {
      headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache' },
    });
  } catch (error) {
    throw new Error(
      `Could not reach ${VERSION_URL} (${error.message}). ` +
        'Pass the version directly with --resource-version.',
    );
  }
  if (!response.ok) {
    throw new Error(`${VERSION_URL} answered ${response.status}. Pass --resource-version instead.`);
  }
  const body = await response.json();
  if (!/^\d+$/.test(String(body?.resource_version ?? ''))) {
    throw new Error(`${VERSION_URL} did not say which resource version is live: ${JSON.stringify(body)}`);
  }
  return body;
}

/** Cards in a database, or null when there is no database there to ask. */
function cardsIn(path) {
  if (!existsSync(path)) return null;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM card_data').get().n;
  } finally {
    db.close();
  }
}

/** The checks a download must pass before it may replace anything. */
function verify(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA quick_check').get().quick_check;
    if (check !== 'ok') throw new Error(`SQLite quick_check failed: ${check}`);
    for (const table of ['card_data', 'succession_factor', 'succession_relation', 'text_data']) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      if (n === 0) throw new Error(`the downloaded database has an empty ${table}`);
    }
  } finally {
    db.close();
  }
}

const started = Date.now();
const version = await liveVersion();
const label = `${version.app_version}:${version.resource_version}`;
const current = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;

if (!force && current === label && existsSync(target)) {
  console.log(`master.mdb is already the live version (${label}). Nothing to do; --force refetches.`);
  process.exit(0);
}

console.log(
  `Live game ${version.app_version}, resource version ${version.resource_version}. ` +
    (current ? `Have ${current}.` : existsSync(target) ? 'Have a master.mdb of unknown version.' : 'Have none.'),
);

let fetched;
try {
  fetched = await fetchMasterMdb(version.resource_version);
} catch (error) {
  console.error(`Download failed: ${error.message}`);
  console.error('The existing master.mdb, if any, was left untouched.');
  process.exit(1);
}

writeFileSync(staging, fetched.bytes);
try {
  verify(staging);
} catch (error) {
  rmSync(staging, { force: true });
  console.error(`Downloaded, but refused: ${error.message}`);
  console.error('The existing master.mdb, if any, was left untouched.');
  process.exit(1);
}

const before = cardsIn(target);
// The previous database is kept, not deleted: if the patch broke something the
// extract reads, comparing against it is the fastest way to see what moved.
if (existsSync(target)) renameSync(target, backup);
renameSync(staging, target);
writeFileSync(marker, `${label}\n`);
const after = cardsIn(target);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(
  [
    `Saved ${target}`,
    `  ${mb(fetched.compressedBytes)} downloaded, ${mb(fetched.bytes.length)} decompressed, ` +
      `${((Date.now() - started) / 1000).toFixed(1)} s`,
    `  cards: ${before ?? 'none'} -> ${after}` +
      (before !== null && after > before ? `  (+${after - before} new)` : ''),
    before !== null ? `  previous database kept at ${backup}` : null,
    '',
    'Next: npm run build:master --workspace @umalegacies/api, or run `npm run update:master`',
    'from the repository root to do every rebuild step in order.',
  ]
    .filter((line) => line !== null)
    .join('\n'),
);
