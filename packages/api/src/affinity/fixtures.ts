import { readFileSync } from 'node:fs';
import { findPackageFile } from '../common/find-file';
import type { ExplainRequest } from './types';

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
  request: ExplainRequest;
  expected: Record<string, unknown>;
}

/**
 * The committed fixtures. An allowlist rather than a directory scan, because
 * this feeds a URL parameter: a scan would let `../../data.json` through.
 */
export const FIXTURE_NAMES = [
  'verify-oguri',
  '5531',
  '5774',
  'synthetic-absent-ancestor',
  'synthetic-group-id',
  'synthetic-unresolved',
] as const;

export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Fixture;
}
