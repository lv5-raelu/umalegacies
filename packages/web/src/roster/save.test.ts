import { describe, expect, it } from 'vitest';
import { SaveError, slimSave } from './save';

/**
 * A save entry, shaped like the real thing including every personal field.
 *
 * The personal fields are present ON PURPOSE. A test that fed clean input would
 * prove nothing about the one property this function exists for.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  trained_chara_id: 331,
  owner_viewer_id: 123456789012,
  nickname_id: 82,
  register_time: '2025-08-05 20:16:16',
  create_time: '2025-08-05 20:16:16',
  card_id: 102701,
  rank_score: 9793,
  speed: 953,
  stamina: 508,
  skill_array: [{ skill_id: 1, level: 1 }],
  race_result_list: [{ race_id: 1 }],
  support_card_list: [{ support_card_id: 1 }],
  win_saddle_id_array: [10, 14],
  factor_info_array: [
    { factor_id: 101, level: 0 },
    { factor_id: 201, level: 0 },
  ],
  succession_chara_array: [
    {
      position_id: 10,
      card_id: 100201,
      owner_viewer_id: 987654321098,
      rank: 12,
      rarity: 2,
      talent_level: 3,
      win_saddle_id_array: [11],
      factor_info_array: [{ factor_id: 301, level: 0 }],
    },
    {
      position_id: 20,
      card_id: 100601,
      owner_viewer_id: 111222333444,
      win_saddle_id_array: [],
      factor_info_array: [],
    },
    { position_id: 11, card_id: 100801, win_saddle_id_array: [], factor_info_array: [] },
  ],
  ...over,
});

describe('slimSave: what is allowed to leave the machine', () => {
  const { veterans: slimmed } = slimSave(JSON.stringify([entry()]));

  it('carries exactly three fields per uma and nothing else', () => {
    const veteran = slimmed[0]!;
    expect(Object.keys(veteran).sort()).toEqual(['parents', 'score', 'self']);
    for (const member of [veteran.self, veteran.parents[0], veteran.parents[1]]) {
      expect(Object.keys(member!).sort()).toEqual(['cardId', 'factorIds', 'winSaddleIds']);
    }
  });

  it('leaves every personal field behind', () => {
    // The whole promise, asserted on the serialised request rather than field by
    // field: nothing personal may appear anywhere in it, under any key.
    const wire = JSON.stringify(slimmed);
    for (const leak of [
      'owner_viewer_id',
      '987654321098',
      '111222333444',
      'trained_chara_id',
      'nickname',
      'register_time',
      'create_time',
      'skill_array',
      'race_result_list',
      'support_card_list',
    ]) {
      expect(wire, `leaked ${leak}`).not.toContain(leak);
    }
  });

  it('takes the veteran itself plus its own slots 10 and 20, and no other slot', () => {
    // THREE umas, not six. Slot 11 in the fixture above is one of this veteran's
    // OWN grandparents and is not part of the package: it would become a
    // great-grandparent in a composed lineage, which the game does not model.
    const veteran = slimmed[0]!;
    expect(veteran.self.cardId).toBe(102701);
    expect(veteran.parents.map((p) => p?.cardId)).toEqual([100201, 100601]);
    expect(JSON.stringify(slimmed)).not.toContain('100801');
  });

  it('keeps the factor ids and drops their level', () => {
    // `level` is 0 on all 1,554 ancestor slots in the builder's roster, so it
    // carries no information and is not worth a wire field.
    expect(slimmed[0]!.self.factorIds).toEqual([101, 201]);
    expect(JSON.stringify(slimmed)).not.toContain('level');
  });

  it('keeps rank_score, which is the figure the row leads with', () => {
    expect(slimmed[0]!.score).toBe(9793);
  });
});

describe('slimSave: absent and malformed data', () => {
  it('composes a missing parent slot as null rather than refusing the veteran', () => {
    const { veterans } = slimSave(
      JSON.stringify([entry({ succession_chara_array: [] })]),
    );
    expect(veterans[0]!.parents).toEqual([null, null]);
  });

  it('dedupes ids, because the API refuses repeats', () => {
    // A repeat would be counted as a second independent carrier and inflate both
    // the star total and the odds. Rejected at the API boundary, so catching it
    // here turns a 400 into a roster that just loads.
    const { veterans } = slimSave(
      JSON.stringify([
        entry({
          win_saddle_id_array: [10, 10, 14],
          factor_info_array: [{ factor_id: 101 }, { factor_id: 101 }],
        }),
      ]),
    );
    expect(veterans[0]!.self.winSaddleIds).toEqual([10, 14]);
    expect(veterans[0]!.self.factorIds).toEqual([101]);
  });

  it.each([
    ['not JSON at all', 'not json', /not valid JSON/],
    ['a JSON object rather than a list', '{"a":1}', /not a roster/],
    ['an empty roster', '[]', /empty/],
  ])('fails the whole file when given %s', (_label, text, pattern) => {
    expect(() => slimSave(text)).toThrow(SaveError);
    expect(() => slimSave(text)).toThrow(pattern);
  });

  /**
   * ONE BAD ENTRY COSTS ONE ENTRY. The API already refuses to fail a whole
   * upload over a single unresolvable card; parsing happens earlier, on the
   * client, and used to throw -- so a single odd row killed the other 258. The
   * likeliest trigger is a save-format change, which is exactly when losing the
   * whole roster is least acceptable.
   */
  describe('a malformed entry is skipped, not fatal', () => {
    it.each([
      ['is not an object', 1, /not a trained character/],
      ['has no card_id', { rank_score: 1 }, /no card_id/],
      ['has no rank_score', { card_id: 100201 }, /no usable rank_score/],
      ['has a NaN rank_score', { card_id: 100201, rank_score: Number.NaN }, /no usable rank_score/],
    ])('drops the entry that %s and keeps the good one', (_label, bad, pattern) => {
      const { veterans, skipped } = slimSave(JSON.stringify([bad, entry()]));
      expect(veterans).toHaveLength(1);
      expect(veterans[0]!.self.cardId).toBe(102701);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.entry).toBe(1);
      expect(skipped[0]!.reason).toMatch(pattern);
    });

    it('still fails the file when NOTHING in it can be read', () => {
      // Skipping every row silently would present an empty roster as a
      // successful load.
      expect(() => slimSave('[1,2,3]')).toThrow(/None of the 3 entries/);
    });

    it('names the entry by its position in the file', () => {
      const { skipped } = slimSave(JSON.stringify([entry(), 'nonsense', entry()]));
      expect(skipped[0]!.entry).toBe(2);
    });
  });
});
