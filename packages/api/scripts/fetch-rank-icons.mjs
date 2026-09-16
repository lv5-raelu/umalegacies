/**
 * Fills the rank-badge cache.
 *
 *   node scripts/fetch-rank-icons.mjs [--force]
 *
 * Writes packages/api/data/rank-icons/Rank_tex.webp, which is GITIGNORED for the
 * same reason the portraits are: it is Cygames' artwork, rehosted by a community
 * site that cannot grant redistribution rights it does not hold. Caching it on
 * the machine that runs the app is a different act from committing it.
 *
 * ONE file, not 298. The badges ship as a single 4096x2048 atlas and the web app
 * crops each one in CSS from coordinates committed in rank-ladder.ts, so a rank
 * badge costs no extra request and the cache has nothing to keep in step.
 *
 * A cache warmer, not a build step. A clean clone runs fine; a missing atlas
 * means the rank shows as text, which is the designed state rather than a
 * broken one.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../data/rank-icons');
const outFile = resolve(outDir, 'Rank_tex.webp');
const SOURCE = 'https://daftuyda.moe/assets/Rank_tex.webp?v=20260901';

const force = process.argv.includes('--force');

if (existsSync(outFile) && !force) {
  console.log(`have ${outFile} (${statSync(outFile).size} bytes). --force to refetch.`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const response = await fetch(SOURCE, {
  headers: { Referer: 'https://daftuyda.moe/rank-breakdown' },
});
if (!response.ok) {
  console.error(`GET ${SOURCE} -> ${response.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());

// Assert what landed rather than trust the content-type: a captive portal or an
// error page served as 200 would otherwise be written as if it were the atlas.
if (bytes.slice(0, 4).toString() !== 'RIFF' || bytes.slice(8, 12).toString() !== 'WEBP') {
  console.error(`${SOURCE} did not return a WebP (got ${bytes.length} bytes).`);
  process.exit(1);
}
const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
if (width !== 4096 || height !== 2048) {
  console.error(
    `atlas is ${width}x${height}, expected 4096x2048. The sprite coordinates in ` +
      'rank-ladder.ts index the old size and would crop the wrong badges.',
  );
  process.exit(1);
}

writeFileSync(outFile, bytes);
console.log(`wrote ${outFile} (${bytes.length} bytes, ${width}x${height})`);
