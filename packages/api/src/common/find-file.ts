import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Finds a file that ships inside this package, by probing candidate paths.
 *
 * Probing rather than resolving from a single anchor because these modules are
 * compiled to CommonJS for NestJS and read as ESM by Vitest: `__dirname` and
 * `import.meta` each exist in only one of those. The process may also be
 * started from the repository root or from the package directory.
 *
 * @param override  an explicit path from the environment, tried first
 * @param fromModule  `__filename` of the calling module
 * @param upToRoot  relative hops from that module to the package root
 * @param relative  the wanted file, relative to the package root
 */
export function findPackageFile(
  override: string | undefined,
  fromModule: string,
  upToRoot: string,
  relative: string,
): { path: string; tried: string[] } {
  const tried = [
    override,
    resolve(fromModule, upToRoot, relative),
    resolve(process.cwd(), relative),
    resolve(process.cwd(), 'packages/api', relative),
  ].filter((p): p is string => typeof p === 'string');

  for (const path of tried) if (existsSync(path)) return { path, tried };
  return { path: '', tried };
}
