import { describe, expect, it } from 'vitest';
import type { ResolvedVeteran, SparkCriterion, SparkKind } from '@umalegacies/types';
import { matchesPair, starsInScope } from '@umalegacies/core';
import { borrowQuery, type SentFilter } from './query.js';

/**
 * The prefilter, and the one property that makes it safe to send.
 *
 * A filter that is too LOOSE costs bandwidth. A filter that is too TIGHT
 * deletes pairs the reader wanted and reports it as an empty pool, which is
 * indistinguishable from "nobody is lending a veteran like that". So the test
 * that matters is not "does it build the right URL" -- it is: can this filter
 * ever exclude a borrowed half that would have qualified?
 */

const STAMINA = 2;
const MEDIUM = 33;
const WHITE = 10024;

const kinds: Record<number, SparkKind> = {
  [STAMINA]: 'blue',
  [MEDIUM]: 'pink',
  [WHITE]: 'white_skill',
};
const kindOf = (groupId: number) => kinds[groupId];

/** `stars` is [the veteran itself, its slot 10, its slot 20]. */
const veteran = (index: number, sparks: Array<[number, [number, number, number]]>) =>
  ({
    index,
    score: 0,
    self: { cardId: 100101 + index, charaId: 1001 + index, name: 'v', costume: null },
    parents: [null, null],
    sparks: sparks.map(([groupId, stars]) => ({ groupId, stars })),
    unknownFactorIds: [],
    ok: true,
  }) as unknown as ResolvedVeteran;

const criterion = (
  groupId: number,
  minStars: number,
  scope: SparkCriterion['scope'] = 'package',
  over: Partial<SparkCriterion> = {},
): SparkCriterion => ({ groupId, minStars, scope, ...over });

/**
 * THEIR MATCHING, SIMULATED. A value is an EXACT match on
 * `groupId * 100 + stars`, and the comma list is an OR -- so a borrowed half is
 * admitted only when its own summed id appears verbatim. Simulated at that
 * level rather than as `>= minBorrowedStars`, so an off-by-one in the OR list
 * shows up here instead of in production.
 */
const admits = (sent: readonly SentFilter[], borrowed: ResolvedVeteran): boolean =>
  sent.every((filter) => {
    const spark = borrowed.sparks.find((s) => s.groupId === filter.groupId);
    const scope = filter.field.startsWith('main_') ? 'parent' : 'package';
    const stars = spark ? starsInScope(spark, scope).reduce((sum, n) => sum + n, 0) : 0;
    return filter.values.includes(filter.groupId * 100 + stars);
  });

describe('the property the whole prefilter rests on', () => {
  /*
   * SOUNDNESS, stated as a search over every case rather than as an example.
   * For every own roster, every borrowed half and every threshold: if the
   * server filter would REJECT that borrowed half, no pair containing it may
   * satisfy the criterion locally.
   *
   * The converse is deliberately NOT asserted. A prefilter is allowed to be
   * loose -- admitting a half that later fails `matchesPair` costs a fetch and
   * a score, and `matchesPair` is what actually decides.
   */
  it('never rejects a borrowed half that could have made a qualifying pair', () => {
    let rejected = 0;
    let admitted = 0;

    for (const scope of ['package', 'parent', 'one-parent'] as const) {
      const ceiling = scope === 'package' ? 18 : 6;
      for (let threshold = 1; threshold <= ceiling; threshold++) {
        for (let ownSelf = 0; ownSelf <= 3; ownSelf++) {
          for (let ownA = 0; ownA <= 3; ownA++) {
            const own = [veteran(0, [[STAMINA, [ownSelf, ownA, 0]]])];
            const query = borrowQuery({
              criteria: [criterion(STAMINA, threshold, scope)],
              own,
              kindOf,
              traineeCharaId: null,
            });
            if (query.impossible) continue;

            for (let bSelf = 0; bSelf <= 3; bSelf++) {
              for (let bA = 0; bA <= 3; bA++) {
                for (let bB = 0; bB <= 3; bB++) {
                  const borrowed = veteran(1, [[STAMINA, [bSelf, bA, bB]]]);
                  const wouldQualify = matchesPair(
                    own[0] as ResolvedVeteran,
                    borrowed,
                    criterion(STAMINA, threshold, scope),
                  );
                  if (admits(query.sent, borrowed)) {
                    admitted++;
                    continue;
                  }
                  rejected++;
                  // THE ASSERTION. Rejected by the server, so it had better be
                  // a half no pair could have used.
                  expect(
                    wouldQualify,
                    `scope=${scope} threshold=${threshold} own=[${ownSelf},${ownA},0] ` +
                      `borrowed=[${bSelf},${bA},${bB}] was rejected but qualifies`,
                  ).toBe(false);
                }
              }
            }
          }
        }
      }
    }

    // The search has to actually exercise both outcomes, or it proves nothing.
    expect(rejected).toBeGreaterThan(0);
    expect(admitted).toBeGreaterThan(0);
  });
});

