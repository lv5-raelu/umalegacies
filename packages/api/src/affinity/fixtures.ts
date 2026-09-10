import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MasterData } from '../master/master-data';
import { findExtract } from '../master/master.service';
import type { ExplainRequest } from './types';

/**
 * Loads the committed fixtures and the committed master extract. Everything
 * here runs with neither master.mdb nor data.json present, which is the point:
 * the golden tests must pass in a clean clone and in CI.
 *
 * Tests read the SAME extract the server serves, so a passing test says
 * something about the running product rather than about a bespoke subset.
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

/** An in-memory database built from the committed master extract. */
export function sliceDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(findExtract(), 'utf8'));
  return db;
}

export function sliceMaster(): MasterData {
  return new MasterData(sliceDatabase());
}

/** SHA-256 of the extract, matching what GET /master/meta reports. */
export function fixtureMasterHash(): string {
  // Imported lazily to keep this module free of a crypto import at load time.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(readFileSync(findExtract())).digest('hex');
}
