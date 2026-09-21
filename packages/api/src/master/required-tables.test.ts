import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractDatabase } from './master-extract.js';

/**
 * Every table MasterData reads must be one the boot check asserts.
 *
 * The two lists live in different files and drifted the moment a new table was
 * queried: `single_mode_rank` was added to the extract and read by
 * `careerRankTier`, but not to REQUIRED_TABLES. An extract missing it then
 * PASSED the schema check and failed later with a bare
 * `SqliteError: no such table`, which is exactly the failure the named
 * MasterSchemaError exists to replace. Boot is supposed to refuse to start
 * dirty and say which table is missing.
 *
 * Read from source rather than exported, so the check cannot be satisfied by
 * updating a list that nothing reads.
 */
describe('the boot schema check covers every table MasterData queries', () => {
  const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));
  const required = new Set(
    [...readFileSync(here('master.service.ts'), 'utf8').matchAll(/^\s*'([a-z_]+)',$/gm)].map(
      (m) => m[1] as string,
    ),
  );
  // master-extract.ts, not master-data.ts. The eleven queries moved here when
  // the engine went to @umalegacies/core, which cannot hold SQL because it also
  // runs in a browser. The list this test guards is still "every table the code
  // actually SELECTs from", so it follows the SQL rather than the class.
  const queried = new Set(
    [...readFileSync(here('master-extract.ts'), 'utf8').matchAll(/FROM\s+([a-z_]+)/g)].map(
      (m) => m[1] as string,
    ),
  );

  it('found both lists', () => {
    expect(required.size).toBeGreaterThan(5);
    expect(queried.size).toBeGreaterThan(5);
  });

  it.each([...queried])('%s is asserted at boot', (table) => {
    expect(required.has(table)).toBe(true);
  });

  it('and every asserted table actually exists in the committed extract', () => {
    const db = extractDatabase();
    const present = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
          name: string;
        }>
      ).map((r) => r.name),
    );
    for (const table of required) expect(present.has(table), `missing ${table}`).toBe(true);
  });
});
