import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MasterData } from '../master/master-data';
import type { ExplainRequest } from './types';

/**
 * Loads the committed master slice and fixtures. Everything here runs with
 * neither master.mdb nor data.json present, which is the point: the golden
 * tests must pass in a clean clone and in CI.
 *
 * The directory is found by probing rather than by `import.meta.url` or
 * `__dirname`: this module is compiled to CommonJS for NestJS and read as
 * ESM by Vitest, and neither anchor exists in both. FIXTURE_DIR overrides.
 */
function findFixtureDir(): string {
  const candidates = [
    process.env.FIXTURE_DIR,
    // from src/affinity (Vitest) or dist/affinity (compiled)
    resolve(__filename, '../../../fixtures'),
    // from the package root, however the process was started
    resolve(process.cwd(), 'fixtures'),
    resolve(process.cwd(), 'packages/api/fixtures'),
  ].filter((c): c is string => typeof c === 'string');

  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'master-slice.sql'))) return dir;
  }
  throw new Error(
    `could not locate the fixtures directory. Tried:\n  ${candidates.join('\n  ')}\n` +
      `Set FIXTURE_DIR to override.`,
  );
}

let cached: string | undefined;
const fixtureDir = (): string => (cached ??= findFixtureDir());

/**
 * The masterHash the fixtures were extracted from. No hash is computable from
 * a row slice, so it is recorded rather than derived.
 */
export const FIXTURE_MASTER_HASH =
  '5f283f200c1bc5af7498929963920d0c040e60d05467e784ca210fc07db1e056';

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

/** An in-memory master.mdb stand-in built from the committed text slice. */
export function sliceDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(resolve(fixtureDir(), 'master-slice.sql'), 'utf8'));
  return db;
}

export function sliceMaster(): MasterData {
  return new MasterData(sliceDatabase());
}
