/**
 * Fills the rank-badge atlas.
 *
 *   node scripts/fetch-rank-icons.mjs [--force]
 *
 * Writes packages/web/public/rank-icons/Rank_tex.webp, which is COMMITTED, like
 * the portraits: the builder reversed the earlier gitignored-cache decision on
 * 2026-09-18 (988d4f3) so a clone deploys with its artwork. It is Cygames'
 * artwork rehosted by a community site; NOTICE.md records the rights position.
 *
 * ONE file, not 298. The badges ship as a single 4096x2048 atlas and the web app
 * crops each one in CSS from coordinates committed in rank-ladder.ts, so a rank
 * badge costs no extra request and there is one file to keep in step.
 *
 * Not a build step: run it when the atlas changes and commit what it writes. A
 * missing atlas means the rank shows as text, which is the designed state
 * rather than a broken one.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../web/public/rank-icons');
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

// The dimension read below is VP8X-specific: bytes 24-29 are canvas width and
// height, each a 24-bit little-endian value minus one. A plain VP8 or lossless
// VP8L file stores its size somewhere else entirely, so reading those offsets
// without checking the chunk type first would interpret unrelated bytes as a
// size -- and could pass the 4096x2048 assertion by accident, letting a
// wrongly-shaped atlas through to mis-crop every badge on screen.
const chunk = bytes.slice(12, 16).toString();
if (chunk !== 'VP8X') {
  console.error(
    `${SOURCE} returned a '${chunk}' WebP, not the extended VP8X format this ` +
      'script knows how to measure. The atlas size could not be verified, so it ' +
      'was not written.',
  );
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
