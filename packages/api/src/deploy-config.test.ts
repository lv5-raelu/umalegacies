import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './deploy.test-utils.js';

/**
 * What `vercel.json` must say, and what it must agree with.
 *
 * Half of this pins facts that were MEASURED against Vercel on 2026-09-17 and
 * cannot be recovered by reading the docs -- in two cases the docs are actively
 * misleading. The other half reads a second source and fails naming the drift,
 * which is the `required-tables.test.ts` pattern: the bug this repo has already
 * had once is two files quietly disagreeing.
 *
 *   vercel.json ──┬── entrypoint ────────► tsconfig outDir + main.ts   (must agree)
 *                 ├── includeFiles ──────► the file on disk            (must exist)
 *                 ├── outputDirectory ───► vite's actual output dir    (must agree)
 *                 ├── buildCommand ──────► the workspace's npm script  (must exist)
 *                 └── rewrites ──────────► /api first, catch-all last  (order matters)
 */

interface ServiceConfig {
  root: string;
  runtime?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  entrypoint?: string;
  functions?: Record<string, { includeFiles?: string; excludeFiles?: string }>;
}

interface VercelConfig {
  regions?: string[];
  services?: Record<string, ServiceConfig>;
  rewrites?: Array<{ source: string; destination: { service?: string } | string }>;
}

const root = repoRoot();
const config = JSON.parse(
  readFileSync(resolve(root, 'vercel.json'), 'utf8'),
) as VercelConfig;

const api = config.services?.api as ServiceConfig;
const web = config.services?.web as ServiceConfig;

function packageJson(workspace: string): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(resolve(root, workspace, 'package.json'), 'utf8'));
}

describe('vercel.json pins what the platform actually accepts', () => {
  /**
   * Measured 2026-09-17: a deploy carrying `"runtime": "nodejs24.x"` fails with
   * `Service "api" has invalid runtime "nodejs24.x"`. The published schema's own
   * description says 'e.g. nodejs24.x', so the docs and the validator disagree
   * and the validator wins. Pinned here so nobody "corrects" it back.
   */
  it('uses runtime "node", which the schema description gets wrong', () => {
    expect(api.runtime).toBe('node');
  });

  /**
   * Measured 2026-09-17: omitting it fails with `Service "api" detected
   * framework "node" ... and must specify an "entrypoint" for runtime "node"`.
   */
  it('declares an entrypoint, which a node service cannot omit', () => {
    expect(api.entrypoint, 'a node service without an entrypoint fails the build').toBeTruthy();
  });

  /** Hobby is single-region, and sin1 is ap-southeast-1. */
  it('pins the function region to Singapore', () => {
    expect(config.regions).toEqual(['sin1']);
  });
});

describe('vercel.json routing', () => {
  /**
   * Order is the whole rule. The catch-all matches /api/... too, so if it came
   * first the SPA would swallow every API request and the failure would look
   * like a missing route rather than a misordered table.
   */
  it('routes /api before the catch-all, never after', () => {
    const sources = (config.rewrites ?? []).map((r) => r.source);
    const apiAt = sources.findIndex((s) => s.startsWith('/api'));
    const catchAllAt = sources.findIndex((s) => s === '/(.*)');

    expect(apiAt, 'no /api rewrite: every API request would hit the SPA').toBeGreaterThanOrEqual(0);
    expect(catchAllAt, 'no catch-all: the SPA would not be served').toBeGreaterThanOrEqual(0);
    expect(apiAt, 'the catch-all shadows /api — the API is unreachable').toBeLessThan(catchAllAt);
  });

  it('sends the two rewrites to the two declared services', () => {
    const byService = (config.rewrites ?? []).map((r) =>
      typeof r.destination === 'string' ? r.destination : r.destination.service,
    );
    expect(byService).toEqual(['api', 'web']);
    expect(Object.keys(config.services ?? {}).sort()).toEqual(['api', 'web']);
  });
});

