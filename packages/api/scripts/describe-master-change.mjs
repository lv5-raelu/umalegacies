/**
 * Says, in words, what a game-data update changed -- the committed data at HEAD
 * against the regenerated data in the working tree.
 *
 *   node scripts/describe-master-change.mjs            # markdown body
 *   node scripts/describe-master-change.mjs --subject  # one-line commit subject
 *
 * WHY. The daily GitHub Action commits a game patch to master unattended, and
 * the commit is how the builder finds out it happened. "Update master data" says
 * nothing; "adds Hokko Tarumae and Satono Diamond [Jade's Prosperity]" says what
 * to go and look at. The same text heads the issue when the tests fail.
 *
 * Reads both extracts into in-memory SQLite rather than parsing SQL text, so the
 * names come from the same rows the app serves.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const EXTRACT = 'packages/api/data/master-extract.sql';
const META = 'packages/api/data/master-meta.json';

/** A file as committed at HEAD, or null when HEAD has no such file. */
function atHead(path) {
  try {
    return execFileSync('git', ['show', `HEAD:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

const now = (path) => {
  const full = resolve(repoRoot, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
};

function open(sql) {
  const db = new DatabaseSync(':memory:');
  if (sql) db.exec(sql);
  return db;
}

/** card id -> "Name [Costume]", for every card in an extract. */
function cards(db) {
  const out = new Map();
  let rows;
  try {
    rows = db.prepare('SELECT id, chara_id, default_rarity FROM card_data').all();
  } catch {
    return out; // an empty database: the first run, with no committed extract
  }
  const text = (category, index) =>
    db.prepare('SELECT text FROM text_data WHERE category = ? AND "index" = ?').get(category, index)
      ?.text;
  for (const r of rows) {
    // Category 6 is the character's name, 5 the bracketed costume label.
    const name = text(6, r.chara_id) ?? `character ${r.chara_id}`;
    const costume = text(5, r.id);
    out.set(r.id, { label: costume ? `${name} ${costume}` : name, name, playable: r.default_rarity > 0 });
  }
  return out;
}

const oldMeta = JSON.parse(atHead(META) ?? 'null');
const newMeta = JSON.parse(now(META) ?? 'null');
const before = cards(open(atHead(EXTRACT)));
const after = cards(open(now(EXTRACT)));

const added = [...after].filter(([id]) => !before.has(id)).map(([id, c]) => ({ id, ...c }));
const removed = [...before].filter(([id]) => !after.has(id)).map(([id, c]) => ({ id, ...c }));
const shown = added.filter((c) => c.playable);

const version = newMeta?.game?.appVersion ?? 'unknown version';

if (process.argv.includes('--subject')) {
  // Git's convention is a subject under ~72 characters. Name up to two cards,
  // then count the rest.
  const names = shown.map((c) => c.label);
  const what =
    names.length === 0
      ? 'master data changed, no new cards'
      : names.length <= 2
        ? `adds ${names.join(' and ')}`
        : `adds ${names[0]} and ${names.length - 1} more cards`;
  let subject = `Game data ${version}: ${what}`;
  if (subject.length > 100) subject = `Game data ${version}: adds ${names.length} cards`;
  console.log(subject);
  process.exit(0);
}

const lines = [];
const fromVersion = oldMeta?.game?.appVersion ?? 'unknown';
lines.push(`Game ${fromVersion} -> ${version}, fetched from the game's CDN by the daily game-data workflow.`);
lines.push('');

if (shown.length) {
  lines.push('New cards:');
  for (const c of shown) lines.push(`  ${c.id}  ${c.label}`);
  lines.push('');
}
const hidden = added.filter((c) => !c.playable);
if (hidden.length) {
  lines.push('New placeholder cards, not offered in the picker (default_rarity 0):');
  for (const c of hidden) lines.push(`  ${c.id}  ${c.label}`);
  lines.push('');
}
if (removed.length) {
  // Never seen yet. Said loudly, because a card leaving the data would orphan
  // every roster entry that names it.
  lines.push('CARDS REMOVED -- look at this before trusting the update:');
  for (const c of removed) lines.push(`  ${c.id}  ${c.label}`);
  lines.push('');
}
if (!added.length && !removed.length) {
  lines.push('No cards were added or removed; the change is elsewhere in the tables the app reads.');
  lines.push('');
}

if (oldMeta?.counts && newMeta?.counts) {
  const changed = Object.keys(newMeta.counts).filter((k) => oldMeta.counts[k] !== newMeta.counts[k]);
  if (changed.length) {
    lines.push('Counts (packages/api/data/master-meta.json):');
    const width = Math.max(...changed.map((k) => k.length));
    for (const k of changed) {
      lines.push(`  ${k.padEnd(width)}  ${oldMeta.counts[k]} -> ${newMeta.counts[k]}`);
    }
    lines.push('');
  }
}

if (newMeta?.source?.sha256) {
  lines.push(`Source master.mdb sha256 ${newMeta.source.sha256.slice(0, 12)}, CDN name ${newMeta.game?.cdnName ?? 'unknown'}.`);
}
console.log(lines.join('\n'));
