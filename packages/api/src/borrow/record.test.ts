import { describe, expect, it } from 'vitest';
import { packageFromRecord, recordKey, type UmaMoeInheritance } from './record.js';
import { BORROWED_RECORD } from './fixture.js';

/**
 * The adapter, checked against a real record's own arithmetic.
 *
 * The risk here is not a crash. It is a package that composes, scores and
 * renders while quietly seating a grandparent as a parent or dropping a
 * lineage's second blue -- all of which produce a confident, plausible, wrong
 * number that nothing downstream can detect.
 */

const record = (over: Partial<UmaMoeInheritance> = {}) => ({
  inheritance: { ...BORROWED_RECORD, ...over },
});

describe('one record becomes one VeteranPackage', () => {
  it('seats the veteran itself as self and its two parents below it', () => {
    const pkg = packageFromRecord(record());
    expect(pkg?.self.cardId).toBe(105101);
    expect(pkg?.parents[0]?.cardId).toBe(100501);
    expect(pkg?.parents[1]?.cardId).toBe(101001);
  });

  it('carries each slot its OWN win saddles, not the lineage’s', () => {
    // The three arrays overlap heavily -- a strong lineage tends to have won
    // the same races -- so a bug that handed every slot the same list would
    // look right at a glance. These two differ in length and in content.
    const pkg = packageFromRecord(record());
    expect(pkg?.self.winSaddleIds).toEqual(BORROWED_RECORD.main_win_saddles);
    expect(pkg?.parents[0]?.winSaddleIds).toEqual(BORROWED_RECORD.left_win_saddles);
    expect(pkg?.self.winSaddleIds).not.toEqual(pkg?.parents[0]?.winSaddleIds);
  });

  it('copies the saddles rather than aliasing the response', () => {
    // The response object is transient and the package outlives it; sharing the
    // array would let a later mutation of one reach the other.
    const source = record();
    const pkg = packageFromRecord(source);
    expect(pkg?.self.winSaddleIds).not.toBe(source.inheritance.main_win_saddles);
  });

  it('gathers a slot’s four spark kinds into one factor list', () => {
    const pkg = packageFromRecord(record());
    expect(pkg?.self.factorIds).toEqual([
      BORROWED_RECORD.main_blue_factors,
      BORROWED_RECORD.main_pink_factors,
      BORROWED_RECORD.main_green_factors,
      ...BORROWED_RECORD.main_white_factors,
    ]);
  });
});

describe('what their summed arrays say we should have read', () => {
  /*
   * THE STRONGEST CHECK IN THIS FILE, because it does not compare our output
   * to our own expectation. `blue_sparks`, `pink_sparks`, `green_sparks` and
   * `white_sparks` are uma.moe's own lineage totals, computed by them; each
   * entry is `groupId * 100 + (stars summed across the three slots)`.
   * Rebuilding them from the per-slot factor ids the adapter read is our
   * arithmetic against theirs, and it can only agree if every slot was read,
   * read once, and read into the right slot.
   *
   * Verified the same way against 500 live records before this fixture was
   * chosen: 500/500 on all four kinds, and 21,386/21,386 factor ids resolved
   * in our own extract.
   */
  const summedFromSlots = (pkg: NonNullable<ReturnType<typeof packageFromRecord>>) => {
    const stars = new Map<number, number>();
    for (const ref of [pkg.self, ...pkg.parents]) {
      for (const factorId of ref?.factorIds ?? []) {
        const group = Math.floor(factorId / 100);
        stars.set(group, (stars.get(group) ?? 0) + (factorId % 100));
      }
    }
    return [...stars].map(([group, n]) => group * 100 + n).sort((a, b) => a - b);
  };

  it('reproduces every kind’s lineage totals exactly', () => {
    const pkg = packageFromRecord(record());
    const theirs = [
      ...BORROWED_RECORD.blue_sparks,
      ...BORROWED_RECORD.pink_sparks,
      ...BORROWED_RECORD.green_sparks,
      ...BORROWED_RECORD.white_sparks,
    ].sort((a, b) => a - b);
    expect(summedFromSlots(pkg as NonNullable<typeof pkg>)).toEqual(theirs);
  });

  it('keeps BOTH blues when the lineage carries two different ones', () => {
    // The case a hand-written fixture would have missed. This record's blues
    // are Speed 3 + Speed 2 on two slots and a different type at 3 on the
    // third, so their own array is [305, 503] -- two entries, not one.
    expect(BORROWED_RECORD.blue_sparks).toHaveLength(2);
    const pkg = packageFromRecord(record()) as NonNullable<ReturnType<typeof packageFromRecord>>;
    const blues = summedFromSlots(pkg).filter((id) => BORROWED_RECORD.blue_sparks.includes(id));
    expect(blues).toEqual([...BORROWED_RECORD.blue_sparks].sort((a, b) => a - b));
  });
});

describe('a record that is not a whole lineage', () => {
  it('leaves a missing parent null rather than inventing a slot', () => {
    // Legitimate, not malformed: a veteran can have fewer than two known
    // parents, and the engine already renders an empty slot for one.
    const pkg = packageFromRecord(record({ parent_left_id: 0 }));
    expect(pkg?.parents[0]).toBeNull();
    expect(pkg?.parents[1]?.cardId).toBe(101001);
  });

  it('drops a zero factor id instead of passing it on as unknown', () => {
    // A slot with no blue reports 0. Forwarded, `MasterData.factor` would fail
    // to resolve it and the reader would be told their extract is missing a
    // spark, which is a claim about their game data rather than about this uma.
    const pkg = packageFromRecord(record({ main_blue_factors: 0 }));
    expect(pkg?.self.factorIds).not.toContain(0);
    expect(pkg?.self.factorIds?.[0]).toBe(BORROWED_RECORD.main_pink_factors);
  });

  it('is nothing at all when there is no veteran to seat', () => {
    expect(packageFromRecord(null)).toBeNull();
    expect(packageFromRecord(undefined)).toBeNull();
    expect(packageFromRecord({})).toBeNull();
    expect(packageFromRecord({ inheritance: null })).toBeNull();
    expect(packageFromRecord(record({ main_parent_id: 0 }))).toBeNull();
  });
});

describe('the dedupe key', () => {
  it('is their row id when there is one, and null when there is not', () => {
    expect(recordKey({ inheritance: { ...BORROWED_RECORD, inheritance_id: 77 } })).toBe(77);
    expect(recordKey(record())).toBeNull();
    expect(recordKey({})).toBeNull();
  });
});
