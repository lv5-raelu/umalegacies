import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPackageFile } from '../common/find-file';

/**
 * Where the portrait cache lives. Probed the same way the master extract is,
 * because these modules compile to CommonJS for NestJS and are read as ESM by
 * Vitest, and the process may start from the repo root or the package root.
 *
 * Unlike the extract this may legitimately not exist, so it resolves a
 * DIRECTORY rather than asserting a file: an empty or absent cache is a
 * supported state and never a boot failure.
 */
export function findPortraitDir(): string {
  const { path } = findPackageFile(
    process.env.PORTRAIT_DIR,
    __filename,
    '../../..',
    'data/portraits',
  );
  // findPackageFile returns '' when nothing exists yet. Fall back to the
  // conventional location so a 404 message names the directory to fill.
  return path || resolve(__dirname, '../../..', 'data/portraits');
}

export type PortraitLookup =
  | { ok: true; path: string }
  /** The id was not an id. Refused before it ever reaches the filesystem. */
  | { ok: false; reason: 'invalid_id' }
  /** A legitimate id with nothing cached for it. The designed default state. */
  | { ok: false; reason: 'not_cached' };

/**
 * Resolves a chara_id to a cached file.
 *
 * Kept out of the controller so the traversal guard and the miss path can be
 * tested as plain functions, matching how the rest of this package is tested
 * (M0 chose fixtures over Nest testing-module setups).
 */
export function lookupPortrait(dir: string, charaId: string): PortraitLookup {
  // An id, not a filename. Digits only, so no `..`, no separator, no absolute
  // path and no null byte can be smuggled through the route parameter.
  if (!/^\d{1,10}$/.test(charaId)) return { ok: false, reason: 'invalid_id' };

  const path = resolve(dir, `${charaId}.png`);
  // Belt and braces: even though the regex makes traversal unreachable, assert
  // the resolved path stayed inside the cache directory. A future edit to that
  // regex must not silently become a file-read primitive.
  if (path !== resolve(dir, `${charaId}.png`) || !path.startsWith(resolve(dir) + '/')) {
    return { ok: false, reason: 'invalid_id' };
  }
  if (!existsSync(path) || !statSync(path).isFile()) return { ok: false, reason: 'not_cached' };
  return { ok: true, path };
}
