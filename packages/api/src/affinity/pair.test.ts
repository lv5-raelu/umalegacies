import { describe, expect, it } from 'vitest';
import type { AncestorRef, ExplainNode, ExplainPairRequest } from '@umalegacies/types';
import { extractHash, extractMaster } from '../master/master-extract';
import { loadFixture } from './fixtures';
import { explainLineage } from './lineage';
import { lineageFromPair } from './pair';

const master = extractMaster();
const hash = extractHash();

const ref = (cardId: number): AncestorRef => ({ cardId, winSaddleIds: [] });

/** base.* and bonus.* are leaves under link.pair nodes, so this has to recurse. */
const sumByPrefix = (node: ExplainNode, prefix: string): number =>
  node.ruleId.startsWith(prefix)
    ? node.value
    : node.children.reduce((total, child) => total + sumByPrefix(child, prefix), 0);

const run = (pair: ExplainPairRequest) => explainLineage(lineageFromPair(pair), master, hash);
const affinities = (pair: ExplainPairRequest) =>
  Object.fromEntries(
    Object.entries(run(pair).individualAffinity).map(([position, node]) => [
      Number(position),
      node.value,
    ]),
  );

describe('lineageFromPair: which uma lands in which slot', () => {
  // Distinct, meaningless card ids: this test is about placement only, so it
  // asserts structure and never a number.
  const pair: ExplainPairRequest = {
    traineeCharaId: 1006,
    veteranA: { self: ref(1), parents: [ref(11), ref(12)] },
    veteranB: { self: ref(2), parents: [ref(21), ref(22)] },
  };

  it('puts each veteran in a parent slot and its own parents beneath it', () => {
    const composed = lineageFromPair(pair);
    // parents are [10, 20]; grandparents are [11, 12, 21, 22] in that order.
    expect(composed.parents.map((p) => p.cardId)).toEqual([1, 2]);
    expect(composed.grandparents.map((g) => g?.cardId)).toEqual([11, 12, 21, 22]);
  });

  it('keeps a veteran with an empty parent slot rather than rejecting it', () => {
    // The engine models an absent ancestor deliberately (base.absent_ancestor,
    // the dashed empty-slot node), so refusing here would contradict it and
    // throw away data the engine handles.
    const composed = lineageFromPair({
      ...pair,
      veteranA: { self: ref(1), parents: [null, ref(12)] },
    });
    expect(composed.grandparents.map((g) => g?.cardId ?? null)).toEqual([null, 12, 21, 22]);
  });

  it('carries the trainee costume through without touching any other field', () => {
    expect(lineageFromPair({ ...pair, traineeCardId: 100602 }).traineeCardId).toBe(100602);
    expect(lineageFromPair(pair).traineeCardId).toBeUndefined();
  });

  it('carries masterHash through, so a pinned pair is still refused when stale', () => {
    expect(lineageFromPair({ ...pair, masterHash: 'a'.repeat(64) }).masterHash).toBe(
      'a'.repeat(64),
    );
  });
});

describe('explain-pair reproduces the externally verified lineage', () => {
  // NON-CIRCULAR, and this is the whole point of the fixture carrying `pair`.
  //
  // Comparing explainPair(x) to explain(lineageFromPair(x)) would prove nothing:
  // both call the same helper, so any error in it cancels. Instead the fixture's
  // `pair` is built in the fixture script STRAIGHT FROM THE TWO ROSTER ENTRIES,
  // and the numbers below were read off breeding-optimizer by hand in September
  // 2026. Nothing in this repository produced them.
  const fixture = loadFixture('verify-oguri');
  const result = run(fixture.pair as ExplainPairRequest);

  it('produces the verified pair total, base and bonus', () => {
    expect(result.pairTotal.value).toBe(352);
    expect(sumByPrefix(result.pairTotal, 'base.')).toBe(151);
    expect(sumByPrefix(result.pairTotal, 'bonus.')).toBe(201);
  });

  it('produces the verified individual affinity for all six slots', () => {
    expect(affinities(fixture.pair as ExplainPairRequest)).toEqual({
      10: 186,
      20: 225,
      11: 50,
      12: 47,
      21: 68,
      22: 69,
    });
  });

  it('lands in the same rank bucket the game shows', () => {
    expect(result.relationRank.value).toBe(3);
  });
});

describe('pair-asymmetric: the slot-mapping discriminator', () => {
  // verify-oguri puts the SAME two characters behind both parents, which makes
  // it strong against a wrong value and weak against a wrong placement. This
  // fixture is six distinct characters with six distinct individual affinities,
  // so every slot is distinguishable from every other one.
  //
  // These numbers are this engine's own output, recorded to detect change. They
  // are a regression guard, not an oracle. verify-oguri above is the oracle.
  const fixture = loadFixture('pair-asymmetric');
  const pair = fixture.pair as ExplainPairRequest;
  const expected = fixture.expected as {
    pairTotal: number;
    baseTotal: number;
    bonusTotal: number;
    individualAffinity: Record<number, number>;
    slotCharaNames: string[];
    interleavedPairTotal: number;
  };

  it('places the six named characters in the six expected slots', () => {
    const result = run(pair);
    expect([10, 20, 11, 12, 21, 22].map((p) => result.ancestors[p]?.name)).toEqual(
      expected.slotCharaNames,
    );
  });

  it('holds its recorded total, base and bonus', () => {
    const result = run(pair);
    expect(result.pairTotal.value).toBe(expected.pairTotal);
    expect(sumByPrefix(result.pairTotal, 'base.')).toBe(expected.baseTotal);
    expect(sumByPrefix(result.pairTotal, 'bonus.')).toBe(expected.bonusTotal);
  });

  it('has six DISTINCT individual affinities, so no slot can hide in another', () => {
    const ia = affinities(pair);
    expect(ia).toEqual(expected.individualAffinity);
    expect(new Set(Object.values(ia)).size).toBe(6);
  });

  it('swaps the whole affinity map when the two veterans swap, and NOT the total', () => {
    // The multiset of links is unchanged by an A/B swap, so pairTotal cannot
    // detect it. Only the position-keyed affinities move. A test that checked
    // the total alone would pass with the two veterans the wrong way round.
    const swapped = affinities({ ...pair, veteranA: pair.veteranB, veteranB: pair.veteranA });
    const straight = affinities(pair);
    expect(run({ ...pair, veteranA: pair.veteranB, veteranB: pair.veteranA }).pairTotal.value).toBe(
      expected.pairTotal,
    );
    expect(swapped[10]).toBe(straight[20]);
    expect(swapped[20]).toBe(straight[10]);
    expect(swapped[11]).toBe(straight[21]);
    expect(swapped[12]).toBe(straight[22]);
    expect(swapped).not.toEqual(straight);
  });

  it('moves the total when the grandparents are interleaved', () => {
    // [A1, B1, A2, B2] instead of [A1, A2, B1, B2]: the realistic refactor bug,
    // because it still produces four grandparents from the right six umas. A
    // three-way term pairs each grandparent with the parent it sits under, so
    // the total drops.
    const interleaved = explainLineage(
      {
        traineeCharaId: pair.traineeCharaId,
        parents: [pair.veteranA.self, pair.veteranB.self],
        grandparents: [
          pair.veteranA.parents[0],
          pair.veteranB.parents[0],
          pair.veteranA.parents[1],
          pair.veteranB.parents[1],
        ],
      },
      master,
      hash,
    );
    expect(interleaved.pairTotal.value).toBe(expected.interleavedPairTotal);
    expect(interleaved.pairTotal.value).not.toBe(expected.pairTotal);
  });
});