describe('the bound uses the roster the reader actually has', () => {
  it('asks the borrowed half only for what the own half cannot supply', () => {
    // 12 across the lineage, and the best own veteran carries 5 of it.
    const own = [veteran(0, [[STAMINA, [3, 2, 0]]])];
    const { sent } = borrowQuery({ criteria: [criterion(STAMINA, 12)], own, kindOf, traineeCharaId: null });
    expect(sent[0]?.minBorrowedStars).toBe(7);
    expect(sent[0]?.field).toBe('blue_sparks');
    // `>= 7` is the OR list 7..9, as exact summed ids.
    expect(sent[0]?.values).toEqual([207, 208, 209]);
  });

  it('asks for the whole threshold when the roster carries none of it', () => {
    const own = [veteran(0, [[MEDIUM, [3, 3, 3]]])];
    const { sent } = borrowQuery({ criteria: [criterion(STAMINA, 4)], own, kindOf, traineeCharaId: null });
    expect(sent[0]?.minBorrowedStars).toBe(4);
    expect(sent[0]?.values).toEqual([204, 205, 206, 207, 208, 209]);
  });

  it('sends nothing when the roster already covers it alone', () => {
    // Every borrowed half qualifies, so a filter would only delete candidates.
    const own = [veteran(0, [[STAMINA, [3, 3, 3]]])];
    const { sent, notSent } = borrowQuery({ criteria: [criterion(STAMINA, 9)], own, kindOf, traineeCharaId: null });
    expect(sent).toHaveLength(0);
    expect(notSent).toEqual([{ groupId: STAMINA, reason: 'own-roster-covers-it' }]);
  });

  it('takes the BEST veteran, not the first or the last', () => {
    const own = [
      veteran(0, [[STAMINA, [1, 0, 0]]]),
      veteran(1, [[STAMINA, [3, 3, 1]]]),
      veteran(2, [[STAMINA, [2, 0, 0]]]),
    ];
    const { sent } = borrowQuery({ criteria: [criterion(STAMINA, 12)], own, kindOf, traineeCharaId: null });
    expect(sent[0]?.minBorrowedStars).toBe(5);
  });
});

describe('the scope that a subtraction gets wrong', () => {
  /*
   * `one-parent` combines by MAX across the pair, so it is satisfied by EITHER
   * half alone. Subtracting the own half's share -- correct for a sum -- would
   * here delete every borrowed candidate on the grounds that the reader already
   * had the answer.
   */
  it('sends nothing when one of the reader’s own veterans satisfies it alone', () => {
    const own = [veteran(0, [[STAMINA, [3, 0, 0]]])];
    const { sent, notSent } = borrowQuery({
      criteria: [criterion(STAMINA, 3, 'one-parent')],
      own,
      kindOf,
      traineeCharaId: null,
    });
    expect(sent).toHaveLength(0);
    expect(notSent).toEqual([{ groupId: STAMINA, reason: 'either-half-can-satisfy-it' }]);
  });

  it('sends the FULL threshold when no own veteran reaches it, not a difference', () => {
    // 2 on the best own veteran and a threshold of 3: a sum would ask for 1,
    // which is wrong. The borrowed half has to reach 3 by itself.
    const own = [veteran(0, [[STAMINA, [2, 3, 3]]])];
    const { sent } = borrowQuery({
      criteria: [criterion(STAMINA, 3, 'one-parent')],
      own,
      kindOf,
      traineeCharaId: null,
    });
    expect(sent[0]?.minBorrowedStars).toBe(3);
    expect(sent[0]?.values).toEqual([203]);
    expect(sent[0]?.field).toBe('main_parent_blue_sparks');
  });
});

