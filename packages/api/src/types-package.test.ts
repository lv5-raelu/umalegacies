import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TYPES_SRC = resolve(__dirname, '../../types/src');

/**
 * @umalegacies/types is consumed straight from TypeScript source with no build
 * step. That works only while every export is a TYPE, which erases at the import
 * site and leaves no `require` behind.
 *
 * A single runtime export there would compile cleanly, pass every test, ship,
 * and then crash the built API at startup: `dist/` would carry a real
 * `require('@umalegacies/types')`, which resolves to `src/index.ts`, which Node
 * cannot execute. Nothing else in the toolchain catches it -- tests run from
 * TypeScript sources and never touch `dist/` -- so it is caught here instead.
 */
describe('the shared types package stays types-only', () => {
  const files = readdirSync(TYPES_SRC).filter((f) => f.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s exports no runtime value', (file) => {
    const source = readFileSync(resolve(TYPES_SRC, file), 'utf8');
    // Strip comments first: the file explains this rule in prose, and the words
    // "export const" inside that explanation must not trip the check.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const offenders = [...code.matchAll(/^\s*export\s+(?!type\b|interface\b)(\w+)/gm)].map(
      (m) => m[1],
    );
    expect(offenders, `runtime export(s) in types/src/${file}`).toEqual([]);
  });
});
