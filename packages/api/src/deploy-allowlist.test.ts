import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repoRoot } from './deploy.test-utils.js';

/**
 * What `vercel deploy` is allowed to upload.
 *
 * This is the only test in the repository whose failure means a PRIVACY breach
 * rather than a broken feature. Vercel CLI does NOT read .gitignore -- its
 * default-exclusion list names ".gitignore" as a file to skip uploading, not as
 * a source of rules -- so `.vercelignore` is the only thing standing between a
 * deploy and `data.json`, which carries 183 other players' 12-digit
 * owner_viewer_id values.
 *
 *   repo/.vercelignore ──copied as──► scratch/.gitignore
 *                                          │
 *   real paths mirrored as empty files ────┤
 *                                          ▼
 *                                   git check-ignore
 *                                          │
 *                                   DENY / ALLOW
 *
 * It runs the patterns through `git check-ignore` in a throwaway repository
 * rather than re-implementing the matcher here. A hand-rolled matcher would
 * only prove that this file agrees with itself; gitignore syntax has enough
 * corners (`/*` anchoring, directory re-inclusion, the rule that you cannot
 * re-include inside an excluded directory) that the reimplementation would be
 * the thing most likely to be wrong. `.vercelignore` uses gitignore syntax, so
 * git is the correct oracle.
 */

/** Paths that must NEVER reach Vercel, and why each one matters. */
const MUST_DENY: ReadonlyArray<readonly [string, string]> = [
  ['data.json', "the player's save: 183 other players' trainer ids"],
  ['master.mdb', "the game's own 16 MB database"],
  ['master.mdb.old', 'the previous patch of the same'],
  ['packages/api/data/portraits/100101.png', "Cygames' art, per NOTICE.md"],
  ['packages/api/data/rank-icons/Rank_tex.webp', "Cygames' art, per NOTICE.md"],
  ['packages/web/dist/index.html', 'build output, produced on Vercel'],
  ['packages/api/node_modules/better-sqlite3/index.js', 'installed on Vercel'],
  ['packages/api/tsconfig.tsbuildinfo', 'incremental build state'],
];

/** Paths a deployment genuinely needs. */
const MUST_ALLOW: ReadonlyArray<readonly [string, string]> = [
  ['package.json', 'the workspace root'],
  ['package-lock.json', 'so the install is reproducible'],
  ['tsconfig.base.json', 'extended by every workspace tsconfig'],
  ['vercel.json', 'the deployment configuration itself'],
  ['packages/api/package.json', 'the api workspace'],
  ['packages/api/data/master-extract.sql', 'the entire game database the engine reads'],
  ['packages/api/src/master/master.service.ts', 'API source'],
  ['packages/api/scripts/fetch-portraits.mjs', 'referenced by npm scripts'],
  ['packages/web/src/api/client.ts', 'web source'],
  ['packages/types/src/index.ts', 'the shared wire types, read as source'],
  ['packages/web/public/portraits/100101.png', 'the deploy-time artwork copy'],
  ['packages/web/public/rank-icons/Rank_tex.webp', 'the deploy-time artwork copy'],
  // Measured 2026-09-17: Vercel validates the service `entrypoint` against the
  // UPLOADED SOURCE, before buildCommand runs. Denying this fails the deploy
  // with `Service "api" has entrypoint "dist/main.js" but that path does not
  // exist`. The remote build overwrites it, so Vercel ships its own output.
  ['packages/api/dist/main.js', 'the entrypoint, validated before the build runs'],
];

let scratch: string;

function ignored(path: string): boolean {
  // check-ignore exits 0 when the path IS ignored, 1 when it is not.
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: scratch, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

beforeAll(() => {
  const vercelignore = resolve(repoRoot(), '.vercelignore');

  scratch = mkdtempSync(resolve(tmpdir(), 'umalegacies-allowlist-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: scratch, stdio: 'ignore' });
  copyFileSync(vercelignore, resolve(scratch, '.gitignore'));

  // Only the PATHS matter to the matcher, so the files are empty.
  for (const [path] of [...MUST_DENY, ...MUST_ALLOW]) {
    const full = resolve(scratch, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, '');
  }
});

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe('.vercelignore keeps the save file off Vercel', () => {
  it.each(MUST_DENY)('denies %s (%s)', (path) => {
    expect(ignored(path), `${path} WOULD BE UPLOADED by vercel deploy`).toBe(true);
  });

  it.each(MUST_ALLOW)('admits %s (%s)', (path) => {
    expect(ignored(path), `${path} is needed by the build but is excluded`).toBe(false);
  });

  /**
   * The allowlist shape itself, not just today's paths. A denylist would pass
   * every case above and still upload the next sensitive file somebody adds, so
   * assert that an unknown top-level path is denied by DEFAULT.
   */
  it('denies a top-level path nobody has listed', () => {
    const surprise = 'a-file-nobody-thought-about.json';
    writeFileSync(resolve(scratch, surprise), '');
    expect(
      ignored(surprise),
      'the allowlist has become a denylist: unlisted files now upload',
    ).toBe(true);
  });

  it('denies an unlisted directory at the root', () => {
    mkdirSync(resolve(scratch, 'scratch-exports'), { recursive: true });
    writeFileSync(resolve(scratch, 'scratch-exports/roster-dump.json'), '');
    expect(ignored('scratch-exports/roster-dump.json')).toBe(true);
  });
});
