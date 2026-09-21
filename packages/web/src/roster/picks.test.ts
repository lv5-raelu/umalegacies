import { describe, expect, it } from 'vitest';
import type {
  ParentPick,
  ResolvedVeteran,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';
import { explainPairRequest, isOwnPickOf, ownPick, ownVeterans, packageOf, slotOf } from './picks';

/**
 * What a pick means, now that it is a union.
 *
 * The request built from a pair IS the product: every number on screen comes
 * back from it, and a mis-built one is still a well-formed request that returns
 * a confident, plausible, wrong total. Nothing downstream can detect that, so
 * the composition is checked here rather than trusted.
 *
 * The hazard the widening introduced is specific. A pick used to be a bare
 * index and `veterans[pick]` was the whole resolution; it is now a discriminant
 * plus an index, and the two ways to get that wrong -- reading the pick's
 * position in the array instead of its `index`, or pairing A's package with B's
 * slot -- both produce a real lineage for real umas.
 */

const member = (cardId: number, winSaddleIds: number[] = []) => ({
  cardId,
  winSaddleIds,
  factorIds: [cardId % 100],
});

/** The slimmed packages the browser still holds, in the order they were SENT. */
const veterans: RosterVeteranInput[] = [
  { score: 19_000, self: member(100601, [1]), parents: [member(101401), null] },
  { score: 18_000, self: member(100901, [14, 147]), parents: [member(100602), member(101402)] },
  { score: 17_000, self: member(101001), parents: [null, null] },
];

const resolved = (index: number, cardId: number, charaId: number): ResolvedVeteran => ({
  index,
  score: 20_000 - index,
  self: { cardId, charaId, name: `uma ${cardId}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks: [],
  unknownFactorIds: [],
  ok: true,
});

const trainee: TraineeOption = {
  cardId: 100101,
  charaId: 1001,
  name: 'Special Week',
  costume: null,
  ambiguous: false,
};

const own = (index: number, cardId: number): ParentPick => ({ kind: 'own', index, cardId });

describe('an own pick names a roster row', () => {
  it('is stamped with the card it was made against', () => {
    // Not looked up later. The index is a position in the array that was sent,
    // so the same number means a different uma once a different save is loaded.
    expect(ownPick(resolved(1, 100901, 1009))).toEqual(own(1, 100901));
  });

  it('recognises the row it was made from, and no other', () => {
    expect(isOwnPickOf(own(1, 100901), 1)).toBe(true);
    expect(isOwnPickOf(own(1, 100901), 0)).toBe(false);
  });

  it('reports which half of the pair a row fills, and -1 for one that fills neither', () => {
    // A/B on the card is this number. Slot order is pick order, oldest first.
    const pair = [own(2, 101001), own(0, 100601)];
    expect(slotOf(pair, 2)).toBe(0);
    expect(slotOf(pair, 0)).toBe(1);
    expect(slotOf(pair, 1)).toBe(-1);
  });

  it('resolves to the roster rows the pick rules are enforced against', () => {
    const roster = {
      veterans: [resolved(0, 100601, 1006), resolved(1, 100901, 1009)],
      sparkOptions: [],
      unresolvedCount: 0,
      masterHash: 'abc',
    };
    expect(ownVeterans([own(1, 100901)], roster)).toEqual([resolved(1, 100901, 1009)]);
    // An index with nothing behind it is dropped rather than carried as a hole:
    // `pickBlock` reads `self.charaId` off every entry.
    expect(ownVeterans([own(9, 100901)], roster)).toEqual([]);
    expect(ownVeterans([own(0, 100601)], null)).toEqual([]);
  });
});

describe('the package an own pick stands for', () => {
  it('is the slimmed three-uma package at that request index', () => {
    // THREE umas, not six: the veteran plus its own slots 10 and 20, which
    // become the grandparents beneath it. Picking one fixes all three.
    expect(packageOf(own(1, 100901), veterans)).toEqual({
      self: member(100901, [14, 147]),
      parents: [member(100602), member(101402)],
    });
  });

  it('keeps an empty slot as an empty slot', () => {
    // A veteran out of one parent is different data from one whose second slot
    // failed to render, and the engine treats the absence as real.
    expect(packageOf(own(0, 100601), veterans).parents).toEqual([member(101401), null]);
  });

  it('refuses an index with no package behind it rather than composing a hole', () => {
    expect(() => packageOf(own(9, 100601), veterans)).toThrow('no veteran at index 9');
  });
});

describe('the explain-pair request', () => {
  it('is built from two own picks, in pick order', () => {
    // A is the first picked and B the second, and the two must not cross: the
    // server composes slots from these, so a swap changes every per-parent
    // Individual Affinity while still returning a plausible pair total.
    expect(explainPairRequest(trainee, [own(2, 101001), own(0, 100601)], veterans)).toEqual({
      traineeCharaId: 1001,
      traineeCardId: 100101,
      veteranA: { self: member(101001), parents: [null, null] },
      veteranB: { self: member(100601, [1]), parents: [member(101401), null] },
    });
  });

  it('names the costume being trained, which changes no number but decides the portrait', () => {
    const request = explainPairRequest(trainee, [own(0, 100601), own(1, 100901)], veterans);
    expect(request?.traineeCardId).toBe(100101);
    expect(request?.traineeCharaId).toBe(1001);
  });

  it('sends no masterHash of its own, because the caller pins that per request', () => {
    // `explainPair` adds the hash it last saw. Setting it here too would give
    // two places that decide when a stale extract is caught.
    expect(explainPairRequest(trainee, [own(0, 100601), own(1, 100901)], veterans)).not.toHaveProperty(
      'masterHash',
    );
  });

  it.each([
    ['none', []],
    ['one', [own(0, 100601)]],
  ])('is null with %s picked, because half a pair is not a question', (_label, picks) => {
    expect(explainPairRequest(trainee, picks, veterans)).toBeNull();
  });
});
