/**
 * Generates packages/web/public/master.json from the committed SQL extract.
 *
 *   npm run build:master-json --workspace @umalegacies/api
 *
 * WHY THE OUTPUT IS COMMITTED. The browser sweep (M7) needs the game data
 * client-side, and generating it during the web build would make `packages/web`
 * depend on `packages/api` being compiled first -- for a file that changes only
 * when the extract does, which is once a patch. Committing it keeps the web
 * build standalone and `npm run dev` working from a clean clone.
 *
 * The cost of a committed generated file is drift, and that is paid for by
 * `master-json.test.ts`: it regenerates from the extract and fails if the
 * committed copy differs. Both files are committed, so that check runs in CI.
 * Regenerate the extract without regenerating this and the build goes red.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeMasterJson } from '@umalegacies/core';
import { extractDatabase, extractHash, readTables } from '../dist/master/master-extract.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../web/public/master.json');

const doc = encodeMasterJson(extractHash(), readTables(extractDatabase()));
const json = JSON.stringify(doc);
writeFileSync(out, json);

const rows = Object.values(doc.tables).reduce((n, t) => n + (t.cols[0]?.length ?? 0), 0);
// BYTES, not `json.length`. 306 characters in here are non-ASCII -- uma names
// carry the likes of the heart, the star and an accented e -- so the string
// length undercounts the file by ~600 bytes, and this figure is quoted in the
// design doc as a payload size.
const bytes = Buffer.byteLength(json, 'utf8');
console.log(`wrote ${bytes.toLocaleString()} bytes (${rows.toLocaleString()} rows) to ${out}`);
console.log(`extract hash ${doc.hash}`);
