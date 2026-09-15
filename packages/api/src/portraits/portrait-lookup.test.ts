import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lookupPortrait } from './portrait-lookup';

const dir = mkdtempSync(resolve(tmpdir(), 'portraits-'));
writeFileSync(resolve(dir, '1006.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
mkdirSync(resolve(dir, '2000.png'));

describe('lookupPortrait', () => {
  it('finds a cached portrait', () => {
    const found = lookupPortrait(dir, '1006');
    expect(found.ok).toBe(true);
    expect(found.ok && found.path).toBe(resolve(dir, '1006.png'));
  });

  it('reports a miss as not_cached, never as an error', () => {
    // The cache is optional and gitignored. Every id in card_data is legitimate
    // whether or not a file exists for it, and a clean clone has none of them.
    expect(lookupPortrait(dir, '1059')).toEqual({ ok: false, reason: 'not_cached' });
  });

  it('refuses anything that is not digits', () => {
    const rejected = [
      '../../data/master-extract',
      '/etc/passwd',
      'a1006',
      '',
      '1006.png',
      '10-06',
      '12345678901',
    ];
    for (const bad of rejected) {
      expect(lookupPortrait(dir, bad), bad).toEqual({ ok: false, reason: 'invalid_id' });
    }
  });

  it('does not serve a directory that happens to be named like a portrait', () => {
    expect(lookupPortrait(dir, '2000')).toEqual({ ok: false, reason: 'not_cached' });
  });
});
