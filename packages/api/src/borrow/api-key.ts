import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@umalegacies/core';

/**
 * THE KEY, AND THE ONE PLACE IT IS ALLOWED TO EXIST.
 *
 * uma.moe protects its API against scraping and offers two ways past the gate:
 * an `X-Browser-Proof` token, which its own frontend obtains through a
 * Turnstile exchange, or an `X-API-Key`, which its docs describe as being "for
 * server-to-server access and usage tracking". This project takes the second,
 * and that single fact is why the borrow release needs a server at all. A key
 * shipped to a browser is a key published: it would sit in the bundle, in the
 * devtools network tab and in anyone's cache.
 *
 * So this module lives in `packages/api` and is imported from nowhere else.
 * `packages/web/src/no-api-imports.test.ts` already fails the build if the web
 * package reaches into this one, which makes "the key never reaches the client"
 * a property of the module graph rather than a rule someone has to remember.
 *
 * TWO SOURCES, BECAUSE THERE ARE TWO RUNTIMES.
 *
 * `UMA_MOE_API_KEY` is what a Vercel function gets, since a deployment has no
 * home directory to read and secrets arrive as environment variables. The file
 * at `~/.umalegacies-uma-moe-key` is what local development gets, and it is
 * deliberately OUTSIDE the repository: `.gitignore` covers `.env*`, but a key
 * in the working tree is a key one `git add -A` away from being published, and
 * `.vercelignore` is an allowlist that would have to be trusted to keep it out
 * of a deployment too. Outside the repo, neither question arises.
 *
 * ROTATION IS A ONE-FILE SWAP, which is the point of reading it at call time
 * rather than at module load. uma.moe issues keys from an account page --
 * `GET /api/v1` says so in its own words: "API keys can be generated from your
 * Uma account at any time" -- so rotating means generating a new one there,
 * overwriting this file, and nothing else. No redeploy, no restart, no code
 * change. The key in use on 2026-09-29 was pasted into a chat transcript on
 * 2026-09-18 and wants replacing on exactly that path.
 *
 * NOT CACHED, for the same reason. A module-level constant would pin the old
 * key for the life of the process, so the swap above would not take effect
 * until a restart. One `readFileSync` of 54 bytes per outbound search is not
 * a cost worth trading that for.
 */

/** Where a local checkout keeps it. Absolute, outside the repository. */
export const KEY_FILE = join(homedir(), '.umalegacies-uma-moe-key');

/** The environment variable a deployment carries it in. */
export const KEY_ENV = 'UMA_MOE_API_KEY';

export class UmaMoeKeyMissing extends DomainError {
  constructor(tried: readonly string[]) {
    super(
      'UMA_MOE_KEY_MISSING',
      'No uma.moe API key. Generate one from your Uma account at uma.moe, then ' +
        `write it to ${KEY_FILE} (chmod 600) or set ${KEY_ENV}.\ntried:\n  ${tried.join('\n  ')}`,
    );
  }
}

/**
 * The key, or a refusal that says how to fix it.
 *
 * @param from  overrides for the two sources. Exists so the tests can exercise
 *   precedence and the missing case without touching the developer's real key
 *   -- a test that read `~/.umalegacies-uma-moe-key` would pass on this machine
 *   and fail on every other one, and a test that had to DELETE it to check the
 *   refusal is not a test worth having.
 * @throws UmaMoeKeyMissing when neither source has one. Named rather than
 *   swallowed: a borrow search that silently returned nothing would read as
 *   "nobody is lending a veteran like that", which is a claim about the pool
 *   rather than about this deployment's configuration.
 */
export function umaMoeApiKey(from: { env?: Record<string, string | undefined>; keyFile?: string } = {}): string {
  const env = from.env ?? process.env;
  const keyFile = from.keyFile ?? KEY_FILE;

  // ENVIRONMENT FIRST. A deployment has both a variable and, conceivably, a
  // stale file in an image; the variable is the one an operator just set.
  const fromEnv = env[KEY_ENV]?.trim();
  if (fromEnv) return fromEnv;

  try {
    const fromFile = readFileSync(keyFile, 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    // Missing, unreadable or a directory. Which of those it was does not change
    // the advice, and the message below lists both places it looked.
  }

  throw new UmaMoeKeyMissing([`$${KEY_ENV}`, keyFile]);
}
