import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Shared by the two deploy tests. Excluded from the build by tsconfig's
 * `**\/*.test-utils.ts` rule, because nothing in the shipped API needs it and a
 * package that deletes dead code should not add some.
 */

/**
 * The repository root, found by walking up until `.vercelignore` appears.
 *
 * Not `findPackageFile`: that resolves files INSIDE packages/api, and the deploy
 * configuration lives one level above it. Searching for a marker file rather
 * than counting hops means these tests keep working if they are ever moved.
 */
export function repoRoot(): string {
  let dir = HERE;
  for (let up = 0; up < 6; up++) {
    if (existsSync(resolve(dir, '.vercelignore'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`.vercelignore not found walking up from ${HERE}`);
}
