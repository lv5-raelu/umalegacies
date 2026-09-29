import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEY_ENV, KEY_FILE, UmaMoeKeyMissing, umaMoeApiKey } from './api-key.js';

/**
 * The key's two sources, and the refusal when there are none.
 *
 * Nothing here reads the developer's real key. `umaMoeApiKey` takes both
 * sources as overrides for exactly that reason: a test that depended on
 * `~/.umalegacies-uma-moe-key` would pass here and fail in CI, and one that
 * had to remove it to check the missing case would be worse than no test.
 */

const withFile = (contents: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'uma-key-')), 'key');
  writeFileSync(path, contents);
  return path;
};

describe('where the key comes from', () => {
  it('prefers the environment, which is what a deployment sets', () => {
    const keyFile = withFile('from-the-file');
    expect(umaMoeApiKey({ env: { [KEY_ENV]: 'from-the-env' }, keyFile })).toBe('from-the-env');
  });

  it('falls back to the file, which is what a checkout has', () => {
    const keyFile = withFile('from-the-file');
    expect(umaMoeApiKey({ env: {}, keyFile })).toBe('from-the-file');
  });

  it('trims, because an editor adds a newline and a header must not carry one', () => {
    expect(umaMoeApiKey({ env: {}, keyFile: withFile('  padded\n') })).toBe('padded');
    expect(umaMoeApiKey({ env: { [KEY_ENV]: ' spaced ' }, keyFile: '/nope' })).toBe('spaced');
  });

  it('treats an empty value as absent rather than as a key', () => {
    // An exported-but-unset variable arrives as "". Sent as a header it would
    // produce a 403 from uma.moe, which reads as "they refused us" rather than
    // "this machine has no key".
    expect(() => umaMoeApiKey({ env: { [KEY_ENV]: '   ' }, keyFile: withFile('\n') })).toThrow(
      UmaMoeKeyMissing,
    );
  });
});

describe('when there is no key at all', () => {
  it('says so by name, and says how to fix it', () => {
    // A borrow search returning nothing quietly would read as a fact about the
    // pool. This has to be a refusal the UI can name.
    let thrown: unknown;
    try {
      umaMoeApiKey({ env: {}, keyFile: '/definitely/not/a/key' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UmaMoeKeyMissing);
    const message = (thrown as UmaMoeKeyMissing).message;
    expect((thrown as UmaMoeKeyMissing).code).toBe('UMA_MOE_KEY_MISSING');
    // The two things a reader needs: where to get one, and where to put it.
    expect(message).toContain('uma.moe');
    expect(message).toContain(KEY_ENV);
    expect(message).toContain('/definitely/not/a/key');
  });
});

describe('where the file lives', () => {
  it('is outside the repository, which is the whole point', () => {
    // `.gitignore` covers `.env*`, but a key inside the working tree is one
    // `git add -A` from being published and would also have to be trusted to
    // the `.vercelignore` allowlist. Outside, neither question arises.
    expect(KEY_FILE).not.toContain('umalegacies/packages');
    expect(KEY_FILE.endsWith('.umalegacies-uma-moe-key')).toBe(true);
  });
});
