import { existsSync, lstatSync } from 'node:fs';
import { relative, resolve, isAbsolute } from 'node:path';
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
  // An explicitly configured directory is HONOURED, never silently replaced.
  // findPackageFile probes and falls through when a path does not exist yet,
  // which for an operator who set PORTRAIT_DIR to a directory they have not
  // created means the server quietly serves a different one and then names that
  // other directory in its 404s. An empty cache is a supported state; a
  // disregarded configuration is not.
  const configured = process.env.PORTRAIT_DIR;
  if (configured) return resolve(configured);

  const { path } = findPackageFile(undefined, __filename, '../../..', 'data/portraits');
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
export function lookupPortrait(dir: string, cardId: string): PortraitLookup {
  // An id, not a filename. Digits only, so no `..`, no separator, no absolute
  // path and no null byte can be smuggled through the route parameter.
  if (!/^\d{1,10}$/.test(cardId)) return { ok: false, reason: 'invalid_id' };

  const path = resolve(dir, `${cardId}.png`);
  // Belt and braces: even though the regex makes traversal unreachable, assert
  // the resolved path stayed inside the cache directory. A future edit to that
  // regex must not silently become a file-read primitive.
  //
  // Via `relative`, not a separator-prefixed startsWith: that hardcodes "/" and
  // is therefore always false on Windows, where it would 400 every portrait
  // while looking like a working guard. The old first clause compared a value to
  // the identical expression that produced it and could never be true.
  const inside = relative(resolve(dir), path);
  if (inside.startsWith('..') || isAbsolute(inside)) {
    return { ok: false, reason: 'invalid_id' };
  }
  // lstat, NOT stat: stat follows symlinks, so a cache entry linked at some
  // other file would pass this guard and then be streamed out as image/png.
  // The cache is filled by a script and is not a place symlinks belong.
  if (!existsSync(path) || !lstatSync(path).isFile()) return { ok: false, reason: 'not_cached' };
  return { ok: true, path };
}
