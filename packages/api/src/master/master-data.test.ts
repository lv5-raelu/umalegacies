import { describe, expect, it } from 'vitest';
import { MasterData } from '@umalegacies/core';
import { extractDatabase, extractMaster, readTables } from './master-extract.js';

describe('charaIdFor', () => {
  it('joins card_data rather than dividing by 100', () => {
    const master = new MasterData(readTables(extractDatabase()));

    // The ordinary case, where division would also have worked.
    expect(master.charaIdFor(101601)).toBe(1016);

    // The two cards that make the division wrong. 9100101 / 100 is 91001,
    // which is not a chara_id at all and would find zero relation rows.
    expect(master.charaIdFor(9100101)).toBe(1001);
    expect(master.charaIdFor(9101101)).toBe(1011);
    expect(Math.floor(9100101 / 100)).not.toBe(master.charaIdFor(9100101));
  });

  it('returns null for an unknown card, so callers can report it', () => {
    // This null becomes resolution { ok: false, reason: 'unknown_card' } in
    // the explain tree, never a bare 0.
    expect(new MasterData(readTables(extractDatabase())).charaIdFor(999999)).toBeNull();
  });
});

/**
 * careerRankTier is a band lookup, and the project's own learning says a
 * boundary function needs assertions AT the limit and one step either side --
 * an interior spot-check passes just as happily against `>` where `>=` was
 * meant. Bands are read from the committed extract rather than hardcoded, so
 * this keeps testing the real table after a re-extraction.
 */
describe('careerRankTier: band edges', () => {
  const master = extractMaster();
  const bands = extractDatabase()
    .prepare('SELECT id, min_value, max_value FROM single_mode_rank ORDER BY min_value')
    .all() as Array<{ id: number; min_value: number; max_value: number }>;

  it('reads the bands it is about to assert on', () => {
    expect(bands.length).toBe(98);
  });

  // Skip the first band: its lower edge is 0 and has no "one step below".
  it.each(bands.slice(1, 6).map((b) => [b.id, b.min_value, b.max_value]))(
    'band %i includes both its edges and excludes one step either side',
    (id, min, max) => {
      expect(master.careerRankTier(min as number)).toBe(id);
      expect(master.careerRankTier(max as number)).toBe(id);
      expect(master.careerRankTier((min as number) - 1)).not.toBe(id);
      expect(master.careerRankTier((max as number) + 1)).not.toBe(id);
    },
  );

  it('places a score below every band and above every band', () => {
    expect(master.careerRankTier(-1)).toBeNull();
    const last = bands[bands.length - 1] as { id: number; max_value: number };
    expect(master.careerRankTier(last.max_value)).toBe(last.id);
    // Past the top of the extract's own table there is no band, and saying so
    // beats silently returning the highest one.
    expect(master.careerRankTier(last.max_value + 1)).toBeNull();
  });
});
