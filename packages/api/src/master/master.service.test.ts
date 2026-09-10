import { describe, expect, it } from 'vitest';
import { fixtureDb } from './fixture-db';
import { buildCharaIdMap } from './master.service';

describe('charaIdFor / buildCharaIdMap', () => {
  it('joins card_data rather than dividing by 100', () => {
    const map = buildCharaIdMap(fixtureDb());

    // The ordinary case, where division would also have worked.
    expect(map.get(101601)).toBe(1016);

    // The two cards that make the division wrong. 9100101 / 100 is 91001,
    // which is not a chara_id at all and would find zero relation rows.
    expect(map.get(9100101)).toBe(1001);
    expect(map.get(9101101)).toBe(1011);
    expect(Math.floor(9100101 / 100)).not.toBe(map.get(9100101));
  });

  it('returns undefined for an unknown card, so callers can report it', () => {
    // A null here becomes resolution { ok: false, reason: 'unknown_card' }
    // in the explain tree, never a bare 0.
    expect(buildCharaIdMap(fixtureDb()).get(999999)).toBeUndefined();
  });
});
