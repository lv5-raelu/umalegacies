import { describe, expect, it } from 'vitest';
import { CACHE_VERSION, explainDiscard, inspectCache, type CachedRoster } from './cache-policy';

/**
 * When a roster found on disk may be used.
 *
 * The cache exists so a reload does not cost a trip to the file picker. The
 * risk it introduces is the opposite of the one it solves: a restore that
 * succeeds against the WRONG game data would put stale numbers on screen with
 * no sign anything was off, and the whole product is the numbers.
 */

const HASH = '0451b16eebb0fc7cb28461f43ab780d963838718f5b4a9cf1fdd7214cf273ecd';
const OTHER = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function veteran(cardId: number) {
  return { score: 18998, self: { cardId, factorIds: [1], winSaddleIds: [1] }, parents: [null, null] };
}

function record(over: Partial<CachedRoster> = {}): unknown {
  const veterans = [veteran(100601), veteran(101401)];
  return {
    version: CACHE_VERSION,
    masterHash: HASH,
    fileName: 'data.json',
    savedAt: 1_789_700_000_000,
    veterans,
    skipped: [],
    trainees: [{ cardId: 100601, charaId: 1006, name: 'Oguri Cap', costume: null, ambiguous: false }],
    resolved: {
      masterHash: HASH,
      veterans: veterans.map((_, index) => ({ index })),
      unresolvedCount: 0,
    },
    ...over,
  };
}

describe('a roster restored from this browser', () => {
  it('is used when it matches the extract the server is serving', () => {
    const verdict = inspectCache(record(), HASH);
    expect(verdict.use).toBe(true);
    if (verdict.use) expect(verdict.record.fileName).toBe('data.json');
  });

  it('is used before the current hash is known, so the restore is not blocked on a request', () => {
    // The caller passes null while it is still fetching, then checks again.
    expect(inspectCache(record(), null).use).toBe(true);
  });

  it('is refused when the game data has moved underneath it', () => {
    const verdict = inspectCache(record(), OTHER);
    expect(verdict).toEqual({ use: false, reason: 'stale-master' });
  });

  it('is refused when written by a different build', () => {
    expect(inspectCache(record({ version: CACHE_VERSION - 1 }), HASH)).toEqual({
      use: false,
      reason: 'version',
    });
  });

  it.each([
    ['nothing stored', null, 'absent'],
    ['undefined', undefined, 'absent'],
  ])('reports %s as an ordinary miss', (_label, stored, reason) => {
    expect(inspectCache(stored, HASH)).toEqual({ use: false, reason });
  });
});

describe('a record that is present but not trustworthy', () => {
  /**
   * A write can be interrupted -- quota, a killed tab, a browser upgrade -- and
   * the version number survives that while the payload does not. Checking the
   * shape rather than the stamp is the difference between a clean miss and a
   * screen of undefined names.
   */
  it.each([
    ['no masterHash', { masterHash: undefined }],
    ['an empty masterHash', { masterHash: '' }],
    ['no veterans array', { veterans: undefined }],
    ['no trainees array', { trainees: undefined }],
    ['no resolved payload', { resolved: undefined }],
    ['a resolved payload with no veterans', { resolved: { masterHash: HASH } }],
    ['no savedAt', { savedAt: undefined }],
  ])('refuses a record with %s', (_label, over) => {
    expect(inspectCache(record(over as Partial<CachedRoster>), HASH)).toEqual({
      use: false,
      reason: 'malformed',
    });
  });

  it('refuses a truncated write, where the two halves disagree on length', () => {
    // The input list and the resolved list are written together and joined by
    // index. Different lengths mean the join is wrong, and `index` is what maps
    // a picked card back to the package that gets sent for explanation.
    const truncated = record({
      resolved: { masterHash: HASH, veterans: [{ index: 0 }], unresolvedCount: 0 },
    } as unknown as Partial<CachedRoster>);
    expect(inspectCache(truncated, HASH)).toEqual({ use: false, reason: 'malformed' });
  });

  it('refuses a record whose own two hashes disagree', () => {
    // Written together, so this cannot happen to a correct record. It means the
    // record was assembled wrong, not that the game moved -- so it is malformed
    // rather than stale, and saying so keeps the stale message honest.
    const mixed = record({ resolved: { masterHash: OTHER, veterans: [{ index: 0 }, { index: 1 }], unresolvedCount: 0 } } as unknown as Partial<CachedRoster>);
    expect(inspectCache(mixed, HASH)).toEqual({ use: false, reason: 'malformed' });
  });

  it('refuses entries that are not veterans', () => {
    expect(inspectCache(record({ veterans: [1, 2] } as unknown as Partial<CachedRoster>), HASH)).toEqual({
      use: false,
      reason: 'malformed',
    });
  });
});

describe('what the user is told', () => {
  it('explains a stale extract, because their numbers would have changed', () => {
    const message = explainDiscard(inspectCache(record(), OTHER));
    expect(message).toContain('game data has been updated');
    expect(message).toContain('Load your file again');
  });

  it.each([
    ['a first visit', inspectCache(null, HASH)],
    ['an app update', inspectCache(record({ version: 0 }), HASH)],
    ['a usable record', inspectCache(record(), HASH)],
  ])('says nothing about %s', (_label, verdict) => {
    expect(explainDiscard(verdict)).toBeNull();
  });
});
