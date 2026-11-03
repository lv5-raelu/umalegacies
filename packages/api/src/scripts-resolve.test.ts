import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE SCRIPTS IMPORT MODULES THAT STILL EXIST.
 *
 * `scripts/check-roster.mjs` is this project's oracle harness over the
 * builder's own roster: it compares every Individual Affinity against a
 * transcription of hakuraku's independent implementation. It CANNOT run in CI
 * -- it needs `master.mdb` and `data.json`, neither of which is committed and
 * neither of which should be. (Since 2026-11-03 the same comparison also runs
 * in CI, over a public corpus, as src/affinity/oracle.test.ts; this script is
 * still the only place it meets the builder's real lineages.)
 *
 * That is exactly why it rotted. PR #22 moved the engine into `packages/core`,
 * `../dist/affinity/engine.js` stopped existing, and the harness was dead for
 * eight days with nothing to report it. No test imported it, no build compiled
 * it, and `.mjs` is outside every tsconfig in the repo.
 *
 * WHAT THIS CATCHES: a script importing a module that has moved or been deleted.
 * That is the failure that actually happened.
 *
 * WHAT IT DOES NOT CATCH: the second half of the same breakage, where
 * `MasterData`'s constructor changed from taking a `DatabaseSync` to taking
 * plain rows. That is a type error, and a `.mjs` file gets no typechecking from
 * any config here. Catching it would mean bringing the scripts under `checkJs`,
 * which is a larger change than this one and is not pretended to be done.
 */

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = resolve(here, '../scripts');
const packagesDir = resolve(here, '../../');

/** `from '...'` and `import '...'`, single or double quoted. */
const SPECIFIER = /(?:^|\s)(?:from|import)\s+['"]([^'"]+)['"]/gm;

const scripts = readdirSync(scriptsDir).filter((f) => f.endsWith('.mjs') || f.endsWith('.ts'));

/**
 * A relative specifier points into `dist/`, which only exists after a build, so
 * the SOURCE module is what gets checked. That is the real invariant anyway:
 * the question is whether the module still lives where the script says, not
 * whether someone has compiled it lately.
 */
function sourceFor(target: string): string[] {
  const asSource = target.replace('/dist/', '/src/').replace(/\.js$/, '.ts');
  return [target, asSource, asSource.replace(/\.ts$/, '/index.ts')];
}

describe('every script imports something that exists', () => {
  it('finds the scripts at all', () => {
    // Without this, a renamed directory turns the whole suite into a silent
    // pass over an empty list.
    expect(scripts).toContain('check-roster.mjs');
    expect(scripts.length).toBeGreaterThanOrEqual(5);
  });

  it.each(scripts)('%s', (script) => {
    const source = readFileSync(resolve(scriptsDir, script), 'utf8');
    const specifiers = [...source.matchAll(SPECIFIER)].map((m) => m[1] as string);
    expect(specifiers.length).toBeGreaterThan(0);

    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) continue;

      if (specifier.startsWith('.')) {
        const target = resolve(scriptsDir, specifier);
        const candidates = sourceFor(target);
        expect(
          candidates.some((c) => existsSync(c)),
          `${script} imports '${specifier}', and none of these exist:\n  ${candidates.join('\n  ')}`,
        ).toBe(true);
        continue;
      }

      // A workspace package: check the package is real, not that it is built.
      const workspace = specifier.startsWith('@umalegacies/')
        ? resolve(packagesDir, specifier.slice('@umalegacies/'.length), 'package.json')
        : null;
      if (workspace !== null) {
        expect(existsSync(workspace), `${script} imports missing workspace '${specifier}'`).toBe(
          true,
        );
      }
    }
  });
});
