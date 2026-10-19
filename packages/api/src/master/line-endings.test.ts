import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../deploy.test-utils.js';

/**
 * Value: protects=master-extract.sql is never line-ending converted on checkout;
 * fails_when=the .gitattributes line is removed or loosened to `text`;
 * why_new=nothing else reads .gitattributes; seam=none;
 * no_claim=does not run a CRLF checkout, it asks git which attribute applies.
 *
 * The API hashes the extract's raw bytes and master.json embeds the hash of the
 * LF file, so a checkout with core.autocrlf would fail every request as a stale
 * master. `git check-attr` reads the same rules a checkout obeys.
 */
describe('the master extract keeps its bytes on any checkout', () => {
  it('has the text attribute unset, so git never converts its line endings', () => {
    const out = execFileSync(
      'git',
      ['check-attr', 'text', '--', 'packages/api/data/master-extract.sql'],
      { cwd: repoRoot(), encoding: 'utf8' },
    );
    expect(out.trim()).toBe('packages/api/data/master-extract.sql: text: unset');
  });
});