describe('vercel.json agrees with the repository it describes', () => {
  it('points each service at a directory that exists', () => {
    for (const [name, service] of Object.entries(config.services ?? {})) {
      expect(existsSync(resolve(root, service.root)), `service ${name}: ${service.root}`).toBe(true);
    }
  });

  /**
   * The entrypoint is produced by the build, so it cannot be checked on disk in
   * a clean clone. Check it against the two sources that DETERMINE it instead:
   * the compiler's outDir and the file tsc is pointed at.
   */
  it('names an entrypoint the API build actually produces', () => {
    const tsconfig = readFileSync(resolve(root, 'packages/api/tsconfig.json'), 'utf8');
    const outDir = /"outDir"\s*:\s*"([^"]+)"/.exec(tsconfig)?.[1];
    expect(outDir, 'packages/api/tsconfig.json has no outDir').toBeTruthy();

    expect(
      api.entrypoint,
      `entrypoint ${api.entrypoint} does not match tsconfig outDir ${outDir}/`,
    ).toBe(`${outDir}/main.js`);

    expect(
      existsSync(resolve(root, 'packages/api/src/main.ts')),
      'src/main.ts is gone, so dist/main.js will not be produced',
    ).toBe(true);
  });

  /**
   * How the extract reaches the function bundle.
   *
   * NOT via `functions.includeFiles`. Measured 2026-09-17 against a real
   * `vercel build`: that key is parsed and schema-validated (a bogus sibling
   * field is rejected by name) and then has NO effect on a captured server --
   * 1,007 files bundled, zero of them .sql. Adding a literal, statically
   * analysable read to master-extract.ts put it in the bundle.
   *
   * The package is ESM (NestJS 12 is ESM-only), so the shape is
   * `new URL('...', import.meta.url)` rather than `resolve(__dirname, '...')`.
   * Both are forms the tracer can evaluate; a computed path is not.
   *
   * This test guards that shape. Rewriting it back into the probe would ship a
   * deployment that boots and then 500s on every request.
   */
  it('keeps the tracer-visible literal that puts the extract in the bundle', () => {
    const source = readFileSync(
      resolve(root, 'packages/api/src/master/master-extract.ts'),
      'utf8',
    );

    const literal = /new URL\(\s*'([^']+master-extract\.sql)',\s*import\.meta\.url\s*\)/.exec(
      source,
    );
    expect(
      literal,
      'master-extract.ts no longer has a literal new URL(..., import.meta.url) ' +
        'for the extract. @vercel/nft cannot see computed paths, so the ' +
        'deployment would ship without its database.',
    ).toBeTruthy();

    // The literal is relative to the COMPILED file (dist/master/), not the source.
    const fromDist = resolve(root, 'packages/api/dist/master', literal?.[1] as string);
    expect(
      fromDist,
      'the literal does not point at the committed extract once compiled',
    ).toBe(resolve(root, 'packages/api/data/master-extract.sql'));

    expect(
      new RegExp(`readFileSync\\(\\s*${'BUNDLED_EXTRACT'}`).test(source),
      'the literal path is never actually read, so the tracer has no asset to follow',
    ).toBe(true);
  });

  it('does not ask Vercel to bundle the artwork caches', () => {
    // If includeFiles is ever reinstated, `data/**` would match data/portraits
    // and data/rank-icons: 2.5 MB of images in a bundle that serves JSON. They
    // belong on the CDN via packages/web/public.
    const included = api.functions?.[api.entrypoint as string]?.includeFiles;
    if (included !== undefined) {
      expect(included).not.toBe('data/**');
      expect(included.startsWith('data/portraits')).toBe(false);
      expect(included.startsWith('data/rank-icons')).toBe(false);
    }
  });

  it('names build commands each workspace actually defines', () => {
    for (const [name, service] of Object.entries(config.services ?? {})) {
      const command = service.buildCommand;
      expect(command, `service ${name} relies on inference; Decision 3 says do not`).toBeTruthy();

      const script = /^npm run (\S+)$/.exec(command as string)?.[1];
      expect(script, `service ${name}: cannot tell which npm script "${command}" runs`).toBeTruthy();
      expect(
        packageJson(service.root).scripts?.[script as string],
        `service ${name}: ${service.root} has no "${script}" script`,
      ).toBeTruthy();
    }
  });

  /** Vite's default assetsDir is `assets`, which is why the API lives under /api. */
  it('serves the web build from the directory vite writes to', () => {
    const viteConfig = readFileSync(resolve(root, 'packages/web/vite.config.ts'), 'utf8');
    const outDir = /outDir\s*:\s*['"]([^'"]+)['"]/.exec(viteConfig)?.[1] ?? 'dist';
    expect(web.outputDirectory, 'outputDirectory disagrees with vite.config.ts').toBe(outDir);
  });
});
