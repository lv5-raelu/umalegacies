import { describe, expect, it } from 'vitest';
import { MasterData } from './master-data';
import { extractDatabase } from './master-extract';

describe('charaIdFor', () => {
  it('joins card_data rather than dividing by 100', () => {
    const master = new MasterData(extractDatabase());

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
    expect(new MasterData(extractDatabase()).charaIdFor(999999)).toBeNull();
  });
});
