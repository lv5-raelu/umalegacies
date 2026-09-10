import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExplainRequest } from './types';

/**
 * Loads the committed fixture lineages. Runs with neither master.mdb nor
 * data.json present, which is the point: the golden tests must pass in a clean
 * clone and in CI. The master data they run against lives in
 * master/master-extract.ts.
 */
function findFixtureDir(): string {
  const candidates = [
    process.env.FIXTURE_DIR,
    // from src/affinity (Vitest) or dist/affinity (compiled)
    resolve(__filename, '../../../fixtures'),
    resolve(process.cwd(), 'fixtures'),
    resolve(process.cwd(), 'packages/api/fixtures'),
  ].filter((c): c is string => typeof c === 'string');

  for (const dir of candidates) {
    if (existsSync(resolve(dir, '5531.json'))) return dir;
  }
  throw new Error(
    `could not locate the fixtures directory. Tried:\n  ${candidates.join('\n  ')}`,
  );
}

let cachedDir: string | undefined;
const fixtureDir = (): string => (cachedDir ??= findFixtureDir());

export interface Fixture {
  name: string;
  description: string;
  provenance: string;
  request: ExplainRequest;
  expected: Record<string, unknown>;
}

export function loadFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(resolve(fixtureDir(), `${name}.json`), 'utf8'),
  ) as Fixture;
}
