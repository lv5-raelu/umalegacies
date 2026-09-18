import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nothing in packages/web may import from packages/api. Not source, not tests.
 *
 * The two packages' builds are NOT symmetrical, which is why the rule only
 * points one way:
 *
 *     packages/api  tests ──may import──►  packages/web  source
 *     packages/web  ANYTHING ──never────►  packages/api
 *
 * `packages/api/tsconfig.json` excludes `**\/*.test.ts`, so nothing an api test
 * imports can reach the api build. `packages/web/tsconfig.json` includes its
 * tests, so a single web test importing api source drags api source -- and
 * api's devDependencies -- into the web BUILD's typecheck graph.
 *
 * That is not a theoretical tidiness argument. It shipped a broken deploy:
 * `rank-ladder.test.ts` imported `master-extract.ts` for a cross-check, which
 * pulled in `better-sqlite3`. It resolved locally, because npm hoists
 * dependencies to the repository root, and failed on Vercel, which installs
 * each service in isolation:
 *
 *     ../api/src/master/master-data.ts(1,31): error TS2307:
 *       Cannot find module 'better-sqlite3'
 *
 * The failure is invisible on a developer machine and only appears at deploy
 * time, which is exactly the kind of rule that needs enforcing rather than
 * documenting. Both cross-checks that used to live here now live in
 * packages/api, where importing web source costs nothing:
 *
 *   packages/api/src/master/rank-ladder-crosscheck.test.ts
 *   packages/api/src/web-contract.test.ts
 */

const WEB_SRC = fileURLToPath(new URL('.', import.meta.url));

/** Any specifier that leaves this package for the api one. */
const REACHES_API = [
  /from\s+'[^']*\.\.\/api\/src\//, // a relative climb into packages/api/src
  /from\s+'@umalegacies\/api/, // the workspace name, were it ever published
  /import\(\s*'[^']*\.\.\/api\/src\//, // dynamic import of the same
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (['.ts', '.tsx'].includes(extname(entry.name))) found.push(full);
  }
  return found;
}

describe('packages/web does not reach into packages/api', () => {
  const files = sourceFiles(WEB_SRC);

  it('finds source files to check at all', () => {
    // Guards the guard: a broken walk would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no file importing api source', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Strip block comments so this very file's explanation, which quotes the
      // offending import paths, does not trip the rule it describes.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
      if (REACHES_API.some((re) => re.test(code))) {
        offenders.push(relative(WEB_SRC, file));
      }
    }

    expect(
      offenders,
      `these files import packages/api, which puts api's devDependencies into ` +
        `the web BUILD and breaks the Vercel deploy while working locally:\n  ` +
        `${offenders.join('\n  ')}\n` +
        `Move the test into packages/api instead -- api tests are excluded from ` +
        `the api build, so the dependency is free in that direction.`,
    ).toEqual([]);
  });
});
