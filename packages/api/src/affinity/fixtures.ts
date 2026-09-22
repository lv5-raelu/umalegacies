import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findPackageFile } from '../common/find-file.js';
import { type ExplainPairRequest, type ExplainRequest } from '@umalegacies/core';

/**
 * Loads the committed fixture lineages. Runs with neither master.mdb nor
 * data.json present, which is the point: the golden tests must pass in a clean
 * clone and in CI. The master data they run against lives in
 * master/master-extract.ts.
 */
function fixturePath(name: string): string {
  const { path, tried } = findPackageFile(
    process.env.FIXTURE_DIR ? `${process.env.FIXTURE_DIR}/${name}.json` : undefined,
    fileURLToPath(import.meta.url),
    '../../..',
    `fixtures/${name}.json`,
  );
  if (path) return path;
  throw new Error(`fixture ${name} not found. tried:\n  ${tried.join('\n  ')}`);
}

export interface Fixture {
  name: string;
  description: string;
  provenance: string;
  /**
   * Present on the two fixtures built from a chosen PAIR of veterans, and the
   * shape M3's roster screen actually posts. Built in the fixture script
   * straight from the two roster entries, so a test can feed it to
   * `explain-pair` and compare against `expected` WITHOUT going through
   * `lineageFromPair` on the way in. Absent on the lineage and synthetic
   * fixtures, which have no pair to be built from.
   */
  pair?: ExplainPairRequest;
  request: ExplainRequest;
  expected: Record<string, unknown>;
}

/**
 * The committed fixtures. An allowlist rather than a directory scan, because
 * this feeds a URL parameter: a scan would let `../../data.json` through.
 */
export const FIXTURE_NAMES = [
  'verify-oguri',
  'pair-asymmetric',
  '5531',
  '5774',
  'synthetic-absent-ancestor',
  'synthetic-group-id',
  'synthetic-unresolved',
] as const;

/**
 * The ONE fixture that production needs, named literally so it ships.
 *
 * `content-checks.ts` runs fixture 5774 through the real engine during
 * `MasterService.onModuleInit`, which means this file is read at BOOT, not only
 * by tests. Every path in `fixturePath` is computed, so Vercel's tracer cannot
 * see it and the deployment shipped without it:
 *
 *   Error: fixture 5774 not found. tried:
 *     /var/task/fixtures/5774.json
 *     /var/task/packages/api/fixtures/5774.json
 *   at MasterService.onModuleInit
 *
 * Measured 2026-09-17. Same two-jobs split as BUNDLED_EXTRACT in
 * master-extract.ts: this literal is what makes the file SHIP, and the probe
 * below is what FINDS it once the bundle has flattened the JavaScript to its
 * root. The other six fixtures are test-only and are deliberately not named
 * here -- nothing outside the test suite reads them.
 */
const BOOT_FIXTURE = fileURLToPath(new URL('../../fixtures/5774.json', import.meta.url));

/** The fixture `content-checks.ts` asserts on at startup. */
export const BOOT_FIXTURE_NAME = '5774';

export function loadFixture(name: string): Fixture {
  if (name === BOOT_FIXTURE_NAME && existsSync(BOOT_FIXTURE)) {
    return JSON.parse(readFileSync(BOOT_FIXTURE, 'utf8')) as Fixture;
  }
  return JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Fixture;
}
