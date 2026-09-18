import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './deploy.test-utils.js';

/**
 * The API's prefix and the web client's base path must agree.
 *
 * Nothing at runtime checks this. `setGlobalPrefix('api')` moves every route on
 * one side; `API_BASE` builds every URL on the other. If they disagree the
 * deployed app 404s on every request while BOTH files look correct read alone,
 * and no test in either suite hits an HTTP route, so it ships green.
 *
 *   packages/api/src/main.ts       setGlobalPrefix('api')  ──┐
 *                                                            ├─► must match
 *   packages/web/src/api/client.ts API_BASE = '/api'       ──┘
 *
 * It reads the two SOURCES rather than standing up a Nest application, which is
 * deliberate. The prefix is a runtime call, not route metadata, so a test that
 * imported the controllers could not see it; and importing Nest into
 * packages/web would put api source in the web build (see
 * packages/web/src/no-api-imports.test.ts for what that costs). Reading both
 * files is the same shape as `required-tables.test.ts`, which exists because
 * two files quietly disagreeing has already bitten this repository once.
 */

const root = repoRoot();
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

const mainTs = read('packages/api/src/main.ts');
const clientTs = read('packages/web/src/api/client.ts');
const viteConfig = read('packages/web/vite.config.ts');

/** `app.setGlobalPrefix(API_PREFIX)` with `const API_PREFIX = 'api'`. */
function apiPrefix(): string {
  const constant = /const\s+API_PREFIX\s*=\s*'([^']+)'/.exec(mainTs)?.[1];
  const used = /setGlobalPrefix\(\s*(?:API_PREFIX|'([^']+)')\s*\)/.exec(mainTs);
  expect(used, 'packages/api/src/main.ts no longer calls setGlobalPrefix').toBeTruthy();
  const literal = used?.[1];
  const prefix = literal ?? constant;
  expect(prefix, 'could not determine the global prefix from main.ts').toBeTruthy();
  return prefix as string;
}

/** The default in `API_BASE = import.meta.env.VITE_API_BASE ?? '/api'`. */
function clientBase(): string {
  const base = /const\s+API_BASE\s*=\s*import\.meta\.env\.VITE_API_BASE\s*\?\?\s*'([^']*)'/.exec(
    clientTs,
  )?.[1];
  expect(base, 'packages/web/src/api/client.ts no longer defines API_BASE').toBeTruthy();
  return base as string;
}

describe('the web client and the API agree on where the API lives', () => {
  it('builds URLs at the prefix the API actually mounts', () => {
    const prefix = apiPrefix();
    const base = clientBase();
    expect(
      base,
      `client.ts builds URLs under "${base}" but main.ts mounts every route ` +
        `under "/${prefix}". Every request would 404 in production.`,
    ).toBe(`/${prefix}`);
  });

  it('uses a same-origin path, not an absolute origin', () => {
    const base = clientBase();
    expect(
      /^https?:\/\//.test(base),
      `API_BASE is "${base}", an absolute origin. The app and the API share ` +
        'one Vercel domain; an absolute default reintroduces cross-origin ' +
        'requests and the CORS allowlist that was deleted with them.',
    ).toBe(false);
    expect(base.startsWith('/'), 'API_BASE must be a root-relative path').toBe(true);
  });

  /**
   * The oversized-body parser is Express middleware, not a Nest route, so
   * `setGlobalPrefix` does NOT move it. Mounted at the unprefixed path it stops
   * matching and the 256 KB global parser silently takes over -- a roster
   * upload then fails at 256 KB with every comment promising megabytes.
   */
  it('mounts the roster body parser at the prefixed path', () => {
    const mount = /app\.use\(\s*`?\/(?:\$\{API_PREFIX\}|api)\/roster\/resolve`?/.test(mainTs);
    expect(
      mount,
      'the roster body-parser mount is not under the API prefix. ' +
        'setGlobalPrefix moves Nest routes, never app.use() mounts, so this ' +
        'middleware would stop matching and the 256 KB parser would win.',
    ).toBe(true);
  });

  /**
   * Vercel rejects a body over 4.5 MB at the edge, before this process runs, so
   * error.filter.ts never sees it and the client gets a platform error page
   * where every other failure is an ErrorResponse.
   */
  it('keeps the roster limit under the platform cap so our error shape wins', () => {
    const limit = /roster\/resolve`?,\s*json\(\{\s*limit:\s*'(\d+)mb'/.exec(mainTs)?.[1];
    expect(limit, 'could not read the roster body limit from main.ts').toBeTruthy();
    expect(
      Number(limit),
      `the roster limit is ${limit} MB but Vercel rejects bodies over 4.5 MB ` +
        'at the edge. Anything at or above that hands the user a platform ' +
        'error page instead of PAYLOAD_TOO_LARGE.',
    ).toBeLessThan(4.5);
  });

  /**
   * Locally, Vite's proxy plays the part vercel.json's rewrite plays in
   * production: it is what makes `API_BASE = '/api'` reachable from the one
   * port the browser talks to. Renaming the prefix without moving the proxy
   * leaves the deployed app working and the local one 404ing on every request,
   * which is the worse way round -- you would not find it until someone else
   * pulled the branch.
   */
  it('proxies the same path locally that the client asks for', () => {
    const proxied = /proxy:\s*\{\s*'([^']+)'/.exec(viteConfig)?.[1];
    expect(
      proxied,
      'packages/web/vite.config.ts has no server.proxy entry. Without it the ' +
        'browser cannot reach the API from the Vite port, and local ' +
        'development stops being same-origin.',
    ).toBeTruthy();
    expect(
      proxied,
      `vite proxies "${proxied}" but the client requests "${clientBase()}"`,
    ).toBe(clientBase());
  });

  /** One origin means the allowlist has nothing to do. */
  it('no longer configures CORS', () => {
    expect(
      /enableCors|CORS_ORIGINS/.test(mainTs),
      'main.ts configures CORS again. The app and the API share an origin, so ' +
        'an allowlist here is either dead code or a sign the deployment shape ' +
        'changed back to two domains.',
    ).toBe(false);
  });
});
