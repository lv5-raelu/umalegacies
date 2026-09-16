import { readFileSync } from 'node:fs';
import { findPackageFile } from '../common/find-file';
import type { ExplainPairRequest, ExplainRequest } from './types';

/**
 * Loads the committed fixture lineages. Runs with neither master.mdb nor
 * data.json present, which is the point: the golden tests must pass in a clean
 * clone and in CI. The master data they run against lives in
 * master/master-extract.ts.
 */
function fixturePath(name: string): string {
  const { path, tried } = findPackageFile(
    process.env.FIXTURE_DIR ? `${process.env.FIXTURE_DIR}/${name}.json` : undefined,
    __filename,
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

export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Fixture;
}