describe('which criteria are allowed to travel at all', () => {
  it('keeps a ranking white at home, because a pair without it still qualifies', () => {
    const { sent, notSent } = borrowQuery({
      criteria: [criterion(WHITE, 6)],
      own: [],
      kindOf,
    });
    expect(sent).toHaveLength(0);
    expect(notSent).toEqual([{ groupId: WHITE, reason: 'ranks-only' }]);
  });

  it('sends a white the reader promoted to a requirement', () => {
    const { sent } = borrowQuery({
      criteria: [criterion(WHITE, 6, 'package', { mustHave: true })],
      own: [],
      kindOf,
    });
    expect(sent[0]?.field).toBe('white_sparks');
    expect(sent[0]?.values).toEqual([1002406, 1002407, 1002408, 1002409]);
  });

  it('sends a blue without needing mustHave, because every ancestor has one', () => {
    const { sent } = borrowQuery({ criteria: [criterion(STAMINA, 2)], own: [], kindOf, traineeCharaId: null });
    expect(sent).toHaveLength(1);
  });

  it('ignores excludeFromOdds, which changes reporting and not qualification', () => {
    const plain = borrowQuery({ criteria: [criterion(MEDIUM, 4)], own: [], kindOf, traineeCharaId: null });
    const excluded = borrowQuery({
      criteria: [criterion(MEDIUM, 4, 'package', { excludeFromOdds: true })],
      own: [],
      kindOf,
    });
    expect(excluded.sent).toEqual(plain.sent);
  });

  it('keeps a spark the catalogue cannot name at home rather than guessing a field', () => {
    const { sent, notSent } = borrowQuery({ criteria: [criterion(99999, 3)], own: [], kindOf, traineeCharaId: null });
    expect(sent).toHaveLength(0);
    expect(notSent).toEqual([{ groupId: 99999, reason: 'unknown-spark' }]);
  });
});

describe('a requirement nobody can meet', () => {
  it('says so instead of sending a query guaranteed to return nothing', () => {
    // 18 across the lineage with an empty roster: even a perfect borrowed half
    // carries 9. An empty result would read as an empty POOL.
    const { sent, impossible } = borrowQuery({
      criteria: [criterion(STAMINA, 18)],
      own: [],
      kindOf,
    });
    expect(impossible).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('is not impossible when the roster can make up the difference', () => {
    const own = [veteran(0, [[STAMINA, [3, 3, 3]]])];
    const { impossible, sent } = borrowQuery({
      criteria: [criterion(STAMINA, 18)],
      own,
      kindOf,
      traineeCharaId: null,
    });
    expect(impossible).toBe(false);
    expect(sent[0]?.values).toEqual([209]);
  });
});

describe('several criteria at once', () => {
  it('repeats the key, which is their AND', () => {
    const { params } = borrowQuery({
      criteria: [
        criterion(WHITE, 4, 'package', { mustHave: true }),
        criterion(STAMINA, 8),
      ],
      own: [],
      kindOf,
    });
    expect(params.getAll('white_sparks')).toEqual(['1002404,1002405,1002406,1002407,1002408,1002409']);
    expect(params.getAll('blue_sparks')).toEqual(['208,209']);
  });

  it('keeps two criteria on the same field as two separate keys', () => {
    // Two different whites are an AND, not one merged OR list -- merging them
    // would ask for "either", which is a strictly weaker query.
    const kindOf2 = (g: number) => (g === WHITE || g === 10025 ? 'white_skill' : undefined) as SparkKind;
    const { params } = borrowQuery({
      criteria: [
        criterion(WHITE, 9, 'package', { mustHave: true }),
        criterion(10025, 9, 'package', { mustHave: true }),
      ],
      own: [],
      kindOf: kindOf2,
    });
    expect(params.getAll('white_sparks')).toEqual(['1002409', '1002509']);
  });
});

describe('the trainee, which reorders rather than filters', () => {
  it('sends player_chara_id, because their default sort is affinity to it', () => {
    // Measured: same filter, same 1,000 records, 26 qualifying pairs in an
    // arbitrary order against 337 with this set. It changes nothing about which
    // records qualify -- it changes which ones we get to see at all.
    const { params } = borrowQuery({
      criteria: [criterion(STAMINA, 4)],
      own: [],
      kindOf,
      traineeCharaId: 1006,
    });
    expect(params.get('player_chara_id')).toBe('1006');
  });

  it('is left out entirely when nobody has been chosen', () => {
    const { params } = borrowQuery({
      criteria: [criterion(STAMINA, 4)],
      own: [],
      kindOf,
      traineeCharaId: null,
    });
    expect(params.has('player_chara_id')).toBe(false);
  });

  it('does not count as a filter, so it appears in neither account', () => {
    const withTrainee = borrowQuery({ criteria: [], own: [], kindOf, traineeCharaId: 1006 });
    expect(withTrainee.sent).toHaveLength(0);
    expect(withTrainee.notSent).toHaveLength(0);
  });
});
